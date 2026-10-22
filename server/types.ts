import type { ShopCategory } from '../src/utils/categoryDefaults.ts';
import type { SubscriptionProFeatures } from '../src/utils/subscriptionFeatures.ts';

export interface ShopOpeningHours {
  enabled: boolean;
  open_time: string;
  close_time: string;
  days?: number[];
  manual_override?: boolean;
}

export type SubscriptionTier = 'standard' | 'premium' | 'pro';
export type SubscriptionStatus = 'not_started' | 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'suspended';
export type MerchantVerificationStatus = 'not_required' | 'pending' | 'submitted' | 'under_review' | 'verified' | 'rejected';
export type PublicationStatus = 'draft' | 'active' | 'suspended';

export interface SubscriptionPlanConfig {
  tier: SubscriptionTier;
  amount: number;
  label: string;
  description: string;
}

export interface SubscriptionState {
  plan: SubscriptionTier;
  planFeatures: SubscriptionProFeatures;
  upcomingPlan: SubscriptionTier | null;
  upcomingPlanAt: string | null;
  cancellationAt: string | null;
  status: SubscriptionStatus;
  trialStart: string | null;
  trialEnd: string | null;
  expiresAt: string | null;
  trialDaysRemaining: number;
  isActive: boolean;
  manualOverrideActive: boolean;
}

export interface ShopRecord {
  id: number;
  name: string;
  slug: string;
  whatsapp_number: string;
  pin_code_hash: string;
  theme_color: string;
  welcome_message: string | null;
  is_open: boolean;
  is_active: boolean;
  publication_status?: PublicationStatus;
  featured_until?: string | null;
  merchant_verification_status?: MerchantVerificationStatus;
  selected_subscription_tier?: SubscriptionTier;
  pending_subscription_tier?: SubscriptionTier | null;
  pending_subscription_effective_at?: string | null;
  subscription_cancel_at?: string | null;
  subscription_admin_suspended_at?: string | null;
  subscription_admin_suspended_status?: 'active' | 'trialing' | null;
  subscription_admin_override_status?: 'active' | 'suspended' | null;
  subscription_admin_override_tier?: SubscriptionTier | null;
  subscription_admin_override_until?: string | null;
  subscription_plan_features?: SubscriptionProFeatures;
  subscription_features_snapshot?: SubscriptionProFeatures | null;
  subscription_features_effective_at?: string | null;
  subscription_status?: SubscriptionStatus | string;
  trial_start?: string | null;
  trial_end?: string | null;
  subscription_expires_at?: string | null;
  last_notification_sent_at: string | null;
  whatsapp_subscription_reminders_enabled?: boolean;
  whatsapp_subscription_reminders_consent_at?: string | null;
  created_at: string;
  category: ShopCategory;
  city?: string;
  owner_name?: string | null;
  owner_phone?: string | null;
  owner_email?: string | null;
  opening_hours?: ShopOpeningHours;
  owner_access_token_hash?: string | null;
  theme_config: {
    primary_color: string;
    secondary_color: string;
    font_family: 'Plus Jakarta Sans' | 'Playfair Display' | 'Cinzel' | 'Poppins';
    layout_style: 'grid_portrait' | 'card_landscape';
    theme_preset_id?: string;
    brand_direction?: 'luxe' | 'moderne' | 'authentique';
    custom_banner_url?: string;
    logo_url?: string;
    event_mode_enabled?: boolean;
    event_banner_text?: string;
    social_links?: {
      instagram?: string;
      facebook?: string;
      tiktok?: string;
      website?: string;
      whatsapp?: string;
    };
    delivery_zones?: Array<{
      label: string;
      mode: 'livraison' | 'sur_place' | 'retirer';
      fee: number;
      description?: string;
    }>;
    advanced_css?: {
      borderRadius?: 'rounded-none' | 'rounded-xl' | 'rounded-2xl' | 'rounded-3xl';
      shadowIntensity?: 'none' | 'subtle' | 'soft' | 'strong';
      accentGlow?: boolean;
    };
  };
}

export interface ProductRecord {
  id: number;
  shop_id: number;
  created_at?: string | null;
  title: string;
  description: string | null;
  price: number;
  stock: number;
  image_url: string;
  is_available: boolean;
  is_visible?: boolean;
  category?: string;
  sizes?: string[];
  colors?: { name: string; hex: string }[];
  lookbook_image?: string;
  gallery_images?: string[];
  prep_time?: number;
  modifier_groups?: {
    name: string;
    required?: boolean;
    max_selections?: number;
    options: { label: string; price_delta: number }[];
  }[];
  attributes?: Record<string, string>;
}

export interface OrderRecord {
  id: number;
  shop_id: number;
  customer_user_id?: number;
  attribution_campaign?: string | null;
  customer_name: string;
  customer_phone: string;
  delivery_location: string;
  delivery_note?: string;
  delivery_slot?: string;
  payment_method_preference: 'wave' | 'mobile_money' | 'cash' | 'to_confirm';
  total_amount: number;
  created_at: string;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled' | 'expired';
  whatsapp_tracking_available?: boolean;
  whatsapp_clicked_at?: string | null;
  items?: {
    id: number;
    order_id: number;
    product_id: number;
    product_title?: string;
    quantity: number;
    unit_price: number;
    selected_size?: string;
    selected_color?: string;
    selected_modifiers?: string[];
  }[];
}