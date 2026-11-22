import React, { useEffect, useState } from 'react';
import { getCategoryDefaults, normalizeProductImage, normalizeStoredProductImage } from '../utils/categoryDefaults';
import { getResponsiveImageProps } from '../utils/responsiveImages';
import { CategoryIcon } from './CategoryIcon';

interface CategoryProductImageProps {
  imageUrl?: string | null;
  category?: unknown;
  title: string;
  className?: string;
  imageFit?: 'cover' | 'contain';
  loading?: 'eager' | 'lazy';
  showFallbackTitle?: boolean;
  allowLegacyInlinePreview?: boolean;
  /** How wide the photo is displayed, for responsive image selection. */
  sizes?: string;
  children?: React.ReactNode;
}

export const CategoryProductImage: React.FC<CategoryProductImageProps> = ({
  imageUrl,
  category,
  title,
  className = '',
  imageFit = 'cover',
  loading = 'lazy',
  showFallbackTitle = false,
  allowLegacyInlinePreview = false,
  sizes = '(max-width: 1024px) 50vw, 27vw',
  children,
}) => {
  const defaults = getCategoryDefaults(category);
  const normalizedImage = allowLegacyInlinePreview
    ? normalizeStoredProductImage(imageUrl)
    : normalizeProductImage(imageUrl);
  const isPlaceholder = !normalizedImage;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [normalizedImage]);

  return (
    <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
      {/* Visuel de catégorie affiché tant qu’aucune photo n’est disponible. Le titre et
          l’état figurent déjà sous l’image dans les cartes : on ne les répète pas ici. */}
      <div aria-hidden="true" className="mt-photo-fallback absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 pb-[12%] text-center" style={{ backgroundColor: defaults.secondaryColor, color: defaults.primaryColor }}>
        <span className="mt-photo-fallback-icon grid aspect-square w-[34%] min-w-9 max-w-16 place-items-center rounded-[28%] bg-white/80 shadow-[0_1px_0_rgba(255,255,255,.9)_inset,0_6px_16px_-8px_currentColor]"><CategoryIcon category={typeof category === 'string' ? category : undefined} className="h-[55%] w-[55%]" /></span>
        {showFallbackTitle && <span className="line-clamp-2 max-w-full text-sm font-black">{title}</span>}
        {imageFailed && !isPlaceholder && <span className="text-[11px] font-semibold opacity-80">Photo indisponible</span>}
      </div>
      {normalizedImage && <img {...getResponsiveImageProps(normalizedImage)} sizes={sizes} alt={title} loading={loading} referrerPolicy="no-referrer" className={`relative z-10 h-full w-full ${imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} onError={(event) => { setImageFailed(true); event.currentTarget.hidden = true; }} />}
      {children}
    </div>
  );
};
