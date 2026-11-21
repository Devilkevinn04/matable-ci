// Verrou de défilement de la page, compté : plusieurs fenêtres peuvent le demander en même temps,
// et la page ne redevient défilante qu’une fois la dernière refermée. Remplace les sauvegardes
// manuelles de `document.body.style.overflow`, qui se restauraient mutuellement dans le mauvais ordre.
let locks = 0;
let savedOverflow = '';

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  if (locks === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) document.body.style.overflow = savedOverflow;
  };
}
