import { useState } from 'react';
import { ArrowRight, BarChart3, Check, CircleCheck, LoaderCircle, LockKeyhole, MessageCircle, Palette, ShieldCheck, Sparkles, Store } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Shop, SubscriptionTier } from '../../types';
import { getSupportWhatsAppUrl } from '../../utils/supportWhatsApp';
import { MerchantBoostPurchase } from './MerchantBoostPurchase';
import {
  BOOST_DURATIONS_DAYS,
  BOOST_MINIMUM_PRODUCT_COUNT,
  BOOST_PRICES,
  MAX_SIMULTANEOUS_BOOSTS_PER_PLACEMENT_SCOPE,
  getBoostPrice,
} from '../../utils/boostPricing';
import {
  DEFAULT_SUBSCRIPTION_PRO_FEATURES,
  getSubscriptionPlanBenefits,
  SUBSCRIPTION_PLANS,
  TRIAL_CATALOG_LIMIT,
  TRIAL_DURATION_DAYS,
  type SubscriptionTerm,
} from '../../utils/subscriptionFeatures';
import { useSubscriptionPrices } from '../../utils/useSubscriptionPrices';
import { getRenewedSubscriptionExpiry } from '../../utils/subscriptionExpiry';
import { WhatsAppSubscriptionReminderConsent } from './WhatsAppSubscriptionReminderConsent';

interface MerchantTrialOnboardingProps {
  shop: Shop;
  productCount?: number;
  isStarting: boolean;
  onStart?: (tier: SubscriptionTier) => void;
  mode?: 'start' | 'expired' | 'plans';
  previewOnly?: boolean;
  onBack?: () => void;
}

const plans = Object.values(SUBSCRIPTION_PLANS);

export function MerchantTrialOnboarding({ shop, productCount = 0, isStarting, onStart, mode = 'start', previewOnly = false, onBack }: MerchantTrialOnboardingProps) {
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>(shop.subscription?.upcomingPlan || shop.subscription?.plan || 'standard');
  const [term, setTerm] = useState<SubscriptionTerm>('monthly');
  const prefersReducedMotion = useReducedMotion();
  const [purchaseNow, setPurchaseNow] = useState(false);
  const [isPaymentStarting, setIsPaymentStarting] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState('');
  const [needsBillingEmail, setNeedsBillingEmail] = useState(false);
  const [billingEmail, setBillingEmail] = useState('');
  const { prices: subscriptionPrices, proFeatures, error: subscriptionPricesError } = useSubscriptionPrices();
  const selectedPlan = plans.find((plan) => plan.tier === selectedTier) || plans[0];
  const monthlyPrice = subscriptionPrices?.[selectedTier];
  const paymentPrice = monthlyPrice === undefined
    ? null
    : monthlyPrice * (term === 'annual' ? 10 : 1);
  const paymentFlowActive = previewOnly || mode !== 'start' || purchaseNow;
  const isTrialActive = shop.subscription?.status === 'trialing';
  const isManualSubscriptionSuspension = Boolean(
    shop.subscription?.manualOverrideActive && shop.subscription.status === 'suspended',
  );
  const supportUrl = getSupportWhatsAppUrl(`Bonjour, j’ai besoin d’aide pour l’espace commerçant de ${shop.name}.`);
  const trialEndTime = shop.subscription?.trialEnd ? Date.parse(shop.subscription.trialEnd) : NaN;
  const subscriptionExpiryTime = shop.subscription?.expiresAt ? Date.parse(shop.subscription.expiresAt) : NaN;
  const projectedExpiry = getRenewedSubscriptionExpiry(shop.subscription?.expiresAt, new Date(), term);
  const formatSubscriptionDate = (value: string) => new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeZone: 'Africa/Abidjan',
  }).format(new Date(value));
  const isTrialExpired = mode === 'expired'
    && Number.isFinite(trialEndTime)
    && (!Number.isFinite(subscriptionExpiryTime) || subscriptionExpiryTime <= trialEndTime);
  const expiredTitle = isTrialExpired
    ? 'Votre période d’essai est terminée'
    : shop.subscription?.status === 'past_due'
      ? 'Votre paiement est à régulariser'
      : shop.subscription?.status === 'suspended'
        ? 'Votre abonnement est suspendu'
        : shop.subscription?.status === 'cancelled'
          ? 'Votre abonnement est résilié'
          : 'Votre abonnement est arrivé à échéance';
  const expiredDescription = isManualSubscriptionSuspension
    ? 'Les droits de cette boutique sont suspendus temporairement par l’administration. Aucun paiement GeniusPay ne peut être lancé pendant cette suspension. Contactez l’équipe si vous avez besoin d’aide.'
    : isTrialExpired
    ? 'Choisissez une formule mensuelle ou annuelle et réglez-la avec GeniusPay. Votre abonnement sera réactivé après confirmation sécurisée ; la visibilité dépend aussi de la publication et de la vérification de la boutique.'
    : shop.subscription?.status === 'past_due'
      ? 'Le dernier paiement n’a pas été confirmé. Choisissez une formule mensuelle ou annuelle et réglez-la avec GeniusPay pour réactiver votre abonnement. La visibilité dépend aussi de la publication et de la vérification de la boutique.'
      : 'Choisissez une formule et sa durée, puis réglez-la avec GeniusPay. Votre abonnement sera réactivé après confirmation sécurisée ; la visibilité dépend aussi de la publication et de la vérification de la boutique.';

  const startSubscriptionPayment = async () => {
    if (isManualSubscriptionSuspension) {
      setPaymentMessage('Les droits sont suspendus temporairement par l’administration. Aucun paiement ne sera lancé pendant cette suspension.');
      return;
    }
    if (!subscriptionPrices || paymentPrice === null) {
      setPaymentMessage(subscriptionPricesError || 'Les tarifs sont en cours de chargement. Réessayez dans un instant.');
      return;
    }
    setPaymentMessage('');
    setIsPaymentStarting(true);
    try {
      const clientRequestId = crypto.randomUUID();
      const response = await fetch(`/api/shops/${shop.id}/subscription-payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tier: selectedTier,
          term,
          client_request_id: clientRequestId,
          ...(billingEmail.trim() ? { billing_email: billingEmail.trim() } : {}),
        }),
      });
      const data = await response.json();
      if (data.code === 'billing_email_required') {
        setNeedsBillingEmail(true);
        setPaymentMessage('Un e-mail est nécessaire pour préparer le paiement et vous envoyer le reçu.');
        setIsPaymentStarting(false);
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Impossible de préparer le paiement GeniusPay.');
      setNeedsBillingEmail(false);
      window.location.assign(data.checkout_url);
    } catch (error) {
      setPaymentMessage(error instanceof Error ? error.message : 'Impossible de démarrer le paiement.');
      setIsPaymentStarting(false);
    }
  };

  return (
    <main className={`merchant-pre-dashboard ${mode === 'plans' ? 'min-h-screen px-0 py-0' : 'min-h-screen px-4 py-8 sm:px-6 sm:py-12'} bg-[#f4f6f1] text-slate-900`}>
      <div className={`mx-auto ${mode === 'plans' ? 'max-w-[1240px] px-4 pb-12 sm:px-6 lg:px-8' : 'max-w-4xl'}`}>
        {mode === 'plans' ? (
          <>
            {onBack && (
              <div className="py-4 sm:py-6">
                <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#ded8ce] bg-[#FFFFFF] px-4 text-sm font-bold text-[#47534b] transition hover:bg-[#d1fae5]">
                  <span aria-hidden="true">←</span> {previewOnly ? 'Retour à l’annuaire' : 'Retour à mon forfait'}
                </button>
              </div>
            )}
            <header className="relative isolate overflow-hidden rounded-[2rem] bg-[#103f34] px-6 py-8 text-white shadow-[0_24px_60px_-28px_rgba(15,77,61,0.65)] sm:px-10 sm:py-11 lg:px-14 lg:py-14">
              <div aria-hidden="true" className="absolute -right-16 -top-28 -z-10 h-80 w-80 rounded-full border-[42px] border-white/[0.06]" />
              <div aria-hidden="true" className="absolute -bottom-32 right-[23%] -z-10 h-64 w-64 rounded-full bg-[#dba956]/10 blur-3xl" />
              <div className="grid items-center gap-9 lg:grid-cols-[1.2fr_0.8fr] lg:gap-14">
                <div>
                  <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-[#f1d59f]">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Grandir, à votre façon
                  </p>
                  <h1 className="mt-5 max-w-2xl text-3xl font-black leading-[1.08] tracking-tight sm:text-4xl lg:text-[3.4rem]">
                    Votre savoir-faire mérite <span className="text-[#efc779]">une vitrine à sa hauteur.</span>
                  </h1>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-white/75 sm:text-base">
                    Présentez vos produits, faites-vous découvrir et échangez directement avec vos clients. Choisissez le coup de pouce qui correspond à votre prochaine étape.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-xs font-bold text-white/85 sm:text-sm">
                    <span className="inline-flex items-center gap-2"><CircleCheck className="h-4 w-4 text-[#efc779]" />Une vitrine qui vous ressemble</span>
                    <span className="inline-flex items-center gap-2"><CircleCheck className="h-4 w-4 text-[#efc779]" />Contact direct sur WhatsApp</span>
                  </div>
                </div>
                <div className="relative mx-auto hidden w-full max-w-[390px] rounded-[1.6rem] border border-white/15 bg-white/[0.08] p-4 shadow-2xl backdrop-blur-sm sm:p-5 lg:block">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <span className="text-xs font-bold text-white/65">Votre espace commerçant</span>
                    <span className="rounded-full bg-[#d9efdf]/15 px-2.5 py-1 text-[10px] font-extrabold text-[#c8efcf]">MATABLE.CI · ESPACE PRO</span>
                  </div>
                  <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#FFFFFF] p-4 text-[#163d32]">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e5f0e8]"><Store className="h-6 w-6" aria-hidden="true" /></span>
                    <span><strong className="block text-sm font-black">{shop.name}</strong><span className="mt-0.5 block text-xs text-[#6d786f]">Votre activité, à votre image</span></span>
                    <span className="ml-auto h-2.5 w-2.5 rounded-full bg-[#54a876] ring-4 ring-[#54a876]/15" aria-hidden="true" />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-[#efc779] p-4 text-[#3f301b]">
                      <Palette className="h-5 w-5" aria-hidden="true" />
                      <strong className="mt-3 block text-xs font-black">Votre identité</strong>
                      <span className="mt-1 block text-[11px] leading-4 text-[#654e2d]">Couleurs, logo et univers</span>
                    </div>
                    <div className="rounded-2xl bg-white/[0.1] p-4 text-white">
                      <BarChart3 className="h-5 w-5 text-[#efc779]" aria-hidden="true" />
                      <strong className="mt-3 block text-xs font-black">Vos progrès</strong>
                      <span className="mt-1 block text-[11px] leading-4 text-white/65">Des repères pour avancer</span>
                    </div>
                  </div>
                  <p className="mt-4 text-center text-[10px] font-semibold tracking-wide text-white/50">Un même espace. La formule qui vous ressemble.</p>
                </div>
                <div className="flex flex-wrap gap-2 lg:hidden">
                  {[
                    { icon: Store, label: 'Votre vitrine' },
                    { icon: MessageCircle, label: 'WhatsApp direct' },
                    { icon: BarChart3, label: 'Outils pour grandir' },
                  ].map(({ icon: Icon, label }) => <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] px-3 py-2 text-[11px] font-bold text-white/85"><Icon className="h-3.5 w-3.5 text-[#efc779]" aria-hidden="true" />{label}</span>)}
                </div>
              </div>
            </header>
          </>
        ) : (
          <header className="border-b border-[#dce4dc] pb-6">
            <p className="text-xs font-extrabold uppercase text-[#047857]">MaTable.ci · Espace commerçant</p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">{mode === 'expired' ? expiredTitle : `Bienvenue, ${shop.name}`}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{mode === 'expired' ? expiredDescription : isTrialActive ? `Votre essai gratuit reste actif jusqu’au ${shop.subscription?.trialEnd ? formatSubscriptionDate(shop.subscription.trialEnd) : 'terme prévu'}. Vous pouvez payer maintenant : après confirmation, votre formule payante sera active et la durée restante de l’essai sera conservée.` : `Vous pouvez choisir une formule payante dès maintenant ou commencer par l’essai gratuit de ${TRIAL_DURATION_DAYS} jours.`}</p>
            {supportUrl && <a href={supportUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-emerald-800 underline underline-offset-2"><MessageCircle className="h-4 w-4" />Contacter l’équipe</a>}
          </header>
        )}

        {mode === 'start' && shop.subscription?.status === 'not_started' && (
          <section className="mt-6" aria-labelledby="startup-choice-title">
            <h2 id="startup-choice-title" className="text-lg font-extrabold text-[#183b31]">Comment souhaitez-vous démarrer ?</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Vous pourrez toujours passer à une formule payante pendant votre essai.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2" role="group" aria-label="Choisir son démarrage">
              <button type="button" aria-pressed={!purchaseNow} onClick={() => setPurchaseNow(false)} className={`rounded-2xl border p-4 text-left transition ${!purchaseNow ? 'border-[#047857] bg-white ring-2 ring-[#047857]/15' : 'border-[#d5ddd5] bg-white/70 hover:border-[#047857]'}`}>
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-extrabold text-[#183b31]">Essayer gratuitement</span>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-900">7 jours offerts</span>
                </span>
                <span className="mt-2 block text-xs leading-5 text-slate-600">Standard, jusqu’à {TRIAL_CATALOG_LIMIT} produits. Aucun paiement nécessaire pour commencer.</span>
              </button>
              <button type="button" aria-pressed={purchaseNow} onClick={() => setPurchaseNow(true)} className={`rounded-2xl border p-4 text-left transition ${purchaseNow ? 'border-[#047857] bg-white ring-2 ring-[#047857]/15' : 'border-[#d5ddd5] bg-white/70 hover:border-[#047857]'}`}>
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-extrabold text-[#183b31]">Choisir une formule payante</span>
                  <span className="rounded-full bg-[#f9f0e6] px-2.5 py-1 text-[10px] font-black text-[#93602e]">Dès 3 000 FCFA/mois</span>
                </span>
                <span className="mt-2 block text-xs leading-5 text-slate-600">Choisissez Standard, Premium ou Pro ; le forfait démarre après confirmation GeniusPay.</span>
              </button>
            </div>
          </section>
        )}

        {paymentFlowActive ? (
          <section className="mt-7" aria-labelledby="plan-heading">
            <div className={`flex flex-wrap items-end justify-between gap-4 ${mode === 'plans' ? 'mb-5 mt-9 sm:mt-12' : ''}`}>
              <div>
                {mode === 'plans' && <p className="mb-1 text-xs font-black uppercase tracking-[0.16em] text-[#b16f35]">Trouvez votre élan</p>}
                <h2 id="plan-heading" className={`${mode === 'plans' ? 'text-2xl font-black tracking-tight text-[#183b31] sm:text-3xl' : 'text-lg font-extrabold'}`}>{mode === 'expired' ? 'Choisissez votre formule de renouvellement' : mode === 'plans' ? 'Trois formules. Une boutique qui avance.' : 'Choisissez votre formule'}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{mode === 'plans' ? `Choisissez votre formule pour ${shop.name}. Vous pouvez renouveler avant l’échéance : la période restante est conservée et la nouvelle durée s’ajoute à la date d’expiration actuelle.` : 'Le paiement est lancé uniquement après votre validation. Si un essai ou un abonnement est en cours, le temps restant est conservé.'}</p>
              </div>
              <div className="inline-flex rounded-full border border-[#d9dfd7] bg-white p-1 shadow-sm" role="group" aria-label="Durée de l’abonnement">
                <button type="button" onClick={() => setTerm('monthly')} aria-pressed={term === 'monthly'} className={`rounded-full px-4 py-2.5 text-xs font-extrabold transition ${term === 'monthly' ? 'bg-[#174f40] text-white shadow-sm' : 'text-slate-600 hover:text-[#174f40]'}`}>Mensuel</button>
                <button type="button" onClick={() => setTerm('annual')} aria-pressed={term === 'annual'} className={`rounded-full px-4 py-2.5 text-xs font-extrabold transition ${term === 'annual' ? 'bg-[#174f40] text-white shadow-sm' : 'text-slate-600 hover:text-[#174f40]'}`}>Annuel <span className="ml-1 text-[#c47c36]">−2 mois</span></button>
              </div>
            </div>
            {shop.subscription?.upcomingPlan && shop.subscription.upcomingPlanAt && (
              <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                La formule {shop.subscription.upcomingPlan} est programmée pour le {formatSubscriptionDate(shop.subscription.upcomingPlanAt)}. Vos droits actuels restent inchangés jusque-là; le renouvellement devra utiliser cette formule.
              </p>
            )}
            {shop.subscription?.cancellationAt && (
              <p className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-950">
                L’accès à votre boutique prendra fin le {formatSubscriptionDate(shop.subscription.cancellationAt)}. Vous pouvez payer votre renouvellement ici avant cette date : MaTable.ci ne prélève jamais automatiquement et la période restante sera conservée.
              </p>
            )}
            <div className={`grid md:grid-cols-3 ${mode === 'plans' ? 'items-stretch gap-4 md:gap-5' : 'mt-4 gap-4'}`} role="radiogroup" aria-label="Formule d’abonnement">
              {plans.map((plan) => {
                const selected = selectedTier === plan.tier;
                const featured = mode === 'plans' && plan.tier === 'premium';
                const planIcon = plan.tier === 'standard' ? Store : plan.tier === 'premium' ? Sparkles : BarChart3;
                const planEyebrow = plan.tier === 'standard' ? 'Pour démarrer' : plan.tier === 'premium' ? 'Le meilleur équilibre' : 'Pour accélérer';
                const planColors = plan.tier === 'premium'
                  ? { card: 'border-[#075f48] bg-[#075f48] text-white', subdued: 'text-white/80', check: 'text-[#f0ba80]' }
                  : plan.tier === 'pro'
                  ? { card: selected ? 'border-[#075f48] bg-[#075f48] text-white ring-4 ring-[#075f48]/15' : 'border-[#cad9d0] bg-[#f1f6f1] text-[#183b31] hover:border-[#075f48]', subdued: selected ? 'text-white/80' : 'text-slate-600', check: selected ? 'text-[#f0ba80]' : 'text-[#075f48]' }
                  : { card: selected ? 'border-[#047857] bg-white ring-4 ring-[#047857]/10 shadow-[0_18px_42px_-24px_rgba(15,77,61,0.45)]' : 'border-[#e0e4db] bg-white hover:border-[#9fb7a8]', subdued: 'text-slate-600', check: 'text-[#047857]' };
                const PlanIcon = planIcon;
                return (
                  <motion.button
                    key={plan.tier}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={Boolean(shop.subscription?.upcomingPlan && plan.tier !== shop.subscription.upcomingPlan)}
                    onClick={() => setSelectedTier(plan.tier)}
                    whileHover={mode === 'plans' && !prefersReducedMotion ? { y: -5 } : undefined}
                    whileTap={mode === 'plans' && !prefersReducedMotion ? { scale: 0.99 } : undefined}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
                    className={`relative flex min-h-[360px] flex-col items-start rounded-[26px] border p-5 text-left transition duration-200 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 sm:p-6 ${mode === 'plans' ? `${planColors.card} ${plan.tier === 'premium' ? 'shadow-[0_22px_55px_rgba(7,95,72,.2)] md:scale-[1.035]' : selected ? 'shadow-[0_18px_42px_-24px_rgba(15,77,61,0.35)]' : 'shadow-[0_12px_34px_rgba(38,35,28,.07)]'}` : `min-h-56 rounded-xl ${selected ? 'border-[#047857] bg-white ring-2 ring-[#047857]/20' : 'border-[#d5ddd5] bg-white/70 hover:border-[#047857]'}`} hover:-translate-y-0.5`}
                  >
                  {featured && <span className="mb-4 rounded-full bg-[#f0ba80] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#292d2a] shadow-sm">Recommandée</span>}
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${mode === 'plans' && (plan.tier === 'premium' || plan.tier === 'pro' && selected) ? 'bg-white/10 text-[#f0ba80]' : 'bg-[#e9f5ee] text-[#087c5b]'}`}><PlanIcon className="h-5 w-5" aria-hidden="true" /></span>
                        <span className="min-w-0"><span className={`block text-[9px] font-black uppercase tracking-[0.12em] ${mode === 'plans' && (plan.tier === 'premium' || plan.tier === 'pro' && selected) ? 'text-[#f0ba80]' : 'text-[#8b7358]'}`}>{planEyebrow}</span><span className={`mt-0.5 block text-sm font-black uppercase tracking-[0.11em] ${mode === 'plans' && (plan.tier === 'premium' || plan.tier === 'pro' && selected) ? 'text-white' : mode === 'plans' ? 'text-[#075f48]' : ''}`}>{plan.label}</span></span>
                      </span>
                      {selected && <Check className={`h-5 w-5 shrink-0 ${mode === 'plans' ? planColors.check : 'text-emerald-700'}`} />}
                    </span>
                    <h3 className={`mt-4 text-xl font-black leading-tight ${mode === 'plans' && (plan.tier === 'premium' || plan.tier === 'pro' && selected) ? 'text-white' : 'text-[#202d28]'}`}>{plan.headline}</h3>
                    <p className={`mt-2 min-h-10 text-xs leading-5 ${mode === 'plans' ? planColors.subdued : 'text-slate-600'}`}>{plan.description}</p>
                    <div className={`mt-5 border-b pb-5 ${mode === 'plans' ? selected && plan.tier === 'pro' ? 'border-white/15' : 'border-[#e8ebe5]' : 'border-[#e8ebe5]'}`}>
                      <strong className="text-3xl font-black tracking-tight"><AnimatePresence mode="wait" initial={false}><motion.span key={`${plan.tier}-${term}`} initial={prefersReducedMotion ? false : { opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={prefersReducedMotion ? undefined : { opacity: 0, y: -7 }} transition={{ duration: prefersReducedMotion ? 0 : 0.16 }} className="inline-block">{subscriptionPrices ? new Intl.NumberFormat('fr-FR').format(subscriptionPrices[plan.tier] * (term === 'annual' ? 10 : 1)) : '—'}</motion.span></AnimatePresence><span className="ml-1 text-sm font-bold">FCFA</span></strong>
                      <span className={`ml-1 text-xs font-semibold ${mode === 'plans' ? planColors.subdued : 'text-slate-600'}`}>/{term === 'annual' ? 'an' : 'mois'}</span>
                      <span className={`mt-1.5 block text-xs ${mode === 'plans' ? planColors.subdued : 'text-slate-600'}`}>{subscriptionPrices ? term === 'annual' ? `Soit ${new Intl.NumberFormat('fr-FR').format(subscriptionPrices[plan.tier])} FCFA/mois · 2 mois offerts` : `${new Intl.NumberFormat('fr-FR').format(Math.ceil(subscriptionPrices[plan.tier] / 30))} FCFA par jour` : 'Tarif indisponible'}</span>
                    </div>
                    {mode === 'plans' && <span className={`group mt-5 flex min-h-11 w-full items-center justify-between gap-2 rounded-full px-4 text-xs font-extrabold transition ${plan.tier === 'premium' ? 'bg-[#f0ba80] text-[#292d2a]' : 'bg-[#075f48] text-white'}`}>
                      {selected ? 'Formule sélectionnée' : plan.tier === 'standard' ? 'Commencer' : `Choisir ${plan.label}`} <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                    </span>}
                    <p className={`mt-7 border-t pt-5 text-xs font-black ${mode === 'plans' && plan.tier === 'premium' ? 'border-white/20 text-white' : 'border-[#e8ebe5] text-[#202d28]'}`}>
                      Détails de la formule :
                    </p>
                    <ul className={`mt-4 flex-1 space-y-3 text-left text-xs leading-5 ${mode === 'plans' ? planColors.subdued : 'text-slate-700'}`}>
                      {getSubscriptionPlanBenefits(plan.tier, proFeatures || DEFAULT_SUBSCRIPTION_PRO_FEATURES).map((benefit) => <li key={benefit} className="flex items-start gap-2.5"><Check className={`mt-0.5 h-4 w-4 shrink-0 ${mode === 'plans' ? planColors.check : 'text-emerald-700'}`} /><span>{benefit}</span></li>)}
                    </ul>
                    </motion.button>
                );
              })}
            </div>
            {!previewOnly && (
              <div className="mt-4 rounded-xl border border-[#dbe8dc] bg-white p-4 text-sm text-slate-700" aria-live="polite">
                <p><strong>À payer aujourd’hui :</strong> {paymentPrice === null ? 'Tarif indisponible' : `${new Intl.NumberFormat('fr-FR').format(paymentPrice)} FCFA avec GeniusPay.`}</p>
                {isTrialActive ? (
                  <p className="mt-1">Dès confirmation, le forfait {selectedPlan.label} sera actif. Votre essai se termine le {shop.subscription?.trialEnd ? formatSubscriptionDate(shop.subscription.trialEnd) : 'à la date prévue'} ; cette période est conservée et votre forfait arrivera à échéance le {formatSubscriptionDate(projectedExpiry)}.</p>
                ) : Number.isFinite(subscriptionExpiryTime) && subscriptionExpiryTime > Date.now() ? (
                  <p className="mt-1">Votre échéance actuelle est le {formatSubscriptionDate(shop.subscription?.expiresAt || projectedExpiry)}. Après paiement, votre nouvelle échéance sera le {formatSubscriptionDate(projectedExpiry)} ; le temps restant est conservé.</p>
                ) : (
                  <p className="mt-1">Après confirmation du paiement, votre formule {selectedPlan.label} sera active jusqu’au {formatSubscriptionDate(projectedExpiry)}.</p>
                )}
                {subscriptionPricesError && <p role="alert" className="mt-3 text-sm font-semibold text-rose-800">Impossible de charger les tarifs : {subscriptionPricesError}</p>}
              </div>
            )}
            {mode === 'plans' && (
              <section className="mt-6 rounded-[1.5rem] border border-[#e4d9c7] bg-[#fffdf8] p-5 sm:mt-8 sm:p-6" aria-labelledby="boost-plan-heading">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><Sparkles className="h-5 w-5" /></span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[#a2642e]">En complément de votre abonnement</p>
                    <h3 id="boost-plan-heading" className="mt-1 text-lg font-black text-[#183b31]">Boost sponsorisé · tarifs par durée</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">Le Boost est une mise en avant ponctuelle dans l’annuaire, achetée séparément de votre forfait. Il est identifié comme sponsorisé et ne remplace pas les critères de pertinence du classement.</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="Tarifs des boosts">
                  {BOOST_DURATIONS_DAYS.map((days) => (
                    <div key={days} className="rounded-xl border border-[#eee6da] bg-white p-4">
                      <p className="text-xs font-bold text-slate-500">Durée</p>
                      <p className="mt-1 text-sm font-extrabold text-slate-900">{days === 1 ? '24 h' : `${days} jours`}</p>
                      <p className="mt-3 text-xs font-bold text-slate-500">Tarif standard</p>
                      <p className="mt-1 text-lg font-black text-[#183b31]">{new Intl.NumberFormat('fr-FR').format(BOOST_PRICES[days])} FCFA</p>
                      {(proFeatures || DEFAULT_SUBSCRIPTION_PRO_FEATURES).boostDiscountPercent > 0 && (
                        <p className="mt-2 text-xs font-bold text-emerald-800">
                          Pro : {new Intl.NumberFormat('fr-FR').format(getBoostPrice(days, (proFeatures || DEFAULT_SUBSCRIPTION_PRO_FEATURES).boostDiscountPercent) || BOOST_PRICES[days])} FCFA (−{(proFeatures || DEFAULT_SUBSCRIPTION_PRO_FEATURES).boostDiscountPercent} %)
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <ul className="mt-4 grid gap-2 text-xs leading-5 text-slate-600 sm:grid-cols-2">
                  <li>• Achat possible pour une boutique vérifiée, ouverte, avec une ville renseignée et au moins {BOOST_MINIMUM_PRODUCT_COUNT} produits.</li>
                  <li>• Un seul emplacement par achat : accueil, haut de catégorie ou boutiques de la ville. Jusqu’à {MAX_SIMULTANEOUS_BOOSTS_PER_PLACEMENT_SCOPE} boosts simultanés par emplacement (accueil), catégorie ou ville.</li>
                  <li>• La durée commence à la date prévue, même si la boutique est temporairement masquée.</li>
                  <li>• Pas de remboursement après activation. Si MaTable.ci ne peut pas activer le boost payé, contactez l’assistance pour demander un remboursement.</li>
                </ul>
                {!previewOnly && <MerchantBoostPurchase shop={shop} productCount={productCount} />}
              </section>
            )}
          </section>
        ) : (
          <section className="mt-7 rounded-xl border border-emerald-200 bg-white p-5">
            <h2 className="text-lg font-extrabold">Essai gratuit · Standard</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {shop.subscription?.status === 'not_started'
                ? `L’essai dure ${TRIAL_DURATION_DAYS} jours à partir de son activation. Il donne accès aux fonctions Standard avec une limite de ${TRIAL_CATALOG_LIMIT} produits.`
                : `L’essai de ${TRIAL_DURATION_DAYS} jours commence à la création de votre boutique. Il donne accès aux fonctions Standard avec une limite de ${TRIAL_CATALOG_LIMIT} produits.`}
            </p>
            <ul className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
              {[
                `Jusqu’à ${TRIAL_CATALOG_LIMIT} produits pendant l’essai`,
                'Commandes directes sur WhatsApp',
                'Présence dans l’annuaire après vérification et publication',
                'Statistiques de base',
              ].map((benefit) => <li key={benefit} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />{benefit}</li>)}
            </ul>
          </section>
        )}

        <aside className={`mt-5 flex items-start gap-3 rounded-2xl border p-4 text-sm ${mode === 'plans' ? 'border-[#dbe8dc] bg-white text-[#345448] sm:mt-7 sm:px-5' : 'border-sky-200 bg-sky-50 text-sky-950'}`}>
          {mode === 'plans' ? <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-[#047857]" /> : <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-800" />}
          <p>{previewOnly ? 'Aperçu de démonstration : comparez les formules librement. Aucun paiement ne sera lancé.' : isManualSubscriptionSuspension ? 'La suspension manuelle est prioritaire. Le paiement sera indisponible jusqu’à sa levée ou son expiration.' : paymentFlowActive ? isTrialActive ? 'Vous pouvez payer dès maintenant. Après confirmation, votre formule payante sera active immédiatement ; la durée restante de l’essai est conservée avant la nouvelle échéance.' : 'Vous gardez la main : le paiement est lancé uniquement après votre validation et votre formule est activée après confirmation sécurisée de GeniusPay. La publication de la boutique et sa vérification restent des étapes distinctes.' : 'Votre essai gratuit de 7 jours commence lorsque vous le démarrez.'}</p>
        </aside>

        {mode === 'expired' && <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4"><WhatsAppSubscriptionReminderConsent shop={shop} /></div>}

        <div className={`mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center ${mode === 'plans' ? 'rounded-[1.5rem] bg-[#e9efe8] p-4 sm:mt-4 sm:p-5' : ''}`}>
          {paymentFlowActive ? (
            previewOnly ? (
              <button type="button" disabled className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-300 px-5 py-3 text-sm font-bold text-slate-600">Aperçu · paiement désactivé</button>
            ) : (
              <button type="button" onClick={() => void startSubscriptionPayment()} disabled={isPaymentStarting || !subscriptionPrices || isManualSubscriptionSuspension} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#065f46] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_18px_rgba(15,77,61,0.2)] transition hover:bg-[#047857] disabled:cursor-wait disabled:opacity-60">
                {isPaymentStarting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                {isPaymentStarting ? 'Préparation du paiement…' : paymentPrice === null ? 'Tarifs indisponibles' : `Payer ${new Intl.NumberFormat('fr-FR').format(paymentPrice)} FCFA avec GeniusPay`}
              </button>
            )
          ) : (
            <button type="button" onClick={() => onStart?.('standard')} disabled={isStarting || !onStart} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#065f46] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#047857] disabled:cursor-wait disabled:opacity-60">
              {isStarting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {isStarting ? 'Démarrage de l’essai…' : `Commencer mon essai de ${TRIAL_DURATION_DAYS} jours`}
            </button>
          )}
          {!paymentFlowActive && <button type="button" onClick={() => setPurchaseNow(true)} className="min-h-11 rounded-lg px-3 text-sm font-bold text-[#047857] underline underline-offset-2">Voir les formules et payer maintenant</button>}
          {paymentFlowActive && <span className="text-xs text-slate-600">{selectedPlan.label} · {paymentPrice === null ? 'Tarif indisponible' : `${new Intl.NumberFormat('fr-FR').format(paymentPrice)} FCFA/${term === 'annual' ? 'an' : 'mois'}`}</span>}
          {mode === 'start' && paymentFlowActive && <button type="button" onClick={() => setPurchaseNow(false)} className="min-h-11 rounded-lg px-3 text-sm font-bold text-[#047857] underline underline-offset-2">Commencer plutôt par l’essai gratuit</button>}
        </div>
        {paymentFlowActive && paymentMessage && (
          <div className="mt-3 space-y-2" aria-live="polite">
            <p role="status" className="text-sm text-slate-700">{paymentMessage}</p>
            {paymentFlowActive && needsBillingEmail && (
              <div className="mt-4 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <label htmlFor="merchant-billing-email" className="block text-sm font-bold text-amber-950">E-mail de facturation</label>
                <p className="mt-1 text-xs leading-5 text-amber-900">GeniusPay utilise cet e-mail pour préparer le paiement. MaTable.ci l’utilisera aussi pour vous envoyer le reçu après confirmation.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="merchant-billing-email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={billingEmail}
                    onChange={(event) => setBillingEmail(event.target.value)}
                    placeholder="vous@exemple.ci"
                    className="min-h-11 min-w-0 flex-1 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20"
                  />
                  <button
                    type="button"
                    onClick={() => void startSubscriptionPayment()}
                    disabled={isPaymentStarting || !billingEmail.trim() || isManualSubscriptionSuspension}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#065f46] px-4 py-2 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
                  >
                    {isPaymentStarting && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    Continuer vers le paiement
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
