import { useEffect, useState } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import type { Shop } from '../../types';
import {
  BOOST_DURATIONS_DAYS,
  BOOST_MINIMUM_PRODUCT_COUNT,
  BOOST_PRICES,
  getBoostPrice,
} from '../../utils/boostPricing';
import { isSubscriptionFeatureIncluded } from '../../utils/subscriptionFeatures';

interface MerchantBoostPurchaseProps {
  shop: Shop;
  productCount: number;
}

interface MerchantBoost {
  id: string;
  starts_at: string;
  ends_at: string;
  status: 'scheduled' | 'active';
  amount: number;
}

export function MerchantBoostPurchase({ shop, productCount }: MerchantBoostPurchaseProps) {
  const [duration, setDuration] = useState<(typeof BOOST_DURATIONS_DAYS)[number]>(7);
  const [boosts, setBoosts] = useState<MerchantBoost[]>([]);
  const [isKadevPayReady, setIsKadevPayReady] = useState(false);
  const [isPaymentStarting, setIsPaymentStarting] = useState(false);
  const [message, setMessage] = useState('');
  const eligible = shop.is_active
    && shop.is_open
    && shop.city?.trim()
    && shop.merchant_verification_status === 'verified'
    && productCount >= BOOST_MINIMUM_PRODUCT_COUNT;
  const isPro = shop.subscription?.isActive === true
    && isSubscriptionFeatureIncluded(shop.subscription.plan, 'boost_discount');
  const amount = getBoostPrice(duration, isPro) ?? BOOST_PRICES[duration];

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/shops/${shop.id}/boosts`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Impossible de charger les boosts de cette boutique.');
        const data = await response.json();
        if (!cancelled) setBoosts(data.boosts);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : 'Impossible de charger les boosts de cette boutique.');
      });
    return () => { cancelled = true; };
  }, [shop.id]);

  useEffect(() => {
    if (!eligible) return;
    if (window.KadevPay) {
      setIsKadevPayReady(true);
      return;
    }
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-kadevpay-sdk]');
    const script = existingScript || document.createElement('script');
    let cancelled = false;
    const onLoad = () => {
      if (!cancelled) setIsKadevPayReady(Boolean(window.KadevPay));
    };
    const onError = () => {
      if (!cancelled) setMessage('Impossible de charger KadevPay. Réessayez dans un instant.');
    };
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    if (!existingScript) {
      script.src = 'https://pay.kadev.ci/js/v1/kadev-pay.js';
      script.async = true;
      script.dataset.kadevpaySdk = 'true';
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
  }, [eligible]);

  const verifyPayment = async (paymentId: string) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      try {
        const response = await fetch(`/api/shops/${shop.id}/subscription-payments/${paymentId}`, { credentials: 'include' });
        if (!response.ok) continue;
        const data = await response.json();
        if (data.status === 'paid') {
          const startsAt = data.boost?.starts_at ? new Date(data.boost.starts_at) : null;
          setMessage(startsAt && startsAt.getTime() > Date.now()
            ? `Boost payé et réservé. Il commencera le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(startsAt)}.`
            : 'Boost payé et activé. Il apparaîtra comme sponsorisé dans l’annuaire.');
          const boostsResponse = await fetch(`/api/shops/${shop.id}/boosts`, { credentials: 'include' });
          if (boostsResponse.ok) {
            const boostData = await boostsResponse.json();
            setBoosts(boostData.boosts);
          }
          setIsPaymentStarting(false);
          return;
        }
        if (data.status === 'failed') {
          setMessage('Le paiement a échoué. Aucun boost n’a été activé.');
          setIsPaymentStarting(false);
          return;
        }
      } catch {
        // Keep checking while the signed provider webhook is being processed.
      }
    }
    setMessage('Le paiement attend la confirmation KadevPay. Actualisez cette page dans quelques instants.');
    setIsPaymentStarting(false);
  };

  const startPayment = async () => {
    setMessage('');
    setIsPaymentStarting(true);
    try {
      const response = await fetch(`/api/shops/${shop.id}/boost-payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ duration_days: duration }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de préparer le paiement du boost.');
      if (!window.KadevPay) throw new Error('Le module KadevPay n’est pas encore prêt. Réessayez.');
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
          setMessage('Paiement reçu. Vérification sécurisée en cours…');
          void verifyPayment(data.payment_id);
        },
        onClose: () => {
          setIsPaymentStarting(false);
        },
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Impossible de démarrer le paiement.');
      setIsPaymentStarting(false);
    }
  };

  return (
    <section className="mt-5 border-t border-slate-200 pt-4" aria-labelledby="boost-purchase-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 id="boost-purchase-title" className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><Sparkles className="h-4 w-4 text-amber-600" />Boost sponsorisé</h4>
          <p className="mt-1 max-w-xl text-xs leading-5 text-slate-600">Votre boutique est mise en avant dans l’annuaire pour 7, 15 ou 30 jours. Si les créneaux de votre ville et catégorie sont complets, le boost payé est réservé au prochain créneau disponible.</p>
        </div>
        {isPro && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-900">−15 % Pro</span>}
      </div>
      {eligible ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Durée du boost">
            {BOOST_DURATIONS_DAYS.map((days) => {
              const price = getBoostPrice(days, isPro) ?? BOOST_PRICES[days];
              return (
                <button key={days} type="button" aria-pressed={duration === days} onClick={() => setDuration(days)} className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-bold ${duration === days ? 'border-emerald-800 bg-emerald-50 text-emerald-950' : 'border-slate-300 bg-white text-slate-700'}`}>
                  {days} jours · {new Intl.NumberFormat('fr-FR').format(price)} F
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void startPayment()} disabled={!isKadevPayReady || isPaymentStarting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0f4d3d] px-4 py-2 text-xs font-bold text-white hover:bg-[#176b55] disabled:cursor-wait disabled:opacity-60">
              {isPaymentStarting && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {isPaymentStarting ? 'Vérification du paiement…' : isKadevPayReady ? `Payer ${new Intl.NumberFormat('fr-FR').format(amount)} FCFA` : 'Chargement de KadevPay…'}
            </button>
            <span className="text-xs text-slate-500">Activation après confirmation du paiement sécurisé.</span>
          </div>
        </>
      ) : (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-950">Pour acheter un boost, la boutique doit être vérifiée, ouverte, renseignée dans une ville et présenter au moins {BOOST_MINIMUM_PRODUCT_COUNT} produits.</p>
      )}
      {boosts.length > 0 && <ul className="mt-4 space-y-2" aria-label="Boosts réservés ou actifs">
        {boosts.map((boost) => {
          const startsAt = new Date(boost.starts_at);
          const endsAt = new Date(boost.ends_at);
          const active = startsAt.getTime() <= Date.now() && endsAt.getTime() > Date.now();
          return <li key={boost.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <span className="font-bold">{active ? 'Boost actif' : 'Boost réservé'} · {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(startsAt)} – {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(endsAt)}</span>
            <span>{new Intl.NumberFormat('fr-FR').format(boost.amount)} FCFA</span>
          </li>;
        })}
      </ul>}
      {message && <p role="status" aria-live="polite" className="mt-3 text-sm text-slate-700">{message}</p>}
    </section>
  );
}
