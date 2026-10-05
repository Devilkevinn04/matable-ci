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
    customer_name: 'Awa Traoré',
    customer_phone: '0708091011',
    delivery_location: 'Cocody',
    delivery_note: 'Entrée côté pharmacie',
    delivery_slot: 'Midi 12h-13h',
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
  } satisfies Pick<Order, 'customer_name' | 'customer_phone' | 'delivery_location' | 'delivery_note' | 'payment_method_preference' | 'items' | 'total_amount' | 'delivery_slot'>;

  const { text, url } = generateWhatsAppOrderReceipt(shop, order);

  assert.match(text, /Attiéké poisson/);
  assert.match(text, /Options\/Sauces : Alloco, Piment à part/);
  assert.match(text, /2 x 3\s?000 FCFA = \*6\s?000 FCFA\*/);
  assert.match(text, /\*Jus de gingembre\* \[Taille: Grand\] \[Couleur: Vert\]/);
  assert.match(text, /Quantité : 1 x 500 FCFA = \*500 FCFA\*/);
  assert.match(text, /TOTAL INDICATIF : 6\s?500 FCFA/);
  assert.equal(new URL(url).searchParams.get('text'), text);
});