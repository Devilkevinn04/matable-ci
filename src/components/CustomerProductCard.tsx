import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BadgePercent, Bookmark, ChevronDown, ChevronUp, Clock, Expand, Heart, MessageSquareText, Minus, Plus, ShoppingBag, X } from 'lucide-react';
import type { Product, ShopCategory } from '../types';
import type { CategoryDefaults } from '../utils/categoryDefaults';
import { formatFCFA } from '../utils/format';
import { CategoryProductImage } from './CategoryProductImage';
import { getActiveProductPrice } from '../utils/productPricing';
import { useProductSaleClock } from '../utils/useProductSaleClock';

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
  isFavorite: boolean;
  isLiked: boolean;
  onToggleFavorite: () => void;
  onToggleLike: () => void;
  onOpenTrust: () => void;
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
  isFavorite,
  isLiked,
  onToggleFavorite,
  onToggleLike,
  onOpenTrust,
  onToggleDescription,
  onSelectSize,
  onSelectColor,
  onToggleModifier,
  onAddToCart,
  onDecreaseQuantity,
}) => {
  const productTitle = product.title.trim() || 'Produit local';
  const saleNow = useProductSaleClock(product.sale_starts_at, product.sale_ends_at);
  const outOfStock = product.stock <= 0;
  const description = product.description || '';
  const shouldTruncate = description.length > 130;
  const activeBasePrice = getActiveProductPrice(product, saleNow);
  const selectedModifierTotal = selectedUnitPrice - activeBasePrice;
  const isPromotion = activeBasePrice < product.price;
  const productImages = [
    ...(product.image_url ? [{ src: product.image_url, alt: productTitle, fit: category === 'fashion' ? 'contain' as const : 'cover' as const }] : []),
    ...(product.lookbook_image ? [{ src: product.lookbook_image, alt: `Lookbook de ${productTitle}`, fit: 'cover' as const }] : []),
    ...(product.gallery_images || []).map((src, index) => ({ src, alt: `Photo ${index + 1} de ${productTitle}`, fit: category === 'fashion' ? 'contain' as const : 'cover' as const })),
  ];
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const imageViewerCloseRef = useRef<HTMLButtonElement>(null);
  const imageViewerTriggerRef = useRef<HTMLButtonElement>(null);
  const imageViewerDialogRef = useRef<HTMLElement>(null);
  const selectedImage = productImages[selectedImageIndex];
  const hasProductOptions = Boolean(
    (category === 'fashion' && (product.sizes?.length || product.colors?.length)) ||
    (category === 'food' && product.modifier_groups?.length) ||
    Object.values(product.attributes || {}).some((value) => value.trim()),
  );

  useEffect(() => {
    if (!isImageViewerOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    imageViewerCloseRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsImageViewerOpen(false);
      if (productImages.length > 1 && event.key === 'ArrowRight') {
        setSelectedImageIndex((index) => (index + 1) % productImages.length);
      }
      if (productImages.length > 1 && event.key === 'ArrowLeft') {
        setSelectedImageIndex((index) => (index - 1 + productImages.length) % productImages.length);
      }
      if (event.key === 'Tab') {
        const focusableElements = imageViewerDialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusableElements?.length) return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      (imageViewerTriggerRef.current || previousFocus)?.focus();
    };
  }, [isImageViewerOpen, productImages.length]);

  const showPreviousImage = () => {
    setSelectedImageIndex((index) => (index - 1 + productImages.length) % productImages.length);
  };
  const showNextImage = () => {
    setSelectedImageIndex((index) => (index + 1) % productImages.length);
  };

  return (
    <article
      id={`product-card-${product.id}`}
      className={`h-full bg-[#FFFFFF] border border-[#ded8ce] ${cardRadius} ${shadowClass} overflow-hidden flex flex-col transition-all hover:border-[#047857] hover:-translate-y-0.5`}
    >
      <div className="relative flex w-full flex-col">
        <div className={`relative aspect-square w-full overflow-hidden bg-[#f4f1ea] ${layoutStyle === 'grid_portrait' ? 'sm:aspect-[4/5]' : 'sm:aspect-[4/3]'}`}>
          {selectedImage && (
            <button
              ref={imageViewerTriggerRef}
              type="button"
              onClick={() => setIsImageViewerOpen(true)}
              aria-label={`Agrandir la photo ${selectedImageIndex + 1} de ${productTitle}`}
              className="group absolute inset-0 z-0 rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
            >
              <CategoryProductImage imageUrl={selectedImage.src} category={category} title={selectedImage.alt} showFallbackTitle={false} imageFit={selectedImage.fit} className={`h-full w-full transition-transform duration-500 group-hover:scale-105 ${selectedImage.fit === 'contain' ? 'p-1' : ''}`} />
              <span className="pointer-events-none absolute bottom-2 right-2 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/80 bg-slate-950/65 text-white shadow-sm backdrop-blur-sm">
                <Expand className="h-4 w-4" aria-hidden="true" />
              </span>
            </button>
          )}
          {product.prep_time && <span className="absolute left-2.5 top-2.5 z-10 flex items-center gap-1 rounded-md bg-slate-900/80 px-2 py-0.5 text-[10px] font-black text-white backdrop-blur-xs"><Clock className="h-3 w-3 text-amber-400" /><span>{product.prep_time} min</span></span>}
          {isPromotion && <span className={`absolute left-2.5 z-10 ${product.prep_time ? 'top-10' : 'top-2.5'} inline-flex items-center gap-1 rounded-full bg-[#c2410c] px-2.5 py-1 text-[10px] font-black text-white shadow`}><BadgePercent className="h-3 w-3" aria-hidden="true" />Promotion</span>}
          {outOfStock && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-950/70 backdrop-blur-[2px]"><span className="rounded-full bg-rose-600 px-3.5 py-1.5 text-xs font-black text-white shadow-lg">Rupture de stock</span></div>}
          <div className="absolute right-2.5 top-2.5 z-20 flex items-center gap-1.5">
            <button type="button" onClick={onToggleFavorite} aria-pressed={isFavorite} aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} className={`flex h-9 items-center justify-center gap-1.5 rounded-full border border-white/70 px-2.5 shadow-sm backdrop-blur-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${isFavorite ? 'bg-[#FFFFFF] text-[#065f46]' : 'bg-[#FFFFFF]/90 text-[#47534b] hover:bg-white'}`}>
              <Bookmark className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} aria-hidden="true" />
              <span className="sr-only">{isFavorite ? 'Enregistré dans vos favoris' : 'Enregistrer ce produit'}</span>
            </button>
            <button type="button" onClick={onToggleLike} aria-pressed={isLiked} aria-label={`${isLiked ? 'Retirer votre mention J’aime' : 'Aimer ce produit'}${product.like_count ? `, ${product.like_count} mentions J’aime` : ''}`} title="J’aime" className={`flex h-9 min-w-9 items-center justify-center gap-1 rounded-full border border-white/70 px-2.5 shadow-sm backdrop-blur-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${isLiked ? 'bg-[#FFFFFF] text-[#c74445]' : 'bg-[#FFFFFF]/90 text-[#47534b] hover:bg-white'}`}>
              <Heart className={`h-4 w-4 ${isLiked ? 'fill-current' : ''}`} aria-hidden="true" />
              <span className="text-xs font-bold tabular-nums">{product.like_count || 0}</span>
            </button>
          </div>
        </div>
        {productImages.length > 1 && (
          <div aria-label={`Photos de ${productTitle}`} className="absolute bottom-2 left-2 z-20 flex max-w-[calc(100%-1rem)] gap-1 overflow-x-auto rounded-lg bg-slate-950/35 p-1 backdrop-blur-sm">
            {productImages.map(({ src, alt, fit }, index) => (
              <button key={`${product.id}-photo-${index}`} type="button" aria-label={`Afficher ${alt}`} aria-pressed={selectedImageIndex === index} onClick={() => setSelectedImageIndex(index)} className={`h-8 w-8 shrink-0 overflow-hidden rounded-md border bg-[#f4f1ea] p-0.5 sm:h-10 sm:w-10 ${selectedImageIndex === index ? 'border-white ring-1 ring-white' : 'border-white/40'}`}>
                <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className={`h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`} onError={(event) => { event.currentTarget.closest('button')?.remove(); }} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-2.5 sm:p-4">
        <h3 className="mb-1 line-clamp-2 text-[13px] font-extrabold leading-snug text-slate-900 sm:text-base">{productTitle}</h3>
        {description ? (
          <div className="mb-2 sm:mb-3">
            <p className={`text-[11px] leading-relaxed text-slate-600 sm:text-xs ${shouldTruncate && !isDescriptionExpanded ? 'line-clamp-3' : ''}`}>
              {shouldTruncate && !isDescriptionExpanded ? `${description.slice(0, 130)}...` : description}
            </p>
            {shouldTruncate && (
              <button type="button" onClick={onToggleDescription} className="mt-1 flex min-h-8 items-center gap-0.5 text-[10px] font-bold text-slate-800 hover:text-slate-950 sm:text-[11px]">
                <span>{isDescriptionExpanded ? 'Réduire' : 'Lire la suite'}</span>
                {isDescriptionExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            )}
          </div>
        ) : (
          <p className="mb-2 text-[10px] italic text-slate-500 sm:mb-3 sm:text-xs">Description à venir.</p>
        )}
        {hasProductOptions && (
          <details className="group mb-2 sm:mb-3">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-1 text-[11px] font-bold text-[#047857] sm:hidden [&::-webkit-details-marker]:hidden">
              <span>{category === 'food' && product.modifier_groups?.length ? 'Options du plat' : 'Options et détails'}</span>
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div className="hidden group-open:block sm:block">
              {category === 'fashion' && <div className="mb-2 grid grid-cols-1 gap-2 border-t border-slate-100 pt-2 sm:mb-3 sm:grid-cols-2">
                {product.sizes?.length ? <div className="min-w-0"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-[10px]">Taille :</span><div className="flex min-w-0 flex-wrap gap-1">{product.sizes.map((size) => <button key={size} type="button" onClick={() => onSelectSize(size)} className={`min-h-8 rounded-lg border px-2 py-1 text-[11px] font-bold transition-all sm:px-2.5 sm:text-xs ${activeSize === size ? 'border-slate-900 bg-slate-900 text-white shadow-xs' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>{size}</button>)}</div></div> : null}
                {product.colors?.length ? <div className="min-w-0"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-[10px]">Couleur :</span><div className="flex min-w-0 flex-wrap gap-1">{product.colors.map((color) => { const name = typeof color === 'string' ? color : color.name; return <button key={name} type="button" onClick={() => onSelectColor(name)} className={`min-h-8 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-all sm:px-2.5 sm:text-xs ${activeColor === name ? 'border-slate-900 bg-slate-100 font-bold text-slate-900 ring-1 ring-slate-900' : 'border-slate-200 bg-white text-slate-600'}`}>{name}</button>; })}</div></div> : null}
              </div>}

              {product.attributes && Object.entries(product.attributes).some(([, value]) => value.trim()) && <dl className="mb-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-100 pt-2 sm:mb-3">{Object.entries(product.attributes).filter(([, value]) => value.trim()).map(([key, value]) => { const field = categoryDefaults.productAttributes.find((candidate) => candidate.key === key); return field ? <div key={key} className="min-w-0 text-xs"><dt className="text-[10px] font-semibold text-slate-400">{field.label}</dt><dd className="truncate font-bold text-slate-700">{value}</dd></div> : null; })}</dl>}
              {category === 'food' && product.modifier_groups?.length ? <div className="mb-3 border-t border-slate-100 pt-2">{product.modifier_groups.map((group) => <div key={group.name}><span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{group.name} {group.max_selections && group.max_selections > 1 ? `(jusqu’à ${group.max_selections})` : '(1 choix)'} :</span><div className="flex flex-wrap gap-1.5">{group.options.map((option) => { const label = typeof option === 'string' ? option : option.label; const selected = activeModifiers.includes(label); return <button key={label} type="button" onClick={() => onToggleModifier(group.name, label, Math.max(1, group.max_selections || 1))} className={`min-h-9 rounded-lg border px-2.5 py-1 text-xs font-bold transition-all ${selected ? 'border-[#154F41] bg-[#1D6B57] text-white shadow-[2px_2px_0_rgba(21,79,65,0.2)]' : 'border-[#E4D9C8] bg-[#F7F3ED] text-[#292d2a] hover:bg-[#F5EADC]'}`}>{label}</button>; })}</div></div>)}</div> : null}
            </div>
          </details>
        )}
        <button type="button" onClick={onOpenTrust} className="inline-flex min-h-8 items-center gap-1 text-[10px] font-bold text-[#047857] hover:underline sm:gap-1.5 sm:text-[11px]"><MessageSquareText className="h-3.5 w-3.5" />Avis vérifiés · Signaler</button>

        <div className="mb-2 mt-auto flex items-center justify-between gap-1 border-t border-slate-100 pt-2 sm:mb-3 sm:items-baseline">
          <div className="min-w-0"><span className="hidden text-[11px] font-bold text-slate-400 sm:block">Prix unitaire</span><span className="whitespace-nowrap text-sm font-black tracking-tight sm:text-lg" style={{ color: isPromotion ? '#c2410c' : primaryColor }}>{formatFCFA(selectedUnitPrice)}</span>{isPromotion && <><span className="ml-1.5 whitespace-nowrap text-[10px] font-semibold text-slate-400 line-through">{formatFCFA(product.price + selectedModifierTotal)}</span>{product.sale_ends_at && <span className="mt-0.5 block text-[9px] font-semibold text-[#a53a1d]">Jusqu’au {new Date(product.sale_ends_at).toLocaleDateString('fr-FR')}</span>}</>}{selectedModifierTotal > 0 && <span className="mt-0.5 block text-[10px] font-medium text-slate-500">{formatFCFA(activeBasePrice)} + {formatFCFA(selectedModifierTotal)} de supplément</span>}</div>
          <div className="shrink-0 text-right">{outOfStock ? <span className="inline-block rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 sm:px-2 sm:text-[11px]">Épuisé</span> : product.stock <= 3 ? <span className="inline-block rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 sm:px-2 sm:text-[11px]"><span className="sm:hidden">{product.stock} restant{product.stock > 1 ? 's' : ''}</span><span className="hidden sm:inline">Plus que {product.stock} dispo</span></span> : <span className="inline-block rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 sm:px-2 sm:text-[11px]"><span className="sm:hidden">En stock</span><span className="hidden sm:inline">✓ En stock ({product.stock})</span></span>}</div>
        </div>

        {outOfStock ? <button disabled className="min-h-11 w-full rounded-xl bg-slate-100 px-2 py-2 text-xs font-bold text-slate-400 sm:px-4 sm:py-2.5 sm:text-sm">Indisponible</button> : quantityInCart > 0 ? <div className="flex min-h-11 items-center justify-between rounded-xl border border-slate-200 bg-slate-100 p-1"><button id={`qty-minus-${product.id}`} onClick={onDecreaseQuantity} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-700 shadow-2xs transition-colors hover:bg-slate-50" aria-label="Diminuer"><Minus className="h-4 w-4" /></button><span className="truncate px-1 text-xs font-extrabold text-slate-900 sm:px-2 sm:text-sm">{quantityInCart} au panier</span><button id={`qty-plus-${product.id}`} onClick={onAddToCart} disabled={quantityInCart >= product.stock} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:opacity-40" aria-label="Augmenter"><Plus className="h-4 w-4" /></button></div> : <button id={`add-btn-${product.id}`} onClick={onAddToCart} disabled={!isShopOpen} className="flex min-h-11 w-full items-center justify-center gap-1 rounded-xl border border-white/30 px-1.5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm" style={{ backgroundColor: primaryColor, boxShadow: `0 6px 16px ${primaryColor}35`, ...glowStyle }}><ShoppingBag className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span className="sm:hidden">Ajouter</span><span className="hidden sm:inline">Ajouter au panier</span></button>}
      </div>

      {isImageViewerOpen && selectedImage && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 p-3 text-white sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsImageViewerOpen(false);
          }}
        >
          <section
            ref={imageViewerDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Photos de ${productTitle}`}
            className="relative flex h-full max-h-[900px] w-full max-w-6xl flex-col"
          >
            <header className="flex min-h-12 items-center justify-between gap-3 pb-2">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold sm:text-base">{productTitle}</h2>
                {productImages.length > 1 && <p className="text-xs text-white/70">Photo {selectedImageIndex + 1} sur {productImages.length}</p>}
              </div>
              <button
                ref={imageViewerCloseRef}
                type="button"
                onClick={() => setIsImageViewerOpen(false)}
                aria-label="Fermer les photos"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>
            <div className="relative flex min-h-0 flex-1 items-center justify-center">
              <CategoryProductImage
                imageUrl={selectedImage.src}
                category={category}
                title={selectedImage.alt}
                showFallbackTitle={false}
                imageFit="contain"
                className="h-full max-h-full w-full max-w-full"
              />
              {productImages.length > 1 && (
                <>
                  <button type="button" onClick={showPreviousImage} aria-label="Photo précédente" className="absolute left-1 flex h-11 w-11 items-center justify-center rounded-full bg-slate-950/60 text-white ring-1 ring-white/30 hover:bg-slate-950/85 sm:left-4">
                    <ChevronDown className="h-5 w-5 rotate-90" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={showNextImage} aria-label="Photo suivante" className="absolute right-1 flex h-11 w-11 items-center justify-center rounded-full bg-slate-950/60 text-white ring-1 ring-white/30 hover:bg-slate-950/85 sm:right-4">
                    <ChevronDown className="h-5 w-5 -rotate-90" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
            {productImages.length > 1 && (
              <div className="flex justify-center gap-2 overflow-x-auto py-3" aria-label="Choisir une photo">
                {productImages.map((image, index) => (
                  <button
                    key={`${product.id}-viewer-photo-${index}`}
                    type="button"
                    onClick={() => setSelectedImageIndex(index)}
                    aria-label={`Afficher ${image.alt}`}
                    aria-pressed={selectedImageIndex === index}
                    className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-white/10 p-0.5 ${selectedImageIndex === index ? 'border-white ring-2 ring-white/60' : 'border-white/30'}`}
                  >
                    <img src={image.src} alt="" className={`h-full w-full ${image.fit === 'contain' ? 'object-contain' : 'object-cover'}`} />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>,
        document.body,
      )}
    </article>
  );
};
