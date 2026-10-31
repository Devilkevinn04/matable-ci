import { createHash } from 'node:crypto';

/**
 * Product photos are stored as base64 data URLs (compressed in the browser at upload).
 * Sending them inside JSON made the public catalog weigh ~1.4 MB for a handful of shops,
 * re-downloaded on every visit. Public payloads now carry a short, cacheable URL instead,
 * and this module serves the decoded bytes behind it.
 */
export const PUBLIC_PRODUCT_IMAGE_PATH = '/media/products';

const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([a-z0-9+/=\s]+)$/i;
const FILE_PATTERN = /^(\d{1,3})-([a-f0-9]{20})\.(jpg|png|webp|gif)$/;

/** Content fingerprint: changes when the photo changes, so URLs can be cached forever. */
export function productImageFingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 20);
}

function extensionFor(mime: string): 'jpg' | 'png' | 'webp' | 'gif' {
  const subtype = mime.split('/')[1]?.toLowerCase();
  if (subtype === 'png' || subtype === 'webp' || subtype === 'gif') return subtype;
  return 'jpg';
}

/**
 * Returns a public URL for a stored product photo. `slot` 0 is the main photo,
 * 1..n are gallery photos. Non data-URL values (https links, empty) are returned as is.
 */
export function toPublicProductImageUrl(productId: number, value: unknown, slot = 0, origin = ''): string {
  const image = typeof value === 'string' ? value : '';
  const match = DATA_URL_PATTERN.exec(image);
  if (!match && /^data:/i.test(image)) return '';
  if (!match || !Number.isInteger(productId) || productId <= 0) return image;
  return `${origin}${PUBLIC_PRODUCT_IMAGE_PATH}/${productId}/${slot}-${productImageFingerprint(image)}.${extensionFor(match[1])}`;
}

function parseGallery(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Rewrites the main photo and gallery of a product for a public (non-merchant) response. */
export function withPublicProductImages<T extends { id: number; image_url?: unknown; gallery_images?: unknown; lookbook_image?: unknown }>(product: T): T {
  const gallery = parseGallery(product.gallery_images);
  return {
    ...product,
    image_url: toPublicProductImageUrl(product.id, product.image_url, 0),
    ...(product.lookbook_image
      ? { lookbook_image: toPublicProductImageUrl(product.id, product.lookbook_image, 999) }
      : {}),
    ...(gallery.length > 0
      ? { gallery_images: gallery.map((image, index) => toPublicProductImageUrl(product.id, image, index + 1)) }
      : {}),
  };
}

export interface DecodedProductImage {
  contentType: string;
  body: Buffer;
  etag: string;
}

/**
 * Resolves a `/media/products/:productId/:file` request against the stored row.
 * Returns null unless the slot exists, holds a data URL and its fingerprint matches,
 * so only URLs previously handed out in a public payload can be fetched.
 */
export function resolveProductImageRequest(
  file: string,
  row: { image_url?: unknown; gallery_images?: unknown; lookbook_image?: unknown } | undefined,
): DecodedProductImage | null {
  const parsed = FILE_PATTERN.exec(file);
  if (!parsed || !row) return null;
  const slot = Number(parsed[1]);
  const value = slot === 0
    ? row.image_url
    : slot === 999
      ? row.lookbook_image
      : parseGallery(row.gallery_images)[slot - 1];
  if (typeof value !== 'string') return null;
  const match = DATA_URL_PATTERN.exec(value);
  if (!match || productImageFingerprint(value) !== parsed[2]) return null;
  const contentType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  return { contentType, body: Buffer.from(match[2].replace(/\s/g, ''), 'base64'), etag: `"${parsed[2]}"` };
}
