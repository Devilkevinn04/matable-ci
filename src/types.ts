import type { ShopCategory } from './utils/categoryDefaults';
export type { ShopCategory } from './utils/categoryDefaults';
// Legacy tier identifiers remain accepted for compatibility with older records,
// while the V2 product experience stays free and not gated by tiers.
export type SubscriptionTier = 'standard';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'suspended';

export interface ThemeAdvancedCSS {
  borderRadius?: 'rounded-none' | 'rounded-xl' | 'rounded-2xl' | 'rounded-3xl';
  shadowIntensity?: 'none' | 'subtle' | 'soft' | 'strong';
  accentGlow?: boolean;
}

export type BrandDirection = 'luxe' | 'moderne' | 'authentique';

export interface ShopSocialLinks {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  website?: string;
  whatsapp?: string;
}

export interface ShopDeliveryZone {
  label: string;
  mode: 'livraison' | 'sur_place' | 'retirer';
  fee: number;
  description?: string;
}

export interface ThemeConfig {
  primary_color: string;
  secondary_color: string;
  font_family: 'Plus Jakarta Sans' | 'Playfair Display' | 'Cinzel' | 'Poppins';
  layout_style: 'grid_portrait' | 'card_landscape';
  theme_preset_id?: string;
  brand_direction?: BrandDirection;
  custom_banner_url?: string;
  logo_url?: string;
  event_mode_enabled?: boolean;
  event_banner_text?: string;
  social_links?: ShopSocialLinks;
  delivery_zones?: ShopDeliveryZone[];
  advanced_css?: ThemeAdvancedCSS;
}

export interface ShopOpeningHours {
  enabled: boolean;
  open_time: string; // "08:00"
  close_time: string; // "22:00"
  days?: number[]; // [0,1,2,3,4,5,6] (0 = dimanche)
  manual_override?: boolean; // if true, manual is_open overrides schedule
}

export interface Shop {
  id: number;
  name: string;
  slug: string;
  whatsapp_number: string;
  pin_code_hash: string;
  theme_color: string;
  welcome_message: string | null;
  is_open: boolean;
  is_active: boolean;
  last_notification_sent_at: string | null;
  created_at: string;
  category: ShopCategory;
  city?: string;
  subscription?: {
    plan: SubscriptionTier;
    status: SubscriptionStatus;
    trialStart: string | null;
    trialEnd: string | null;
    trialDaysRemaining: number;
    isActive: boolean;
  };
  theme_config: ThemeConfig;
  opening_hours?: ShopOpeningHours;
}

export interface ProductColor {
  name: string;
  hex: string;
}

export interface ProductModifierOption {
  label: string;
  price_delta: number;
}

export interface ProductModifierGroup {
  name: string;
  required?: boolean;
  max_selections?: number;
  options: ProductModifierOption[];
}

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled' | 'expired';

export interface Product {
  id: number;
  shop_id: number;
  title: string;
  description: string | null;
  price: number; // in FCFA
  stock: number;
  image_url: string;
  is_available: boolean;
  category?: string;
  attributes?: Record<string, string>;
  // Fashion specific
  sizes?: string[]; // e.g. ['S', 'M', 'L', 'XL']
  colors?: (ProductColor | string)[];
  lookbook_image?: string;
  // Food specific
  prep_time?: number; // minutes
  modifier_groups?: { name: string; required?: boolean; max_selections?: number; options: (ProductModifierOption | string)[] }[];
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_title?: string;
  quantity: number;
  unit_price: number; // in FCFA
  selected_size?: string;
  selected_color?: string;
  selected_modifiers?: string[];
}

export interface Order {
  id: number;
  shop_id: number;
  customer_name: string;
  customer_phone: string;
  delivery_location: string;
  delivery_note?: string;
  delivery_slot?: string; // For food: "Midi 12h-13h", etc.
  payment_method_preference: 'wave' | 'mobile_money' | 'cash' | 'to_confirm';
  total_amount: number;
  created_at: string;
  status: OrderStatus;
  whatsapp_tracking_available?: boolean;
  whatsapp_clicked_at?: string | null;
  items?: OrderItem[];
}

export interface CartItem {
  product: Product;
  quantity: number;
  selected_size?: string;
  selected_color?: string;
  selected_modifiers?: string[];
}

export interface FlashBilan {
  date: string;
  total_sales: number;
  orders_count: number;
  total_orders?: number;
  top_selling_products?: {
    title: string;
    quantity_sold: number;
    revenue: number;
  }[];
  low_stock_products: {
    id: number;
    title: string;
    stock: number;
  }[];
  out_of_stock_products: {
    id: number;
    title: string;
  }[];
  whatsapp_message: string;
}

export type SubscriptionAlertLevel = 'j10' | 'j8' | 'j6' | 'j4' | 'j2' | 'j0' | 'j_plus_1' | 'normal';

export interface ShopAlertInfo {
  shop: Shop;
  daysRemaining: number;
  alertLevel: SubscriptionAlertLevel;
  alertMessage: string;
  shouldDeactivate: boolean;
}
