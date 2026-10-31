import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_PRODUCT_IMAGE_PATH,
  productImageFingerprint,
  resolveProductImageRequest,
  toPublicProductImageUrl,
  withPublicProductImages,
} from '../server/services/publicProductImages.ts';

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('data URL photos become short cacheable URLs; other values are untouched', () => {
  const url = toPublicProductImageUrl(42, pixel);
  assert.equal(url, `${PUBLIC_PRODUCT_IMAGE_PATH}/42/0-${productImageFingerprint(pixel)}.png`);
  assert.equal(toPublicProductImageUrl(42, 'https://images.example.com/a.jpg'), 'https://images.example.com/a.jpg');
  assert.equal(toPublicProductImageUrl(42, ''), '');
  assert.equal(toPublicProductImageUrl(42, pixel, 0, 'https://matable.ci'), `https://matable.ci${url}`);
});

test('gallery photos get their own slot', () => {
  const product = withPublicProductImages({ id: 7, image_url: pixel, lookbook_image: pixel, gallery_images: JSON.stringify(['https://x.test/b.jpg', pixel]) });
  assert.match(String(product.image_url), /\/7\/0-[a-f0-9]{20}\.png$/);
  assert.match(String(product.lookbook_image), /\/7\/999-[a-f0-9]{20}\.png$/);
  assert.deepEqual((product.gallery_images as unknown as string[])[0], 'https://x.test/b.jpg');
  assert.match((product.gallery_images as unknown as string[])[1], /\/7\/2-[a-f0-9]{20}\.png$/);
  assert.equal(toPublicProductImageUrl(7, 'data:image/svg+xml;base64,PHN2Zz4='), '');
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
});
