import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_PRODUCT_IMAGE_PATH,
  getPublicProductCoverImage,
  productImageFingerprint,
  resolveProductImageRequest,
  toPublicProductImageUrl,
  withPublicProductImages,
} from '../server/services/publicProductImages.ts';

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('data URL photos become short cacheable URLs and unsupported external URLs are omitted', () => {
  const url = toPublicProductImageUrl(42, pixel);
  assert.equal(url, `${PUBLIC_PRODUCT_IMAGE_PATH}/42/0-${productImageFingerprint(pixel)}.png`);
  assert.equal(toPublicProductImageUrl(42, 'https://images.example.com/a.jpg'), '');
  assert.equal(toPublicProductImageUrl(42, ''), '');
  assert.equal(toPublicProductImageUrl(42, pixel, 0, 'https://matable-ci.com'), `https://matable-ci.com${url}`);
  assert.equal(
    toPublicProductImageUrl(42, pixel, 0, '', 'age.token'),
    `${url}?age_token=age.token`,
  );
});

test('configured product storage URLs are proxied; other bucket paths are not', async () => {
  const keys = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
  const saved = new Map(keys.map((key) => [key, process.env[key]]));
  process.env.R2_ENDPOINT = 'https://r2.example.com';
  process.env.R2_BUCKET = 'matable-public';
  process.env.R2_PUBLIC_BASE_URL = 'https://media.example.com';
  process.env.R2_ACCESS_KEY_ID = 'test-key';
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret';

  try {
    const storedUrl = 'https://media.example.com/shops/product-main/42/1700000000000-abcd1234-photo.webp';
    const url = toPublicProductImageUrl(42, storedUrl);
    assert.equal(url, `${PUBLIC_PRODUCT_IMAGE_PATH}/42/0-${productImageFingerprint(storedUrl)}.webp`);
    assert.equal(toPublicProductImageUrl(42, 'https://media.example.com/shops/logo/42/logo.png'), '');
  } finally {
    for (const key of keys) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('gallery photos get their own slot', () => {
  const product = withPublicProductImages({ id: 7, image_url: pixel, thumbnail_url: pixel, lookbook_image: pixel, gallery_images: JSON.stringify(['https://x.test/b.jpg', pixel]) });
  assert.match(String(product.image_url), /\/7\/0-[a-f0-9]{20}\.png$/);
  assert.match(String(product.thumbnail_url), /\/7\/998-[a-f0-9]{20}\.png$/);
  assert.match(String(product.lookbook_image), /\/7\/999-[a-f0-9]{20}\.png$/);
  assert.deepEqual((product.gallery_images as unknown as string[])[0], '');
  assert.match((product.gallery_images as unknown as string[])[1], /\/7\/2-[a-f0-9]{20}\.png$/);
  assert.equal(toPublicProductImageUrl(7, 'data:image/svg+xml;base64,PHN2Zz4='), '');
});

test('shop previews fall back to the lookbook or gallery when no main photo exists', () => {
  const lookbookUrl = toPublicProductImageUrl(42, pixel, 999);
  const galleryUrl = toPublicProductImageUrl(42, pixel, 1);
  const withLookbook = getPublicProductCoverImage({ lookbook_image: lookbookUrl, gallery_images: [galleryUrl] });
  assert.equal(withLookbook.imageUrl, lookbookUrl);
  assert.equal(withLookbook.thumbnailUrl, lookbookUrl);

  const withGallery = getPublicProductCoverImage({ gallery_images: [galleryUrl] });
  assert.deepEqual(withGallery, { imageUrl: galleryUrl, thumbnailUrl: galleryUrl });
  assert.deepEqual(getPublicProductCoverImage({}), { imageUrl: '', thumbnailUrl: '' });

  const withMain = getPublicProductCoverImage({
    image_url: toPublicProductImageUrl(42, pixel),
    thumbnail_url: toPublicProductImageUrl(42, pixel, 998),
    lookbook_image: lookbookUrl,
  });
  assert.equal(withMain.thumbnailUrl, toPublicProductImageUrl(42, pixel, 998));
});

test('age-verified product image URLs carry the short-lived scoped token', () => {
  const product = withPublicProductImages({ id: 7, image_url: pixel }, { ageVerificationToken: 'age.token' });
  assert.equal(new URL(String(product.image_url), 'https://matable-ci.com').searchParams.get('age_token'), 'age.token');
});

test('only a URL that was handed out resolves to image bytes', () => {
  const file = toPublicProductImageUrl(9, pixel).split('/').pop()!;
  const image = resolveProductImageRequest(file, { image_url: pixel });
  assert.ok(image);
  assert.equal(image.contentType, 'image/png');
  assert.equal(image.body.subarray(1, 4).toString(), 'PNG');
  assert.equal(resolveProductImageRequest(file.replace(/^0-/, '1-'), { image_url: pixel }), null, 'empty gallery slot');
  assert.equal(resolveProductImageRequest('0-00000000000000000000.png', { image_url: pixel }), null, 'wrong fingerprint');
  assert.equal(resolveProductImageRequest('../../etc/passwd', { image_url: pixel }), null);
  assert.equal(resolveProductImageRequest(file, undefined), null);
  const lookbookFile = toPublicProductImageUrl(9, pixel, 999).split('/').pop()!;
  assert.ok(resolveProductImageRequest(lookbookFile, { lookbook_image: pixel }));
  const thumbnailFile = toPublicProductImageUrl(9, pixel, 998).split('/').pop()!;
  assert.ok(resolveProductImageRequest(thumbnailFile, { thumbnail_url: pixel }));
});

test('resized variants are WebP, smaller, and only for allowed widths', async () => {
  const { default: sharp } = await import('sharp');
  const big = await sharp({ create: { width: 1000, height: 800, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg({ quality: 90 }).toBuffer();
  const dataUrl = `data:image/jpeg;base64,${big.toString('base64')}`;
  const file = toPublicProductImageUrl(3, dataUrl).split('/').pop()!;
  const original = resolveProductImageRequest(file, { image_url: dataUrl })!;
  const { parseRequestedImageWidth, resizeProductImage } = await import('../server/services/publicProductImages.ts');
  assert.equal(parseRequestedImageWidth('320'), 320);
  assert.equal(parseRequestedImageWidth('333'), null);
  assert.equal(parseRequestedImageWidth(undefined), null);
  const small = await resizeProductImage(original, 320);
  const metadata = await sharp(small.body).metadata();
  assert.equal(small.contentType, 'image/webp');
  assert.equal(metadata.width, 320);
  assert.ok(small.body.length < original.body.length);
  assert.notEqual(small.etag, original.etag);
});

test('Render host page views redirect to the public domain, API and webhooks do not', async () => {
  const { getPublicDomainRedirect } = await import('../server/services/hostRedirect.ts');
  const base = { nodeEnv: 'production', appUrl: 'https://matable-ci.com', host: 'matable-ci.onrender.com', method: 'GET' };
  assert.equal(getPublicDomainRedirect({ ...base, path: '/cocody', originalUrl: '/cocody?src=tiktok' }), 'https://matable-ci.com/cocody?src=tiktok');
  assert.equal(getPublicDomainRedirect({ ...base, path: '/api/shops', originalUrl: '/api/shops' }), null);
  assert.equal(getPublicDomainRedirect({ ...base, path: '/health', originalUrl: '/health' }), null);
  assert.equal(getPublicDomainRedirect({ ...base, method: 'POST', path: '/webhook', originalUrl: '/webhook' }), null);
  assert.equal(getPublicDomainRedirect({ ...base, host: 'matable-ci.com', path: '/', originalUrl: '/' }), null);
  assert.equal(getPublicDomainRedirect({ ...base, nodeEnv: 'development', path: '/', originalUrl: '/' }), null);
  assert.equal(getPublicDomainRedirect({ ...base, appUrl: '', path: '/', originalUrl: '/' }), null);
});
test('HTTP redirects prefer the configured public origin over a forged Host header', async () => {
  const { getSecureRedirectUrl } = await import('../server/services/hostRedirect.ts');
  assert.equal(
    getSecureRedirectUrl({ appUrl: 'https://matable-ci.com', host: 'evil.example', originalUrl: '/compte?x=1' }),
    'https://matable-ci.com/compte?x=1',
  );
  assert.equal(
    getSecureRedirectUrl({ appUrl: 'http://localhost:3000', host: '127.0.0.1:3000', originalUrl: '/faq' }),
    'https://127.0.0.1:3000/faq',
  );
  assert.equal(
    getSecureRedirectUrl({ appUrl: '', host: 'matable-ci.com', originalUrl: '/' }),
    'https://matable-ci.com/',
  );
});
