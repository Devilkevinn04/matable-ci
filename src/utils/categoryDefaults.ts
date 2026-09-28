export const SHOP_CATEGORIES = [
  'fashion',
  'food',
  'beauty',
  'electronics',
  'home',
  'services',
  'health',
  'crafts',
  'education',
  'automotive',
  'other',
] as const;

export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

export interface CategoryDefaults {
  label: string;
  icon: string;
  welcomeMessage: string;
  catalogDescription: string;
  productTitlePlaceholder: string;
  productCategoryPlaceholder: string;
  productCategorySuggestions: string[];
  productDescriptionPlaceholder: string;
  productAttributesHeading: string;
  productAttributes: { key: string; label: string; placeholder: string }[];
  defaultProductSizes: string;
  defaultProductColors: string;
  defaultProductPrepTime?: number;
  defaultProductModifiers: string;
  productPlaceholderImageUrl: string;
  bannerPlaceholderImageUrl: string;
  primaryColor: string;
  secondaryColor: string;
  layoutStyle: 'grid_portrait' | 'card_landscape';
  productFormType: 'fashion' | 'food' | 'standard';
  brandDirection: 'luxe' | 'moderne' | 'authentique';
  themePresetId?: string;
}

const image = (photoId: string, width: number) =>
  `https://images.unsplash.com/${photoId}?w=${width}&auto=format&fit=crop&q=80`;

export const CATEGORY_DEFAULTS: Record<ShopCategory, CategoryDefaults> = {
  fashion: {
    label: 'Mode',
    icon: '👗',
    welcomeMessage: 'Bienvenue dans notre univers de mode : des pièces choisies avec soin pour révéler votre style.',
    catalogDescription: 'Présentez vos vêtements, accessoires, tailles et couleurs.',
    productTitlePlaceholder: 'Ex. : Robe en wax cousue à Abidjan',
    productCategoryPlaceholder: 'Ex. : Vêtements, chaussures, sacs',
    productCategorySuggestions: ['Vêtements', 'Chaussures', 'Sacs', 'Accessoires', 'Créations locales'],
    productDescriptionPlaceholder: 'Ex. : Wax de coton, coupe confortable et finitions soignées.',
    productAttributesHeading: 'Détails du vêtement',
    productAttributes: [
      { key: 'material', label: 'Matière', placeholder: 'Ex. : Wax de coton, lin, satin' },
      { key: 'fit', label: 'Coupe', placeholder: 'Ex. : Ajustée, ample, taille haute' },
    ],
    defaultProductSizes: 'S, M, L, XL',
    defaultProductColors: 'Noir, Rouge',
    defaultProductModifiers: '',
    productPlaceholderImageUrl: image('photo-1490481651871-ab68de25d43d', 600),
    bannerPlaceholderImageUrl: image('photo-1509631179647-0177331693ae', 1200),
    primaryColor: '#0F172A',
    secondaryColor: '#F8FAFC',
    layoutStyle: 'grid_portrait',
    productFormType: 'fashion',
    brandDirection: 'luxe',
    themePresetId: 'fashion_minimal',
  },
  food: {
    label: 'Restauration',
    icon: '🍲',
    welcomeMessage: 'Bienvenue à notre table ! Découvrez nos plats préparés avec soin et commandez vos envies du jour.',
    catalogDescription: 'Présentez vos plats, boissons, options et temps de préparation.',
    productTitlePlaceholder: 'Ex. : Poulet braisé et attiéké',
    productCategoryPlaceholder: 'Ex. : Grillades, boissons, desserts',
    productCategorySuggestions: ['Plats', 'Grillades', 'Boissons', 'Accompagnements', 'Desserts'],
    productDescriptionPlaceholder: 'Ex. : Poulet braisé servi avec attiéké frais et une sauce maison.',
    productAttributesHeading: 'Détails du plat',
    productAttributes: [
      { key: 'portion', label: 'Portion', placeholder: 'Ex. : 1 personne, 500 g, format familial' },
      { key: 'allergens', label: 'Allergènes ou régime', placeholder: 'Ex. : Arachides, végétarien, sans gluten' },
    ],
    defaultProductSizes: '',
    defaultProductColors: '',
    defaultProductPrepTime: 20,
    defaultProductModifiers: 'Sauce : Doux, Pimenté | Accompagnement : Alloco, Attiéké',
    productPlaceholderImageUrl: image('photo-1555939594-58d7cb561ad1', 600),
    bannerPlaceholderImageUrl: image('photo-1555939594-58d7cb561ad1', 1200),
    primaryColor: '#C2410C',
    secondaryColor: '#FEF2F2',
    layoutStyle: 'card_landscape',
    productFormType: 'food',
    brandDirection: 'authentique',
    themePresetId: 'food_braise',
  },
  beauty: {
    label: 'Beauté',
    icon: '✨',
    welcomeMessage: 'Bienvenue dans notre espace beauté : soins, coiffures et conseils pensés pour vous.',
    catalogDescription: 'Présentez vos soins, produits de beauté et prestations.',
    productTitlePlaceholder: 'Ex. : Soin hydratant au beurre de karité',
    productCategoryPlaceholder: 'Ex. : Soins, coiffure, maquillage',
    productCategorySuggestions: ['Soins', 'Coiffure', 'Maquillage', 'Parfums', 'Bien-être'],
    productDescriptionPlaceholder: 'Ex. : Un soin doux pour nourrir la peau et préserver son éclat.',
    productAttributesHeading: 'Détails du soin ou produit',
    productAttributes: [
      { key: 'care_type', label: 'Type de soin', placeholder: 'Ex. : Hydratant, coiffure, manucure' },
      { key: 'volume', label: 'Contenance ou durée', placeholder: 'Ex. : 250 ml, séance de 45 minutes' },
    ],
    defaultProductSizes: '',
    defaultProductColors: '',
    defaultProductModifiers: '',
    productPlaceholderImageUrl: image('photo-1522335789203-aabd1fc54bc9', 600),
    bannerPlaceholderImageUrl: image('photo-1522335789203-aabd1fc54bc9', 1200),
    primaryColor: '#9D174D',
    secondaryColor: '#FDF2F8',
    layoutStyle: 'grid_portrait',
    productFormType: 'standard',
    brandDirection: 'luxe',
  },
  electronics: {
    label: 'Électronique',
    icon: '💻',
    welcomeMessage: 'Bienvenue dans notre boutique tech : découvrez des équipements fiables et des conseils utiles.',
    catalogDescription: 'Présentez vos appareils, accessoires et équipements numériques.',
    productTitlePlaceholder: 'Ex. : Casque Bluetooth sans fil',
    productCategoryPlaceholder: 'Ex. : Téléphones, audio, informatique',
    productCategorySuggestions: ['Téléphones', 'Informatique', 'Audio', 'Accessoires', 'Équipements'],
    productDescriptionPlaceholder: 'Ex. : Connexion Bluetooth stable, autonomie longue durée et câble inclus.',
    productAttributesHeading: 'Caractéristiques techniques',
    productAttributes: [
      { key: 'brand', label: 'Marque', placeholder: 'Ex. : Samsung, Tecno, marque locale' },
      { key: 'model', label: 'Modèle ou référence', placeholder: 'Ex. : Galaxy A15, référence du fabricant' },
      { key: 'warranty', label: 'Garantie', placeholder: 'Ex. : 6 mois, échange sous 7 jours' },
    ],
    defaultProductSizes: '',
    defaultProductColors: '',
    defaultProductModifiers: '',
    productPlaceholderImageUrl: image('photo-1496181133206-80ce9b88a853', 600),
    bannerPlaceholderImageUrl: image('photo-1496181133206-80ce9b88a853', 1200),
    primaryColor: '#1D4ED8',
    secondaryColor: '#EFF6FF',
    layoutStyle: 'grid_portrait',
    productFormType: 'standard',
    brandDirection: 'moderne',
  },
  home: {
    label: 'Maison',
    icon: '🏠',
    welcomeMessage: 'Bienvenue chez nous : trouvez de quoi aménager, décorer et faire vivre votre intérieur.',
    catalogDescription: 'Présentez vos meubles, objets déco et essentiels de la maison.',
    productTitlePlaceholder: 'Ex. : Lampe de table en céramique',
    productCategoryPlaceholder: 'Ex. : Décoration, meubles, linge de maison',
    productCategorySuggestions: ['Décoration', 'Meubles', 'Linge de maison', 'Cuisine', 'Rangement'],
    productDescriptionPlaceholder: 'Ex. : Une pièce pratique aux finitions soignées, facile à intégrer chez vous.',
    productAttributesHeading: 'Détails de l’article',
    productAttributes: [
      { key: 'material', label: 'Matière', placeholder: 'Ex. : Bois d’iroko, rotin, coton' },
      { key: 'dimensions', label: 'Dimensions', placeholder: 'Ex. : 120 × 60 cm, hauteur 80 cm' },
    ],
    defaultProductSizes: '',
    defaultProductColors: '',
    defaultProductModifiers: '',
    productPlaceholderImageUrl: image('photo-1600210492486-724fe5c67fb0', 600),
    bannerPlaceholderImageUrl: image('photo-1600210492486-724fe5c67fb0', 1200),
    primaryColor: '#166534',
    secondaryColor: '#F0FDF4',
    layoutStyle: 'grid_portrait',
    productFormType: 'standard',
    brandDirection: 'authentique',
  },
  services: {
    label: 'Services',
    icon: '🧰',
    welcomeMessage: 'Bienvenue ! Découvrez nos services et contactez-nous pour trouver la solution adaptée à votre besoin.',
    catalogDescription: 'Présentez vos prestations, formules et services disponibles.',
    productTitlePlaceholder: 'Ex. : Installation et dépannage à domicile',
    productCategoryPlaceholder: 'Ex. : Réparation, entretien, conseil',
    productCategorySuggestions: ['Réparation', 'Entretien', 'Conseil', 'Livraison', 'Prestations'],
    productDescriptionPlaceholder: 'Ex. : Intervention sur rendez-vous, avec devis clair avant travaux.',
    productAttributesHeading: 'Détails de la prestation',
    productAttributes: [
      { key: 'duration', label: 'Durée estimée', placeholder: 'Ex. : 1 heure, une demi-journée' },
      { key: 'service_area', label: 'Zone d’intervention', placeholder: 'Ex. : Cocody, Abidjan, à distance' },
    ],
    defaultProductSizes: '',
    defaultProductColors: '',
    defaultProductModifiers: '',
    productPlaceholderImageUrl: image('photo-1454165804606-c3d57bc86b40', 600),
    bannerPlaceholderImageUrl: image('photo-1454165804606-c3d57bc86b40', 1200),
    primaryColor: '#0F766E',
    secondaryColor: '#F0FDFA',
    layoutStyle: 'card_landscape',
    productFormType: 'standard',
    brandDirection: 'moderne',
  },
  health: {
    label: 'Santé',
    icon: '💚',
    welcomeMessage: 'Bienvenue dans notre espace santé : des produits et services sélectionnés avec attention.',
    catalogDescription: 'Présentez vos produits de santé, de soin et de prévention.',
    productTitlePlaceholder: 'Ex. : Tensiomètre numérique',
    productCategoryPlaceholder: 'Ex. : Parapharmacie, prévention, matériel',
    productCategorySuggestions: ['Parapharmacie', 'Prévention', 'Matériel', 'Hygiène', 'Soins'],
    productDescriptionPlaceholder: 'Ex. : Simple à utiliser, avec affichage lisible et guide de prise en main.',
    productAttributesHeading: 'Informations produit',
    productAttributes: [
      { key: 'format', label: 'Format ou dosage', placeholder: 'Ex. : 20 comprimés, 100 ml, taille M' },
      { key: 'usage', label: 'Usage principal', placeholder: 'Ex. : Hygiène, soin, prévention' },
    ],
    defaultProductSizes: '',
    defaultProductColors: '',
    defaultProductModifiers: '',
    productPlaceholderImageUrl: image('photo-1576091160399-112ba8d25d1d', 600),
    bannerPlaceholderImageUrl: image('photo-1576091160399-112ba8d25d1d', 1200),
    primaryColor: '#047857',
    secondaryColor: '#ECFDF5',
    layoutStyle: 'grid_portrait',
    productFormType: 'standard',
    brandDirection: 'authentique',
  },
  crafts: {
    label: 'Artisanat',
    icon: '🧵',
    welcomeMessage: 'Bienvenue dans notre atelier : découvrez des créations façonnées avec patience et savoir-faire.',
    catalogDescription: 'Présentez vos créations artisanales et pièces fabriquées à la main.',
    productTitlePlaceholder: 'Ex. : Panier tressé à la main',
    productCategoryPlaceholder: 'Ex. : Bijoux, textile, vannerie',
    productCategorySuggestions: ['Bijoux', 'Textile', 'Vannerie', 'Céramique', 'Objets faits main'],
    productDescriptionPlaceholder: 'Ex. : Pièce réalisée à la main, chaque détail peut varier légèrement.',
    productAttributesHeading: 'Détails de fabrication',
    productAttributes: [
      { key: 'material', label: 'Matières utilisées', placeholder: 'Ex. : Perles, coton, bois local' },
      { key: 'craft_method', label: 'Fabrication', placeholder: 'Ex. : Tissé à la main à Grand-Bassam' },
    ],
    defaultProductSizes: '',
    defaultProductColors: '',
    defaultProductModifiers: '',
    productPlaceholderImageUrl: image('photo-1452860606245-08befc0ff44b', 600),
    bannerPlaceholderImageUrl: image('photo-1452860606245-08befc0ff44b', 1200),
    primaryColor: '#A16207',
    secondaryColor: '#FEFCE8',
    layoutStyle: 'grid_portrait',
    productFormType: 'standard',
    brandDirection: 'authentique',
  },
  education: {
    label: 'Éducation',
    icon: '📚',
    welcomeMessage: 'Bienvenue ! Explorez nos cours et ressources pour apprendre, progresser et atteindre vos objectifs.',
    catalogDescription: 'Présentez vos cours, formations, livres et ressources pédagogiques.',
    productTitlePlaceholder: 'Ex. : Formation Excel pour débutants',
    productCategoryPlaceholder: 'Ex. : Cours, ateliers, supports',
    productCategorySuggestions: ['Cours', 'Formations', 'Ateliers', 'Livres', 'Ressources'],
    productDescriptionPlaceholder: 'Ex. : Un parcours pratique avec exercices et accompagnement étape par étape.',
    productAttributesHeading: 'Détails du cours ou support',
    productAttributes: [
      { key: 'level', label: 'Niveau', placeholder: 'Ex. : Débutant, intermédiaire, avancé' },
      { key: 'duration', label: 'Durée', placeholder: 'Ex. : 4 semaines, 12 heures' },
      { key: 'format', label: 'Format', placeholder: 'Ex. : En ligne, présentiel à Cocody' },
    ],
    defaultProductSizes: '',
    defaultProductColors: '',
    defaultProductModifiers: '',
    productPlaceholderImageUrl: image('photo-1503676260728-1c00da094a0b', 600),
    bannerPlaceholderImageUrl: image('photo-1503676260728-1c00da094a0b', 1200),
    primaryColor: '#6D28D9',
    secondaryColor: '#F5F3FF',
    layoutStyle: 'card_landscape',
    productFormType: 'standard',
    brandDirection: 'moderne',
  },
  automotive: {
    label: 'Automobile',
    icon: '🚗',
    welcomeMessage: 'Bienvenue chez nous : pièces, accessoires et services pour vous accompagner sur la route.',
    catalogDescription: 'Présentez vos pièces, accessoires et services automobiles.',
    productTitlePlaceholder: 'Ex. : Batterie automobile 12 V',
    productCategoryPlaceholder: 'Ex. : Pièces, entretien, accessoires',
    productCategorySuggestions: ['Pièces détachées', 'Entretien', 'Accessoires', 'Pneumatiques', 'Mobilité'],
    productDescriptionPlaceholder: 'Ex. : Compatible avec plusieurs modèles ; vérifiez la référence avant commande.',
    productAttributesHeading: 'Compatibilité et état',
    productAttributes: [
      { key: 'brand', label: 'Marque compatible', placeholder: 'Ex. : Toyota, Peugeot, toutes marques' },
      { key: 'model_year', label: 'Modèle et année', placeholder: 'Ex. : Corolla 2015–2019' },
      { key: 'condition', label: 'État', placeholder: 'Ex. : Neuf, reconditionné, occasion' },
    ],
    defaultProductSizes: '',
    defaultProductColors: '',
    defaultProductModifiers: '',
    productPlaceholderImageUrl: image('photo-1492144534655-ae79c964c9d7', 600),
    bannerPlaceholderImageUrl: image('photo-1492144534655-ae79c964c9d7', 1200),
    primaryColor: '#B91C1C',
    secondaryColor: '#FEF2F2',
    layoutStyle: 'grid_portrait',
    productFormType: 'standard',
    brandDirection: 'moderne',
  },
  other: {
    label: 'Commerce local',
    icon: '🏪',
    welcomeMessage: 'Bienvenue dans notre boutique ! Découvrez notre sélection et contactez-nous pour toute question.',
    catalogDescription: 'Présentez vos produits, offres et articles du moment.',
    productTitlePlaceholder: 'Ex. : Article disponible en boutique',
    productCategoryPlaceholder: 'Ex. : Nouveautés, offres, accessoires',
    productCategorySuggestions: ['Nouveautés', 'Offres', 'Accessoires', 'Sélection du moment'],
    productDescriptionPlaceholder: 'Ajoutez quelques détails utiles pour aider vos clients à choisir.',
    productAttributesHeading: 'Détails complémentaires',
    productAttributes: [
      { key: 'origin', label: 'Origine ou marque', placeholder: 'Ex. : Fabriqué en Côte d’Ivoire' },
      { key: 'reference', label: 'Référence ou particularité', placeholder: 'Ex. : Format, compatibilité, usage' },
    ],
    defaultProductSizes: '',
    defaultProductColors: '',
    defaultProductModifiers: '',
    productPlaceholderImageUrl: image('photo-1497366754035-f200968a6e72', 600),
    bannerPlaceholderImageUrl: image('photo-1497366754035-f200968a6e72', 1200),
    primaryColor: '#334155',
    secondaryColor: '#F1F5F9',
    layoutStyle: 'grid_portrait',
    productFormType: 'standard',
    brandDirection: 'moderne',
  },
};

export const LEGACY_PRODUCT_PLACEHOLDER_IMAGES = [
  'photo-1523275335684-37898b6baf30',
  'photo-1544025162-d76694265947',
] as const;
export const LEGACY_DEFAULT_BANNER_IMAGES = [
  'photo-1490481651871-ab68de25d43d',
  'photo-1555939594-58d7cb561ad1',
] as const;
export const LEGACY_GENERIC_WELCOME_MESSAGE = 'Découvrez notre collection raffinée livrée en toute discrétion à Abidjan.';

export function isShopCategory(category: unknown): category is ShopCategory {
  return typeof category === 'string' && SHOP_CATEGORIES.includes(category as ShopCategory);
}

export function getCategoryDefaults(category: unknown): CategoryDefaults {
  return CATEGORY_DEFAULTS[isShopCategory(category) ? category : 'other'];
}

export function getWelcomeMessageForDisplay(message: unknown, category: unknown): string {
  if (typeof message !== 'string') return getCategoryDefaults(category).welcomeMessage;
  return message.trim() === LEGACY_GENERIC_WELCOME_MESSAGE
    ? getCategoryDefaults(category).welcomeMessage
    : message;
}

export function normalizeWelcomeMessage(message: unknown, category: unknown): string {
  const normalized = typeof message === 'string' ? message.trim() : '';
  return normalized ? getWelcomeMessageForDisplay(normalized, category) : getCategoryDefaults(category).welcomeMessage;
}

export function isLegacyGenericProductImage(imageUrl: unknown): boolean {
  return typeof imageUrl === 'string' && LEGACY_PRODUCT_PLACEHOLDER_IMAGES.some((photoId) => imageUrl.includes(photoId));
}

export function normalizeProductImage(imageUrl: unknown): string {
  if (typeof imageUrl !== 'string') return '';
  const normalized = imageUrl.trim();
  return isLegacyGenericProductImage(normalized) ? '' : normalized;
}

export function getProductImageForDisplay(imageUrl: unknown, category: unknown): string {
  const storedImage = normalizeProductImage(imageUrl);
  return storedImage && !isLegacyGenericProductImage(storedImage)
    ? storedImage
    : getCategoryDefaults(category).productPlaceholderImageUrl;
}

export function normalizeCustomBannerImage(imageUrl: unknown, category: unknown): string {
  if (typeof imageUrl !== 'string') return '';
  const normalized = imageUrl.trim();
  return LEGACY_DEFAULT_BANNER_IMAGES.some((photoId) => normalized.includes(photoId))
    ? ''
    : normalized;
}

export function getBannerImageForDisplay(imageUrl: unknown, category: unknown): string {
  const normalized = typeof imageUrl === 'string' ? imageUrl.trim() : '';
  return normalizeCustomBannerImage(normalized, category) || getCategoryDefaults(category).bannerPlaceholderImageUrl;
}