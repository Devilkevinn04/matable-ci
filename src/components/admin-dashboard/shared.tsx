// Types, libellés et composants partagés par les vues du dashboard admin.
import React from 'react';
import { AnimatedNumber } from '../AnimatedNumber';
import { Sparkline } from '../charts/Sparkline';
import { CHART_COLORS } from '../../utils/chartData';
import { formatAudienceChange } from '../adminDashboardTypes';
import type { AdminOrder } from '../adminDashboardTypes';

export const adminOrderTransitions: Record<AdminOrder['status'], AdminOrder['status'][]> = {
  pending: ['confirmed', 'rejected'],
  confirmed: ['preparing', 'delivered', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: ['pending', 'confirmed'],
  rejected: [],
  expired: [],
};

export type AdminRole = 'super_admin' | 'verification_admin';
export type AdminView = 'overview' | 'shops' | 'orders' | 'customers' | 'identity' | 'verification-shops' | 'audience' | 'finance' | 'subscriptions' | 'operations' | 'push' | 'moderation' | 'audit' | 'advertising' | 'promotions' | 'ambassadors';

export type DashboardMetricTone = 'emerald' | 'sky' | 'orange' | 'amber' | 'rose';

export interface DashboardMetricCardProps {
  label: string;
  value: string;
  detail: string;
  current?: number;
  previous?: number;
  percentagePoints?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  tone: DashboardMetricTone;
  series?: number[];
  periodLabel: string;
}

export const dashboardMetricTones: Record<DashboardMetricTone, { icon: string; spark: string; accent: string }> = {
  emerald: { icon: 'bg-emerald-50 text-emerald-800 ring-emerald-100', spark: CHART_COLORS.green, accent: 'bg-emerald-500' },
  sky: { icon: 'bg-sky-50 text-sky-800 ring-sky-100', spark: CHART_COLORS.blue, accent: 'bg-sky-500' },
  orange: { icon: 'bg-orange-50 text-orange-800 ring-orange-100', spark: CHART_COLORS.rust, accent: 'bg-orange-500' },
  amber: { icon: 'bg-amber-50 text-amber-800 ring-amber-100', spark: CHART_COLORS.amber, accent: 'bg-amber-500' },
  rose: { icon: 'bg-rose-50 text-rose-800 ring-rose-100', spark: CHART_COLORS.rust, accent: 'bg-rose-500' },
};

export function DashboardMetricCard({
  label,
  value,
  detail,
  current,
  previous,
  percentagePoints,
  icon: Icon,
  tone,
  series = [],
  periodLabel,
}: DashboardMetricCardProps) {
  const styles = dashboardMetricTones[tone];
  const hasComparison = current !== undefined && previous !== undefined;
  const isStable = hasComparison && current === previous;
  const change = hasComparison ? formatAudienceChange(current, previous, percentagePoints) : null;
  const comparisonTone = !hasComparison
    ? 'bg-slate-100 text-slate-500'
    : isStable
      ? 'bg-slate-100 text-slate-600'
      : current > previous
        ? 'bg-emerald-50 text-emerald-800'
        : 'bg-amber-50 text-amber-800';
  const comparisonLabel = !hasComparison
    ? 'Comparaison en cours'
    : isStable
      ? 'Stable'
      : change;

  return (
    <article className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,.04)] transition duration-[var(--mt-motion-fast)] hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,.08)] max-sm:p-3 sm:p-5">
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${styles.accent}`} />
      <div className="flex items-start justify-between gap-3">
        <p className="min-h-10 text-xs font-bold leading-5 text-slate-600">{label}</p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${styles.icon}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-1 break-words text-xl font-black tracking-tight tabular-nums text-[#183b31] sm:text-3xl"><AnimatedNumber>{value}</AnimatedNumber></p>
      <p className="mt-1 min-h-8 text-[11px] leading-4 text-slate-500">{detail}</p>
      <div className="mt-3 flex min-w-0 items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className={`min-w-0 truncate rounded-full px-2.5 py-1 text-[10px] font-black tabular-nums ${comparisonTone}`}>
          {comparisonLabel}
        </span>
        <span className="shrink-0 text-[10px] font-semibold text-slate-400">{periodLabel}</span>
      </div>
      <Sparkline series={series} color={styles.spark} className="mt-3 h-8" />
    </article>
  );
}

export interface VerificationShopSummary {
  id: number;
  name: string;
  slug: string;
  category: string | null;
  city: string | null;
  publication_status: string;
  merchant_verification_status: string;
  created_at: string;
}

export interface AdminAmbassadorOverview {
  days: number;
  ambassadors_total: number;
  ambassadors_active: number;
  clicks: number;
  referrals: number;
  active_link_tokens: number;
  pending_applications: number;
  conversion_rate: number;
}

export const adminAuditActionLabels: Record<string, string> = {
  admin_order_status_updated: 'Statut de commande modifié',
  ambassador_created: 'Ambassadeur créé',
  ambassador_profile_updated: 'Profil ambassadeur modifié',
  ambassador_invite_created: 'Invitation ambassadeur créée',
  ambassador_account_activated: 'Accès ambassadeur activé ou réinitialisé',
  ambassador_password_changed: 'Mot de passe ambassadeur modifié',
  ambassador_withdrawal_requested: 'Retrait ambassadeur demandé',
  ambassador_withdrawal_approve: 'Retrait ambassadeur validé',
  ambassador_withdrawal_reject: 'Retrait ambassadeur refusé',
  ambassador_withdrawal_paid: 'Retrait ambassadeur payé',
  ambassador_withdrawal_cancelled_refund: 'Retrait annulé après remboursement',
  ambassador_status_updated: 'État ambassadeur modifié',
  ambassador_commission_approve: 'Commission ambassadeur validée',
  ambassador_commission_reject: 'Commission ambassadeur refusée',
  ambassador_commission_paid: 'Versement ambassadeur enregistré',
  customer_report_processed: 'Signalement traité',
  customer_review_moderated: 'Avis modéré',
  identity_verification_request_prepared: 'Rappel de vérification préparé',
  identity_status_updated: 'Statut Didit mis à jour',
  maintenance_updated: 'Mode maintenance modifié',
  subscription_plan_prices_updated: 'Tarifs des formules modifiés',
  subscription_plan_features_updated: 'Avantages et limites Pro modifiés',
  subscription_plan_change_scheduled: 'Changement de formule programmé',
  subscription_plan_change_cancelled: 'Changement de formule annulé',
  subscription_cancellation_scheduled: 'Arrêt des droits à échéance programmé',
  subscription_cancellation_revoked: 'Arrêt des droits programmé annulé',
  subscription_access_suspended: 'Accès à l’abonnement suspendu',
  subscription_access_reactivated: 'Accès à l’abonnement réactivé',
  subscription_manual_access_granted: 'Accès manuel accordé',
  subscription_manual_access_revoked: 'Accès manuel suspendu',
  subscription_manual_override_cleared: 'Dérogation manuelle retirée',
  platform_push_announcement_sent: 'Annonce Push envoyée',
  shop_permanently_deleted: 'Boutique supprimée',
  shop_reactivated: 'Boutique réactivée',
  shop_suspended: 'Boutique suspendue',
  customer_reactivated: 'Compte client réactivé',
  customer_suspended: 'Compte client suspendu',
  subscription_expiry_corrected: 'Échéance d’abonnement corrigée',
  subscription_reminder_failed: 'Échec du rappel d’abonnement',
  subscription_reminder_sent: 'Rappel d’abonnement envoyé',
  trial_expiry_reconciled: 'Échéance d’essai synchronisée',
  trial_extended: 'Essai prolongé',
  trial_reminder_prepared: 'Rappel d’essai préparé',
  admin_shop_operation: 'Opération sur la boutique',
  advertising_beta_open: 'Bêta publicitaire ouverte',
  advertising_beta_pause: 'Diffusion publicitaire suspendue',
  advertising_beta_resume: 'Diffusion publicitaire reprise',
  advertising_campaign_approve: 'Campagne publicitaire approuvée',
  advertising_campaign_reject: 'Campagne publicitaire refusée',
  advertising_campaign_suspend: 'Campagne publicitaire suspendue',
  advertising_campaign_resume: 'Campagne publicitaire reprise',
  advertising_campaign_cancel: 'Campagne publicitaire arrêtée',
  advertising_partner_request_updated: 'Demande partenaire traitée',
};

export const adminOrderStatusLabels: Record<AdminOrder['status'], string> = {
  pending: 'En attente',
  confirmed: 'Acceptée',
  preparing: 'En préparation',
  ready: 'Prête',
  delivered: 'Remise',
  cancelled: 'Annulée',
  rejected: 'Refusée',
  expired: 'Expirée',
};
export const formatAuditDetailValue = (value: unknown) => {
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?$/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
  }
  return String(value);
};
export const adminAuditDetailLabels: Record<string, string> = {
  user_id: 'Compte client',
  is_active: 'Compte actif',
  announcement_id: 'Annonce',
  attempted: 'Tentatives',
  days: 'Jours ajoutés',
  delivery_mode: 'Mode',
  enabled: 'Activé',
  failed: 'Échecs',
  previous_enabled: 'État précédent',
  previous_standard_price: 'Ancien tarif Standard',
  previous_premium_price: 'Ancien tarif Premium',
  previous_pro_price: 'Ancien tarif Pro',
  standard_price: 'Nouveau tarif Standard',
  premium_price: 'Nouveau tarif Premium',
  pro_price: 'Nouveau tarif Pro',
  previous_subscription_expires_at: 'Échéance précédente',
  previous_cancellation_at: 'Ancienne date de résiliation',
  current_tier: 'Formule actuelle',
  previous_pending_tier: 'Formule programmée précédente',
  pending_tier: 'Formule programmée',
  effective_at: 'Prise d’effet',
  cancellation_at: 'Date de résiliation',
  previous_trial_end: 'Fin d’essai précédente',
  previous_status: 'Statut précédent',
  reason: 'Motif',
  recipients: 'Boutiques concernées',
  review_id: 'Avis',
  sent: 'Envoyés',
  shop_id: 'Boutique',
  shop_name: 'Nom de boutique',
  shop_slug: 'Identifiant boutique',
  status: 'Statut',
  event_id: 'Événement Didit',
  subscription_expires_at: 'Nouvelle échéance',
  override_status: 'État manuel',
  override_tier: 'Formule manuelle',
  override_until: 'Fin de la dérogation',
  previous_override_status: 'État manuel précédent',
  previous_override_tier: 'Formule manuelle précédente',
  previous_override_until: 'Fin précédente de la dérogation',
  trial_end: 'Nouvelle fin d’essai',
  deleted_products: 'Produits supprimés',
  deleted_orders: 'Commandes supprimées',
  deleted_reviews: 'Avis supprimés',
  deleted_reports: 'Signalements supprimés',
  campaign_id: 'Campagne',
  ambassador_id: 'Ambassadeur',
  reference: 'Référence du versement',
  request_id: 'Demande partenaire',
  starts_at: 'Début de diffusion',
  ends_at: 'Fin de diffusion',
  kind: 'Format',
};

export const getAdminAuditReason = (details: string) => {
  try {
    const parsed: unknown = JSON.parse(details);
    if (parsed && typeof parsed === 'object' && 'reason' in parsed && typeof parsed.reason === 'string') {
      return parsed.reason;
    }
  } catch {
    return null;
  }
  return null;
};
export const getReminderLeadDays = (details: string) => {
  try {
    const parsed: unknown = JSON.parse(details);
    if (parsed && typeof parsed === 'object' && 'days_before' in parsed && typeof parsed.days_before === 'number') {
      return parsed.days_before;
    }
  } catch {
    return null;
  }
  return null;
};
export const getReminderFailure = (details: string) => {
  try {
    const parsed: unknown = JSON.parse(details);
    if (parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string') {
      return parsed.error;
    }
  } catch {
    return null;
  }
  return null;
};
