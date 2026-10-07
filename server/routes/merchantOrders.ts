import { Router, type RequestHandler } from 'express';
import { databaseMode, dbTransaction } from '../../db.ts';
import type { OrderRecord, ProductRecord, ShopRecord } from '../types.ts';

interface MerchantOrdersOptions {
  shops: ShopRecord[];
  products: ProductRecord[];
  orders: OrderRecord[];
  requireMerchantAccess: RequestHandler;
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

export function createMerchantOrdersRouter({
  shops,
  products,
  orders,
  requireMerchantAccess,
  isSameBusinessDay,
  summarizeOrderMetrics,
}: MerchantOrdersOptions) {
  const router = Router({ mergeParams: true });

  router.get('/:id/orders', requireMerchantAccess, (req, res) => {
    const shopId = Number(req.params.id);
    res.json(orders.filter((order) => order.shop_id === shopId));
  });

  router.patch('/:id/orders/:orderId/status', requireMerchantAccess, async (req, res) => {
    const shopId = Number(req.params.id);
    const orderId = Number(req.params.orderId);
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'expired'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Statut invalide. Valeurs possibles : pending, confirmed, preparing, ready, delivered, cancelled, expired.' });
    }

    const order = orders.find((candidate) => candidate.id === orderId && candidate.shop_id === shopId);
    if (!order) return res.status(404).json({ error: 'Commande introuvable.' });
    const previousStatus = order.status || 'pending';
    if (previousStatus === status) return res.json({ success: true, order });

    const allowedTransitions: Record<string, string[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['preparing', 'delivered', 'cancelled'],
      preparing: ['ready', 'cancelled'],
      ready: ['delivered', 'cancelled'],
      delivered: [],
      cancelled: ['pending', 'confirmed'],
      expired: [],
    };
    if (!allowedTransitions[previousStatus]?.includes(status) && !req.adminShopAccess) {
      return res.status(409).json({ error: `Transition impossible : ${previousStatus} → ${status}.` });
    }

    const stockUpdates: { product: ProductRecord; stock: number; isAvailable: boolean }[] = [];
    try {
      await dbTransaction(async (transaction) => {
        const quantities = new Map<number, number>();
        for (const item of order.items || []) {
          quantities.set(item.product_id, (quantities.get(item.product_id) || 0) + Number(item.quantity || 1));
        }
        const stockReservedStatuses = new Set(['confirmed', 'preparing', 'ready', 'delivered']);
        const wasStockReserved = stockReservedStatuses.has(previousStatus);
        const willReserveStock = stockReservedStatuses.has(status);

        if (wasStockReserved && !willReserveStock) {
          for (const [productId, quantity] of quantities) {
            const product = products.find((candidate) => candidate.id === productId && candidate.shop_id === shopId);
            if (!product) continue;
            const stockRow = await transaction.get<{ stock: number }>(
              `SELECT stock FROM products WHERE id = ? AND shop_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
              [product.id, shopId],
            );
            if (!stockRow) continue;
            const stock = Number(stockRow.stock) + quantity;
            const isAvailable = stock > 0;
            await transaction.run('UPDATE products SET stock = ?, is_available = ? WHERE id = ? AND shop_id = ?', [stock, isAvailable ? 1 : 0, product.id, shopId]);
            stockUpdates.push({ product, stock, isAvailable });
          }
        }

        if (willReserveStock && !wasStockReserved) {
          for (const [productId, quantity] of quantities) {
            const product = products.find((candidate) => candidate.id === productId && candidate.shop_id === shopId);
            if (!product) throw Object.assign(new Error('Un article de cette commande n’existe plus dans le catalogue.'), { statusCode: 409 });
            const stockRow = await transaction.get<{ stock: number }>(
              `SELECT stock FROM products WHERE id = ? AND shop_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
              [productId, shopId],
            );
            const currentStock = Number(stockRow?.stock || 0);
            if (!stockRow || currentStock < quantity) {
              throw Object.assign(new Error(`Stock insuffisant pour réactiver « ${product.title} ».`), { statusCode: 409, product_id: productId, stock: currentStock });
            }
            const stock = currentStock - quantity;
            const isAvailable = stock > 0;
            const update = await transaction.run('UPDATE products SET stock = ?, is_available = ? WHERE id = ? AND shop_id = ? AND stock >= ?', [stock, isAvailable ? 1 : 0, productId, shopId, quantity]);
            if (update.changes !== 1) {
              throw Object.assign(new Error(`Stock insuffisant pour réactiver « ${product.title} ».`), { statusCode: 409, product_id: productId, stock: currentStock });
            }
            stockUpdates.push({ product, stock, isAvailable });
          }
        }

        await transaction.run('UPDATE orders SET status = ? WHERE id = ? AND shop_id = ?', [status, order.id, shopId]);
      });
      for (const update of stockUpdates) {
        update.product.stock = update.stock;
        update.product.is_available = update.isAvailable;
      }
      order.status = status as OrderRecord['status'];
    } catch (error: unknown) {
      const err = error as { message?: string; statusCode?: number; product_id?: number; stock?: number };
      const payload: Record<string, unknown> = { error: err.message || 'Transition de commande impossible.' };
      if (err.product_id !== undefined) payload.product_id = err.product_id;
      if (err.stock !== undefined) payload.stock = err.stock;
      return res.status(Number(err.statusCode) || 409).json(payload);
    }

    res.json({
      success: true,
      order,
      message: status === 'confirmed' && previousStatus === 'pending'
        ? 'Commande confirmée et stock réservé.'
        : status === 'cancelled'
          ? 'Demande annulée.'
          : `Statut mis à jour (${status}).`,
    });
  });

  router.get('/:id/flash-bilan', requireMerchantAccess, (req, res) => {
    const shopId = Number(req.params.id);
    const shop = shops.find((candidate) => candidate.id === shopId);
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });

    const shopOrders = orders.filter((order) => order.shop_id === shopId && isSameBusinessDay(order.created_at));
    const metrics = summarizeOrderMetrics(orders, shopId);
    const productSalesMap: Record<number, { title: string; quantity: number; revenue: number }> = {};
    shopOrders.forEach((order) => {
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
    const shopProducts = products.filter((product) => product.shop_id === shopId);
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
