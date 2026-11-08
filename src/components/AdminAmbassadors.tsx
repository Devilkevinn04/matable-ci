import { useEffect, useState } from 'react';
import { Copy, CreditCard, Download, RefreshCw, Store, Users, Wallet } from 'lucide-react';
import { isCommissionPayableForMonth } from '../utils/ambassadors';
import { stringifyCsv } from '../utils/csv';

interface Ambassador {
  id: string; name: string; code: string; email: string | null; phone: string | null; active: number;
  has_account: number; invite_expires_at: string | null; registrations: number; published: number; paying: number; commissions: number;
}
interface AmbassadorApplication {
  id: string; name: string; email: string; phone: string | null;
  status: 'pending' | 'approved' | 'rejected'; created_at: string;
  decided_at: string | null; decision_reason: string | null;
}
interface Referral {
  shop_id: number; shop_name: string; ambassador_id: string; ambassador_name: string; publication_status: string;
  owner_email: string | null; whatsapp_number: string; ambassador_email: string | null; ambassador_phone: string | null;
  tier: string | null; subscription_term: string | null; payment_status: string | null; payment_id: string | null; amount: number | null;
  status: string | null; approved_at: string | null; paid_at: string | null; payout_reference: string | null; decision_details: string | null;
}
interface Payout { id: string; ambassador_name: string; shop_name: string; amount: number; reference: string; paid_at: string }
interface Withdrawal {
  id: string; ambassador_id: string; ambassador_name: string; ambassador_email: string | null;
  amount: number; status: 'requested' | 'approved' | 'rejected' | 'paid'; payout_method: string;
  payout_phone: string; created_at: string; processed_at: string | null;
  payout_reference: string | null; admin_reason: string | null;
}
type AdminAmbassadorView = 'partners' | 'commissions' | 'withdrawals' | 'payouts';
const statusLabels: Record<string, string> = { pending: 'À vérifier', approved: 'Validée', withdrawal_requested: 'Retrait demandé', paid: 'Versée', cancelled: 'Annulée', refund_review: 'Remboursement à examiner' };
const withdrawalStatusLabels: Record<Withdrawal['status'], string> = { requested: 'À examiner', approved: 'À payer', rejected: 'Refusée', paid: 'Payée' };
const payoutMethodLabels: Record<string, string> = { wave: 'Wave', orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', moov_money: 'Moov Money' };
const money = (value: number) => `${new Intl.NumberFormat('fr-FR').format(value)} FCFA`;
function decisionReason(details: string | null): string | null {
  try {
    const value = details ? JSON.parse(details) as { reason?: unknown } : null;
    return typeof value?.reason === 'string' ? value.reason : null;
  } catch { return null; }
}

export function AdminAmbassadors() {
  const [adminView, setAdminView] = useState<AdminAmbassadorView>('partners');
  const [applications, setApplications] = useState<AmbassadorApplication[]>([]);
  const [manualApplicationInvite, setManualApplicationInvite] = useState<{ url: string; expiresAt: string } | null>(null);
  const [ambassadors, setAmbassadors] = useState<Ambassador[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [editingAmbassadorId, setEditingAmbassadorId] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState({ name: '', email: '', phone: '' });
  const [references, setReferences] = useState<Record<number, string>>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [inviteLinks, setInviteLinks] = useState<Record<string, { url: string; expiresAt: string; emailSent: boolean }>>({});
  const [withdrawalReferences, setWithdrawalReferences] = useState<Record<string, string>>({});
  const [withdrawalReasons, setWithdrawalReasons] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('pending');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const response = await fetch('/api/admin/ambassadors', { credentials: 'include', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Chargement impossible.');
    setApplications(data.applications || []);
    setAmbassadors(data.ambassadors);
    setReferrals(data.referrals);
    setPayouts(data.payouts);
    setWithdrawals(data.withdrawals);
    return data as { applications: AmbassadorApplication[]; ambassadors: Ambassador[]; referrals: Referral[]; payouts: Payout[]; withdrawals: Withdrawal[] };
  };
  useEffect(() => { void load().catch((problem) => setError(problem.message)); }, []);
  const perform = async (path: string, method: string, body: object) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/ambassadors${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Opération impossible.');
      await load();
      return true;
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Opération impossible.'); return false; }
    finally { setBusy(false); }
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await perform('', 'POST', { name, email, phone })) { setName(''); setEmail(''); setPhone(''); setNotice('Ambassadeur créé.'); }
  };
  const saveProfile = async (event: React.FormEvent, ambassador: Ambassador) => {
    event.preventDefault();
    const emailChanged = profileDraft.email.trim().toLowerCase() !== (ambassador.email || '').toLowerCase();
    if (emailChanged && !window.confirm('Changer l’e-mail de connexion révoquera les sessions et liens en attente. L’ambassadeur devra recevoir un nouveau lien d’activation. Continuer ?')) return;
    if (await perform(`/${ambassador.id}`, 'PATCH', profileDraft)) {
      setEditingAmbassadorId(null);
      setNotice(emailChanged ? 'Profil mis à jour. Créez un nouveau lien pour le nouvel e-mail.' : 'Profil ambassadeur mis à jour.');
    }
  };
  const action = async (shopId: number, operation: string) => {
    const reference = references[shopId] || '';
    const reason = reasons[shopId]?.trim() || '';
    if (operation === 'paid' && !reference.trim()) { setError('Renseignez la référence du versement.'); return; }
    if (['approve', 'reject'].includes(operation) && reason.length < 3) { setError('Documentez le contrôle en 3 à 500 caractères avant de valider ou refuser la commission.'); return; }
    if (!window.confirm(operation === 'paid' ? 'Confirmer que le versement a déjà été effectué ?' : operation === 'approve' ? 'Confirmer que le paiement, la publication et les coordonnées du commerçant ont été vérifiés ?' : 'Annuler définitivement cette commission ?')) return;
    if (await perform(`/commissions/${shopId}/${operation}`, 'POST', { reference, reason })) {
      setReferences((current) => ({ ...current, [shopId]: '' }));
      setReasons((current) => ({ ...current, [shopId]: '' }));
      setNotice('Commission mise à jour.');
    }
  };
  const createInvite = async (ambassadorId: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/ambassadors/${ambassadorId}/invite`, { method: 'POST', credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de créer le lien d’accès.');
      setInviteLinks((current) => ({
        ...current,
        [ambassadorId]: { url: data.invite_url, expiresAt: data.expires_at, emailSent: data.email_sent === true },
      }));
      await load();
      setNotice(data.email_sent
        ? 'Lien sécurisé envoyé par e-mail. Il expire dans 7 jours et ne peut être utilisé qu’une seule fois.'
        : 'E-mail non envoyé. Le lien temporaire reste disponible ici pour une transmission manuelle sécurisée.');
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Impossible de créer le lien d’accès.'); }
    finally { setBusy(false); }
  };
  const processApplication = async (application: AmbassadorApplication, action: 'approve' | 'reject') => {
    const reason = action === 'reject'
      ? window.prompt('Motif du refus (obligatoire, 3 à 500 caractères) :')?.trim() || ''
      : '';
    if (action === 'reject' && reason.length < 3) {
      if (reason) setError('Le motif de refus doit contenir au moins 3 caractères.');
      return;
    }
    if (action === 'approve' && !window.confirm(`Approuver ${application.name} ? Un compte et un code ambassadeur seront créés, puis un lien d’activation sera envoyé à ${application.email}.`)) return;

    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/admin/ambassadors/applications/${application.id}/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de traiter la candidature.');
      await load();
      if (action === 'reject') {
        setNotice(data.email_sent
          ? 'Candidature refusée, motif enregistré et candidat informé par e-mail.'
          : 'Candidature refusée et motif enregistré, mais l’e-mail de notification n’a pas pu être envoyé.');
      } else if (data.email_sent) {
        setManualApplicationInvite(null);
        setNotice('Candidature approuvée. Le lien d’activation a été envoyé par e-mail.');
      } else {
        setManualApplicationInvite({ url: data.invite_url, expiresAt: data.expires_at });
        setNotice('Candidature approuvée, mais l’e-mail n’a pas été envoyé. Transmettez le lien ci-dessous directement au candidat.');
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Impossible de traiter la candidature.');
    } finally {
      setBusy(false);
    }
  };
  const processWithdrawal = async (withdrawal: Withdrawal, action: 'approve' | 'reject' | 'paid') => {
    const reference = withdrawalReferences[withdrawal.id] || '';
    const reason = withdrawalReasons[withdrawal.id]?.trim() || '';
    if (action === 'paid' && !reference) { setError('Saisissez la référence du transfert effectué.'); return; }
    if (action === 'reject' && reason.length < 3) { setError('Indiquez le motif du refus.'); return; }
    const confirmation = action === 'paid'
      ? 'Confirmer que le transfert a bien été effectué ?'
      : action === 'approve'
        ? 'Valider cette demande de retrait ?'
        : 'Refuser le retrait et rendre le solde disponible à nouveau ?';
    if (!window.confirm(confirmation)) return;
    if (await perform(`/withdrawals/${withdrawal.id}/${action}`, 'POST', { reference, reason })) {
      setWithdrawalReferences((current) => ({ ...current, [withdrawal.id]: '' }));
      setWithdrawalReasons((current) => ({ ...current, [withdrawal.id]: '' }));
      setNotice(action === 'paid' ? 'Versement enregistré.' : action === 'approve' ? 'Retrait validé.' : 'Demande refusée ; le solde est de nouveau disponible.');
    }
  };
  const payable = referrals.filter((referral) => isCommissionPayableForMonth(referral, month));
  const visibleReferrals = referrals.filter((referral) => filter === 'all' || (filter === 'unpaid' ? referral.status === null : referral.status === filter));
  const exportPayouts = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const current = await load();
      const rows = current.referrals.filter((referral) => isCommissionPayableForMonth(referral, month));
      if (!rows.length) { setNotice('Aucune prime à exporter pour cette période.'); return; }
      const csv = stringifyCsv([
        ['Ambassadeur', 'Code', 'E-mail ambassadeur', 'Téléphone ambassadeur', 'Boutique', 'ID boutique', 'Paiement', 'Date validation UTC', 'Prime FCFA'],
        ...rows.map((referral) => [referral.ambassador_name, current.ambassadors.find((ambassador) => ambassador.id === referral.ambassador_id)?.code || '', referral.ambassador_email, referral.ambassador_phone, referral.shop_name, referral.shop_id, referral.payment_id, referral.approved_at, Number(referral.amount)]),
      ]);
      const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a');
      link.href = url; link.download = `matable-commissions-a-verser-${month}.csv`; link.click();
      URL.revokeObjectURL(url);
      setNotice('Liste actualisée et exportée.');
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Export impossible.'); }
    finally { setBusy(false); }
  };

  const adminTabs: { id: AdminAmbassadorView; label: string; icon: typeof Users; count?: number }[] = [
    { id: 'partners', label: 'Partenaires', icon: Users, count: ambassadors.length },
    { id: 'commissions', label: 'Commissions', icon: CreditCard, count: referrals.length },
    { id: 'withdrawals', label: 'Retraits', icon: Wallet, count: withdrawals.filter((withdrawal) => ['requested', 'approved'].includes(withdrawal.status)).length },
    { id: 'payouts', label: 'Historique', icon: Store },
  ];
  return <section data-admin-view={adminView} className="admin-ambassadors space-y-6" aria-labelledby="ambassadors-title">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-emerald-800">Partenariats</p><h2 id="ambassadors-title" className="mt-1 text-xl font-black text-slate-900">Ambassadeurs</h2></div><button type="button" title="Actualiser" aria-label="Actualiser" onClick={() => void load().catch((problem) => setError(problem.message))} className="rounded-lg border border-slate-300 p-2"><RefreshCw className="h-5 w-5" /></button></header>
    {error && <p role="alert" className="text-sm font-semibold text-rose-800">{error}</p>}{notice && <p role="status" className="text-sm font-semibold text-emerald-800">{notice}</p>}
    <div role="group" aria-label="Rubriques ambassadeurs" className="overflow-x-auto border-b border-slate-200">
      <div className="flex min-w-max items-center gap-5">{adminTabs.map(({ id, label, icon: Icon, count }) => <button key={id} type="button" aria-pressed={adminView === id} onClick={() => setAdminView(id)} className={`inline-flex min-h-12 items-center gap-2 border-b-2 px-1 text-xs font-semibold transition-colors ${adminView === id ? 'border-emerald-900 text-emerald-950' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}><Icon className="h-4 w-4" /><span>{label}{count ? ` · ${count}` : ''}</span></button>)}</div>
    </div>
    <div data-admin-panel="partners" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-black text-amber-950">Candidatures à examiner ({applications.filter((application) => application.status === 'pending').length})</h3><p className="mt-1 text-xs leading-5 text-amber-900">Aucun compte ni code de parrainage n’est créé avant approbation.</p></div><button type="button" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/ambassadeur/inscription`).then(() => setNotice('Lien public de candidature copié.')).catch(() => setError('Copie impossible.'))} className="min-h-9 rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-amber-950">Copier le lien de candidature</button></div>
      {applications.filter((application) => application.status === 'pending').length === 0
        ? <p className="text-sm text-amber-900">Aucune candidature en attente.</p>
        : applications.filter((application) => application.status === 'pending').map((application) => <article key={application.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 pt-3">
          <div className="min-w-0"><strong className="text-sm text-slate-900">{application.name}</strong><p className="break-all text-xs text-slate-700">{application.email}{application.phone ? ` · ${application.phone}` : ''}</p><p className="text-xs text-slate-500">Reçue le {new Date(application.created_at).toLocaleString('fr-FR')}</p></div>
          <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void processApplication(application, 'approve')} className="min-h-9 rounded-lg bg-emerald-800 px-3 text-xs font-bold text-white disabled:opacity-50">Approuver et inviter</button><button type="button" disabled={busy} onClick={() => void processApplication(application, 'reject')} className="min-h-9 rounded-lg border border-rose-300 px-3 text-xs font-bold text-rose-800 disabled:opacity-50">Refuser</button></div>
        </article>)}
      {manualApplicationInvite && <div className="space-y-2 rounded-lg border border-amber-300 bg-white p-3"><p className="text-xs font-bold text-amber-950">Lien de secours à usage unique · expire le {new Date(manualApplicationInvite.expiresAt).toLocaleString('fr-FR')}</p><div className="flex flex-wrap items-center gap-2"><a href={manualApplicationInvite.url} target="_blank" rel="noreferrer" className="break-all text-xs font-semibold text-emerald-800 underline">Ouvrir le lien d’activation</a><button type="button" onClick={() => void navigator.clipboard.writeText(manualApplicationInvite.url).then(() => setNotice('Lien d’activation copié.')).catch(() => setError('Copie impossible.'))} className="min-h-8 rounded border border-slate-300 px-2 text-xs font-bold">Copier</button></div><p className="text-xs text-slate-600">Transmettez-le uniquement au candidat approuvé. Il ne sera plus affiché après actualisation.</p></div>}
    </div>
    <form data-admin-panel="partners" onSubmit={(event) => void create(event)} className="grid items-end gap-3 border-y border-slate-200 py-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="text-xs font-bold text-slate-700">Nom<input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
      <label className="text-xs font-bold text-slate-700">E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
      <label className="text-xs font-bold text-slate-700">Téléphone<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label>
      <button disabled={busy} className="min-h-10 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white disabled:opacity-50">Créer un ambassadeur</button>
    </form>
    <div data-admin-panel="partners" className="space-y-3"><h3 className="text-sm font-black text-slate-900">Comptes ambassadeurs ({ambassadors.length})</h3>{ambassadors.length === 0 && <p className="text-sm text-slate-500">Aucun ambassadeur.</p>}{ambassadors.map((ambassador) => {
      const inviteExpiry = ambassador.invite_expires_at ? Date.parse(ambassador.invite_expires_at) : NaN;
      const invitePending = Number.isFinite(inviteExpiry) && inviteExpiry > Date.now();
      const inviteExpired = Number.isFinite(inviteExpiry) && inviteExpiry <= Date.now();
      const accessLabel = !ambassador.active ? 'Compte suspendu'
        : ambassador.has_account ? 'Accès activé'
          : invitePending ? 'Invitation en attente'
            : inviteExpired ? 'Lien expiré' : 'Accès à activer';
      return <article key={ambassador.id} className="border-b border-slate-200 pb-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><strong className="text-sm text-slate-900">{ambassador.name}</strong><span className="ml-2 text-xs text-slate-500">{ambassador.code}</span><p className="mt-1 text-xs font-semibold text-emerald-900">{accessLabel}</p></div><div className="flex flex-wrap gap-2"><button disabled={busy} type="button" onClick={() => {
        setEditingAmbassadorId(ambassador.id);
        setProfileDraft({ name: ambassador.name, email: ambassador.email || '', phone: ambassador.phone || '' });
      }} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold">Modifier le profil</button><button disabled={busy} type="button" onClick={() => {
        const active = !ambassador.active;
        if (!active && !window.confirm('Suspendre ce compte ? Toutes ses sessions seront révoquées et les liens d’activation en attente seront annulés.')) return;
        void perform(`/${ambassador.id}`, 'PATCH', { active }).then((success) => {
          if (success) setNotice(active ? 'Compte ambassadeur réactivé.' : 'Compte suspendu ; ses accès ont été révoqués.');
        });
      }} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold">{ambassador.active ? 'Suspendre l’accès' : 'Réactiver le compte'}</button></div></div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div><dt className="font-semibold text-slate-500">E-mail de connexion</dt><dd className="mt-0.5 break-all text-slate-800">{ambassador.email || 'Non renseigné'}</dd></div><div><dt className="font-semibold text-slate-500">Téléphone</dt><dd className="mt-0.5 text-slate-800">{ambassador.phone || 'Non renseigné'}</dd></div></dl>
      {editingAmbassadorId === ambassador.id && <form onSubmit={(event) => void saveProfile(event, ambassador)} className="mt-3 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-700">Nom<input required minLength={2} maxLength={100} value={profileDraft.name} onChange={(event) => setProfileDraft((draft) => ({ ...draft, name: event.target.value }))} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-700">E-mail de connexion<input type="email" maxLength={254} value={profileDraft.email} onChange={(event) => setProfileDraft((draft) => ({ ...draft, email: event.target.value }))} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /><span className="mt-1 block font-normal text-slate-500">Nécessaire pour envoyer un lien d’accès.</span></label>
        <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Téléphone<input type="tel" maxLength={30} value={profileDraft.phone} onChange={(event) => setProfileDraft((draft) => ({ ...draft, phone: event.target.value }))} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm sm:max-w-sm" /></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2"><button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-emerald-900 px-4 text-xs font-bold text-white disabled:opacity-50">Enregistrer le profil</button><button type="button" disabled={busy} onClick={() => setEditingAmbassadorId(null)} className="min-h-10 rounded-lg border border-slate-300 px-4 text-xs font-bold text-slate-700">Annuler</button></div>
      </form>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600"><span className="break-all">{`${window.location.origin}/?ref=${ambassador.code}`}</span><button type="button" title="Copier le lien" aria-label={`Copier le lien de ${ambassador.name}`} onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/?ref=${ambassador.code}`).then(() => setNotice('Lien copié.')).catch(() => setError('Copie impossible.'))} className="rounded border border-slate-300 p-1.5"><Copy className="h-4 w-4" /></button></div>
      <p className="mt-2 text-xs text-slate-600">{ambassador.registrations} inscriptions · {ambassador.published} boutiques publiées · {ambassador.paying} commerçants payants · {money(ambassador.commissions)} de commissions</p>
      <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" disabled={busy || !ambassador.active || !ambassador.email} onClick={() => void createInvite(ambassador.id)} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold disabled:opacity-40">{ambassador.has_account ? 'Créer un lien de réinitialisation' : invitePending ? 'Remplacer le lien d’activation' : 'Créer le lien d’activation'}</button><span className="text-xs text-slate-500">Lien à usage unique, valable 7 jours.</span></div>
      {ambassador.has_account && invitePending && <p className="mt-2 text-xs text-slate-600">L’accès actuel reste actif jusqu’à l’utilisation du nouveau lien ; la réinitialisation révoquera alors les sessions existantes.</p>}
      {inviteLinks[ambassador.id] && !inviteLinks[ambassador.id].emailSent && <div className="mt-2 space-y-1 rounded-lg bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-950">Envoi e-mail indisponible : transmettez ce lien uniquement à l’adresse de l’ambassadeur.</p><div className="flex flex-wrap items-center gap-2"><a href={inviteLinks[ambassador.id].url} target="_blank" rel="noreferrer" className="break-all text-xs font-semibold text-emerald-800 underline">Lien temporaire</a><button type="button" title="Copier le lien temporaire" aria-label={`Copier le lien d’accès de ${ambassador.name}`} onClick={() => void navigator.clipboard.writeText(inviteLinks[ambassador.id].url).then(() => setNotice('Lien copié.')).catch(() => setError('Copie impossible.'))} className="rounded border border-slate-300 p-1.5"><Copy className="h-4 w-4" /></button></div><p className="text-xs text-slate-500">Expire le {new Date(inviteLinks[ambassador.id].expiresAt).toLocaleString('fr-FR')}</p></div>}
    </article>})}</div>
    <div data-admin-panel="commissions" className="space-y-3 border-y border-slate-200 py-4"><h3 className="text-sm font-black text-slate-900">Préparation des versements</h3>
      <div className="flex flex-wrap items-end gap-3"><label className="text-xs font-bold text-slate-700">Mois de versement<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="mt-1 block min-h-10 rounded-lg border border-slate-300 px-3 text-sm" /></label>
        <button type="button" disabled={busy || !month} onClick={() => void exportPayouts()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-bold disabled:opacity-40"><Download className="h-4 w-4" />Exporter CSV</button></div>
      <p className="text-sm font-semibold text-slate-800">{payable.length} prime(s) · {money(payable.reduce((total, referral) => total + Number(referral.amount), 0))}</p>
      <p className="text-xs text-slate-500">Primes actuellement non versées, validées jusqu'à la fin du mois choisi, reports inclus. L'export est actualisé ; vérifiez les paiements avant chaque versement.</p>
    </div>
    <div data-admin-panel="commissions" className="space-y-3"><div className="flex flex-wrap items-end justify-between gap-3"><h3 className="text-sm font-black text-slate-900">Attributions et commissions ({visibleReferrals.length})</h3><label className="text-xs font-bold text-slate-700">État<select value={filter} onChange={(event) => setFilter(event.target.value)} className="mt-1 block min-h-10 rounded-lg border border-slate-300 px-3 text-sm"><option value="pending">À vérifier</option><option value="approved">Validées</option><option value="unpaid">En attente de paiement</option><option value="withdrawal_requested">Retrait demandé</option><option value="paid">Versées</option><option value="cancelled">Annulées</option><option value="refund_review">Remboursement à examiner</option><option value="all">Toutes</option></select></label></div>{visibleReferrals.length === 0 && <p className="text-sm text-slate-500">Aucun dossier dans cette sélection.</p>}
      {visibleReferrals.map((referral) => {
        const sameEmail = referral.owner_email && referral.ambassador_email && referral.owner_email.toLowerCase() === referral.ambassador_email.toLowerCase();
        const samePhone = referral.ambassador_phone && referral.whatsapp_number.replace(/\D/g, '') === referral.ambassador_phone.replace(/\D/g, '');
        return <article key={referral.shop_id} className="border-b border-slate-200 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm text-slate-900">{referral.shop_name}</strong><p className="text-xs text-slate-600">{referral.ambassador_name} · {referral.publication_status === 'active' ? 'Publiée' : 'Non publiée'} · {referral.tier || 'Sans paiement'} · {referral.subscription_term === 'annual' ? 'Annuel' : referral.subscription_term === 'monthly' ? 'Mensuel' : 'Essai'}</p></div><div className="text-sm font-bold">{referral.status ? `${statusLabels[referral.status] || referral.status} · ${money(Number(referral.amount))}` : 'En attente de paiement'}</div></div>
          {(sameEmail || samePhone) && <p className="mt-2 text-xs font-bold text-rose-800">Contact identique à celui du partenaire : vérifier une éventuelle auto-inscription.</p>}
          <p className="mt-1 break-words text-xs text-slate-500">Contact boutique : {referral.owner_email || 'non renseigné'} · {referral.whatsapp_number}</p>
          {decisionReason(referral.decision_details) && <p className="mt-1 break-words text-xs text-slate-600">Motif de la dernière décision : {decisionReason(referral.decision_details)}</p>}
          {referral.paid_at && <p className="mt-2 text-xs text-slate-600">Versée le {new Date(referral.paid_at).toLocaleDateString('fr-FR')} · {referral.payout_reference}</p>}
          {['pending', 'approved'].includes(referral.status || '') && <><p className="mt-2 max-w-xl text-xs text-slate-600">Avant approbation, vérifiez que le commerçant est distinct du partenaire. Une différence d’e-mail et de téléphone ne suffit pas à exclure une auto-inscription; consignez les éléments contrôlés.</p><label className="mt-2 block max-w-xl text-xs font-bold text-slate-700">Motif et vérifications (obligatoire pour approuver ou refuser)<textarea value={reasons[referral.shop_id] || ''} onChange={(event) => setReasons((current) => ({ ...current, [referral.shop_id]: event.target.value }))} maxLength={500} rows={2} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label></>}
          {referral.status === 'approved' && <label className="mt-2 block max-w-sm text-xs font-bold text-slate-700">Référence du versement effectué<input value={references[referral.shop_id] || ''} onChange={(event) => setReferences((current) => ({ ...current, [referral.shop_id]: event.target.value }))} maxLength={160} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" /></label>}
          <div className="mt-2 flex flex-wrap gap-2">{referral.status === 'pending' && <button type="button" disabled={busy || referral.publication_status !== 'active' || referral.payment_status !== 'paid'} onClick={() => void action(referral.shop_id, 'approve')} className="min-h-9 rounded-lg bg-emerald-800 px-3 text-xs font-bold text-white disabled:opacity-40">Valider</button>}{referral.status === 'approved' && <button type="button" disabled={busy || referral.payment_status !== 'paid'} onClick={() => void action(referral.shop_id, 'paid')} className="min-h-9 rounded-lg bg-emerald-800 px-3 text-xs font-bold text-white disabled:opacity-40">Enregistrer le versement</button>}{['pending', 'approved'].includes(referral.status || '') && <button type="button" disabled={busy} onClick={() => void action(referral.shop_id, 'reject')} className="min-h-9 rounded-lg border border-rose-300 px-3 text-xs font-bold text-rose-800">Refuser</button>}</div>
        </article>;
      })}
    </div>
    <div data-admin-panel="withdrawals" className="space-y-3 border-y border-slate-200 py-4"><div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-sm font-black text-slate-900">Demandes de retrait ({withdrawals.length})</h3><p className="mt-1 text-xs text-slate-500">Les transferts restent manuels. Vérifiez le numéro et le portefeuille avant paiement.</p></div><p className="text-sm font-bold text-slate-800">À payer · {money(withdrawals.filter((withdrawal) => withdrawal.status === 'approved').reduce((total, withdrawal) => total + Number(withdrawal.amount), 0))}</p></div>
      {withdrawals.length === 0 ? <p className="border-t border-slate-200 py-5 text-sm text-slate-500">Aucune demande de retrait.</p> : withdrawals.map((withdrawal) => <article key={withdrawal.id} className="border-t border-slate-200 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-sm font-bold text-slate-900">{withdrawal.ambassador_name} · {money(Number(withdrawal.amount))}</h4><p className="mt-1 text-xs text-slate-600">{payoutMethodLabels[withdrawal.payout_method] || withdrawal.payout_method} · {withdrawal.payout_phone} · Demandé le {new Date(withdrawal.created_at).toLocaleDateString('fr-FR')}</p>{withdrawal.ambassador_email && <p className="mt-1 text-xs text-slate-500">{withdrawal.ambassador_email}</p>}</div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{withdrawalStatusLabels[withdrawal.status]}</span></div>
        {withdrawal.admin_reason && <p className="mt-2 text-xs text-rose-800">Motif : {withdrawal.admin_reason}</p>}
        {withdrawal.status === 'requested' && <div className="mt-3 space-y-2"><label className="block max-w-xl text-xs font-semibold text-slate-700">Motif (obligatoire en cas de refus)<textarea value={withdrawalReasons[withdrawal.id] || ''} onChange={(event) => setWithdrawalReasons((current) => ({ ...current, [withdrawal.id]: event.target.value }))} maxLength={500} rows={2} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void processWithdrawal(withdrawal, 'approve')} className="min-h-9 rounded-lg bg-emerald-800 px-3 text-xs font-bold text-white disabled:opacity-40">Valider la demande</button><button type="button" disabled={busy} onClick={() => void processWithdrawal(withdrawal, 'reject')} className="min-h-9 rounded-lg border border-rose-300 px-3 text-xs font-bold text-rose-800 disabled:opacity-40">Refuser</button></div></div>}
        {withdrawal.status === 'approved' && <div className="mt-3 flex flex-wrap items-end gap-2"><label className="block min-w-56 flex-1 text-xs font-semibold text-slate-700">Référence du transfert effectué<input value={withdrawalReferences[withdrawal.id] || ''} onChange={(event) => setWithdrawalReferences((current) => ({ ...current, [withdrawal.id]: event.target.value }))} maxLength={160} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" /></label><button type="button" disabled={busy} onClick={() => void processWithdrawal(withdrawal, 'paid')} className="min-h-10 rounded-lg bg-emerald-800 px-3 text-xs font-bold text-white disabled:opacity-40">Enregistrer le paiement</button><button type="button" disabled={busy} onClick={() => void processWithdrawal(withdrawal, 'reject')} className="min-h-10 rounded-lg border border-rose-300 px-3 text-xs font-bold text-rose-800 disabled:opacity-40">Refuser</button></div>}
        {withdrawal.status === 'paid' && <p className="mt-2 text-xs text-emerald-800">Payé le {withdrawal.processed_at ? new Date(withdrawal.processed_at).toLocaleDateString('fr-FR') : 'date inconnue'} · Réf. {withdrawal.payout_reference}</p>}
      </article>)}
    </div>
    <div data-admin-panel="payouts" className="space-y-3"><h3 className="text-sm font-black text-slate-900">Historique des versements</h3>{payouts.length === 0 && <p className="text-sm text-slate-500">Aucun versement enregistré.</p>}{payouts.map((payout) => <div key={payout.id} className="border-b border-slate-200 py-2 text-sm text-slate-700"><strong>{payout.ambassador_name}</strong> · {payout.shop_name} · {money(Number(payout.amount))}<p className="break-words text-xs text-slate-500">{new Date(payout.paid_at).toLocaleDateString('fr-FR')} · {payout.reference}</p></div>)}</div>
  </section>;
}