import { Router, type RequestHandler } from 'express';
import type { ShopCategory } from '../../src/utils/categoryDefaults.ts';
import type { ProductRecord } from '../types.ts';

interface ProductShop {
  id: number;
  category: ShopCategory;
  subscription_status?: string;
  trial_end?: string | null;
}

interface ProductRouterOptions {
  products: ProductRecord[];
  findShop: (shopId: number) => ProductShop | undefined;
  requireMerchantAccess: RequestHandler;
  allocateProductId: () => Promise<number>;
  persistProduct: (product: ProductRecord) => Promise<void>;
  deleteProduct: (productId: number, shopId: number) => Promise<void>;
  sanitizeTextField: (value: string | null | undefined, maxLength?: number) => string;
  normalizeProductImage: (value: unknown) => string;
  sanitizeGalleryImages: (value: unknown) => string[];
  sanitizeProductAttributes: (value: unknown, category: ShopCategory) => Record<string, string> | undefined;
  trialProductLimit: number;
}

export function createProductRouter({
  products,
  findShop,
  requireMerchantAccess,
  allocateProductId,
  persistProduct,
  deleteProduct,
  sanitizeTextField,
  normalizeProductImage,
  sanitizeGalleryImages,
  sanitizeProductAttributes,
  trialProductLimit,
}: ProductRouterOptions) {
  const router = Router({ mergeParams: true });

  router.get('/', requireMerchantAccess, (req, res) => {
    const shopId = Number(req.params.id);
    res.json(products.filter((product) => product.shop_id === shopId));
  });

  router.post('/', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const shop = findShop(shopId);
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    const trialEndTime = shop.trial_end ? Date.parse(shop.trial_end) : NaN;
    const trialCatalogLimitReached = shop.subscription_status === 'trialing'
      && !req.adminShopAccess
      && Number.isFinite(trialEndTime)
      && trialEndTime > Date.now()
      && products.filter((product) => product.shop_id === shopId).length >= trialProductLimit;
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
      is_available: is_available !== undefined ? Boolean(is_available) : true,
      category: category ? String(category).trim() : undefined,
      sizes: Array.isArray(sizes) ? sizes : undefined,
      colors: Array.isArray(colors) ? colors : undefined,
      lookbook_image: lookbook_image || undefined,
      gallery_images: sanitizeGalleryImages(gallery_images),
      prep_time: prep_time !== undefined ? Number(prep_time) : undefined,
      modifier_groups: Array.isArray(modifier_groups) ? modifier_groups : undefined,
      attributes: sanitizeProductAttributes(attributes, shop.category),
    };

    products.unshift(newProduct);
    await persistProduct(newProduct);
    res.json({ success: true, product: newProduct });
  });

  router.put('/:productId', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const productId = Number(req.params.productId);
    const product = products.find((candidate) => candidate.id === productId);
    if (!product || product.shop_id !== shopId) return res.status(404).json({ error: 'Produit introuvable.' });

    const { title, description, price, stock, image_url, is_available, category, sizes, colors, lookbook_image, gallery_images, prep_time, modifier_groups, attributes } = req.body;
    const shop = findShop(shopId);
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
    if (is_available !== undefined) product.is_available = Boolean(is_available);
    if (category !== undefined) product.category = category ? String(category).trim() : undefined;
    if (sizes !== undefined) product.sizes = Array.isArray(sizes) ? sizes : undefined;
    if (colors !== undefined) product.colors = Array.isArray(colors) ? colors : undefined;
    if (lookbook_image !== undefined) product.lookbook_image = lookbook_image;
    if (gallery_images !== undefined) product.gallery_images = sanitizeGalleryImages(gallery_images);
    if (prep_time !== undefined) product.prep_time = Number(prep_time);
    if (modifier_groups !== undefined) product.modifier_groups = Array.isArray(modifier_groups) ? modifier_groups : undefined;
    if (attributes !== undefined && shop) product.attributes = sanitizeProductAttributes(attributes, shop.category);

    await persistProduct(product);
    res.json({ success: true, product });
  });

  router.patch('/:productId/stock', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const productId = Number(req.params.productId);
    const product = products.find((candidate) => candidate.id === productId && candidate.shop_id === shopId);
    if (!product) return res.status(404).json({ error: 'Produit introuvable.' });

    const change = Number(req.body.delta);
    if (!Number.isInteger(change) || Math.abs(change) > 100000) return res.status(400).json({ error: 'Variation de stock invalide.' });
    product.stock = Math.max(0, product.stock + change);
    product.is_available = product.stock > 0 && product.is_available;
    await persistProduct(product);
    res.json({ success: true, stock: product.stock, product });
  });

  router.patch('/:productId/toggle-visibility', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const productId = Number(req.params.productId);
    const product = products.find((candidate) => candidate.id === productId && candidate.shop_id === shopId);
    if (!product) return res.status(404).json({ error: 'Produit introuvable.' });

    product.is_available = !product.is_available;
    await persistProduct(product);
    res.json({ success: true, is_available: product.is_available, product });
  });

  router.delete('/:productId', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const productId = Number(req.params.productId);
    const index = products.findIndex((product) => product.id === productId && product.shop_id === shopId);
    if (index === -1) return res.status(404).json({ error: 'Produit introuvable.' });

    products.splice(index, 1);
    await deleteProduct(productId, shopId);
    res.json({ success: true });
  });

  return router;
}