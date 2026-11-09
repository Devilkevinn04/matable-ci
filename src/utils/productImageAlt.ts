export function getProductImageAlt(title: string, shopName: string, city?: string): string {
  return [title.trim(), shopName.trim(), city?.trim()]
    .filter((part): part is string => Boolean(part))
    .join(' – ');
}
