import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWhatsAppOrderReceipt } from '../src/utils/format.ts';
import type { Order, Shop } from '../src/types.ts';

test('WhatsApp receipt includes every server-confirmed item and its exact options and prices', () => {
  const shop = {
    name: 'Chez Awa',
    category: 'food',
    whatsapp_number: '+2250708091011',
  } as Shop;
  const order = {
    id: 42,
    customer_name: 'Awa Traoré',
    customer_phone: '0708091011',
    payment_method_preference: 'wave',
    total_amount: 6500,
    items: [
      {
        id: 1,
        order_id: 42,
        product_id: 7,
        product_title: 'Attiéké poisson',
        quantity: 2,
        unit_price: 3000,
        selected_modifiers: ['Alloco', 'Piment à part'],
      },
      {
        id: 2,
        order_id: 42,
        product_id: 8,
        product_title: 'Jus de gingembre',
        quantity: 1,
        unit_price: 500,
        selected_size: 'Grand',
        selected_color: 'Vert',
      },
    ],
  } satisfies Pick<Order, 'id' | 'customer_name' | 'customer_phone' | 'payment_method_preference' | 'items' | 'total_amount'>;

  const { text, url } = generateWhatsAppOrderReceipt(shop, order);

  assert.match(text, /COMMANDE MATABLE #42/);
  assert.match(text, /Attiéké poisson/);
  assert.match(text, /Alloco, Piment à part/);
  assert.match(text, /2 × 3\s?000 FCFA = 6\s?000 FCFA/);
  assert.match(text, /\*Jus de gingembre\*\nTaille Grand · Couleur Vert/);
  assert.match(text, /1 × 500 FCFA = 500 FCFA/);
  assert.match(text, /TOTAL DES ARTICLES : 6\s?500 FCFA/);
  assert.match(text, /modalités de remise et le règlement/);
  assert.doesNotMatch(text, /livraison|livreur/i);
  assert.equal(new URL(url).searchParams.get('text'), text);
});

test('WhatsApp receipt contains no MaTable delivery fee or courier information', () => {
  const shop = {
    name: 'Chez Awa',
    category: 'food',
    whatsapp_number: '+2250708091011',
  } as Shop;
  const order = {
    id: 43,
    customer_name: 'Awa Traoré',
    customer_phone: '0708091011',
    payment_method_preference: 'cash',
    total_amount: 6500,
    items: [
      {
        id: 1,
        order_id: 43,
        product_id: 7,
        product_title: 'Attiéké poisson',
        quantity: 2,
        unit_price: 3250,
      },
    ],
  } satisfies Pick<Order, 'id' | 'customer_name' | 'customer_phone' | 'payment_method_preference' | 'items' | 'total_amount'>;

  const { text } = generateWhatsAppOrderReceipt(shop, order);

  assert.match(text, /COMMANDE MATABLE #43/);
  assert.match(text, /TOTAL DES ARTICLES : 6\s?500 FCFA/);
  assert.doesNotMatch(text, /livraison|livreur|frais/i);
});

test('WhatsApp receipt handles minimal data and keeps the contact link valid', () => {
  const shop = {
    name: 'Chez Awa & Fils',
    category: 'food',
    whatsapp_number: '0708091011',
  } as Shop;
  const order = {
    id: 44,
    customer_name: 'Awa',
    customer_phone: '0708091011',
    payment_method_preference: 'to_confirm',
    total_amount: 1500,
    items: [
      {
        id: 1,
        order_id: 44,
        product_id: 9,
        product_title: 'Thé & citron',
        quantity: 1,
        unit_price: 1500,
      },
    ],
  } satisfies Pick<Order, 'id' | 'customer_name' | 'customer_phone' | 'payment_method_preference' | 'items' | 'total_amount'>;

  const { text, url } = generateWhatsAppOrderReceipt(shop, order);

  assert.match(text, /COMMANDE MATABLE #44/);
  assert.match(text, /Thé & citron/);
  assert.match(text, /À convenir avec le vendeur/);
  assert.match(text, /TOTAL DES ARTICLES : 1\s?500 FCFA/);
  assert.doesNotMatch(text, /undefined|NaN|\bnull\b/);
  assert.equal(new URL(url).pathname, '/2250708091011');
  assert.equal(new URL(url).searchParams.get('text'), text);
});

test('WhatsApp receipt strips user-typed markdown and avoids ASCII separators', () => {
  const shop = {
    name: '*Chez_Awa*',
    category: 'food',
    whatsapp_number: '+2250708091011',
  } as Shop;
  const order = {
    id: 45,
    customer_name: 'Awa `Traoré`',
    customer_phone: '0708091011',
    payment_method_preference: 'to_confirm',
    total_amount: 2000,
    items: [
      {
        id: 1,
        order_id: 45,
        product_id: 10,
        product_title: 'Jus *maison*',
        quantity: 1,
        unit_price: 2000,
      },
    ],
  } satisfies Pick<Order, 'id' | 'customer_name' | 'customer_phone' | 'payment_method_preference' | 'items' | 'total_amount'>;

  const { text } = generateWhatsAppOrderReceipt(shop, order);

  assert.match(text, /ChezAwa/);
  assert.match(text, /Awa Traoré/);
  assert.match(text, /Jus maison/);
  assert.doesNotMatch(text, /-{4,}/);
  assert.doesNotMatch(text, /_{2,}/);
  assert.doesNotMatch(text, /`/);
  // Les astérisques restants ne servent qu'au gras des titres de blocs et des articles.
  assert.equal((text.match(/\*/g) || []).length % 2, 0);
});
