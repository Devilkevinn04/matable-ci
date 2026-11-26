import type { ShopCategory } from '../types';

export interface ProductDisplayImage {
  src: string;
  thumbnailSrc: string;
  alt: string;
  fit: 'contain' | 'cover';
}

type ProductMedia = {
  image_url?: string;
  thumbnail_url?: string;
  lookbook_image?: string;
  gallery_images?: string[];
};

/**
 * Single source of truth for a product's photos: the main photo first, then the
 * lookbook and the gallery. Desktop and mobile storefronts must show the same
 * pictures even when the merchant only filled the secondary photo fields.
 */
export function getProductDisplayImages(
  product: ProductMedia,
  category: ShopCategory,
  productTitle: string,
): ProductDisplayImage[] {
  const title = productTitle.trim() || 'Produit local';
  const fit = category === 'fashion' ? 'contain' as const : 'cover' as const;
  return [
    ...(product.image_url ? [{ src: product.image_url, thumbnailSrc: product.thumbnail_url || product.image_url, alt: title, fit }] : []),
    ...(product.lookbook_image ? [{ src: product.lookbook_image, thumbnailSrc: product.lookbook_image, alt: `Lookbook de ${title}`, fit: 'cover' as const }] : []),
    ...(product.gallery_images || []).map((src, index) => ({ src, thumbnailSrc: src, alt: `Photo ${index + 1} de ${title}`, fit })),
  ];
}

/** Photo used by compact cards and option sheets, where only one image fits. */
export function getProductCoverImage(
  product: ProductMedia,
  category: ShopCategory,
  productTitle: string,
): ProductDisplayImage | undefined {
  return getProductDisplayImages(product, category, productTitle)[0];
}
