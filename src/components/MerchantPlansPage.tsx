import { ArrowRight, BadgeCheck, BarChart3, Check, Clock3, MapPin, MessageCircle, Package, Sparkles, Store, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  DEFAULT_SUBSCRIPTION_PRO_FEATURES,
  getSubscriptionPlanBenefits,
  SUBSCRIPTION_PLANS,
  TRIAL_CATALOG_LIMIT,
  TRIAL_DURATION_MONTHS,
  type SubscriptionTerm,
} from '../utils/subscriptionFeatures';
import { useState } from 'react';
import { useSubscriptionPrices } from '../utils/useSubscriptionPrices';

const formatPrice = (price: number) => new Intl.NumberFormat('fr-FR').format(price);

const onboardingSteps = [
  {
    number: '01',
    title: 'Créez votre vitrine',
    description: 'Présentez votre commerce, ajoutez vos coordonnées et choisissez les informations à montrer.',
    icon: Store,
  },
  {
    number: '02',
    title: 'Ajoutez vos produits',
    description: 'Publiez des photos, les prix et les disponibilités pour aider vos clients à choisir.',
    icon: Package,
  },
  {
    number: '03',
    title: 'Échangez directement',
    description: 'Partagez votre lien, répondez aux clients et convenez avec eux du retrait ou de la livraison.',
    icon: MessageCircle,
  },
];

const planPresentation = {
  standard: { shell: 'bg-[#fffdf7]', price: 'text-[#292d2a]', action: 'bg-[#075f48] text-white hover:bg-[#047857]', subtle: 'text-[#625f58]', check: 'text-[#075f48]' },
  premium: { shell: 'bg-[#075f48] text-white', price: 'text-white', action: 'bg-[#f0ba80] text-[#292d2a] hover:bg-[#ffd09a]', subtle: 'text-white/80', check: 'text-[#f0ba80]' },
  pro: { shell: 'bg-[#fffdf7]', price: 'text-[#292d2a]', action: 'bg-[#075f48] text-white hover:bg-[#047857]', subtle: 'text-[#625f58]', check: 'text-[#075f48]' },
} as const;

const planPositioning = {
  standard: 'Pour poser les bases',
  premium: 'Pour gagner en visibilité',
  pro: 'Pour accélérer',
} as const;

const planIcons = {
  standard: Store,
  premium: Sparkles,
  pro: BarChart3,
} as const;

export function MerchantPlansPage() {
  const [term, setTerm] = useState<SubscriptionTerm>('monthly');
  const prefersReducedMotion = useReducedMotion();
  const { prices, proFeatures, error } = useSubscriptionPrices();
  const plans = Object.values(SUBSCRIPTION_PLANS);
  const formatTermPrice = (tier: keyof typeof SUBSCRIPTION_PLANS) => {
    if (!prices) return '—';
    return formatPrice(prices[tier] * (term === 'annual' ? 10 : 1));
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#fcf9f1] text-[#191817]">
      <section className="mx-auto grid max-w-[1440px] items-center gap-10 px-5 pb-12 pt-10 sm:px-8 sm:pb-16 sm:pt-16 lg:min-h-[690px] lg:grid-cols-[.9fr_1.1fr] lg:gap-12 lg:px-12">
        <div className="relative z-10 max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#e3ded3] bg-white px-4 py-2 text-xs font-extrabold text-[#145b47] shadow-sm sm:text-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-[#f0ba80]" />
            Votre commerce, visible partout en Côte d’Ivoire
          </p>
          <h1 className="mt-7 max-w-[720px] font-display text-[clamp(3rem,5vw,5.5rem)] font-black leading-[.96] tracking-[-.065em] text-[#171615]">
            Votre boutique mérite sa place <span className="text-[#087c5b]">en ligne.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#625f58] sm:text-lg sm:leading-8">
            Créez une vitrine claire, montrez vos produits et échangez directement avec les clients. Vous gardez la main sur vos ventes et vos livraisons.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/app/creer-boutique" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#075f48] px-6 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(7,95,72,.18)] transition hover:-translate-y-0.5 hover:bg-[#047857]">
              Créer ma boutique <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to="/app/connexion" className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#d9d2c6] bg-white px-5 text-sm font-bold text-[#292d2a] transition hover:border-[#087c5b]">
              Déjà commerçant·e ?
            </Link>
          </div>
          <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-[#6f6a62] sm:text-sm">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#087c5b]" aria-hidden="true" />
            Essai Standard gratuit de {TRIAL_DURATION_MONTHS} mois, jusqu’à {TRIAL_CATALOG_LIMIT} produits. Aucun paiement requis pour commencer ; vous pouvez aussi choisir et payer une formule directement.
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[650px]">
          <div aria-hidden="true" className="absolute -right-12 -top-14 h-44 w-44 rounded-full border-[24px] border-[#f0ba80]/35 sm:h-64 sm:w-64" />
          <div className="relative overflow-hidden rounded-[28px] border border-[#e3ded3] bg-white shadow-[0_24px_80px_rgba(31,40,33,.12)] sm:rounded-[34px]">
            <div className="flex items-center justify-between border-b border-[#eeeae1] px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e9f5ee] text-[#087c5b]"><Store className="h-5 w-5" aria-hidden="true" /></span>
                <span><strong className="block text-sm">Atelier Awa</strong><span className="text-[10px] text-[#77736a]">Aperçu de vitrine</span></span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf5ec] px-2.5 py-1 text-[10px] font-bold text-[#176b55]"><BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> Exemple</span>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-[150px_1fr] sm:gap-5 sm:p-6">
              <aside className="hidden rounded-2xl bg-[#f4f2ec] p-3 sm:block">
                <p className="mb-3 px-2 text-[9px] font-black uppercase tracking-[.14em] text-[#8c877d]">Ma boutique</p>
                {['Vue générale', 'Produits', 'Commandes', 'Statistiques'].map((item, index) => (
                  <p key={item} className={`mb-1 rounded-lg px-2 py-2 text-[10px] font-bold ${index === 0 ? 'bg-white text-[#075f48] shadow-sm' : 'text-[#706b63]'}`}>{item}</p>
                ))}
              </aside>
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="text-[10px] font-semibold text-[#78736a]">Bonjour Awa</p><h2 className="mt-1 text-lg font-black sm:text-xl">Votre activité, en un coup d’œil</h2></div>
                  <span className="rounded-full bg-[#f7e7bd] px-2.5 py-1 text-[9px] font-black uppercase text-[#6c511f]">Démo</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[['Visites', '1 284'], ['Produits', '24'], ['Messages', '18']].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-[#eeeae1] p-3"><p className="text-[9px] font-semibold text-[#77736a]">{label}</p><p className="mt-1 text-lg font-black text-[#075f48]">{value}</p></div>
                  ))}
                </div>
                <div className="mt-3 rounded-xl border border-[#eeeae1] p-3">
                  <div className="flex items-center justify-between"><p className="text-[10px] font-black">Produits en vitrine</p><span className="text-[9px] font-bold text-[#087c5b]">Voir la boutique ↗</span></div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      { icon: '👜', name: 'Sac artisanal', price: '12 500 F' },
                      { icon: '👔', name: 'Chemise lin', price: '16 000 F' },
                      { icon: '🧴', name: 'Soin karité', price: '4 500 F' },
                    ].map((product) => (
                      <div key={product.name} className="min-w-0 overflow-hidden rounded-lg bg-[#f5f3ed]">
                        <div className="flex aspect-[1.3] items-center justify-center bg-[#eaf2e9] text-3xl" aria-hidden="true">{product.icon}</div>
                        <p className="truncate px-2 pt-2 text-[9px] font-bold">{product.name}</p>
                        <p className="px-2 pb-2 pt-1 text-[9px] font-black text-[#075f48]">{product.price}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <p className="border-t border-[#eeeae1] bg-[#faf9f5] px-4 py-2.5 text-center text-[10px] font-semibold text-[#79746b] sm:px-6">
              Maquette illustrative · aucune donnée de commerçant réel
            </p>
          </div>
          <div className="absolute -bottom-5 -left-3 hidden items-center gap-2 rounded-2xl border border-[#e4ded3] bg-white px-4 py-3 shadow-lg sm:flex">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e7f3e9] text-[#087c5b]"><MessageCircle className="h-4 w-4" aria-hidden="true" /></span>
            <span><strong className="block text-xs">Un client vous écrit</strong><span className="text-[10px] text-[#77736a]">Échange direct sur WhatsApp</span></span>
          </div>
        </div>
      </section>

      <section className="border-y border-[#e9e3d8] bg-white">
        <div className="mx-auto grid max-w-[1280px] gap-4 px-5 py-5 sm:grid-cols-3 sm:px-8 sm:py-7">
          {[
            { icon: MapPin, title: 'Les clients du quartier vous trouvent', text: 'Votre vitrine apparaît dans l’annuaire de votre quartier, pas seulement derrière un lien.' },
            { icon: MessageCircle, title: '0 % de commission', text: 'Les commandes arrivent sur WhatsApp ; MaTable ne prend rien sur vos ventes.' },
            { icon: BadgeCheck, title: 'Badge « Vérifié »', text: 'Votre identité vérifiée rassure les clients qui craignent les arnaques.' },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-center gap-3 sm:justify-center">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf5ed] text-[#087c5b]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <span><strong className="block text-sm">{title}</strong><span className="mt-0.5 block text-xs text-[#726d65]">{text}</span></span>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#17191a] text-white">
        <div className="mx-auto grid max-w-[1280px] gap-9 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[.85fr_1.15fr] lg:gap-16 lg:py-28">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-xs font-black uppercase tracking-[.18em] text-[#f0ba80]">Pour démarrer</p>
            <h2 className="mt-4 max-w-xl font-display text-4xl font-black leading-[1.02] tracking-[-.045em] sm:text-5xl lg:text-6xl">De votre commerce à vos premiers contacts.</h2>
            <p className="mt-5 max-w-lg text-sm leading-6 text-white/65 sm:text-base sm:leading-7">Tout se prépare depuis votre espace. MaTable vous aide à présenter votre activité ; vous restez au centre des échanges avec vos clients.</p>
            <Link to="/app/creer-boutique" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#f0ba80] px-5 text-sm font-extrabold text-[#282117] transition hover:bg-[#ffd09a]">
              Commencer gratuitement <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="space-y-3">
            {onboardingSteps.map(({ number, title, description, icon: Icon }) => (
              <article key={number} className="grid gap-3 rounded-[24px] border border-white/10 bg-white/[.045] p-5 sm:grid-cols-[70px_1fr_48px] sm:items-center sm:gap-5 sm:p-7">
                <span className="font-display text-4xl font-black tracking-tight text-[#f0ba80]">{number}</span>
                <div><h3 className="text-lg font-extrabold sm:text-xl">{title}</h3><p className="mt-2 max-w-xl text-sm leading-6 text-white/65">{description}</p></div>
                <span className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-[#f0ba80] sm:flex"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1280px] items-center gap-8 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2 lg:gap-14 lg:py-24">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-[#c2410c]">À votre rythme</p>
          <h2 className="mt-3 max-w-xl font-display text-4xl font-black leading-tight tracking-[-.04em] sm:text-5xl">Vous gardez la main sur chaque vente.</h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[#625f58] sm:text-base sm:leading-7">MaTable présente votre vitrine et facilite la prise de contact. Le client et le commerçant conviennent directement du paiement, du retrait ou de la livraison.</p>
          <div className="mt-6 space-y-3">
            {[
              'Aucun paiement de commande encaissé par MaTable.ci.',
              'Les modalités sont convenues directement avec votre client.',
              'Votre catalogue reste consultable depuis un lien partageable.',
            ].map((line) => <p key={line} className="flex items-start gap-2.5 text-sm font-semibold text-[#3e4a42]"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#087c5b]" aria-hidden="true" />{line}</p>)}
          </div>
        </div>
        <div className="rounded-[28px] bg-[#e8f1e9] p-4 sm:p-6">
          <div className="rounded-[22px] bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-center justify-between border-b border-[#eeeae1] pb-4">
              <div><p className="text-[10px] font-bold uppercase tracking-wide text-[#9a6a3a]">Une demande reçue</p><p className="mt-1 text-lg font-black">Chemise en lin naturel</p></div>
              <span className="rounded-full bg-[#e8f4e9] px-3 py-1 text-[10px] font-black text-[#176b55]">À confirmer</span>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f4e8d2] text-sm font-black text-[#765323]">AK</span>
              <div><p className="text-sm font-bold">Aïcha K.</p><p className="text-xs text-[#77736a]">Abidjan · demande d’information</p></div>
            </div>
            <div className="mt-5 rounded-xl bg-[#f7f5ef] p-4 text-sm leading-6 text-[#59564f]">« Bonjour, est-ce que la chemise est disponible ? Je suis à Cocody. »</div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-[#706b63]"><Truck className="h-4 w-4 text-[#087c5b]" aria-hidden="true" /> Retrait ou livraison à convenir</p>
              <span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[#075f48] px-4 text-xs font-bold text-white"><MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> Répondre sur WhatsApp</span>
            </div>
            <p className="mt-4 text-center text-[10px] text-[#888278]">Exemple d’interface · demande fictive</p>
          </div>
        </div>
      </section>

      <section className="bg-[#f1ede5] px-5 py-16 sm:px-8 sm:py-20" aria-labelledby="merchant-plans-heading">
        <div className="mx-auto max-w-[1280px]">
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[.16em] text-[#a2642e]">Votre prochaine étape commence ici</p>
              <h2 id="merchant-plans-heading" className="mt-2 font-display text-3xl font-black leading-tight tracking-[-.035em] sm:text-4xl lg:text-5xl">Choisissez comment faire grandir votre boutique.</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[#625f58] sm:text-base">Les mêmes bases pour vendre. Plus d’outils et de visibilité à mesure que votre activité avance.</p>
            </div>
            <div className="inline-flex w-fit items-center gap-1 rounded-full border border-[#d7d0c4] bg-white p-1.5 shadow-[0_8px_24px_rgba(38,35,28,.08)]" role="group" aria-label="Durée de l’abonnement">
              <button type="button" aria-pressed={term === 'monthly'} onClick={() => setTerm('monthly')} className={`min-h-10 rounded-full px-4 text-xs font-bold transition ${term === 'monthly' ? 'bg-[#075f48] text-white' : 'text-[#5c5a53] hover:bg-[#f6f4ef]'}`}>
                Mensuel
              </button>
              <button type="button" aria-pressed={term === 'annual'} onClick={() => setTerm('annual')} className={`min-h-10 rounded-full px-4 text-xs font-bold transition ${term === 'annual' ? 'bg-[#075f48] text-white' : 'text-[#5c5a53] hover:bg-[#f6f4ef]'}`}>
              Annuel <span className={`ml-1 rounded-full px-2 py-1 text-[10px] font-black ${term === 'annual' ? 'bg-[#f0ba80] text-[#292d2a]' : 'bg-[#fff1df] text-[#8b4c1e]'}`}>2 mois offerts</span>
              </button>
            </div>
            </div>
          {term === 'annual' && (
            <motion.p
              initial={prefersReducedMotion ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-[#fff1df] px-4 py-2 text-xs font-bold text-[#73431e]"
            >
              <BadgeCheck className="h-4 w-4 text-[#a2642e]" aria-hidden="true" />
              Deux mois offerts sur chaque formule annuelle
            </motion.p>
          )}

          <div className="mt-10 grid items-stretch gap-5 md:grid-cols-3 md:gap-4 lg:gap-6">
            {plans.map((plan, index) => {
              const featured = plan.tier === 'premium';
              const PlanIcon = planIcons[plan.tier];
              return (
                <motion.article
                    key={plan.tier}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 22 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.18 }}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.45, delay: prefersReducedMotion ? 0 : index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={prefersReducedMotion ? undefined : { y: -6, transition: { duration: 0.2 } }}
                    className={`relative flex flex-col overflow-hidden rounded-[28px] ${featured ? 'z-10 bg-[#075f48] text-white shadow-[0_28px_70px_rgba(7,95,72,.27)] md:-my-3 md:scale-[1.035]' : 'border border-[#e4ddd1] bg-white text-[#292d2a] shadow-[0_14px_38px_rgba(38,35,28,.07)]'}`}
                  >
                    {featured && <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full border-[28px] border-white/[0.07]" />}
                    <div className={`relative flex items-center justify-between gap-3 px-5 py-4 sm:px-7 ${featured ? 'border-b border-white/15 bg-[#064f3d]' : 'border-b border-[#f0ece5] bg-[#faf8f2]'}`}>
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${featured ? 'bg-[#f0ba80] text-[#292d2a]' : 'bg-[#e8f3ed] text-[#075f48]'}`}><PlanIcon className="h-5 w-5" aria-hidden="true" /></span>
                        <div className="min-w-0">
                          <p className={`text-[9px] font-black uppercase tracking-[.15em] ${featured ? 'text-[#f0ba80]' : 'text-[#a2642e]'}`}>{planPositioning[plan.tier]}</p>
                          <h3 className="mt-0.5 text-xl font-black sm:text-2xl">{plan.label}</h3>
                        </div>
                      </div>
                      {featured && <span className="shrink-0 rounded-full bg-[#f0ba80] px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-[#292d2a]">Recommandée</span>}
                    </div>
                    <div className="relative flex flex-1 flex-col p-5 sm:p-7 lg:p-8">
                    <h4 className="text-lg font-extrabold leading-snug">{plan.headline}</h4>
                    <p className={`mt-2 min-h-12 text-sm leading-6 ${planPresentation[plan.tier].subtle}`}>{plan.description}</p>
                    <div className="mt-7 min-h-[88px]">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <strong className={`text-4xl font-black tracking-tight sm:text-5xl ${planPresentation[plan.tier].price}`}>
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                              key={`${plan.tier}-${term}`}
                              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
                              transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
                              className="inline-block"
                            >
                              {formatTermPrice(plan.tier)}
                            </motion.span>
                          </AnimatePresence>
                        </strong>
                        <span className={`text-sm font-bold ${planPresentation[plan.tier].subtle}`}>FCFA / {term === 'annual' ? 'an' : 'mois'}</span>
                      </p>
                      <p className={`mt-2 text-xs font-semibold ${planPresentation[plan.tier].subtle}`}>{term === 'annual'
                        ? `Soit ${prices ? formatPrice(prices[plan.tier]) : '—'} FCFA/mois · facturé à l’année`
                        : 'Paiement mensuel · résiliable'}</p>
                    </div>
                    <Link to="/app/creer-boutique" className={`group relative mt-3 inline-flex min-h-12 items-center justify-between gap-2 rounded-2xl px-5 py-3 text-sm font-extrabold transition hover:shadow-lg focus-visible:outline-offset-4 ${planPresentation[plan.tier].action}`}>
                      <span>Créer ma boutique</span><ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </Link>
                    <p className={`mt-2 text-center text-[10px] font-semibold ${planPresentation[plan.tier].subtle}`}>Essai gratuit · aucun paiement aujourd’hui</p>
                    <h4 className={`mt-7 border-t pt-5 text-xs font-black ${featured ? 'border-white/20 text-white' : 'border-[#e8e3da] text-[#292d2a]'}`}>
                      Ce qui est inclus
                    </h4>
                    <ul className={`mt-4 flex-1 space-y-3 text-xs leading-5 ${featured ? 'text-white/90' : 'text-[#46443e]'}`}>
                      {getSubscriptionPlanBenefits(plan.tier, proFeatures || DEFAULT_SUBSCRIPTION_PRO_FEATURES).map((benefit) => (
                        <li key={benefit} className="flex items-start gap-2.5">
                          <Check className={`mt-0.5 h-4 w-4 shrink-0 ${planPresentation[plan.tier].check}`} aria-hidden="true" />
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          {error && <p role="alert" className="mt-4 text-sm font-semibold text-rose-800">Tarifs indisponibles : {error}</p>}
          <p className="mt-4 text-xs leading-5 text-[#706b63]">
            L’essai gratuit donne accès aux fonctions Standard avec une limite de {TRIAL_CATALOG_LIMIT} produits. Aucun abonnement payant ni paiement n’est activé sans votre choix dans l’espace commerçant.
          </p>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-6 px-5 py-14 sm:px-8 sm:py-20 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-[#c2410c]">Prêt·e à commencer ?</p>
          <h2 className="mt-2 max-w-2xl font-display text-3xl font-black leading-tight tracking-[-.035em] sm:text-4xl">Faites découvrir votre commerce.</h2>
          <p className="mt-3 text-sm text-[#625f58]">Créez votre vitrine aujourd’hui, puis partagez-la à vos clients.</p>
        </div>
        <Link to="/app/creer-boutique" className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[#075f48] px-6 text-sm font-extrabold text-white transition hover:bg-[#047857]">
          Ouvrir ma boutique <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
