import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsv, stringifyCsv } from '../src/utils/csv.ts';

test('CSV parser supports BOM, escaped quotes, commas, and embedded newlines', () => {
  const csv = '\uFEFFtitle,description\r\n"Article, spécial","Ligne 1\r\nLigne ""2"""';
  assert.deepEqual(parseCsv(csv), [
    ['title', 'description'],
    ['Article, spécial', 'Ligne 1\r\nLigne "2"'],
  ]);
});

test('CSV parser rejects malformed quoted fields', () => {
  assert.throws(() => parseCsv('"article'), /champ entre guillemets qui n’est pas terminé/);
  assert.throws(() => parseCsv('"article"x'), /texte après la fermeture/);
  assert.throws(() => parseCsv('article"titre'), /guillemet non échappé/);
});

test('CSV serializer quotes cells and neutralizes spreadsheet formulas in text', () => {
  const csv = stringifyCsv([['title', 'price'], ['=1+1', 1500]]);
  assert.equal(csv, '"title","price"\r\n"\'=1+1","1500"');
  assert.deepEqual(parseCsv(csv), [['title', 'price'], ["'=1+1", '1500']]);
});
