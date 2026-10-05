import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductSavePayload, createProductDraft, parseProductModifierGroups, productToDraft, serializeProductModifierGroups } from '../src/components/MerchantDashboard/productForm';
import { CATEGORY_DEFAULTS } from '../src/utils/categoryDefaults';
import { Product } from '../src/types';

test('starts product drafts with category values and leaves images unpersisted', () => {
  const fashionDraft = createProductDraft('fashion');
  const foodDraft = createProductDraft('food');
  const otherDraft = createProductDraft('other');

  assert.equal(fashionDraft.sizes, CATEGORY_DEFAULTS.fashion.defaultProductSizes);
  assert.equal(fashionDraft.colors, CATEGORY_DEFAULTS.fashion.defaultProductColors);
  assert.equal(foodDraft.prep_time, 20);
  assert.deepEqual(foodDraft.modifier_groups.map((group) => group.name), ['Sauce', 'Accompagnement']);
  assert.ok(foodDraft.modifier_groups.every((group) => !group.required && group.max_selections === 2));
  assert.equal(foodDraft.image_url, '');
  assert.equal(otherDraft.prep_time, '');
  assert.deepEqual(otherDraft.modifier_groups, []);
  assert.ok(CATEGORY_DEFAULTS.automotive.productAttributes.some((field) => field.key === 'model_year'));
  assert.ok(CATEGORY_DEFAULTS.education.productAttributes.some((field) => field.key === 'level'));
});

test('hydrates edit drafts while keeping legacy generic imagery out of the saved value', () => {
  const product: Product = {
    id: 1,
    shop_id: 2,
    title: 'Plat du jour',
    category: 'Plats',
    description: 'Description',
    price: 2500,
    stock: 4,
    image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600',
    is_available: true,
    colors: [{ name: 'Rouge', hex: '#ff0000' }],
    modifier_groups: [
      { name: 'Sauce', required: false, max_selections: 2, options: [{ label: 'Piment', price_delta: 0 }, { label: 'Supplément (+1 000 F)', price_delta: 1000 }] },
      { name: 'Accompagnement', required: true, max_selections: 1, options: [{ label: 'Alloco', price_delta: 0 }] },
    ],
    attributes: { care_type: 'Hydratant' },
  };

  const draft = productToDraft(product);
  assert.equal(draft.image_url, '');
  assert.equal(draft.colors, 'Rouge');
  assert.deepEqual(draft.modifier_groups, [
    { name: 'Sauce', required: false, max_selections: 2, options: ['Piment', 'Supplément (+1 000 F)'] },
    { name: 'Accompagnement', required: true, max_selections: 1, options: ['Alloco'] },
  ]);
  assert.deepEqual(draft.attributes, { care_type: 'Hydratant' });
});

test('serializes a Food draft into the existing API shape and bounds modifier selections', () => {
  const payload = buildProductSavePayload({
    ...createProductDraft('food'),
    title: '  Poulet braisé  ',
    category: ' Grillades ',
    description: '  Servi avec attiéké. ',
    price: 5000,
    stock: '',
    sizes: ' , ',
    colors: 'Rouge, Jaune',
    prep_time: 25,
    modifier_groups: [
      { name: 'Sauce', required: true, max_selections: 1, options: ['Piment', 'Doux'] },
      { name: 'Extras', required: false, max_selections: 2, options: ['Alloco (+500 F)'] },
    ],
    image_url: 'data:image/webp;base64,photo',
    attributes: { portion: '2 personnes', ignored: 'À exclure' },
  }, 'food');

  assert.equal(payload.title, 'Poulet braisé');
  assert.equal(payload.category, 'Grillades');
  assert.equal(payload.stock, 0);
  assert.deepEqual(payload.sizes, [' ', ' '].filter(Boolean).length ? [] : undefined);
  assert.deepEqual(payload.colors, ['Rouge', 'Jaune']);
  assert.equal(payload.prep_time, 25);
  assert.equal(payload.image_url, 'data:image/webp;base64,photo');
  assert.deepEqual(payload.attributes, { portion: '2 personnes' });
  assert.equal(payload.modifier_groups?.[0].required, true);
  assert.equal(payload.modifier_groups?.[0].max_selections, 1);
  assert.equal(payload.modifier_groups?.[1].required, false);
  assert.equal(payload.modifier_groups?.[1].max_selections, 2);
  assert.deepEqual(payload.modifier_groups?.map((group) => group.name), ['Sauce', 'Extras']);
  assert.equal(payload.modifier_groups?.[1].options[0].price_delta, 500);
});

test('round-trips structured modifier groups and option surcharges', () => {
  const source = 'Sauce: Piment, Doux | Extras: Alloco (+500 F)';
  const groups = parseProductModifierGroups(source);

  assert.deepEqual(groups, [
    { name: 'Sauce', required: false, max_selections: 2, options: ['Piment', 'Doux'] },
    { name: 'Extras', required: false, max_selections: 2, options: ['Alloco (+500 F)'] },
  ]);
  assert.equal(serializeProductModifierGroups(groups), source);
  assert.equal(serializeProductModifierGroups([...groups, { name: 'Boisson', required: true, max_selections: 1, options: ['Jus maison (+250 F)'] }]), `${source} | Boisson: Jus maison (+250 F)`);
});

test('does not serialize Food-specific modifiers for another category', () => {
  const payload = buildProductSavePayload({
    ...createProductDraft('beauty'),
    title: 'Soin hydratant',
    price: 1000,
    modifier_groups: [{ name: 'Options', required: true, max_selections: 1, options: ['Grand format'] }],
  }, 'beauty');

  assert.equal(payload.modifier_groups, undefined);
});