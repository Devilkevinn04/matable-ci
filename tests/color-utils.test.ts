import test from 'node:test';
import assert from 'node:assert/strict';

import { estimateDominantColorFromPixels, mixHexColors } from '../src/utils/color';

test('estimateDominantColorFromPixels selects the most frequent color in image data', () => {
  const pixels = new Uint8ClampedArray([
    255, 0, 0, 255,
    255, 0, 0, 255,
    255, 0, 0, 255,
    0, 0, 255, 255,
  ]);

  assert.equal(estimateDominantColorFromPixels(pixels, 2, 2), '#FF0000');
});

test('mixHexColors returns a softened neutral blend for secondary palette usage', () => {
  const mixed = mixHexColors('#0F172A', '#FFFFFF', 0.8);
  assert.equal(mixed, '#CFD1D4');
});
