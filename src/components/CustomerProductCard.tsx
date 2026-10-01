import React from 'react';
import { ChevronDown, ChevronUp, Clock, Minus, Plus, ShoppingBag } from 'lucide-react';
import type { Product, ShopCategory } from '../types';
import type { CategoryDefaults } from '../utils/categoryDefaults';
import { formatFCFA } from '../utils/format';
import { CategoryProductImage } from './CategoryProductImage';

interface CustomerProductCardProps {
  product: Product;
  category: ShopCategory;
  categoryDefaults: CategoryDefaults;
  isShopOpen: boolean;
  layoutStyle: 'grid_portrait' | 'card_landscape';
  cardRadius: string;
  shadowClass: string;
  primaryColor: string;
  primaryTextColor: string;
  glowStyle: React.CSSProperties;
  quantityInCart: number;
  isDescriptionExpanded: boolean;
  activeSize?: string;
  activeColor?: string;
  activeModifiers: string[];
  selectedUnitPrice: number;
  onToggleDescription: () => void;
  onSelectSize: (size: string) => void;
  onSelectColor: (color: string) => void;
  onToggleModifier: (groupName: string, optionLabel: string, maxSelections: number) => void;
  onAddToCart: () => void;
  onDecreaseQuantity: () => void;
}

export const CustomerProductCard: React.FC<CustomerProductCardProps> = ({
  product,
  category,
  categoryDefaults,
  isShopOpen,
  layoutStyle,
  cardRadius,
  shadowClass,
  primaryColor,
  primaryTextColor,
  glowStyle,
  quantityInCart,
  isDescriptionExpanded,
  activeSize,
  activeColor,
  activeModifiers,
  selectedUnitPrice,
  onToggleDescription,
  onSelectSize,
  onSelectColor,
  onToggleModifier,
  onAddToCart,
  onDecreaseQuantity,
}) => {
  const outOfStock = product.stock <= 0;
  const description = product.description || '';
  const shouldTruncate = description.length > 130;
  const selectedModifierTotal = selectedUnitPrice - product.price;

  return (
    <article
      id={`product-card-${product.id}`}
      className={`bg-[#fffdf9] border border-[#ded8ce] ${cardRadius} ${shadowClass} overflow-hidden flex flex-col transition-all hover:border-[#176b55] hover:-translate-y-0.5`}
    >
      <div className={`relative bg-slate-100 overflow-hidden ${layoutStyle === 'grid_portrait' ? 'aspect-3/4' : 'aspect-16/9 sm:aspect-4/3'}`}>
        <CategoryProductImage imageUrl={product.image_url} category={category} title={product.title} className="absolute inset-0 h-full w-full transition-transform duration-500 hover:scale-105" />
        {product.prep_time && <span className="absolute top-2.5 left-2.5 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1"><Clock className="w-3 h-3 text-amber-400" /><span>{product.prep_time} min</span></span>}
        {outOfStock && <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px] flex items-center justify-center"><span className="bg-rose-600 text-white font-black text-xs px-3.5 py-1.5 rounded-full shadow-lg">Rupture de stock</span></div>}
      </div>

      {product.lookbook_image && <img src={product.lookbook_image} alt={`Lookbook de ${product.title}`} loading="lazy" referrerPolicy="no-referrer" className="h-24 w-full object-cover border-b border-slate-100" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
      {product.gallery_images?.length ? <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 p-1.5">{product.gallery_images.map((image, index) => <img key={`${product.id}-${index}`} src={image} alt={`Photo ${index + 1} de ${product.title}`} loading="lazy" referrerPolicy="no-referrer" className="h-16 w-16 shrink-0 rounded-lg object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} />)}</div> : null}

      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-extrabold text-slate-900 text-base leading-snug mb-1">{product.title}</h3>
        {description ? <div className="mb-3"><p className="text-slate-600 text-xs leading-relaxed">{shouldTruncate && !isDescriptionExpanded ? `${description.slice(0, 130)}...` : description}</p>{shouldTruncate && <button type="button" onClick={onToggleDescription} className="text-[11px] font-bold text-slate-800 hover:text-slate-950 flex items-center gap-0.5 mt-1">{isDescriptionExpanded ? <><span>Moins de détails</span><ChevronUp className="w-3 h-3" /></> : <><span>Détails & conseils</span><ChevronDown className="w-3 h-3" /></>}</button>}</div> : <div className="mb-2" />}

        {category === 'fashion' && <div className="space-y-2 mb-3 pt-2 border-t border-slate-100">
          {product.sizes?.length ? <div><span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Taille disponible :</span><div className="flex flex-wrap gap-1.5">{product.sizes.map((size) => <button key={size} type="button" onClick={() => onSelectSize(size)} className={`py-1 px-2.5 rounded-lg text-xs font-bold border transition-all ${activeSize === size ? 'bg-slate-900 text-white border-slate-900 shadow-xs' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`}>{size}</button>)}</div></div> : null}
          {product.colors?.length ? <div><span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Couleur :</span><div className="flex flex-wrap gap-1.5">{product.colors.map((color) => { const name = typeof color === 'string' ? color : color.name; return <button key={name} type="button" onClick={() => onSelectColor(name)} className={`py-1 px-2.5 rounded-lg text-xs font-semibold border transition-all ${activeColor === name ? 'border-slate-900 bg-slate-100 text-slate-900 font-bold ring-1 ring-slate-900' : 'border-slate-200 bg-white text-slate-600'}`}>{name}</button>; })}</div></div> : null}
        </div>}

        {product.attributes && Object.entries(product.attributes).some(([, value]) => value.trim()) && <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-100 pt-2">{Object.entries(product.attributes).filter(([, value]) => value.trim()).map(([key, value]) => { const field = categoryDefaults.productAttributes.find((candidate) => candidate.key === key); return field ? <div key={key} className="min-w-0 text-xs"><dt className="text-[10px] font-semibold text-slate-400">{field.label}</dt><dd className="truncate font-bold text-slate-700">{value}</dd></div> : null; })}</dl>}

        {category === 'food' && product.modifier_groups?.length ? <div className="mb-3 pt-2 border-t border-slate-100">{product.modifier_groups.map((group) => <div key={group.name}><span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">{group.name} {group.max_selections && group.max_selections > 1 ? `(jusqu’à ${group.max_selections})` : '(1 choix)'} :</span><div className="flex flex-wrap gap-1.5">{group.options.map((option) => { const label = typeof option === 'string' ? option : option.label; const selected = activeModifiers.includes(label); return <button key={label} type="button" onClick={() => onToggleModifier(group.name, label, Math.max(1, group.max_selections || 1))} className={`py-1 px-2.5 rounded-lg text-xs font-bold border transition-all ${selected ? 'bg-[#1D6B57] text-white border-[#154F41] shadow-[2px_2px_0_rgba(21,79,65,0.2)]' : 'bg-[#F7F3ED] text-[#211712] border-[#E4D9C8] hover:bg-[#F5EADC]'}`}>{label}</button>; })}</div></div>)}</div> : null}

        <div className="mt-auto pt-2 border-t border-slate-100 flex items-baseline justify-between gap-2 mb-3">
          <div><span className="text-[11px] text-slate-400 font-bold block">Prix unitaire</span><span className="font-black text-lg tracking-tight" style={{ color: primaryColor }}>{formatFCFA(selectedUnitPrice)}</span>{selectedModifierTotal > 0 && <span className="mt-0.5 block text-[10px] font-medium text-slate-500">{formatFCFA(product.price)} + {formatFCFA(selectedModifierTotal)} de supplément</span>}</div>
          <div className="text-right">{outOfStock ? <span className="inline-block text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">Épuisé</span> : product.stock <= 3 ? <span className="inline-block text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Plus que {product.stock} dispo</span> : <span className="inline-block text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">✓ En stock ({product.stock})</span>}</div>
        </div>

        {outOfStock ? <button disabled className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-slate-100 text-slate-400 cursor-not-allowed">Indisponible</button> : quantityInCart > 0 ? <div className="flex items-center justify-between bg-slate-100 rounded-xl p-1 border border-slate-200"><button id={`qty-minus-${product.id}`} onClick={onDecreaseQuantity} className="w-9 h-9 rounded-lg bg-white shadow-2xs flex items-center justify-center text-slate-700 font-bold hover:bg-slate-50 transition-colors" aria-label="Diminuer"><Minus className="w-4 h-4" /></button><span className="font-extrabold text-xs text-slate-900 px-2 truncate">{quantityInCart} dans le panier</span><button id={`qty-plus-${product.id}`} onClick={onAddToCart} disabled={quantityInCart >= product.stock} className="w-9 h-9 rounded-lg bg-white shadow-2xs flex items-center justify-center text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-40 transition-colors" aria-label="Augmenter"><Plus className="w-4 h-4" /></button></div> : <button id={`add-btn-${product.id}`} onClick={onAddToCart} disabled={!isShopOpen} className="w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm text-white shadow-[4px_4px_0_rgba(33,23,18,0.9)] hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-[2px] border-[#211712]" style={{ backgroundColor: primaryColor, ...glowStyle }}><ShoppingBag className="w-4 h-4" /><span>Ajouter au panier</span></button>}
      </div>
    </article>
  );
};
