import { Router, type RequestHandler } from 'express';
import { databaseMode, dbAll, dbTransaction } from '../../db.ts';
import { mapProductRow } from '../repositories/products.ts';
import { getProductFromDatabase } from '../repositories/products.ts';
import { getShopFromDatabase } from '../repositories/shops.ts';
import type { ShopCategory } from '../../src/utils/categoryDefaults.ts';
import type { ProductRecord } from '../types.ts';

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

  router.get('/', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const rows = await dbAll<Record<string, unknown>>('SELECT * FROM products WHERE shop_id = ? ORDER BY id', [shopId]);
    res.json(rows.map(mapProductRow));
  });

  router.post('/', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const shop = await getShopFromDatabase(shopId);
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const trialEndTime = shop.trial_end ? Date.parse(shop.trial_end) : NaN;
    const isTrialCatalogLimited = shop.subscription_status === 'trialing'
      && !req.adminShopAccess
      && Number.isFinite(trialEndTime)
      && trialEndTime > Date.now();
    const productCount = isTrialCatalogLimited
      ? Number((await dbAll<{ count: number | string }>('SELECT COUNT(*) AS count FROM products WHERE shop_id = ?', [shopId]))[0]?.count || 0)
      : 0;
    const trialCatalogLimitReached = isTrialCatalogLimited && productCount >= trialProductLimit;
    if (trialCatalogLimitReached) return res.status(409).json({ error: `La période d’essai permet jusqu’à ${trialProductLimit} articles au catalogue.` });

    const { title, description, price, stock, image_url, is_available, category, sizes, colors, lookbook_image, gallery_images, prep_time, modifier_groups, attributes } = req.body;
    const safeTitle = sanitizeTextField(title, 120);
    const numericPrice = Number(price);
    const numericStock = Number(stock ?? 0);
    if (safeTitle.length < 2 || !Number.isSafeInteger(numericPrice) || numericPrice < 0 || !Number.isSafeInteger(numericStock) || numericStock < 0) {
      return res.status(400).json({ error: 'Titre et prix obligatoires.' });
    }

    const newProduct: ProductRecord = {
      id: await allocateProductId(),
      shop_id: shopId,
      created_at: new Date().toISOString(),
      title: safeTitle,
      description: description ? sanitizeTextField(description, 500) : null,
      price: numericPrice,
      stock: numericStock,
      image_url: normalizeProductImage(image_url),
      is_available: (is_available !== undefined ? Boolean(is_available) : true) && numericStock > 0,
      is_visible: is_available !== undefined ? Boolean(is_available) : true,
      category: category ? String(category).trim() : undefined,
      sizes: Array.isArray(sizes) ? sizes : undefined,
      colors: Array.isArray(colors) ? colors : undefined,
      lookbook_image: lookbook_image || undefined,
      gallery_images: sanitizeGalleryImages(gallery_images),
      prep_time: prep_time !== undefined ? Number(prep_time) : undefined,
      modifier_groups: Array.isArray(modifier_groups) ? modifier_groups : undefined,
      attributes: sanitizeProductAttributes(attributes, shop.category),
    };

    await persistProduct(newProduct);
    products.unshift(newProduct);
    res.json({ success: true, product: newProduct });
  });

  router.put('/:productId', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const productId = Number(req.params.productId);
    const currentProduct = await getProductFromDatabase(productId);
    if (!currentProduct) return res.status(404).json({ error: 'Produit introuvable.' });
    if (currentProduct.shop_id !== shopId) return res.status(404).json({ error: 'Produit introuvable.' });
    const cachedProduct = products.find((candidate) => candidate.id === productId && candidate.shop_id === shopId);
    const product = { ...currentProduct };

    const { title, description, price, stock, image_url, is_available, category, sizes, colors, lookbook_image, gallery_images, prep_time, modifier_groups, attributes } = req.body;
    const shop = await getShopFromDatabase(shopId);
    if (title !== undefined) {
      const safeTitle = sanitizeTextField(title, 120);
      if (safeTitle.length < 2) return res.status(400).json({ error: 'Titre de produit invalide.' });
      product.title = safeTitle;
    }
    if (description !== undefined) product.description = description ? sanitizeTextField(description, 500) : null;
    if (price !== undefined) {
      const numericPrice = Number(price);
      if (!Number.isSafeInteger(numericPrice) || numericPrice < 0) return res.status(400).json({ error: 'Prix de produit invalide.' });
      product.price = numericPrice;
    }
    if (stock !== undefined) {
      const numericStock = Number(stock);
      if (!Number.isSafeInteger(numericStock) || numericStock < 0) return res.status(400).json({ error: 'Stock de produit invalide.' });
      product.stock = numericStock;
    }
    if (image_url !== undefined) product.image_url = normalizeProductImage(image_url);
    if (is_available !== undefined) product.is_visible = Boolean(is_available);
    if (category !== undefined) product.category = category ? String(category).trim() : undefined;
    if (sizes !== undefined) product.sizes = Array.isArray(sizes) ? sizes : undefined;
    if (colors !== undefined) product.colors = Array.isArray(colors) ? colors : undefined;
    if (lookbook_image !== undefined) product.lookbook_image = lookbook_image;
    if (gallery_images !== undefined) product.gallery_images = sanitizeGalleryImages(gallery_images);
    if (prep_time !== undefined) product.prep_time = Number(prep_time);
    if (modifier_groups !== undefined) product.modifier_groups = Array.isArray(modifier_groups) ? modifier_groups : undefined;
    if (attributes !== undefined && shop) product.attributes = sanitizeProductAttributes(attributes, shop.category);

    product.is_available = Boolean(product.is_visible) && product.stock > 0;
    await persistProduct(product);
    const productIndex = cachedProduct ? products.indexOf(cachedProduct) : -1;
    if (productIndex >= 0) products[productIndex] = product;
    else products.unshift(product);
    res.json({ success: true, product });
  });

  router.patch('/:productId/stock', requireMerchantAccess, async (req, res) => {
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
      return updatedProduct;
    });
    if (!updated) return res.status(404).json({ error: 'Produit introuvable.' });
    const product = updated;
    if (cachedProduct) Object.assign(cachedProduct, updated);
    else products.unshift(updated);
    res.json({ success: true, stock: product.stock, product });
  });

  router.patch('/:productId/toggle-visibility', requireMerchantAccess, async (req, res) => {
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

  router.delete('/:productId', requireMerchantAccess, async (req, res) => {
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
        `SELECT items FROM orders WHERE shop_id = ? AND status IN ('confirmed', 'preparing', 'ready', 'delivered')`,
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