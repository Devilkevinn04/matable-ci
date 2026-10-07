import { Router, type Request, type Response } from 'express';
import { dbAll, dbGet, dbRun } from '../../db.ts';
import { mapShopRow } from '../repositories/shops.ts';
import { isShopPubliclyVisible } from '../services/businessRules.ts';

interface CustomerSession {
  authenticated: boolean;
  user?: { id: number } | null;
}

interface CustomerEngagementOptions {
  shops?: unknown[];
  products?: unknown[];
  getCustomerSessionState: (req: Request, res?: Response) => Promise<CustomerSession>;
  rateLimitPublicRequest: (limit?: number) => import('express').RequestHandler;
}

export function createCustomerEngagementRouter({
  getCustomerSessionState,
  rateLimitPublicRequest,
}: CustomerEngagementOptions) {
  const router = Router();

  const requireCustomer = async (req: Request, res: Response) => {
    const session = await getCustomerSessionState(req, res);
    if (!session.authenticated || !session.user?.id) {
      res.status(401).json({ error: 'Connectez-vous pour gérer vos favoris et vos mentions J’aime.' });
      return null;
    }
    return session.user.id;
  };

  router.get('/state', async (req, res) => {
    const userId = await requireCustomer(req, res);
    if (!userId) return;
    const [savedShopRows, savedProductRows, likedProductRows] = await Promise.all([
      dbAll<Record<string, unknown>>(
        `SELECT shops.* FROM customer_favorites
         JOIN shops ON shops.id = customer_favorites.target_id
         WHERE customer_favorites.user_id = ? AND customer_favorites.target_type = 'shop'
         ORDER BY customer_favorites.created_at DESC`,
        [userId],
      ),
      dbAll<Record<string, unknown>>(
        `SELECT shops.*, products.id AS saved_product_id, products.shop_id AS saved_product_shop_id,
          products.title AS saved_product_title, products.price AS saved_product_price,
          products.image_url AS saved_product_image_url
         FROM customer_favorites
         JOIN products ON products.id = customer_favorites.target_id
         JOIN shops ON shops.id = products.shop_id
         WHERE customer_favorites.user_id = ? AND customer_favorites.target_type = 'product'
         ORDER BY customer_favorites.created_at DESC`,
        [userId],
      ),
      dbAll<{ product_id: number }>(
        `SELECT customer_product_likes.product_id FROM customer_product_likes
         JOIN products ON products.id = customer_product_likes.product_id
         JOIN shops ON shops.id = products.shop_id
         WHERE customer_product_likes.user_id = ?`,
        [userId],
      ),
    ]);
    const savedShops = savedShopRows
      .map(mapShopRow)
      .filter((shop) => isShopPubliclyVisible(shop))
      .map((shop) => ({
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        category: shop.category,
        city: shop.city,
      }));
    const savedProducts = savedProductRows.flatMap((row) => {
      const shop = mapShopRow(row);
      if (!isShopPubliclyVisible(shop)) return [];
      return [{
        id: Number(row.saved_product_id),
        shop_id: Number(row.saved_product_shop_id),
        title: String(row.saved_product_title),
        price: Number(row.saved_product_price),
        image_url: row.saved_product_image_url == null ? '' : String(row.saved_product_image_url),
        slug: shop.slug,
        shop_name: shop.name,
      }];
    });
    res.json({
      favorite_shop_ids: savedShops.map((shop) => shop.id),
      favorite_product_ids: savedProducts.map((product) => product.id),
      liked_product_ids: likedProductRows.map((item) => Number(item.product_id)),
      shops: savedShops,
      products: savedProducts,
    });
  });

  router.post('/favorites', rateLimitPublicRequest(30), async (req, res) => {
    const userId = await requireCustomer(req, res);
    if (!userId) return;
    const targetType = req.body?.target_type;
    const targetId = Number(req.body?.target_id);
    if (!['shop', 'product'].includes(targetType) || !Number.isSafeInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ error: 'Favori invalide.' });
    }
    const target = await getPublicTarget(targetType, targetId);
    if (!target) {
      return res.status(404).json({ error: 'Cette boutique ou ce produit est introuvable.' });
    }

    const removed = await dbRun(
      'DELETE FROM customer_favorites WHERE user_id = ? AND target_type = ? AND target_id = ?',
      [userId, targetType, targetId],
    );
    const isFavorite = removed.changes === 0;
    if (isFavorite) {
      await dbRun(
        'INSERT INTO customer_favorites (user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, target_type, target_id) DO NOTHING',
        [userId, targetType, targetId, new Date().toISOString()],
      );
    }
    return res.json({ success: true, is_favorite: isFavorite, target_type: targetType, target_id: targetId });
  });

  router.post('/products/:id/like', rateLimitPublicRequest(30), async (req, res) => {
    const userId = await requireCustomer(req, res);
    if (!userId) return;
    const productId = Number(req.params.id);
    if (!Number.isSafeInteger(productId) || productId <= 0) return res.status(400).json({ error: 'Produit invalide.' });
    const target = await getPublicTarget('product', productId);
    if (!target) return res.status(404).json({ error: 'Produit introuvable.' });

    const inserted = await dbRun(
      'INSERT INTO customer_product_likes (user_id, product_id, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, product_id) DO NOTHING',
      [userId, productId, new Date().toISOString()],
    );
    const isLiked = inserted.changes === 1;
    if (!isLiked) {
      await dbRun('DELETE FROM customer_product_likes WHERE user_id = ? AND product_id = ?', [userId, productId]);
    }
    const count = await dbGet<{ count: number | string }>(
      'SELECT COUNT(*) AS count FROM customer_product_likes WHERE product_id = ?',
      [productId],
    );
    return res.json({ success: true, is_liked: isLiked, like_count: Number(count?.count) || 0 });
  });

  const getPublicTarget = async (targetType: unknown, targetIdValue: unknown) => {
    const targetId = Number(targetIdValue);
    if (!['shop', 'product'].includes(String(targetType)) || !Number.isSafeInteger(targetId) || targetId <= 0) return null;
    const shopRow = targetType === 'shop'
      ? await dbGet<Record<string, unknown>>('SELECT shops.* FROM shops WHERE shops.id = ?', [targetId])
      : await dbGet<Record<string, unknown>>(
        `SELECT shops.* FROM products
         JOIN shops ON shops.id = products.shop_id
         WHERE products.id = ?`,
        [targetId],
      );
    if (!shopRow) return null;
    const shop = mapShopRow(shopRow);
    if (!isShopPubliclyVisible(shop)) return null;
    return { targetType: String(targetType), targetId, shop };
  };

  router.get('/reviews', async (req, res) => {
    const target = await getPublicTarget(req.query.target_type, req.query.target_id);
    if (!target) return res.status(404).json({ error: 'Cette boutique ou ce produit est introuvable.' });
    const [reviews, aggregate] = await Promise.all([
      dbAll<{ id: number; rating: number; comment: string; created_at: string; author_name: string }>(
        `SELECT reviews.id, reviews.rating, reviews.comment, reviews.created_at,
          COALESCE(NULLIF(users.first_name, ''), 'Client MaTable') AS author_name
         FROM customer_reviews AS reviews JOIN users ON users.id = reviews.user_id
         WHERE reviews.target_type = ? AND reviews.target_id = ? AND reviews.status = 'approved'
         ORDER BY reviews.created_at DESC LIMIT 50`,
        [target.targetType, target.targetId],
      ),
      dbGet<{ average_rating: number | string | null; review_count: number | string }>(
        `SELECT AVG(rating) AS average_rating, COUNT(*) AS review_count FROM customer_reviews
         WHERE target_type = ? AND target_id = ? AND status = 'approved'`,
        [target.targetType, target.targetId],
      ),
    ]);
    return res.json({
      reviews,
      average_rating: aggregate?.average_rating == null ? null : Number(Number(aggregate.average_rating).toFixed(1)),
      review_count: Number(aggregate?.review_count) || 0,
    });
  });

  router.post('/reviews', rateLimitPublicRequest(10), async (req, res) => {
    const userId = await requireCustomer(req, res);
    if (!userId) return;
    const target = await getPublicTarget(req.body?.target_type, req.body?.target_id);
    if (!target) return res.status(404).json({ error: 'Cette boutique ou ce produit est introuvable.' });
    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'La note doit être comprise entre 1 et 5.' });
    const comment = String(req.body?.comment || '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 1000);
    const order = await dbGet<{ id: number; shop_id: number; status: string; items: string | null }>(
      'SELECT id, shop_id, status, items FROM orders WHERE id = ? AND customer_user_id = ?',
      [Number(req.body?.order_id), userId],
    );
    if (!order || order.status !== 'delivered') return res.status(403).json({ error: 'Un avis est possible après la clôture d’une commande de votre compte.' });
    if (target.targetType === 'shop' && Number(order.shop_id) !== target.targetId) {
      return res.status(403).json({ error: 'Cette commande ne concerne pas la boutique évaluée.' });
    }
    if (target.targetType === 'product') {
      let items: { product_id?: number }[] = [];
      try {
        items = typeof order.items === 'string' ? JSON.parse(order.items) : [];
      } catch {
        return res.status(500).json({ error: 'Les articles de cette commande sont illisibles.' });
      }
      if (Number(order.shop_id) !== target.shop.id || !items.some((item) => Number(item.product_id) === target.targetId)) {
        return res.status(403).json({ error: 'Cette commande ne contient pas le produit évalué.' });
      }
    }
    const inserted = await dbGet<{ id: number }>(
      `INSERT INTO customer_reviews (user_id, order_id, shop_id, target_type, target_id, rating, comment, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?) ON CONFLICT(order_id, user_id, target_type, target_id) DO NOTHING RETURNING id`,
      [userId, Number(order.id), target.shop.id, target.targetType, target.targetId, rating, comment, new Date().toISOString()],
    );
    if (!inserted) return res.status(409).json({ error: 'Vous avez déjà donné votre avis pour cette commande et cet article.' });
    return res.status(201).json({ success: true, id: Number(inserted.id), status: 'pending' });
  });

  router.post('/reports', rateLimitPublicRequest(10), async (req, res) => {
    const userId = await requireCustomer(req, res);
    if (!userId) return;
    const target = await getPublicTarget(req.body?.target_type, req.body?.target_id);
    if (!target) return res.status(404).json({ error: 'Cette boutique ou ce produit est introuvable.' });
    const reason = String(req.body?.reason || '');
    const allowedReasons = new Set(['inaccurate', 'fraud', 'inappropriate', 'unavailable', 'other']);
    if (!allowedReasons.has(reason)) return res.status(400).json({ error: 'Sélectionnez un motif de signalement valide.' });
    const details = String(req.body?.details || '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 1000);
    const pending = await dbGet<{ id: number }>(
      `SELECT id FROM customer_reports WHERE user_id = ? AND target_type = ? AND target_id = ? AND status IN ('pending', 'in_review') LIMIT 1`,
      [userId, target.targetType, target.targetId],
    );
    if (pending) return res.status(409).json({ error: 'Votre signalement pour cet élément est déjà en cours d’examen.' });
    const createdAt = new Date().toISOString();
    const result = await dbGet<{ id: number }>(
      `INSERT INTO customer_reports (user_id, target_type, target_id, reason, details, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)
       ON CONFLICT(user_id, target_type, target_id) WHERE status IN ('pending', 'in_review') DO NOTHING RETURNING id`,
      [userId, target.targetType, target.targetId, reason, details, createdAt],
    );
    if (!result) return res.status(409).json({ error: 'Votre signalement pour cet élément est déjà en cours d’examen.' });
    return res.status(201).json({ success: true, id: Number(result.id) });
  });

  return router;
}
