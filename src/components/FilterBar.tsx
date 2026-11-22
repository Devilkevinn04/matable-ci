import React from 'react';
import { ArrowDownUp, LayoutGrid, MapPin, Wallet, X } from 'lucide-react';
import { CategoryIcon } from './CategoryIcon';
import { getCategoryDefaults } from '../utils/categoryDefaults';
import { DEFAULT_SORT, type CatalogFilters, type CategoryFacet } from '../utils/catalogFilters';
import { formatFCFA } from '../utils/format';

interface FilterBarProps {
  /** Ce que la barre filtre, pour les lecteurs d’écran : « les produits », « les boutiques ». */
  label: string;
  resultLabel: string;
  filters: CatalogFilters;
  facets: CategoryFacet[];
  cities: { value: string; label: string }[];
  priceOptions?: number[];
  sortOptions: { value: string; label: string }[];
  onChange: (changes: Partial<CatalogFilters>) => void;
  onClear: () => void;
}

const Field: React.FC<{ label: string; icon: React.ReactNode; value: string; isActive: boolean; onChange: (value: string) => void; options: { value: string; label: string }[] }> = ({ label, icon, value, isActive, onChange, options }) => (
  <label className={`mt-filter-field !min-w-[170px] max-w-[230px] ${isActive ? '!border-[var(--mt-green-primary)] !bg-[#f1f8f4]' : ''}`}>
    <span className="mt-filter-field-label">{icon}{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-filter-field-select">
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>
);

/** Filtre unique des écrans larges : catégories chiffrées, puis commune, prix, ouverture et ordre. */
export const FilterBar: React.FC<FilterBarProps> = ({ label, resultLabel, filters, facets, cities, priceOptions = [], sortOptions, onChange, onClear }) => {
  const total = facets.reduce((sum, facet) => sum + facet.count, 0);
  const categoryLabel = (value: string) => getCategoryDefaults(value).label;
  const tabs = [{ value: 'all', count: total }, ...facets];
  const active: { key: string; label: string; reset: Partial<CatalogFilters> }[] = [];
  if (filters.category !== 'all') active.push({ key: 'category', label: categoryLabel(filters.category), reset: { category: 'all' } });
  if (filters.city !== 'all') active.push({ key: 'city', label: cities.find(({ value }) => value === filters.city)?.label ?? filters.city, reset: { city: 'all' } });
  if (filters.maxPrice !== null) active.push({ key: 'price', label: `Jusqu’à ${formatFCFA(filters.maxPrice)}`, reset: { maxPrice: null } });
  if (filters.openOnly) active.push({ key: 'open', label: 'Ouvertes maintenant', reset: { openOnly: false } });

  return (
    <div role="group" aria-label={`Filtrer ${label}`} className="rounded-3xl border border-[#e7e2d9] bg-white shadow-[0_8px_24px_rgba(16,62,50,.05)]">
      <div className="mt-chip-rail flex gap-1 overflow-x-auto border-b border-[#eee9e0] px-3" role="group" aria-label="Catégorie">
        {tabs.map(({ value, count }) => {
          const selected = filters.category === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              disabled={count === 0 && !selected}
              onClick={() => onChange({ category: value })}
              className={`group relative flex min-h-14 shrink-0 items-center gap-2 px-4 text-sm font-bold transition-colors duration-[var(--mt-motion-fast)] disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'text-[var(--mt-green-deep)]' : 'text-[var(--mt-gray-600)] enabled:hover:text-[var(--mt-green-deep)]'}`}
            >
              {value === 'all' ? <LayoutGrid className="h-[18px] w-[18px]" aria-hidden="true" /> : <CategoryIcon category={value} className="h-[18px] w-[18px]" />}
              {value === 'all' ? 'Tout' : categoryLabel(value)}
              <span className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs tabular-nums ${selected ? 'bg-[var(--mt-green-deep)] text-white' : 'bg-[#f0ede6] text-[var(--mt-gray-600)]'}`}>{count}</span>
              <span aria-hidden="true" className={`absolute inset-x-3 -bottom-px h-[3px] origin-center rounded-full bg-[var(--mt-green-deep)] transition-transform duration-[var(--mt-motion-standard)] ${selected ? 'scale-x-100' : 'scale-x-0'}`} />
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 p-3">
        {cities.length > 1 && (
          <Field label="Commune" icon={<MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />} value={filters.city} isActive={filters.city !== 'all'} onChange={(city) => onChange({ city })} options={[{ value: 'all', label: 'Partout' }, ...cities]} />
        )}
        {priceOptions.length > 0 && (
          <Field label="Prix" icon={<Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />} value={String(filters.maxPrice ?? 'all')} isActive={filters.maxPrice !== null} onChange={(value) => onChange({ maxPrice: value === 'all' ? null : Number(value) })} options={[{ value: 'all', label: 'Tous les prix' }, ...priceOptions.map((price) => ({ value: String(price), label: `Jusqu’à ${formatFCFA(price)}` }))]} />
        )}
        <Field label="Trier par" icon={<ArrowDownUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />} value={sortOptions.some(({ value }) => value === filters.sort) ? filters.sort : DEFAULT_SORT} isActive={false} onChange={(sort) => onChange({ sort })} options={sortOptions} />
        <button
          type="button"
          role="switch"
          aria-checked={filters.openOnly}
          onClick={() => onChange({ openOnly: !filters.openOnly })}
          className={`flex min-h-[3.25rem] items-center gap-3 rounded-[0.875rem] border px-4 text-sm font-bold text-[#173c32] ${filters.openOnly ? 'border-[var(--mt-green-primary)] bg-[#f1f8f4]' : 'border-[#e7e2d9] bg-white'}`}
        >
          Ouvertes maintenant
          <span aria-hidden="true" className={`flex h-6 w-10 items-center rounded-full p-0.5 transition-colors duration-[var(--mt-motion-fast)] ${filters.openOnly ? 'bg-[var(--mt-green-primary)]' : 'bg-[#c9cfcb]'}`}>
            <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-[var(--mt-motion-fast)] ${filters.openOnly ? 'translate-x-4' : ''}`} />
          </span>
        </button>
        <p aria-live="polite" className="ml-auto px-2 text-sm font-bold text-[#173c32]">{resultLabel}</p>
      </div>

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[#eee9e0] px-3 py-2">
          {active.map((item) => (
            <button key={item.key} type="button" onClick={() => onChange(item.reset)} aria-label={`Retirer le filtre ${item.label}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#e6f1ea] pl-3 pr-2 text-sm font-semibold text-[var(--mt-green-deep)] transition-colors duration-[var(--mt-motion-fast)] hover:bg-[#d6e8dd]">
              {item.label}<X className="h-4 w-4" aria-hidden="true" />
            </button>
          ))}
          <button type="button" onClick={onClear} className="min-h-10 px-2 text-sm font-bold text-[var(--mt-orange-deep)] underline underline-offset-4">Tout effacer</button>
        </div>
      )}
    </div>
  );
};
