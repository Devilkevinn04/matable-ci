import { Product, ShopCategory } from '../../types';
import { getCategoryDefaults, isLegacyGenericProductImage } from '../../utils/categoryDefaults';

export interface ProductDraft {
  title: string;
  category: string;
  description: string;
  price: number | '';
  stock: number | '';
  image_url: string;
  lookbook_image: string;
  gallery_images: string[];
  sizes: string;
  colors: string;
  prep_time: number | '';
  modifiers: string;
  modifier_max_selections: number | '';
  attributes: Record<string, string>;
  is_available: boolean;
}

interface ProductModifierDraftOption {
  id: string;
  name: string;
  label: string;
  price_delta: number;
}

interface ProductModifierDraftGroup {
  id: string;
  name: string;
  required: boolean;
  max_selections: number;
  options: ProductModifierDraftOption[];
}

export interface ProductSavePayload {
  title: string;
  category?: string;
  description: string;
  price: number;
  stock: number;
  image_url: string;
  lookbook_image?: string;
  gallery_images?: string[];
  sizes?: string[];
  colors?: string[];
  prep_time?: number;
  modifier_groups?: ProductModifierDraftGroup[];
  attributes?: Record<string, string>;
  is_available: boolean;
}

export interface ProductModifierGroupDraft {
  name: string;
  options: string[];
}

export function parseProductModifierGroups(value: string): ProductModifierGroupDraft[] {
  if (!value.trim()) return [];

  return value.split('|').map((groupText, groupIndex) => {
    const parts = groupText.split(':');
    const name = parts.length > 1 ? parts[0].trim() : `Options ${groupIndex + 1}`;
    const optionText = parts.length > 1 ? parts[1] : parts[0];

    return {
      name,
      options: optionText.split(',').map((option) => option.trim()).filter(Boolean),
    };
  });
}

export function serializeProductModifierGroups(groups: ProductModifierGroupDraft[]): string {
  return groups.map((group, index) => {
    const name = group.name.trim() || `Options ${index + 1}`;
    const options = group.options.map((option) => option.trim()).filter(Boolean).join(', ');
    return `${name}: ${options}`;
  }).join(' | ');
}

export function createProductDraft(category: unknown): ProductDraft {
  const defaults = getCategoryDefaults(category);
  return {
    title: '',
    category: '',
    description: '',
    price: '',
    stock: 10,
    image_url: '',
    lookbook_image: '',
    gallery_images: [],
    sizes: defaults.defaultProductSizes,
    colors: defaults.defaultProductColors,
    prep_time: defaults.defaultProductPrepTime ?? '',
    modifiers: defaults.defaultProductModifiers,
    modifier_max_selections: 2,
    attributes: {},
    is_available: true,
  };
}

export function productToDraft(product: Product): ProductDraft {
  const modifiers = Array.isArray(product.modifier_groups)
    ? product.modifier_groups.map((group) => {
        const optionLabels = group.options.map((option) => {
          if (typeof option === 'string' || !option.price_delta || /\(\+\s*[\d\s.,]+\s*(?:F(?:CFA)?)?\)$/i.test(option.label)) {
            return typeof option === 'string' ? option : option.label;
          }
          return `${option.label} (+${option.price_delta} F)`;
        }).join(', ');
        return `${group.name}: ${optionLabels}`;
      }).join(' | ')
    : '';

  return {
    title: product.title,
    category: product.category || '',
    description: product.description || '',
    price: product.price,
    stock: product.stock,
    image_url: isLegacyGenericProductImage(product.image_url) ? '' : product.image_url,
    lookbook_image: product.lookbook_image || '',
    gallery_images: product.gallery_images || [],
    sizes: product.sizes ? product.sizes.join(', ') : '',
    colors: Array.isArray(product.colors)
      ? product.colors.map((color) => typeof color === 'string' ? color : color.name).join(', ')
      : '',
    prep_time: product.prep_time || '',
    modifiers,
    modifier_max_selections: product.modifier_groups?.[0]?.max_selections || 2,
    attributes: product.attributes || {},
    is_available: product.is_available !== false,
  };
}

export function buildProductSavePayload(draft: ProductDraft, category: ShopCategory): ProductSavePayload {
  const parseList = (value: string) => value
    ? value.split(',').map((item) => item.trim()).filter(Boolean)
    : undefined;
  const defaults = getCategoryDefaults(category);
  const allowedAttributeKeys = new Set(defaults.productAttributes.map((field) => field.key));
  const attributes = Object.fromEntries(
    Object.entries(draft.attributes)
      .filter(([key, value]) => allowedAttributeKeys.has(key) && typeof value === 'string')
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value),
  );
  let modifierGroups: ProductModifierDraftGroup[] | undefined;

  if (defaults.productFormType === 'food' && draft.modifiers.trim()) {
    const maxSelections = Math.min(5, Math.max(1, Number(draft.modifier_max_selections) || 1));
    modifierGroups = draft.modifiers.split('|').map((groupText, groupIndex) => {
      const parts = groupText.split(':');
      const name = parts.length > 1 ? parts[0].trim() : `Options ${groupIndex + 1}`;
      const labels = (parts.length > 1 ? parts[1] : parts[0]).split(',').map((label) => label.trim()).filter(Boolean);

      return {
        id: `mod-${groupIndex}`,
        name,
        required: false,
        max_selections: maxSelections,
        options: labels.map((label) => {
          const surcharge = label.match(/\(\+\s*([\d\s.,]+)\s*(?:F(?:CFA)?)?\)$/i)?.[1];
          const priceDelta = surcharge ? Number(surcharge.replace(/\D/g, '')) : 0;
          return {
          id: `opt-${label.toLowerCase().replace(/\s+/g, '-')}`,
          name: label,
          label,
          price_delta: Number.isSafeInteger(priceDelta) ? priceDelta : 0,
        };
        }),
      };
    }).filter((group) => group.options.length > 0);
  }

  return {
    title: draft.title.trim(),
    category: draft.category.trim() || undefined,
    description: draft.description.trim(),
    price: Number(draft.price),
    stock: draft.stock === '' ? 0 : Number(draft.stock),
    image_url: draft.image_url,
    lookbook_image: draft.lookbook_image.trim() || undefined,
    gallery_images: draft.gallery_images.filter(Boolean).slice(0, 6),
    sizes: parseList(draft.sizes),
    colors: parseList(draft.colors),
    prep_time: draft.prep_time !== '' ? Number(draft.prep_time) : undefined,
    modifier_groups: modifierGroups,
    attributes,
    is_available: draft.is_available,
  };
}