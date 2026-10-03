import { useState } from 'react';
import { Check, LoaderCircle, MessageCircle, ShieldCheck } from 'lucide-react';
import type { Shop, SubscriptionTier } from '../../types';
import { getSupportWhatsAppUrl } from '../../utils/supportWhatsApp';

interface MerchantTrialOnboardingProps {
  shop: Shop;
  isStarting: boolean;
  onStart: (tier: SubscriptionTier) => void;
  mode?: 'start' | 'expired';
}

const plans: { tier: SubscriptionTier; price: number; description: string }[] = [
  { tier: 'standard', price: 3000, description: 'Formule Standard pour votre boutique.' },
  { tier: 'premium', price: 4000, description: 'Formule Premium ; avantages détaillés avant son activation.' },
  { tier: 'pro', price: 5000, description: 'Formule Pro ; avantages détaillés avant son activation.' },
];

export function MerchantTrialOnboarding({ shop, isStarting, onStart, mode = 'start' }: MerchantTrialOnboardingProps) {
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>('standard');
  const selectedPlan = plans.find((plan) => plan.tier === selectedTier) || plans[0];
  const supportUrl = getSupportWhatsAppUrl(`Bonjour, j’ai besoin d’aide pour l’espace commerçant de ${shop.name}.`);
  const renewalUrl = getSupportWhatsAppUrl(`Bonjour, je souhaite renouveler la boutique ${shop.name} avec la formule ${selectedPlan.tier} à ${selectedPlan.price} FCFA/mois.`);

  return (
    <main className="merchant-pre-dashboard min-h-screen bg-[#f4f6f1] px-4 py-8 text-slate-900 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-[#dce4dc] pb-6">
          <p className="text-xs font-extrabold uppercase text-[#176b55]">MaTable.ci · Espace commerçant</p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">{mode === 'expired' ? 'Votre période d’essai est terminée' : `Bienvenue, ${shop.name}`}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{mode === 'expired' ? 'Choisissez la formule à conserver. Le paiement en ligne n’est pas encore activé ; contactez l’équipe pour convenir de la suite.' : 'Votre essai gratuit de 30 jours commence lorsque vous le démarrez. Configurez votre boutique et testez les fonctionnalités sans paiement aujourd’hui.'}</p>
          {supportUrl && <a href={supportUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-emerald-800 underline underline-offset-2"><MessageCircle className="h-4 w-4" />Contacter l’équipe</a>}
        </header>

        <section className="mt-7" aria-labelledby="plan-heading">
          <div className="flex items-center gap-2">
            <h2 id="plan-heading" className="text-lg font-extrabold">Choisissez la formule à essayer</h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-900">{mode === 'expired' ? 'Formules mensuelles' : '30 jours gratuits'}</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Formule après la période d’essai">
            {plans.map((plan) => {
              const selected = selectedTier === plan.tier;
              return (
                <button
                  key={plan.tier}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelectedTier(plan.tier)}
                  className={`flex min-h-40 flex-col items-start rounded-xl border p-4 text-left transition ${selected ? 'border-[#176b55] bg-white ring-2 ring-[#176b55]/20' : 'border-[#d5ddd5] bg-white/70 hover:border-[#176b55]'}`}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="font-extrabold capitalize">{plan.tier}</span>
                    {selected && <Check className="h-4 w-4 text-emerald-700" />}
                  </span>
                  <strong className="mt-3 text-xl">{new Intl.NumberFormat('fr-FR').format(plan.price)} <span className="text-sm font-semibold">FCFA/mois</span></strong>
                  <span className="mt-2 text-xs leading-5 text-slate-600">{plan.description}</span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="mt-5 flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-800" />
          <p>La formule choisie est enregistrée pour la suite. Aucun débit ni paiement n’est effectué pendant cette étape.</p>
        </aside>

        <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          {mode === 'expired' ? (
            renewalUrl ? <a href={renewalUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#0f4d3d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#176b55]">Contacter l’équipe pour renouveler</a> : <p className="text-sm text-slate-600">Le contact WhatsApp de l’assistance n’est pas configuré.</p>
          ) : (
            <button type="button" onClick={() => onStart(selectedTier)} disabled={isStarting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0f4d3d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#176b55] disabled:cursor-wait disabled:opacity-60">
              {isStarting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {isStarting ? 'Démarrage de l’essai…' : 'Commencer mon essai gratuit'}
            </button>
          )}
          <span className="text-xs text-slate-500">{selectedPlan.tier} · {new Intl.NumberFormat('fr-FR').format(selectedPlan.price)} FCFA/mois après l’essai</span>
        </div>
      </div>
    </main>
  );
}
