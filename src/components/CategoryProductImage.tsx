import React from 'react';
import { getCategoryDefaults, getProductImageForDisplay, normalizeProductImage } from '../utils/categoryDefaults';

interface CategoryProductImageProps {
  imageUrl?: string | null;
  category?: unknown;
  title: string;
  className?: string;
  loading?: 'eager' | 'lazy';
  children?: React.ReactNode;
}

export const CategoryProductImage: React.FC<CategoryProductImageProps> = ({
  imageUrl,
  category,
  title,
  className = '',
  loading = 'lazy',
  children,
}) => {
  const defaults = getCategoryDefaults(category);
  const isPlaceholder = !normalizeProductImage(imageUrl);
  const placeholderUrl = defaults.productPlaceholderImageUrl;

  return (
    <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
      <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-100 text-slate-500">
        <span className="text-2xl">{defaults.icon}</span>
        <span className="text-[10px] font-semibold">{defaults.label}</span>
      </div>
      <img
        src={getProductImageForDisplay(imageUrl, category)}
        alt={isPlaceholder ? `Illustration indicative : ${defaults.label}` : title}
        loading={loading}
        referrerPolicy="no-referrer"
        className="relative z-10 h-full w-full object-cover"
        onError={(event) => {
          const element = event.currentTarget;
          if (element.dataset.placeholderAttempted !== 'true' && element.src !== placeholderUrl) {
            element.dataset.placeholderAttempted = 'true';
            element.src = placeholderUrl;
            element.alt = `Illustration indicative : ${defaults.label}`;
            return;
          }
          element.hidden = true;
        }}
      />
      {children}
    </div>
  );
};
