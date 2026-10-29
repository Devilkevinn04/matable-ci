import { Router, type RequestHandler } from 'express';
import { databaseMode, dbAll, dbGet, dbRun, dbTransaction } from '../../db.ts';
import { getShopPublicationBlockReason, isShopPubliclyVisible } from '../services/businessRules.ts';
import { mapProductRow } from '../repositories/products.ts';
import { getShopFromDatabase } from '../repositories/shops.ts';
import type { OrderRecord, ProductRecord, ShopRecord } from '../types.ts';
import { isAgeRestrictedProduct } from '../../src/utils/ageRestrictedProducts.ts';
import { normalizeAnalyticsCampaign } from '../../src/utils/analyticsAttribution.ts';
import {
  dispatchStockTransitionPush,
  getVapidConfiguration,
  parseBrowserPushSubscription,
  sendMerchantPush,
} from '../services/pushNotifications.ts';
import {
  auditOrderContactReveal,
  checkContactRevealRateLimit,
  hashContactIp,
  isOrderContactAvailable,
  maskContactPhone,
} from '../services/contactGuard.ts';
import {
  buildDeliveryTicket,
  deliveryQuoteSql,
  MAX_DELIVERY_QUOTE,
  MIN_DELIVERY_QUOTE,
  type DeliveryQuote,
} from '../services/deliveryQuoting.ts';
import { dispatchDeliveryCreatedPush } from '../services/deliveryNotifications.ts';

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
  deliveryOperationsEnabled: boolean;
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
  deliveryOperationsEnabled,
}: OrderRouterOptions) {
  const router = Router();

  router.post('/orders', rateLimitPublicRequest(30), async (req, res) => {
    const { shop_id, customer_name, customer_phone, delivery_location, delivery_note, delivery_slot, payment_method_preference, items, website, form_started_at, delivery_zone_id } = req.body;
    const attributionCampaign = normalizeAnalyticsCampaign(req.body?.attribution_campaign);
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
    const requestedDeliveryZoneId = delivery_zone_id === undefined || delivery_zone_id === null || delivery_zone_id === ''
      ? null
      : Number(delivery_zone_id);
    if (requestedDeliveryZoneId !== null
      && (!Number.isSafeInteger(requestedDeliveryZoneId) || requestedDeliveryZoneId <= 0)) {
      return res.status(400).json({ error: 'Zone de livraison invalide.' });
    }
    if (requestedDeliveryZoneId !== null && !deliveryOperationsEnabled) {
      return res.status(409).json({ error: 'La livraison MaTable n’est pas encore ouverte dans cette version. Convenez du retrait ou de la livraison directement avec la boutique.' });
    }

    const validatedCustomer = validateCustomerOrderInput({ customer_name, customer_phone, delivery_location, delivery_note });
    if (!validatedCustomer.ok) return res.status(400).json({ error: validatedCustomer.error || 'Données client invalides.' });
    const shop = await getShopFromDatabase(Number(shop_id));
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
    const blockReason = getShopPublicationBlockReason(shop);
    if (!isShopPubliclyVisible(shop) || blockReason === 'subscription') {
      const error = blockReason === 'verification'
        ? 'Cette boutique doit terminer sa vérification avant de recevoir des commandes.'
        : blockReason === 'subscription'
          ? 'Cette boutique ne dispose pas d’un essai ou abonnement actif.'
          : 'Cette boutique n’est pas publiée.';
      return res.status(403).json({ error });
    }
    const customerUserId = customerSession.authenticated ? customerSession.user?.id : undefined;
    const whatsappTrackingToken = crypto.randomUUID();
    const stockUpdates: { product: ProductRecord; previousStock: number; stock: number; isAvailable: boolean }[] = [];
    try {
      const created = await dbTransaction(async (transaction) => {
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
          const productRow = await transaction.get<Record<string, unknown>>(
            `SELECT * FROM products WHERE id = ? AND shop_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE' : ''}`,
            [productId, shop.id],
          );
          const product = productRow ? mapProductRow(productRow) : undefined;
          if (!product) {
            throw Object.assign(new Error(`Article #${productId} introuvable dans le catalogue.`), { statusCode: 400 });
          }
          if (!req.body?.age_confirmed && isAgeRestrictedProduct(product)) {
            throw Object.assign(new Error('Une confirmation de majorité est requise pour commander ces produits.'), { statusCode: 403 });
          }
          const stockQuantity = reservedProductIds.has(product.id) ? 0 : (requestedQuantities.get(product.id) || 0);
          const currentStock = Number(product.stock);
          if (stockQuantity > 0 && (!product.is_available || currentStock <= 0)) {
            throw Object.assign(new Error(`L'article "${product.title}" est en rupture de stock.`), { statusCode: 409, product_id: product.id, stock: 0 });
          }
          if (stockQuantity > 0 && currentStock < stockQuantity) {
            throw Object.assign(new Error(`Stock insuffisant pour "${product.title}". Seulement ${currentStock} unité(s) disponible(s).`), { statusCode: 409, product_id: product.id, stock: currentStock });
          }
          if (stockQuantity > 0) {
            const stock = currentStock - stockQuantity;
            const isAvailable = stock > 0 && Boolean(product.is_visible);
            const update = await transaction.run(
              'UPDATE products SET stock = ?, is_available = ? WHERE id = ? AND shop_id = ? AND stock >= ?',
              [stock, isAvailable ? 1 : 0, product.id, shop.id, stockQuantity],
            );
            if (update.changes !== 1) {
              throw Object.assign(new Error(`Le stock de "${product.title}" vient de changer. Réessayez la commande.`), { statusCode: 409, product_id: product.id, stock: currentStock });
            }
            stockUpdates.push({ product, previousStock: currentStock, stock, isAvailable });
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

        const deliveryQuote = requestedDeliveryZoneId === null
          ? null
          : await transaction.get<DeliveryQuote>(
            deliveryQuoteSql,
            [requestedDeliveryZoneId, shop.id, MIN_DELIVERY_QUOTE, MAX_DELIVERY_QUOTE],
          );
        if (requestedDeliveryZoneId !== null && !deliveryQuote) {
          throw Object.assign(new Error('Aucun tarif MaTable actif pour cette zone. Choisissez une autre zone ou convenez de la livraison avec la boutique.'), { statusCode: 409 });
        }
        const deliveryFee = deliveryQuote ? Number(deliveryQuote.amount) : 0;
        const createdAt = new Date().toISOString();

        const newOrder: OrderRecord = {
          id: orderId,
          shop_id: shop.id,
          customer_user_id: customerUserId,
          attribution_campaign: attributionCampaign,
          customer_name: validatedCustomer.customer_name || customer_name,
          customer_phone: validatedCustomer.customer_phone || customer_phone,
          delivery_location: validatedCustomer.delivery_location || delivery_location,
          delivery_note: validatedCustomer.delivery_note || delivery_note,
          delivery_slot,
          payment_method_preference: payment_method_preference || 'to_confirm',
          total_amount: calculatedTotal,
          delivery_fee: deliveryFee,
          created_at: createdAt,
          status: 'confirmed',
          whatsapp_tracking_available: true,
          whatsapp_clicked_at: null,
          items: orderItemRecords,
        };
        await transaction.run(`
          INSERT INTO orders (
            id, shop_id, customer_name, customer_phone, delivery_location, delivery_note,
            delivery_slot, payment_method_preference, total_amount, delivery_fee, created_at, status, items, customer_user_id,
            attribution_campaign
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [newOrder.id, newOrder.shop_id, newOrder.customer_name, newOrder.customer_phone, newOrder.delivery_location,
          newOrder.delivery_note ?? null, newOrder.delivery_slot ?? null, newOrder.payment_method_preference,
          newOrder.total_amount, newOrder.delivery_fee, newOrder.created_at, newOrder.status, JSON.stringify(newOrder.items ?? []), newOrder.customer_user_id ?? null,
          newOrder.attribution_campaign ?? null]);
        await transaction.run(
          'INSERT INTO order_whatsapp_tracking (order_id, token_hash, clicked_at) VALUES (?, ?, NULL)',
          [orderId, hashAccessToken(whatsappTrackingToken)],
        );

        let createdDelivery: {
          id: number;
          order_id: number;
          shop_id: number;
          pickup_zone_id: number;
          destination_zone_id: number;
          quoted_amount: number;
          status: string;
          created_at: string;
          ticket_number: string;
        } | null = null;
        if (deliveryQuote) {
          const insertedDelivery = await transaction.get<{ id: number | string }>(`INSERT INTO delivery_orders
            (order_id, shop_id, pickup_zone_id, destination_zone_id, quoted_amount, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'requested', ?)
            RETURNING id`,
          [orderId, shop.id, deliveryQuote.pickup_zone_id, deliveryQuote.destination_zone_id, deliveryQuote.amount, createdAt]);
          if (!insertedDelivery) throw new Error('Impossible de créer la course de livraison.');
          const deliveryId = Number(insertedDelivery.id);
          if (!Number.isSafeInteger(deliveryId) || deliveryId <= 0) {
            throw new Error('Invalid delivery identifier returned by the database.');
          }
          const ticketNumber = buildDeliveryTicket(deliveryId, createdAt);
          await transaction.run('UPDATE delivery_orders SET ticket_number = ? WHERE id = ?', [ticketNumber, deliveryId]);
          await transaction.run(`INSERT INTO delivery_course_events
            (delivery_id, actor_type, actor_id, previous_status, next_status, created_at)
            VALUES (?, 'admin', NULL, NULL, 'requested', ?)`,
          [deliveryId, createdAt]);
          createdDelivery = {
            id: deliveryId,
            order_id: orderId,
            shop_id: shop.id,
            pickup_zone_id: Number(deliveryQuote.pickup_zone_id),
            destination_zone_id: Number(deliveryQuote.destination_zone_id),
            quoted_amount: Number(deliveryQuote.amount),
            status: 'requested',
            created_at: createdAt,
            ticket_number: ticketNumber,
          };
        }

        return { order: newOrder, delivery: createdDelivery };
      });
      const { order: createdOrder, delivery: createdDelivery } = created;
      for (const update of stockUpdates) {
        update.product.stock = update.stock;
        update.product.is_available = update.isAvailable;
      }
      orders.unshift(createdOrder);
      void sendMerchantPush(shop.id, {
        eventKey: `order-${createdOrder.id}`,
        category: 'orders',
        title: 'Nouvelle commande',
        body: `Une commande de ${(createdOrder.total_amount + Number(createdOrder.delivery_fee || 0)).toLocaleString('fr-FR')} FCFA vient d’arriver.`,
        url: '/app',
        tag: `order-${createdOrder.id}`,
      }).catch((error: unknown) => console.error(`Unable to queue order notification for shop ${shop.id}.`, error));
      if (createdDelivery) void dispatchDeliveryCreatedPush(createdDelivery.id);
      for (const update of stockUpdates) {
        dispatchStockTransitionPush(shop.id, update.product, update.previousStock, update.stock, `stock-order-${createdOrder.id}-${update.product.id}`);
      }
      res.json({
        success: true,
        order: createdOrder,
        delivery: createdDelivery,
        whatsapp_tracking_token: whatsappTrackingToken,
        message: createdDelivery
          ? 'Commande acceptée et stock réservé. La livraison MaTable est en attente d’un livreur ; réglez les articles et les frais de livraison selon les modalités convenues avec la boutique.'
          : 'Commande acceptée automatiquement et stock réservé. Contactez le vendeur sur WhatsApp pour échanger sur la livraison et le paiement.',
      });
    } catch (error: unknown) {
      const err = error as { message?: string; statusCode?: number; product_id?: number; stock?: number };
      const payload: Record<string, unknown> = { error: err.message || 'Stock insuffisant pour une ou plusieurs références.' };
      if (err.product_id !== undefined) payload.product_id = err.product_id;
      if (err.stock !== undefined) payload.stock = err.stock;
      res.status(Number(err.statusCode) || 409).json(payload);
    }
  });

  router.get('/customers/orders/:id/contacts/merchant', rateLimitPublicRequest(60), async (req, res) => {
    const orderId = Number(req.params.id);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) return res.status(400).json({ error: 'Identifiant de commande invalide.' });
    const customerSession = await getCustomerSessionState(req, res);
    if (!customerSession.authenticated || !customerSession.user) {
      return res.status(401).json({ error: 'Authentification client requise.' });
    }
    res.setHeader('Cache-Control', 'no-store');
    const order = await dbGet<{ status: string; merchant_phone: string | null }>(`
      SELECT orders.status, shops.whatsapp_number AS merchant_phone
      FROM orders
      JOIN shops ON shops.id = orders.shop_id
      WHERE orders.id = ? AND orders.customer_user_id = ?
    `, [orderId, customerSession.user.id]);
    if (!order) return res.status(404).json({ error: 'Commande introuvable.' });
    if (!isOrderContactAvailable(order.status)) {
      return res.status(403).json({ error: 'Le contact est verrouillé pour cette commande terminée.' });
    }
    if (!order.merchant_phone) return res.status(409).json({ error: 'La boutique n’a pas renseigné de numéro de contact.' });
    return res.json({
      role: 'merchant',
      phone_masked: maskContactPhone(order.merchant_phone),
      can_reveal: true,
    });
  });

  router.post('/customers/orders/:id/contacts/merchant', rateLimitPublicRequest(30), async (req, res) => {
    const orderId = Number(req.params.id);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) return res.status(400).json({ error: 'Identifiant de commande invalide.' });
    const customerSession = await getCustomerSessionState(req, res);
    if (!customerSession.authenticated || !customerSession.user) {
      return res.status(401).json({ error: 'Authentification client requise.' });
    }
    res.setHeader('Cache-Control', 'no-store');
    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const ipHash = hashContactIp(req, hashAccessToken);
    const result = await dbTransaction(async (transaction) => {
      const order = await transaction.get<{ id: number | string; status: string; merchant_phone: string | null }>(`
        SELECT orders.id, orders.status, shops.whatsapp_number AS merchant_phone
        FROM orders
        JOIN shops ON shops.id = orders.shop_id
        WHERE orders.id = ? AND orders.customer_user_id = ?${databaseMode === 'postgresql' ? ' FOR UPDATE OF orders' : ''}
      `, [orderId, customerSession.user?.id]);
      if (!order) return { type: 'missing' as const };
      if (!isOrderContactAvailable(order.status)) return { type: 'terminal' as const };
      if (!order.merchant_phone) return { type: 'no_contact' as const };
      const allowed = await checkContactRevealRateLimit(transaction, {
        actorType: 'customer',
        actorId: customerSession.user!.id,
        ipHash,
        nowMs,
        hashAccessToken,
      });
      if (!allowed) return { type: 'limited' as const };
      await auditOrderContactReveal(transaction, {
        orderId: Number(order.id),
        actorType: 'customer',
        actorId: customerSession.user!.id,
        contactRole: 'merchant',
        ipHash,
        revealedAt: now,
      });
      return { type: 'revealed' as const, phone: order.merchant_phone };
    });
    if (result.type === 'missing') return res.status(404).json({ error: 'Commande introuvable.' });
    if (result.type === 'terminal') return res.status(403).json({ error: 'Le contact est verrouillé pour cette commande terminée.' });
    if (result.type === 'no_contact') return res.status(409).json({ error: 'La boutique n’a pas renseigné de numéro de contact.' });
    if (result.type === 'limited') return res.status(429).json({ error: 'Limite de révélations atteinte. Réessayez plus tard.' });
    return res.json({ role: 'merchant', phone: result.phone, revealed_at: now });
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

  router.get('/auth/customer-push/config', async (req, res) => {
    const customerSession = await getCustomerSessionState(req, res);
    if (!customerSession.authenticated || !customerSession.user) return res.status(401).json({ error: 'Authentification client requise.' });
    const vapid = getVapidConfiguration();
    const subscriptions = await dbAll<{ count: number | string }>(
      'SELECT COUNT(*) AS count FROM customer_push_subscriptions WHERE user_id = ?',
      [customerSession.user.id],
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      configured: Boolean(vapid),
      public_key: vapid?.publicKey || null,
      subscribed_devices: Number(subscriptions[0]?.count || 0),
    });
  });

  router.put('/auth/customer-push/subscription', async (req, res) => {
    const customerSession = await getCustomerSessionState(req, res);
    if (!customerSession.authenticated || !customerSession.user) return res.status(401).json({ error: 'Authentification client requise.' });
    if (!getVapidConfiguration()) {
      return res.status(503).json({ error: 'Les notifications Push ne sont pas encore configurées sur le serveur.' });
    }
    const subscription = parseBrowserPushSubscription(req.body);
    if (!subscription) return res.status(400).json({ error: 'Abonnement navigateur invalide.' });
    const now = new Date().toISOString();
    const saved = await dbRun(`INSERT INTO customer_push_subscriptions
      (user_id, endpoint, p256dh, auth, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (endpoint) DO UPDATE SET
        p256dh = excluded.p256dh, auth = excluded.auth, updated_at = excluded.updated_at
      WHERE customer_push_subscriptions.user_id = excluded.user_id`,
    [customerSession.user.id, subscription.endpoint, subscription.p256dh, subscription.auth, now, now]);
    if (saved.changes !== 1) return res.status(409).json({ error: 'Cet appareil est déjà associé à un autre compte client.' });
    res.json({ success: true });
  });

  router.delete('/auth/customer-push/subscription', async (req, res) => {
    const customerSession = await getCustomerSessionState(req, res);
    if (!customerSession.authenticated || !customerSession.user) return res.status(401).json({ error: 'Authentification client requise.' });
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
    if (!endpoint || endpoint.length > 2048) return res.status(400).json({ error: 'Appareil invalide.' });
    await dbRun('DELETE FROM customer_push_subscriptions WHERE user_id = ? AND endpoint = ?', [customerSession.user.id, endpoint]);
    res.json({ success: true });
  });

  router.get('/auth/customer-orders', async (req, res) => {
    const customerSession = await getCustomerSessionState(req, res);
    if (!customerSession.authenticated || !customerSession.user) return res.status(401).json({ error: 'Authentification client requise.' });
    const rows = await dbAll<Record<string, unknown>>(`SELECT orders.*, shops.name AS shop_name,
      order_whatsapp_tracking.order_id IS NOT NULL AS whatsapp_tracking_available,
      order_whatsapp_tracking.clicked_at AS whatsapp_clicked_at,
      delivery_orders.id AS delivery_id,
      delivery_orders.status AS delivery_status,
      delivery_orders.ticket_number AS delivery_ticket_number,
      delivery_orders.quoted_amount AS delivery_quoted_amount,
      delivery_proofs.id IS NOT NULL AS delivery_proof_available,
      delivery_proofs.captured_at AS delivery_proof_captured_at,
      delivery_proofs.byte_size AS delivery_proof_byte_size
      FROM orders
      LEFT JOIN shops ON shops.id = orders.shop_id
      LEFT JOIN order_whatsapp_tracking ON order_whatsapp_tracking.order_id = orders.id
      LEFT JOIN delivery_orders ON delivery_orders.order_id = orders.id
      LEFT JOIN delivery_proofs ON delivery_proofs.delivery_id = delivery_orders.id
      WHERE orders.customer_user_id = ?
      ORDER BY orders.created_at DESC, orders.id DESC`, [customerSession.user.id]);
    const reviewRows = await dbAll<{ order_id: number; target_type: string; target_id: number }>(
      'SELECT order_id, target_type, target_id FROM customer_reviews WHERE user_id = ? ORDER BY target_type, target_id',
      [customerSession.user.id],
    );
    const reviewsByOrder = new Map<number, { target_type: string; target_id: number }[]>();
    for (const review of reviewRows) {
      const orderReviews = reviewsByOrder.get(Number(review.order_id)) || [];
      orderReviews.push({ target_type: review.target_type, target_id: Number(review.target_id) });
      reviewsByOrder.set(Number(review.order_id), orderReviews);
    }
    const customerOrders = rows.map((row) => {
      const rawItems = row.items;
      const items = rawItems ? typeof rawItems === 'string' ? JSON.parse(rawItems) : rawItems : [];
      return {
        id: Number(row.id),
        shop_id: Number(row.shop_id),
        customer_user_id: Number(row.customer_user_id),
        customer_name: String(row.customer_name),
        delivery_location: String(row.delivery_location),
        delivery_note: row.delivery_note == null ? undefined : String(row.delivery_note),
        delivery_slot: row.delivery_slot == null ? undefined : String(row.delivery_slot),
        payment_method_preference: String(row.payment_method_preference || 'to_confirm'),
        total_amount: Number(row.total_amount),
        delivery_fee: Number(row.delivery_fee || 0),
        created_at: String(row.created_at),
        status: String(row.status || 'pending'),
        whatsapp_tracking_available: Boolean(row.whatsapp_tracking_available),
        whatsapp_clicked_at: row.whatsapp_clicked_at == null ? null : String(row.whatsapp_clicked_at),
        items: Array.isArray(items) ? items : [],
        shop_name: String(row.shop_name || 'Boutique locale'),
        reviewed_targets: reviewsByOrder.get(Number(row.id)) || [],
        delivery: row.delivery_id == null ? null : {
          id: Number(row.delivery_id),
          status: String(row.delivery_status),
          ticket_number: row.delivery_ticket_number == null ? null : String(row.delivery_ticket_number),
          quoted_amount: Number(row.delivery_quoted_amount),
          proof_available: Boolean(row.delivery_proof_available),
          proof_captured_at: row.delivery_proof_captured_at == null ? null : String(row.delivery_proof_captured_at),
          proof_byte_size: row.delivery_proof_byte_size == null ? null : Number(row.delivery_proof_byte_size),
        },
      };
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ orders: customerOrders });
  });

  return router;
}
