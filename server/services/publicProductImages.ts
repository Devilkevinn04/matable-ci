import { createHash } from 'node:crypto';
import { getProductMediaObjectKey } from './mediaStorage.ts';

/**
 * Product photos are stored as base64 data URLs or object-storage URLs.
 * Public payloads carry an authorized media URL instead of exposing stored values.
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

function extensionForStoredUrl(value: string): 'jpg' | 'png' | 'webp' | 'gif' {
  try {
    const extension = new URL(value).pathname.split('.').pop()?.toLowerCase();
    if (extension === 'png' || extension === 'webp' || extension === 'gif') return extension;
    if (extension === 'jpg' || extension === 'jpeg') return 'jpg';
  } catch {
    return 'jpg';
  }
  return 'jpg';
}

/**
 * Returns a public URL for a stored product photo. `slot` 0 is the main photo,
 * 1..n are gallery photos. Only supported inline or configured product-storage images are returned.
 */
export function toPublicProductImageUrl(
  productId: number,
  value: unknown,
  slot = 0,
  origin = '',
  ageVerificationToken?: string,
): string {
  const image = typeof value === 'string' ? value : '';
  const match = DATA_URL_PATTERN.exec(image);
  if (!match && /^data:/i.test(image)) return '';
  if (!Number.isInteger(productId) || productId <= 0) return '';
  if (!match && !getProductMediaObjectKey(image)) return '';
  const ageTokenQuery = ageVerificationToken ? `?age_token=${encodeURIComponent(ageVerificationToken)}` : '';
  const extension = match ? extensionFor(match[1]) : extensionForStoredUrl(image);
  return `${origin}${PUBLIC_PRODUCT_IMAGE_PATH}/${productId}/${slot}-${productImageFingerprint(image)}.${extension}${ageTokenQuery}`;
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
export function withPublicProductImages<T extends { id: number; image_url?: unknown; thumbnail_url?: unknown; gallery_images?: unknown; lookbook_image?: unknown }>(
  product: T,
  options: { ageVerificationToken?: string } = {},
): T {
  const gallery = parseGallery(product.gallery_images);
  const ageVerificationToken = options.ageVerificationToken;
  return {
    ...product,
    image_url: toPublicProductImageUrl(product.id, product.image_url, 0, '', ageVerificationToken),
    thumbnail_url: toPublicProductImageUrl(product.id, product.thumbnail_url || product.image_url, 998, '', ageVerificationToken),
    ...(product.lookbook_image
      ? { lookbook_image: toPublicProductImageUrl(product.id, product.lookbook_image, 999, '', ageVerificationToken) }
      : {}),
    ...(gallery.length > 0
      ? { gallery_images: gallery.map((image, index) => toPublicProductImageUrl(product.id, image, index + 1, '', ageVerificationToken)) }
      : {}),
  };
}

export interface DecodedProductImage {
  contentType: string;
  body: Buffer;
  etag: string;
}

function storedImageForRequest(
  file: string,
  row: { image_url?: unknown; thumbnail_url?: unknown; gallery_images?: unknown; lookbook_image?: unknown } | undefined,
): { value: string; payload: string } | null {
  const parsed = FILE_PATTERN.exec(file);
  if (!parsed || !row) return null;
  const slot = Number(parsed[1]);
  const value = slot === 0
    ? row.image_url
    : slot === 998
      ? row.thumbnail_url || row.image_url
      : slot === 999
        ? row.lookbook_image
        : parseGallery(row.gallery_images)[slot - 1];
  if (typeof value !== 'string' || productImageFingerprint(value) !== parsed[2]) return null;
  return { value, payload: parsed[2] };
}

export function resolveProductImageValue(
  file: string,
  row: { image_url?: unknown; thumbnail_url?: unknown; gallery_images?: unknown; lookbook_image?: unknown } | undefined,
): string | null {
  return storedImageForRequest(file, row)?.value ?? null;
}

/**
 * Resolves a `/media/products/:productId/:file` request against the stored row.
 * Returns null unless the slot contains a supported inline image with a matching fingerprint.
 */
export function resolveProductImageRequest(
  file: string,
  row: { image_url?: unknown; thumbnail_url?: unknown; gallery_images?: unknown; lookbook_image?: unknown } | undefined,
): DecodedProductImage | null {
  const stored = storedImageForRequest(file, row);
  if (!stored) return null;
  const match = DATA_URL_PATTERN.exec(stored.value);
  if (!match) return null;
  const contentType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  return { contentType, body: Buffer.from(match[2].replace(/\s/g, ''), 'base64'), etag: `"${stored.payload}"` };
}

/** Widths the storefront asks for (`?w=`); anything else gets the stored original. */
export const PRODUCT_IMAGE_WIDTHS = [320, 640, 960] as const;
const MAX_CACHED_VARIANTS = 300;
const variantCache = new Map<string, DecodedProductImage>();

export function parseRequestedImageWidth(value: unknown): number | null {
  const width = Number(value);
  return (PRODUCT_IMAGE_WIDTHS as readonly number[]).includes(width) ? width : null;
}

/**
 * Returns a narrower WebP copy of a stored photo. Cards show photos at 150-400 px wide,
 * while legacy uploads are up to 1000 px: phones were downloading ~1 MB of pixels per page.
 * Results are kept in a small in-memory cache; the URL is immutable so CDNs and browsers
 * cache it for a year as well. Falls back to the original if resizing fails.
 */
export async function resizeProductImage(image: DecodedProductImage, width: number): Promise<DecodedProductImage> {
  const key = `${image.etag}:${width}`;
  const cached = variantCache.get(key);
  if (cached) return cached;
  try {
    const { default: sharp } = await import('sharp');
    const body = await sharp(image.body, { failOn: 'none' })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    const variant: DecodedProductImage = {
      contentType: 'image/webp',
      body: body.length < image.body.length ? body : image.body,
      etag: `"${image.etag.replace(/"/g, '')}-w${width}"`,
    };
    if (body.length >= image.body.length) variant.contentType = image.contentType;
    if (variantCache.size >= MAX_CACHED_VARIANTS) variantCache.delete(variantCache.keys().next().value as string);
    variantCache.set(key, variant);
    return variant;
  } catch {
    return image;
  }
}
