import test from 'node:test';
import assert from 'node:assert/strict';
import { clearDiscoveryPreferences, getDiscoveryPreferences, rememberDiscoveryCategory } from '../src/utils/discoveryPreferences';

test('keeps the strongest discovery preferences first and ignores invalid scores', () => {
  const storage = new Map<string, string>();
  const previousWindow = (globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window;
  (globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
  } as unknown as Window & typeof globalThis;

  try {
    assert.deepEqual(getDiscoveryPreferences(), []);
    const store = rememberDiscoveryCategory('fashion', 2);
    assert.deepEqual(store, ['fashion']);

    rememberDiscoveryCategory('food', 3);
    rememberDiscoveryCategory('fashion', 5);
    assert.deepEqual(getDiscoveryPreferences(), ['fashion', 'food']);

    storage.set('matable_discovery_preferences_v1', JSON.stringify({ fashion: 'invalid', food: 7, health: -3, other: 99 }));
    assert.deepEqual(getDiscoveryPreferences(), ['other', 'food']);
  } finally {
    (globalThis as typeof globalThis & { window?: typeof globalThis }).window = previousWindow;
  }
});

test('clearDiscoveryPreferences is safe when no browser window exists', () => {
  const previousWindow = (globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window;
  delete (globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window;

  try {
    assert.doesNotThrow(() => clearDiscoveryPreferences());
  } finally {
    (globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window = previousWindow;
  }
});
