export function isShopExcludedFromPublicIndex(name: string): boolean {
  return /\b(?:puff|vape|tabac)\b/i.test(name);
}
