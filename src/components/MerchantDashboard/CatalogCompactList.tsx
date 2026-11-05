import React, { useState } from 'react';
import { Check, Edit3, Eye, EyeOff, Minus, Plus } from 'lucide-react';
import type { Product, ShopCategory } from '../../types';
import { formatFCFA } from '../../utils/format';
import { getActiveProductPrice } from '../../utils/productPricing';
import { CategoryProductImage } from '../CategoryProductImage';

interface CatalogCompactListProps {
  products: Product[];
  category: ShopCategory;
  saleNow: number;
  selectionMode: boolean;
  selectedIds: number[];
  onToggleSelected: (productId: number) => void;
  onStockChange: (productId: number, delta: number) => void;
  onToggleVisibility: (productId: number) => void;
  onPriceChange: (productId: number, price: number) => Promise<boolean | void>;
  onEdit: (product: Product) => void;
}

const PriceButton: React.FC<{ product: Product; saleNow: number; onPriceChange: CatalogCompactListProps['onPriceChange'] }> = ({ product, saleNow, onPriceChange }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const active = getActiveProductPrice(product, saleNow);
  const promo = active < product.price;

  const save = async () => {
    const next = Number(value.replace(/\D/g, ''));
    if (value.trim() && next !== product.price) await onPriceChange(product.id, next);
    setEditing(false);
  };

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <input
          autoFocus
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value.replace(/\D/g, ''))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save();
            if (event.key === 'Escape') setEditing(false);
          }}
          aria-label={`Nouveau prix de ${product.title} en francs`}
          className="min-h-10 w-24 rounded-lg border-2 border-[var(--mt-green-hover)] bg-white px-2 text-right text-sm font-black outline-none"
        />
        <button
          type="button"
          onClick={() => void save()}
          aria-label="Valider le prix"
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--mt-green-deep)] text-white"
        >
          <Check className="h-4 w-4" />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setValue(String(product.price)); setEditing(true); }}
      aria-label={`Modifier le prix de ${product.title}, actuellement ${formatFCFA(active)}`}
      className="-mx-1 min-h-10 rounded-lg px-1 text-left transition active:bg-[#edf5f0]"
    >
      <span className={`block text-sm font-black ${promo ? 'text-[var(--mt-orange-deep)]' : 'text-[var(--mt-green-deep)]'}`}>
        {formatFCFA(active)}
        <Edit3 className="ml-1 inline h-3 w-3 text-slate-400" aria-hidden="true" />
      </span>
      {promo && <span className="block text-[10px] font-semibold text-slate-400 line-through">{formatFCFA(product.price)}</span>}
    </button>
  );
};

export const CatalogCompactList: React.FC<CatalogCompactListProps> = ({
  products, category, saleNow, selectionMode, selectedIds, onToggleSelected, onStockChange, onToggleVisibility, onPriceChange, onEdit,
}) => (
  <ul className="space-y-2 sm:hidden">
    {products.map((product) => {
      const hidden = product.is_available === false;
      const selected = selectedIds.includes(product.id);
      return (
        <li
          key={product.id}
          className={`rounded-2xl border bg-white p-2.5 shadow-sm ${selected ? 'border-[var(--mt-green-hover)] ring-2 ring-[var(--mt-green-hover)]/25' : hidden ? 'border-dashed border-[#d9d5cd]' : 'border-[#e7dfd3]'}`}
        >
          <div className="flex items-center gap-3">
            {selectionMode && (
              <button
                type="button"
                role="checkbox"
                aria-checked={selected}
                aria-label={`Sélectionner ${product.title}`}
                onClick={() => onToggleSelected(product.id)}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-[var(--mt-green-deep)] bg-[var(--mt-green-deep)] text-white' : 'border-slate-300 bg-white'}`}
              >
                {selected && <Check className="h-4 w-4" />}
              </button>
            )}
            <button
              type="button"
              onClick={() => (selectionMode ? onToggleSelected(product.id) : onEdit(product))}
              aria-label={selectionMode ? `Sélectionner ${product.title}` : `Modifier ${product.title}`}
              className={`flex min-w-0 flex-1 items-center gap-3 text-left ${hidden ? 'opacity-60' : ''}`}
            >
              <CategoryProductImage
                imageUrl={product.image_url}
                category={category}
                title={product.title}
                className="h-14 w-14 shrink-0 rounded-xl bg-[#f3efe8]"
              />
              <span className="min-w-0">
                <span className="line-clamp-2 text-sm font-extrabold leading-tight text-[var(--mt-gray-900)]">{product.title}</span>
                {hidden && <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold text-slate-500"><EyeOff className="h-3 w-3" />Masqué</span>}
              </span>
            </button>
            {!selectionMode && <PriceButton product={product} saleNow={saleNow} onPriceChange={onPriceChange} />}
          </div>

          {!selectionMode && (
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#ece7de] pt-2">
              <div className="flex items-center gap-1 rounded-xl border border-[#e7dfd3] bg-[#f8f5ef] p-1">
                <button
                  type="button"
                  onClick={() => onStockChange(product.id, -1)}
                  disabled={product.stock <= 0}
                  aria-label={`Retirer une unité du stock de ${product.title}`}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#47534b] disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className={`min-w-14 px-1 text-center text-xs font-black ${product.stock <= 0 ? 'text-[#b93712]' : product.stock <= 3 ? 'text-[#a66a00]' : 'text-[var(--mt-gray-900)]'}`}>
                  {product.stock <= 0 ? 'Épuisé' : `${product.stock} en stock`}
                </span>
                <button
                  type="button"
                  onClick={() => onStockChange(product.id, 1)}
                  aria-label={`Ajouter une unité au stock de ${product.title}`}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-[#47534b]"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => onToggleVisibility(product.id)}
                aria-label={hidden ? `Rendre ${product.title} visible` : `Masquer ${product.title} de la vitrine`}
                className={`flex h-12 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold ${hidden ? 'border-[#e9c8c2] bg-rose-50 text-[#b93712]' : 'border-[#cfe3d6] bg-[#edf5f0] text-[var(--mt-green-deep)]'}`}
              >
                {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {hidden ? 'Masqué' : 'Visible'}
              </button>
            </div>
          )}
        </li>
      );
    })}
  </ul>
);
