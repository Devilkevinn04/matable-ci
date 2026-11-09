import test from 'node:test';
import assert from 'node:assert/strict';
import { findSeoArticle, SEO_ARTICLES } from '../src/utils/seoArticles';
import { getProductImageAlt } from '../src/utils/productImageAlt';

test('SEO articles are available only at their canonical guide paths', () => {
  assert.equal(SEO_ARTICLES.length, 2);
  assert.equal(findSeoArticle('/guide/vendre-en-ligne-a-abidjan')?.heading, 'Comment vendre en ligne à Abidjan ?');
  assert.equal(findSeoArticle('/guide/commander-sans-compte')?.heading, 'Comment commander chez un commerçant sans créer de compte ?');
  assert.equal(findSeoArticle('/autre/commander-sans-compte'), undefined);
  assert.equal(findSeoArticle('/guide/commander-sans-compte/extra'), undefined);
});

test('product image descriptions include the product, shop, and optional city', () => {
  assert.equal(getProductImageAlt('Crêpes fleurs', 'Les Gâteries d’Epi', 'Cocody'), 'Crêpes fleurs – Les Gâteries d’Epi – Cocody');
  assert.equal(getProductImageAlt('  Chemise wax  ', 'Atelier N’Zassa'), 'Chemise wax – Atelier N’Zassa');
});
