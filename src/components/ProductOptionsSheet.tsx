import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock, Minus, Plus, X } from 'lucide-react';
import type { Product, ShopCategory } from '../types';
import type { CategoryDefaults } from '../utils/categoryDefaults';
import { formatFCFA } from '../utils/format';
import { splitModifierOption } from './MerchantDashboard/productForm';
import { CategoryProductImage } from './CategoryProductImage';

interface ProductOptionsSheetProps {
  product: Product;
  category: ShopCategory;
  categoryDefaults: CategoryDefaults;
  imageSrc?: string;
  isShopOpen: boolean;
  outOfStock: boolean;
  primaryColor: string;
  activeSize?: string;
  activeColor?: string;
  activeModifiers: string[];
  unitPrice: number;
  quantityInCart: number;
  onSelectSize: (size: string) => void;
  onSelectColor: (color: string) => void;
  onToggleModifier: (groupName: string, optionLabel: string, maxSelections: number) => void;
  onAddToCart: () => void;
  onDecreaseQuantity: () => void;
  onClose: () => void;
}

const optionLabel = (option: string | { label: string; price_delta?: number }) => (typeof option === 'string' ? option : option.label);
const optionDelta = (option: string | { label: string; price_delta?: number }) => (typeof option === 'string' ? 0 : Number(option.price_delta || 0));

const SectionTitle: React.FC<{ title: string; hint?: string; badge?: string }> = ({ title, hint, badge }) => (
  <div className="mb-2 flex items-center justify-between gap-2">
    <div className="min-w-0">
      <h4 className="text-sm font-black text-slate-900">{title}</h4>
      {hint && <p className="text-xs font-medium text-slate-500">{hint}</p>}
    </div>
    {badge && <span className="shrink-0 rounded-full bg-[#f1ebdf] px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-[#7a6a4f]">{badge}</span>}
  </div>
);

// Feuille d'options mobile : détails du produit, choix guidés et total en direct avant l'ajout au panier.
export const ProductOptionsSheet: React.FC<ProductOptionsSheetProps> = ({
  product, category, categoryDefaults, imageSrc, isShopOpen, outOfStock, primaryColor,
  activeSize, activeColor, activeModifiers, unitPrice, quantityInCart,
  onSelectSize, onSelectColor, onToggleModifier, onAddToCart, onDecreaseQuantity, onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const title = product.title.trim() || 'Produit local';
  const groups = category === 'food' ? product.modifier_groups || [] : [];
  const attributes = Object.entries(product.attributes || {})
    .filter(([, value]) => value.trim())
    .map(([key, value]) => ({ field: categoryDefaults.productAttributes.find((candidate) => candidate.key === key), value }))
    .filter((entry) => entry.field);
  const canOrder = isShopOpen && !outOfStock;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  const selectOption = (groupName: string, label: string, max: number, required: boolean, groupLabels: string[]) => {
    const selectedInGroup = groupLabels.filter((value) => activeModifiers.includes(value));
    const isSelected = activeModifiers.includes(label);
    if (max === 1) {
      if (isSelected) {
        if (!required) onToggleModifier(groupName, label, max);
        return;
      }
      selectedInGroup.forEach((value) => onToggleModifier(groupName, value, max));
      onToggleModifier(groupName, label, max);
      return;
    }
    if (isSelected && required && selectedInGroup.length === 1) return;
    onToggleModifier(groupName, label, max);
  };

  const chip = (selected: boolean) => `min-h-11 rounded-xl border px-3.5 text-sm font-bold transition active:scale-[0.97] ${selected ? 'border-[var(--mt-green-deep)] bg-[var(--mt-green-deep)] text-white shadow-sm' : 'border-[#ded8ce] bg-white text-slate-700'}`;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 backdrop-blur-[2px] sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Options de ${title}`} className="mt-sheet-up relative flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] bg-[#faf8f3] shadow-2xl sm:rounded-3xl">
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Fermer" className="absolute right-4 top-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-md"><X className="h-5 w-5" /></button>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">
          <div className="-mx-1 aspect-[2/1] overflow-hidden rounded-2xl bg-[#f4f1ea]">
            <CategoryProductImage imageUrl={imageSrc} category={category} title={title} showFallbackTitle={false} sizes="(max-width: 640px) 100vw, 32rem" className="h-full w-full" />
          </div>
          <div>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-xl font-extrabold leading-tight text-slate-900">{title}</h3>
              <span className="shrink-0 text-lg font-black" style={{ color: primaryColor }}>{formatFCFA(unitPrice)}</span>
            </div>
            {category === 'food' && product.prep_time ? (
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-slate-500"><Clock className="h-3.5 w-3.5" aria-hidden="true" />Prêt en {product.prep_time} min environ</p>
            ) : null}
            {product.description && <p className="mt-2 text-sm leading-6 text-slate-600">{product.description}</p>}
          </div>

          {category === 'fashion' && product.sizes?.length ? (
            <section>
              <SectionTitle title="Taille" hint="Choisissez votre taille" />
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Taille">
                {product.sizes.map((size) => <button key={size} type="button" role="radio" aria-checked={activeSize === size} onClick={() => onSelectSize(size)} className={`${chip(activeSize === size)} min-w-12`}>{size}</button>)}
              </div>
            </section>
          ) : null}

          {category === 'fashion' && product.colors?.length ? (
            <section>
              <SectionTitle title="Couleur" hint={activeColor || undefined} />
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Couleur">
                {product.colors.map((color) => {
                  const name = typeof color === 'string' ? color : color.name;
                  return <button key={name} type="button" role="radio" aria-checked={activeColor === name} onClick={() => onSelectColor(name)} className={chip(activeColor === name)}>{name}</button>;
                })}
              </div>
            </section>
          ) : null}

          {groups.map((group) => {
            const max = Math.max(1, group.max_selections || 1);
            const labels = group.options.map(optionLabel);
            const selectedCount = labels.filter((label) => activeModifiers.includes(label)).length;
            return (
              <section key={group.name}>
                <SectionTitle
                  title={group.name}
                  hint={max === 1 ? 'Choisissez 1 option' : `Jusqu’à ${max} choix · ${selectedCount}/${max} sélectionné${selectedCount > 1 ? 's' : ''}`}
                  badge={group.required ? 'Obligatoire' : 'Facultatif'}
                />
                <div className="space-y-2" role={max === 1 ? 'radiogroup' : 'group'} aria-label={group.name}>
                  {group.options.map((option) => {
                    const label = optionLabel(option);
                    const delta = optionDelta(option);
                    const selected = activeModifiers.includes(label);
                    const locked = !selected && max > 1 && selectedCount >= max;
                    return (
                      <button
                        key={label}
                        type="button"
                        role={max === 1 ? 'radio' : 'checkbox'}
                        aria-checked={selected}
                        disabled={locked}
                        onClick={() => selectOption(group.name, label, max, Boolean(group.required), labels)}
                        className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-3.5 text-left transition active:scale-[0.99] disabled:opacity-40 ${selected ? 'border-[var(--mt-green-deep)] bg-[#e9f6f0] shadow-sm' : 'border-[#ded8ce] bg-white'}`}
                      >
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 ${max === 1 ? 'rounded-full' : 'rounded-md'} ${selected ? 'border-[var(--mt-green-deep)] bg-[var(--mt-green-deep)] text-white' : 'border-slate-300 bg-white'}`}>{selected && <Check className="h-3 w-3" strokeWidth={4} aria-hidden="true" />}</span>
                        <span className="min-w-0 flex-1 text-sm font-bold text-slate-900">{splitModifierOption(label).name}</span>
                        <span className={`shrink-0 text-xs font-black ${delta > 0 ? 'text-[#a53a1d]' : 'text-slate-400'}`}>{delta > 0 ? `+ ${formatFCFA(delta)}` : 'Inclus'}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {attributes.length > 0 && (
            <section>
              <SectionTitle title="Détails" />
              <dl className="grid grid-cols-2 gap-2">
                {attributes.map(({ field, value }) => (
                  <div key={field!.key} className="rounded-xl border border-[#ded8ce] bg-white px-3 py-2">
                    <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{field!.label}</dt>
                    <dd className="truncate text-sm font-bold text-slate-800">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>

        <div className="shrink-0 border-t border-[#ded8ce] bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {!canOrder ? (
            <button type="button" disabled className="min-h-12 w-full rounded-xl bg-slate-100 text-sm font-black text-slate-400">{outOfStock ? 'Indisponible' : 'Boutique fermée'}</button>
          ) : (
            <div className="flex items-center gap-3">
              {quantityInCart > 0 && (
                <div className="flex min-h-12 shrink-0 items-center gap-1 rounded-xl border border-[#ded8ce] bg-[#f7f3ed] p-1">
                  <button type="button" onClick={onDecreaseQuantity} aria-label="Diminuer" className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm"><Minus className="h-4 w-4" /></button>
                  <span role="status" aria-label={`${quantityInCart} au panier`} className="min-w-6 text-center text-sm font-black">{quantityInCart}</span>
                  <button type="button" onClick={onAddToCart} disabled={quantityInCart >= product.stock} aria-label="Augmenter" className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm disabled:opacity-40"><Plus className="h-4 w-4" /></button>
                </div>
              )}
              <button
                type="button"
                onClick={() => { if (quantityInCart > 0) onClose(); else { onAddToCart(); onClose(); } }}
                className="flex min-h-12 flex-1 items-center justify-between gap-3 rounded-xl px-4 text-sm font-black text-white shadow-md transition active:scale-[0.98]"
                style={{ backgroundColor: primaryColor }}
              >
                <span>{quantityInCart > 0 ? 'Terminé' : 'Ajouter au panier'}</span>
                <span>{formatFCFA(unitPrice)}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
