export interface ProductSaleFields {
  price: number;
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
}

export type ProductSaleStatus = 'none' | 'invalid' | 'scheduled' | 'active' | 'expired';

export function getProductSaleStatus(product: ProductSaleFields, now = Date.now()): ProductSaleStatus {
  if (product.sale_price === undefined || product.sale_price === null) return 'none';
  if (!Number.isSafeInteger(product.sale_price)
    || Number(product.sale_price) <= 0
    || Number(product.sale_price) >= product.price
    || !product.sale_starts_at
    || !product.sale_ends_at) return 'invalid';
  const startsAt = Date.parse(product.sale_starts_at);
  const endsAt = Date.parse(product.sale_ends_at);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return 'invalid';
  if (now < startsAt) return 'scheduled';
  return now < endsAt ? 'active' : 'expired';
}

export function getActiveProductPrice(product: ProductSaleFields, now = Date.now()): number {
  return getProductSaleStatus(product, now) === 'active' ? Number(product.sale_price) : product.price;
}

export function validateProductSale(
  price: number,
  salePrice: unknown,
  saleStartsAt: unknown,
  saleEndsAt: unknown,
): { sale_price: number | null; sale_starts_at: string | null; sale_ends_at: string | null } | null {
  if (salePrice === undefined || salePrice === null || salePrice === '') {
    if (saleStartsAt || saleEndsAt) return null;
    return { sale_price: null, sale_starts_at: null, sale_ends_at: null };
  }

  const numericSalePrice = Number(salePrice);
  if (!Number.isSafeInteger(numericSalePrice) || numericSalePrice <= 0 || numericSalePrice >= price
    || typeof saleStartsAt !== 'string' || typeof saleEndsAt !== 'string') return null;
  const startsAt = new Date(saleStartsAt);
  const endsAt = new Date(saleEndsAt);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())
    || endsAt.getTime() <= startsAt.getTime()) return null;

  return {
    sale_price: numericSalePrice,
    sale_starts_at: startsAt.toISOString(),
    sale_ends_at: endsAt.toISOString(),
  };
}
