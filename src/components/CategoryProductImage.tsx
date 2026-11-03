import React, { useEffect, useState } from 'react';
import { getCategoryDefaults, normalizeProductImage } from '../utils/categoryDefaults';
import { getResponsiveImageProps } from '../utils/responsiveImages';

interface CategoryProductImageProps {
  imageUrl?: string | null;
  category?: unknown;
  title: string;
  className?: string;
  imageFit?: 'cover' | 'contain';
  loading?: 'eager' | 'lazy';
  showFallbackTitle?: boolean;
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
  showFallbackTitle = true,
  sizes = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw',
  children,
}) => {
  const defaults = getCategoryDefaults(category);
  const normalizedImage = normalizeProductImage(imageUrl);
  const isPlaceholder = !normalizedImage;
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [normalizedImage]);

  return (
    <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
      <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center" style={{ backgroundColor: defaults.secondaryColor, color: defaults.primaryColor }}>
        <span className="grid h-16 w-16 place-items-center rounded-2xl border border-current/15 bg-white/75 text-4xl">{defaults.icon}</span>
        {showFallbackTitle && <span className="line-clamp-2 max-w-full text-sm font-black">{title}</span>}
        {(isPlaceholder || imageFailed) && <span className="text-[10px] font-bold uppercase">{isPlaceholder ? 'Photo à venir' : 'Photo indisponible'} · {defaults.label}</span>}
      </div>
      {normalizedImage && <img {...getResponsiveImageProps(normalizedImage)} sizes={sizes} alt={title} loading={loading} referrerPolicy="no-referrer" className={`relative z-10 h-full w-full ${imageFit === 'contain' ? 'object-contain' : 'object-cover'}`} onError={(event) => { setImageFailed(true); event.currentTarget.hidden = true; }} />}
      {children}
    </div>
  );
};
