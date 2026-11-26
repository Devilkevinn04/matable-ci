import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import type { ShopCategory } from '../types';
import type { ProductDisplayImage } from '../utils/productDisplayImages';
import { lockBodyScroll } from '../utils/scrollLock';
import { CategoryProductImage } from './CategoryProductImage';

interface ProductImageViewerProps {
  images: ProductDisplayImage[];
  index: number;
  category: ShopCategory;
  title: string;
  onClose: () => void;
  onSelect: (index: number) => void;
}

/** Full-screen photo viewer shared by desktop cards and mobile compact cards. */
export const ProductImageViewer: React.FC<ProductImageViewerProps> = ({
  images,
  index,
  category,
  title,
  onClose,
  onSelect,
}) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const touchStartX = useRef<number | null>(null);
  const handlersRef = useRef({ onClose, onSelect });
  handlersRef.current = { onClose, onSelect };
  const stateRef = useRef({ index, imagesLength: images.length });
  stateRef.current = { index, imagesLength: images.length };
  const selectedImage = images[index];
  const hasSeveralImages = images.length > 1;

  const showPrevious = () => {
    handlersRef.current.onSelect((index - 1 + images.length) % images.length);
  };
  const showNext = () => {
    handlersRef.current.onSelect((index + 1) % images.length);
  };

  useEffect(() => {
    if (!selectedImage) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlockScroll = lockBodyScroll();
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handlersRef.current.onClose();
      const { index: currentIndex, imagesLength } = stateRef.current;
      if (imagesLength < 2) return;
      if (event.key === 'ArrowRight') handlersRef.current.onSelect((currentIndex + 1) % imagesLength);
      if (event.key === 'ArrowLeft') handlersRef.current.onSelect((currentIndex - 1 + imagesLength) % imagesLength);
      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      unlockScroll();
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  if (!selectedImage || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 p-3 text-white sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Photos de ${title}`}
        className="relative flex h-full max-h-[900px] w-full max-w-6xl flex-col"
      >
        <header className="flex min-h-12 items-center justify-between gap-3 pb-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold sm:text-base">{title}</h2>
            {hasSeveralImages && <p className="text-xs text-white/70">Photo {index + 1} sur {images.length}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer les photos"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div
          className="relative flex min-h-0 flex-1 items-center justify-center"
          onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
          onTouchEnd={(event) => {
            const startX = touchStartX.current;
            touchStartX.current = null;
            if (startX === null || !hasSeveralImages) return;
            const delta = (event.changedTouches[0]?.clientX ?? startX) - startX;
            if (Math.abs(delta) < 40) return;
            if (delta < 0) showNext();
            else showPrevious();
          }}
        >
          <CategoryProductImage
            imageUrl={selectedImage.src}
            category={category}
            title={selectedImage.alt}
            showFallbackTitle={false}
            imageFit="contain"
            sizes="100vw"
            className="h-full max-h-full w-full max-w-full"
          />
          {hasSeveralImages && (
            <>
              <button type="button" onClick={showPrevious} aria-label="Photo précédente" className="absolute left-1 flex h-11 w-11 items-center justify-center rounded-full bg-slate-950/60 text-white ring-1 ring-white/30 hover:bg-slate-950/85 sm:left-4">
                <ChevronDown className="h-5 w-5 rotate-90" aria-hidden="true" />
              </button>
              <button type="button" onClick={showNext} aria-label="Photo suivante" className="absolute right-1 flex h-11 w-11 items-center justify-center rounded-full bg-slate-950/60 text-white ring-1 ring-white/30 hover:bg-slate-950/85 sm:right-4">
                <ChevronDown className="h-5 w-5 -rotate-90" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
        {hasSeveralImages && (
          <div className="flex justify-center gap-2 overflow-x-auto py-3" aria-label="Choisir une photo">
            {images.map((image, imageIndex) => (
              <button
                key={`viewer-photo-${imageIndex}`}
                type="button"
                onClick={() => onSelect(imageIndex)}
                aria-label={`Afficher ${image.alt}`}
                aria-pressed={index === imageIndex}
                className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-white/10 p-0.5 ${index === imageIndex ? 'border-white ring-2 ring-white/60' : 'border-white/30'}`}
              >
                <img src={image.src} alt="" className={`h-full w-full ${image.fit === 'contain' ? 'object-contain' : 'object-cover'}`} />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
};
