import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPrivateVerificationStorageConfig,
  isVerificationDocumentType,
  matchesVerificationImageSignature,
  PrivateVerificationDocumentError,
  validateVerificationUpload,
} from '../server/services/privateVerificationStorage.ts';

const storageKeys = [
  'R2_PRIVATE_BUCKET',
  'R2_PRIVATE_ACCESS_KEY_ID',
  'R2_PRIVATE_SECRET_ACCESS_KEY',
  'R2_PRIVATE_ENDPOINT',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_REGION',
];

test('private verification storage requires a distinct private bucket', () => {
  const saved = new Map(storageKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of storageKeys) delete process.env[key];
    process.env.R2_PRIVATE_BUCKET = 'matable-private';
    process.env.R2_PRIVATE_ACCESS_KEY_ID = 'private-key';
    process.env.R2_PRIVATE_SECRET_ACCESS_KEY = 'private-secret';
    process.env.R2_ENDPOINT = 'https://account.r2.cloudflarestorage.com';
    process.env.R2_BUCKET = 'matable-public';
    assert.deepEqual(getPrivateVerificationStorageConfig(), {
      bucket: 'matable-private',
      accessKeyId: 'private-key',
      secretAccessKey: 'private-secret',
      endpoint: 'https://account.r2.cloudflarestorage.com',
      region: 'auto',
    });
    process.env.R2_PRIVATE_BUCKET = 'matable-public';
    assert.equal(getPrivateVerificationStorageConfig(), null);
  } finally {
    for (const key of storageKeys) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('manual verification accepts only expected document types and bounded raster uploads', () => {
  assert.equal(isVerificationDocumentType('identity_front'), true);
  assert.equal(isVerificationDocumentType('identity_back'), true);
  assert.equal(isVerificationDocumentType('passport'), false);
  assert.deepEqual(validateVerificationUpload({ contentType: 'IMAGE/PNG', size: 1024 }), { contentType: 'image/png', size: 1024 });
  for (const input of [
    { contentType: 'application/pdf', size: 1024 },
    { contentType: 'image/svg+xml', size: 1024 },
    { contentType: 'image/jpeg', size: 0 },
    { contentType: 'image/jpeg', size: 10 * 1024 * 1024 + 1 },
  ]) {
    assert.throws(() => validateVerificationUpload(input), PrivateVerificationDocumentError);
  }
});

test('manual verification rejects file content whose magic bytes disagree with the declared image type', () => {
  assert.equal(matchesVerificationImageSignature('image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0x00])), true);
  assert.equal(matchesVerificationImageSignature('image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(matchesVerificationImageSignature('image/webp', new TextEncoder().encode('RIFF0000WEBP')), true);
  assert.equal(matchesVerificationImageSignature('image/png', new TextEncoder().encode('<svg>')), false);
});
