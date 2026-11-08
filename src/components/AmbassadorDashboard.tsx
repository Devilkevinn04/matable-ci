import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Copy, CreditCard, Download, Eye, EyeOff, LayoutDashboard, LogOut, Mail, MessageCircle, Search, Share2, ShieldCheck, Store, Users, Wallet } from 'lucide-react';
import { stringifyCsv } from '../utils/csv';
import { getSupportWhatsAppUrl } from '../utils/supportWhatsApp';

interface DashboardData {
  ambassador: { name: string; email: string; code: string };
  summary: {
    registrations: number | string; published: number | string; paying: number | string;
    total_commissions: number | string; pending_commissions: number | string;
    approved_commissions: number | string; paid_commissions: number | string;
    available_commissions: number | string; withdrawal_commissions: number | string;
  };
  referrals: Array<{
    shop_name: string; created_at: string; publication_status: string; tier: string | null;
    subscription_term: string | null; payment_status: string | null; commission_amount: number | null;
    commission_status: string | null; commission_created_at: string | null; approved_at: string | null; paid_at: string | null;
  }>;
  payouts: Array<{ shop_name: string; amount: number; reference: string; paid_at: string }>;
  withdrawals: Array<{
    id: string; amount: number; status: 'requested' | 'approved' | 'rejected' | 'paid';
    payout_method: string; payout_phone: string; created_at: string; processed_at: string | null;
    payout_reference: string | null; admin_reason: string | null;
  }>;
}

const money = (value: number | string | null | undefined) => `${new Intl.NumberFormat('fr-FR').format(Number(value) || 0)} FCFA`;
const commissionLabels: Record<string, string> = {
  pending: 'En cours de vérification', approved: 'Validée, en attente de versement',
  paid: 'Versée', cancelled: 'Non éligible', refund_review: 'Remboursement à examiner',
};
type ReferralFilter = 'all' | 'awaiting_payment' | 'pending' | 'approved' | 'paid' | 'refund_review' | 'cancelled';
type AmbassadorTab = 'overview' | 'shops' | 'withdrawals' | 'sharing' | 'account';
type PayoutMethod = 'wave' | 'orange_money' | 'mtn_momo' | 'moov_money';
const withdrawalLabels: Record<DashboardData['withdrawals'][number]['status'], string> = {
  requested: 'En attente de validation', approved: 'Validée, en attente de transfert',
  rejected: 'Refusée', paid: 'Payée',
};
const payoutMethodLabels: Record<PayoutMethod, string> = {
  wave: 'Wave', orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', moov_money: 'Moov Money',
};

export function AmbassadorDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const isActivation = location.pathname === '/ambassadeur/activer';
  const activationToken = new URLSearchParams(location.search).get('token') || '';
  const supportWhatsAppUrl = getSupportWhatsAppUrl('Bonjour, j’ai besoin d’aide pour accéder à mon espace ambassadeur MaTable.');
  const supportUrl = supportWhatsAppUrl || 'mailto:assistance@matable-ci.com?subject=Acc%C3%A8s%20ambassadeur%20MaTable';
  const supportLabel = supportWhatsAppUrl ? 'Contacter l’assistance sur WhatsApp' : 'Écrire à l’assistance';
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('');
  const [activeTab, setActiveTab] = useState<AmbassadorTab>('overview');
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>('wave');
  const [payoutPhone, setPayoutPhone] = useState('');
  const [requestingWithdrawal, setRequestingWithdrawal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [referralFilter, setReferralFilter] = useState<ReferralFilter>('all');
  const [dateRange, setDateRange] = useState<'all' | '30' | '90'>('all');
  const [referralPage, setReferralPage] = useState(0);
  const [showAmounts, setShowAmounts] = useState(true);

  const loadDashboard = async () => {
    const response = await fetch('/api/ambassador-auth/dashboard', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) {
      setDashboard(null);
      return false;
    }
    setDashboard(await response.json() as DashboardData);
    setNotice('');
    return true;
  };
  useEffect(() => {
    if (isActivation) { setChecking(false); return; }
    setChecking(true);
    void fetch('/api/ambassador-auth/session', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const session = await response.json() as { authenticated?: boolean };
        if (response.ok && session.authenticated) await loadDashboard();
        else setDashboard(null);
      })
      .catch(() => setDashboard(null))
      .finally(() => setChecking(false));
  }, [isActivation]);

  const submitCredentials = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/ambassador-auth/${isActivation ? 'activate' : 'login'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(isActivation ? { token: activationToken, password } : { email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Connexion impossible.');
      if (isActivation) {
        setNotice('Compte activé. Ouverture de votre espace…');
        navigate('/ambassadeur', { replace: true });
      } else {
        if (!await loadDashboard()) throw new Error('La session n’a pas pu être ouverte. Réessayez.');
      }
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Opération impossible.'); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    await fetch('/api/ambassador-auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
    setDashboard(null); setPassword(''); setNotice('');
  };
  const copyReferralLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?ref=${encodeURIComponent(dashboard?.ambassador.code || '')}`);
      setNotice('Lien de recommandation copié.');
    } catch { setError('Copie impossible dans ce navigateur.'); }
  };
  const copyReferralCode = async () => {
    try {
      await navigator.clipboard.writeText(dashboard?.ambassador.code || '');
      setNotice('Code ambassadeur copié.');
    } catch { setError('Copie impossible dans ce navigateur.'); }
  };
  const shareReferralLink = async () => {
    const url = `${window.location.origin}/?ref=${encodeURIComponent(dashboard?.ambassador.code || '')}`;
    const text = 'Découvrez MaTable.ci et créez la vitrine de votre commerce en ligne.';
    setError('');
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'MaTable.ci', text, url });
        return;
      } catch (problem) {
        if (problem instanceof Error && problem.name === 'AbortError') return;
        setError('Le partage a échoué. Vous pouvez copier le lien à la place.');
        return;
      }
    }
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    setNotice('Message préparé pour WhatsApp. Si la fenêtre ne s’ouvre pas, copiez le lien directement.');
  };
  const cancelWithdrawal = async (withdrawalId: string) => {
    if (!window.confirm('Annuler cette demande avant sa validation ? Le solde redeviendra disponible.')) return;
    setRequestingWithdrawal(true); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/ambassador-auth/withdrawals/${withdrawalId}/cancel`, { method: 'POST', credentials: 'include' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible d’annuler cette demande.');
      await loadDashboard();
      setNotice('Demande annulée. Le solde validé est de nouveau disponible.');
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Impossible d’annuler cette demande.'); }
    finally { setRequestingWithdrawal(false); }
  };
  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    if (newPassword !== newPasswordConfirmation) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.'); setBusy(false); return;
    }
    try {
      const response = await fetch('/api/ambassador-auth/password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible de modifier le mot de passe.');
      setCurrentPassword(''); setNewPassword(''); setNewPasswordConfirmation('');
      setNotice('Mot de passe modifié. Les autres appareils ont été déconnectés.');
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Impossible de modifier le mot de passe.'); }
    finally { setBusy(false); }
  };
  const requestWithdrawal = async (event: React.FormEvent) => {
    event.preventDefault(); setRequestingWithdrawal(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/ambassador-auth/withdrawals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ payout_method: payoutMethod, payout_phone: payoutPhone.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible de demander le retrait.');
      setPayoutPhone('');
      await loadDashboard();
      setActiveTab('withdrawals');
      setNotice(`Demande de retrait de ${money(result.withdrawal.amount)} envoyée pour validation.`);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Impossible de demander le retrait.'); }
    finally { setRequestingWithdrawal(false); }
  };
  const formatAmount = (value: number | string | null | undefined) => showAmounts ? money(value) : '••••';
  const searchTerm = search.trim().toLocaleLowerCase('fr');
  const matchesSearch = (shopName: string, tier = '') => `${shopName} ${tier}`.toLocaleLowerCase('fr').includes(searchTerm);
  const matchesDate = (date: string) => dateRange === 'all' || Date.parse(date) >= Date.now() - Number(dateRange) * 86400000;

  const matchingReferrals = (dashboard?.referrals || []).filter((referral) => {
    const status = referral.commission_status || 'awaiting_payment';
    const matchesStatus = referralFilter === 'all' || status === referralFilter;
    return matchesSearch(referral.shop_name, referral.tier || '') && matchesStatus && matchesDate(referral.created_at);
  });
  const referralPageCount = Math.max(1, Math.ceil(matchingReferrals.length / 10));
  const safeReferralPage = Math.min(referralPage, referralPageCount - 1);
  const visibleReferrals = matchingReferrals.slice(safeReferralPage * 10, (safeReferralPage + 1) * 10);
  const visiblePayouts = (dashboard?.payouts || []).filter((payout) =>
    matchesSearch(payout.shop_name) && matchesDate(payout.paid_at) && (referralFilter === 'all' || referralFilter === 'paid'));
  const exportReport = () => {
    if (!dashboard) return;
    const rows = [
      ['Type', 'Boutique', 'Date', 'Publication', 'Formule', 'Paiement', 'État de la prime', 'Montant FCFA', 'Référence', 'Date de versement'],
      ...matchingReferrals.map((referral) => [
        'Inscription', referral.shop_name, referral.created_at,
        referral.publication_status === 'active' ? 'Publiée' : 'En cours',
        referral.tier ? `${referral.tier} · ${referral.subscription_term === 'annual' ? 'annuel' : 'mensuel'}` : '',
        referral.payment_status || 'Aucun paiement',
        referral.commission_status ? commissionLabels[referral.commission_status] || referral.commission_status : 'En attente du premier paiement',
        referral.commission_amount, '', referral.paid_at,
      ]),
      ...visiblePayouts.map((payout) => ['Versement', payout.shop_name, payout.paid_at, '', '', '', 'Versée', payout.amount, payout.reference, payout.paid_at]),
    ];
    const url = URL.createObjectURL(new Blob([`\uFEFF${stringifyCsv(rows)}`], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url; link.download = `matable-ambassadeur-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    URL.revokeObjectURL(url);
    setNotice('Votre rapport a été exporté.');
  };

  const numericSummary = dashboard?.summary;
  const tabs: { id: AmbassadorTab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: 'Aperçu', icon: LayoutDashboard },
    { id: 'shops', label: 'Boutiques', icon: Store },
    { id: 'withdrawals', label: 'Gains', icon: Wallet },
    { id: 'sharing', label: 'Partager', icon: Share2 },
    { id: 'account', label: 'Compte', icon: ShieldCheck },
  ];
  const availableBalance = Number(numericSummary?.available_commissions) || 0;
  const withdrawals = dashboard?.withdrawals || [];
  const openWithdrawal = withdrawals.find((withdrawal) => ['requested', 'approved'].includes(withdrawal.status));
  if (checking) return <main className="grid min-h-screen place-items-center bg-[#f7f5f2] p-6"><p role="status" className="text-sm font-semibold text-slate-600">Chargement de votre espace…</p></main>;

  if (!dashboard) return <main className="min-h-screen bg-[#f7f5f2] px-4 py-8 sm:px-6 sm:py-12">
    <div className="mx-auto max-w-md">
      <header className="mb-7"><a href="/" className="text-sm font-black text-emerald-900">MaTable.ci</a><p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Partenariats</p><h1 className="mt-2 text-3xl font-black text-slate-950">Espace ambassadeur</h1><p className="mt-3 text-sm leading-6 text-slate-600">Suivez les boutiques que vous avez recommandées et l’état de vos primes.</p></header>
      <section className="rounded-2xl border border-slate-200 bg-white px-4 py-6 shadow-sm sm:px-6" aria-labelledby="ambassador-auth-title">
        <h2 id="ambassador-auth-title" className="text-lg font-black text-slate-900">{isActivation ? 'Activez votre accès' : 'Connexion'}</h2>
        <p className="mt-1 text-sm text-slate-600">{isActivation ? 'Choisissez un mot de passe personnel pour sécuriser votre espace.' : 'Connectez-vous avec l’adresse e-mail associée à votre partenariat.'}</p>
        <form onSubmit={(event) => void submitCredentials(event)} className="mt-5 space-y-4">
          {isActivation && !activationToken && <p role="alert" className="text-sm font-semibold text-rose-800">Lien d’activation manquant. Demandez un nouveau lien au support MaTable.</p>}
          {!isActivation && <label className="block text-sm font-semibold text-slate-700">E-mail<input required type="email" autoComplete="username" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900" /></label>}
          <label className="block text-sm font-semibold text-slate-700">{isActivation ? 'Nouveau mot de passe' : 'Mot de passe'}<span className="relative mt-1.5 block"><input required type={showPassword ? 'text' : 'password'} autoComplete={isActivation ? 'new-password' : 'current-password'} minLength={isActivation ? 12 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 pr-12 text-sm font-normal text-slate-900" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={showPassword} className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-lg text-slate-500 hover:bg-slate-50">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>
          {isActivation && <label className="block text-sm font-semibold text-slate-700">Confirmer le mot de passe<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900" /></label>}
          {isActivation && password && confirmation && password !== confirmation && <p className="text-xs font-semibold text-rose-800">Les deux mots de passe ne correspondent pas.</p>}
          {!isActivation && <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><a href={getSupportWhatsAppUrl(`Bonjour, j’ai oublié mon mot de passe de l’espace ambassadeur. Mon adresse e-mail est ${email || '[votre e-mail]'}.`) || `mailto:assistance@matable-ci.com?subject=R%C3%A9initialisation%20de%20mon%20acc%C3%A8s%20ambassadeur&body=${encodeURIComponent(`Bonjour, j’ai oublié mon mot de passe ambassadeur. Mon adresse e-mail est ${email || '[votre e-mail]'}.`)}`} target="_blank" rel="noreferrer" className="font-semibold text-emerald-900 underline underline-offset-2">Mot de passe oublié ?</a></div>}
          {error && <p role="alert" className="text-sm font-semibold text-rose-800">{error}</p>}{notice && <p role="status" className="text-sm font-semibold text-emerald-800">{notice}</p>}
          <button type="submit" disabled={busy || (isActivation && (!activationToken || password !== confirmation))} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-900 px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Veuillez patienter…' : isActivation ? 'Activer mon compte' : 'Se connecter'}<ArrowRight className="h-4 w-4" /></button>
        </form>
        <p className="mt-4 text-xs leading-5 text-slate-500">{isActivation ? 'Le lien est à usage unique et expire après 7 jours. Utilisez un mot de passe d’au moins 12 caractères.' : 'Votre session reste active pendant 8 heures. Pour créer votre accès ou obtenir de l’aide, contactez l’assistance.'}</p>
        <a href={supportUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-emerald-900 underline underline-offset-2">{supportWhatsAppUrl ? <MessageCircle className="h-4 w-4" /> : <Mail className="h-4 w-4" />}{isActivation ? 'Contacter l’assistance' : 'Demander un lien d’accès'}</a>
        {isActivation && <a href="/ambassadeur" className="mt-3 block min-h-10 text-sm font-semibold text-slate-600 underline underline-offset-2">Retour à la connexion</a>}
      </section>
    </div>
  </main>;

  const metrics = [
    { label: 'Inscriptions attribuées', value: numericSummary?.registrations, icon: Users },
    { label: 'Boutiques publiées', value: numericSummary?.published, icon: Store },
    { label: 'Commerçants payants', value: numericSummary?.paying, icon: CreditCard },
    { label: 'Primes versées', value: money(numericSummary?.paid_commissions), icon: Wallet },
  ];
  return <main data-dashboard-tab={activeTab} className="ambassador-dashboard min-h-screen bg-[radial-gradient(circle_at_top,_rgba(12,109,89,0.12),_transparent_42%),_#f5f3ee]">
    <header className="bg-[linear-gradient(135deg,#0d2f2b_0%,#123b32_42%,#0f4840_100%)] text-white shadow-[0_18px_50px_rgba(10,27,24,0.18)]">
      <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-5 px-4 py-6 sm:px-6 sm:py-9">
        <div><a href="/" className="text-sm font-black text-white">MaTable.ci</a><p className="mt-5 text-[11px] font-black uppercase tracking-[0.18em] text-[#f2bd72]">Espace ambassadeur</p><h1 className="mt-2 text-2xl font-black sm:text-3xl">Bonjour, {dashboard.ambassador.name}</h1><p className="mt-1 text-sm text-white/75">{dashboard.ambassador.email}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" title={showAmounts ? 'Masquer les montants' : 'Afficher les montants'} aria-label={showAmounts ? 'Masquer les montants' : 'Afficher les montants'} aria-pressed={!showAmounts} onClick={() => setShowAmounts((visible) => !visible)} className="grid h-10 w-10 place-items-center rounded-lg border border-white/15 bg-white/5 text-white transition hover:bg-white/10">{showAmounts ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          <button type="button" onClick={() => void logout()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-sm font-bold text-[#123b32] shadow-[0_8px_20px_rgba(255,255,255,0.18)]"><LogOut className="h-4 w-4" />Déconnexion</button>
        </div>
      </div>
    </header>
    <nav role="tablist" aria-label="Espaces ambassadeur" className="fixed inset-x-0 bottom-0 z-30 isolate border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] sm:sticky sm:top-0 sm:bottom-auto sm:border-b sm:border-t-0 sm:bg-[#f7f5f2]/95 sm:shadow-none sm:backdrop-blur-xl">
      <div className="mx-auto max-w-5xl px-1 sm:overflow-x-auto sm:px-6">
        <div className="grid w-full grid-cols-5 sm:flex sm:min-w-max sm:items-center sm:gap-6">{tabs.map(({ id, label, icon: Icon }) => <button key={id} id={`ambassador-tab-${id}`} type="button" role="tab" tabIndex={activeTab === id ? 0 : -1} aria-selected={activeTab === id} aria-controls={activeTab === id ? `ambassador-panel-${id}` : undefined} onKeyDown={(event) => {
        const currentIndex = tabs.findIndex((tab) => tab.id === id);
        const nextIndex = event.key === 'ArrowRight' ? (currentIndex + 1) % tabs.length
          : event.key === 'ArrowLeft' ? (currentIndex - 1 + tabs.length) % tabs.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : currentIndex;
        if (nextIndex === currentIndex) return;
        event.preventDefault();
        const nextTab = tabs[nextIndex];
        setActiveTab(nextTab.id);
        document.getElementById(`ambassador-tab-${nextTab.id}`)?.focus();
      }} onClick={() => setActiveTab(id)} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-0 px-0.5 text-[10px] font-semibold transition-colors sm:min-h-12 sm:flex-row sm:gap-2 sm:rounded-none sm:border-b-2 sm:px-1 sm:text-sm ${activeTab === id ? 'bg-emerald-50 text-emerald-950 sm:border-emerald-900 sm:bg-transparent' : 'bg-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-900 sm:border-transparent sm:hover:border-slate-300 sm:hover:bg-transparent'}`}><Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0 sm:h-4 sm:w-4" /><span className="truncate">{label}</span></button>)}</div>
      </div>
    </nav>
    <div id={`ambassador-panel-${activeTab}`} role="tabpanel" aria-labelledby={`ambassador-tab-${activeTab}`} tabIndex={0} className="mx-auto max-w-5xl space-y-7 px-4 pb-24 pt-5 outline-none sm:px-6 sm:pb-8 sm:pt-8">
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">{error}</p>}{notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{notice}</p>}
      {activeTab === 'withdrawals' && openWithdrawal?.status === 'requested' && <button type="button" disabled={requestingWithdrawal} onClick={() => void cancelWithdrawal(openWithdrawal.id)} className="min-h-9 rounded-lg border border-rose-300 bg-rose-50 px-3 text-xs font-bold text-rose-800 shadow-sm transition hover:bg-rose-100 disabled:opacity-50">Annuler la demande en cours</button>}
      {activeTab === 'overview' && <>
        <section aria-label="Vos résultats" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(({ label, value, icon: Icon }) => <article key={label} className="ambassador-stat-card flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#eaf7f3] text-emerald-900"><Icon className="h-5 w-5" /></span><div><p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p><p className="mt-1 text-xl font-black tabular-nums text-slate-950">{label === 'Primes versées' ? (showAmounts ? value : '••••') : Number(value) || 0}</p></div></article>)}</section>
        <section aria-labelledby="commission-summary-title" className="ambassador-panel grid gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] sm:grid-cols-3"><h2 id="commission-summary-title" className="sr-only">État des commissions</h2><p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">En vérification <strong className="ml-1 text-slate-950">{formatAmount(numericSummary?.pending_commissions)}</strong></p><p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">Validées, à retirer <strong className="ml-1 text-slate-950">{formatAmount(numericSummary?.available_commissions)}</strong></p><p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">Total des primes générées <strong className="ml-1 text-slate-950">{formatAmount(numericSummary?.total_commissions)}</strong></p><p className="text-xs leading-5 text-slate-500 sm:col-span-3">Une prime est unique et concerne le premier abonnement payé. Elle devient retirable après confirmation, publication et vérification.</p></section>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setActiveTab('withdrawals')} className="ambassador-primary-btn min-h-10 rounded-xl bg-[#123b32] px-4 text-sm font-bold text-white shadow-[0_12px_28px_rgba(18,59,50,0.18)]">Voir mes retraits</button><button type="button" onClick={() => setActiveTab('sharing')} className="ambassador-secondary-btn min-h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800">Partager mon lien</button></div>
      </>}
      {activeTab === 'sharing' && <section aria-labelledby="referral-title" className="ambassador-panel rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]"><div><p className="text-[11px] font-black uppercase tracking-[0.15em] text-emerald-800">Faire connaître MaTable</p><h2 id="referral-title" className="mt-2 text-xl font-black text-slate-950">Votre lien de recommandation</h2><p className="mt-1 text-sm text-slate-600">Partagez ce lien aux commerçants que vous accompagnez.</p></div><div className="mt-4 rounded-2xl border border-emerald-900/15 bg-[#ebfaf5] px-4 py-5 sm:px-5"><p className="break-all text-sm font-semibold text-emerald-950">{window.location.origin}/?ref={dashboard.ambassador.code}</p><p className="mt-2 text-xs text-emerald-800">Code personnel : <strong>{dashboard.ambassador.code}</strong></p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void shareReferralLink()} className="ambassador-primary-btn inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#123b32] px-3 text-sm font-bold text-white"><MessageCircle className="h-4 w-4" />Partager</button><button type="button" onClick={() => void copyReferralLink()} className="ambassador-secondary-btn inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-900/25 bg-white px-3 text-sm font-bold text-emerald-950"><Copy className="h-4 w-4" />Copier le lien</button><button type="button" onClick={() => void copyReferralCode()} className="ambassador-secondary-btn inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-900/25 bg-white px-3 text-sm font-bold text-emerald-950"><Copy className="h-4 w-4" />Copier le code</button></div></div></section>}
      <section data-ambassador-panel="withdrawals" aria-labelledby="withdrawal-request-title" className="ambassador-panel rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]"><div><p className="text-[11px] font-black uppercase tracking-[0.15em] text-emerald-800">Gestion des gains</p><h2 id="withdrawal-request-title" className="mt-2 text-xl font-black text-slate-950">Retraits</h2><p className="mt-1 text-sm text-slate-600">Demandez le transfert de toutes vos commissions validées. Chaque demande est contrôlée par l’équipe MaTable.</p></div>
        <div className="mt-4 grid gap-3 rounded-2xl border border-emerald-900/15 bg-[#ebfaf5] p-4 sm:grid-cols-3"><div><p className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-900">Disponible au retrait</p><p className="mt-1 text-xl font-black tabular-nums text-emerald-950">{formatAmount(availableBalance)}</p></div><div><p className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-900">En demande</p><p className="mt-1 text-xl font-black tabular-nums text-emerald-950">{formatAmount(numericSummary?.withdrawal_commissions)}</p></div><div><p className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-900">Déjà versé</p><p className="mt-1 text-xl font-black tabular-nums text-emerald-950">{formatAmount(numericSummary?.paid_commissions)}</p></div></div>
        {openWithdrawal ? <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4"><p className="text-sm font-bold text-amber-950">Une demande de retrait est en cours.</p><p className="mt-1 text-sm text-amber-900">{formatAmount(openWithdrawal.amount)} · {withdrawalLabels[openWithdrawal.status]} · {new Date(openWithdrawal.created_at).toLocaleDateString('fr-FR')}</p><p className="mt-1 text-xs text-amber-900">Portefeuille : {payoutMethodLabels[openWithdrawal.payout_method as PayoutMethod] || openWithdrawal.payout_method} · {openWithdrawal.payout_phone}</p></div> : availableBalance > 0 ? <form onSubmit={(event) => void requestWithdrawal(event)} className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-700">Portefeuille mobile money<select required value={payoutMethod} onChange={(event) => setPayoutMethod(event.target.value as PayoutMethod)} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">{Object.entries(payoutMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-semibold text-slate-700">Numéro de réception<input required type="tel" inputMode="tel" autoComplete="tel" value={payoutPhone} onChange={(event) => setPayoutPhone(event.target.value)} placeholder="+225 07 00 00 00 00" className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" /></label><div className="sm:col-span-2"><button type="submit" disabled={requestingWithdrawal || !payoutPhone.trim()} className="ambassador-primary-btn inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-900 px-4 text-sm font-bold text-white disabled:opacity-40">{requestingWithdrawal ? 'Envoi…' : `Demander le retrait de ${formatAmount(availableBalance)}`}</button><p className="mt-2 text-xs leading-5 text-slate-500">Le montant demandé correspond à tout le solde validé. Le transfert n’est pas automatique ; MaTable le traite après vérification.</p></div></form> : <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">Aucune commission n’est disponible pour le retrait. Les primes deviennent disponibles après validation.</p>}        <div><h3 className="text-sm font-black text-slate-900">Historique des demandes</h3>{withdrawals.length === 0 ? <p className="mt-2 text-sm text-slate-600">Aucune demande de retrait pour le moment.</p> : <div className="mt-2 divide-y divide-slate-200">{withdrawals.map((withdrawal) => <article key={withdrawal.id} className="flex flex-wrap items-start justify-between gap-3 py-3"><div><p className="text-sm font-bold text-slate-900">{formatAmount(withdrawal.amount)} · {withdrawalLabels[withdrawal.status]}</p><p className="mt-1 text-xs text-slate-600">{payoutMethodLabels[withdrawal.payout_method as PayoutMethod] || withdrawal.payout_method} · {withdrawal.payout_phone} · Demandé le {new Date(withdrawal.created_at).toLocaleDateString('fr-FR')}</p>{withdrawal.payout_reference && <p className="mt-1 text-xs text-emerald-800">Référence : {withdrawal.payout_reference}</p>}{withdrawal.admin_reason && <p className="mt-1 text-xs text-rose-800">Motif : {withdrawal.admin_reason}</p>}</div>{withdrawal.processed_at && <time className="text-xs text-slate-500">Traité le {new Date(withdrawal.processed_at).toLocaleDateString('fr-FR')}</time>}</article>)}</div>}</div>
      </section>
      {activeTab === 'overview' && <section className="border-t border-slate-200 pt-4"><h2 className="text-sm font-black text-slate-900">Dernières boutiques recommandées</h2><p className="mt-1 text-xs text-slate-500">Les coordonnées privées des commerçants restent confidentielles.</p>{dashboard.referrals.length === 0 ? <p className="mt-3 text-sm text-slate-600">Aucune inscription attribuée pour le moment.</p> : <div className="mt-2 divide-y divide-slate-200">{dashboard.referrals.slice(0, 3).map((referral, index) => <article key={`${referral.shop_name}-${referral.created_at}-${index}`} className="flex flex-wrap justify-between gap-2 py-3"><div><p className="text-sm font-bold text-slate-900">{referral.shop_name}</p><p className="mt-1 text-xs text-slate-600">{referral.publication_status === 'active' ? 'Boutique publiée' : 'Publication en cours'} · {new Date(referral.created_at).toLocaleDateString('fr-FR')}</p></div><span className="text-xs font-semibold text-slate-600">{referral.commission_status ? commissionLabels[referral.commission_status] || referral.commission_status : 'En attente du paiement'}</span></article>)}</div>}{dashboard.referrals.length > 3 && <button type="button" onClick={() => setActiveTab('shops')} className="mt-2 text-sm font-bold text-emerald-900 underline underline-offset-2">Voir les {dashboard.referrals.length} boutiques</button>}</section>}
      {activeTab === 'shops' && <section aria-labelledby="referrals-title">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 id="referrals-title" className="text-lg font-black text-slate-950">Boutiques recommandées</h2><p className="mt-1 text-xs text-slate-500">Les coordonnées privées des commerçants ne sont pas affichées.</p></div><span className="text-xs font-semibold text-slate-500">{matchingReferrals.length} boutique(s) dans cette sélection</span></div>
        <div className="mt-4 grid gap-2 border-y border-slate-200 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <label className="relative block"><span className="sr-only">Rechercher une boutique</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une boutique" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900" /></label>
          <label className="block text-xs font-semibold text-slate-600"><span className="sr-only">Filtrer par état</span><select aria-label="Filtrer par état" value={referralFilter} onChange={(event) => setReferralFilter(event.target.value as ReferralFilter)} className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800"><option value="all">Tous les états</option><option value="awaiting_payment">En attente de paiement</option><option value="pending">En vérification</option><option value="approved">Validée, à verser</option><option value="paid">Versée</option><option value="refund_review">Remboursement à examiner</option><option value="cancelled">Non éligible</option></select></label>
          <label className="block text-xs font-semibold text-slate-600"><span className="sr-only">Filtrer par période</span><select aria-label="Filtrer par période" value={dateRange} onChange={(event) => setDateRange(event.target.value as typeof dateRange)} className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800"><option value="all">Toutes les dates</option><option value="30">30 derniers jours</option><option value="90">90 derniers jours</option></select></label>
          <button type="button" onClick={exportReport} disabled={visibleReferrals.length + visiblePayouts.length === 0} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 disabled:opacity-40"><Download className="h-4 w-4" />Exporter CSV</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">L’export reprend les filtres choisis et n’inclut que vos données.</p>
        {dashboard.referrals.length === 0 ? <p className="mt-4 border-b border-slate-200 py-6 text-sm text-slate-600">Aucune inscription attribuée pour le moment.</p> : visibleReferrals.length === 0 ? <div className="mt-4 border-b border-slate-200 py-6 text-sm text-slate-600"><p>Aucune boutique ne correspond à ces critères.</p><button type="button" onClick={() => { setSearch(''); setReferralFilter('all'); setDateRange('all'); }} className="mt-2 font-bold text-emerald-900 underline underline-offset-2">Effacer les filtres</button></div> : <div className="mt-2 divide-y divide-slate-200">{visibleReferrals.map((referral, index) => <article key={`${referral.shop_name}-${referral.created_at}-${index}`} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><h3 className="text-sm font-bold text-slate-900">{referral.shop_name}</h3><p className="mt-1 text-xs text-slate-600">Inscription le {new Date(referral.created_at).toLocaleDateString('fr-FR')} · {referral.publication_status === 'active' ? 'Boutique publiée' : 'Publication en cours'}</p><p className="mt-1 text-xs text-slate-600">{referral.tier ? `${referral.tier === 'pro' ? 'Pro' : referral.tier === 'premium' ? 'Premium' : 'Standard'} · ${referral.subscription_term === 'annual' ? 'annuel' : 'mensuel'}` : 'Aucun abonnement payé'}</p></div><div className="sm:text-right"><p className="text-xs font-semibold text-slate-700">{referral.commission_status ? commissionLabels[referral.commission_status] || referral.commission_status : 'En attente du premier paiement'}</p>{referral.commission_amount != null && <p className="mt-1 text-sm font-black tabular-nums text-slate-950">{formatAmount(referral.commission_amount)}</p>}</div></article>)}</div>}
        {matchingReferrals.length > 10 && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3"><p className="text-xs text-slate-600">Page {safeReferralPage + 1} sur {referralPageCount} · {matchingReferrals.length} boutique(s)</p><div className="flex gap-2"><button type="button" disabled={safeReferralPage === 0} onClick={() => setReferralPage((page) => Math.max(0, page - 1))} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold disabled:opacity-40">Précédent</button><button type="button" disabled={safeReferralPage >= referralPageCount - 1} onClick={() => setReferralPage((page) => Math.min(referralPageCount - 1, page + 1))} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold disabled:opacity-40">Suivant</button></div></div>}
      </section>}
      <section aria-labelledby="payouts-title"><div className="flex flex-wrap items-end justify-between gap-2"><h2 id="payouts-title" className="text-lg font-black text-slate-950">Historique des versements</h2><span className="text-xs font-semibold text-slate-500">{visiblePayouts.length} sur {dashboard.payouts.length}</span></div>{dashboard.payouts.length === 0 ? <p className="mt-3 border-y border-slate-200 py-5 text-sm text-slate-600">Les versements confirmés apparaîtront ici.</p> : visiblePayouts.length === 0 ? <p className="mt-3 border-y border-slate-200 py-5 text-sm text-slate-600">Aucun versement ne correspond à ces filtres.</p> : <div className="mt-2 divide-y divide-slate-200">{visiblePayouts.map((payout, index) => <div key={`${payout.reference}-${index}`} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="text-slate-700">{payout.shop_name} · {new Date(payout.paid_at).toLocaleDateString('fr-FR')} · réf. {payout.reference}</span><strong className="text-slate-950">{formatAmount(payout.amount)}</strong></div>)}</div>}</section>
      {activeTab === 'account' && <>
        <section aria-labelledby="account-profile-title" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">Votre profil</p>
          <h2 id="account-profile-title" className="mt-1 text-xl font-black text-slate-950">Informations du compte</h2>
          <dl className="mt-5 divide-y divide-slate-100">
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4"><dt className="text-xs font-semibold text-slate-500">Nom</dt><dd className="text-sm font-semibold text-slate-900">{dashboard.ambassador.name}</dd></div>
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4"><dt className="text-xs font-semibold text-slate-500">Adresse e-mail</dt><dd className="break-all text-sm font-semibold text-slate-900">{dashboard.ambassador.email}</dd></div>
            <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4"><dt className="text-xs font-semibold text-slate-500">Code ambassadeur</dt><dd className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-900"><span>{dashboard.ambassador.code}</span><button type="button" onClick={() => void copyReferralCode()} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700"><Copy className="h-3.5 w-3.5" />Copier</button></dd></div>
          </dl>
        </section>
        <section aria-labelledby="account-security-title" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">Sécurité</p>
          <h2 id="account-security-title" className="mt-1 text-xl font-black text-slate-950">Modifier le mot de passe</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Choisissez au moins 12 caractères. Les autres appareils seront déconnectés après la modification.</p>
          <form onSubmit={(event) => void changePassword(event)} className="mt-5 grid gap-4">
            <label className="text-sm font-semibold text-slate-700">Mot de passe actuel<input required type="password" autoComplete="current-password" maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label>
            <label className="text-sm font-semibold text-slate-700">Nouveau mot de passe<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label>
            <label className="text-sm font-semibold text-slate-700">Confirmer le nouveau mot de passe<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPasswordConfirmation} onChange={(event) => setNewPasswordConfirmation(event.target.value)} className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label>
            {newPasswordConfirmation && newPassword !== newPasswordConfirmation && <p className="text-sm font-semibold text-rose-800">Les deux nouveaux mots de passe ne correspondent pas.</p>}
            <button type="submit" disabled={busy || newPassword !== newPasswordConfirmation} className="min-h-11 w-full rounded-lg bg-emerald-900 px-4 text-sm font-bold text-white disabled:opacity-40 sm:w-fit">{busy ? 'Enregistrement…' : 'Mettre à jour le mot de passe'}</button>
          </form>
        </section>
        <section aria-labelledby="account-help-title" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <h2 id="account-help-title" className="text-base font-bold text-slate-900">Besoin d’aide avec votre compte ?</h2>
          <p className="mt-1 text-sm text-slate-600">L’assistance peut vous aider pour votre accès ou vos informations de compte.</p>
          <a href={supportUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-emerald-900 underline underline-offset-2">{supportWhatsAppUrl ? <MessageCircle className="h-4 w-4" /> : <Mail className="h-4 w-4" />}{supportLabel}</a>
        </section>
      </>}
    </div>
  </main>;
}