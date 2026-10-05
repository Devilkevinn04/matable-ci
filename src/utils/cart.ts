export function requiresShopSwitchConfirmation(activeShopSlug: string, requestedShopSlug: string, itemCount: number): boolean {
  return itemCount > 0 && activeShopSlug !== requestedShopSlug;
}

type ModifierGroupForCart = {
  required?: boolean;
  options: readonly (string | { label: string; price_delta?: number })[];
};

export function getDefaultSelectedModifiers(groups: readonly ModifierGroupForCart[]): string[] {
  return groups.flatMap((group) => {
    if (!group.required || group.options.length === 0) return [];
    const firstOption = group.options[0];
    return [typeof firstOption === 'string' ? firstOption : firstOption.label];
  });
}
