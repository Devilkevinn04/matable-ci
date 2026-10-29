import { useEffect, useState, type FormEvent } from 'react';
import { Bike, Camera, CheckCircle2, CreditCard, MapPin, Navigation, PackageCheck, Printer, UserRound } from 'lucide-react';
import { DeliveryTimeline, type DeliveryTimelineEvent } from './DeliveryTimeline';
import { DeliveryStatusBadge, DELIVERY_STATUS_LABELS } from './deliveryStatus';
import { PushOptIn } from './PushOptIn';
import { useVisibilityPolling } from '../hooks/useVisibilityPolling';
import { trackLogin, trackLogout, trackSignup } from '../utils/analyticsTracker';

interface DriverProfile {
  id: number;
  name: string;
  phone: string;
  status: 'pending' | 'active' | 'suspended';
  identity_status: 'pending' | 'submitted' | 'under_review' | 'verified' | 'rejected' | string;
}

interface DriverZone {
  id: number;
  label: string;
  is_active: boolean;
}

interface DeliveryCourse {
  id: number;
  order_id: number;
  shop_id: number;
  pickup_zone_id: number;
  destination_zone_id: number;
  pickup_zone?: string;
  destination_zone?: string;
  quoted_amount: number;
  status: 'requested' | 'accepted' | 'to_pickup' | 'picked_up' | 'delivered' | 'cancelled';
  ticket_number?: string;
  proof_available?: boolean;
  created_at?: string;
  shop_name?: string;
  pickup_address?: string;
  delivery_location?: string;
}

interface RevealedContact {
  role: 'merchant' | 'customer';
  phone: string;
}

interface DeliveryPaymentState {
  payment_id: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded';
  access_active: boolean;
  access_expires_at: string | null;
}

const MONEY_FORMATTER = new Intl.NumberFormat('fr-FR');
const money = (amount: number) => `${MONEY_FORMATTER.format(amount)} FCFA`;

const TICKET_DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const formatTicketDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : TICKET_DATE_FORMATTER.format(date);
};

const isDevEnvironment = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true;

async function readJson<T>(response: Response): Promise<T & { error?: string }> {
  const payload = await response.json().catch(() => ({}));
  return payload as T & { error?: string };
}

async function prepareProofPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error('Choisissez une photo JPEG, PNG ou WebP.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    let quality = 0.82;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Votre navigateur ne permet pas de préparer cette photo.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4) <= 290_000) return dataUrl;
      quality = Math.max(0.4, quality - 0.08);
      scale *= 0.85;
    }
  } finally {
    bitmap.close();
  }
  throw new Error('La photo reste trop lourde. Reprenez une photo plus légère.');
}

export function DeliveryCourierWorkspace() {
  const [driver, setDriver] = useState<DriverProfile | null>(null);
  const [zones, setZones] = useState<DriverZone[]>([]);
  const [selectedZoneIds, setSelectedZoneIds] = useState<number[]>([]);
  const [offers, setOffers] = useState<DeliveryCourse[]>([]);
  const [activeDelivery, setActiveDelivery] = useState<DeliveryCourse | null>(null);
  const [revealedContacts, setRevealedContacts] = useState<RevealedContact[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identityConsent, setIdentityConsent] = useState(false);
  const [diditAvailable, setDiditAvailable] = useState(false);
  const [identityProviderStatus, setIdentityProviderStatus] = useState<string | null>(null);
  const [accessActive, setAccessActive] = useState(false);
  const [accessExpiresAt, setAccessExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [serviceAvailable, setServiceAvailable] = useState(false);
  const [sandboxPaymentsEnabled, setSandboxPaymentsEnabled] = useState(false);
  const [providerPaymentsAvailable, setProviderPaymentsAvailable] = useState(false);
  const [proofRequired, setProofRequired] = useState(true);
  const [paymentId, setPaymentId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('payment_id');
  });
  const [paymentChecked, setPaymentChecked] = useState(false);
  const [paymentState, setPaymentState] = useState<DeliveryPaymentState | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofSha, setProofSha] = useState<string | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<DeliveryTimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const loadSession = async () => {
    setError('');
    try {
      const [sessionResponse, zonesResponse] = await Promise.all([
        fetch('/api/delivery/drivers/session', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/delivery/zones', { credentials: 'include', cache: 'no-store' }),
      ]);
      const [sessionData, zoneData] = await Promise.all([
        readJson<{
          driver?: DriverProfile;
          access_active?: boolean;
          access_expires_at?: string | null;
          zones?: DriverZone[];
          identity_provider_status?: string | null;
          didit_available?: boolean;
          sandbox_payments_enabled?: boolean;
          provider_payments_available?: boolean;
          proof_required?: boolean;
        }>(sessionResponse),
        readJson<{ zones?: DriverZone[] }>(zonesResponse),
      ]);
      if (zonesResponse.ok) setZones(zoneData.zones || []);
      if (!sessionResponse.ok) {
        setDriver(null);
        if (sessionResponse.status === 401 && zonesResponse.ok) setServiceAvailable(true);
        else if (sessionResponse.status !== 401) throw new Error(sessionData.error || 'Impossible de charger le compte livreur.');
        return;
      }
      setServiceAvailable(true);
      setDriver(sessionData.driver || null);
      setZones(sessionData.zones || []);
      setIdentityProviderStatus(sessionData.identity_provider_status || null);
      setDiditAvailable(Boolean(sessionData.didit_available));
      setSelectedZoneIds((sessionData.zones || []).filter((zone) => zone.is_active).map((zone) => zone.id));
      setAccessActive(Boolean(sessionData.access_active));
      setAccessExpiresAt(sessionData.access_expires_at || null);
      setSandboxPaymentsEnabled(Boolean(sessionData.sandbox_payments_enabled));
      setProviderPaymentsAvailable(Boolean(sessionData.provider_payments_available));
      setProofRequired(sessionData.proof_required !== false);
      if (sessionData.driver?.status === 'active' && sessionData.access_active) await refreshCourses();
      else {
        setOffers([]);
        setActiveDelivery(null);
      }
    } catch (loadError) {
      setServiceAvailable(false);
      setError(loadError instanceof Error ? loadError.message : 'Le service livraison local est indisponible.');
    } finally {
      setLoading(false);
    }
  };

  const refreshCourses = async (preserveDetails = false) => {
    const response = await fetch('/api/delivery/courses', { credentials: 'include', cache: 'no-store' });
    const data = await readJson<{ offers?: DeliveryCourse[]; active_delivery?: DeliveryCourse | null }>(response);
    if (!response.ok) throw new Error(data.error || 'Impossible de charger les courses.');
    setOffers(data.offers || []);
    setActiveDelivery(data.active_delivery || null);
    if (!preserveDetails) setRevealedContacts([]);
    if (data.active_delivery?.proof_available) {
      if (!preserveDetails || !proofPreview) void loadProofPreview(data.active_delivery.id);
    } else {
      setProofPreview(null);
      setProofSha(null);
    }
  };

  const loadProofPreview = async (courseId: number) => {
    try {
      const response = await fetch(`/api/delivery/courses/${courseId}/proof`, { credentials: 'include', cache: 'no-store' });
      const data = await readJson<{ proof?: { data_url: string; sha256: string } }>(response);
      if (!response.ok || !data.proof) return;
      setProofPreview(data.proof.data_url);
      setProofSha(data.proof.sha256);
    } catch {
      // The proof is optional for display; the delivery flow remains usable.
    }
  };

  const checkPaymentStatus = async (id: string, retry = false) => {
    setPaymentState((current) => current || { payment_id: id, status: 'pending', access_active: false, access_expires_at: null });
    for (let attempt = 0; attempt < (retry ? 3 : 1); attempt += 1) {
      try {
        const response = await fetch(`/api/delivery/drivers/subscription/payment/${encodeURIComponent(id)}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await readJson<DeliveryPaymentState>(response);
        if (!response.ok) throw new Error(data.error || 'Impossible de vérifier le paiement.');
        setPaymentState(data);
        if (data.status === 'paid') {
          setAccessActive(true);
          setAccessExpiresAt(data.access_expires_at);
          setNotice('Paiement Mobile Money confirmé. Votre forfait livreur est actif pendant 24 heures.');
          await loadSession();
          return;
        }
        if (!['pending'].includes(data.status)) {
          setNotice(`Paiement ${data.status === 'cancelled' ? 'annulé' : data.status === 'expired' ? 'expiré' : 'échoué'}. Vous pouvez relancer le paiement.`);
          return;
        }
      } catch (paymentError) {
        if (attempt === 0 && retry) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }
        setError(paymentError instanceof Error ? paymentError.message : 'Impossible de vérifier le paiement.');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  };

  useEffect(() => {
    if (!driver || !paymentId || paymentChecked) return;
    setPaymentChecked(true);
    void checkPaymentStatus(paymentId, true);
  }, [driver, paymentId, paymentChecked]);

  useEffect(() => {
    void loadSession();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('verification') !== 'complete') return;
    window.history.replaceState({}, '', window.location.pathname);
    setNotice('Retour de Didit reçu. Votre statut de vérification est actualisé automatiquement.');
  }, []);

  useEffect(() => {
    if (!activeDelivery) {
      setTimelineEvents([]);
      setTimelineError(null);
      setTimelineLoading(false);
      return;
    }
    let cancelled = false;
    setTimelineLoading(true);
    setTimelineError(null);
    fetch(`/api/delivery/courses/${activeDelivery.id}/events`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as { events?: DeliveryTimelineEvent[]; error?: string };
        if (!response.ok) throw new Error(data.error || 'Impossible de charger l’historique de la course.');
        if (!cancelled) setTimelineEvents(Array.isArray(data.events) ? data.events : []);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setTimelineError(loadError instanceof Error ? loadError.message : 'Impossible de charger l’historique de la course.');
      })
      .finally(() => { if (!cancelled) setTimelineLoading(false); });
    return () => { cancelled = true; };
  }, [activeDelivery?.id, activeDelivery?.status]);

  useVisibilityPolling(
    () => refreshCourses(true),
    12_000,
    Boolean(driver && accessActive),
  );

  const submitAccount = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const endpoint = mode === 'register' ? '/api/delivery/drivers/register' : '/api/delivery/drivers/login';
      const body = mode === 'register' ? { name, phone, pin } : { phone, pin };
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await readJson<{ driver?: DriverProfile }>(response);
      if (!response.ok) throw new Error(data.error || 'Impossible de traiter cette demande.');
      if (mode === 'register') {
        trackSignup('courier', 'registration');
        setDriver(data.driver || null);
        setNotice('Compte créé. Confirmez votre identité avec Didit pour accéder aux courses.');
        await loadSession();
      } else {
        trackLogin('courier', 'pin');
        setDriver(data.driver || null);
        await loadSession();
        setNotice('Connexion livreur réussie.');
      }
    } catch (accountError) {
      setError(accountError instanceof Error ? accountError.message : 'Impossible de traiter cette demande.');
    } finally {
      setSaving(false);
    }
  };

  const startIdentityVerification = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/delivery/drivers/identity/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consent: identityConsent }),
      });
      const data = await readJson<{ session_url?: string; status?: string }>(response);
      if (!response.ok || !data.session_url) throw new Error(data.error || 'Impossible de démarrer la vérification Didit.');
      window.location.assign(data.session_url);
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : 'Impossible de démarrer la vérification Didit.');
      setSaving(false);
    }
  };

  const activateSandboxSubscription = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/delivery/drivers/subscription/sandbox', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await readJson<{ expires_at?: string }>(response);
      if (!response.ok) throw new Error(data.error || 'Le forfait livreur n’a pas pu être activé.');
      setAccessExpiresAt(data.expires_at || null);
      setNotice('Forfait simulé de 1 000 FCFA actif pendant 24 heures. Aucun paiement réel n’a été envoyé.');
      await loadSession();
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Le forfait livreur n’a pas pu être activé.');
    } finally {
      setSaving(false);
    }
  };

  const startProviderSubscription = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/delivery/drivers/subscription/checkout', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await readJson<{ checkout_url?: string; payment_id?: string }>(response);
      if (!response.ok || !data.checkout_url) throw new Error(data.error || 'Le paiement Mobile Money n’a pas pu être préparé.');
      if (data.payment_id) setPaymentId(data.payment_id);
      window.location.assign(data.checkout_url);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Le paiement Mobile Money n’a pas pu être préparé.');
      setSaving(false);
    }
  };

  const uploadProof = async (file: File | undefined) => {
    if (!file || !activeDelivery) return;
    setProofBusy(true);
    setError('');
    setNotice('');
    try {
      const dataUrl = await prepareProofPhoto(file);
      const response = await fetch(`/api/delivery/courses/${activeDelivery.id}/proof`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: dataUrl, captured_at: new Date().toISOString() }),
      });
      const data = await readJson<{ proof?: { sha256: string } }>(response);
      if (!response.ok || !data.proof) throw new Error(data.error || 'La preuve photo n’a pas pu être enregistrée.');
      setProofPreview(dataUrl);
      setProofSha(data.proof.sha256);
      setActiveDelivery((current) => current ? { ...current, proof_available: true } : current);
      setNotice('Preuve photo enregistrée. Vous pouvez maintenant clôturer la course.');
    } catch (proofError) {
      setError(proofError instanceof Error ? proofError.message : 'La preuve photo n’a pas pu être enregistrée.');
    } finally {
      setProofBusy(false);
    }
  };

  const printTicket = () => window.print();

  const saveZones = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/delivery/drivers/zones', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone_ids: selectedZoneIds }),
      });
      const data = await readJson<{ zones?: DriverZone[] }>(response);
      if (!response.ok) throw new Error(data.error || 'Impossible de mettre à jour vos zones.');
      setZones(data.zones || []);
      setSelectedZoneIds((data.zones || []).filter((zone) => zone.is_active).map((zone) => zone.id));
      setNotice('Zones actives enregistrées.');
    } catch (zoneError) {
      setError(zoneError instanceof Error ? zoneError.message : 'Impossible de mettre à jour vos zones.');
    } finally {
      setSaving(false);
    }
  };

  const acceptCourse = async (courseId: number) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/delivery/courses/${courseId}/accept`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || 'Cette course n’a pas pu être acceptée.');
      await refreshCourses();
      setNotice('Course acceptée. Vous pouvez maintenant révéler les contacts nécessaires.');
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : 'Cette course n’a pas pu être acceptée.');
    } finally {
      setSaving(false);
    }
  };

  const advanceCourse = async () => {
    if (!activeDelivery) return;
    const nextStatus = activeDelivery.status === 'accepted' ? 'to_pickup'
      : activeDelivery.status === 'to_pickup' ? 'picked_up'
        : activeDelivery.status === 'picked_up' ? 'delivered' : null;
    if (!nextStatus) return;
    if (nextStatus === 'delivered' && proofRequired && !activeDelivery.proof_available) {
      setError('Ajoutez une photo de preuve de livraison avant de clôturer la course.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/delivery/courses/${activeDelivery.id}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || 'Impossible de modifier le statut de la course.');
      await refreshCourses();
      setNotice(nextStatus === 'delivered' ? 'Course clôturée.' : 'Statut de la course mis à jour.');
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Impossible de modifier le statut de la course.');
    } finally {
      setSaving(false);
    }
  };

  const releaseCourse = async () => {
    if (!activeDelivery) return;
    if (!window.confirm('Libérer cette course ? Elle sera reproposée à un autre livreur.')) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/delivery/courses/${activeDelivery.id}/release`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await readJson<{ error?: string }>(response);
      if (!response.ok) throw new Error(data.error || 'La course n’a pas pu être libérée.');
      await refreshCourses();
      setNotice('Course libérée. Elle est de nouveau proposée aux livreurs disponibles.');
    } catch (releaseError) {
      setError(releaseError instanceof Error ? releaseError.message : 'La course n’a pas pu être libérée.');
    } finally {
      setSaving(false);
    }
  };

  const revealContact = async (role: 'merchant' | 'customer') => {
    if (!activeDelivery) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/delivery/courses/${activeDelivery.id}/contacts/${role}/reveal`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await readJson<{ phone?: string }>(response);
      if (!response.ok) throw new Error(data.error || 'Contact non autorisé.');
      if (!data.phone) throw new Error('Le numéro n’a pas été renvoyé par le serveur.');
      setRevealedContacts((current) => [...current.filter((contact) => contact.role !== role), { role, phone: data.phone! }]);
      setNotice('Révélation enregistrée dans le journal de contacts.');
    } catch (contactError) {
      setError(contactError instanceof Error ? contactError.message : 'Contact non autorisé.');
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    const response = await fetch('/api/delivery/drivers/logout', { method: 'POST', credentials: 'include' });
    if (!response.ok) {
      const data = await response.json() as { error?: string };
      setError(data.error || 'Impossible de fermer la session livreur.');
      return;
    }
    setDriver(null);
    setIdentityConsent(false);
    setIdentityProviderStatus(null);
    setDiditAvailable(false);
    trackLogout('courier');
    setOffers([]);
    setActiveDelivery(null);
    setAccessActive(false);
    setAccessExpiresAt(null);
    setRevealedContacts([]);
  };

  const activeStep = activeDelivery?.status === 'accepted'
    ? { title: 'Course acceptée', action: 'En route vers la boutique' }
    : activeDelivery?.status === 'to_pickup'
      ? { title: 'En route vers la boutique', action: 'Confirmer le colis récupéré' }
      : activeDelivery?.status === 'picked_up'
        ? { title: 'Colis récupéré', action: 'Confirmer la livraison' }
        : null;

  return (
    <main className="min-h-screen bg-[#f5f7f5] px-3 pb-10 pt-4 text-slate-900 sm:px-6 sm:pt-8">
      <style>{`@page { size: A5 portrait; margin: 10mm; }
@media print {
  body * { visibility: hidden !important; }
  #delivery-ticket, #delivery-ticket * { visibility: visible !important; }
  #delivery-ticket {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    border: 1.5px solid #103E32 !important;
    border-radius: 0 !important;
    background: #ffffff !important;
    padding: 8mm !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}`}</style>
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[#CBE6DA] bg-[#F0FAF5] p-4">
          <div className="flex items-start gap-3">
            <img src="/brand-kit/monogram.svg" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl" />
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-[#0F6B54]">Espace livreur MaTable.ci</p>
              <p className="mt-1 text-xs leading-5 text-[#103E32]">Recevez les courses de vos zones, révélez les contacts au bon moment et clôturez chaque livraison avec sa preuve photo.</p>
            </div>
          </div>
          {driver && <button type="button" onClick={() => void logout()} className="min-h-9 rounded-lg border border-[#B9DCCF] bg-white px-3 text-xs font-bold text-[#103E32] transition-colors hover:bg-[#F4F8F5]">Déconnexion</button>}
        </header>

        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">{error}</p>}
        {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-950">{notice}</p>}
        {loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Chargement de l’espace livreur…</p> : !serviceAvailable ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h1 className="text-lg font-black text-amber-950">Service de livraison indisponible</h1>
            <p className="mt-2 text-sm leading-6 text-amber-900">Le service de livraison MaTable.ci n’est pas activé sur ce serveur. Contactez l’assistance MaTable.ci si vous pensez qu’il s’agit d’une erreur.</p>
            {isDevEnvironment && (
              <p className="mt-2 text-xs leading-5 text-amber-800">En local, démarrez le serveur avec <code>DELIVERY_TEST_MODE=true</code>. Pour le paiement simulé uniquement, ajoutez <code>DELIVERY_SANDBOX_PAYMENTS=true</code>.</p>
            )}
          </section>
        ) : !driver ? (
          <section className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-900"><Bike className="h-5 w-5" /></span>
            <h1 className="mt-3 text-xl font-black text-slate-950">Espace livreur MaTable</h1>
            <p className="mt-1 text-sm leading-5 text-slate-600">{mode === 'login' ? 'Connectez-vous avec votre numéro et votre code PIN.' : 'Créez votre compte, puis vérifiez votre identité avec Didit pour activer l’accès aux courses.'}</p>
            <form className="mt-4 space-y-3" onSubmit={(event) => void submitAccount(event)}>
              {mode === 'register' && (
                <label className="block text-xs font-bold text-slate-700">Nom complet
                  <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
                </label>
              )}
              <label className="block text-xs font-bold text-slate-700">Téléphone
                <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" required className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
              </label>
              <label className="block text-xs font-bold text-slate-700">Code PIN à 6 chiffres
                <input type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} value={pin} onChange={(event) => setPin(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" />
              </label>
              <button type="submit" disabled={saving} className="min-h-11 w-full rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Patientez…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte livreur'}</button>
            </form>
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setNotice(''); }} className="mt-3 min-h-10 w-full text-xs font-bold text-emerald-900 underline underline-offset-2">
              {mode === 'login' ? 'Créer un compte livreur' : 'J’ai déjà un compte'}
            </button>
          </section>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <header className="bg-[#103E32] px-4 py-5 text-white sm:px-6">
                <p className="text-xs font-bold text-emerald-100">Bonjour, {driver.name}</p>
                <h1 className="mt-1 text-xl font-black">Espace livreur</h1>
                <p className="mt-2 text-xs text-emerald-100">{driver.phone} · compte {driver.status}{accessActive ? ' · forfait actif' : ''}</p>
              </header>

              {driver.status === 'suspended' ? (
                <div className="p-4 sm:p-6">
                  <h2 className="text-lg font-black text-slate-950">Compte suspendu</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Contactez l’assistance MaTable.ci pour obtenir des informations sur votre compte.</p>
                  <button type="button" onClick={() => void loadSession()} className="mt-4 min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700">Actualiser le statut</button>
                </div>
              ) : driver.status !== 'active' || driver.identity_status !== 'verified' ? (
                <section aria-labelledby="driver-identity-title" className="m-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:m-6">
                  <p className="text-xs font-bold uppercase text-emerald-900">Étape requise avant le forfait</p>
                  <h2 id="driver-identity-title" className="mt-1 text-lg font-black text-emerald-950">
                    {driver.identity_status === 'under_review' || driver.identity_status === 'submitted' ? 'Vérification Didit en cours' : 'Vérifier votre identité avec Didit'}
                  </h2>
                  {driver.identity_status === 'under_review' || driver.identity_status === 'submitted' ? (
                    <>
                      <p className="mt-2 text-sm leading-6 text-emerald-950">Didit traite votre vérification. Votre compte sera activé automatiquement après validation; vous pourrez ensuite choisir vos zones et payer votre forfait GeniusPay.</p>
                      {identityProviderStatus && <p className="mt-2 text-xs text-emerald-900">Statut Didit : {identityProviderStatus}</p>}
                      <button type="button" onClick={() => void loadSession()} disabled={saving} className="mt-3 min-h-10 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-bold text-emerald-950 disabled:opacity-50">Actualiser le statut</button>
                    </>
                  ) : driver.identity_status === 'verified' ? (
                    <p className="mt-2 text-sm leading-6 text-emerald-950">Votre identité est vérifiée. L’activation de l’accès est en cours; actualisez le statut dans un instant.</p>
                  ) : (
                    <>
                      <p className="mt-2 text-sm leading-6 text-emerald-950">Didit vérifiera votre identité dans son parcours sécurisé. MaTable.ci conserve uniquement le statut, l’identifiant de session et la preuve de votre consentement; les pièces et données biométriques restent chez Didit.</p>
                      {driver.identity_status === 'rejected' && <p role="status" className="mt-2 rounded-lg border border-amber-300 bg-white p-2.5 text-xs font-semibold text-amber-950">Didit n’a pas validé cette vérification. Consultez les indications affichées par Didit, puis réessayez.</p>}
                      {!diditAvailable ? (
                        <p role="status" className="mt-3 rounded-lg border border-amber-300 bg-white p-2.5 text-xs font-semibold text-amber-950">La vérification Didit des livreurs n’est pas encore configurée sur ce serveur. Contactez l’assistance.</p>
                      ) : (
                        <>
                          <label className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-white p-3 text-xs leading-5 text-slate-800">
                            <input type="checkbox" checked={identityConsent} onChange={(event) => setIdentityConsent(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-800" />
                            <span>J’accepte que mes données d’identité et, si le parcours le demande, mes données biométriques soient traitées directement par Didit pour vérifier mon identité. MaTable.ci recevra le résultat, pas mes pièces.</span>
                          </label>
                          <button type="button" onClick={() => void startIdentityVerification()} disabled={saving || !identityConsent} className="mt-3 min-h-11 w-full rounded-lg bg-emerald-900 px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Connexion à Didit…' : 'Continuer avec Didit'}</button>
                        </>
                      )}
                    </>
                  )}
                </section>
              ) : (
                <div className="space-y-4 p-4 sm:p-6">
                  <section aria-labelledby="courier-zones-title" className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-emerald-800" /><h2 id="courier-zones-title" className="text-sm font-black">Mes zones actives</h2></div>
                    {zones.length === 0 ? <p className="mt-2 text-xs text-slate-600">Aucune zone ne vous a encore été attribuée par l’administration.</p> : (
                      <>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {zones.map((zone) => (
                            <label key={zone.id} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700">
                              <input
                                type="checkbox"
                                checked={selectedZoneIds.includes(zone.id)}
                                onChange={(event) => setSelectedZoneIds((current) => event.target.checked
                                  ? [...current, zone.id]
                                  : current.filter((id) => id !== zone.id))}
                              />
                              {zone.label}
                            </label>
                          ))}
                        </div>
                        <button type="button" onClick={() => void saveZones()} disabled={saving} className="mt-3 min-h-9 rounded-lg border border-emerald-300 px-3 text-xs font-bold text-emerald-950 disabled:opacity-50">Enregistrer mes zones</button>
                      </>
                    )}
                  </section>

                  {!accessActive ? (
                    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <span className="grid h-10 w-10 place-items-center rounded-lg bg-white text-emerald-900"><CreditCard className="h-5 w-5" /></span>
                      <h2 className="mt-3 text-base font-black text-emerald-950">Activer l’accès aux courses</h2>
                      <p className="mt-1 text-xs leading-5 text-emerald-900">Forfait de 1 000 FCFA valable 24 heures. Le paiement réel passe par GeniusPay et Mobile Money. Aucune course n’est accessible avant confirmation.</p>
                      {paymentState && paymentState.status !== 'paid' && (
                        <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-white p-2.5 text-xs font-semibold text-emerald-950">
                          Paiement {paymentState.payment_id.slice(0, 8)}… · {paymentState.status === 'pending' ? 'en attente de confirmation' : paymentState.status}
                        </p>
                      )}
                      {providerPaymentsAvailable ? (
                        <button type="button" onClick={() => void startProviderSubscription()} disabled={saving} className="mt-3 min-h-11 w-full rounded-lg bg-emerald-900 px-4 text-xs font-bold text-white disabled:opacity-50">
                          {saving ? 'Préparation…' : 'Payer 1 000 FCFA par Mobile Money'}
                        </button>
                      ) : (
                        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs font-semibold text-amber-950">
                          {sandboxPaymentsEnabled
                            ? 'Le paiement réel n’est pas configuré sur ce serveur. Utilisez le mode simulé ci-dessous.'
                            : 'Le paiement Mobile Money n’est pas encore configuré. Contactez MaTable.ci pour activer votre forfait livreur.'}
                        </p>
                      )}
                      {paymentState?.status === 'pending' && (
                        <button type="button" onClick={() => void checkPaymentStatus(paymentState.payment_id)} disabled={saving} className="mt-2 min-h-10 w-full rounded-lg border border-emerald-300 bg-white px-4 text-xs font-bold text-emerald-950 disabled:opacity-50">
                          Vérifier le paiement
                        </button>
                      )}
                      {sandboxPaymentsEnabled && (
                        <button type="button" onClick={() => void activateSandboxSubscription()} disabled={saving} className="mt-2 min-h-11 w-full rounded-lg border border-emerald-300 bg-white px-4 text-xs font-bold text-emerald-950 disabled:opacity-50">Simuler le forfait de 1 000 FCFA</button>
                      )}
                    </section>
                  ) : activeDelivery ? (
                    <section aria-labelledby="active-delivery-title" className="rounded-xl border border-[#CBE6DA] bg-white p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-[#0F6B54]">Course active · #{activeDelivery.id}</p>
                          <h2 id="active-delivery-title" className="mt-1 truncate text-base font-black text-[#103E32]">{activeDelivery.shop_name || 'Boutique'}</h2>
                          <div className="mt-1.5"><DeliveryStatusBadge status={activeDelivery.status} /></div>
                        </div>
                        <strong className="rounded-lg border border-[#B9DCCF] bg-[#F0FAF5] px-3 py-2 text-xs tabular-nums text-[#103E32]">{money(activeDelivery.quoted_amount)}</strong>
                      </div>
                      <div className="mt-4 grid gap-2 text-xs text-[#292d2a] sm:grid-cols-2">
                        <p className="rounded-lg border border-[#E4EDE8] bg-[#FAF8F2] p-2.5"><strong className="text-[#103E32]">Retrait · {activeDelivery.pickup_zone || 'Zone'}</strong><br />{activeDelivery.pickup_address || 'Adresse boutique à confirmer'}</p>
                        <p className="rounded-lg border border-[#E4EDE8] bg-[#FAF8F2] p-2.5"><strong className="text-[#103E32]">Destination · {activeDelivery.destination_zone || 'Zone'}</strong><br />{activeDelivery.delivery_location || 'Adresse client'}</p>
                      </div>
                      <div className="mt-4 space-y-2">
                        <div id="delivery-ticket" className="rounded-xl border border-dashed border-[#B9DCCF] bg-white p-4">
                          <div className="flex items-start justify-between gap-3 border-b border-[#EDE8DE] pb-3">
                            <div className="flex items-center gap-2">
                              <img src="/brand-kit/monogram.svg" alt="" width={32} height={32} className="h-8 w-8 shrink-0 rounded-lg" />
                              <div>
                                <p className="text-xs font-black leading-tight tracking-tight text-[#103E32]">MaTable<span className="text-[#F97316]">.ci</span></p>
                                <p className="mt-0.5 text-[9px] font-bold uppercase leading-none tracking-[0.14em] text-[#8A948E]">Ticket de course</p>
                              </div>
                            </div>
                            <p className="text-right text-[10px] leading-4 text-[#587067]">
                              {activeDelivery.created_at ? formatTicketDate(activeDelivery.created_at) : ''}
                            </p>
                          </div>
                          <p className="mt-3 break-words font-mono text-lg font-black tracking-[0.1em] text-[#103E32]">{activeDelivery.ticket_number || `COURSE-${activeDelivery.id}`}</p>
                          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                            <dt className="text-[#587067]">Course</dt><dd className="text-right font-bold text-[#1B2620]">#{activeDelivery.id}</dd>
                            <dt className="text-[#587067]">Commande</dt><dd className="text-right font-bold text-[#1B2620]">#{activeDelivery.order_id}</dd>
                            <dt className="text-[#587067]">Montant</dt><dd className="text-right font-bold text-[#1B2620]">{money(activeDelivery.quoted_amount)}</dd>
                            <dt className="text-[#587067]">Statut</dt><dd className="text-right font-bold text-[#1B2620]">{DELIVERY_STATUS_LABELS[activeDelivery.status] || activeDelivery.status}</dd>
                          </dl>
                        </div>
                        <button type="button" onClick={printTicket} className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[#B9DCCF] bg-white px-3 text-[11px] font-bold text-[#103E32] transition-colors hover:bg-[#F4F8F5]"><Printer className="h-3.5 w-3.5" />Imprimer le ticket</button>
                      </div>
                      <div className="mt-4 rounded-lg bg-slate-50 p-3">
                        <p className="text-sm font-bold">{activeStep?.title}</p>
                        <p className="mt-1 text-xs text-slate-600">Les numéros restent masqués tant que vous ne demandez pas explicitement leur révélation.</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {([
                            ['merchant', 'Contacter la boutique'],
                            ['customer', 'Contacter le client'],
                          ] as const).map(([role, label]) => {
                            const revealed = revealedContacts.find((contact) => contact.role === role);
                            return (
                              <div key={role} className="rounded-lg border border-slate-200 bg-white p-2.5">
                                <p className="text-xs font-bold text-slate-700">{label}</p>
                                {revealed ? <a href={`tel:${revealed.phone}`} className="mt-1 inline-block text-sm font-black text-emerald-900">{revealed.phone}</a> : <p className="mt-1 text-xs text-slate-500">Numéro masqué</p>}
                                {!revealed && <button type="button" onClick={() => void revealContact(role)} disabled={saving} className="mt-2 min-h-9 w-full rounded-lg border border-emerald-300 px-2 text-[11px] font-bold text-emerald-950 disabled:opacity-50">Révéler et tracer</button>}
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><Camera className="h-3.5 w-3.5" />Preuve photo de livraison</p>
                              <p className="mt-1 text-[11px] leading-4 text-slate-500">{proofRequired ? 'Obligatoire avant de clôturer la course.' : 'Facultative sur ce serveur.'} Photo JPEG, PNG ou WebP, compressée sous 300 Ko.</p>
                            </div>
                            {activeDelivery.proof_available && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-900">Enregistrée</span>}
                          </div>
                          {proofPreview && <img src={proofPreview} alt="Preuve de livraison enregistrée" className="mt-2 max-h-40 w-full rounded-lg object-cover" />}
                          {proofSha && <p className="mt-1 break-all font-mono text-[9px] text-slate-400">SHA-256 {proofSha}</p>}
                          <input
                            id="delivery-proof-file"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            capture="environment"
                            className="sr-only"
                            onChange={(event) => {
                              void uploadProof(event.target.files?.[0]);
                              event.currentTarget.value = '';
                            }}
                          />
                          <label htmlFor="delivery-proof-file" className={`mt-2 inline-flex min-h-9 w-full cursor-pointer items-center justify-center rounded-lg border border-emerald-300 px-2 text-[11px] font-bold text-emerald-950 ${proofBusy ? 'opacity-50' : ''}`} aria-disabled={proofBusy}>
                            {proofBusy ? 'Compression et envoi…' : activeDelivery.proof_available ? 'Remplacer la photo' : 'Prendre ou choisir une photo'}
                          </label>
                        </div>
                        {activeStep && (
                          <button
                            type="button"
                            onClick={() => void advanceCourse()}
                            disabled={saving || (activeStep.action === 'Confirmer la livraison' && proofRequired && !activeDelivery.proof_available)}
                            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-900 px-4 text-xs font-bold text-white disabled:opacity-50"
                          >
                            {activeStep.action}
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        )}
                        {activeStep?.action === 'Confirmer la livraison' && proofRequired && !activeDelivery.proof_available && (
                          <p role="status" className="mt-2 text-[11px] font-semibold text-amber-800">Ajoutez la photo de preuve pour débloquer la clôture.</p>
                        )}
                        <div className="mt-3">
                          <DeliveryTimeline
                            events={timelineEvents}
                            loading={timelineLoading}
                            error={timelineError}
                            title="Historique de cette course"
                          />
                        </div>
                        {['accepted', 'to_pickup'].includes(activeDelivery.status) && (
                          <button
                            type="button"
                            onClick={() => void releaseCourse()}
                            disabled={saving}
                            className="mt-3 min-h-10 w-full rounded-lg border border-amber-300 bg-white px-4 text-xs font-bold text-amber-950 disabled:opacity-50"
                          >
                            Libérer la course
                          </button>
                        )}
                      </div>
                    </section>
                  ) : (
                    <section aria-labelledby="delivery-offers-title">
                      <div className="flex items-center justify-between gap-3">
                        <div><p className="text-xs font-bold uppercase text-emerald-800">Forfait actif</p><h2 id="delivery-offers-title" className="mt-1 text-base font-black">Courses disponibles</h2></div>
                        <button type="button" onClick={() => void refreshCourses()} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700"><Navigation className="h-3.5 w-3.5" />Actualiser</button>
                      </div>
                      {offers.length === 0 ? <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">Aucune course ne correspond actuellement à vos zones actives.</p> : (
                        <div className="mt-3 space-y-3">
                          {offers.map((offer) => (
                            <article key={offer.id} className="rounded-xl border border-slate-200 p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div><p className="text-[11px] font-bold uppercase text-slate-500">Course #{offer.id} · commande #{offer.order_id}</p><h3 className="mt-1 text-sm font-black">{offer.shop_name || 'Boutique'}</h3></div>
                                <strong className="text-sm font-black text-emerald-900">{money(offer.quoted_amount)}</strong>
                              </div>
                              <div className="mt-3 grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                                <p><strong>Retrait · {offer.pickup_zone || 'Zone'}</strong><br />{offer.pickup_address || 'Boutique'}</p>
                                <p><strong>Destination · {offer.destination_zone || 'Zone'}</strong><br />{offer.delivery_location || 'Adresse client'}</p>
                              </div>
                              <p className="mt-2 text-[11px] text-slate-500">Contacts masqués jusqu’à l’acceptation de la course.</p>
                              <button type="button" onClick={() => void acceptCourse(offer.id)} disabled={saving} className="mt-3 min-h-10 w-full rounded-lg bg-emerald-900 px-4 text-xs font-bold text-white disabled:opacity-50">Accepter la course</button>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  )}
                </div>
              )}
            </section>

            <aside className="space-y-3">
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-emerald-800" /><h2 className="text-sm font-black">Mon compte</h2></div>
                <p className="mt-2 text-xs leading-5 text-slate-600">{driver.name}<br />{driver.phone}<br />Statut : {driver.status}</p>
                {accessExpiresAt && <p className="mt-2 text-[11px] text-slate-500">Forfait jusqu’au {new Date(accessExpiresAt).toLocaleString('fr-FR')}</p>}
              </section>
              <PushOptIn
                configUrl="/api/delivery/drivers/push/config"
                subscriptionUrl="/api/delivery/drivers/push/subscription"
                title="Alertes de course"
                description="Recevez une notification dès qu’une course correspond à vos zones actives, même quand cet onglet est fermé."
                tone="sky"
              />
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2"><PackageCheck className="h-4 w-4 text-emerald-800" /><h2 className="text-sm font-black">Règles de course</h2></div>
                <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-600">
                  <li>Le retrait et la destination doivent être couverts par vos zones actives.</li>
                  <li>Le premier livreur qui accepte gagne la course.</li>
                  <li>Chaque révélation de contact est limitée et auditée.</li>
                  <li>Le forfait de 24 heures est requis avant de recevoir des courses.</li>
                  <li>Une photo de preuve est exigée avant la clôture lorsque le serveur l’impose.</li>
                </ul>
              </section>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
