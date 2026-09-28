import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORY_DEFAULTS,
  getCategoryDefaults,
  getBannerImageForDisplay,
  getProductImageForDisplay,
  getWelcomeMessageForDisplay,
  isLegacyGenericProductImage,
  isShopCategory,
  normalizeWelcomeMessage,
  normalizeCustomBannerImage,
  SHOP_CATEGORIES,
} from '../src/utils/categoryDefaults';
import { getAllPresetsForCategory } from '../src/utils/themePresets';

test('defines distinct welcome and image defaults for all 11 shop categories', () => {
  assert.equal(SHOP_CATEGORIES.length, 11);
  assert.deepEqual(Object.keys(CATEGORY_DEFAULTS), [...SHOP_CATEGORIES]);

  const welcomeMessages = SHOP_CATEGORIES.map((category) => CATEGORY_DEFAULTS[category].welcomeMessage);
  const productImages = SHOP_CATEGORIES.map((category) => CATEGORY_DEFAULTS[category].productPlaceholderImageUrl);
  const bannerImages = SHOP_CATEGORIES.map((category) => CATEGORY_DEFAULTS[category].bannerPlaceholderImageUrl);
  assert.equal(new Set(welcomeMessages).size, SHOP_CATEGORIES.length);
  assert.equal(new Set(productImages).size, SHOP_CATEGORIES.length);
  assert.equal(new Set(bannerImages).size, SHOP_CATEGORIES.length);

  for (const category of SHOP_CATEGORIES) {
    const defaults = CATEGORY_DEFAULTS[category];
    assert.ok(defaults.welcomeMessage.length > 20, `${category} needs a welcome message`);
    assert.ok(defaults.productPlaceholderImageUrl.includes('images.unsplash.com'), `${category} needs a product placeholder`);
    assert.ok(defaults.bannerPlaceholderImageUrl.includes('images.unsplash.com'), `${category} needs a banner placeholder`);
    assert.ok(defaults.productCategorySuggestions.length > 0, `${category} needs category suggestions`);
    assert.ok(defaults.productAttributes.length > 0, `${category} needs category-specific product fields`);
    assert.ok(defaults.productAttributesHeading.length > 0, `${category} needs a clear product details heading`);
    assert.equal(new Set(defaults.productAttributes.map((field) => field.key)).size, defaults.productAttributes.length);
    assert.equal(typeof defaults.defaultProductSizes, 'string');
    assert.equal(typeof defaults.defaultProductColors, 'string');
    assert.ok(['luxe', 'moderne', 'authentique'].includes(defaults.brandDirection));
  }
});

test('provides at least one theme preset in every category gallery', () => {
  const presetIds: string[] = [];
  for (const category of SHOP_CATEGORIES) {
    const presets = getAllPresetsForCategory(category);
    assert.ok(presets.length > 0, `${category} must have a theme preset`);
    assert.ok(presets.every((preset) => preset.category === category));
    presetIds.push(...presets.map((preset) => preset.id));
    if (category !== 'fashion' && category !== 'food') {
      assert.equal(presets.length, 1);
      assert.deepEqual(presets[0].previewColors, [CATEGORY_DEFAULTS[category].primaryColor, CATEGORY_DEFAULTS[category].secondaryColor]);
    }
  }
  assert.equal(new Set(presetIds).size, presetIds.length);
});

test('uses category welcome copy for missing or known legacy text without replacing a custom message or an intentional blank', () => {
  const legacyMessage = 'Découvrez notre collection raffinée livrée en toute discrétion à Abidjan.';
  assert.equal(getWelcomeMessageForDisplay(null, 'health'), CATEGORY_DEFAULTS.health.welcomeMessage);
  assert.equal(getWelcomeMessageForDisplay(legacyMessage, 'education'), CATEGORY_DEFAULTS.education.welcomeMessage);
  assert.equal(getWelcomeMessageForDisplay('Mon message personnalisé.', 'food'), 'Mon message personnalisé.');
  assert.equal(getWelcomeMessageForDisplay('', 'fashion'), '');
  assert.equal(normalizeWelcomeMessage(legacyMessage, 'beauty'), CATEGORY_DEFAULTS.beauty.welcomeMessage);
});

test('uses the Other defaults for null, undefined, and unknown categories', () => {
  assert.equal(isShopCategory(null), false);
  assert.equal(isShopCategory(undefined), false);
  assert.equal(isShopCategory('legacy'), false);
  assert.equal(getCategoryDefaults(null), CATEGORY_DEFAULTS.other);
  assert.equal(getCategoryDefaults(undefined), CATEGORY_DEFAULTS.other);
  assert.equal(getCategoryDefaults('legacy'), CATEGORY_DEFAULTS.other);
});

test('renders the category placeholder for an empty or legacy generic product image without persisting it', () => {
  const legacyUrl = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600';
  const oldFoodPlaceholder = 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600';
  assert.equal(isLegacyGenericProductImage(legacyUrl), true);
  assert.equal(isLegacyGenericProductImage(oldFoodPlaceholder), true);
  assert.equal(getProductImageForDisplay('', 'beauty'), CATEGORY_DEFAULTS.beauty.productPlaceholderImageUrl);
  assert.equal(getProductImageForDisplay(null, 'automotive'), CATEGORY_DEFAULTS.automotive.productPlaceholderImageUrl);
  assert.equal(getProductImageForDisplay(legacyUrl, 'food'), CATEGORY_DEFAULTS.food.productPlaceholderImageUrl);
  assert.equal(getProductImageForDisplay(oldFoodPlaceholder, 'beauty'), CATEGORY_DEFAULTS.beauty.productPlaceholderImageUrl);
  assert.equal(getProductImageForDisplay('https://example.com/real.jpg', 'food'), 'https://example.com/real.jpg');
});

test('does not treat prior category banner defaults as merchant-owned banner photos', () => {
  const oldFashionBanner = 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200';
  assert.equal(normalizeCustomBannerImage(oldFashionBanner, 'health'), '');
  assert.equal(getBannerImageForDisplay(oldFashionBanner, 'health'), CATEGORY_DEFAULTS.health.bannerPlaceholderImageUrl);
  assert.equal(normalizeCustomBannerImage('https://example.com/store.jpg', 'health'), 'https://example.com/store.jpg');
});