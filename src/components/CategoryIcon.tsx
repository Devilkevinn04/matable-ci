import React from 'react';
import {
  BookOpen,
  Car,
  HeartPulse,
  Home,
  Laptop,
  Scissors,
  Shirt,
  Sparkles,
  Store,
  UtensilsCrossed,
  Wrench,
} from 'lucide-react';
import type { ShopCategory } from '../utils/categoryDefaults';

const CATEGORY_ICONS: Record<ShopCategory, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  fashion: Shirt,
  food: UtensilsCrossed,
  beauty: Sparkles,
  electronics: Laptop,
  home: Home,
  services: Wrench,
  health: HeartPulse,
  crafts: Scissors,
  education: BookOpen,
  automotive: Car,
  other: Store,
};

interface CategoryIconProps {
  category?: string | null;
  className?: string;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({ category, className = 'h-4 w-4' }) => {
  const Icon = CATEGORY_ICONS[category as ShopCategory] || Store;
  return <Icon className={className} aria-hidden />;
};
