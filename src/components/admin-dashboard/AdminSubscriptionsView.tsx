// Vue « Abonnements » du dashboard admin.
import { Clock, AlertTriangle, Send } from 'lucide-react';
import { AdminSubscriptionPlanPricing } from '../AdminSubscriptionPlanPricing';
import { AdminSubscriptionPlanFeatures } from '../AdminSubscriptionPlanFeatures';
import { subscriptionStatusLabels } from '../adminDashboardTypes';
import type { AdminShopItem } from '../adminDashboardTypes';
import type { SubscriptionTier } from '../../types';
import { adminAuditActionLabels, getAdminAuditReason, getReminderLeadDays, getReminderFailure } from './shared';
import type { useAdminSubscriptions } from './useAdminSubscriptions';

export function AdminSubscriptionsView({ subscriptionsAdmin, shops, handleToggleActive }: { subscriptionsAdmin: ReturnType<typeof useAdminSubscriptions>; shops: AdminShopItem[]; handleToggleActive: (shopId: number) => Promise<void> }) {
  const {
    subscriptions,
    subscriptionStatusFilter,
    setSubscriptionStatusFilter,
    subscriptionSearch,
    setSubscriptionSearch,
    trialExtensionDays,
    setTrialExtensionDays,
    subscriptionActionShopId,
    expiryDrafts,
    setExpiryDrafts,
    planChangeDrafts,
    setPlanChangeDrafts,
    manualOverrideDrafts,
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
  } = subscriptionsAdmin;
  return (
    <>
      <section aria-labelledby="admin-subscriptions-title" className="space-y-5">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-emerald-800">Revenus récurrents</p>
            <h2 id="admin-subscriptions-title" className="mt-1 text-xl font-black text-slate-900">Abonnements</h2>
            <p className="mt-1 text-xs text-slate-500">{subscriptions?.summary.whatsapp_reminders_enabled ? `Rappels automatiques configurés à J−14, J−7, J−3 et J−1 · consentement enregistré pour ${subscriptions.summary.whatsapp_reminder_opt_ins} boutique(s). Les relances ouvertes ici restent à valider dans WhatsApp.` : 'API WhatsApp non configurée : aucun rappel automatique ne part. Une relance manuelle ouvre WhatsApp et nécessite le consentement du commerçant.'}</p>
          </div>
          <button type="button" onClick={() => void fetchSubscriptions()} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Actualiser</button>
        </header>

        <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-black text-slate-900">
            Configuration globale · tarifs et avantages des formules
          </summary>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            Ces paramètres s’appliquent aux offres de toutes les boutiques. Les changements ne modifient pas les paiements déjà effectués.
          </p>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <AdminSubscriptionPlanPricing />
            <AdminSubscriptionPlanFeatures />
          </div>
        </details>
        {!subscriptions ? <p role="status" className="border-y border-slate-200 py-6 text-sm text-slate-500">Chargement des abonnements…</p> : <>
          <section aria-labelledby="subscription-overview-title" className="space-y-3">
            <h3 id="subscription-overview-title" className="text-sm font-black text-slate-900">Vue d’ensemble</h3>
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 xl:grid-cols-4">
              <div className="border-l-2 border-emerald-600 pl-3"><p className="text-xs text-slate-500">MRR estimé</p><strong className="text-lg font-black text-slate-900">{new Intl.NumberFormat('fr-FR').format(subscriptions.summary.mrr)} F / mois</strong><p className="mt-1 text-[11px] text-slate-500">{subscriptions.summary.mrr_estimated_subscriptions} au tarif catalogue faute de paiement enregistré</p></div>
              <div className="border-l-2 border-sky-600 pl-3"><p className="text-xs text-slate-500">Abonnements payants</p><strong className="text-lg font-black text-slate-900">{subscriptions.summary.active_subscriptions}</strong></div>
              <div className="border-l-2 border-amber-500 pl-3"><p className="text-xs text-slate-500">Essais actifs · fin sous 7 j</p><strong className="text-lg font-black text-slate-900">{subscriptions.summary.active_trials} · {subscriptions.summary.trials_expiring_7d}</strong></div>
              <div className="border-l-2 border-rose-600 pl-3"><p className="text-xs text-slate-500">Conversion des essais terminés</p><strong className="text-lg font-black text-slate-900">{subscriptions.summary.converted_trials}/{subscriptions.summary.completed_trials} boutiques · {subscriptions.summary.trial_conversion_rate}%</strong><p className="mt-1 text-[11px] text-slate-500">Paiement confirmé après le début de l’essai, parmi les essais échus.</p></div>
            </div>
            <details className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <summary className="cursor-pointer text-xs font-bold text-slate-700">Activité de la plateforme sur 7 jours</summary>
              <p className="mt-2 text-xs text-slate-500">Sessions anonymisées mesurées après consentement, boutiques créées et clics WhatsApp suivis.</p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">Sessions d’audience</p><strong className="text-xl font-black text-slate-900">{subscriptions.weekly_activity.unique_visitors}</strong></div>
                <div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">Boutiques créées</p><strong className="text-xl font-black text-slate-900">{subscriptions.weekly_activity.shops_created}</strong></div>
                <div className="rounded-lg bg-white p-3"><p className="text-xs text-slate-500">Clics WhatsApp</p><strong className="text-xl font-black text-slate-900">{subscriptions.weekly_activity.whatsapp_clicks}</strong></div>
              </div>
            </details>
          </section>

          {inconsistentTrialExpiries.length > 0 && <section aria-labelledby="trial-expiry-integrity-title" className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div className="min-w-0 flex-1">
                <h3 id="trial-expiry-integrity-title" className="text-sm font-black text-amber-950">Échéances d’essai à corriger</h3>
                <p className="mt-1 text-xs text-amber-900">La date d’expiration technique diffère de la fin d’essai. Synchronisez-la pour que l’accès et la période de grâce suivent la bonne échéance.</p>
                <div className="mt-3 divide-y divide-amber-200">
                  {inconsistentTrialExpiries.map((shop) => (
                    <article key={shop.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-bold text-amber-950">{shop.name}</h4>
                        <p className="mt-1 text-xs text-amber-900">Fin d’essai : {shop.trial_end ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.trial_end)) : 'non définie'} · Expiration enregistrée : {shop.subscription_expires_at ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.subscription_expires_at)) : 'non définie'}</p>
                      </div>
                      <button type="button" disabled={subscriptionActionShopId === shop.id} onClick={() => void handleReconcileTrialExpiry(shop)} className="min-h-9 shrink-0 rounded-lg border border-amber-700 bg-white px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100 disabled:opacity-50">Synchroniser l’échéance</button>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>}

          {subscriptions.shops.some((shop) => shop.status === 'active' && !shop.subscription_expires_at) && <section aria-labelledby="missing-subscription-expiry-title" className="rounded-xl border border-rose-300 bg-rose-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
              <div className="min-w-0 flex-1">
                <h3 id="missing-subscription-expiry-title" className="text-sm font-black text-rose-950">Abonnements actifs sans échéance</h3>
                <p className="mt-1 text-xs text-rose-900">Vérifiez une preuve de paiement ou l’historique avant de corriger ces comptes. Aucune date ne peut être déduite automatiquement.</p>
                <div className="mt-3 divide-y divide-rose-200">
                  {subscriptions.shops.filter((shop) => shop.status === 'active' && !shop.subscription_expires_at).map((shop) => (
                    <article key={shop.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-bold text-rose-950">{shop.name}</h4>
                        <p className="mt-1 text-xs text-rose-900">Compte #{shop.id} · formule {shop.plan} · échéance non définie</p>
                      </div>
                      <span className="text-xs font-bold text-rose-800">Vérification manuelle requise</span>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>}

          <section aria-labelledby="trials-expiring-title" className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><h3 id="trials-expiring-title" className="text-sm font-black text-amber-950">Essais à suivre</h3><p className="mt-1 text-xs text-amber-900">Essais qui finissent dans les 7 jours. Une relance ouvre WhatsApp sans envoyer le message. Chaque essai peut être prolongé de 30 jours maximum au total.</p></div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Prolonger de
                <select aria-label="Durée de prolongation d’essai" value={trialExtensionDays} onChange={(event) => setTrialExtensionDays(Number(event.target.value))} className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700">
                  {trialExtensionOptions.map((days) => <option key={days} value={days}>{days} jours</option>)}
                </select>
              </label>
            </div>
            <div className="mt-3 divide-y divide-amber-200">
              {expiringTrials.length === 0 ? <p className="py-4 text-sm text-slate-500">Aucun essai n’expire sous 7 jours.</p> : expiringTrials.map((shop) => (
                <article key={shop.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><h4 className="truncate text-sm font-bold text-slate-900">{shop.name}</h4><p className="mt-1 text-xs text-slate-500">{shop.plan} · {shop.trial_days_remaining} jour(s) restant(s) · fin le {shop.trial_end ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.trial_end)) : 'date inconnue'} · prolongation : {shop.trial_extension_days_used}/30 jours{shop.trial_extension_over_limit ? ' — dépassement historique à vérifier' : `, ${shop.trial_extension_days_remaining} jour(s) autorisé(s) restant(s)`}</p></div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {shop.whatsapp_reminders_opt_in ? <button type="button" disabled={subscriptionActionShopId === shop.id} onClick={() => void handlePrepareTrialReminder(shop)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"><Send className="h-3.5 w-3.5" />Relancer WhatsApp</button> : <span className="self-center text-xs text-slate-500">Consentement WhatsApp requis</span>}
                    <button type="button" disabled={subscriptionActionShopId === shop.id || shop.trial_extension_over_limit || shop.trial_extension_days_remaining === 0 || trialExtensionDays > shop.trial_extension_days_remaining} onClick={() => void handleExtendTrial(shop)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"><Clock className="h-3.5 w-3.5" />{shop.trial_extension_over_limit ? 'Dépassement à vérifier' : shop.trial_extension_days_remaining === 0 ? 'Plafond atteint' : trialExtensionDays > shop.trial_extension_days_remaining ? `Maximum ${shop.trial_extension_days_remaining} j` : `Prolonger de ${trialExtensionDays} j`}</button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section aria-labelledby="subscription-list-title" className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><h3 id="subscription-list-title" className="text-sm font-black text-slate-900">Gestion des abonnements par boutique</h3><p className="mt-1 text-xs text-slate-500">L’état de l’abonnement, les droits et la publication de la boutique sont distincts. {filteredSubscriptions.length} boutique(s) affichée(s) sur {subscriptions.shops.length}.</p></div>
              <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_180px]">
                <input type="search" value={subscriptionSearch} onChange={(event) => setSubscriptionSearch(event.target.value)} placeholder="Rechercher une boutique…" aria-label="Rechercher un abonnement" className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-emerald-700" />
                <select aria-label="Filtrer les abonnements par statut" value={subscriptionStatusFilter} onChange={(event) => setSubscriptionStatusFilter(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700">
                  <option value="all">Tous les statuts</option><option value="trialing">Essai actif</option><option value="active">Payé</option><option value="expired">Expiré</option><option value="past_due">En période de grâce</option><option value="suspended">Accès abonnement suspendu</option><option value="not_started">Non démarré</option>
                </select>
              </div>
            </div>
            <div className="space-y-3">
              {filteredSubscriptions.length === 0 ? <p className="py-6 text-sm text-slate-500">Aucun abonnement ne correspond à ces critères.</p> : filteredSubscriptions.map((shop) => {
                const canExtendTrial = shop.can_extend_trial;
                const manualDraft = manualOverrideDrafts[shop.id];
                const manualAction = manualDraft?.action ?? (shop.subscription_admin_override_active ? 'clear' : 'grant');
                const manualTier = manualDraft?.tier ?? shop.plan as SubscriptionTier;
                const manualUntilDate = manualDraft?.untilDate ?? '';
                const manualReason = manualDraft?.reason ?? '';
                const statusTone = shop.status === 'active' ? 'bg-emerald-100 text-emerald-900'
                  : shop.status === 'trialing' ? 'bg-sky-100 text-sky-900'
                    : shop.status === 'past_due' || shop.status === 'expired' ? 'bg-amber-100 text-amber-950'
                      : 'bg-slate-100 text-slate-700';
                return <article key={shop.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="min-w-0 space-y-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-bold text-slate-900">{shop.name}</h4><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-700">{shop.plan}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${shop.subscription_admin_override_active ? 'bg-violet-100 text-violet-950' : statusTone}`}>{shop.subscription_admin_override_active ? shop.subscription_admin_override_status === 'active' ? 'Accès manuel' : 'Droits suspendus manuellement' : subscriptionStatusLabels[shop.status] || shop.status}</span>{!shop.is_active && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-900">Boutique désactivée</span>}</div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>{shop.whatsapp_number}</span><span>{shop.products_count} article(s)</span><span>{shop.orders_count} commande(s)</span><span>{shop.publication_status === 'active' ? 'Publication active' : shop.publication_status === 'suspended' ? 'Publication suspendue' : 'Brouillon non publié'}</span><span>{shop.whatsapp_reminders_opt_in ? 'Consentement aux rappels WhatsApp donné' : 'Pas de consentement WhatsApp'}</span><span>Inscrite le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.created_at))}</span></div>
                    <p className="mt-1 text-xs text-slate-500">{shop.subscription_admin_override_active ? 'Fin de l’accès manuel' : shop.status === 'trialing' ? 'Fin d’essai' : shop.status === 'active' ? 'Prochain renouvellement' : 'Échéance de l’abonnement'} : {shop.next_renewal_at ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.next_renewal_at)) : 'Non définie'}{shop.trial_start ? ` · Prolongation cumulée : ${shop.trial_extension_days_used}/30 jours${shop.trial_extension_over_limit ? ' — dépassement historique à vérifier' : `, ${shop.trial_extension_days_remaining} jour(s) autorisé(s) restant(s)`}` : ''} · Dernière commande : {shop.last_order_at ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.last_order_at)) : 'aucune'}</p>
                      </div>
                    {shop.pending_subscription_tier && shop.pending_subscription_effective_at && <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">Formule {shop.pending_subscription_tier} programmée au {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.pending_subscription_effective_at))}. {shop.subscription_admin_override_active ? 'Elle sera prise en compte lorsque l’automatisation reprendra.' : 'La formule actuelle reste active jusque-là.'}</p>}
                                    {shop.subscription_cancel_at && <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-950">Arrêt des droits programmé au {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.subscription_cancel_at))}. {shop.subscription_admin_override_active ? 'Il sera pris en compte lorsque l’automatisation reprendra.' : 'Les droits restent actifs jusque-là. Un renouvellement GeniusPay manuel avant cette date rétablira l’accès.'}</p>}
                    {shop.subscription_admin_suspended_at && <p className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-950">Accès à l’abonnement suspendu par l’administration le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(shop.subscription_admin_suspended_at))}. {shop.subscription_admin_override_active && shop.subscription_admin_override_status === 'active' ? 'La dérogation accorde temporairement les droits jusqu’à sa date de fin.' : 'La boutique n’est pas désactivée par cette action.'}</p>}
                    {shop.subscription_admin_override_status && <p className={`mt-2 rounded-md border px-3 py-2 text-xs font-semibold ${shop.subscription_admin_override_active ? 'border-violet-300 bg-violet-50 text-violet-950' : 'border-slate-300 bg-slate-50 text-slate-700'}`}>
                      {shop.subscription_admin_override_active
                        ? `${shop.subscription_admin_override_status === 'active' ? 'Accès manuel accordé' : 'Droits manuellement suspendus'}${shop.subscription_admin_override_tier ? ` · formule ${shop.subscription_admin_override_tier}` : ''} jusqu’au ${shop.subscription_admin_override_until ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(shop.subscription_admin_override_until)) : 'terme non défini'}. L’automatisation reprendra ensuite.`
                        : `Dérogation manuelle terminée le ${shop.subscription_admin_override_until ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(shop.subscription_admin_override_until)) : 'à une date inconnue'}; l’état automatique est rétabli.`}
                    </p>}
                    <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <summary className="cursor-pointer text-xs font-black text-slate-900">
                        Gérer l’abonnement
                        {shop.subscription_admin_override_active ? ' · dérogation à suivre' : ' · accès, échéance et formule'}
                      </summary>
                      <div className="mt-3 space-y-3">
                    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
                      <h5 className="text-xs font-black text-violet-950">Intervention manuelle · cette boutique uniquement</h5>
                      <p className="mt-1 text-[11px] leading-5 text-violet-900">Accordez ou suspendez temporairement les droits sans modifier les paiements. À la date choisie, l’état calculé automatiquement reprend le dessus. La publication et l’activation générale de la boutique restent indépendantes.</p>
                      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        <label className="text-[10px] font-bold text-violet-950">Action
                          <select
                            aria-label={`Action manuelle d’abonnement pour ${shop.name}`}
                            value={manualAction}
                            onChange={(event) => updateManualOverrideDraft(shop, { action: event.target.value as 'grant' | 'revoke' | 'clear' })}
                            className="mt-1 min-h-9 w-full rounded-md border border-violet-300 bg-white px-2 text-xs text-slate-800"
                          >
                            <option value="grant">Accorder un accès temporaire</option>
                            <option value="revoke">Suspendre temporairement les droits</option>
                            <option value="clear" disabled={!shop.subscription_admin_override_status}>Rétablir l’automatisation</option>
                          </select>
                        </label>
                        {manualAction === 'grant' && <label className="text-[10px] font-bold text-violet-950">Formule accordée
                          <select
                            aria-label={`Formule manuelle pour ${shop.name}`}
                            value={manualTier}
                            onChange={(event) => updateManualOverrideDraft(shop, { tier: event.target.value as SubscriptionTier })}
                            className="mt-1 min-h-9 w-full rounded-md border border-violet-300 bg-white px-2 text-xs text-slate-800"
                          >
                            <option value="standard">Standard</option>
                            <option value="premium">Premium</option>
                            <option value="pro">Pro</option>
                          </select>
                        </label>}
                        {manualAction !== 'clear' && <label className="text-[10px] font-bold text-violet-950">Droits jusqu’au
                          <input
                            type="date"
                            aria-label={`Date de fin des droits manuels pour ${shop.name}`}
                            min={new Date().toISOString().slice(0, 10)}
                            value={manualUntilDate}
                            onChange={(event) => updateManualOverrideDraft(shop, { untilDate: event.target.value })}
                            className="mt-1 min-h-9 w-full rounded-md border border-violet-300 bg-white px-2 text-xs text-slate-800"
                          />
                        </label>}
                        <label className="text-[10px] font-bold text-violet-950 md:col-span-2">Motif obligatoire (min. 10 caractères)
                          <input
                            type="text"
                            maxLength={500}
                            aria-label={`Motif de l’intervention manuelle pour ${shop.name}`}
                            placeholder="Ex. geste commercial approuvé, incident de paiement vérifié…"
                            value={manualReason}
                            onChange={(event) => updateManualOverrideDraft(shop, { reason: event.target.value })}
                            className="mt-1 min-h-9 w-full rounded-md border border-violet-300 bg-white px-2 text-xs text-slate-800"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={subscriptionActionShopId === shop.id
                            || manualReason.trim().length < 10
                            || (manualAction !== 'clear' && !manualUntilDate)
                            || (manualAction === 'clear' && !shop.subscription_admin_override_status)}
                          onClick={() => void handleManualSubscriptionOverride(shop)}
                          className="self-end min-h-9 rounded-md bg-violet-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          {manualAction === 'grant' ? 'Accorder les droits' : manualAction === 'revoke' ? 'Suspendre les droits' : 'Rétablir l’automatisation'}
                        </button>
                      </div>
                    </div>
                    {shop.status === 'active' && !shop.subscription_admin_override_active && <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(150px,190px)_minmax(180px,1fr)_auto]">
                      <h5 className="text-xs font-black text-slate-800 sm:col-span-3">Corriger l’échéance après vérification du paiement</h5>
                      <label className="text-[10px] font-bold text-slate-600">Nouvelle date de fin d’accès
                        <input
                          type="date"
                          aria-label={`Nouvelle date de fin d’accès de ${shop.name}`}
                          value={expiryDrafts[shop.id]?.date ?? shop.subscription_expires_at?.slice(0, 10) ?? ''}
                          onChange={(event) => setExpiryDrafts((previous) => ({
                            ...previous,
                            [shop.id]: { date: event.target.value, reason: previous[shop.id]?.reason ?? '' },
                          }))}
                          className="mt-1 min-h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
                        />
                      </label>
                      <label className="text-[10px] font-bold text-slate-600">Motif et référence du paiement vérifié
                        <input
                          type="text"
                          maxLength={500}
                          aria-label={`Motif de correction de la date d’accès pour ${shop.name}`}
                          placeholder="Ex. reçu vérifié du 20/10, période payée jusqu’au…"
                          value={expiryDrafts[shop.id]?.reason ?? ''}
                          onChange={(event) => setExpiryDrafts((previous) => ({
                            ...previous,
                            [shop.id]: { date: previous[shop.id]?.date ?? shop.subscription_expires_at?.slice(0, 10) ?? '', reason: event.target.value },
                          }))}
                          className="mt-1 min-h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={subscriptionActionShopId === shop.id || !expiryDrafts[shop.id]?.date || (expiryDrafts[shop.id]?.reason.trim().length ?? 0) < 10}
                        onClick={() => void handleSetSubscriptionExpiry(shop)}
                        className="self-end min-h-9 rounded-md bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                      >
                        Enregistrer la date
                      </button>
                    </div>}
                    {shop.status === 'active' && shop.subscription_expires_at && !shop.subscription_admin_override_active && !shop.subscription_cancel_at && !shop.subscription_admin_suspended_at && <div className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 sm:grid-cols-[minmax(150px,190px)_minmax(180px,1fr)_auto]">
                      <h5 className="text-xs font-black text-amber-950 sm:col-span-3">Programmer une formule pour le prochain renouvellement</h5>
                      <label className="text-[10px] font-bold text-slate-700">Formule au prochain renouvellement
                        <select
                          aria-label={`Formule au prochain renouvellement de ${shop.name}`}
                          value={planChangeDrafts[shop.id]?.tier ?? shop.pending_subscription_tier ?? shop.plan as SubscriptionTier}
                          onChange={(event) => setPlanChangeDrafts((previous) => ({
                            ...previous,
                            [shop.id]: {
                              tier: event.target.value as SubscriptionTier,
                              reason: previous[shop.id]?.reason ?? '',
                            },
                          }))}
                          className="mt-1 min-h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
                        >
                          <option value="standard">Standard</option>
                          <option value="premium">Premium</option>
                          <option value="pro">Pro</option>
                        </select>
                      </label>
                      <label className="text-[10px] font-bold text-slate-700">Motif obligatoire (min. 10 caractères)
                        <input
                          type="text"
                          maxLength={500}
                          aria-label={`Motif du changement de formule pour ${shop.name}`}
                          placeholder="Ex. demande du commerçant..."
                          value={planChangeDrafts[shop.id]?.reason ?? ''}
                          onChange={(event) => setPlanChangeDrafts((previous) => ({
                            ...previous,
                            [shop.id]: {
                              tier: previous[shop.id]?.tier ?? shop.pending_subscription_tier ?? shop.plan as SubscriptionTier,
                              reason: event.target.value,
                            },
                          }))}
                          className="mt-1 min-h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={subscriptionActionShopId === shop.id
                          || (planChangeDrafts[shop.id]?.reason.trim().length ?? 0) < 10
                          || (!shop.pending_subscription_tier && (planChangeDrafts[shop.id]?.tier ?? shop.plan) === shop.plan)}
                        onClick={() => void handleScheduleSubscriptionPlan(shop)}
                        className="self-end min-h-9 rounded-md bg-amber-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {shop.pending_subscription_tier
                          && planChangeDrafts[shop.id]?.tier === shop.plan
                          ? 'Annuler le changement'
                          : 'Programmer'}
                      </button>
                    </div>}
                    <div className="border-t border-slate-200 pt-3">
                      <h5 className="text-xs font-black text-slate-800">Actions de cycle de vie et de boutique</h5>
                      <div className="mt-2 flex flex-wrap gap-2">
                      {!shop.subscription_admin_override_active && shop.subscription_admin_suspended_at
                        ? <button type="button" disabled={subscriptionActionShopId === shop.id} onClick={() => void handleSubscriptionLifecycleAction(shop, 'reactivate')} className="min-h-9 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50">Réactiver les droits</button>
                        : !shop.subscription_admin_override_active && (shop.status === 'active' || shop.status === 'trialing') && <button type="button" disabled={subscriptionActionShopId === shop.id || Boolean(shop.subscription_cancel_at)} onClick={() => void handleSubscriptionLifecycleAction(shop, 'suspend')} className="min-h-9 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-900 hover:bg-rose-50 disabled:opacity-50">Suspendre les droits</button>}
                      {!shop.subscription_admin_override_active && shop.subscription_cancel_at
                        ? <button type="button" disabled={subscriptionActionShopId === shop.id} onClick={() => void handleSubscriptionLifecycleAction(shop, 'undo_cancellation')} className="min-h-9 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-50 disabled:opacity-50">Annuler l’arrêt programmé</button>
                        : !shop.subscription_admin_override_active && shop.status === 'active' && shop.subscription_expires_at && !shop.subscription_admin_suspended_at && !shop.pending_subscription_tier && <button type="button" disabled={subscriptionActionShopId === shop.id} onClick={() => void handleSubscriptionLifecycleAction(shop, 'cancel_at_period_end')} className="min-h-9 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-900 hover:bg-rose-50 disabled:opacity-50">Arrêter l’accès à l’échéance</button>}
                      {shop.status === 'trialing' && shop.trial_days_remaining !== null && shop.trial_days_remaining <= 7 && shop.whatsapp_reminders_opt_in && <button type="button" disabled={subscriptionActionShopId === shop.id} onClick={() => void handlePrepareTrialReminder(shop)} className="min-h-9 rounded-lg border border-emerald-700 bg-white px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50">Ouvrir WhatsApp</button>}
                      {!shop.subscription_admin_override_active && canExtendTrial && <button type="button" disabled={subscriptionActionShopId === shop.id || shop.trial_extension_over_limit || shop.trial_extension_days_remaining === 0 || trialExtensionDays > shop.trial_extension_days_remaining} onClick={() => void handleExtendTrial(shop)} className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{shop.trial_extension_over_limit ? 'Dépassement à vérifier' : shop.trial_extension_days_remaining === 0 ? 'Plafond atteint' : trialExtensionDays > shop.trial_extension_days_remaining ? `Maximum ${shop.trial_extension_days_remaining} j` : `Prolonger de ${trialExtensionDays} j`}</button>}
                      <button type="button" onClick={() => void handleToggleActive(shop.id)} className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs font-bold ${shop.is_active ? 'border-rose-200 bg-white text-rose-800 hover:bg-rose-50' : 'border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50'}`}>{shop.is_active ? 'Désactiver boutique' : 'Réactiver boutique'}</button>
                      </div>
                    </div>
                      </div>
                    </details>
                  </div>
                </article>;
              })}
            </div>
          </section>

          <section aria-labelledby="subscription-audit-title" className="border-t border-slate-200 pt-4">
            <h3 id="subscription-audit-title" className="text-sm font-black text-slate-900">Actions administratives récentes</h3>
            {subscriptions.audit_logs.length === 0 ? <p className="mt-2 text-xs text-slate-500">Les actions d’administration apparaîtront ici.</p> : <div className="mt-2 divide-y divide-slate-200">
            {subscriptions.audit_logs.slice(0, 8).map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><div><span className="font-semibold text-slate-800">{entry.action === 'subscription_reminder_sent' ? `Rappel WhatsApp envoyé J−${getReminderLeadDays(entry.details) ?? '?'}` : entry.action === 'subscription_reminder_failed' ? `Échec du rappel WhatsApp J−${getReminderLeadDays(entry.details) ?? '?'}` : adminAuditActionLabels[entry.action] || 'Action administrative'} · {entry.shop_name || 'Boutique supprimée'}</span>{getAdminAuditReason(entry.details) && <p className="mt-1 text-slate-500">Motif : {getAdminAuditReason(entry.details)}</p>}{entry.action === 'subscription_reminder_failed' && getReminderFailure(entry.details) && <p className="mt-1 text-rose-700">Erreur fournisseur : {getReminderFailure(entry.details)}</p>}</div><time className="text-slate-500">{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.created_at))}</time></div>)}
            </div>}
          </section>
        </>}
      </section>
    </>
  );
}
