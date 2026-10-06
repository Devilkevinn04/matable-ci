export function getCanonicalOrigin(fallbackOrigin: string): string {
  const canonicalHref = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  if (!canonicalHref) return fallbackOrigin;
  try {
    return new URL(canonicalHref).origin;
  } catch {
    return fallbackOrigin;
  }
}
