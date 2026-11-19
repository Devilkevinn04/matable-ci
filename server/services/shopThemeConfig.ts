import type { ShopRecord } from '../types.ts';

export function sanitizeThemeConfigForResponse(
  themeConfig: ShopRecord['theme_config'],
): ShopRecord['theme_config'] {
  const safeThemeConfig = { ...themeConfig };
  Reflect.deleteProperty(safeThemeConfig, 'delivery_zones');
  return safeThemeConfig;
}
