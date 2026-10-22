import { useEffect, useState } from 'react';
import {
  parseSubscriptionProFeatures,
  type SubscriptionProFeatures,
  type SubscriptionTier,
} from './subscriptionFeatures';

export type SubscriptionPrices = Record<SubscriptionTier, number>;

export function useSubscriptionPrices() {
  const [prices, setPrices] = useState<SubscriptionPrices | null>(null);
  const [proFeatures, setProFeatures] = useState<SubscriptionProFeatures | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void fetch('/api/subscription-plans', { cache: 'no-store' })
      .then(async (response) => {
        const data: unknown = await response.json();
        if (!response.ok) {
          throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Impossible de charger les tarifs.');
        }
        if (!data || typeof data !== 'object' || !('prices' in data)) {
          throw new Error('La réponse des tarifs est invalide.');
        }
        if (!('pro_features' in data)) throw new Error('La réponse des avantages Pro est invalide.');
        const candidate: Record<string, unknown> = data.prices && typeof data.prices === 'object'
          ? Object.fromEntries(Object.entries(data.prices))
          : {};
        const standard = candidate.standard;
        const premium = candidate.premium;
        const pro = candidate.pro;
        const validPrice = (value: unknown): value is number =>
          typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 1_000_000;
        if (!validPrice(standard) || !validPrice(premium) || !validPrice(pro)) {
          throw new Error('La configuration des tarifs reçue est invalide.');
        }
        const parsedFeatures = parseSubscriptionProFeatures(data.pro_features);
        if (active) {
          setPrices({ standard, premium, pro });
          setProFeatures(parsedFeatures);
        }
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Impossible de charger les tarifs.');
      });
    return () => {
      active = false;
    };
  }, []);

  return { prices, proFeatures, error };
}
