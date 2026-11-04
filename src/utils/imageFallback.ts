import type React from 'react';

const FALLBACK_IMAGE = '/brand-kit/monogram.svg';

export function handlePublicImageError(event: React.SyntheticEvent<HTMLImageElement>): void {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === 'true') {
    image.hidden = true;
    return;
  }
  image.dataset.fallbackApplied = 'true';
  image.src = FALLBACK_IMAGE;
  image.srcset = '';
  image.style.objectFit = 'contain';
  image.style.padding = '18%';
  image.style.backgroundColor = '#e9f5ee';
}
