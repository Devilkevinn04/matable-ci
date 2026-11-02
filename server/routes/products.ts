import { Router, type RequestHandler } from 'express';
import { databaseMode, dbAll, dbTransaction } from '../../db.ts';
import {
  getSubscriptionProductLimit,
  getSubscriptionProductPhotoLimit,
} from '../../src/utils/subscriptionFeatures.ts';
import { mapProductRow } from '../repositories/products.ts';
import { getProductFromDatabase } from '../repositories/products.ts';
import { getShopFromDatabase } from '../repositories/shops.ts';
import { getSubscriptionState } from '../services/businessRules.ts';
import { dispatchStockTransitionPush } from '../services/pushNotifications.ts';
import { isStorableMediaUrl } from '../../src/utils/media.ts';
import { validateProductSale } from '../../src/utils/productPricing.ts';
import { parseCsv, stringifyCsv } from '../../src/utils/csv.ts';
import type { ShopCategory } from '../../src/utils/categoryDefaults.ts';
import type { ProductRecord } from '../types.ts';

const PRODUCT_CSV_COLUMNS = [
  'id', 'title', 'description', 'price', 'sale_price', 'sale_starts_at', 'sale_ends_at',
  'stock', 'image_url', 'thumbnail_url', 'is_visible', 'category', 'sizes', 'colors', 'lookbook_image',
  'gallery_images', 'prep_time', 'modifier_groups', 'attributes',
] as const;

class ProductCsvImportError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

interface ProductRouterOptions {
  products: ProductRecord[];
  requireMerchantAccess: RequestHandler;
  allocateProductId: () => Promise<number>;
  persistProduct: (product: ProductRecord) => Promise<void>;
  sanitizeTextField: (value: string | null | undefined, maxLength?: number) => string;
  normalizeProductImage: (value: unknown) => string;
  sanitizeGalleryImages: (value: unknown) => string[];
  sanitizeProductAttributes: (value: unknown, category: ShopCategory) => Record<string, string> | undefined;
  trialProductLimit: number;
}

/**
 * Media values are validated on write: an explicitly provided value must be a
 * public URL or a bounded legacy base64 image. Empty values clear the photo.
 */
function hasInvalidMediaValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  return trimmed.length > 0 && !isStorableMediaUrl(trimmed);
}

function hasInvalidMediaCollection(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((item) => typeof item === 'string' && item.trim().length > 0 && !isStorableMediaUrl(item));
}

export function createProductRouter({
  products,
  requireMerchantAccess,
  allocateProductId,
  persistProduct,
  sanitizeTextField,
  normalizeProductImage,
  sanitizeGalleryImages,
  sanitizeProductAttributes,
  trialProductLimit,
}: ProductRouterOptions) {
  const router = Router({ mergeParams: true });
  const requireActiveSubscription: RequestHandler = async (req, res, next) => {
    if (req.adminShopAccess) return next();
    const shop = await getShopFromDatabase(Number(req.params.id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (!getSubscriptionState(shop).isActive) {
      return res.status(403).json({ error: 'Votre abonnement n’est pas actif. Réactivez-le pour modifier le catalogue.' });
    }
    return next();
  };

  router.get('/', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const rows = await dbAll<Record<string, unknown>>('SELECT * FROM products WHERE shop_id = ? ORDER BY id', [shopId]);
    res.json(rows.map(mapProductRow));
  });

  router.get('/export.csv', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const rows = await dbAll<Record<string, unknown>>(
      'SELECT * FROM products WHERE shop_id = ? ORDER BY id',
      [shopId],
    );
    const productsToExport = rows.map(mapProductRow);
    const csvRows = [
      [...PRODUCT_CSV_COLUMNS],
      ...productsToExport.map((product) => [
        product.id,
        product.title,
        product.description,
        product.price,
        product.sale_price,
        product.sale_starts_at,
        product.sale_ends_at,
        product.stock,
        product.image_url,
        product.thumbnail_url,
        product.is_visible,
        product.category,
        product.sizes ? JSON.stringify(product.sizes) : '',
        product.colors ? JSON.stringify(product.colors) : '',
        product.lookbook_image,
        product.gallery_images ? JSON.stringify(product.gallery_images) : '',
        product.prep_time,
        product.modifier_groups ? JSON.stringify(product.modifier_groups) : '',
        product.attributes ? JSON.stringify(product.attributes) : '',
      ]),
    ];
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="catalogue-${shopId}.csv"`);
    res.send(`\uFEFF${stringifyCsv(csvRows)}`);
  });

  router.post('/import', requireMerchantAccess, requireActiveSubscription, async (req, res) => {
    const shopId = Number(req.params.id);
    const csv = req.body?.csv;
    if (typeof csv !== 'string' || csv.length === 0) {
      return res.status(400).json({ error: 'Sélectionnez un fichier CSV non vide.' });
    }
    if (Buffer.byteLength(csv, 'utf8') > 1024 * 1024) {
      return res.status(413).json({ error: 'Le fichier CSV ne peut pas dépasser 1 Mo.' });
    }

    let rows: string[][];
    try {
      rows = parseCsv(csv);
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'Le fichier CSV est invalide.',
      });
    }
    const header = rows.shift()?.map((value) => value.trim().toLowerCase()) || [];
    const columns = new Map(header.map((value, index) => [value, index]));
    const requiredColumns = ['id', 'title', 'description', 'price', 'stock'];
    const missingColumns = requiredColumns.filter((column) => !columns.has(column));
    const unknownColumns = header.filter((column) => !(PRODUCT_CSV_COLUMNS as readonly string[]).includes(column));
    if (header.length === 0 || new Set(header).size !== header.length || missingColumns.length || unknownColumns.length) {
      return res.status(400).json({
        error: `Colonnes CSV invalides. Requises : ${requiredColumns.join(', ')}${unknownColumns.length ? `. Non reconnues : ${unknownColumns.join(', ')}` : ''}.`,
      });
    }

    const importRows: Array<{ row: string[]; line: number }> = [];
    for (const [index, row] of rows.entries()) {
      if (!row.some((value) => value.trim().length > 0)) continue;
      if (row.length !== header.length) {
        return res.status(400).json({
          error: `La ligne ${index + 2} ne contient pas le même nombre de colonnes que l’en-tête.`,
        });
      }
      importRows.push({ row, line: index + 2 });
    }
    if (importRows.length === 0) return res.status(400).json({ error: 'Le fichier CSV ne contient aucun article.' });
    if (importRows.length > 500) return res.status(413).json({ error: 'Un import ne peut pas dépasser 500 articles.' });

    const apply = req.body?.apply === true;
    const allocatedIds = new Map<number, number>();
    try {
      if (apply) {
        for (const [index, item] of importRows.entries()) {
          const idText = item.row[columns.get('id')!].trim();
          if (!idText) allocatedIds.set(index, await allocateProductId());
        }
      }

      const result = await dbTransaction(async (transaction) => {
        await transaction.get(
          `SELECT id FROM shops WHERE id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
          [shopId],
        );
        const shop = await getShopFromDatabase(shopId);
        if (!shop) throw new ProductCsvImportError('Boutique introuvable.', 404);
        const subscription = getSubscriptionState(shop);
        const isActiveTrial = subscription.status === 'trialing' && !req.adminShopAccess;
        const productLimit = isActiveTrial
          ? trialProductLimit
          : getSubscriptionProductLimit(subscription.plan, subscription.planFeatures);
        const photoLimit = isActiveTrial
          ? getSubscriptionProductPhotoLimit('standard')
          : getSubscriptionProductPhotoLimit(subscription.plan, subscription.planFeatures);
        const currentCount = await transaction.get<{ count: number | string }>(
          'SELECT COUNT(*) AS count FROM products WHERE shop_id = ?',
          [shopId],
        );
        const currentProductsCount = Number(currentCount?.count || 0);
        const seenIds = new Set<number>();
        const importedProducts: Array<{ product: ProductRecord; previousStock: number | null }> = [];
        let createdCount = 0;
        let updatedCount = 0;

        for (const [index, { row, line }] of importRows.entries()) {
          const value = (key: string) => {
            const column = columns.get(key);
            return column === undefined ? undefined : row[column].trim();
          };
          const rawId = value('id') || '';
          const id = rawId ? Number(rawId) : null;
          if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) {
            throw new ProductCsvImportError(`Ligne ${line} : ID MaTable invalide.`);
          }
          if (id !== null && seenIds.has(id)) {
            throw new ProductCsvImportError(`Ligne ${line} : l’ID ${id} apparaît plusieurs fois.`);
          }
          if (id !== null) seenIds.add(id);

          const existingRow = id === null ? undefined : await transaction.get<Record<string, unknown>>(
            `SELECT * FROM products WHERE id = ? AND shop_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
            [id, shopId],
          );
          if (id !== null && !existingRow) {
            throw new ProductCsvImportError(`Ligne ${line} : l’article ${id} n’existe pas dans cette boutique.`);
          }
          const existing = existingRow ? mapProductRow(existingRow) : undefined;
          const product: ProductRecord = existing
            ? { ...existing }
            : {
              id: apply ? allocatedIds.get(index) || 0 : 0,
              shop_id: shopId,
              created_at: new Date().toISOString(),
              title: '',
              description: null,
              price: 0,
              stock: 0,
              image_url: '',
              is_available: false,
              is_visible: true,
            };
          const title = value('title');
          const description = value('description');
          const priceText = value('price');
          const stockText = value('stock');
          if (title) product.title = sanitizeTextField(title, 120);
          if (description) product.description = sanitizeTextField(description, 500);
          if (priceText) product.price = Number(priceText);
          if (stockText) product.stock = Number(stockText);
          if (!product.title || product.title.length < 2 || !product.description) {
            throw new ProductCsvImportError(`Ligne ${line} : titre et description sont obligatoires.`);
          }
          if (!Number.isSafeInteger(product.price) || product.price < 0 || !Number.isSafeInteger(product.stock) || product.stock < 0) {
            throw new ProductCsvImportError(`Ligne ${line} : le prix et le stock doivent être des entiers positifs ou nuls.`);
          }

          const salePriceText = value('sale_price');
          const saleStartsAt = value('sale_starts_at');
          const saleEndsAt = value('sale_ends_at');
          if (salePriceText) product.sale_price = Number(salePriceText);
          if (saleStartsAt) product.sale_starts_at = saleStartsAt;
          if (saleEndsAt) product.sale_ends_at = saleEndsAt;
          const sale = validateProductSale(product.price, product.sale_price, product.sale_starts_at, product.sale_ends_at);
          if (!sale) throw new ProductCsvImportError(`Ligne ${line} : la promotion ou sa période est invalide.`);
          Object.assign(product, sale);

          const imageUrl = value('image_url');
          const thumbnailUrl = value('thumbnail_url');
          if (imageUrl) {
            product.image_url = normalizeProductImage(imageUrl);
            product.thumbnail_url = thumbnailUrl ? normalizeProductImage(thumbnailUrl) : undefined;
          } else if (thumbnailUrl) {
            product.thumbnail_url = normalizeProductImage(thumbnailUrl);
          }
          const lookbookImage = value('lookbook_image');
          if (lookbookImage) product.lookbook_image = normalizeProductImage(lookbookImage);
          for (const field of ['image_url', 'thumbnail_url', 'lookbook_image'] as const) {
            if (hasInvalidMediaValue(product[field])) {
              throw new ProductCsvImportError(`Ligne ${line} : l’image ${field} doit être une URL publique HTTPS.`);
            }
          }
          const category = value('category');
          if (category) product.category = category;

          const parseJsonColumn = (key: string): unknown => {
            const rawValue = value(key);
            if (!rawValue) return undefined;
            try {
              return JSON.parse(rawValue);
            } catch {
              throw new ProductCsvImportError(`Ligne ${line} : le champ ${key} doit contenir du JSON valide.`);
            }
          };
          const sizes = parseJsonColumn('sizes');
          const colors = parseJsonColumn('colors');
          const galleryImages = parseJsonColumn('gallery_images');
          const modifierGroups = parseJsonColumn('modifier_groups');
          const attributes = parseJsonColumn('attributes');
          if (sizes !== undefined) {
            if (!Array.isArray(sizes) || sizes.some((item) => typeof item !== 'string')) {
              throw new ProductCsvImportError(`Ligne ${line} : sizes doit être un tableau JSON de textes.`);
            }
            product.sizes = sizes;
          }
          if (colors !== undefined) {
            if (!Array.isArray(colors) || colors.some((item) => (
              !item || typeof item !== 'object' || Array.isArray(item)
              || typeof (item as Record<string, unknown>).name !== 'string'
              || typeof (item as Record<string, unknown>).hex !== 'string'
            ))) {
              throw new ProductCsvImportError(`Ligne ${line} : colors doit contenir des objets avec name et hex.`);
            }
            product.colors = colors as ProductRecord['colors'];
          }
          if (galleryImages !== undefined) {
            if (!Array.isArray(galleryImages) || galleryImages.some((item) => typeof item !== 'string')) {
              throw new ProductCsvImportError(`Ligne ${line} : gallery_images doit être un tableau JSON d’URL.`);
            }
            if (hasInvalidMediaCollection(galleryImages)) {
              throw new ProductCsvImportError(`Ligne ${line} : une image de la galerie est invalide.`);
            }
            product.gallery_images = sanitizeGalleryImages(galleryImages);
          }
          if (modifierGroups !== undefined) {
            if (!Array.isArray(modifierGroups) || modifierGroups.some((group) => (
              !group || typeof group !== 'object' || Array.isArray(group)
              || typeof (group as Record<string, unknown>).name !== 'string'
              || !Array.isArray((group as Record<string, unknown>).options)
              || ((group as Record<string, unknown>).options as unknown[]).some((option) => (
                !option || typeof option !== 'object' || Array.isArray(option)
                || typeof (option as Record<string, unknown>).label !== 'string'
                || typeof (option as Record<string, unknown>).price_delta !== 'number'
                || !Number.isFinite((option as Record<string, unknown>).price_delta)
              ))
            ))) {
              throw new ProductCsvImportError(`Ligne ${line} : modifier_groups contient un groupe ou une option invalide.`);
            }
            product.modifier_groups = modifierGroups as ProductRecord['modifier_groups'];
          }
          if (attributes !== undefined) {
            if (typeof attributes !== 'object' || attributes === null || Array.isArray(attributes)) {
              throw new ProductCsvImportError(`Ligne ${line} : attributes doit être un objet JSON.`);
            }
            product.attributes = sanitizeProductAttributes(attributes, shop.category);
          }
          const prepTimeText = value('prep_time');
          if (prepTimeText) {
            product.prep_time = Number(prepTimeText);
            if (!Number.isSafeInteger(product.prep_time) || product.prep_time < 0) {
              throw new ProductCsvImportError(`Ligne ${line} : prep_time doit être un entier positif ou nul.`);
            }
          }
          const visibilityText = value('is_visible')?.toLowerCase();
          if (visibilityText) {
            if (!['true', 'false', '1', '0'].includes(visibilityText)) {
              throw new ProductCsvImportError(`Ligne ${line} : is_visible doit valoir true, false, 1 ou 0.`);
            }
            product.is_visible = visibilityText === 'true' || visibilityText === '1';
          }
          product.is_available = Boolean(product.is_visible) && product.stock > 0;

          const photoCount = (product.image_url ? 1 : 0)
            + (product.lookbook_image ? 1 : 0)
            + (product.gallery_images?.length || 0);
          const previousPhotoCount = existing
            ? (existing.image_url ? 1 : 0) + (existing.lookbook_image ? 1 : 0) + (existing.gallery_images?.length || 0)
            : 0;
          if (!req.adminShopAccess && photoCount > photoLimit && photoCount > previousPhotoCount) {
            throw new ProductCsvImportError(`Ligne ${line} : la formule autorise jusqu’à ${photoLimit} photos par article.`, 409);
          }

          if (existing) updatedCount += 1;
          else createdCount += 1;
          importedProducts.push({ product, previousStock: existing?.stock ?? null });
        }

        if (!req.adminShopAccess && Number.isFinite(productLimit) && currentProductsCount + createdCount > productLimit) {
          throw new ProductCsvImportError(
            isActiveTrial
              ? `La période d’essai permet jusqu’à ${productLimit} articles au catalogue.`
              : `Votre formule permet jusqu’à ${productLimit} articles.`,
            409,
          );
        }

        if (apply) {
          for (const { product, previousStock } of importedProducts) {
            const values = [
              product.title, product.description ?? null, product.price, product.sale_price ?? null,
              product.sale_starts_at ?? null, product.sale_ends_at ?? null, product.stock, product.image_url, product.thumbnail_url ?? null,
              product.is_available ? 1 : 0, product.is_visible === false ? 0 : 1, product.category ?? null,
              product.sizes ? JSON.stringify(product.sizes) : null, product.colors ? JSON.stringify(product.colors) : null,
              product.lookbook_image ?? null, product.gallery_images?.length ? JSON.stringify(product.gallery_images) : null,
              product.prep_time ?? null, product.modifier_groups ? JSON.stringify(product.modifier_groups) : null,
              product.attributes && Object.keys(product.attributes).length ? JSON.stringify(product.attributes) : null,
            ];
            if (previousStock !== null) {
              await transaction.run(`UPDATE products SET
                title = ?, description = ?, price = ?, sale_price = ?, sale_starts_at = ?, sale_ends_at = ?,
                stock = ?, image_url = ?, thumbnail_url = ?, is_available = ?, is_visible = ?, category = ?, sizes = ?, colors = ?,
                lookbook_image = ?, gallery_images = ?, prep_time = ?, modifier_groups = ?, attributes = ?
                WHERE id = ? AND shop_id = ?`, [...values, product.id, shopId]);
            } else {
              await transaction.run(`INSERT INTO products
                (id, shop_id, title, description, price, sale_price, sale_starts_at, sale_ends_at, stock,
                 image_url, thumbnail_url, is_available, is_visible, category, sizes, colors, lookbook_image, gallery_images,
                 prep_time, modifier_groups, attributes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                product.id, shopId, ...values.slice(0, 10), ...values.slice(10), product.created_at,
              ]);
            }
          }
        }
        return { createdCount, updatedCount, importedProducts };
      });

      if (apply) {
        for (const { product, previousStock } of result.importedProducts) {
          const cachedProduct = products.find((candidate) => candidate.id === product.id && candidate.shop_id === shopId);
          if (cachedProduct) Object.assign(cachedProduct, product);
          else products.unshift(product);
          if (previousStock !== null && previousStock !== product.stock) {
            dispatchStockTransitionPush(shopId, product, previousStock, product.stock, `csv-stock-${product.id}-${Date.now()}`);
          }
        }
      }
      return res.json({
        success: true,
        preview_only: !apply,
        created_count: result.createdCount,
        updated_count: result.updatedCount,
        ...(apply ? { products: result.importedProducts.map(({ product }) => product) } : {}),
      });
    } catch (error) {
      if (error instanceof ProductCsvImportError) {
        return res.status(error.status).json({ error: error.message });
      }
      throw error;
    }
  });

  router.post('/', requireMerchantAccess, requireActiveSubscription, async (req, res) => {
    const shopId = Number(req.params.id);
    const shop = await getShopFromDatabase(shopId);
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const subscription = getSubscriptionState(shop);
    const isActiveTrial = subscription.status === 'trialing' && !req.adminShopAccess;
    const productLimit = isActiveTrial ? trialProductLimit : getSubscriptionProductLimit(subscription.plan, subscription.planFeatures);
    const photoLimit = isActiveTrial
      ? getSubscriptionProductPhotoLimit('standard')
      : getSubscriptionProductPhotoLimit(subscription.plan, subscription.planFeatures);

    const { title, description, price, sale_price, sale_starts_at, sale_ends_at, stock, image_url, thumbnail_url, is_available, category, sizes, colors, lookbook_image, gallery_images, prep_time, modifier_groups, attributes } = req.body;
    if (hasInvalidMediaValue(image_url) || hasInvalidMediaValue(thumbnail_url) || hasInvalidMediaValue(lookbook_image) || hasInvalidMediaCollection(gallery_images)) {
      return res.status(400).json({ error: 'Image invalide. Utilisez un fichier téléversé ou une URL publique https.' });
    }
    const safeTitle = sanitizeTextField(title, 120);
    const safeDescription = sanitizeTextField(description, 500);
    const numericPrice = Number(price);
    const numericStock = Number(stock ?? 0);
    if (safeTitle.length < 2 || !Number.isSafeInteger(numericPrice) || numericPrice < 0 || !Number.isSafeInteger(numericStock) || numericStock < 0) {
      return res.status(400).json({ error: 'Titre et prix obligatoires.' });
    }
    if (!safeDescription) return res.status(400).json({ error: 'La description de l’article est obligatoire.' });
    const sale = validateProductSale(numericPrice, sale_price, sale_starts_at, sale_ends_at);
    if (!sale) return res.status(400).json({ error: 'La promotion doit avoir un prix inférieur au prix normal et une période valide.' });

    const newProduct: ProductRecord = {
      id: 0,
      shop_id: shopId,
      created_at: new Date().toISOString(),
      title: safeTitle,
      description: safeDescription,
      price: numericPrice,
      ...sale,
      stock: numericStock,
      image_url: normalizeProductImage(image_url),
      thumbnail_url: thumbnail_url ? normalizeProductImage(thumbnail_url) : undefined,
      is_available: (is_available !== undefined ? Boolean(is_available) : true) && numericStock > 0,
      is_visible: is_available !== undefined ? Boolean(is_available) : true,
      category: category ? String(category).trim() : undefined,
      sizes: Array.isArray(sizes) ? sizes : undefined,
      colors: Array.isArray(colors) ? colors : undefined,
      lookbook_image: lookbook_image ? normalizeProductImage(lookbook_image) : undefined,
      gallery_images: sanitizeGalleryImages(gallery_images),
      prep_time: prep_time !== undefined ? Number(prep_time) : undefined,
      modifier_groups: Array.isArray(modifier_groups) ? modifier_groups : undefined,
      attributes: sanitizeProductAttributes(attributes, shop.category),
    };

    const photoCount = (newProduct.image_url ? 1 : 0)
      + (newProduct.lookbook_image ? 1 : 0)
      + (newProduct.gallery_images?.length || 0);
    if (!req.adminShopAccess && photoCount > photoLimit) {
      return res.status(409).json({ error: `Votre formule permet jusqu’à ${photoLimit} photos par article.` });
    }

    newProduct.id = await allocateProductId();
    if (req.adminShopAccess || !Number.isFinite(productLimit)) {
      await persistProduct(newProduct);
    } else {
      const result = await dbTransaction(async (transaction) => {
        await transaction.get(
          `SELECT id FROM shops WHERE id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
          [shopId],
        );
        const count = await transaction.get<{ count: number | string }>(
          'SELECT COUNT(*) AS count FROM products WHERE shop_id = ?',
          [shopId],
        );
        if (Number(count?.count || 0) >= productLimit) return 'limit_reached';
        await transaction.run(`
          INSERT INTO products (id, shop_id, title, description, price, sale_price, sale_starts_at, sale_ends_at, stock, image_url, thumbnail_url, is_available, is_visible, category, sizes, colors, lookbook_image, gallery_images, prep_time, modifier_groups, attributes, created_at)
          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            COALESCE(?, CURRENT_TIMESTAMP)
          )
        `, [
          newProduct.id, newProduct.shop_id, newProduct.title, newProduct.description ?? null, newProduct.price,
          newProduct.sale_price ?? null, newProduct.sale_starts_at ?? null, newProduct.sale_ends_at ?? null, newProduct.stock,
          newProduct.image_url, newProduct.thumbnail_url ?? null, newProduct.is_available ? 1 : 0, newProduct.is_visible === false ? 0 : 1, newProduct.category ?? null,
          newProduct.sizes ? JSON.stringify(newProduct.sizes) : null, newProduct.colors ? JSON.stringify(newProduct.colors) : null,
          newProduct.lookbook_image ?? null, newProduct.gallery_images?.length ? JSON.stringify(newProduct.gallery_images) : null,
          newProduct.prep_time ?? null, newProduct.modifier_groups ? JSON.stringify(newProduct.modifier_groups) : null,
          newProduct.attributes && Object.keys(newProduct.attributes).length ? JSON.stringify(newProduct.attributes) : null,
          newProduct.created_at,
        ]);
        return 'created';
      });
      if (result === 'limit_reached') {
        return res.status(409).json({
          error: isActiveTrial
            ? `La période d’essai permet jusqu’à ${productLimit} articles au catalogue.`
            : `Votre formule permet jusqu’à ${productLimit} articles. Passez à une formule supérieure pour continuer.`,
        });
      }
    }
    products.unshift(newProduct);
    res.json({ success: true, product: newProduct });
  });

  router.put('/:productId', requireMerchantAccess, requireActiveSubscription, async (req, res) => {
    const shopId = Number(req.params.id);
    const productId = Number(req.params.productId);
    const currentProduct = await getProductFromDatabase(productId);
    if (!currentProduct) return res.status(404).json({ error: 'Produit introuvable.' });
    if (currentProduct.shop_id !== shopId) return res.status(404).json({ error: 'Produit introuvable.' });
    const cachedProduct = products.find((candidate) => candidate.id === productId && candidate.shop_id === shopId);
    const product = { ...currentProduct };

    const { title, description, price, sale_price, sale_starts_at, sale_ends_at, stock, image_url, thumbnail_url, is_available, category, sizes, colors, lookbook_image, gallery_images, prep_time, modifier_groups, attributes } = req.body;
    if (hasInvalidMediaValue(image_url) || hasInvalidMediaValue(thumbnail_url) || hasInvalidMediaValue(lookbook_image) || hasInvalidMediaCollection(gallery_images)) {
      return res.status(400).json({ error: 'Image invalide. Utilisez un fichier téléversé ou une URL publique https.' });
    }
    const shop = await getShopFromDatabase(shopId);
    if (shop && !req.adminShopAccess) {
      const subscription = getSubscriptionState(shop);
      const photoLimit = subscription.status === 'trialing'
        ? getSubscriptionProductPhotoLimit('standard')
        : getSubscriptionProductPhotoLimit(subscription.plan, subscription.planFeatures);
      const nextLookbook = lookbook_image !== undefined ? String(lookbook_image || '') : String(product.lookbook_image || '');
      const nextGallery = gallery_images !== undefined ? sanitizeGalleryImages(gallery_images) : product.gallery_images || [];
      const nextMainImage = image_url !== undefined ? normalizeProductImage(image_url) : product.image_url;
      const nextPhotoCount = (nextMainImage ? 1 : 0) + (nextLookbook ? 1 : 0) + nextGallery.length;
      const currentPhotoCount = (product.image_url ? 1 : 0)
        + (product.lookbook_image ? 1 : 0)
        + (product.gallery_images?.length || 0);
      if (nextPhotoCount > photoLimit && nextPhotoCount > currentPhotoCount) {
        return res.status(409).json({ error: `Votre formule permet jusqu’à ${photoLimit} photos par article.` });
      }
    }
    if (title !== undefined) {
      const safeTitle = sanitizeTextField(title, 120);
      if (safeTitle.length < 2) return res.status(400).json({ error: 'Titre de produit invalide.' });
      product.title = safeTitle;
    }
    if (description !== undefined) {
      const safeDescription = sanitizeTextField(description, 500);
      if (!safeDescription) return res.status(400).json({ error: 'La description de l’article est obligatoire.' });
      product.description = safeDescription;
    }
    if (price !== undefined) {
      const numericPrice = Number(price);
      if (!Number.isSafeInteger(numericPrice) || numericPrice < 0) return res.status(400).json({ error: 'Prix de produit invalide.' });
      product.price = numericPrice;
    }
    const sale = validateProductSale(
      product.price,
      sale_price !== undefined ? sale_price : product.sale_price,
      sale_starts_at !== undefined ? sale_starts_at : product.sale_starts_at,
      sale_ends_at !== undefined ? sale_ends_at : product.sale_ends_at,
    );
    if (!sale) return res.status(400).json({ error: 'La promotion doit avoir un prix inférieur au prix normal et une période valide.' });
    Object.assign(product, sale);
    if (stock !== undefined) {
      const numericStock = Number(stock);
      if (!Number.isSafeInteger(numericStock) || numericStock < 0) return res.status(400).json({ error: 'Stock de produit invalide.' });
      product.stock = numericStock;
    }
    if (image_url !== undefined) {
      product.image_url = normalizeProductImage(image_url);
      product.thumbnail_url = thumbnail_url === undefined ? undefined : normalizeProductImage(thumbnail_url);
    } else if (thumbnail_url !== undefined) {
      product.thumbnail_url = normalizeProductImage(thumbnail_url);
    }
    if (is_available !== undefined) product.is_visible = Boolean(is_available);
    if (category !== undefined) product.category = category ? String(category).trim() : undefined;
    if (sizes !== undefined) product.sizes = Array.isArray(sizes) ? sizes : undefined;
    if (colors !== undefined) product.colors = Array.isArray(colors) ? colors : undefined;
    if (lookbook_image !== undefined) product.lookbook_image = lookbook_image ? normalizeProductImage(lookbook_image) : '';
    if (gallery_images !== undefined) product.gallery_images = sanitizeGalleryImages(gallery_images);
    if (prep_time !== undefined) product.prep_time = Number(prep_time);
    if (modifier_groups !== undefined) product.modifier_groups = Array.isArray(modifier_groups) ? modifier_groups : undefined;
    if (attributes !== undefined && shop) product.attributes = sanitizeProductAttributes(attributes, shop.category);

    product.is_available = Boolean(product.is_visible) && product.stock > 0;
    await persistProduct(product);
    if (stock !== undefined) {
      dispatchStockTransitionPush(shopId, product, currentProduct.stock, product.stock, `stock-edit-${productId}-${Date.now()}`);
    }
    const productIndex = cachedProduct ? products.indexOf(cachedProduct) : -1;
    if (productIndex >= 0) products[productIndex] = product;
    else products.unshift(product);
    res.json({ success: true, product });
  });

  router.patch('/:productId/stock', requireMerchantAccess, requireActiveSubscription, async (req, res) => {
    const shopId = Number(req.params.id);
    const productId = Number(req.params.productId);
    const cachedProduct = products.find((candidate) => candidate.id === productId && candidate.shop_id === shopId);

    const change = Number(req.body.delta);
    if (!Number.isInteger(change) || Math.abs(change) > 100000) return res.status(400).json({ error: 'Variation de stock invalide.' });
    const updated = await dbTransaction(async (transaction) => {
      const row = await transaction.get<Record<string, unknown>>(
        `SELECT * FROM products WHERE id = ? AND shop_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [productId, shopId],
      );
      if (!row) return undefined;
      const current = mapProductRow(row);
      const stock = Math.max(0, current.stock + change);
      const isVisible = Boolean(current.is_visible) && !(change < 0 && stock === 0);
      const isAvailable = stock > 0 && isVisible;
      const updatedProduct = { ...current, stock, is_visible: isVisible, is_available: isAvailable };
      await transaction.run('UPDATE products SET stock = ?, is_available = ?, is_visible = ? WHERE id = ? AND shop_id = ?', [stock, isAvailable ? 1 : 0, isVisible ? 1 : 0, productId, shopId]);
      return { product: updatedProduct, previousStock: current.stock };
    });
    if (!updated) return res.status(404).json({ error: 'Produit introuvable.' });
    const { product, previousStock } = updated;
    dispatchStockTransitionPush(shopId, product, previousStock, product.stock, `stock-update-${productId}-${Date.now()}`);
    if (cachedProduct) Object.assign(cachedProduct, product);
    else products.unshift(product);
    res.json({ success: true, stock: product.stock, product });
  });

  router.patch('/:productId/toggle-visibility', requireMerchantAccess, requireActiveSubscription, async (req, res) => {
    const shopId = Number(req.params.id);
    const productId = Number(req.params.productId);
    const product = await getProductFromDatabase(productId);
    if (!product || product.shop_id !== shopId) return res.status(404).json({ error: 'Produit introuvable.' });
    const cachedProduct = products.find((candidate) => candidate.id === productId && candidate.shop_id === shopId);

    const updatedProduct = {
      ...product,
      is_visible: !product.is_visible,
      is_available: !product.is_visible && product.stock > 0,
    };
    await persistProduct(updatedProduct);
    if (cachedProduct) Object.assign(cachedProduct, updatedProduct);
    else products.unshift(updatedProduct);
    res.json({ success: true, is_available: updatedProduct.is_available, product: updatedProduct });
  });

  router.delete('/:productId', requireMerchantAccess, requireActiveSubscription, async (req, res) => {
    const shopId = Number(req.params.id);
    const productId = Number(req.params.productId);
    const product = products.find((candidate) => candidate.id === productId && candidate.shop_id === shopId);
    const deleteResult = await dbTransaction(async (transaction) => {
      const current = await transaction.get<{ id: number }>(
        `SELECT id FROM products WHERE id = ? AND shop_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
        [productId, shopId],
      );
      if (!current) return 'missing';

      const reservingOrders = await transaction.all<{ items: unknown }>(
        `SELECT items FROM orders WHERE shop_id = ? AND status IN ('pending', 'confirmed', 'preparing', 'ready', 'delivered')`,
        [shopId],
      );
      const hasActiveReservation = reservingOrders.some(({ items }) => {
        const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
        return Array.isArray(parsedItems) && parsedItems.some((item) => (
          item && typeof item === 'object' && Number((item as { product_id?: unknown }).product_id) === productId
        ));
      });
      if (hasActiveReservation) return 'reserved';

      await transaction.run("DELETE FROM customer_favorites WHERE target_type = 'product' AND target_id = ?", [productId]);
      await transaction.run('DELETE FROM customer_product_likes WHERE product_id = ?', [productId]);
      await transaction.run('DELETE FROM products WHERE id = ? AND shop_id = ?', [productId, shopId]);
      return 'deleted';
    });
    if (deleteResult === 'missing') return res.status(404).json({ error: 'Produit introuvable.' });
    if (deleteResult === 'reserved') {
      return res.status(409).json({ error: 'Impossible de supprimer un article associé à une commande dont le stock est encore réservé.' });
    }
    const productIndex = product ? products.indexOf(product) : -1;
    if (productIndex >= 0) products.splice(productIndex, 1);
    res.json({ success: true });
  });

  return router;
}