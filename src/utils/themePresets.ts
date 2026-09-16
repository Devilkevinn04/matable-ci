import { ThemeConfig, ShopCategory, SubscriptionTier } from '../types';

export interface ThemePreset {
  id: string;
  name: string;
  category: ShopCategory;
  description: string;
  config: ThemeConfig;
  previewGradient: string;
  badge: string;
}

export const SUBSCRIPTION_POLICY = {
  standard: {
    label: 'Standard',
    description: 'Vitrine, catalogue, commandes WhatsApp, stock et thème de base.',
    features: ['Vitrine publique', 'Catalogue et stock', 'Commandes Wave/Mobile Money', 'Logo de boutique', 'Couleurs et police de base'],
  },
  premium: {
    label: 'Premium',
    description: 'Tout Standard, avec personnalisation commerciale et promotions.',
    features: ['Tout Standard', 'Galerie de thèmes Premium', 'Bannière personnalisée', 'Bandeau promotionnel', 'Studio Marketing 9:16'],
  },
  pro: {
    label: 'Pro',
    description: 'Tout Premium, avec contrôle visuel avancé et thèmes Elite.',
    features: ['Tout Premium', 'Thèmes Pro / Elite', 'CSS avancé', 'Arrondis et ombres personnalisés', 'Halo lumineux des boutons'],
  },
} as const;

export const FASHION_PRESETS: ThemePreset[] = [
  {
    id: 'fashion_minimal',
    name: 'Minimaliste & Épuré (Abidjan Chic)',
    category: 'fashion',
    description: 'Typographie sobre, grand espace blanc, mise en valeur des coupes et matières.',
    previewGradient: 'from-slate-900 to-slate-700',
    badge: 'Standard & +',
    config: {
      primary_color: '#0F172A',
      secondary_color: '#F8FAFC',
      font_family: 'Plus Jakarta Sans',
      layout_style: 'grid_portrait',
      theme_preset_id: 'fashion_minimal',
      custom_banner_url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200&auto=format&fit=crop&q=80',
      event_mode_enabled: false,
      advanced_css: {
        borderRadius: 'rounded-xl',
        shadowIntensity: 'subtle',
        accentGlow: false,
      },
    },
  },
  {
    id: 'fashion_wax',
    name: 'Haute Couture & Wax Moderne',
    category: 'fashion',
    description: 'Palette chaude framboise/or, finitions arrondies, ambiance boutique créateur.',
    previewGradient: 'from-rose-600 to-amber-500',
    badge: 'Premium & Pro',
    config: {
      primary_color: '#E11D48',
      secondary_color: '#FFF1F2',
      font_family: 'Poppins',
      layout_style: 'grid_portrait',
      theme_preset_id: 'fashion_wax',
      custom_banner_url: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=1200&auto=format&fit=crop&q=80',
      event_mode_enabled: false,
      advanced_css: {
        borderRadius: 'rounded-2xl',
        shadowIntensity: 'soft',
        accentGlow: true,
      },
    },
  },
  {
    id: 'fashion_luxe',
    name: 'Palais de la Soie & Lingerie Fine',
    category: 'fashion',
    description: 'Typographie serif élégante (Playfair), contrastes profonds, lookbook immersif.',
    previewGradient: 'from-amber-700 to-rose-950',
    badge: 'Pro / Elite',
    config: {
      primary_color: '#9F1239',
      secondary_color: '#FFF7ED',
      font_family: 'Playfair Display',
      layout_style: 'grid_portrait',
      theme_preset_id: 'fashion_luxe',
      custom_banner_url: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=1200&auto=format&fit=crop&q=80',
      event_mode_enabled: true,
      event_banner_text: '✨ NOUVELLE COLLECTION SOIE & DENTELLE — ÉDITION LIMITÉE DISPONIBLE',
      advanced_css: {
        borderRadius: 'rounded-3xl',
        shadowIntensity: 'strong',
        accentGlow: true,
      },
    },
  },
];

export const FOOD_PRESETS: ThemePreset[] = [
  {
    id: 'food_braise',
    name: 'Grillades au Feu de Bois & Attiéké',
    category: 'food',
    description: 'Ambiance chaleureuse braisée, rouge piment et accents dorés croustillants.',
    previewGradient: 'from-amber-600 to-red-700',
    badge: 'Standard & +',
    config: {
      primary_color: '#C2410C', // Orange braise
      secondary_color: '#FEF2F2',
      font_family: 'Plus Jakarta Sans',
      layout_style: 'card_landscape',
      theme_preset_id: 'food_braise',
      custom_banner_url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1200&auto=format&fit=crop&q=80',
      event_mode_enabled: false,
      advanced_css: {
        borderRadius: 'rounded-xl',
        shadowIntensity: 'subtle',
        accentGlow: false,
      },
    },
  },
  {
    id: 'food_bistro',
    name: 'Bistrot d\'Abidjan & Terroir',
    category: 'food',
    description: 'Vert forêt naturel et typographie soignée, idéal pour traiteurs et cuisine raffinée.',
    previewGradient: 'from-emerald-700 to-teal-900',
    badge: 'Premium & Pro',
    config: {
      primary_color: '#15803D',
      secondary_color: '#F0FDF4',
      font_family: 'Playfair Display',
      layout_style: 'card_landscape',
      theme_preset_id: 'food_bistro',
      custom_banner_url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80',
      event_mode_enabled: false,
      advanced_css: {
        borderRadius: 'rounded-2xl',
        shadowIntensity: 'soft',
        accentGlow: true,
      },
    },
  },
  {
    id: 'food_street',
    name: 'Street Food Babi & Fast-Good',
    category: 'food',
    description: 'Jaune mangue & ambre dynamique, badges préparation minute et sauces au choix.',
    previewGradient: 'from-amber-500 to-orange-600',
    badge: 'Pro / Elite',
    config: {
      primary_color: '#D97706',
      secondary_color: '#FFFBEB',
      font_family: 'Poppins',
      layout_style: 'card_landscape',
      theme_preset_id: 'food_street',
      custom_banner_url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&auto=format&fit=crop&q=80',
      event_mode_enabled: true,
      event_banner_text: '🍗 OFFRE DU CHEF : ALLÔ BRAISAGE ! -20% SUR TOUT POULET FERMIER CE SOIR',
      advanced_css: {
        borderRadius: 'rounded-2xl',
        shadowIntensity: 'strong',
        accentGlow: true,
      },
    },
  },
];

export function getDefaultThemeForCategory(category: ShopCategory): ThemeConfig {
  if (category === 'food') {
    return { ...FOOD_PRESETS[0].config };
  }
  return { ...FASHION_PRESETS[0].config };
}

export function getAllPresetsForCategory(category: ShopCategory): ThemePreset[] {
  return category === 'food' ? FOOD_PRESETS : FASHION_PRESETS;
}

export function isFeatureAllowed(tier: SubscriptionTier, feature: 'preset_gallery' | 'custom_banner' | 'event_banner' | 'advanced_css'): boolean {
  return true;
}

// Size guide table for Abidjan / Côte d'Ivoire
export const SIZE_GUIDE_DATA = [
  { size: 'S (36-38)', chest: '82 - 88 cm', waist: '64 - 70 cm', hips: '88 - 94 cm', notes: 'Morphologie fine / ajustée' },
  { size: 'M (40-42)', chest: '89 - 96 cm', waist: '71 - 78 cm', hips: '95 - 102 cm', notes: 'Taille standard ivoirienne' },
  { size: 'L (44-46)', chest: '97 - 106 cm', waist: '79 - 88 cm', hips: '103 - 112 cm', notes: 'Coupe galbante confortable' },
  { size: 'XL (48-50)', chest: '107 - 118 cm', waist: '89 - 100 cm', hips: '113 - 124 cm', notes: 'Formes généreuses / wax ample' },
];

// Delivery time slots for food
export const FOOD_DELIVERY_SLOTS = [
  'Dès que possible (Préparation minute ⚡)',
  'Midi : 12h00 - 13h00',
  'Après-midi : 13h30 - 15h00',
  'Soir / Dîner : 19h00 - 20h30',
  'Fin de soirée : 21h00 - 22h30',
];
