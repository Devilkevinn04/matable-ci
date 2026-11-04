import type { NavigateFunction } from 'react-router-dom';

export function navigateWithTransition(navigate: NavigateFunction, to: string): void {
  const startViewTransition = document.startViewTransition;
  if (!startViewTransition) {
    navigate(to);
    return;
  }
  startViewTransition(() => navigate(to));
}
