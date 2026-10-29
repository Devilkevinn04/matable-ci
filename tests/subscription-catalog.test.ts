import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { LegalPages } from '../src/components/LegalPages';
import { FAQ_SECTIONS } from '../src/utils/faqContent';
import {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_PRODUCT_LIMITS,
  TRIAL_CATALOG_LIMIT,
  TRIAL_DURATION_MONTHS,
} from '../src/utils/subscriptionFeatures';

function normalizeSpaces(value: string) {
  return value.replace(/[\u00a0\u202f]/g, ' ');
}

test('public subscription prices and catalog limits match the active plan configuration', async () => {
  const faq = FAQ_SECTIONS.flatMap((section) => section.questions)
    .find(({ question }) => question === 'Quelles sont les formules et les tarifs ?');
  assert.ok(faq, 'Subscription pricing question should be present in the FAQ.');

  const terms = normalizeSpaces(renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(LegalPages, { page: 'cgu' })),
  ));
  const readme = normalizeSpaces(await readFile(new URL('../README.md', import.meta.url), 'utf8'));
  const faqAnswer = normalizeSpaces(faq.answer);
  const plansPagePrices = Object.values(SUBSCRIPTION_PLANS).map((plan) => plan.price);
  assert.deepEqual(plansPagePrices, [3000, 5000, 8000]);

  assert.equal(SUBSCRIPTION_PRODUCT_LIMITS.standard, 20);
  assert.equal(SUBSCRIPTION_PRODUCT_LIMITS.premium, Number.POSITIVE_INFINITY);
  assert.equal(SUBSCRIPTION_PRODUCT_LIMITS.pro, Number.POSITIVE_INFINITY);
  assert.ok(faqAnswer.includes('20 articles'));
  assert.ok(faqAnswer.includes('catalogue illimité'));
  assert.ok(faqAnswer.includes('page Formules commerçants'));
  assert.ok(terms.includes('maximum de 2 produits'));
  assert.ok(terms.includes('tarif sur la page Formules commerçants'));
  assert.ok(readme.includes('20 produits et 2 photos par produit'));
  assert.ok(readme.includes('Premium un nombre illimité de produits'));
  assert.ok(readme.includes('Pro un nombre illimité de produits'));
  assert.equal(TRIAL_DURATION_MONTHS, 2);
  assert.ok(readme.includes('essai Standard de deux mois'));
  assert.ok(readme.includes(`${TRIAL_CATALOG_LIMIT} produits maximum`));
});
