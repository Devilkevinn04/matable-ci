// État, chargement et actions sur les abonnements et essais (dashboard admin).
import { useState } from 'react';
import type { AdminShopItem, AdminSubscriptionShop, AdminSubscriptions } from '../adminDashboardTypes';
import type { SubscriptionTier } from '../../types';
import { askReason, confirmAction } from '../ui/ConfirmSheet';

export function useAdminSubscriptions({ shops, showNotice }: { shops: AdminShopItem[]; showNotice: (msg: string) => void }) {
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptions | null>(null);
  const [subscriptionStatusFilter, setSubscriptionStatusFilter] = useState('all');
  const [subscriptionSearch, setSubscriptionSearch] = useState('');
  const [trialExtensionDays, setTrialExtensionDays] = useState(7);
  const [subscriptionActionShopId, setSubscriptionActionShopId] = useState<number | null>(null);
  const [expiryDrafts, setExpiryDrafts] = useState<Record<number, { date: string; reason: string }>>({});
  const [planChangeDrafts, setPlanChangeDrafts] = useState<Record<number, { tier: SubscriptionTier; reason: string }>>({});
  const [manualOverrideDrafts, setManualOverrideDrafts] = useState<Record<number, {
    action: 'grant' | 'revoke' | 'clear';
    tier: SubscriptionTier;
    untilDate: string;
    reason: string;
  }>>({});

  const fetchSubscriptions = async () => {
    try {
      const res = await fetch('/api/admin/subscriptions');
      if (!res.ok) throw new Error('Impossible de charger les abonnements.');
      setSubscriptions(await res.json());
    } catch {
      showNotice('La vue abonnements est momentanément indisponible.');
    }
  };

  const handleExtendTrial = async (shop: AdminSubscriptionShop) => {
    if (!shop.trial_end) {
      showNotice('La date de fin d’essai est manquante ; actualisez les abonnements avant de continuer.');
      return;
    }
    const currentTrialEnd = Date.parse(shop.trial_end);
    if (!Number.isFinite(currentTrialEnd)) {
      showNotice('La date de fin d’essai est invalide ; corrigez-la avant de continuer.');
      return;
    }
    if (trialExtensionDays > shop.trial_extension_days_remaining) {
      showNotice(`Il ne reste que ${shop.trial_extension_days_remaining} jour(s) de prolongation autorisés pour ${shop.name}.`);
      return;
    }
    const nextTrialEnd = new Date(Math.max(currentTrialEnd, Date.now()) + trialExtensionDays * 86400000);
    const formattedNextEnd = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(nextTrialEnd);
    const reason = await askReason({
      title: `Prolonger l’essai de ${shop.name} de ${trialExtensionDays} jours ?`,
      message: `Nouvelle échéance : ${formattedNextEnd} (${shop.trial_extension_days_used + trialExtensionDays}/30 jours de prolongation utilisés). Le motif est inscrit au journal d’audit.`,
      confirmLabel: 'Prolonger l’essai',
      minLength: 10,
      suggestions: ['Vérification d’identité en attente', 'Problème technique côté MaTable', 'Geste commercial validé'],
    });
    if (reason === null) return;
    setSubscriptionActionShopId(shop.id);
    try {
      const response = await fetch(`/api/admin/subscriptions/${shop.id}/extend-trial`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: trialExtensionDays, expected_trial_end: shop.trial_end, reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de prolonger l’essai.');
      showNotice(`Essai prolongé jusqu’au ${formattedNextEnd} pour ${shop.name}.`);
      await fetchSubscriptions();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible de prolonger l’essai.');
    } finally {
      setSubscriptionActionShopId(null);
    }
  };

  const handleReconcileTrialExpiry = async (shop: AdminSubscriptionShop) => {
    setSubscriptionActionShopId(shop.id);
    try {
      const response = await fetch(`/api/admin/subscriptions/${shop.id}/reconcile-trial-expiry`, {
        method: 'PATCH',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de synchroniser les échéances.');
      showNotice(`Échéance d’essai synchronisée pour ${shop.name}.`);
      await fetchSubscriptions();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible de synchroniser les échéances.');
    } finally {
      setSubscriptionActionShopId(null);
    }
  };

  const handleSetSubscriptionExpiry = async (shop: AdminSubscriptionShop) => {
    const draft = expiryDrafts[shop.id];
    if (!draft?.date || draft.reason.trim().length < 10) {
      showNotice('Choisissez une date et indiquez un motif explicite d’au moins 10 caractères.');
      return;
    }
    if (!(await confirmAction({
      title: `Fin d’accès de ${shop.name} au ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(`${draft.date}T12:00:00`))} ?`,
      message: 'Vérifiez d’abord le paiement et la période couverte. Aucun encaissement n’est créé ; l’opération est journalisée.',
      confirmLabel: 'Enregistrer la date',
    }))) return;
    setSubscriptionActionShopId(shop.id);
    try {
      const response = await fetch(`/api/admin/subscriptions/${shop.id}/set-expiry`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expiry_date: draft.date,
          expected_subscription_expires_at: shop.subscription_expires_at,
          reason: draft.reason,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de corriger l’échéance.');
      setExpiryDrafts((previous) => ({ ...previous, [shop.id]: { date: '', reason: '' } }));
      showNotice(`Échéance corrigée pour ${shop.name}.`);
      await fetchSubscriptions();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible de corriger l’échéance.');
    } finally {
      setSubscriptionActionShopId(null);
    }
  };

  const handleManualSubscriptionOverride = async (shop: AdminSubscriptionShop) => {
    const draft = manualOverrideDrafts[shop.id];
    const action = draft?.action ?? 'grant';
    const reason = draft?.reason.trim() || '';
    if (reason.length < 10 || (action !== 'clear' && !draft?.untilDate)) {
      showNotice(action === 'clear'
        ? 'Saisissez un motif explicite d’au moins 10 caractères.'
        : 'Choisissez une formule, une date de fin et un motif d’au moins 10 caractères.');
      return;
    }
    const untilLabel = draft?.untilDate
      ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(`${draft.untilDate}T12:00:00`))
      : '';
    const confirmation = action === 'grant'
      ? `Accorder immédiatement la formule ${draft?.tier} jusqu’au ${untilLabel} à ${shop.name}. Aucun paiement ne sera créé; l’automatisation reprendra ensuite.`
      : action === 'revoke'
        ? `Suspendre immédiatement les droits d’abonnement de ${shop.name} jusqu’au ${untilLabel}. Cela ne désactive pas la boutique et ne rembourse/annule aucun paiement. L’automatisation reprendra ensuite.`
        : `Retirer la dérogation manuelle pour ${shop.name} et rétablir immédiatement l’état calculé par l’abonnement et les paiements.`;
    if (!(await confirmAction({
      title: action === 'grant' ? `Accorder un accès manuel à ${shop.name} ?` : action === 'revoke' ? `Suspendre les droits de ${shop.name} ?` : `Retirer la dérogation de ${shop.name} ?`,
      message: `${confirmation} Le motif est inscrit au journal d’audit.`,
      confirmLabel: action === 'grant' ? 'Accorder l’accès' : action === 'revoke' ? 'Suspendre les droits' : 'Retirer la dérogation',
      tone: action === 'revoke' ? 'danger' : 'default',
    }))) return;
    setSubscriptionActionShopId(shop.id);
    try {
      const response = await fetch(`/api/admin/subscriptions/${shop.id}/manual-override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          tier: draft?.tier ?? shop.plan,
          until_date: draft?.untilDate,
          expected_override_status: shop.subscription_admin_override_status,
          expected_override_tier: shop.subscription_admin_override_tier,
          expected_override_until: shop.subscription_admin_override_until,
          reason,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de modifier les droits manuels.');
      setManualOverrideDrafts((previous) => {
        const next = { ...previous };
        delete next[shop.id];
        return next;
      });
      showNotice(action === 'grant'
        ? `Accès ${draft?.tier} accordé à ${shop.name} jusqu’au ${untilLabel}.`
        : action === 'revoke'
          ? `Droits suspendus pour ${shop.name} jusqu’au ${untilLabel}.`
          : `Automatisation rétablie pour ${shop.name}.`);
      await fetchSubscriptions();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible de modifier les droits manuels.');
    } finally {
      setSubscriptionActionShopId(null);
    }
  };

  const updateManualOverrideDraft = (
    shop: AdminSubscriptionShop,
    patch: Partial<NonNullable<typeof manualOverrideDrafts[number]>>,
  ) => {
    setManualOverrideDrafts((previous) => ({
      ...previous,
      [shop.id]: {
        action: previous[shop.id]?.action ?? (shop.subscription_admin_override_active ? 'clear' : 'grant'),
        tier: previous[shop.id]?.tier ?? shop.plan as SubscriptionTier,
        untilDate: previous[shop.id]?.untilDate ?? '',
        reason: previous[shop.id]?.reason ?? '',
        ...patch,
      },
    }));
  };

  const handleScheduleSubscriptionPlan = async (shop: AdminSubscriptionShop) => {
    const draft = planChangeDrafts[shop.id];
    const nextTier = shop.pending_subscription_tier && draft?.tier === shop.plan
      ? null
      : draft?.tier;
    if (nextTier !== null && nextTier === undefined) {
      showNotice('Choisissez la formule à appliquer au prochain renouvellement.');
      return;
    }
    const reason = draft?.reason.trim() || '';
    if (reason.length < 10) {
      showNotice('Saisissez un motif explicite d’au moins 10 caractères.');
      return;
    }
    const action = nextTier === null ? 'annuler le changement programmé' : `programmer la formule ${nextTier}`;
    if (!(await confirmAction({
      title: `${action.charAt(0).toUpperCase()}${action.slice(1)} pour ${shop.name} ?`,
      message: `La formule actuelle reste active jusqu’à l’échéance du ${shop.subscription_expires_at ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(shop.subscription_expires_at)) : 'contrat'}. Le motif est inscrit au journal d’audit.`,
      confirmLabel: 'Confirmer',
    }))) return;

    setSubscriptionActionShopId(shop.id);
    try {
      const response = await fetch(`/api/admin/subscriptions/${shop.id}/schedule-plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          next_tier: nextTier,
          expected_tier: shop.plan,
          expected_pending_tier: shop.pending_subscription_tier,
          expected_subscription_expires_at: shop.subscription_expires_at,
          reason,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de programmer le changement de formule.');
      setPlanChangeDrafts((previous) => {
        const next = { ...previous };
        delete next[shop.id];
        return next;
      });
      showNotice(nextTier === null
        ? `Changement de formule annulé pour ${shop.name}.`
        : `Formule ${nextTier} programmée à l’échéance pour ${shop.name}.`);
      await fetchSubscriptions();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible de programmer le changement de formule.');
    } finally {
      setSubscriptionActionShopId(null);
    }
  };

  const handleSubscriptionLifecycleAction = async (
    shop: AdminSubscriptionShop,
    action: 'cancel_at_period_end' | 'undo_cancellation' | 'suspend' | 'reactivate',
  ) => {
    const descriptions = {
      cancel_at_period_end: 'programmer l’arrêt des droits à l’échéance',
      undo_cancellation: 'annuler l’arrêt des droits programmé',
      suspend: 'suspendre immédiatement les droits de l’abonnement',
      reactivate: 'réactiver les droits de l’abonnement',
    };
    const confirmation = action === 'cancel_at_period_end'
      ? `Les droits resteront actifs jusqu’au ${shop.subscription_expires_at ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(shop.subscription_expires_at)) : 'terme de l’abonnement'}. MaTable ne prélève pas automatiquement : le commerçant pourra encore payer un renouvellement GeniusPay avant cette date pour conserver son accès.`
      : action === 'suspend'
        ? 'Les droits et la publication liés à l’abonnement seront suspendus immédiatement. Cela ne désactivera pas la boutique ni ne modifiera les paiements.'
        : action === 'reactivate'
          ? 'Les droits seront rétablis uniquement si la période payée ou d’essai est toujours valide.'
          : 'Le renouvellement pourra de nouveau être payé.';
    const reason = await askReason({
      title: `${descriptions[action].charAt(0).toUpperCase()}${descriptions[action].slice(1)} de ${shop.name} ?`,
      message: `${confirmation} Le motif est inscrit au journal d’audit.`,
      confirmLabel: 'Confirmer',
      tone: action === 'suspend' || action === 'cancel_at_period_end' ? 'danger' : 'default',
      minLength: 10,
      suggestions: action === 'suspend' ? ['Paiement contesté', 'Non-respect des conditions'] : action === 'reactivate' ? ['Paiement régularisé', 'Erreur de suspension'] : ['Demande du commerçant'],
    });
    if (reason === null) return;

    setSubscriptionActionShopId(shop.id);
    try {
      const response = await fetch(`/api/admin/subscriptions/${shop.id}/lifecycle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          expected_status: shop.status,
          expected_subscription_expires_at: shop.subscription_expires_at,
          expected_cancellation_at: shop.subscription_cancel_at,
          reason,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de modifier le cycle de vie de l’abonnement.');
      showNotice(data.message || 'Abonnement mis à jour.');
      await fetchSubscriptions();
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Impossible de modifier le cycle de vie de l’abonnement.');
    } finally {
      setSubscriptionActionShopId(null);
    }
  };

  const handlePrepareTrialReminder = async (shop: AdminSubscriptionShop) => {
    if (!shop.whatsapp_reminders_opt_in) {
      showNotice('Le commerçant doit d’abord autoriser les rappels WhatsApp.');
      return;
    }
    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      showNotice('Autorisez les fenêtres pop-up pour ouvrir WhatsApp.');
      return;
    }
    try {
      const response = await fetch(`/api/admin/shops/${shop.id}/notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: 'trial_expiring' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de préparer la relance WhatsApp.');
      popup.location.href = data.whatsapp_url;
      showNotice(`Message de relance prêt pour ${shop.name}. Il restera à le valider dans WhatsApp.`);
      await fetchSubscriptions();
    } catch (error) {
      popup.close();
      showNotice(error instanceof Error ? error.message : 'Impossible de préparer la relance WhatsApp.');
    }
  };

  const filteredSubscriptions = (subscriptions?.shops || []).filter((shop) => {
    const query = subscriptionSearch.trim().toLowerCase();
    const matchesQuery = !query || [shop.name, shop.whatsapp_number, shop.owner_email || '', shop.slug]
      .some((value) => value.toLowerCase().includes(query));
    return matchesQuery && (subscriptionStatusFilter === 'all' || shop.status === subscriptionStatusFilter);
  });
  const expiringTrials = (subscriptions?.shops || []).filter((shop) => shop.status === 'trialing'
    && shop.trial_days_remaining !== null && shop.trial_days_remaining <= 7);
  const inconsistentTrialExpiries = (subscriptions?.shops || []).filter((shop) => shop.trial_expiry_mismatch);
  const trialExtensionOptions = [...new Set([
    7,
    14,
    30,
    ...(subscriptions?.shops || [])
      .map((shop) => shop.trial_extension_days_remaining)
      .filter((days) => days > 0 && days < 30),
  ])].sort((left, right) => left - right);

  return {
    subscriptions,
    setSubscriptions,
    subscriptionStatusFilter,
    setSubscriptionStatusFilter,
    subscriptionSearch,
    setSubscriptionSearch,
    trialExtensionDays,
    setTrialExtensionDays,
    subscriptionActionShopId,
    setSubscriptionActionShopId,
    expiryDrafts,
    setExpiryDrafts,
    planChangeDrafts,
    setPlanChangeDrafts,
    manualOverrideDrafts,
    setManualOverrideDrafts,
    fetchSubscriptions,
    handleExtendTrial,
    handleReconcileTrialExpiry,
    handleSetSubscriptionExpiry,
    handleManualSubscriptionOverride,
    updateManualOverrideDraft,
    handleScheduleSubscriptionPlan,
    handleSubscriptionLifecycleAction,
    handlePrepareTrialReminder,
    filteredSubscriptions,
    expiringTrials,
    inconsistentTrialExpiries,
    trialExtensionOptions,
  };
}
