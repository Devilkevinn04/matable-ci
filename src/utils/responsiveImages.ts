const RESIZABLE_PREFIX = '/media/products/';
const WIDTHS = [320, 640, 960];

/**
 * Photos served by MaTable (`/media/products/...`) can be fetched narrower with `?w=`.
 * Returns `src`/`srcSet` so the browser downloads a size matching how big the photo is shown,
 * instead of the full upload. Other URLs (R2, Unsplash placeholders) are returned unchanged.
 */
export function getResponsiveImageProps(url: string | null | undefined, defaultWidth = 640): { src: string; srcSet?: string } {
  const src = typeof url === 'string' ? url : '';
  if (!src.startsWith(RESIZABLE_PREFIX) || src.includes('?')) return { src };
  return {
    src: `${src}?w=${defaultWidth}`,
    srcSet: WIDTHS.map((width) => `${src}?w=${width} ${width}w`).join(', '),
  };
}
