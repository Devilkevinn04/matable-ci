import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, MessageCircle, ShieldCheck } from 'lucide-react';
import type { Shop, SubscriptionTier } from '../../types';
import { getSupportWhatsAppUrl } from '../../utils/supportWhatsApp';
import { SUBSCRIPTION_PLANS } from '../../utils/subscriptionFeatures';

interface KadevPayCheckoutOptions {
  public_key: string;
  amount: number;
  currency: 'XOF';
  email: string;
  name: string;
  phone: string;
  method: 'momo';
  metadata: { subscription_payment_id: string };
  onSuccess: (result: unknown) => void;
  onClose: () => void;
}

declare global {
  interface Window {
    KadevPay?: { checkout: (options: KadevPayCheckoutOptions) => void };
  }
}

interface MerchantTrialOnboardingProps {
  shop: Shop;
  isStarting: boolean;
  onStart: (tier: SubscriptionTier) => void;
  mode?: 'start' | 'expired';
}

const plans = Object.values(SUBSCRIPTION_PLANS);

export function MerchantTrialOnboarding({ shop, isStarting, onStart, mode = 'start' }: MerchantTrialOnboardingProps) {
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>('standard');
  const [isKadevPayReady, setIsKadevPayReady] = useState(false);
  const [isPaymentStarting, setIsPaymentStarting] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState('');
  const didReceivePaymentSuccess = useRef(false);
  const selectedPlan = plans.find((plan) => plan.tier === selectedTier) || plans[0];
  const supportUrl = getSupportWhatsAppUrl(`Bonjour, j’ai besoin d’aide pour l’espace commerçant de ${shop.name}.`);

  useEffect(() => {
    if (mode !== 'expired') return;
    if (window.KadevPay) {
      setIsKadevPayReady(true);
      return;
    }
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-kadevpay-sdk]');
    const script = existingScript || document.createElement('script');
    const onLoad = () => setIsKadevPayReady(Boolean(window.KadevPay));
    const onError = () => setPaymentMessage('Impossible de charger KadevPay. Réessayez dans un instant.');
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    if (!existingScript) {
      script.src = 'https://pay.kadev.ci/js/v1/kadev-pay.js';
      script.async = true;
      script.dataset.kadevpaySdk = 'true';
      document.head.appendChild(script);
    }
    return () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
  }, [mode]);

  const verifyPayment = async (paymentId: string) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      try {
        const response = await fetch(`/api/shops/${shop.id}/subscription-payments/${paymentId}`, { credentials: 'include' });
        if (!response.ok) continue;
        const data = await response.json();
        if (data.status === 'paid') {
          setPaymentMessage('Paiement confirmé. Actualisation de votre espace…');
          window.location.reload();
          return;
        }
      } catch {
        // Keep checking until the webhook has had time to arrive.
      }
    }
    setPaymentMessage('Paiement en attente de confirmation. Vous pourrez actualiser cette page dans quelques instants.');
    setIsPaymentStarting(false);
  };

  const startSubscriptionPayment = async () => {
    setPaymentMessage('');
    setIsPaymentStarting(true);
    didReceivePaymentSuccess.current = false;
    try {
      const response = await fetch(`/api/shops/${shop.id}/subscription-payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tier: selectedTier }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de préparer le paiement KadevPay.');
      if (!window.KadevPay) throw new Error('Le module KadevPay n’est pas encore prêt. Réessayez.');
      if (data.is_test) setPaymentMessage('Mode test actif : aucun paiement réel ne sera débité.');
      window.KadevPay.checkout({
        public_key: data.public_key,
        amount: data.amount,
        currency: 'XOF',
        email: data.email,
        name: data.name,
        phone: data.phone,
        method: 'momo',
        metadata: { subscription_payment_id: data.payment_id },
        onSuccess: () => {
          didReceivePaymentSuccess.current = true;
          setPaymentMessage('Paiement reçu. Vérification sécurisée en cours…');
          void verifyPayment(data.payment_id);
        },
        onClose: () => {
          if (!didReceivePaymentSuccess.current) setIsPaymentStarting(false);
        },
      });
    } catch (error) {
      setPaymentMessage(error instanceof Error ? error.message : 'Impossible de démarrer le paiement.');
      setIsPaymentStarting(false);
    }
  };

  return (
    <main className="merchant-pre-dashboard min-h-screen bg-[#f4f6f1] px-4 py-8 text-slate-900 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <header className="border-b border-[#dce4dc] pb-6">
          <p className="text-xs font-extrabold uppercase text-[#176b55]">MaTable.ci · Espace commerçant</p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">{mode === 'expired' ? 'Votre période d’essai est terminée' : `Bienvenue, ${shop.name}`}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{mode === 'expired' ? 'Choisissez une formule mensuelle et réglez-la avec KadevPay. Votre accès sera renouvelé après confirmation sécurisée du paiement.' : 'Votre essai gratuit de 30 jours commence lorsque vous le démarrez. Configurez votre boutique et testez les fonctionnalités sans paiement aujourd’hui.'}</p>
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
                  className={`flex min-h-56 flex-col items-start rounded-xl border p-4 text-left transition ${selected ? 'border-[#176b55] bg-white ring-2 ring-[#176b55]/20' : 'border-[#d5ddd5] bg-white/70 hover:border-[#176b55]'}`}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className="font-extrabold">{plan.label}</span>
                    {selected && <Check className="h-4 w-4 text-emerald-700" />}
                  </span>
                  <h3 className="mt-3 text-sm font-extrabold text-slate-900">{plan.headline}</h3>
                  <strong className="mt-2 text-xl">{new Intl.NumberFormat('fr-FR').format(plan.price)} <span className="text-sm font-semibold">FCFA/mois</span></strong>
                  <span className="mt-2 text-xs leading-5 text-slate-600">{plan.description}</span>
                  <ul className="mt-3 space-y-1.5 text-left text-xs leading-5 text-slate-700">
                    {plan.benefits.map((benefit) => <li key={benefit} className="flex items-start gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" /><span>{benefit}</span></li>)}
                  </ul>
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
            <button type="button" onClick={() => void startSubscriptionPayment()} disabled={!isKadevPayReady || isPaymentStarting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0f4d3d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#176b55] disabled:cursor-wait disabled:opacity-60">
              {isPaymentStarting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {isPaymentStarting ? 'Vérification du paiement…' : isKadevPayReady ? 'Renouveler avec KadevPay' : 'Chargement de KadevPay…'}
            </button>
          ) : (
            <button type="button" onClick={() => onStart(selectedTier)} disabled={isStarting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0f4d3d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#176b55] disabled:cursor-wait disabled:opacity-60">
              {isStarting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {isStarting ? 'Démarrage de l’essai…' : 'Commencer mon essai gratuit'}
            </button>
          )}
          <span className="text-xs text-slate-500">{selectedPlan.label} · {new Intl.NumberFormat('fr-FR').format(selectedPlan.price)} FCFA/mois après l’essai</span>
        </div>
        {mode === 'expired' && paymentMessage && <p role="status" aria-live="polite" className="mt-3 text-sm text-slate-700">{paymentMessage}</p>}
      </div>
    </main>
  );
}
