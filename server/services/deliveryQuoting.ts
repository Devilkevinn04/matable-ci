import { dbAll, dbGet } from '../../db.ts';

export const MIN_DELIVERY_QUOTE = 1500;
export const MAX_DELIVERY_QUOTE = 2500;

export interface DeliveryQuote {
  pickup_zone_id: number | string;
  destination_zone_id: number | string;
  amount: number;
  origin_label: string;
  destination_label: string;
}

export const deliveryQuoteSql = `
  SELECT shop_origins.zone_id AS pickup_zone_id,
    tariffs.destination_zone_id, tariffs.amount,
    origin.label AS origin_label, destination.label AS destination_label
  FROM delivery_shop_origins AS shop_origins
  JOIN delivery_zones AS origin ON origin.id = shop_origins.zone_id AND origin.is_active = 1
  JOIN delivery_zone_tariffs AS tariffs
    ON tariffs.origin_zone_id = shop_origins.zone_id
    AND tariffs.destination_zone_id = ?
    AND tariffs.is_active = 1
  JOIN delivery_zones AS destination
    ON destination.id = tariffs.destination_zone_id AND destination.is_active = 1
  WHERE shop_origins.shop_id = ?
    AND tariffs.amount BETWEEN ? AND ?
`;

export function getDeliveryQuote(shopId: number, destinationZoneId: number): Promise<DeliveryQuote | undefined> {
  return dbGet<DeliveryQuote>(deliveryQuoteSql, [
    destinationZoneId,
    shopId,
    MIN_DELIVERY_QUOTE,
    MAX_DELIVERY_QUOTE,
  ]);
}

export interface ShopDeliveryOptionRow {
  origin_zone: string;
  destination_zone_id: number | string;
  destination_zone: string;
  amount: number;
}

export function listShopDeliveryOptionRows(shopId: number): Promise<ShopDeliveryOptionRow[]> {
  return dbAll<ShopDeliveryOptionRow>(`
    SELECT origin.label AS origin_zone,
      tariffs.destination_zone_id,
      destination.label AS destination_zone,
      tariffs.amount
    FROM delivery_shop_origins AS shop_origins
    JOIN delivery_zones AS origin ON origin.id = shop_origins.zone_id AND origin.is_active = 1
    JOIN delivery_zone_tariffs AS tariffs
      ON tariffs.origin_zone_id = shop_origins.zone_id AND tariffs.is_active = 1
    JOIN delivery_zones AS destination
      ON destination.id = tariffs.destination_zone_id AND destination.is_active = 1
    WHERE shop_origins.shop_id = ? AND tariffs.amount BETWEEN ? AND ?
    ORDER BY destination.label
  `, [shopId, MIN_DELIVERY_QUOTE, MAX_DELIVERY_QUOTE]);
}

export function buildDeliveryTicket(deliveryId: number, createdAt: string): string {
  const date = new Date(createdAt);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = String(safeDate.getUTCFullYear()).slice(-2);
  const month = String(safeDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getUTCDate()).padStart(2, '0');
  return `LIV-${year}${month}${day}-${String(deliveryId).padStart(6, '0')}`;
}
