import type { Product } from '../../types';

export type BulkProductAction =
  | { type: 'hide' }
  | { type: 'show' }
  | { type: 'soldout' }
  | { type: 'promo'; percent: number; days: number }
  | { type: 'clear-promo' };

type ProductPatchInput = Pick<Product, 'price' | 'sale_price' | 'is_available' | 'stock'>;

/** Renvoie les champs à modifier pour un article, ou null s'il est déjà dans l'état voulu. */
export function buildBulkProductPatch(product: ProductPatchInput, action: BulkProductAction, now = Date.now()): Record<string, unknown> | null {
  switch (action.type) {
    case 'hide':
      return product.is_available === false ? null : { is_available: false };
    case 'show':
      return product.is_available !== false ? null : { is_available: true };
    case 'soldout':
      return product.stock <= 0 ? null : { stock: 0 };
    case 'promo': {
      const percent = Math.min(90, Math.max(1, Math.round(action.percent)));
      const salePrice = Math.round(product.price * (1 - percent / 100));
      if (!Number.isFinite(salePrice) || salePrice <= 0 || salePrice >= product.price) return null;
      // Le serveur exige une période : la promotion démarre maintenant et dure `days` jours.
      const days = Math.min(90, Math.max(1, Math.round(action.days)));
      return {
        sale_price: salePrice,
        sale_starts_at: new Date(now - 60_000).toISOString(),
        sale_ends_at: new Date(now + days * 86_400_000).toISOString(),
      };
    }
    case 'clear-promo':
      return product.sale_price === null || product.sale_price === undefined
        ? null
        : { sale_price: null, sale_starts_at: null, sale_ends_at: null };
  }
}
