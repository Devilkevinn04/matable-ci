import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { MOTION_EASE, MOTION_SECONDS } from '../src/utils/motionTokens.ts';

const root = path.resolve(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const LOADERS = ['mt-shimmer', 'shimmer'];
const LOADING_CLASSES = ['animate-spin', 'animate-pulse'];

const sources = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const target = path.join(directory, entry.name);
  if (entry.isDirectory()) return sources(target);
  return /\.tsx$/.test(entry.name) ? [target] : [];
});

const components = sources(path.join(root, 'src')).map((file) => ({
  name: path.relative(root, file),
  text: fs.readFileSync(file, 'utf8'),
}));

const declarations = [...css.matchAll(/(?<![\w-])((?:transition|animation)(?:-duration)?)\s*:([^;{}]*)/g)]
  .map(([, property, value]) => ({ property, value: value.trim() }));

test('charte : la feuille de style et le code partagent les mêmes durées et la même courbe', () => {
  for (const [name, seconds] of Object.entries(MOTION_SECONDS)) {
    const match = css.match(new RegExp(`--mt-motion-${name}:\\s*(\\d+)ms`));
    assert.equal(Number(match?.[1]), Math.round(seconds * 1000), name);
  }
  assert.ok(css.includes(`--mt-motion-ease: cubic-bezier(${MOTION_EASE.join(', ')})`));
});

test('charte : aucune durée isolée dans la feuille de style', () => {
  assert.ok(declarations.length > 50);
  for (const { property, value } of declarations) {
    if (value.includes('infinite') || value.startsWith('0.01ms')) continue;
    // Retire les délais : seule la première durée de chaque segment compte.
    for (const segment of value.split(/,(?![^(]*\))/)) {
      const first = segment.match(/var\(--mt-motion-(?:fast|standard|deliberate)\)|(?<![\w.-])\d*\.?\d+m?s\b/)?.[0];
      assert.ok(!first || first.startsWith('var('), `${property}: ${segment.trim()}`);
    }
  }
});

test('charte : seules les attentes tournent en boucle', () => {
  for (const { value } of declarations) {
    if (!value.includes('infinite')) continue;
    assert.ok(LOADERS.some((loader) => value.startsWith(`${loader} `)), value);
  }
  assert.doesNotMatch(css, /animation-iteration-count:\s*infinite/);
  for (const { name, text } of components) {
    assert.doesNotMatch(text, /repeat:\s*Infinity/, name);
    for (const [used] of text.matchAll(/(?<![\w-])animate-(?!\[|none)[a-z]+(?=[\s"'`])/g)) {
      assert.ok(LOADING_CLASSES.includes(used), `${name} : ${used}`);
    }
  }
});

test('charte : les composants n’écrivent pas leurs propres durées', () => {
  for (const { name, text } of components) {
    const withoutTokens = text.replace(/duration-\[var\(--mt-motion-\w+\)\]/g, '');
    assert.doesNotMatch(withoutTokens, /(?<![\w-])duration-(?:\d+|\[)/, name);
    assert.doesNotMatch(withoutTokens, /(?<![\w-])animate-\[[^\]]*_\.?\d[\d.]*m?s/, name);
    assert.doesNotMatch(text, /\bduration:\s*(?:\w+\s*\?\s*0\s*:\s*)?0?\.\d+/, name);
  }
});

test('charte : le mouvement réduit coupe toutes les animations et transitions', () => {
  const reduced = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*?\*, \*::before, \*::after \{([^}]*)\}/)?.[1] ?? '';
  assert.match(reduced, /animation-duration: 0\.01ms !important/);
  assert.match(reduced, /animation-iteration-count: 1 !important/);
  assert.match(reduced, /transition-duration: 0\.01ms !important/);
  // Les animations liées au défilement n’ont pas de durée : elles doivent être conditionnées.
  for (const part of css.split(/(?<=\n\s+)animation-timeline:/).slice(0, -1)) {
    assert.match(part.slice(-300), /no-preference/);
  }
});

test('charte : GSAP reste dans un seul fichier, chargé à l’approche de la séquence', () => {
  const directory = path.join(root, 'src');
  const files = (fs.readdirSync(directory, { recursive: true }) as string[]).filter((file) => /\.tsx?$/.test(file));
  const read = (file: string) => fs.readFileSync(path.join(directory, file), 'utf8');
  assert.deepEqual(files.filter((file) => /from 'gsap/.test(read(file))).map((file) => path.basename(file)), ['orderStoryTimeline.ts']);
  assert.deepEqual(files.filter((file) => /^import .*orderStoryTimeline'/m.test(read(file))), []);
  // Un même élément n’est jamais animé par les deux bibliothèques.
  assert.doesNotMatch(read(path.join('components', 'OrderStory.tsx')), /motion\/react/);
});
