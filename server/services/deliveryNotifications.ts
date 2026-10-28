import { dbAll, dbGet, dbRun } from '../../db.ts';
import {
  sendMerchantPush,
  sendPushToSubscriptions,
  type PushTargetSubscription,
} from './pushNotifications.ts';

const DELIVERY_STATUS_LABELS: Record<string, string> = {
  requested: 'en attente d’un livreur',
  accepted: 'livreur assigné',
  to_pickup: 'en route vers la boutique',
  picked_up: 'en cours de livraison',
  delivered: 'livrée',
  cancelled: 'annulée',
};

interface DeliveryNotificationContext {
  id: number | string;
  order_id: number | string;
  shop_id: number | string;
  customer_user_id: number | string | null;
  ticket_number: string | null;
  quoted_amount: number;
  pickup_zone_id: number | string;
  destination_zone_id: number | string;
  pickup_zone: string;
  destination_zone: string;
}

const formatMoney = (amount: number) => `${new Intl.NumberFormat('fr-FR').format(Number(amount))} FCFA`;

async function getDeliveryContext(deliveryId: number): Promise<DeliveryNotificationContext | null> {
  return dbGet<DeliveryNotificationContext>(`
    SELECT deliveries.id, deliveries.order_id, deliveries.shop_id, deliveries.ticket_number,
      deliveries.quoted_amount, deliveries.pickup_zone_id, deliveries.destination_zone_id,
      orders.customer_user_id,
      pickup.label AS pickup_zone, destination.label AS destination_zone
    FROM delivery_orders AS deliveries
    JOIN orders ON orders.id = deliveries.order_id
    JOIN delivery_zones AS pickup ON pickup.id = deliveries.pickup_zone_id
    JOIN delivery_zones AS destination ON destination.id = deliveries.destination_zone_id
    WHERE deliveries.id = ?
  `, [deliveryId]);
}

const deliveryLabel = (context: DeliveryNotificationContext) =>
  context.ticket_number || `course #${Number(context.id)}`;

const deliveryRouteLabel = (context: DeliveryNotificationContext) =>
  `${context.pickup_zone} → ${context.destination_zone}`;

const removeCustomerSubscription = async (id: number) => {
  await dbRun('DELETE FROM customer_push_subscriptions WHERE id = ?', [id]);
};

const removeDriverSubscription = async (id: number) => {
  await dbRun('DELETE FROM delivery_driver_push_subscriptions WHERE id = ?', [id]);
};

async function sendToCustomer(
  userId: number,
  notification: { title: string; body: string; url: string; tag: string },
) {
  const subscriptions = await dbAll<PushTargetSubscription>(
    'SELECT id, endpoint, p256dh, auth FROM customer_push_subscriptions WHERE user_id = ?',
    [userId],
  );
  return sendPushToSubscriptions(
    subscriptions,
    { ...notification, category: 'delivery' },
    removeCustomerSubscription,
  );
}

async function sendToDriver(
  driverId: number,
  notification: { title: string; body: string; url: string; tag: string },
) {
  const subscriptions = await dbAll<PushTargetSubscription>(
    'SELECT id, endpoint, p256dh, auth FROM delivery_driver_push_subscriptions WHERE driver_id = ?',
    [driverId],
  );
  return sendPushToSubscriptions(
    subscriptions,
    { ...notification, category: 'delivery' },
    removeDriverSubscription,
  );
}

async function sendToMerchant(
  shopId: number,
  eventKey: string,
  notification: { title: string; body: string; url: string; tag: string },
) {
  return sendMerchantPush(shopId, { eventKey, category: 'delivery', ...notification });
}

async function notifyCustomer(
  context: DeliveryNotificationContext,
  notification: { title: string; body: string; tag: string },
) {
  if (context.customer_user_id === null || context.customer_user_id === undefined) return;
  await sendToCustomer(Number(context.customer_user_id), { ...notification, url: '/compte' });
}

async function notifyMerchant(
  context: DeliveryNotificationContext,
  eventKey: string,
  notification: { title: string; body: string; tag: string },
) {
  await sendToMerchant(Number(context.shop_id), eventKey, { ...notification, url: '/app' });
}

async function notifyEligibleDrivers(context: DeliveryNotificationContext) {
  const now = new Date().toISOString();
  const subscriptions = await dbAll<PushTargetSubscription>(`
    SELECT subscriptions.id, subscriptions.endpoint, subscriptions.p256dh, subscriptions.auth
    FROM delivery_driver_push_subscriptions AS subscriptions
    JOIN delivery_drivers AS drivers ON drivers.id = subscriptions.driver_id
    JOIN delivery_driver_zones AS pickup_zone
      ON pickup_zone.driver_id = drivers.id
      AND pickup_zone.zone_id = ?
      AND pickup_zone.is_active = 1
    JOIN delivery_driver_zones AS destination_zone
      ON destination_zone.driver_id = drivers.id
      AND destination_zone.zone_id = ?
      AND destination_zone.is_active = 1
    WHERE drivers.status = 'active'
      AND drivers.access_expires_at > ?
      AND EXISTS (
        SELECT 1 FROM delivery_zone_tariffs AS tariffs
        WHERE tariffs.origin_zone_id = pickup_zone.zone_id
          AND tariffs.destination_zone_id = destination_zone.zone_id
          AND tariffs.amount = ?
          AND tariffs.amount BETWEEN 1500 AND 2500
          AND tariffs.is_active = 1
      )
  `, [context.pickup_zone_id, context.destination_zone_id, now, context.quoted_amount]);
  if (subscriptions.length === 0) return;
  await sendPushToSubscriptions(subscriptions, {
    category: 'delivery',
    title: `Nouvelle course · ${deliveryLabel(context)}`,
    body: `${deliveryRouteLabel(context)} · ${formatMoney(context.quoted_amount)}. Ouvrez l’espace livreur pour accepter.`,
    url: '/__preview/delivery-courier',
    tag: `delivery-offer-${Number(context.id)}`,
  }, removeDriverSubscription);
}

export async function dispatchDeliveryCreatedPush(deliveryId: number) {
  try {
    const context = await getDeliveryContext(deliveryId);
    if (!context) return;
    await Promise.allSettled([
      notifyEligibleDrivers(context),
      notifyCustomer(context, {
        title: 'Livraison en préparation',
        body: `${deliveryLabel(context)} · ${deliveryRouteLabel(context)}. Nous recherchons un livreur.`,
        tag: `delivery-${Number(context.id)}-requested`,
      }),
    ]);
  } catch (error) {
    console.error(`Unable to dispatch delivery creation push for delivery ${deliveryId}.`, error);
  }
}

export async function dispatchDeliveryAssignedPush(deliveryId: number, driverName: string) {
  try {
    const context = await getDeliveryContext(deliveryId);
    if (!context) return;
    const eventKey = `delivery-${Number(context.id)}-accepted-${Date.now()}`;
    await Promise.allSettled([
      notifyMerchant(context, eventKey, {
        title: 'Course acceptée',
        body: `${driverName} a accepté ${deliveryLabel(context)} (${deliveryRouteLabel(context)}).`,
        tag: `delivery-${Number(context.id)}-accepted`,
      }),
      notifyCustomer(context, {
        title: 'Livreur assigné',
        body: `${driverName} prend en charge votre commande ${deliveryLabel(context)}.`,
        tag: `delivery-${Number(context.id)}-accepted`,
      }),
    ]);
  } catch (error) {
    console.error(`Unable to dispatch delivery assignment push for delivery ${deliveryId}.`, error);
  }
}

export async function dispatchDeliveryStatusPush(
  deliveryId: number,
  previousStatus: string,
  nextStatus: string,
) {
  try {
    const context = await getDeliveryContext(deliveryId);
    if (!context) return;
    const nextLabel = DELIVERY_STATUS_LABELS[nextStatus] || nextStatus;
    const eventKey = `delivery-${Number(context.id)}-${nextStatus}-${Date.now()}`;
    const merchantTitles: Record<string, string> = {
      to_pickup: 'Le livreur se dirige vers la boutique',
      picked_up: 'Colis récupéré',
      delivered: 'Course livrée',
    };
    const customerTitles: Record<string, string> = {
      to_pickup: 'Votre commande est en préparation de retrait',
      picked_up: 'Votre commande est en route',
      delivered: 'Votre commande est livrée',
    };
    await Promise.allSettled([
      notifyMerchant(context, eventKey, {
        title: merchantTitles[nextStatus] || `Course ${nextLabel}`,
        body: `${deliveryLabel(context)} · ${deliveryRouteLabel(context)}.`,
        tag: `delivery-${Number(context.id)}-${nextStatus}`,
      }),
      notifyCustomer(context, {
        title: customerTitles[nextStatus] || `Votre livraison est ${nextLabel}`,
        body: `${deliveryLabel(context)} · ${deliveryRouteLabel(context)}.`,
        tag: `delivery-${Number(context.id)}-${nextStatus}`,
      }),
    ]);
    if (previousStatus !== nextStatus) {
      console.info(`Delivery ${deliveryId} moved from ${previousStatus} to ${nextStatus}.`);
    }
  } catch (error) {
    console.error(`Unable to dispatch delivery status push for delivery ${deliveryId}.`, error);
  }
}

export async function dispatchDeliveryProofPush(deliveryId: number) {
  try {
    const context = await getDeliveryContext(deliveryId);
    if (!context) return;
    const eventKey = `delivery-${Number(context.id)}-proof-${Date.now()}`;
    await Promise.allSettled([
      notifyMerchant(context, eventKey, {
        title: 'Preuve de livraison disponible',
        body: `La photo de ${deliveryLabel(context)} est disponible dans la commande.`,
        tag: `delivery-${Number(context.id)}-proof`,
      }),
      notifyCustomer(context, {
        title: 'Photo de livraison disponible',
        body: `La preuve photo de ${deliveryLabel(context)} est disponible dans votre compte.`,
        tag: `delivery-${Number(context.id)}-proof`,
      }),
    ]);
  } catch (error) {
    console.error(`Unable to dispatch delivery proof push for delivery ${deliveryId}.`, error);
  }
}

export async function dispatchDeliveryCancelledPush(
  deliveryId: number,
  previousStatus: string,
  driverId: number | null,
) {
  try {
    const context = await getDeliveryContext(deliveryId);
    if (!context) return;
    const tasks: Promise<unknown>[] = [
      notifyCustomer(context, {
        title: 'Livraison annulée',
        body: `La course ${deliveryLabel(context)} a été annulée par la boutique.`,
        tag: `delivery-${Number(context.id)}-cancelled`,
      }),
    ];
    if (driverId) {
      tasks.push(sendToDriver(driverId, {
        title: 'Course annulée',
        body: `La boutique a annulé ${deliveryLabel(context)} (${deliveryRouteLabel(context)}).`,
        url: '/__preview/delivery-courier',
        tag: `delivery-${Number(context.id)}-cancelled`,
      }));
    }
    await Promise.allSettled(tasks);
    if (previousStatus) console.info(`Delivery ${deliveryId} cancelled from ${previousStatus}.`);
  } catch (error) {
    console.error(`Unable to dispatch delivery cancellation push for delivery ${deliveryId}.`, error);
  }
}
