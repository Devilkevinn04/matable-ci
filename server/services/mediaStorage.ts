import { randomUUID } from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  MAX_PUBLIC_MEDIA_BYTES,
  MediaStorageUnavailableError,
  buildObjectStorageUrl,
  createMediaStorageAdapter,
  isSupportedMediaMimeType,
  normalizePublicMediaCollection,
  normalizePublicMediaUrl,
  normalizeStoredMediaCollection,
  normalizeStoredMediaUrl,
} from '../../src/utils/media.ts';

const ALLOWED_MEDIA_PURPOSES = new Set(['media', 'logo', 'banner', 'product-main', 'lookbook', 'gallery']);
const ALLOWED_MEDIA_FOLDERS = new Set(['shops']);

/** Invalid upload request (400), as opposed to an unavailable storage backend (503). */
export class MediaUploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaUploadValidationError';
  }
}

const envValue = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
};

export function getMediaStorageConfig() {
  const endpoint = envValue('R2_ENDPOINT', 'CLOUDFLARE_R2_ENDPOINT', 'AWS_S3_ENDPOINT', 'AWS_ENDPOINT_URL_S3');
  const publicBaseUrl = envValue('R2_PUBLIC_BASE_URL', 'CLOUDFLARE_R2_PUBLIC_URL', 'R2_PUBLIC_URL');
  const bucket = envValue('R2_BUCKET', 'CLOUDFLARE_R2_BUCKET', 'AWS_S3_BUCKET', 'S3_BUCKET');
  const accessKeyId = envValue('R2_ACCESS_KEY_ID', 'CLOUDFLARE_R2_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID');
  const secretAccessKey = envValue('R2_SECRET_ACCESS_KEY', 'CLOUDFLARE_R2_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY');
  const region = envValue('R2_REGION', 'CLOUDFLARE_R2_REGION', 'AWS_REGION', 'AWS_DEFAULT_REGION') || 'auto';

  // A public base URL is mandatory: without it the signed upload succeeds but the
  // returned URL would be unusable, silently breaking the storefront.
  if (!bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) {
    return null;
  }

  return {
    endpoint: endpoint || 'https://r2.cloudflarestorage.com',
    publicBaseUrl,
    bucket,
    accessKeyId,
    secretAccessKey,
    region,
  };
}

export function isMediaStorageConfigured(): boolean {
  return Boolean(getMediaStorageConfig());
}

export function validateMediaUploadRequest(body: unknown): {
  filename: string;
  contentType: string;
  purpose: string;
  folder: string;
  size?: number;
} {
  const { filename, contentType, purpose, folder, size } = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  if (typeof filename !== 'string' || !filename.trim()) {
    throw new MediaUploadValidationError('Le nom de fichier est requis pour téléverser une image.');
  }
  if (!isSupportedMediaMimeType(contentType)) {
    throw new MediaUploadValidationError('Formats acceptés : JPEG, PNG, WebP ou GIF.');
  }
  const numericSize = size === undefined || size === null ? undefined : Number(size);
  if (numericSize !== undefined) {
    if (!Number.isSafeInteger(numericSize) || numericSize <= 0 || numericSize > MAX_PUBLIC_MEDIA_BYTES) {
      throw new MediaUploadValidationError('L’image ne doit pas dépasser 8 Mo.');
    }
  }

  const rawPurpose = typeof purpose === 'string' ? purpose.trim() : 'media';
  const safePurpose = rawPurpose || 'media';
  if (!ALLOWED_MEDIA_PURPOSES.has(safePurpose)) {
    throw new MediaUploadValidationError('Destination de média non autorisée.');
  }

  const rawFolder = typeof folder === 'string' ? folder.trim() : 'shops';
  const safeFolder = rawFolder || 'shops';
  if (!ALLOWED_MEDIA_FOLDERS.has(safeFolder)) {
    throw new MediaUploadValidationError('Dossier de média non autorisé.');
  }

  return {
    filename: filename.trim(),
    contentType: contentType.trim().toLowerCase(),
    purpose: safePurpose,
    folder: safeFolder,
    size: numericSize,
  };
}

export async function createMediaUploadUrl(input: {
  shopId: number | string;
  filename?: string;
  contentType?: string;
  purpose?: string;
  folder?: string;
  size?: number;
}): Promise<{ key: string; signedUrl: string; publicUrl: string }> {
  const config = getMediaStorageConfig();
  if (!config) {
    throw new MediaStorageUnavailableError(
      'Le dépôt de médias n’est pas configuré. Définissez R2_BUCKET, R2_PUBLIC_BASE_URL, R2_ACCESS_KEY_ID et R2_SECRET_ACCESS_KEY.',
    );
  }

  const safeName = (input.filename || 'upload').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'upload';
  const purpose = (input.purpose || 'media').replace(/[^a-zA-Z0-9._/-]+/g, '-');
  const folder = (input.folder || 'shops').replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9._/-]+/g, '-') || 'shops';
  const objectKey = `${folder}/${purpose}/${input.shopId}/${Date.now()}-${randomUUID()}-${safeName}`;

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    ContentType: input.contentType || 'application/octet-stream',
    CacheControl: 'public, max-age=31536000, immutable',
    // Signing the length binds the upload to the size validated by the API.
    ...(typeof input.size === 'number' && Number.isFinite(input.size) && input.size > 0
      ? { ContentLength: input.size }
      : {}),
  });

  const signedUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  return {
    key: objectKey,
    signedUrl,
    publicUrl: buildObjectStorageUrl(config.publicBaseUrl, objectKey),
  };
}

export const mediaStorage = createMediaStorageAdapter();

export const normalizeMediaUrl = normalizePublicMediaUrl;
export const normalizeMediaCollection = normalizePublicMediaCollection;
export const normalizeStoredMediaUrlValue = normalizeStoredMediaUrl;
export const normalizeStoredMediaCollectionValue = normalizeStoredMediaCollection;
export const buildMediaObjectUrl = buildObjectStorageUrl;
export { MediaStorageUnavailableError };
