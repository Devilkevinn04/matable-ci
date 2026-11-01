import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LEGACY_INLINE_MEDIA_BYTES,
  MAX_PUBLIC_MEDIA_BYTES,
  MediaStorageUnavailableError,
  buildObjectStorageUrl,
  createMediaStorageAdapter,
  isInlineMediaUrl,
  isLegacyInlineMediaUrl,
  isStorableMediaUrl,
  isSupportedMediaMimeType,
  normalizePublicMediaUrl,
  normalizeStoredMediaCollection,
  normalizeStoredMediaUrl,
} from '../src/utils/media';

test('public-media helpers reject inline payloads and preserve valid public URLs', () => {
  assert.equal(isInlineMediaUrl('data:image/webp;base64,AAAA'), true);
  assert.equal(isInlineMediaUrl('blob:https://example.com/file'), true);
  assert.equal(normalizePublicMediaUrl('https://cdn.example.com/images/logo.png'), 'https://cdn.example.com/images/logo.png');
  assert.equal(normalizePublicMediaUrl('data:image/png;base64,AAAA'), '');
  assert.equal(normalizePublicMediaUrl('blob:https://example.com/logo.png'), '');
  assert.equal(buildObjectStorageUrl('https://cdn.example.com', 'shops/42/logo.png'), 'https://cdn.example.com/shops/42/logo.png');
});

test('only raster image formats are accepted for public media uploads', () => {
  for (const mime of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'IMAGE/PNG']) {
    assert.equal(isSupportedMediaMimeType(mime), true, mime);
  }
  for (const mime of ['image/svg+xml', 'text/html', 'application/pdf', '', undefined, null]) {
    assert.equal(isSupportedMediaMimeType(mime), false, String(mime));
  }
  assert.equal(MAX_PUBLIC_MEDIA_BYTES, 8 * 1024 * 1024);
});

test('stored media normalizers keep bounded legacy base64 images for write paths', () => {
  const legacy = 'data:image/jpeg;base64,AAAA';
  assert.equal(isLegacyInlineMediaUrl(legacy), true);
  assert.equal(isStorableMediaUrl(legacy), true);
  assert.equal(normalizeStoredMediaUrl(legacy), legacy);
  assert.equal(normalizeStoredMediaUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
  assert.equal(normalizeStoredMediaUrl('blob:https://example.com/a.jpg'), '');
  assert.equal(normalizeStoredMediaUrl('data:text/html;base64,AAAA'), '');
  assert.equal(normalizeStoredMediaUrl('data:image/svg+xml;base64,AAAA'), '');
  assert.equal(isStorableMediaUrl(''), false);

  assert.deepEqual(
    normalizeStoredMediaCollection([legacy, 'https://cdn.example.com/a.jpg', '', 'blob:x']),
    [legacy, 'https://cdn.example.com/a.jpg'],
  );
  assert.equal(normalizeStoredMediaCollection('not-an-array'), undefined);
});

test('legacy inline images above the size bound are rejected', () => {
  const oversizedLength = Math.ceil(MAX_LEGACY_INLINE_MEDIA_BYTES * 4 / 3) + 512;
  const oversized = `data:image/png;base64,${'A'.repeat(oversizedLength)}`;
  assert.equal(isLegacyInlineMediaUrl(oversized), false);
  assert.equal(normalizeStoredMediaUrl(oversized), '');
});

test('media storage unavailable error carries a stable client code', () => {
  const error = new MediaStorageUnavailableError();
  assert.equal(error.code, 'media_storage_unavailable');
  assert.ok(error instanceof Error);
});

test('media storage adapter exposes both public and stored normalizers', () => {
  const adapter = createMediaStorageAdapter();
  const legacy = 'data:image/webp;base64,AAAA';
  assert.equal(adapter.normalizeUrl(legacy), '');
  assert.equal(adapter.normalizeStoredUrl(legacy), legacy);
  assert.deepEqual(adapter.normalizeStoredCollection([legacy]), [legacy]);
});

test('upload validation enforces purpose, folder, format and size', async () => {
  const { MediaUploadValidationError, validateMediaUploadRequest } = await import('../server/services/mediaStorage.ts');
  assert.deepEqual(
    validateMediaUploadRequest({ filename: 'logo.png', contentType: 'IMAGE/PNG', purpose: 'logo', folder: 'shops', size: 1024 }),
    { filename: 'logo.png', contentType: 'image/png', purpose: 'logo', folder: 'shops', size: 1024 },
  );
  for (const body of [
    { filename: '', contentType: 'image/png' },
    { filename: 'logo.svg', contentType: 'image/svg+xml' },
    { filename: 'logo.png', contentType: 'image/png', purpose: 'avatars' },
    { filename: 'logo.png', contentType: 'image/png', folder: 'private' },
    { filename: 'logo.png', contentType: 'image/png', size: MAX_PUBLIC_MEDIA_BYTES + 1 },
  ]) {
    assert.throws(() => validateMediaUploadRequest(body), MediaUploadValidationError, JSON.stringify(body));
  }
});

test('presigning is refused when the R2 public configuration is incomplete', async () => {
  const keys = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
  const saved = new Map(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];

  try {
    const { MediaStorageUnavailableError, createMediaUploadUrl, getMediaStorageConfig } = await import('../server/services/mediaStorage.ts');
    assert.equal(getMediaStorageConfig(), null);

    // Credentials alone are not enough: without a public base URL the returned link would be unusable.
    process.env.R2_BUCKET = 'matable-public';
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    assert.equal(getMediaStorageConfig(), null);

    await assert.rejects(
      createMediaUploadUrl({ shopId: 1, filename: 'logo.png', contentType: 'image/png', purpose: 'logo', folder: 'shops' }),
      (error: unknown) => error instanceof MediaStorageUnavailableError,
    );
  } finally {
    for (const key of keys) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

