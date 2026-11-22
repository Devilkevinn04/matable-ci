import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CLEARED_FILTERS, readCatalogFilters, writeCatalogFilters, type CatalogFilters } from '../utils/catalogFilters';

/** Lit et écrit les filtres dans l’adresse. `keepScroll` évite que la page remonte à chaque choix (voir App). */
export function useCatalogFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readCatalogFilters(params), [params]);
  // L’adresse réelle, pas celle du dernier rendu : deux choix rapprochés ne s’écrasent pas.
  const write = (change: (previous: URLSearchParams) => URLSearchParams) => setParams(change(new URLSearchParams(window.location.search)), { replace: true, preventScrollReset: true, state: { keepScroll: true } });
  return {
    filters,
    update: (changes: Partial<CatalogFilters>) => write((previous) => writeCatalogFilters(previous, changes)),
    /** Remplace la recherche sans perdre les filtres. */
    search: (query: string) => write((previous) => {
      const next = new URLSearchParams(previous);
      if (query.trim()) next.set('q', query.trim());
      else next.delete('q');
      return next;
    }),
    clear: (withSearch = false) => write((previous) => {
      const next = writeCatalogFilters(previous, CLEARED_FILTERS);
      if (withSearch) next.delete('q');
      return next;
    }),
  };
}
