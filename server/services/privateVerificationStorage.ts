import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const MAX_VERIFICATION_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const VERIFICATION_DOCUMENT_TYPES = [
  'storefront',
  'interior',
  'products',
  'identity_front',
  'identity_back',
  'identity_passport',
] as const;
export type VerificationDocumentType = typeof VERIFICATION_DOCUMENT_TYPES[number];

const IMAGE_SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/jpeg': (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  'image/png': (bytes) => bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a,
  'image/webp': (bytes) => bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP',
};

export class PrivateVerificationStorageUnavailableError extends Error {
  constructor() {
    super('Le stockage privé des justificatifs n’est pas configuré.');
    this.name = 'PrivateVerificationStorageUnavailableError';
  }
}

export class PrivateVerificationDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivateVerificationDocumentError';
  }
}

function envValue(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function getPrivateVerificationStorageConfig() {
  const bucket = envValue('R2_PRIVATE_BUCKET');
  const publicBucket = envValue('R2_BUCKET', 'CLOUDFLARE_R2_BUCKET', 'AWS_S3_BUCKET', 'S3_BUCKET');
  const accessKeyId = envValue('R2_PRIVATE_ACCESS_KEY_ID');
  const secretAccessKey = envValue('R2_PRIVATE_SECRET_ACCESS_KEY');
  const endpoint = envValue('R2_PRIVATE_ENDPOINT', 'R2_ENDPOINT', 'CLOUDFLARE_R2_ENDPOINT', 'AWS_S3_ENDPOINT', 'AWS_ENDPOINT_URL_S3');

  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint || bucket === publicBucket) return null;
  return { bucket, accessKeyId, secretAccessKey, endpoint, region: envValue('R2_REGION') || 'auto' };
}

function getClient() {
  const config = getPrivateVerificationStorageConfig();
  if (!config) throw new PrivateVerificationStorageUnavailableError();
  return {
    bucket: config.bucket,
    client: new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    }),
  };
}

export function isVerificationDocumentType(value: unknown): value is VerificationDocumentType {
  return typeof value === 'string' && (VERIFICATION_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function matchesVerificationImageSignature(contentType: string, bytes: Uint8Array): boolean {
  return IMAGE_SIGNATURES[contentType]?.(bytes) || false;
}

export function validateVerificationUpload(input: { contentType: unknown; size: unknown }): {
  contentType: string;
  size: number;
} {
  const contentType = typeof input.contentType === 'string' ? input.contentType.trim().toLowerCase() : '';
  const size = Number(input.size);
  if (!Object.hasOwn(IMAGE_SIGNATURES, contentType)) {
    throw new PrivateVerificationDocumentError('Formats acceptés : JPEG, PNG ou WebP. Les documents PDF ne sont pas acceptés.');
  }
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_VERIFICATION_DOCUMENT_BYTES) {
    throw new PrivateVerificationDocumentError('Chaque image doit peser au maximum 10 Mo.');
  }
  return { contentType, size };
}

export async function createVerificationDocumentUpload(shopId: number, contentType: string, size: number) {
  const { bucket, client } = getClient();
  const key = `merchant-verification/${shopId}/${randomUUID()}`;
  const uploadKey = `merchant-verification-staging/${shopId}/${randomUUID()}`;
  const signedUrl = await getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket,
    Key: uploadKey,
    ContentType: contentType,
    ContentLength: size,
    CacheControl: 'private, no-store, max-age=0',
  }), { expiresIn: 600 });
  return { key, uploadKey, signedUrl };
}

export async function verifyVerificationDocument(key: string, contentType: string, size: number): Promise<Buffer> {
  const { bucket, client } = getClient();
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  if (head.ContentLength !== size || head.ContentType?.toLowerCase() !== contentType) {
    throw new PrivateVerificationDocumentError('Le fichier reçu ne correspond pas aux caractéristiques annoncées.');
  }
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = response.Body ? await response.Body.transformToByteArray() : new Uint8Array();
  if (!matchesVerificationImageSignature(contentType, bytes)) {
    throw new PrivateVerificationDocumentError('Le contenu du fichier ne correspond pas à une image acceptée.');
  }
  const { default: sharp } = await import('sharp');
  const source = sharp(bytes, { failOn: 'error', limitInputPixels: 24_000_000 });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height || metadata.width > 8000 || metadata.height > 8000) {
    throw new PrivateVerificationDocumentError('La résolution de l’image est trop grande ou invalide.');
  }
  const pipeline = source.rotate();
  if (contentType === 'image/jpeg') pipeline.jpeg({ quality: 90 });
  else if (contentType === 'image/png') pipeline.png({ compressionLevel: 8 });
  else pipeline.webp({ quality: 90 });
  const sanitized = await pipeline.toBuffer();
  if (sanitized.length === 0 || sanitized.length > MAX_VERIFICATION_DOCUMENT_BYTES) {
    throw new PrivateVerificationDocumentError('L’image traitée dépasse la taille maximale de 10 Mo.');
  }
  return sanitized;
}

export async function storeSanitizedVerificationDocument(key: string, contentType: string, sanitized: Buffer): Promise<void> {
  const { bucket, client } = getClient();
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: sanitized,
    ContentLength: sanitized.length,
    ContentType: contentType,
    CacheControl: 'private, no-store, max-age=0',
  }));
}

export async function createVerificationDocumentViewUrl(key: string, contentType: string): Promise<string> {
  const { bucket, client } = getClient();
  return getSignedUrl(client, new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentType: contentType,
    ResponseContentDisposition: 'inline; filename="justificatif-image"',
    ResponseCacheControl: 'private, no-store, max-age=0',
  }), { expiresIn: 60 });
}

export async function deleteVerificationDocumentObject(key: string): Promise<void> {
  const { bucket, client } = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
