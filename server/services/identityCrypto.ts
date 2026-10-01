import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

const DEVELOPMENT_ONLY_SECRET = 'matable-kyc-local-development-key-not-for-production';

function getMasterKey(): Buffer {
  const configured = String(process.env.KYC_ENCRYPTION_KEY || '').trim();
  if (process.env.NODE_ENV === 'production' && configured.length < 32) {
    throw new Error('KYC_ENCRYPTION_KEY doit être configurée avec au moins 32 caractères en production.');
  }
  const secret = configured || DEVELOPMENT_ONLY_SECRET;
  return createHash('sha256').update(secret).digest();
}

function deriveKey(purpose: string): Buffer {
  return createHmac('sha256', getMasterKey()).update(`matable-kyc:${purpose}`).digest();
}

export function hashDocumentNumber(documentNumber: string): string {
  const normalized = documentNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.length < 6 || normalized.length > 32) throw new Error('Numéro de document invalide.');
  return createHmac('sha256', deriveKey('document-lookup')).update(normalized).digest('hex');
}

export function encryptKycValue(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey('document-storage'), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptKycValue(value: string): string {
  const [version, ivBase64, tagBase64, ciphertextBase64] = value.split(':');
  if (version !== 'v1' || !ivBase64 || !tagBase64 || !ciphertextBase64) throw new Error('Donnée KYC chiffrée invalide.');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey('document-storage'), Buffer.from(ivBase64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextBase64, 'base64')), decipher.final()]).toString('utf8');
}

export function isKycEncryptionConfigured() {
  return process.env.NODE_ENV !== 'production' || String(process.env.KYC_ENCRYPTION_KEY || '').trim().length >= 32;
}
