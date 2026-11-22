import React from 'react';
import { MapPin } from 'lucide-react';
import { CategoryIcon } from './CategoryIcon';
import { getCategoryDefaults } from '../utils/categoryDefaults';

export const filterChipClass = (selected: boolean) => `inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-bold ${selected
  ? 'border-[var(--mt-green-deep)] bg-[var(--mt-green-deep)] text-white'
  : 'border-[var(--mt-gray-200)] bg-white text-[var(--mt-green-deep)]'}`;

export const CategoryChips: React.FC<{ categories: string[]; selected: string; onSelect: (category: string) => void }> = ({ categories, selected, onSelect }) => (
  <>
    <button type="button" aria-pressed={selected === 'all'} onClick={() => onSelect('all')} className={filterChipClass(selected === 'all')}>Tout</button>
    {categories.map((item) => (
      <button key={item} type="button" aria-pressed={selected === item} onClick={() => onSelect(selected === item ? 'all' : item)} className={filterChipClass(selected === item)}>
        <CategoryIcon category={item} className="h-4 w-4" />{getCategoryDefaults(item).label}
      </button>
    ))}
  </>
);

export const CitySelect: React.FC<{ cities: { value: string; label: string }[]; selected: string; onSelect: (city: string) => void; label: string }> = ({ cities, selected, onSelect, label }) => (
  <label className="relative flex shrink-0 items-center">
    <MapPin className={`pointer-events-none absolute left-2.5 h-4 w-4 ${selected === 'all' ? 'text-[var(--mt-green-deep)]' : 'text-white'}`} aria-hidden="true" />
    <select
      aria-label={label}
      value={selected}
      onChange={(event) => onSelect(event.target.value)}
      className={`min-h-11 max-w-[8.75rem] rounded-full border pl-8 pr-2 text-sm font-bold ${selected === 'all'
        ? 'border-[var(--mt-gray-200)] bg-white text-[var(--mt-green-deep)]'
        : 'border-[var(--mt-green-deep)] bg-[var(--mt-green-deep)] text-white'}`}
    >
      <option value="all">Commune</option>
      {cities.map((city) => <option key={city.value} value={city.value}>{city.label}</option>)}
    </select>
  </label>
);
