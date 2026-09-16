export type ShopCategory =
  | 'fashion'
  | 'food'
  | 'beauty'
  | 'electronics'
  | 'home'
  | 'services'
  | 'health'
  | 'crafts'
  | 'education'
  | 'automotive'
  | 'other';
export type SubscriptionTier = 'standard' | 'premium' | 'pro';

export interface ThemeAdvancedCSS {
  borderRadius?: 'rounded-none' | 'rounded-xl' | 'rounded-2xl' | 'rounded-3xl';
  shadowIntensity?: 'none' | 'subtle' | 'soft' | 'strong';
  accentGlow?: boolean;
}

export interface ThemeConfig {
  primary_color: string;
  secondary_color: string;
  font_family: 'Plus Jakarta Sans' | 'Playfair Display' | 'Cinzel' | 'Poppins';
  layout_style: 'grid_portrait' | 'card_landscape';
  theme_preset_id?: string;
  custom_banner_url?: string;
  logo_url?: string;
  event_mode_enabled?: boolean;
  event_banner_text?: string;
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
  payment_status?: 'pending' | 'awaiting_review' | 'approved' | 'rejected' | 'suspended';
  payment_deadline_at?: string | null;
  payment_provider?: 'whatsapp' | 'paystack';
  payment_reference?: string | null;
  payment_link?: string | null;
  payment_message?: string | null;
  payment_amount?: number;
  payment_tier?: SubscriptionTier;
  subscription_expires_at: string; // YYYY-MM-DD
  last_notification_sent_at: string | null;
  created_at: string;
  category: ShopCategory;
  city?: string;
  subscription_tier: SubscriptionTier;
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

export type OrderStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled';

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
  selected_modifiers?: string;
}

export interface Order {
  id: number;
  shop_id: number;
  customer_name: string;
  customer_phone: string;
  delivery_location: string;
  delivery_note?: string;
  delivery_slot?: string; // For food: "Midi 12h-13h", etc.
  payment_method_preference: 'wave' | 'mobile_money';
  total_amount: number;
  created_at: string;
  status: OrderStatus;
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
