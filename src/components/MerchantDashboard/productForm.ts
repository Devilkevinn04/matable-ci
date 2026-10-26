import { Product, ShopCategory } from '../../types';
import { getCategoryDefaults, isLegacyGenericProductImage } from '../../utils/categoryDefaults';

export interface ProductDraft {
  title: string;
  category: string;
  description: string;
  price: number | '';
  sale_price: number | '';
  sale_starts_at: string;
  sale_ends_at: string;
  stock: number | '';
  image_url: string;
  lookbook_image: string;
  gallery_images: string[];
  sizes: string;
  colors: string;
  prep_time: number | '';
  modifier_groups: ProductModifierGroupDraft[];
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
  sale_price?: number | null;
  sale_starts_at?: string | null;
  sale_ends_at?: string | null;
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
  required: boolean;
  max_selections: number;
  options: string[];
}

export function parseProductChoices(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

export function serializeProductChoices(choices: string[]): string {
  return [...new Set(choices.map((item) => item.trim()).filter(Boolean))].join(', ');
}

export function parseProductModifierGroups(value: string): ProductModifierGroupDraft[] {
  if (!value.trim()) return [];

  return value.split('|').map((groupText, groupIndex) => {
    const parts = groupText.split(':');
    const name = parts.length > 1 ? parts[0].trim() : `Options ${groupIndex + 1}`;
    const optionText = parts.length > 1 ? parts[1] : parts[0];

    return {
      name,
      required: false,
      max_selections: 2,
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
    sale_price: '',
    sale_starts_at: '',
    sale_ends_at: '',
    stock: 10,
    image_url: '',
    lookbook_image: '',
    gallery_images: [],
    sizes: '',
    colors: '',
    prep_time: defaults.defaultProductPrepTime ?? '',
    modifier_groups: parseProductModifierGroups(defaults.defaultProductModifiers),
    attributes: {},
    is_available: true,
  };
}

export function productToDraft(product: Product): ProductDraft {
  const modifierGroups = Array.isArray(product.modifier_groups)
    ? product.modifier_groups.map((group) => {
        const optionLabels = group.options.map((option) => {
          if (typeof option === 'string' || !option.price_delta || /\(\+\s*[\d\s.,]+\s*(?:F(?:CFA)?)?\)$/i.test(option.label)) {
            return typeof option === 'string' ? option : option.label;
          }
          return `${option.label} (+${option.price_delta} F)`;
        });
        return {
          name: group.name,
          required: Boolean(group.required),
          max_selections: Math.min(5, Math.max(1, Number(group.max_selections) || 2)),
          options: optionLabels,
        };
      })
    : [];

  return {
    title: product.title,
    category: product.category || '',
    description: product.description || '',
    price: product.price,
    sale_price: product.sale_price ?? '',
    sale_starts_at: toDateTimeLocal(product.sale_starts_at),
    sale_ends_at: toDateTimeLocal(product.sale_ends_at),
    stock: product.stock,
    image_url: isLegacyGenericProductImage(product.image_url) ? '' : product.image_url,
    lookbook_image: product.lookbook_image || '',
    gallery_images: product.gallery_images || [],
    sizes: product.sizes ? product.sizes.join(', ') : '',
    colors: Array.isArray(product.colors)
      ? product.colors.map((color) => typeof color === 'string' ? color : color.name).join(', ')
      : '',
    prep_time: product.prep_time || '',
    modifier_groups: modifierGroups,
    attributes: product.attributes || {},
    is_available: product.is_available !== false,
  };
}

function toDateTimeLocal(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export function buildProductSavePayload(draft: ProductDraft, category: ShopCategory): ProductSavePayload {
  const parseList = (value: string) => {
    const choices = parseProductChoices(value);
    return choices.length > 0 ? choices : undefined;
  };
  const defaults = getCategoryDefaults(category);
  const allowedAttributeKeys = new Set(defaults.productAttributes.map((field) => field.key));
  const attributes = Object.fromEntries(
    Object.entries(draft.attributes)
      .filter(([key, value]) => allowedAttributeKeys.has(key) && typeof value === 'string')
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value),
  );
  const modifierGroups: ProductModifierDraftGroup[] | undefined = defaults.productFormType === 'food' && draft.modifier_groups.length > 0
    ? draft.modifier_groups.map((group, groupIndex) => {
      const labels = group.options.map((label) => label.trim()).filter(Boolean);
      return {
        id: `mod-${groupIndex}`,
        name: group.name.trim() || `Options ${groupIndex + 1}`,
        required: group.required,
        max_selections: Math.min(5, Math.max(1, Number(group.max_selections) || 1)),
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
    }).filter((group) => group.options.length > 0)
    : undefined;

  return {
    title: draft.title.trim(),
    category: draft.category.trim() || undefined,
    description: draft.description.trim(),
    price: Number(draft.price),
    sale_price: draft.sale_price === '' ? null : Number(draft.sale_price),
    sale_starts_at: draft.sale_price === '' || !draft.sale_starts_at ? null : new Date(draft.sale_starts_at).toISOString(),
    sale_ends_at: draft.sale_price === '' || !draft.sale_ends_at ? null : new Date(draft.sale_ends_at).toISOString(),
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