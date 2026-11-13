/** Image formats accepted by the media pipeline (SVG is deliberately excluded). */
export const SUPPORTED_MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

/** Hard limit applied before an upload reaches object storage. */
export const MAX_PUBLIC_MEDIA_BYTES = 8 * 1024 * 1024;

/**
 * Legacy inline images (base64 stored in the database) are still accepted on write
 * so existing catalogs can be re-saved until every shop has been migrated to R2.
 * The bound keeps a single row from swallowing an unbounded payload.
 */
export const MAX_LEGACY_INLINE_MEDIA_BYTES = 2 * 1024 * 1024;

const LEGACY_INLINE_MEDIA_PATTERN = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([a-z0-9+/=\s]+)$/i;

/** Raised when the API refuses to presign an upload because R2 is not configured. */
export class MediaStorageUnavailableError extends Error {
  readonly code = 'media_storage_unavailable';

  constructor(message = 'Le dépôt de médias n’est pas configuré. Réessayez plus tard.') {
    super(message);
    this.name = 'MediaStorageUnavailableError';
  }
}

export function isSupportedMediaMimeType(value: unknown): value is (typeof SUPPORTED_MEDIA_MIME_TYPES)[number] {
  return typeof value === 'string' && (SUPPORTED_MEDIA_MIME_TYPES as readonly string[]).includes(value.trim().toLowerCase());
}

export function isInlineMediaUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return normalized.length > 0 && (
    /^data:/i.test(normalized)
    || /^blob:/i.test(normalized)
    || /;base64,/i.test(normalized)
  );
}

/**
 * Accepts a bounded legacy base64 data URL. Used only on write/storage paths;
 * display paths keep rejecting every inline payload.
 */
export function isLegacyInlineMediaUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  if (normalized.length > Math.ceil(MAX_LEGACY_INLINE_MEDIA_BYTES * 4 / 3) + 256) return false;
  return LEGACY_INLINE_MEDIA_PATTERN.test(normalized);
}

export function normalizePublicMediaUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (!normalized || isInlineMediaUrl(normalized)) return '';

  if (normalized.startsWith('/')) return normalized;
  if (normalized.startsWith('//')) return `https:${normalized}`;

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    // Ignore invalid URL text and keep it rejected until explicitly set by a valid public media source.
  }

  return '';
}

export function normalizePublicMediaCollection(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const cleaned = value
    .map((item) => normalizePublicMediaUrl(item))
    .filter((item): item is string => item.length > 0);

  return cleaned.length > 0 ? cleaned : undefined;
}

/** Storage normalizer: public URLs first, bounded legacy inline images as a fallback. */
export function normalizeStoredMediaUrl(value: unknown): string {
  const normalized = normalizePublicMediaUrl(value);
  if (normalized) return normalized;
  return isLegacyInlineMediaUrl(value) ? String(value).trim() : '';
}

export function normalizeStoredMediaCollection(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const cleaned = value
    .map((item) => normalizeStoredMediaUrl(item))
    .filter((item): item is string => item.length > 0);

  return cleaned.length > 0 ? cleaned : undefined;
}

export function isStorableMediaUrl(value: unknown): boolean {
  return normalizeStoredMediaUrl(value).length > 0;
}

export function resolvePublicMediaUrl(value: unknown, fallback: string): string {
  return normalizePublicMediaUrl(value) || fallback;
}

export function buildObjectStorageUrl(baseUrl: string, objectKey: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/, '');
  const trimmedKey = objectKey.replace(/^\/+/, '');
  return `${trimmedBase}/${trimmedKey}`;
}

export async function requestMediaUploadUrl(params: {
  shopId: number | string;
  filename?: string;
  contentType?: string;
  purpose?: string;
  folder?: string;
  size?: number;
}): Promise<{ key: string; signedUrl: string; publicUrl: string; }> {
  const response = await fetch(`/api/shops/${params.shopId}/media/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: params.filename || 'upload',
      contentType: params.contentType || 'application/octet-stream',
      purpose: params.purpose || 'media',
      folder: params.folder || 'shops',
      ...(typeof params.size === 'number' && Number.isFinite(params.size) ? { size: params.size } : {}),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : 'Le téléversement n’a pas pu être préparé.';
    if (response.status === 503 || payload?.code === 'media_storage_unavailable') {
      throw new MediaStorageUnavailableError(message);
    }
    throw new Error(message);
  }

  return {
    key: String(payload.key || ''),
    signedUrl: String(payload.signedUrl || ''),
    publicUrl: String(payload.publicUrl || ''),
  };
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const baseName = filename.replace(/\.[^./\\]+$/, '') || 'image';
  const type = blob.type || 'image/jpeg';
  const extension = type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg';
  return new File([blob], `${baseName}.${extension}`, { type, lastModified: Date.now() });
}

async function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('L’image n’a pas pu être lue.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses the picture in the browser before it leaves the device.
 * GIFs are left untouched so animations survive, and any failure falls back
 * to the original file rather than blocking the upload.
 */
async function prepareImageForUpload(file: File, options: { maxDimension?: number; maxSizeKB?: number }): Promise<File> {
  if (typeof document === 'undefined' || typeof File === 'undefined' || file.type === 'image/gif') return file;
  try {
    const { compressImageClientSide } = await import('./format');
    // WebP keeps transparency for PNG/WebP logos; JPEG is smaller for photos.
    const outputType = file.type === 'image/png' || file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const { dataUrl } = await compressImageClientSide(file, options.maxDimension ?? 1400, options.maxSizeKB ?? 250, outputType);
    const compressed = await dataUrlToFile(dataUrl, file.name);
    return compressed.size > 0 && compressed.size < file.size ? compressed : file;
  } catch {
    return file;
  }
}

async function prepareImageThumbnail(file: File, maxDimension: number, maxSizeKB: number): Promise<File> {
  if (typeof document === 'undefined' || typeof File === 'undefined') {
    throw new Error('La miniature ne peut pas être compressée dans cet environnement.');
  }

  const { compressImageClientSide } = await import('./format');
  const { dataUrl } = await compressImageClientSide(file, maxDimension, maxSizeKB, 'image/webp');
  const thumbnail = await dataUrlToFile(dataUrl, file.name);
  if (thumbnail.type !== 'image/webp') {
    throw new Error('Ce navigateur ne permet pas de générer une miniature WebP.');
  }
  if (thumbnail.size <= maxSizeKB * 1024) return thumbnail;
  throw new Error(`La miniature dépasse ${maxSizeKB} Ko. Choisissez une image plus légère.`);
}

export async function uploadPublicMediaFile(file: File, shopId: number | string, options: {
  purpose?: string;
  folder?: string;
  maxDimension?: number;
  maxSizeKB?: number;
} = {}): Promise<string> {
  if (!file || typeof file.name !== 'string') {
    throw new Error('Aucun fichier valide n’a été fourni.');
  }
  if (!isSupportedMediaMimeType(file.type)) {
    throw new Error('Formats acceptés : JPEG, PNG, WebP ou GIF.');
  }
  if (file.size > MAX_PUBLIC_MEDIA_BYTES) {
    throw new Error('L’image ne doit pas dépasser 8 Mo.');
  }

  const prepared = await prepareImageForUpload(file, options);

  return uploadPreparedPublicMediaFile(prepared, shopId, options);
}

async function uploadPreparedPublicMediaFile(file: File, shopId: number | string, options: {
  purpose?: string;
  folder?: string;
} = {}): Promise<string> {
  let uploadDetails: Awaited<ReturnType<typeof requestMediaUploadUrl>>;
  try {
    uploadDetails = await requestMediaUploadUrl({
      shopId,
      filename: file.name,
      contentType: file.type || 'image/jpeg',
      purpose: options.purpose || 'media',
      folder: options.folder || 'shops',
      size: file.size,
    });
  } catch (error) {
    // R2 not configured yet: the compressed base64 fallback keeps the shop usable
    // and stays compatible with the public /media/products resolver.
    if (error instanceof MediaStorageUnavailableError) {
      return fileToDataUrl(file);
    }
    throw error;
  }

  const uploadResponse = await fetch(uploadDetails.signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error('Le fichier n’a pas pu être téléversé sur le dépôt public.');
  }

  return uploadDetails.publicUrl;
}

export async function uploadPublicMediaVariants(file: File, shopId: number | string, options: {
  purpose?: string;
  folder?: string;
  maxDimension?: number;
  maxSizeKB?: number;
  thumbnailDimension?: number;
  thumbnailSizeKB?: number;
} = {}): Promise<{ imageUrl: string; thumbnailUrl: string }> {
  if (!file || typeof file.name !== 'string') {
    throw new Error('Aucun fichier valide n’a été fourni.');
  }
  if (!isSupportedMediaMimeType(file.type)) {
    throw new Error('Formats acceptés : JPEG, PNG, WebP ou GIF.');
  }
  if (file.size > MAX_PUBLIC_MEDIA_BYTES) {
    throw new Error('L’image ne doit pas dépasser 8 Mo.');
  }

  const image = await prepareImageForUpload(file, options);
  const thumbnail = await prepareImageThumbnail(
    file,
    options.thumbnailDimension ?? 320,
    options.thumbnailSizeKB ?? 35,
  );
  const imageUrl = await uploadPreparedPublicMediaFile(image, shopId, options);
  const thumbnailUrl = thumbnail === image
    ? imageUrl
    : await uploadPreparedPublicMediaFile(thumbnail, shopId, {
      folder: options.folder,
      purpose: options.purpose ? `${options.purpose}-thumbnail` : 'product-main-thumbnail',
    });

  return { imageUrl, thumbnailUrl };
}

export function createMediaStorageAdapter() {
  return {
    normalizeUrl: normalizePublicMediaUrl,
    normalizeCollection: normalizePublicMediaCollection,
    normalizeStoredUrl: normalizeStoredMediaUrl,
    normalizeStoredCollection: normalizeStoredMediaCollection,
    resolveUrl: resolvePublicMediaUrl,
    buildObjectUrl: buildObjectStorageUrl,
    requestUploadUrl: requestMediaUploadUrl,
    uploadFile: uploadPublicMediaFile,
  } as const;
}
