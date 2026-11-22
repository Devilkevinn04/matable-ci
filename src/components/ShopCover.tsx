// Couverture d’une boutique dans les listes : sa bannière si elle en a une,
// sinon une mosaïque de ses propres photos produits, sinon un visuel de catégorie.
import { getBannerImageForDisplay, normalizeProductImage } from '../utils/categoryDefaults';
import { getResponsiveImageProps } from '../utils/responsiveImages';
import { CategoryIcon } from './CategoryIcon';

export interface ShopCoverShop {
  category?: string;
  theme_color?: string;
  theme_config?: { custom_banner_url?: string; primary_color?: string };
  products_preview?: { image_url?: string; thumbnail_url?: string }[];
}

export function getShopBanner(shop: ShopCoverShop): string {
  return shop.theme_config?.custom_banner_url
    ? getBannerImageForDisplay(shop.theme_config.custom_banner_url, shop.category)
    : '';
}

export function getShopProductPhotos(shop: ShopCoverShop, max = 3): string[] {
  return (shop.products_preview || [])
    .map((product) => normalizeProductImage(product.thumbnail_url || product.image_url))
    .filter(Boolean)
    .slice(0, max);
}

/** Vrai si la boutique a de quoi s’afficher en photo (bannière ou produit). */
export function hasShopVisual(shop: ShopCoverShop): boolean {
  return Boolean(getShopBanner(shop) || getShopProductPhotos(shop, 1).length);
}

const hideOnError = (event: React.SyntheticEvent<HTMLImageElement>) => { event.currentTarget.style.visibility = 'hidden'; };

export function ShopCover({ shop, className = '', sizes = '(max-width: 360px) 92vw, (max-width: 1023px) 50vw, 33vw' }: { shop: ShopCoverShop; className?: string; sizes?: string }) {
  const banner = getShopBanner(shop);
  const photos = banner ? [] : getShopProductPhotos(shop);
  const color = shop.theme_color || shop.theme_config?.primary_color || '#087F62';

  if (banner) {
    return (
      <span className={`relative block overflow-hidden ${className}`} style={{ backgroundColor: `${color}30` }}>
        <img {...getResponsiveImageProps(banner)} sizes={sizes} alt="" loading="lazy" onError={hideOnError} className="absolute inset-0 h-full w-full object-cover" />
      </span>
    );
  }

  if (photos.length > 0) {
    // 1 photo : pleine largeur ; 2 : côte à côte ; 3 : une grande à gauche, deux petites à droite.
    const layout = photos.length === 1 ? 'grid-cols-1' : photos.length === 2 ? 'grid-cols-2' : 'grid-cols-[1.4fr_1fr] grid-rows-2';
    return (
      <span className={`grid gap-0.5 overflow-hidden bg-white ${layout} ${className}`}>
        {photos.map((url, index) => (
          <span key={url} className={`relative min-h-0 overflow-hidden ${photos.length === 3 && index === 0 ? 'row-span-2' : ''}`} style={{ backgroundColor: `${color}20` }}>
            <img {...getResponsiveImageProps(url, 320)} sizes={photos.length === 1 || (photos.length === 3 && index === 0) ? sizes : '(max-width: 640px) 33vw, 20vw'} alt="" loading="lazy" onError={hideOnError} className="absolute inset-0 h-full w-full object-cover" />
          </span>
        ))}
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={`mt-photo-fallback relative flex items-center justify-center ${className}`} style={{ color, backgroundColor: `${color}22` }}>
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/80 shadow-[0_6px_16px_-8px_currentColor]"><CategoryIcon category={shop.category} className="h-7 w-7" /></span>
    </span>
  );
}
