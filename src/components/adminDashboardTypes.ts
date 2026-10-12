import type { Shop } from '../types';

export interface AdminShopItem extends Shop {
  products_count: number;
  orders_count: number;
  total_sales: number;
  average_order_value: number;
  last_order_at: string | null;
}

export interface AdminAnalytics {
  days: number;
  daily: { date: string; page_views: number; unique_visitors: number; orders: number; sales: number }[];
  by_shop: { shop_id: number; shop_name: string; page_views: number; unique_visitors: number; orders: number; sales: number; conversion_rate: number }[];
  sources: { source: 'direct' | 'search' | 'social' | 'referral' | 'internal' | 'unknown'; visits: number; visitors: number }[];
  campaigns: { campaign: string; visits: number; visitors: number; orders: number; sales: number; whatsapp_clicks: number }[];
  totals: { page_views: number; unique_visitors: number; orders: number; sales: number; conversion_rate: number };
  previous: { page_views: number; unique_visitors: number; orders: number; sales: number; conversion_rate: number };
}

export interface AdminFinance {
  days: number;
  since: string;
  summary: {
    confirmed_count: number;
    collected_amount: number;
    pending_count: number;
    pending_amount: number;
    failed_count: number;
    refunded_count: number;
    mrr: number;
    active_subscriptions: number;
    mrr_by_tier: { tier: string; count: number; amount: number }[];
    active_trials: number;
    trials_expiring_7d: number;
    completed_trials: number;
    converted_trials: number;
    trial_conversion_rate: number;
    past_due_subscriptions: number;
    whatsapp_reminders_enabled: boolean;
    whatsapp_reminder_opt_ins: number;
    subscriptions: { count: number; amount: number };
    promotions: { count: number; amount: number };
  };
  by_tier: { tier: string; count: number; amount: number }[];
  payments: {
    id: string;
    shop_id: number;
    shop_name: string;
    payment_type: 'subscription' | 'promotion';
    tier: string;
    subscription_term: 'monthly' | 'annual';
    amount: number;
    currency: string;
    status: string;
    provider_reference: string | null;
    created_at: string;
    paid_at: string | null;
  }[];
}

export interface AdminSubscriptionShop {
  id: number;
  name: string;
  slug: string;
  whatsapp_number: string;
  owner_email: string | null;
  whatsapp_reminders_opt_in: boolean;
  plan: string;
  status: string;
  is_active: boolean;
  publication_status: string | null;
  merchant_verification_status: string | null;
  trial_start: string | null;
  trial_end: string | null;
  trial_days_remaining: number | null;
  trial_extension_days_used: number;
  trial_extension_days_remaining: number;
  subscription_expires_at: string | null;
  trial_expiry_mismatch: boolean;
  next_renewal_at: string | null;
  created_at: string;
  products_count: number;
  orders_count: number;
  last_order_at: string | null;
}

export interface AdminSubscriptions {
  summary: {
    mrr: number;
    active_subscriptions: number;
    mrr_by_tier: { tier: string; count: number; amount: number }[];
    active_trials: number;
    trials_expiring_7d: number;
    completed_trials: number;
    converted_trials: number;
    trial_conversion_rate: number;
    past_due_subscriptions: number;
    whatsapp_reminders_enabled: boolean;
    whatsapp_reminder_opt_ins: number;
  };
  weekly_activity: {
    unique_visitors: number;
    shops_created: number;
    whatsapp_clicks: number;
  };
  shops: AdminSubscriptionShop[];
  audit_logs: { id: number; action: string; shop_id: number | null; shop_name: string | null; details: string; created_at: string }[];
}

export interface AdminOrder {
  id: number;
  shop_id: number;
  shop_name: string;
  customer_name: string;
  customer_phone: string;
  delivery_location: string;
  total_amount: number;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled' | 'expired';
  created_at: string;
  items_count: number;
}

export interface AdminCustomer {
  id: number;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  phone: string;
  created_at: string;
  is_active: boolean;
  orders_count: number;
  order_value: number;
  last_order_at: string | null;
}

export interface AdminHealth {
  status: string;
  checked_at: string;
  database: string;
  database_path: string | null;
  counts: { shops: number; products: number; orders: number };
  latest_analytics_event_at: string | null;
  integrations: { whatsapp_click_to_chat: string };
}

export interface AdminMaintenance {
  enabled: boolean;
  message: string;
  updated_at: string | null;
  updated_by: string | null;
}

export interface AdminContentModeration {
  reviews: {
    id: number;
    target_type: 'shop' | 'product';
    rating: number;
    comment: string;
    status: string;
    created_at: string;
    shop_name: string | null;
    product_title: string | null;
    customer_name: string | null;
  }[];
  reports: {
    id: number;
    target_type: 'shop' | 'product';
    reason: string;
    details: string;
    status: string;
    created_at: string;
    shop_name: string | null;
    product_title: string | null;
    customer_name: string | null;
  }[];
}

export const ownerNotificationTemplates = [
  { id: 'welcome', label: 'Bienvenue et démarrage' },
  { id: 'catalog', label: 'Rappel catalogue à jour' },
  { id: 'orders', label: 'Rappel nouvelles commandes' },
  { id: 'support', label: 'Proposition d’assistance' },
  { id: 'trial_expiring', label: 'Relance essai arrivant à échéance' },
  { id: 'identity_verification', label: 'Demande de vérification d’identité' },
] as const;

export const subscriptionStatusLabels: Record<string, string> = {
  trialing: 'Essai actif',
  active: 'Payé',
  expired: 'Expiré',
  past_due: 'À régulariser',
  suspended: 'Suspendu',
  cancelled: 'Résilié',
  not_started: 'Non démarré',
};

export const audienceSourceLabels: Record<AdminAnalytics['sources'][number]['source'], string> = {
  direct: 'Accès direct',
  search: 'Moteurs de recherche',
  social: 'Réseaux sociaux',
  referral: 'Sites référents',
  internal: 'Navigation interne',
  unknown: 'Origine non attribuée',
};

export const formatAudienceChange = (current: number, previous: number, percentagePoints = false) => {
  if (percentagePoints) {
    const change = current - previous;
    if (change === 0) return 'Stable';
    if (previous === 0) return `0 → ${current.toFixed(1)} pt`;
    return `${change > 0 ? '+' : ''}${change.toFixed(1)} pt`;
  }
  if (previous === 0) return current === 0 ? '0 dans les deux périodes' : `0 → ${new Intl.NumberFormat('fr-FR').format(current)}`;
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change > 0 ? '+' : ''}${change}%`;
};
