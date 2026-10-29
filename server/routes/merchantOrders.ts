import { Router, type RequestHandler } from 'express';
import { databaseMode, dbAll, dbGet, dbTransaction } from '../../db.ts';
import { mapProductRow } from '../repositories/products.ts';
import { getShopFromDatabase } from '../repositories/shops.ts';
import type { OrderRecord, ProductRecord, ShopRecord } from '../types.ts';
import {
  auditOrderContactReveal,
  checkContactRevealRateLimit,
  hashContactIp,
  isOrderContactAvailable,
  maskContactPhone,
} from '../services/contactGuard.ts';
import { dispatchDeliveryCancelledPush } from '../services/deliveryNotifications.ts';

interface MerchantOrdersOptions {
  shops: ShopRecord[];
  products: ProductRecord[];
  orders: OrderRecord[];
  requireMerchantAccess: RequestHandler;
  hashAccessToken: (token: string) => string;
  rateLimitPublicRequest: (limit?: number) => RequestHandler;
  isSameBusinessDay: (value: string | Date) => boolean;
  summarizeOrderMetrics: (orders: OrderRecord[], shopId?: number) => {
    received: number;
    confirmed: number;
    delivered: number;
    cancelled: number;
    ca_ordered: number;
    ca_confirmed: number;
    ca_delivered: number;
    panier_moyen_livre: number;
  };
}

function mapOrderRow(row: Record<string, unknown>): OrderRecord {
  const rawItems = row.items;
  const items = rawItems
    ? typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems
    : [];
  return {
    id: Number(row.id),
    shop_id: Number(row.shop_id),
    customer_user_id: row.customer_user_id == null ? undefined : Number(row.customer_user_id),
    customer_name: String(row.customer_name || ''),
    customer_phone: String(row.customer_phone || ''),
    delivery_location: String(row.delivery_location || ''),
    delivery_note: row.delivery_note == null ? undefined : String(row.delivery_note),
    delivery_slot: row.delivery_slot == null ? undefined : String(row.delivery_slot),
    payment_method_preference: String(row.payment_method_preference || 'to_confirm') as OrderRecord['payment_method_preference'],
    total_amount: Number(row.total_amount),
    delivery_fee: Number(row.delivery_fee || 0),
    created_at: String(row.created_at),
    status: String(row.status || 'pending') as OrderRecord['status'],
    whatsapp_tracking_available: Boolean(row.whatsapp_tracking_available),
    whatsapp_clicked_at: row.whatsapp_clicked_at == null ? null : String(row.whatsapp_clicked_at),
    items: Array.isArray(items) ? items : [],
  };
}

export function createMerchantOrdersRouter({
  shops,
  products,
  orders,
  requireMerchantAccess,
  hashAccessToken,
  rateLimitPublicRequest,
  isSameBusinessDay,
  summarizeOrderMetrics,
}: MerchantOrdersOptions) {
  const router = Router({ mergeParams: true });

  router.get('/:id/orders', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    res.setHeader('Cache-Control', 'no-store');
    const rows = await dbAll<Record<string, unknown>>(`SELECT orders.*, order_whatsapp_tracking.order_id IS NOT NULL AS whatsapp_tracking_available,
      order_whatsapp_tracking.clicked_at AS whatsapp_clicked_at
      FROM orders LEFT JOIN order_whatsapp_tracking ON order_whatsapp_tracking.order_id = orders.id
      WHERE orders.shop_id = ? ORDER BY orders.created_at DESC, orders.id DESC`, [shopId]);
    const shopOrders = rows.map((row) => {
      const order = mapOrderRow(row);
      return { ...order, customer_phone: maskContactPhone(order.customer_phone) };
    });
    res.json(req.adminRole === 'verification_admin'
      ? shopOrders.map((order) => ({
        ...order,
        total_amount: 0,
        delivery_fee: 0,
        items: order.items?.map((item) => ({ ...item, unit_price: 0 })),
      }))
      : shopOrders);
  });

  router.get('/:id/orders/:orderId/contacts/customer', requireMerchantAccess, rateLimitPublicRequest(60), async (req, res) => {
    const shopId = Number(req.params.id);
    const orderId = Number(req.params.orderId);
    if (!Number.isSafeInteger(shopId) || shopId <= 0 || !Number.isSafeInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Boutique ou commande invalide.' });
    }
    if (req.adminShopAccess) return res.status(403).json({ error: 'La révélation directe est réservée au compte marchand.' });
    res.setHeader('Cache-Control', 'no-store');
    const order = await dbGet<{ status: string; customer_phone: string }>(
      'SELECT status, customer_phone FROM orders WHERE id = ? AND shop_id = ?',
      [orderId, shopId],
    );
    if (!order) return res.status(404).json({ error: 'Commande introuvable.' });
    if (!isOrderContactAvailable(order.status || 'pending')) {
      return res.status(403).json({ error: 'Le contact est verrouillé pour cette commande terminée.' });
    }
    if (!order.customer_phone) return res.status(409).json({ error: 'Le client n’a pas renseigné de numéro de contact.' });
    return res.json({
      role: 'customer',
      phone_masked: maskContactPhone(order.customer_phone),
      can_reveal: true,
    });
  });

  router.post('/:id/orders/:orderId/contacts/customer', requireMerchantAccess, rateLimitPublicRequest(30), async (req, res) => {
    const shopId = Number(req.params.id);
    const orderId = Number(req.params.orderId);
    if (!Number.isSafeInteger(shopId) || shopId <= 0 || !Number.isSafeInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Boutique ou commande invalide.' });
    }
    if (req.adminShopAccess) return res.status(403).json({ error: 'La révélation directe est réservée au compte marchand.' });
    res.setHeader('Cache-Control', 'no-store');
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const ipHash = hashContactIp(req, hashAccessToken);
    const result = await dbTransaction(async (transaction) => {
      const order = await transaction.get<{ id: number | string; status: string; customer_phone: string }>(`
        SELECT id, status, customer_phone FROM orders
        WHERE id = ? AND shop_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}
      `, [orderId, shopId]);
      if (!order) return { type: 'missing' as const };
      if (!isOrderContactAvailable(order.status || 'pending')) return { type: 'terminal' as const };
      if (!order.customer_phone) return { type: 'no_contact' as const };
      const allowed = await checkContactRevealRateLimit(transaction, {
        actorType: 'merchant',
        actorId: shopId,
        ipHash,
        nowMs,
        hashAccessToken,
      });
      if (!allowed) return { type: 'limited' as const };
      await auditOrderContactReveal(transaction, {
        orderId: Number(order.id),
        actorType: 'merchant',
        actorId: shopId,
        contactRole: 'customer',
        ipHash,
        revealedAt: now,
      });
      return { type: 'revealed' as const, phone: order.customer_phone };
    });
    if (result.type === 'missing') return res.status(404).json({ error: 'Commande introuvable.' });
    if (result.type === 'terminal') return res.status(403).json({ error: 'Le contact est verrouillé pour cette commande terminée.' });
    if (result.type === 'no_contact') return res.status(409).json({ error: 'Le client n’a pas renseigné de numéro de contact.' });
    if (result.type === 'limited') return res.status(429).json({ error: 'Limite de révélations atteinte. Réessayez plus tard.' });
    return res.json({ role: 'customer', phone: result.phone, revealed_at: now });
  });

  router.patch('/:id/orders/:orderId/status', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const orderId = Number(req.params.orderId);
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'expired'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Statut invalide. Valeurs possibles : pending, confirmed, preparing, ready, delivered, cancelled, expired.' });
    }
    const adminReason = typeof req.body?.reason === 'string'
      ? req.body.reason.trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 500)
      : '';
    if (req.adminShopAccess && adminReason.length < 3) {
      return res.status(400).json({ error: 'Un motif admin (au moins 3 caractères) est obligatoire.' });
    }

    const allowedTransitions: Record<string, string[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['preparing', 'delivered', 'cancelled'],
      preparing: ['ready', 'cancelled'],
      ready: ['delivered', 'cancelled'],
      delivered: [],
      cancelled: ['pending', 'confirmed'],
      expired: [],
    };
    const stockUpdates: { productId: number; stock: number; isAvailable: boolean }[] = [];
    let cancelledDelivery: { id: number; previousStatus: string; driverId: number | null } | null = null;
    try {
      const result = await dbTransaction(async (transaction) => {
        const row = await transaction.get<Record<string, unknown>>(
          `SELECT * FROM orders WHERE id = ? AND shop_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
          [orderId, shopId],
        );
        if (!row) return null;
        const order = mapOrderRow(row);
        const previousStatus = order.status || 'pending';
        if (previousStatus === status) return { order, previousStatus, unchanged: true };
        if (!allowedTransitions[previousStatus]?.includes(status) && !req.adminShopAccess) {
          throw Object.assign(new Error(`Transition impossible : ${previousStatus} → ${status}.`), { statusCode: 409 });
        }
        const linkedDelivery = await transaction.get<{ id: number | string; status: string; driver_id: number | string | null }>(
          `SELECT id, status, driver_id FROM delivery_orders WHERE order_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
          [order.id],
        );
        if (status === 'delivered' && linkedDelivery && linkedDelivery.status !== 'delivered') {
          throw Object.assign(new Error('La course MaTable doit être terminée par le livreur avant de clôturer la commande.'), { statusCode: 409 });
        }
        if (['cancelled', 'expired'].includes(status) && linkedDelivery?.status === 'picked_up') {
          throw Object.assign(new Error('La commande ne peut plus être annulée après récupération du colis par le livreur.'), { statusCode: 409 });
        }

        const quantities = new Map<number, number>();
        for (const item of order.items || []) {
          if (!Number.isSafeInteger(item.product_id) || !Number.isSafeInteger(item.quantity) || item.quantity < 1) {
            throw Object.assign(new Error('Les articles de cette commande sont incohérents.'), { statusCode: 409 });
          }
          quantities.set(item.product_id, (quantities.get(item.product_id) || 0) + item.quantity);
        }
        const stockReservedStatuses = new Set(['confirmed', 'preparing', 'ready', 'delivered']);
        const wasStockReserved = stockReservedStatuses.has(previousStatus);
        const willReserveStock = stockReservedStatuses.has(status);

        if (wasStockReserved && !willReserveStock) {
          for (const [productId, quantity] of quantities) {
            const stockRow = await transaction.get<{ id: number; stock: number; is_visible: number | boolean }>(
              `SELECT id, stock, is_visible FROM products WHERE id = ? AND shop_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
              [productId, shopId],
            );
            if (!stockRow) continue;
            const stock = Number(stockRow.stock) + quantity;
            const isAvailable = stock > 0 && Boolean(stockRow.is_visible);
            await transaction.run('UPDATE products SET stock = ?, is_available = ? WHERE id = ? AND shop_id = ?', [stock, isAvailable ? 1 : 0, productId, shopId]);
            stockUpdates.push({ productId, stock, isAvailable });
          }
        }

        if (willReserveStock && !wasStockReserved) {
          for (const [productId, quantity] of quantities) {
            const product = await transaction.get<{ id: number; stock: number; title: string; is_visible: number | boolean }>(
              `SELECT id, stock, title, is_visible FROM products WHERE id = ? AND shop_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
              [productId, shopId],
            );
            const currentStock = Number(product?.stock || 0);
            if (!product || currentStock < quantity) {
              throw Object.assign(new Error(`Stock insuffisant pour réactiver « ${product?.title || `article #${productId}`} ».`), { statusCode: 409, product_id: productId, stock: currentStock });
            }
            const stock = currentStock - quantity;
            const isAvailable = stock > 0 && Boolean(product.is_visible);
            const update = await transaction.run('UPDATE products SET stock = ?, is_available = ? WHERE id = ? AND shop_id = ? AND stock >= ?', [stock, isAvailable ? 1 : 0, productId, shopId, quantity]);
            if (update.changes !== 1) {
              throw Object.assign(new Error(`Stock insuffisant pour réactiver « ${product.title} ».`), { statusCode: 409, product_id: productId, stock: currentStock });
            }
            stockUpdates.push({ productId, stock, isAvailable });
          }
        }

        await transaction.run('UPDATE orders SET status = ? WHERE id = ? AND shop_id = ?', [status, order.id, shopId]);
        if (['cancelled', 'expired'].includes(status)) {
          await transaction.run('UPDATE orders SET delivery_fee = 0 WHERE id = ?', [order.id]);
        }
        if (['cancelled', 'expired'].includes(status) && linkedDelivery
          && ['requested', 'accepted', 'to_pickup'].includes(linkedDelivery.status)) {
          const cancelledAt = new Date().toISOString();
          await transaction.run(`UPDATE delivery_orders SET status = 'cancelled', cancelled_at = ?
            WHERE id = ? AND status = ?`, [cancelledAt, linkedDelivery.id, linkedDelivery.status]);
          await transaction.run(`INSERT INTO delivery_course_events
            (delivery_id, actor_type, actor_id, previous_status, next_status, created_at)
            VALUES (?, 'merchant', ?, ?, 'cancelled', ?)`,
          [linkedDelivery.id, shopId, linkedDelivery.status, cancelledAt]);
          cancelledDelivery = {
            id: Number(linkedDelivery.id),
            previousStatus: linkedDelivery.status,
            driverId: linkedDelivery.driver_id === null ? null : Number(linkedDelivery.driver_id),
          };
        }
        if (req.adminShopAccess) {
          await transaction.run(
            'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
            [req.adminRole || 'super_admin', 'admin_order_status_updated', shopId, JSON.stringify({
              order_id: order.id,
              previous_status: previousStatus,
              status,
              reason: adminReason,
            }), new Date().toISOString()],
          );
        }
        order.status = status as OrderRecord['status'];
        if (['cancelled', 'expired'].includes(status)) order.delivery_fee = 0;
        return { order, previousStatus, unchanged: false };
      });
      if (!result) return res.status(404).json({ error: 'Commande introuvable.' });
      for (const update of stockUpdates) {
        const product = products.find((candidate) => candidate.id === update.productId && candidate.shop_id === shopId);
        if (product) {
          product.stock = update.stock;
          product.is_available = update.isAvailable;
        }
      }
      const cachedOrder = orders.find((candidate) => candidate.id === orderId && candidate.shop_id === shopId);
      if (cachedOrder) {
        cachedOrder.status = result.order.status;
        cachedOrder.delivery_fee = result.order.delivery_fee;
      }
      const responseOrder = req.adminRole === 'verification_admin'
        ? {
          ...result.order,
          total_amount: 0,
          delivery_fee: 0,
          items: result.order.items?.map((item) => ({ ...item, unit_price: 0 })),
        }
        : result.order;
      if (result.unchanged) return res.json({ success: true, order: responseOrder });
      if (cancelledDelivery) {
        void dispatchDeliveryCancelledPush(
          cancelledDelivery.id,
          cancelledDelivery.previousStatus,
          cancelledDelivery.driverId,
          req.adminShopAccess ? 'admin' : 'merchant',
        );
      }
      res.json({
        success: true,
        order: responseOrder,
        message: status === 'confirmed' && result.previousStatus === 'pending'
          ? 'Commande confirmée et stock réservé.'
          : status === 'cancelled'
            ? 'Demande annulée.'
            : `Statut mis à jour (${status}).`,
      });
    } catch (error: unknown) {
      if (!error || typeof error !== 'object' || !('statusCode' in error)) throw error;
      const err = error as { message: string; statusCode: number; product_id?: number; stock?: number };
      const payload: Record<string, unknown> = { error: err.message };
      if (err.product_id !== undefined) payload.product_id = err.product_id;
      if (err.stock !== undefined) payload.stock = err.stock;
      return res.status(err.statusCode).json(payload);
    }
  });

  router.get('/:id/flash-bilan', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const shop = await getShopFromDatabase(shopId);
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });

    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.parse(`${today}T00:00:00.000Z`) + 86400000).toISOString().slice(0, 10);
    const [orderRows, productRows] = await Promise.all([
      dbAll<Record<string, unknown>>(
        `SELECT id, shop_id, created_at, status, total_amount, items FROM orders
         WHERE shop_id = ? AND created_at >= ? AND created_at < ?
         ORDER BY created_at DESC, id DESC`,
        [shopId, `${today}T00:00:00.000Z`, `${tomorrow}T00:00:00.000Z`],
      ),
      dbAll<Record<string, unknown>>('SELECT id, title, stock FROM products WHERE shop_id = ?', [shopId]),
    ]);
    const currentOrders = orderRows.map(mapOrderRow);
    const shopOrders = currentOrders.filter((order) => isSameBusinessDay(order.created_at));
    const valueOrders = shopOrders.filter((order) => !['cancelled', 'expired'].includes(order.status || 'pending'));
    const metrics = summarizeOrderMetrics(currentOrders, shopId);
    const productSalesMap: Record<number, { title: string; quantity: number; revenue: number }> = {};
    valueOrders.forEach((order) => {
      (order.items || []).forEach((item) => {
        if (!productSalesMap[item.product_id]) {
          productSalesMap[item.product_id] = { title: item.product_title || `Article #${item.product_id}`, quantity: 0, revenue: 0 };
        }
        productSalesMap[item.product_id].quantity += item.quantity;
        productSalesMap[item.product_id].revenue += (item.unit_price || 0) * item.quantity;
      });
    });
    const topSellingProducts = Object.values(productSalesMap)
      .sort((left, right) => right.quantity - left.quantity)
      .slice(0, 5)
      .map((product) => ({ title: product.title, quantity_sold: product.quantity, revenue: product.revenue }));
    const shopProducts = productRows.map(mapProductRow);
    const lowStock = shopProducts.filter((product) => product.stock > 0 && product.stock <= 3);
    const outOfStock = shopProducts.filter((product) => product.stock === 0);
    const todayStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const lines = [
      `🌙 *FLASH BILAN — ${todayStr.toUpperCase()}*`,
      `🏪 *Boutique :* ${shop.name}`,
      `📅 *Période :* ${todayStr}`,
      '----------------------------------------',
      `🧾 *Commandes reçues :* ${metrics.received}`,
      `✅ *Confirmées :* ${metrics.confirmed}`,
      `🚚 *Terminées :* ${metrics.delivered}`,
      `❌ *Annulées :* ${metrics.cancelled}`,
      `💰 *Valeur des commandes enregistrées :* ${new Intl.NumberFormat('fr-FR').format(metrics.ca_ordered)} FCFA`,
      `✅ *Valeur des commandes confirmées :* ${new Intl.NumberFormat('fr-FR').format(metrics.ca_confirmed)} FCFA`,
      `🚚 *Valeur des commandes terminées :* ${new Intl.NumberFormat('fr-FR').format(metrics.ca_delivered)} FCFA`,
      `🧺 *Panier moyen livré :* ${new Intl.NumberFormat('fr-FR').format(metrics.panier_moyen_livre)} FCFA`,
      '----------------------------------------',
      'ℹ️ *MaTable.ci ne collecte aucun paiement.* Les paiements sont convenus directement entre le client et le vendeur.',
    ];
    if (topSellingProducts.length > 0) {
      lines.push('🏆 *ARTICLES LES PLUS VENDUS :*');
      topSellingProducts.forEach((product, index) => lines.push(` ${index + 1}. *${product.title}* : ${product.quantity_sold} unité(s) (${new Intl.NumberFormat('fr-FR').format(product.revenue)} FCFA)`));
      lines.push('----------------------------------------');
    }
    if (outOfStock.length > 0) {
      lines.push(`🚨 *RUPTURES DE STOCK (${outOfStock.length}) :*`);
      outOfStock.forEach((product) => lines.push(` • ${product.title} (0 restant)`));
      lines.push('----------------------------------------');
    }
    if (lowStock.length > 0) {
      lines.push(`⚠️ *ALERTE STOCK BAS (${lowStock.length}) :*`);
      lowStock.forEach((product) => lines.push(` • ${product.title} (${product.stock} restant(s))`));
      lines.push('----------------------------------------');
    }
    lines.push('Bravo pour cette journée de vente ! À demain pour de nouvelles commandes. 🚀');
    res.json({
      date: todayStr,
      total_sales: metrics.ca_ordered,
      orders_count: shopOrders.length,
      total_orders: shopOrders.length,
      top_selling_products: topSellingProducts,
      low_stock_products: lowStock.map((product) => ({ id: product.id, title: product.title, stock: product.stock })),
      out_of_stock_products: outOfStock.map((product) => ({ id: product.id, title: product.title })),
      whatsapp_message: lines.join('\n'),
    });
  });

  return router;
}
