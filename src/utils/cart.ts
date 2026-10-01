export function requiresShopSwitchConfirmation(activeShopSlug: string, requestedShopSlug: string, itemCount: number): boolean {
  return itemCount > 0 && activeShopSlug !== requestedShopSlug;
}
