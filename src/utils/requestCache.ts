type CachedEntry<T> = {
  value: T;
  expiresAt: number;
  promise?: Promise<T>;
};

const cache = new Map<string, CachedEntry<unknown>>();

export async function cachedFetchJson<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 30_000,
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key) as CachedEntry<T> | undefined;

  if (entry?.promise) {
    return entry.promise;
  }

  if (entry && entry.expiresAt > now) {
    return entry.value;
  }

  const pending = fetcher()
    .then((value) => {
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, { value: undefined as T, expiresAt: now + ttlMs, promise: pending });
  return pending;
}
