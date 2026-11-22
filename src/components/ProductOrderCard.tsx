import React from 'react';
import { Link } from 'react-router-dom';
import type { FeedProduct } from './ProductNewsFeed';
import { CategoryProductImage } from './CategoryProductImage';
import { formatFCFA } from '../utils/format';
import { getActiveProductPrice, getProductSaleStatus } from '../utils/productPricing';
import { getDiscoveryCityLabel } from '../utils/discoverySeo';

export type OrderableProduct = Pick<FeedProduct, 'id' | 'title' | 'price' | 'sale_price' | 'sale_starts_at' | 'sale_ends_at' | 'image_url' | 'thumbnail_url' | 'created_at'>
  & { stock: number | null; shop: { name: string; slug: string; category?: string; city?: string } };

/** Carte d’un produit à commander : toute la carte mène à la fiche, dans la vitrine de la boutique. */
export const ProductOrderCard: React.FC<{ product: OrderableProduct; isOpen: boolean; now: number; className?: string }> = ({ product, isOpen, now, className = '' }) => {
  const isPromotion = getProductSaleStatus(product, now) === 'active';
  const price = getActiveProductPrice(product, now);
  const discount = isPromotion ? Math.round((1 - price / product.price) * 100) : 0;
  const badge = discount > 0
    ? `−${discount} %`
    : product.stock !== null && product.stock > 0 && product.stock <= 3 ? `Plus que ${product.stock}` : '';
  const city = product.shop.city ? getDiscoveryCityLabel(product.shop.city) : '';
  return (
    <Link
      to={`/${encodeURIComponent(product.shop.slug)}#product-${product.id}`}
      className={`mt-press flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#e7e2d9] bg-white ${className}`}
    >
      <span className="relative block aspect-[6/5] shrink-0 overflow-hidden">
        <CategoryProductImage imageUrl={product.thumbnail_url || product.image_url} category={product.shop.category} title={product.title} showFallbackTitle={false} sizes="(max-width: 639px) 50vw, 25vw" className="!absolute inset-0 h-full w-full" />
        {badge && <span className={`absolute left-2 top-2 rounded-full px-2 py-1 text-[11px] font-extrabold ${discount > 0 ? 'bg-[#c2410c] text-white' : 'bg-white text-[#8a3b12]'}`}>{badge}</span>}
      </span>
      <span className="flex flex-1 flex-col p-2.5">
        <strong className="line-clamp-2 text-sm font-extrabold leading-[1.15rem] text-[#173c32]">{product.title}</strong>
        <span className="mt-0.5 flex min-w-0 text-xs text-[var(--mt-gray-600)]"><span className="truncate">{product.shop.name}</span>{city && <span className="shrink-0 whitespace-pre"> · {city}</span>}</span>
        <span className="mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-1">
          <span className={`text-base font-black ${isPromotion ? 'text-[#c2410c]' : 'text-[#173c32]'}`}>{formatFCFA(price)}</span>
          {isPromotion && <del className="text-xs font-semibold text-[var(--mt-gray-600)]">{formatFCFA(product.price)}</del>}
        </span>
        {!isOpen && <span className="text-xs font-semibold text-[#8a5a12]">Fermée pour le moment</span>}
        <span className={`mt-2 flex min-h-11 items-center justify-center rounded-xl text-sm font-extrabold ${isOpen ? 'bg-[var(--mt-green-deep)] text-white' : 'border border-[#cbd9d0] text-[var(--mt-green-deep)]'}`}>
          {isOpen ? 'Choisir' : 'Voir'}
        </span>
      </span>
    </Link>
  );
};
