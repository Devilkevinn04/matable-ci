import test from 'node:test';
import assert from 'node:assert/strict';
import { getProductCoverImage, getProductDisplayImages } from '../src/utils/productDisplayImages';

test('desktop and mobile use the same ordered product photo list', () => {
  const product = {
    image_url: '/media/products/1/0-main.jpg',
    thumbnail_url: '/media/products/1/998-main.jpg',
    lookbook_image: '/media/products/1/999-look.jpg',
    gallery_images: ['/media/products/1/1-gallery.jpg'],
  };
  const images = getProductDisplayImages(product, 'fashion', 'Set Top');
  assert.deepEqual(images.map((image) => image.src), [
    '/media/products/1/0-main.jpg',
    '/media/products/1/999-look.jpg',
    '/media/products/1/1-gallery.jpg',
  ]);
  assert.equal(images[0].thumbnailSrc, '/media/products/1/998-main.jpg');
  assert.equal(images[0].fit, 'contain');
  assert.equal(images[1].fit, 'cover');
});

test('a product without a main photo still has a cover on mobile', () => {
  const product = {
    image_url: '',
    thumbnail_url: '',
    lookbook_image: '/media/products/42/999-look.jpg',
    gallery_images: ['/media/products/42/1-gallery.jpg'],
  };
  assert.equal(getProductCoverImage(product, 'fashion', 'Set Top')?.src, '/media/products/42/999-look.jpg');

  const withoutLookbook = { ...product, lookbook_image: '' };
  assert.equal(getProductCoverImage(withoutLookbook, 'fashion', 'Set Top')?.src, '/media/products/42/1-gallery.jpg');
  assert.deepEqual(getProductDisplayImages({ ...product, lookbook_image: '', gallery_images: [] }, 'fashion', 'Set Top'), []);
});
