import React from 'react';
import { BadgePercent, Megaphone, Rocket, Sparkles, Star, Zap } from 'lucide-react';
import type { ShopEventType } from '../types';

const EVENT_ICONS: Record<ShopEventType, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  sales: BadgePercent,
  flash_sale: Zap,
  new_arrival: Sparkles,
  launch: Rocket,
  special_offer: Star,
  custom: Megaphone,
};

interface ShopEventIconProps {
  type: ShopEventType;
  className?: string;
}

export const ShopEventIcon: React.FC<ShopEventIconProps> = ({ type, className = 'h-4 w-4' }) => {
  const Icon = EVENT_ICONS[type] || Megaphone;
  return <Icon className={className} aria-hidden />;
};
