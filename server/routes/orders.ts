import { Router, type RequestHandler } from 'express';
import { databaseMode, dbGet, dbRun, dbTransaction } from '../../db.ts';
import { getShopPublicationBlockReason, isShopPubliclyVisible } from '../services/businessRules.ts';
import type { OrderRecord, ProductRecord, ShopRecord } from '../types.ts';

interface CustomerSession {
  authenticated: boolean;
  user?: { id: number } | null;
}

interface OrderRouterOptions {
  shops: ShopRecord[];
  products: ProductRecord[];
  orders: OrderRecord[];
  rateLimitPublicRequest: (limit?: number) => RequestHandler;
  validateCustomerOrderInput: (input: {
    customer_name?: string;
    customer_phone?: string;
    delivery_location?: string;
    delivery_note?: string;
  }) => { ok: boolean; customer_name?: string; customer_phone?: string; delivery_location?: string; delivery_note?: string; error?: string };
  computeIsShopOpen: (shop: ShopRecord) => boolean;
  getCustomerSessionState: (req: import('express').Request, res?: import('express').Response) => Promise<CustomerSession>;
  hashAccessToken: (token: string) => string;
  timingSafeEqual: (left: string, right: string) => boolean;
  getValidSelectedModifiers: (product: ProductRecord, selectedModifiers: string[]) => string[];
  getProductUnitPriceWithModifiers: (product: ProductRecord, selectedModifiers: string[]) => number;
}

export function createOrderRouter({
  shops,
  products,
  orders,
  rateLimitPublicRequest,
  validateCustomerOrderInput,
  computeIsShopOpen,
  getCustomerSessionState,
  hashAccessToken,
  timingSafeEqual,
  getValidSelectedModifiers,
  getProductUnitPriceWithModifiers,
}: OrderRouterOptions) {
  const router = Router();

  router.post('/orders', rateLimitPublicRequest(30), async (req, res) => {
    const { shop_id, customer_name, customer_phone, delivery_location, delivery_note, delivery_slot, payment_method_preference, items, website, form_started_at } = req.body;
    if (String(website || '').trim()) return res.status(400).json({ error: 'Requête rejetée.' });
    if (form_started_at !== undefined) {
      const formAge = Date.now() - Number(form_started_at);
      if (!Number.isFinite(formAge) || formAge < 1200 || formAge > 2 * 60 * 60 * 1000) {
        return res.status(400).json({ error: 'Veuillez remplir le formulaire avant de commander.' });
      }
    }
    if (!shop_id || !customer_name || !customer_phone || !delivery_location || !Array.isArray(items) || items.length === 0 || items.length > 50) {
      return res.status(400).json({ error: 'Champs requis manquants pour la commande.' });
    }

    const validatedCustomer = validateCustomerOrderInput({ customer_name, customer_phone, delivery_location, delivery_note });
    if (!validatedCustomer.ok) return res.status(400).json({ error: validatedCustomer.error || 'Données client invalides.' });
    const shop = shops.find((candidate) => candidate.id === Number(shop_id));
    if (!shop) return res.status(404).json({ error: 'Boutique introuvable.' });
    if (!shop.is_active) return res.status(403).json({ error: 'Cette boutique est inactive.' });

    const allowedPaymentPreferences = new Set(['wave', 'mobile_money', 'cash', 'to_confirm', undefined, null, '']);
    if (!allowedPaymentPreferences.has(payment_method_preference)) return res.status(400).json({ error: 'Mode de paiement souhaité invalide.' });
    const requestedQuantities = new Map<number, number>();
    for (const item of items) {
      const productId = Number(item.product_id);
      const quantity = Number(item.quantity);
      if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        return res.status(400).json({ error: 'Article ou quantité invalide.' });
      }
      requestedQuantities.set(productId, (requestedQuantities.get(productId) || 0) + quantity);
    }
    if (!computeIsShopOpen(shop)) {
      return res.status(400).json({ error: 'Cette boutique est actuellement fermée. La prise de commande est temporairement désactivée.' });
    }

    const customerSession = await getCustomerSessionState(req, res);
    if (!customerSession.authenticated || !customerSession.user?.id) {
      return res.status(401).json({ error: 'Connectez-vous ou créez un compte MaTable.ci pour passer commande.' });
    }
    if (!isShopPubliclyVisible(shop)) {
      const blockReason = getShopPublicationBlockReason(shop);
      const error = blockReason === 'verification'
        ? 'Cette boutique doit terminer sa vérification avant de recevoir des commandes.'
        : blockReason === 'subscription'
          ? 'Cette boutique ne dispose pas d’un essai ou abonnement actif.'
          : 'Cette boutique n’est pas publiée.';
      return res.status(403).json({ error });
    }
    const customerUserId = customerSession.user.id;
    const whatsappTrackingToken = crypto.randomUUID();
    const stockUpdates: { product: ProductRecord; stock: number; isAvailable: boolean }[] = [];
    try {
      const createdOrder = await dbTransaction(async (transaction) => {
        const orderIdRecord = await transaction.get<{ id: number }>(`
          INSERT INTO id_allocators (name, last_id)
          SELECT ?, COALESCE(MAX(id), 0) + 1 FROM orders WHERE TRUE
          ON CONFLICT(name) DO UPDATE SET last_id = id_allocators.last_id + 1
          RETURNING last_id AS id
        `, ['orders']);
        if (!orderIdRecord) throw new Error('Impossible d’allouer un identifiant de commande.');
        const orderId = Number(orderIdRecord.id);
        const orderItemRecords: NonNullable<OrderRecord['items']> = [];
        let calculatedTotal = 0;
        const reservedProductIds = new Set<number>();

        for (const item of items) {
          const productId = Number(item.product_id);
          const product = products.find((candidate) => candidate.id === productId);
          if (!product || product.shop_id !== shop.id) {
            throw Object.assign(new Error(`Article #${productId} introuvable dans le catalogue.`), { statusCode: 400 });
          }
          const stockQuantity = reservedProductIds.has(product.id) ? 0 : (requestedQuantities.get(product.id) || 0);
          const stockRow = await transaction.get<{ stock: number; is_available: number }>(
            `SELECT stock, is_available FROM products WHERE id = ? AND shop_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
            [product.id, shop.id],
          );
          if (!stockRow) throw Object.assign(new Error(`Article #${productId} introuvable dans le catalogue.`), { statusCode: 400 });
          if (stockQuantity > 0 && (!stockRow.is_available || stockRow.stock <= 0)) {
            throw Object.assign(new Error(`L'article "${product.title}" est en rupture de stock.`), { statusCode: 409, product_id: product.id, stock: 0 });
          }
          if (stockQuantity > 0 && stockRow.stock < stockQuantity) {
            throw Object.assign(new Error(`Stock insuffisant pour "${product.title}". Seulement ${stockRow.stock} unité(s) disponible(s).`), { statusCode: 409, product_id: product.id, stock: stockRow.stock });
          }
          if (stockQuantity > 0) {
            const stock = Number(stockRow.stock) - stockQuantity;
            const update = await transaction.run(
              'UPDATE products SET stock = ?, is_available = ? WHERE id = ? AND shop_id = ? AND stock >= ?',
              [stock, stock > 0 ? 1 : 0, product.id, shop.id, stockQuantity],
            );
            if (update.changes !== 1) {
              throw Object.assign(new Error(`Le stock de "${product.title}" vient de changer. Réessayez la commande.`), { statusCode: 409, product_id: product.id, stock: Number(stockRow.stock) });
            }
            stockUpdates.push({ product, stock, isAvailable: stock > 0 });
            reservedProductIds.add(product.id);
          }

          const selectedModifiers = Array.isArray(item.selected_modifiers) ? item.selected_modifiers : [];
          const validSelectedModifiers = getValidSelectedModifiers(product, selectedModifiers);
          for (const group of product.modifier_groups || []) {
            const selectedInGroup = validSelectedModifiers.filter((label) => group.options.some((option) => (typeof option === 'string' ? option : option.label) === label));
            if (group.required && selectedInGroup.length === 0) {
              throw Object.assign(new Error(`Veuillez choisir une option pour « ${group.name} » dans "${product.title}".`), { statusCode: 400, product_id: product.id });
            }
          }
          const unitPrice = getProductUnitPriceWithModifiers(product, validSelectedModifiers);
          calculatedTotal += unitPrice * Number(item.quantity);
          orderItemRecords.push({
            id: orderItemRecords.length + 1,
            order_id: orderId,
            product_id: product.id,
            product_title: product.title,
            quantity: Number(item.quantity),
            unit_price: unitPrice,
            selected_size: item.selected_size,
            selected_color: item.selected_color,
            selected_modifiers: validSelectedModifiers,
          });
        }

        const newOrder: OrderRecord = {
          id: orderId,
          shop_id: shop.id,
          customer_user_id: customerUserId,
          customer_name: validatedCustomer.customer_name || customer_name,
          customer_phone: validatedCustomer.customer_phone || customer_phone,
          delivery_location: validatedCustomer.delivery_location || delivery_location,
          delivery_note: validatedCustomer.delivery_note || delivery_note,
          delivery_slot,
          payment_method_preference: payment_method_preference || 'to_confirm',
          total_amount: calculatedTotal,
          created_at: new Date().toISOString(),
          status: 'confirmed',
          whatsapp_tracking_available: true,
          whatsapp_clicked_at: null,
          items: orderItemRecords,
        };
        await transaction.run(`
          INSERT INTO orders (
            id, shop_id, customer_name, customer_phone, delivery_location, delivery_note,
            delivery_slot, payment_method_preference, total_amount, created_at, status, items, customer_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [newOrder.id, newOrder.shop_id, newOrder.customer_name, newOrder.customer_phone, newOrder.delivery_location,
          newOrder.delivery_note ?? null, newOrder.delivery_slot ?? null, newOrder.payment_method_preference,
          newOrder.total_amount, newOrder.created_at, newOrder.status, JSON.stringify(newOrder.items ?? []), newOrder.customer_user_id ?? null]);
        await transaction.run(
          'INSERT INTO order_whatsapp_tracking (order_id, token_hash, clicked_at) VALUES (?, ?, NULL)',
          [orderId, hashAccessToken(whatsappTrackingToken)],
        );
        return newOrder;
      });
      for (const update of stockUpdates) {
        update.product.stock = update.stock;
        update.product.is_available = update.isAvailable;
      }
      orders.unshift(createdOrder);
      res.json({
        success: true,
        order: createdOrder,
        whatsapp_tracking_token: whatsappTrackingToken,
        message: 'Commande acceptée automatiquement et stock réservé. Contactez le vendeur sur WhatsApp pour échanger sur la livraison et le paiement.',
      });
    } catch (error: unknown) {
      const err = error as { message?: string; statusCode?: number; product_id?: number; stock?: number };
      const payload: Record<string, unknown> = { error: err.message || 'Stock insuffisant pour une ou plusieurs références.' };
      if (err.product_id !== undefined) payload.product_id = err.product_id;
      if (err.stock !== undefined) payload.stock = err.stock;
      res.status(Number(err.statusCode) || 409).json(payload);
    }
  });

  router.post('/orders/:id/whatsapp-click', rateLimitPublicRequest(60), async (req, res) => {
    const orderId = Number(req.params.id);
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    if (!Number.isSafeInteger(orderId) || orderId <= 0 || token.length < 20 || token.length > 200) {
      return res.status(404).json({ error: 'Suivi de commande introuvable.' });
    }
    const tracking = await dbGet<{ token_hash: string; clicked_at: string | null }>(
      'SELECT token_hash, clicked_at FROM order_whatsapp_tracking WHERE order_id = ?',
      [orderId],
    );
    if (!tracking || !timingSafeEqual(hashAccessToken(token), String(tracking.token_hash))) {
      return res.status(404).json({ error: 'Suivi de commande introuvable.' });
    }
    const clickedAt = tracking.clicked_at || new Date().toISOString();
    if (!tracking.clicked_at) {
      await dbRun('UPDATE order_whatsapp_tracking SET clicked_at = COALESCE(clicked_at, ?) WHERE order_id = ?', [clickedAt, orderId]);
    }
    const order = orders.find((candidate) => candidate.id === orderId);
    if (order) order.whatsapp_clicked_at = clickedAt;
    res.json({ success: true, clicked_at: clickedAt });
  });

  router.get('/auth/customer-orders', async (req, res) => {
    const customerSession = await getCustomerSessionState(req, res);
    if (!customerSession.authenticated || !customerSession.user) return res.status(401).json({ error: 'Authentification client requise.' });
    res.json({ orders: orders.filter((order) => order.customer_user_id === customerSession.user?.id) });
  });

  return router;
}
