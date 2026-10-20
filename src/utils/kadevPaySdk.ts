type KadevPayCheckoutOptions = {
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
};

type KadevPaySdkErrorStage = 'kadevpay' | 'paystack';

export class KadevPaySdkLoadError extends Error {
  constructor(readonly stage: KadevPaySdkErrorStage) {
    super(stage === 'paystack'
      ? 'Impossible de charger le module Paystack utilisé par KadevPay.'
      : 'Impossible de charger le SDK KadevPay.');
    this.name = 'KadevPaySdkLoadError';
  }
}

declare global {
  interface Window {
    KadevPay?: { checkout: (options: KadevPayCheckoutOptions) => void };
    PaystackPop?: { setup: (...args: unknown[]) => unknown };
  }
}

const SDK_LOAD_TIMEOUT_MS = 15_000;
let kadevPayLoad: Promise<void> | null = null;
let paystackLoad: Promise<void> | null = null;

function loadScript(
  url: string,
  attribute: string,
  isReady: () => boolean,
  stage: KadevPaySdkErrorStage,
): Promise<void> {
  if (isReady()) return Promise.resolve();

  let script = document.querySelector<HTMLScriptElement>(`script[${attribute}]`);
  if (script?.dataset.loadState === 'failed') {
    script.remove();
    script = null;
  }
  const isNewScript = !script;
  script ||= document.createElement('script');

  return new Promise((resolve, reject) => {
    let timeoutId: number;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      script?.removeEventListener('load', handleLoad);
      script?.removeEventListener('error', handleError);
    };
    const fail = () => {
      cleanup();
      if (isNewScript || script?.dataset.loadState !== 'loaded') {
        script?.remove();
      }
      if (script) script.dataset.loadState = 'failed';
      reject(new KadevPaySdkLoadError(stage));
    };
    const handleLoad = () => {
      if (!isReady()) {
        fail();
        return;
      }
      cleanup();
      if (script) script.dataset.loadState = 'loaded';
      resolve();
    };
    const handleError = () => fail();

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    timeoutId = window.setTimeout(fail, SDK_LOAD_TIMEOUT_MS);

    if (isNewScript) {
      script.src = url;
      script.async = true;
      script.setAttribute(attribute, 'true');
      document.head.appendChild(script);
    } else if (script.dataset.loadState === 'loaded') {
      handleLoad();
    }
  });
}

function loadKadevPay(): Promise<void> {
  if (!kadevPayLoad) {
    kadevPayLoad = loadScript(
      'https://pay.kadev.ci/js/v1/kadev-pay.js',
      'data-kadevpay-sdk',
      () => Boolean(window.KadevPay),
      'kadevpay',
    ).catch((error: unknown) => {
      kadevPayLoad = null;
      throw error;
    });
  }
  return kadevPayLoad;
}

function loadPaystack(): Promise<void> {
  if (!paystackLoad) {
    paystackLoad = loadScript(
      'https://js.paystack.co/v1/inline.js',
      'data-paystack-sdk',
      () => Boolean(window.PaystackPop),
      'paystack',
    ).catch((error: unknown) => {
      paystackLoad = null;
      throw error;
    });
  }
  return paystackLoad;
}

export async function loadKadevPayCheckout(): Promise<void> {
  await loadKadevPay();
  await loadPaystack();
}

export function getKadevPayLoadMessage(error: unknown): string {
  if (error instanceof KadevPaySdkLoadError && error.stage === 'paystack') {
    return 'Le module Paystack utilisé par KadevPay ne se charge pas. Aucun paiement n’a été lancé. Vérifiez votre connexion ou le bloqueur de contenu, puis réessayez.';
  }
  return 'Le SDK KadevPay ne se charge pas. Aucun paiement n’a été lancé. Vérifiez votre connexion puis réessayez.';
}
