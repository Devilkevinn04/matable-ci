export function deduplicateProductsById<T extends { id: number }>(products: T[]): T[] {
  const seenIds = new Set<number>();
  return products.filter((product) => {
    if (seenIds.has(product.id)) return false;
    seenIds.add(product.id);
    return true;
  });
}
