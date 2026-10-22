import { useState } from 'react';
import { ArrowRight, Check, Clock3, MessageCircle, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  DEFAULT_SUBSCRIPTION_PRO_FEATURES,
  getSubscriptionPlanBenefits,
  SUBSCRIPTION_PLANS,
  TRIAL_CATALOG_LIMIT,
  TRIAL_DURATION_DAYS,
  type SubscriptionTerm,
} from '../utils/subscriptionFeatures';
import { useSubscriptionPrices } from '../utils/useSubscriptionPrices';

const formatPrice = (price: number) => new Intl.NumberFormat('fr-FR').format(price);

export function MerchantPlansPage() {
  const [term, setTerm] = useState<SubscriptionTerm>('monthly');
  const { prices, proFeatures, error } = useSubscriptionPrices();
  const plans = Object.values(SUBSCRIPTION_PLANS);
  const formatTermPrice = (tier: keyof typeof SUBSCRIPTION_PLANS) => {
    if (!prices) return '—';
    return formatPrice(prices[tier] * (term === 'annual' ? 10 : 1));
  };

  return (
    <main className="min-h-screen bg-[#f4f6f1] px-4 py-8 text-slate-900 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <section className="relative isolate overflow-hidden rounded-[2rem] bg-[#103f34] px-6 py-8 text-white sm:px-10 sm:py-12 lg:px-14 lg:py-14">
          <div aria-hidden="true" className="absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full border-[38px] border-white/[0.06]" />
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#f1d59f]">
            <Store className="h-4 w-4" aria-hidden="true" /> Espace commerçant MaTable.ci
          </p>
          <h1 className="mt-5 max-w-3xl text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Votre boutique mérite une vitrine à sa hauteur.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/80 sm:text-base">
            Présentez vos produits, soyez découvert dans l’annuaire et échangez directement avec vos clients sur WhatsApp.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/app/creer-boutique" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#f1ca7a] px-5 py-3 text-sm font-black text-[#3f301b] transition hover:bg-[#f5d99e]">
              Créer ma boutique <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to="/app/connexion" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/25 bg-white/[0.08] px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15">
              Déjà commerçant·e ? Se connecter
            </Link>
          </div>
          <p className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-white/75">
            <Clock3 className="h-4 w-4 text-[#f1ca7a]" aria-hidden="true" />
            Essai Standard gratuit de {TRIAL_DURATION_DAYS} jours, jusqu’à {TRIAL_CATALOG_LIMIT} produits, sans paiement pour démarrer.
          </p>
        </section>

        <section className="mt-10 sm:mt-14" aria-labelledby="merchant-plans-heading">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#a2642e]">Des tarifs clairs</p>
              <h2 id="merchant-plans-heading" className="mt-2 text-2xl font-black tracking-tight text-[#183b31] sm:text-3xl">
                Trois formules pour faire grandir votre activité
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Comparez les options. Vous pourrez choisir ou modifier votre formule depuis votre espace commerçant.
              </p>
            </div>
            <div className="inline-flex w-fit rounded-xl border border-[#d9e3d9] bg-white p-1" role="group" aria-label="Durée de l’abonnement">
              <button type="button" aria-pressed={term === 'monthly'} onClick={() => setTerm('monthly')} className={`min-h-10 rounded-lg px-3 text-xs font-bold transition ${term === 'monthly' ? 'bg-[#174f40] text-white' : 'text-slate-600 hover:bg-[#eef3ed]'}`}>
                Mensuel
              </button>
              <button type="button" aria-pressed={term === 'annual'} onClick={() => setTerm('annual')} className={`min-h-10 rounded-lg px-3 text-xs font-bold transition ${term === 'annual' ? 'bg-[#174f40] text-white' : 'text-slate-600 hover:bg-[#eef3ed]'}`}>
                Annuel · 2 mois offerts
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <article key={plan.tier} className={`flex flex-col rounded-[1.5rem] border bg-white p-5 shadow-sm sm:p-6 ${plan.tier === 'premium' ? 'border-[#176b55] ring-2 ring-[#176b55]/10' : 'border-[#e0e4db]'}`}>
                {plan.tier === 'premium' && <p className="mb-3 w-fit rounded-full bg-[#f7e8c5] px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#654a2e]">Le meilleur équilibre</p>}
                <p className="text-sm font-black uppercase tracking-wide text-[#176b55]">{plan.label}</p>
                <h3 className="mt-3 text-xl font-black text-[#202d28]">{plan.headline}</h3>
                <p className="mt-2 min-h-10 text-sm leading-5 text-slate-600">{plan.description}</p>
                <p className="mt-5 border-b border-[#e8ebe5] pb-4">
                  <strong className="text-3xl font-black tracking-tight text-[#183b31]">{formatTermPrice(plan.tier)}</strong>
                  <span className="ml-1 text-sm font-bold text-slate-600">FCFA/{term === 'annual' ? 'an' : 'mois'}</span>
                  {term === 'annual' && <span className="mt-1 block text-xs text-slate-500">{prices ? formatPrice(prices[plan.tier]) : '—'} FCFA/mois · 2 mois offerts</span>}
                </p>
                <ul className="mt-5 flex-1 space-y-3 text-xs leading-5 text-slate-700">
                  {getSubscriptionPlanBenefits(plan.tier, proFeatures || DEFAULT_SUBSCRIPTION_PRO_FEATURES).map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#176b55]" aria-hidden="true" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/app/creer-boutique" className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#174f40] px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[#0f4d3d]">
                  Créer ma boutique <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
          {error && <p role="alert" className="mt-4 text-sm font-semibold text-rose-800">Tarifs indisponibles : {error}</p>}
          <p className="mt-4 text-xs leading-5 text-slate-500">
            L’essai gratuit donne accès aux fonctions Standard avec une limite de {TRIAL_CATALOG_LIMIT} produits. Aucun abonnement payant ni paiement n’est activé sans votre choix dans l’espace commerçant.
          </p>
        </section>

        <section className="mt-8 flex flex-col gap-3 rounded-2xl border border-[#dbe8dc] bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="text-base font-black text-[#183b31]">Vous gérez déjà une boutique ?</h2>
            <p className="mt-1 text-sm text-slate-600">Retrouvez vos commandes, votre catalogue et vos réglages dans votre espace.</p>
          </div>
          <Link to="/app/connexion" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#cbd9d0] px-4 py-3 text-sm font-bold text-[#174f40] hover:bg-[#f1f6f1]">
            <MessageCircle className="h-4 w-4" aria-hidden="true" /> Accéder à mon espace
          </Link>
        </section>
      </div>
    </main>
  );
}
