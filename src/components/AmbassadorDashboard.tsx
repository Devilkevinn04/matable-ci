import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, BadgeCheck, Check, Copy, CreditCard, Download, Eye, EyeOff, Handshake, LayoutDashboard, LockKeyhole, LogOut, Mail, MessageCircle, Search, Share2, ShieldCheck, Store, Users, Wallet } from 'lucide-react';
import { stringifyCsv } from '../utils/csv';
import { getSupportWhatsAppUrl } from '../utils/supportWhatsApp';
import { SUBSCRIPTION_PLANS } from '../utils/subscriptionFeatures';
import { buildAmbassadorReferralUrl, getAmbassadorMonthlyStats, type AmbassadorMonthlyStats } from '../utils/ambassadors';
import { useSubscriptionPrices } from '../utils/useSubscriptionPrices';
import { useVisibilityPolling } from '../hooks/useVisibilityPolling';

interface DashboardData {
  ambassador: { name: string; email: string; code: string };
  summary: {
    registrations: number | string; published: number | string; paying: number | string;
    total_commissions: number | string; pending_commissions: number | string;
    approved_commissions: number | string; paid_commissions: number | string;
    available_commissions: number | string; withdrawal_commissions: number | string;
  };
  link_stats: {
    total_clicks: number;
    active_tokens: number;
    total_referrals: number;
    conversion_rate: number;
    last_click_at: string | null;
    last_referral_at: string | null;
  };
  link_stats_by_range: Record<string, {
    total_clicks: number; total_referrals: number; conversion_rate: number; last_click_at: string | null; last_referral_at: string | null;
  }>;
  link_activity: Array<{ date: string; clicks: number; referrals: number; conversion_rate: number }>;
  recent_link_events: Array<{ type: 'click' | 'referral'; created_at: string; shop_name: string | null; label: string }>;
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

interface AmbassadorLinkStats {
  from: string | null;
  to: string | null;
  total_clicks: number;
  total_referrals: number;
  conversion_rate: number;
  last_click_at: string | null;
  last_referral_at: string | null;
  activity: Array<{ date: string; clicks: number; referrals: number }>;
}

const money = (value: number | string | null | undefined) => `${new Intl.NumberFormat('fr-FR').format(Number(value) || 0)} FCFA`;
const localDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const formatDateInputLabel = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 'date à sélectionner' : new Intl.DateTimeFormat('fr-FR').format(date);
};
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
const withdrawalStatusClasses: Record<DashboardData['withdrawals'][number]['status'], string> = {
  requested: 'border-amber-200 bg-amber-100 text-amber-900',
  approved: 'border-sky-200 bg-sky-100 text-sky-900',
  rejected: 'border-rose-200 bg-rose-100 text-rose-900',
  paid: 'border-emerald-200 bg-emerald-100 text-emerald-900',
};
const payoutMethodLabels: Record<PayoutMethod, string> = {
  wave: 'Wave', orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', moov_money: 'Moov Money',
};

function AmbassadorMonthlyChart({
  title,
  rows,
  valueFor,
  formatValue,
  concealed = false,
}: {
  title: string;
  rows: AmbassadorMonthlyStats[];
  valueFor: (row: AmbassadorMonthlyStats) => number;
  formatValue: (value: number) => string;
  concealed?: boolean;
}) {
  const maxValue = Math.max(1, ...rows.map(valueFor));
  const accessibleSummary = concealed
    ? `${title}. Montants masqués.`
    : `${title} sur les six derniers mois : ${rows.map((row) => {
      const date = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${row.month}-01T12:00:00.000Z`));
      return `${date}, ${formatValue(valueFor(row))}`;
    }).join('; ')}.`;

  return <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label={title}>
    <h3 className="text-sm font-bold text-slate-900">{title}</h3>
    {concealed
      ? <p className="mt-4 grid h-32 place-items-center rounded-lg bg-slate-50 text-sm text-slate-500">Montants masqués</p>
      : <div className="mt-4 grid h-32 grid-cols-6 items-end gap-2" role="img" aria-label={accessibleSummary}>
        {rows.map((row) => {
          const value = valueFor(row);
          const height = value ? Math.max(4, (value / maxValue) * 100) : 0;
          return <div key={row.month} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
            <div className="flex h-full w-full items-end justify-center">
              <div
                title={`${row.label} : ${formatValue(value)}`}
                className="w-full max-w-8 rounded-t-md bg-emerald-800/85 transition-[height] duration-300"
                style={{ height: `${height}%`, opacity: value ? 1 : 0.15 }}
              />
            </div>
            <span className="text-[10px] font-medium text-slate-500">{row.label}</span>
          </div>;
        })}
      </div>}
  </section>;
}

export function AmbassadorDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { prices: subscriptionPrices, error: subscriptionPricesError } = useSubscriptionPrices();
  const isActivation = location.pathname === '/ambassadeur/activer';
  const isApplication = location.pathname === '/ambassadeur/inscription';
  const activationToken = new URLSearchParams(location.search).get('token') || '';
  const supportWhatsAppUrl = getSupportWhatsAppUrl('Bonjour, j’ai besoin d’aide pour accéder à mon espace ambassadeur MaTable.');
  const supportUrl = supportWhatsAppUrl || 'mailto:assistance@matable-ci.com?subject=Acc%C3%A8s%20ambassadeur%20MaTable';
  const supportLabel = supportWhatsAppUrl ? 'Contacter l’assistance sur WhatsApp' : 'Écrire à l’assistance';
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [checking, setChecking] = useState(true);
  const [applicantName, setApplicantName] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);
  const [email, setEmail] = useState('');
  const [forgotAccess, setForgotAccess] = useState(false);
  const [password, setPassword] = useState('');
  const [pendingMfaChallenge, setPendingMfaChallenge] = useState('');
  const [mfaCode, setMfaCode] = useState('');
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
  const [selectedRange, setSelectedRange] = useState<'today' | '7d' | '30d' | '90d' | 'all' | 'custom'>('today');
  const todayDate = localDateInputValue(new Date());
  const [customStartDate, setCustomStartDate] = useState(todayDate);
  const [customEndDate, setCustomEndDate] = useState(todayDate);
  const [selectedLinkStats, setSelectedLinkStats] = useState<AmbassadorLinkStats | null>(null);
  const [linkStatsLoading, setLinkStatsLoading] = useState(false);
  const [linkStatsError, setLinkStatsError] = useState('');
  const linkStatsRequestId = useRef(0);

  const openAccessRecovery = () => {
    setForgotAccess(true);
    setEmail('');
    setPassword('');
    setConfirmation('');
    setError('');
    setNotice('');
    navigate('/ambassadeur');
  };
  const activationLinkRejected = isActivation
    && (!activationToken || error.startsWith('Lien d’activation invalide'));

  const loadDashboard = async (clearNotice = true) => {
    const response = await fetch('/api/ambassador-auth/dashboard', { credentials: 'include', cache: 'no-store' });
    if (!response.ok) {
      setDashboard(null);
      return false;
    }
    setDashboard(await response.json() as DashboardData);
    if (clearNotice) setNotice('');
    return true;
  };
  useEffect(() => {
    if (isActivation || isApplication) { setChecking(false); return; }
    setChecking(true);
    void fetch('/api/ambassador-auth/session', { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const session = await response.json() as { authenticated?: boolean };
        if (response.ok && session.authenticated) await loadDashboard();
        else setDashboard(null);
      })
      .catch(() => setDashboard(null))
      .finally(() => setChecking(false));
  }, [isActivation, isApplication]);
  useVisibilityPolling(async () => {
    await loadDashboard(false);
  }, 60_000, Boolean(dashboard) && !isActivation && !isApplication);

  useEffect(() => {
    if (!dashboard || activeTab !== 'sharing') return;
    const requestId = ++linkStatsRequestId.current;
    const currentDate = localDateInputValue(new Date());
    const query = new URLSearchParams();
    if (selectedRange === 'all') {
      query.set('all', '1');
    } else {
      let from = customStartDate;
      let to = customEndDate;
      if (selectedRange === 'today') {
        from = currentDate;
        to = currentDate;
      } else if (selectedRange !== 'custom') {
        const days = Number(selectedRange.replace('d', ''));
        const start = new Date();
        start.setDate(start.getDate() - days + 1);
        from = localDateInputValue(start);
        to = currentDate;
      }
      const isValidDate = (value: string) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const parsed = new Date(`${value}T12:00:00`);
        return !Number.isNaN(parsed.getTime()) && localDateInputValue(parsed) === value;
      };
      if (!isValidDate(from) || !isValidDate(to)) {
        setSelectedLinkStats(null);
        setLinkStatsError('Choisissez une date de début et une date de fin.');
        setLinkStatsLoading(false);
        return;
      }
      if (from > to) {
        setSelectedLinkStats(null);
        setLinkStatsError('La date de début doit précéder ou être égale à la date de fin.');
        setLinkStatsLoading(false);
        return;
      }
      if (to > currentDate) {
        setSelectedLinkStats(null);
        setLinkStatsError('La date de fin ne peut pas être dans le futur.');
        setLinkStatsLoading(false);
        return;
      }
      query.set('from', from);
      query.set('to', to);
    }

    setSelectedLinkStats(null);
    setLinkStatsLoading(true);
    setLinkStatsError('');
    void fetch(`/api/ambassador-auth/link-stats?${query}`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json() as AmbassadorLinkStats & { error?: string };
        if (!response.ok) throw new Error(result.error || 'Impossible de charger les statistiques du lien.');
        if (requestId === linkStatsRequestId.current) setSelectedLinkStats(result);
      })
      .catch((problem: unknown) => {
        if (requestId === linkStatsRequestId.current) {
          setLinkStatsError(problem instanceof Error ? problem.message : 'Les statistiques du lien sont momentanément indisponibles.');
        }
      })
      .finally(() => {
        if (requestId === linkStatsRequestId.current) setLinkStatsLoading(false);
      });
    return () => {
      linkStatsRequestId.current += 1;
    };
  }, [activeTab, dashboard, selectedRange, customStartDate, customEndDate]);

  const submitApplication = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/ambassador-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: applicantName, email: applicantEmail, phone: applicantPhone }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible d’envoyer la candidature.');
      setApplicationSubmitted(true);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Impossible d’envoyer la candidature.');
    } finally {
      setBusy(false);
    }
  };

  const submitCredentials = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const requestAccess = !isActivation && !pendingMfaChallenge && forgotAccess;
      const response = await fetch(pendingMfaChallenge
        ? '/api/ambassador-auth/login/verify'
        : requestAccess
          ? '/api/ambassador-auth/request-access'
          : `/api/ambassador-auth/${isActivation ? 'activate' : 'login'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(pendingMfaChallenge
          ? { challenge_id: pendingMfaChallenge, code: mfaCode }
          : requestAccess
            ? { email }
            : isActivation
              ? { token: activationToken, password }
              : { email, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Connexion impossible.');
      if (requestAccess) {
        setNotice(result.message || 'Si un compte correspond à cette adresse, un lien de récupération va être envoyé.');
        return;
      }
      if (result.mfa_required && typeof result.challenge_id === 'string') {
        setPendingMfaChallenge(result.challenge_id);
        setMfaCode('');
        setNotice('Code envoyé à votre adresse e-mail. Vérifiez aussi vos courriers indésirables.');
        return;
      }
      if (isActivation) {
        setNotice('Accès configuré. Ouverture de votre espace…');
        navigate('/ambassadeur', { replace: true });
      } else {
        setPendingMfaChallenge('');
        setMfaCode('');
        if (!await loadDashboard()) throw new Error('La session n’a pas pu être ouverte. Réessayez.');
      }
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Opération impossible.'); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    await fetch('/api/ambassador-auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    }).catch(() => undefined);
    setDashboard(null); setPassword(''); setNotice('');
  };
  const copyReferralLink = async () => {
    try {
      await navigator.clipboard.writeText(buildAmbassadorReferralUrl(dashboard?.ambassador.code, window.location.origin));
      setNotice('Lien de recommandation copié.');
    } catch { setError('Copie impossible dans ce navigateur.'); }
  };
  const copyReferralCode = async () => {
    try {
      await navigator.clipboard.writeText(dashboard?.ambassador.code || '');
      setNotice('Code ambassadeur copié.');
    } catch { setError('Copie impossible dans ce navigateur.'); }
  };
  const referralUrl = dashboard ? buildAmbassadorReferralUrl(dashboard.ambassador.code, window.location.origin) : '';
  const rangeLabel = { today: 'Aujourd’hui', '7d': '7 derniers jours', '30d': '30 derniers jours', '90d': '90 derniers jours', all: 'Depuis le début', custom: 'Période personnalisée' } as const;
  const rangeStats = selectedLinkStats || {
    total_clicks: 0,
    total_referrals: 0,
    conversion_rate: 0,
    last_click_at: null,
    last_referral_at: null,
  };
  const visibleActivity = selectedLinkStats?.activity || [];
  const selectedPeriodDescription = selectedRange === 'today'
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date(`${localDateInputValue(new Date())}T12:00:00`))
    : selectedRange === 'custom'
      ? `${formatDateInputLabel(customStartDate)} – ${formatDateInputLabel(customEndDate)}`
      : rangeLabel[selectedRange];
  const shareReferralLink = async () => {
    setError('');
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Mon lien ambassadeur MaTable', url: referralUrl });
        return;
      } catch (problem) {
        if (problem instanceof Error && problem.name === 'AbortError') return;
        setError('Le partage a échoué. Vous pouvez copier le lien à la place.');
        return;
      }
    }
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(referralUrl)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    setNotice('Lien ouvert dans WhatsApp. Vous pouvez ajouter votre propre message avant de l’envoyer.');
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
  const monthlyStats = getAmbassadorMonthlyStats(dashboard?.referrals || [], dashboard?.payouts || []);
  const referralCount = dashboard?.referrals.length || 0;
  const publishedCount = dashboard?.referrals.filter((referral) => referral.publication_status === 'active').length || 0;
  const payingCount = dashboard?.referrals.filter((referral) => referral.payment_status === 'paid').length || 0;
  const publishedRate = referralCount ? Math.round((publishedCount / referralCount) * 100) : 0;
  const payingRate = referralCount ? Math.round((payingCount / referralCount) * 100) : 0;
  if (checking) return <main className="grid min-h-screen place-items-center bg-[#f7f5f2] p-6"><p role="status" className="text-sm font-semibold text-slate-600">Chargement de votre espace…</p></main>;

  if (isApplication) return <main className="ambassador-auth-page relative min-h-[100svh] overflow-hidden bg-[#102e28] text-[#f8f6ef]">
    <div aria-hidden="true" className="ambassador-auth-orbit pointer-events-none absolute -left-48 top-20 h-[34rem] w-[34rem] rounded-full border border-white/[0.07]" />
    <div aria-hidden="true" className="ambassador-auth-orbit ambassador-auth-orbit-delayed pointer-events-none absolute -left-28 top-40 h-[25rem] w-[25rem] rounded-full border border-white/[0.07]" />
    <div aria-hidden="true" className="pointer-events-none absolute -right-36 -top-40 h-[34rem] w-[34rem] rounded-full bg-[#d49a5b]/10 blur-3xl" />
    <header className="ambassador-auth-header relative z-10 mx-auto flex max-w-[1320px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12 lg:py-7">
      <a href="/" className="inline-flex items-center gap-3" aria-label="MaTable, accueil">
        <img src="/brand-kit/monogram.svg" alt="" aria-hidden="true" className="h-10 w-10 rounded-[13px] bg-white p-0.5" />
        <span className="font-display text-lg font-black tracking-tight text-white">MaTable<span className="text-[#e7b77d]">.</span></span>
      </a>
      <a href="/ambassadeur" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-xs font-bold text-white/85 transition hover:border-[#e7b77d]/70 hover:text-[#f1c893] sm:text-sm">
        <span className="hidden sm:inline">Déjà partenaire ? </span>Connexion <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </a>
    </header>

    <div className="ambassador-auth-layout relative z-10 mx-auto grid max-w-[1320px] items-start gap-10 px-5 pb-10 pt-5 sm:px-8 sm:pb-14 lg:min-h-[calc(100svh-96px)] lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:gap-16 lg:px-12 lg:pb-16 lg:pt-0">
      <section className="ambassador-auth-story max-w-[660px] py-3 lg:py-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#e7b77d]/25 bg-[#e7b77d]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.17em] text-[#f1c893] sm:text-xs">
          <Handshake className="h-3.5 w-3.5" aria-hidden="true" />
          Le cercle des partenaires MaTable
        </div>
        <h1 className="mt-6 max-w-[650px] font-display text-[clamp(2.8rem,6.1vw,5.6rem)] font-black leading-[.94] tracking-[-.065em] text-[#fbf8ef]">
          Faites partie de ceux qui font <span className="text-[#e7b77d]">grandir.</span>
        </h1>
        <p className="mt-5 max-w-[500px] text-sm leading-7 text-white/65 sm:text-base sm:leading-8">
          Présentez MaTable aux commerçants de votre réseau. Nous vous donnons les outils pour partager, suivre chaque recommandation et voir vos résultats.
        </p>

        <div className="mt-8 max-w-[540px] space-y-3 sm:mt-10">
          {[
            { number: '01', title: 'Vous candidatez', detail: 'L’équipe examine votre demande avant de créer votre accès.' },
            { number: '02', title: 'Vous recommandez', detail: 'Vous recevez un lien et un code personnels à partager.' },
            { number: '03', title: 'Vous suivez vos résultats', detail: 'Vos commissions sont étudiées après un premier abonnement payé.' },
          ].map((step, index) => <article key={step.number} style={{ animationDelay: `${index * 100}ms` }} className="ambassador-step-card flex items-start gap-4 rounded-2xl border border-white/[0.09] bg-white/[0.035] p-4 sm:gap-5 sm:p-5">
            <span className="pt-0.5 font-display text-sm font-black tracking-[0.12em] text-[#e7b77d]">{step.number}</span>
            <div>
              <h2 className="text-sm font-extrabold text-white sm:text-base">{step.title}</h2>
              <p className="mt-1 text-xs leading-5 text-white/55 sm:text-sm">{step.detail}</p>
            </div>
          </article>)}
        </div>

        <section aria-labelledby="ambassador-commission-title" className="ambassador-commission-card mt-6 max-w-[540px] rounded-[24px] border border-[#e7b77d]/20 bg-[#e7b77d]/[0.07] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#f1c893]">Rémunération à la performance</p>
              <h2 id="ambassador-commission-title" className="mt-2 font-display text-2xl font-black tracking-[-.04em] text-white">Une prime unique de 20 %</h2>
            </div>
            <span className="font-display text-4xl font-black tracking-[-.06em] text-[#e7b77d]">20%</span>
          </div>
          <p className="mt-3 text-xs leading-5 text-white/60">
            Calculée sur le tarif mensuel de la formule, après le premier paiement confirmé. Un paiement annuel est divisé par dix avant calcul.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.values(SUBSCRIPTION_PLANS).map((plan) => {
              const monthlyPrice = subscriptionPrices?.[plan.tier];
              const commission = monthlyPrice === undefined ? null : Math.round(monthlyPrice * 0.2);
              return <div key={plan.tier} className="rounded-xl border border-white/10 bg-[#102e28]/45 px-3 py-2">
                <p className="text-[10px] font-bold text-white/55">{plan.label}</p>
                <p className="mt-0.5 text-xs font-extrabold text-[#f1c893]">
                  {commission === null ? (subscriptionPricesError ? 'Tarif indisponible' : 'Calcul du tarif…') : `Prime indicative : ${new Intl.NumberFormat('fr-FR').format(commission)} FCFA`}
                </p>
              </div>;
            })}
          </div>
          <p className="mt-3 text-[10px] leading-5 text-white/40">Montants indicatifs, soumis à vérification. La boutique doit être publiée et la commission validée avant versement. Pas de prime pour une inscription seule ou un renouvellement ; les remboursements annulent les primes non versées. Retraits manuels après validation.</p>
        </section>
      </section>

      <section className="ambassador-auth-card relative mx-auto w-full max-w-[480px] rounded-[28px] bg-[#fbfaf6] p-5 text-[#292d2a] shadow-[0_30px_100px_rgba(0,0,0,.28)] sm:rounded-[34px] sm:p-8 lg:p-9" aria-labelledby="ambassador-application-title">
        <div aria-hidden="true" className="absolute right-7 top-0 h-1 w-16 rounded-b-full bg-[#d49a5b]" />
        {!applicationSubmitted ? <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a66e35]">Première étape</p>
              <h2 id="ambassador-application-title" className="mt-2 font-display text-2xl font-black leading-tight tracking-[-.04em] text-[#173c32] sm:text-[30px]">Parlons de votre projet.</h2>
            </div>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e8eee8] text-[#174c3d]"><Handshake className="h-5 w-5" aria-hidden="true" /></span>
          </div>
          <p className="mt-3 text-sm leading-6 text-[#72766f]">Laissez-nous vos coordonnées. Notre équipe examinera votre candidature et vous répondra par e-mail.</p>
          <form key={applicationSubmitted ? 'application-submitted' : 'application-form'} onSubmit={(event) => void submitApplication(event)} className="auth-form ambassador-auth-form mt-7 space-y-4">
            <label className="block text-xs font-bold text-[#3d4b44]">
              Nom complet
              <input required minLength={2} maxLength={100} autoComplete="name" value={applicantName} onChange={(event) => setApplicantName(event.target.value)} placeholder="Votre prénom et nom" className="mt-1.5 min-h-12 w-full rounded-2xl border border-[#deded5] bg-white px-4 text-sm font-normal text-[#292d2a] outline-none transition placeholder:text-[#a3a59f] focus:border-[#17644d] focus:ring-4 focus:ring-[#17644d]/10" />
            </label>
            <label className="block text-xs font-bold text-[#3d4b44]">
              Adresse e-mail
              <input required type="email" maxLength={254} autoComplete="email" value={applicantEmail} onChange={(event) => setApplicantEmail(event.target.value)} placeholder="vous@exemple.ci" className="mt-1.5 min-h-12 w-full rounded-2xl border border-[#deded5] bg-white px-4 text-sm font-normal text-[#292d2a] outline-none transition placeholder:text-[#a3a59f] focus:border-[#17644d] focus:ring-4 focus:ring-[#17644d]/10" />
            </label>
            <label className="block text-xs font-bold text-[#3d4b44]">
              Téléphone <span className="font-normal text-[#8b8e87]">(facultatif)</span>
              <input type="tel" maxLength={30} autoComplete="tel" value={applicantPhone} onChange={(event) => setApplicantPhone(event.target.value)} placeholder="+225 07 00 00 00 00" className="mt-1.5 min-h-12 w-full rounded-2xl border border-[#deded5] bg-white px-4 text-sm font-normal text-[#292d2a] outline-none transition placeholder:text-[#a3a59f] focus:border-[#17644d] focus:ring-4 focus:ring-[#17644d]/10" />
            </label>
            <p className="flex items-start gap-2 rounded-2xl bg-[#f1f0e9] p-3 text-[11px] leading-5 text-[#646960]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#47705f]" aria-hidden="true" />
              Cette demande ne crée pas encore de compte. Votre accès et votre code seront créés uniquement après approbation.
            </p>
            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold leading-5 text-rose-800">{error}</p>}
            <button type="submit" disabled={busy} className="group inline-flex min-h-[52px] w-full items-center justify-between rounded-2xl bg-[#174c3d] px-5 text-sm font-extrabold text-white shadow-[0_10px_22px_rgba(23,76,61,.19)] transition hover:bg-[#0f624b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#17644d]/20 disabled:cursor-wait disabled:opacity-55">
              <span>{busy ? 'Envoi en cours…' : 'Envoyer ma candidature'}</span>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 transition group-hover:translate-x-0.5 group-hover:bg-white/15"><ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
            </button>
          </form>
        </> : <div className="py-2">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#e8eee8] text-[#17644d]"><Check className="h-7 w-7" aria-hidden="true" /></span>
          <p className="mt-6 text-[10px] font-black uppercase tracking-[0.16em] text-[#a66e35]">Candidature envoyée</p>
          <h2 id="ambassador-application-title" className="mt-2 font-display text-2xl font-black leading-tight tracking-[-.04em] text-[#173c32] sm:text-[30px]">Merci de vouloir faire équipe avec nous.</h2>
          <p role="status" className="mt-4 text-sm leading-6 text-[#72766f]">Votre demande va être examinée. Si elle est approuvée, vous recevrez à l’adresse indiquée un lien personnel pour activer votre espace ambassadeur.</p>
          <div className="mt-6 rounded-2xl border border-[#e8e4da] bg-white p-4">
            <p className="text-xs font-bold text-[#3d4b44]">Et ensuite ?</p>
            <p className="mt-1 text-xs leading-5 text-[#72766f]">Gardez un œil sur votre boîte de réception. L’équipe MaTable vous contactera après l’examen de votre candidature.</p>
          </div>
        </div>}
        <div className="mt-6 flex items-start gap-3 border-t border-[#eae7df] pt-5">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#edf1eb] text-[#47705f]"><LockKeyhole className="h-4 w-4" aria-hidden="true" /></span>
          <p className="text-[10px] leading-5 text-[#84877f]">
            Vos coordonnées servent uniquement à examiner et gérer votre demande. Consultez notre <a href="/confidentialite" className="font-bold text-[#17644d] underline underline-offset-2">politique de confidentialité</a>.
          </p>
        </div>
        <a href="/ambassadeur" className="mt-4 inline-flex min-h-9 items-center gap-2 text-xs font-bold text-[#17644d] transition hover:text-[#a66e35]">
          <ArrowRight className="h-4 w-4 rotate-180" aria-hidden="true" /> Retour à la connexion
        </a>
      </section>
    </div>
  </main>;

  if (!dashboard) return <main className="ambassador-auth-page relative min-h-[100svh] overflow-hidden bg-[#102e28] text-[#f8f6ef]">
    <div aria-hidden="true" className="ambassador-auth-orbit pointer-events-none absolute -left-48 top-20 h-[34rem] w-[34rem] rounded-full border border-white/[0.07]" />
    <div aria-hidden="true" className="ambassador-auth-orbit ambassador-auth-orbit-delayed pointer-events-none absolute -left-28 top-40 h-[25rem] w-[25rem] rounded-full border border-white/[0.07]" />
    <div aria-hidden="true" className="pointer-events-none absolute -right-36 -top-40 h-[34rem] w-[34rem] rounded-full bg-[#d49a5b]/10 blur-3xl" />
    <header className="ambassador-auth-header relative z-10 mx-auto flex max-w-[1320px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12 lg:py-7">
      <a href="/" className="group inline-flex items-center gap-3" aria-label="MaTable, accueil">
        <img src="/brand-kit/monogram.svg" alt="" aria-hidden="true" className="h-10 w-10 rounded-[13px] bg-white p-0.5" />
        <span className="font-display text-lg font-black tracking-tight text-white">MaTable<span className="text-[#e7b77d]">.</span></span>
      </a>
      <a href={isActivation ? '/ambassadeur' : '/ambassadeur/inscription'} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 px-4 text-xs font-bold text-white/85 transition hover:border-[#e7b77d]/70 hover:text-[#f1c893] sm:text-sm">
        {isActivation ? 'Déjà partenaire ? Connexion' : 'Rejoindre le programme'}
        <ArrowDownRight className="h-4 w-4" aria-hidden="true" />
      </a>
    </header>

    <div className="ambassador-auth-layout relative z-10 mx-auto grid max-w-[1320px] items-center gap-10 px-5 pb-10 pt-5 sm:px-8 sm:pb-14 lg:min-h-[calc(100svh-96px)] lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:px-12 lg:pb-16 lg:pt-0">
      <section className="ambassador-auth-story max-w-[660px] py-3 lg:py-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#e7b77d]/25 bg-[#e7b77d]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.17em] text-[#f1c893] sm:text-xs">
          <Handshake className="h-3.5 w-3.5" aria-hidden="true" />
          Le cercle des partenaires MaTable
        </div>
        <h1 className="mt-6 max-w-[650px] font-display text-[clamp(2.8rem,6.1vw,5.6rem)] font-black leading-[.94] tracking-[-.065em] text-[#fbf8ef]">
          Le commerce local avance <span className="text-[#e7b77d]">ensemble.</span>
        </h1>
        <p className="mt-5 max-w-[500px] text-sm leading-7 text-white/65 sm:text-base sm:leading-8">
          Vous créez des rencontres entre MaTable et les commerçants. Ici, chaque recommandation devient visible, suivie et justement récompensée.
        </p>

        <div className="mt-8 grid max-w-[520px] grid-cols-2 gap-3 sm:mt-10 sm:gap-4">
          <article className="ambassador-commission-card relative overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.055] p-4 backdrop-blur-sm sm:p-5">
            <div aria-hidden="true" className="absolute -right-5 -top-7 h-24 w-24 rounded-full bg-[#e7b77d]/10 blur-2xl" />
            <p className="relative text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Prime partenaire</p>
            <p className="relative mt-2 font-display text-4xl font-black tracking-[-.05em] text-[#f1c893] sm:text-5xl">20<span className="text-2xl">%</span></p>
            <p className="relative mt-1 text-[11px] leading-5 text-white/55 sm:text-xs">du tarif mensuel, sur le premier abonnement payé.</p>
          </article>
          <article className="ambassador-commission-card rounded-[22px] border border-white/10 bg-white/[0.055] p-4 backdrop-blur-sm sm:p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Votre espace</p>
            <ul className="mt-3 space-y-2.5 text-xs font-semibold text-white/80">
              <li className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-[#e7b77d]/15 text-[#f1c893]"><Check className="h-3 w-3" /></span>Recommandations suivies</li>
              <li className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-[#e7b77d]/15 text-[#f1c893]"><Check className="h-3 w-3" /></span>Commissions détaillées</li>
              <li className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-[#e7b77d]/15 text-[#f1c893]"><Check className="h-3 w-3" /></span>Retraits transparents</li>
            </ul>
          </article>
        </div>
        <p className="mt-4 max-w-[520px] text-[10px] leading-5 text-white/40">
          Prime indicative, soumise au paiement confirmé, à la publication de la boutique et à la validation de la commission.
        </p>
      </section>

      <section className="ambassador-auth-card relative mx-auto w-full max-w-[480px] rounded-[28px] bg-[#fbfaf6] p-5 text-[#292d2a] shadow-[0_30px_100px_rgba(0,0,0,.28)] sm:rounded-[34px] sm:p-8 lg:p-9" aria-labelledby="ambassador-auth-title">
        <div aria-hidden="true" className="absolute right-7 top-0 h-1 w-16 rounded-b-full bg-[#d49a5b]" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#a66e35]">
              {isActivation ? 'Votre invitation est prête' : forgotAccess ? 'Récupération sécurisée' : 'Votre espace partenaire'}
            </p>
            <h2 id="ambassador-auth-title" className="mt-2 font-display text-2xl font-black leading-tight tracking-[-.04em] text-[#173c32] sm:text-[30px]">
              {isActivation ? 'Activez votre accès' : forgotAccess ? 'Retrouvons votre accès.' : pendingMfaChallenge ? 'Une dernière étape.' : 'Content de vous revoir.'}
            </h2>
          </div>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e8eee8] text-[#174c3d]">
            {pendingMfaChallenge ? <Mail className="h-5 w-5" aria-hidden="true" /> : isActivation ? <BadgeCheck className="h-5 w-5" aria-hidden="true" /> : <LockKeyhole className="h-5 w-5" aria-hidden="true" />}
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-[#72766f]">
          {isActivation
            ? 'Choisissez votre mot de passe pour accéder au suivi de vos recommandations.'
            : forgotAccess
              ? 'Saisissez votre adresse e-mail. Si elle est associée à un compte, vous recevrez un lien personnel.'
              : pendingMfaChallenge
                ? 'Saisissez le code à usage unique envoyé à votre adresse e-mail.'
                : 'Connectez-vous pour suivre votre réseau et vos gains.'}
        </p>

        <form key={isActivation ? 'activation' : forgotAccess ? 'recovery' : pendingMfaChallenge ? 'mfa' : 'login'} onSubmit={(event) => void submitCredentials(event)} className="auth-form ambassador-auth-form mt-7 space-y-4">
          {isActivation && !activationToken && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold leading-5 text-rose-800">Lien d’activation manquant. Vous pouvez demander un nouveau lien sécurisé ci-dessous.</p>}
          {pendingMfaChallenge ? (
            <label className="block text-xs font-bold text-[#3d4b44]">
              Code de vérification
              <span className="mt-1 block text-xs font-normal text-[#82867e]">8 chiffres · usage unique · valable 10 minutes</span>
              <input required type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 8))} className="mt-2 min-h-14 w-full rounded-2xl border border-[#deded5] bg-white px-4 text-center font-mono text-xl tracking-[0.4em] text-[#173c32] outline-none transition focus:border-[#17644d] focus:ring-4 focus:ring-[#17644d]/10" />
            </label>
          ) : <>
            {!isActivation && <label className="block text-xs font-bold text-[#3d4b44]">
              Adresse e-mail
              <input required type="email" autoComplete="username" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@exemple.ci" className="mt-1.5 min-h-12 w-full rounded-2xl border border-[#deded5] bg-white px-4 text-sm font-normal text-[#292d2a] outline-none transition placeholder:text-[#a3a59f] focus:border-[#17644d] focus:ring-4 focus:ring-[#17644d]/10" />
            </label>}
            {!forgotAccess && <label className="block text-xs font-bold text-[#3d4b44]">
              {isActivation ? 'Créer un mot de passe' : 'Mot de passe'}
              <span className="relative mt-1.5 block">
                <input required type={showPassword ? 'text' : 'password'} autoComplete={isActivation ? 'new-password' : 'current-password'} minLength={isActivation ? 8 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-12 w-full rounded-2xl border border-[#deded5] bg-white px-4 pr-12 text-sm font-normal text-[#292d2a] outline-none transition focus:border-[#17644d] focus:ring-4 focus:ring-[#17644d]/10" />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={showPassword} className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-2xl text-[#7d827b] transition hover:bg-[#f3f1eb]">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </span>
            </label>}
          </>}
          {isActivation && <label className="block text-xs font-bold text-[#3d4b44]">
            Confirmer le mot de passe
            <input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-2xl border border-[#deded5] bg-white px-4 text-sm font-normal text-[#292d2a] outline-none transition focus:border-[#17644d] focus:ring-4 focus:ring-[#17644d]/10" />
          </label>}
          {isActivation && password && confirmation && password !== confirmation && <p className="text-xs font-semibold text-rose-800">Les deux mots de passe ne correspondent pas.</p>}
          {!pendingMfaChallenge && !isActivation && <button type="button" onClick={() => { setForgotAccess((current) => !current); setPassword(''); setNotice(''); setError(''); }} className="min-h-9 text-xs font-bold text-[#17644d] transition hover:text-[#a66e35]">{forgotAccess ? '← Retour à la connexion' : 'Mot de passe oublié ?'}</button>}
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold leading-5 text-rose-800">{error}</p>}
          {activationLinkRejected && <button type="button" onClick={openAccessRecovery} className="min-h-11 w-full rounded-xl border border-[#17644d]/20 bg-white px-4 text-sm font-bold text-[#17644d] transition hover:bg-[#edf3ef] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#17644d]/15">Demander un nouveau lien par e-mail</button>}
          {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold leading-5 text-emerald-900">{notice}</p>}
          <button type="submit" disabled={busy || (isActivation && (!activationToken || password !== confirmation))} className="group inline-flex min-h-[52px] w-full items-center justify-between rounded-2xl bg-[#174c3d] px-5 text-sm font-extrabold text-white shadow-[0_10px_22px_rgba(23,76,61,.19)] transition hover:bg-[#0f624b] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#17644d]/20 disabled:cursor-wait disabled:opacity-55">
            <span>{busy ? 'Veuillez patienter…' : pendingMfaChallenge ? 'Vérifier le code' : isActivation ? 'Activer mon espace' : forgotAccess ? 'Recevoir mon lien sécurisé' : 'Accéder à mon espace'}</span>
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 transition group-hover:translate-x-0.5 group-hover:bg-white/15"><ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
          </button>
          {pendingMfaChallenge && <button type="button" onClick={() => { setPendingMfaChallenge(''); setMfaCode(''); setNotice(''); }} className="min-h-10 w-full text-center text-xs font-semibold text-[#777d75] underline underline-offset-2">Recommencer la connexion</button>}
        </form>
        <div className="mt-6 flex items-start gap-3 border-t border-[#eae7df] pt-5">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#edf1eb] text-[#47705f]"><ShieldCheck className="h-4 w-4" aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#455349]">{isActivation ? 'Invitation personnelle et sécurisée' : 'Vos accès restent confidentiels'}</p>
            <p className="mt-1 text-[10px] leading-5 text-[#84877f]">
              {isActivation
                ? 'Lien à usage unique valable 7 jours · 8 caractères minimum. Une phrase longue et unique est recommandée.'
                : forgotAccess
                  ? 'Le lien expire après 7 jours et ne peut être utilisé qu’une seule fois.'
                  : 'Session de 8 heures · vérification supplémentaire par e-mail si nécessaire.'}
            </p>
          </div>
        </div>
        {(!forgotAccess || isActivation) && <a href={supportUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-9 items-center gap-2 text-xs font-bold text-[#17644d] transition hover:text-[#a66e35]">
          {supportWhatsAppUrl ? <MessageCircle className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
          {isActivation ? 'Un souci avec votre invitation ?' : 'Besoin d’aide pour vous connecter ?'}
        </a>}
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
      {activeTab === 'overview' && <>
        <section aria-label="Vos résultats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(({ label, value, icon: Icon }) => <article key={label} className="ambassador-stat-card flex min-w-0 flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-[0_12px_30px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:gap-3 sm:p-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#eaf7f3] text-emerald-900 sm:h-11 sm:w-11"><Icon className="h-5 w-5" /></span><div className="w-full min-w-0"><p className="break-words text-[10px] font-black uppercase tracking-[0.04em] text-slate-500 sm:text-[11px] sm:tracking-[0.12em]">{label}</p><p className="mt-1 text-lg font-black tabular-nums text-slate-950 sm:text-xl">{label === 'Primes versées' ? (showAmounts ? value : '••••') : Number(value) || 0}</p></div></article>)}</section>
        <section aria-labelledby="commission-summary-title" className="ambassador-panel grid gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] sm:grid-cols-3"><h2 id="commission-summary-title" className="sr-only">État des commissions</h2><p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">En vérification <strong className="ml-1 text-slate-950">{formatAmount(numericSummary?.pending_commissions)}</strong></p><p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">Validées, à retirer <strong className="ml-1 text-slate-950">{formatAmount(numericSummary?.available_commissions)}</strong></p><p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">Total des primes générées <strong className="ml-1 text-slate-950">{formatAmount(numericSummary?.total_commissions)}</strong></p><p className="text-xs leading-5 text-slate-500 sm:col-span-3">Une prime est unique et concerne le premier abonnement payé. Elle devient retirable après confirmation, publication et vérification.</p></section>
        <section aria-labelledby="ambassador-statistics-title" className="ambassador-panel space-y-4 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
          <div><h2 id="ambassador-statistics-title" className="text-lg font-black text-slate-950">Vos statistiques</h2><p className="mt-1 text-xs leading-5 text-slate-500">Conversions calculées sur les boutiques attribuées à votre code, tous historiques confondus.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Boutiques publiées</p><p className="mt-1 text-2xl font-black text-slate-950">{referralCount ? `${publishedRate} %` : '—'}</p><p className="mt-1 text-xs text-slate-600">{publishedCount} publiée(s) sur {referralCount} inscription(s) attribuée(s)</p></article>
            <article className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Commerçants payants</p><p className="mt-1 text-2xl font-black text-slate-950">{referralCount ? `${payingRate} %` : '—'}</p><p className="mt-1 text-xs text-slate-600">{payingCount} paiement(s) confirmé(s) sur {referralCount} inscription(s) attribuée(s)</p></article>
          </div>
          <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800">
              Voir l’évolution et le détail par mois
            </summary>
            <div className="mt-3 space-y-4">
              <p className="text-xs leading-5 text-slate-500">Les inscriptions correspondent aux boutiques créées avec attribution confirmée. Les visites du lien sont comptées séparément, sans identifier les visiteurs.</p>
              <div className="grid gap-3 lg:grid-cols-2">
                <AmbassadorMonthlyChart
                  title="Inscriptions attribuées — 6 derniers mois"
                  rows={monthlyStats}
                  valueFor={(row) => row.registrations}
                  formatValue={(value) => `${value} inscription${value > 1 ? 's' : ''}`}
                />
                <AmbassadorMonthlyChart
                  title="Primes versées — 6 derniers mois"
                  rows={monthlyStats}
                  valueFor={(row) => row.paidAmount}
                  formatValue={money}
                  concealed={!showAmounts}
                />
              </div>
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="ambassador-cohorts-title">
                <div className="border-b border-slate-100 p-4">
                  <h3 id="ambassador-cohorts-title" className="text-sm font-bold text-slate-900">Suivi des inscriptions par mois</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Pour chaque mois d’inscription, état actuel des boutiques attribuées — ce tableau ne date pas les conversions.</p>
                </div>
                <p className="px-4 pb-3 text-[11px] text-slate-500 sm:hidden">Faites glisser le tableau horizontalement pour voir toutes les colonnes.</p>
                <div className="overflow-x-auto" role="region" aria-label="Tableau de suivi des inscriptions par mois" tabIndex={0}>
                  <table className="w-full min-w-[32rem] text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-bold">Mois d’inscription</th>
                        <th scope="col" className="px-4 py-3 text-right font-bold">Attribuées</th>
                        <th scope="col" className="px-4 py-3 text-right font-bold">Publiées (état actuel)</th>
                        <th scope="col" className="px-4 py-3 text-right font-bold">Payantes (état actuel)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {monthlyStats.map((row) => (
                        <tr key={row.month}>
                          <th scope="row" className="whitespace-nowrap px-4 py-3 font-semibold capitalize text-slate-800">{row.label}</th>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">{row.registrations}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">{row.published}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">{row.paying}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </details>
        </section>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setActiveTab('withdrawals')} className="ambassador-primary-btn min-h-10 rounded-xl bg-[#123b32] px-4 text-sm font-bold text-white shadow-[0_12px_28px_rgba(18,59,50,0.18)]">Voir mes retraits</button><button type="button" onClick={() => setActiveTab('sharing')} className="ambassador-secondary-btn min-h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800">Partager mon lien</button></div>
      </>}
      {activeTab === 'sharing' && <section aria-labelledby="referral-title" className="ambassador-panel space-y-5 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-[11px] font-black uppercase tracking-[0.15em] text-emerald-800">Faire connaître MaTable</p><h2 id="referral-title" className="mt-2 text-xl font-black text-slate-950">Votre lien et ses résultats</h2><p className="mt-1 text-sm text-slate-600">Copiez votre lien ou partagez-le. Vous pouvez ajouter votre propre message.</p></div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            Période
            <select value={selectedRange} onChange={(event) => setSelectedRange(event.target.value as typeof selectedRange)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800">
              <option value="today">Aujourd’hui</option>
              <option value="7d">7 derniers jours</option>
              <option value="30d">30 derniers jours</option>
              <option value="90d">90 derniers jours</option>
              <option value="all">Depuis le début</option>
              <option value="custom">Choisir les dates</option>
            </select>
          </label>
        </div>
        {selectedRange === 'custom' && <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-xs font-semibold text-slate-700">Du
            <input type="date" value={customStartDate} max={todayDate} onChange={(event) => setCustomStartDate(event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
          </label>
          <label className="text-xs font-semibold text-slate-700">Au
            <input type="date" value={customEndDate} max={todayDate} onChange={(event) => setCustomEndDate(event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
          </label>
          <p className="text-xs text-slate-500 sm:pb-3">Les statistiques se mettent à jour avec les dates choisies.</p>
        </div>}
        <div className="rounded-2xl border border-emerald-900/15 bg-[#ebfaf5] px-4 py-4 sm:px-5">
          <h3 className="text-sm font-black text-emerald-950">Votre lien de recommandation</h3>
          <p className="mt-2 break-all text-sm font-semibold text-emerald-950">{referralUrl}</p>
          <p className="mt-2 text-xs text-emerald-800">Code personnel : <strong>{dashboard.ambassador.code}</strong></p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void shareReferralLink()} className="ambassador-primary-btn inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#123b32] px-3 text-sm font-bold text-white"><MessageCircle className="h-4 w-4" />Partager le lien</button>
            <button type="button" onClick={() => void copyReferralLink()} className="ambassador-secondary-btn inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-900/25 bg-white px-3 text-sm font-bold text-emerald-950"><Copy className="h-4 w-4" />Copier le lien</button>
            <button type="button" onClick={() => void copyReferralCode()} className="ambassador-secondary-btn inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-900/25 bg-white px-3 text-sm font-bold text-emerald-950"><Copy className="h-4 w-4" />Copier le code</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Visites du lien</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">{linkStatsLoading ? '…' : new Intl.NumberFormat('fr-FR').format(rangeStats.total_clicks)}</p>
            <p className="mt-1 text-[11px] text-slate-500">{rangeStats.last_click_at ? `Dernière visite : ${new Date(rangeStats.last_click_at).toLocaleDateString('fr-FR')}` : 'Aucune visite sur la période'}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Boutiques inscrites</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">{linkStatsLoading ? '…' : new Intl.NumberFormat('fr-FR').format(rangeStats.total_referrals)}</p>
            <p className="mt-1 text-[11px] text-slate-500">{rangeStats.last_referral_at ? `Dernière inscription : ${new Date(rangeStats.last_referral_at).toLocaleDateString('fr-FR')}` : 'Aucune inscription attribuée sur la période'}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Taux de conversion</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">{linkStatsLoading ? '…' : `${rangeStats.conversion_rate}%`}</p>
            <p className="mt-1 text-[11px] text-slate-500">Inscriptions attribuées ÷ visites du lien</p>
          </article>
        </div>
        <details className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800">
            Voir le détail des visites et l’activité récente
          </summary>
          <div className="mt-3 space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-slate-900">Détail par jour</h3>
              <p className="mt-1 text-xs text-slate-500">Visites du lien et inscriptions attribuées par jour · {selectedPeriodDescription}.</p>
            </div>
          </div>
          {linkStatsError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">{linkStatsError}</p>}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-semibold text-slate-600" aria-label="Légende des résultats">
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-sky-600" aria-hidden="true" />Visites du lien</span>
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-700" aria-hidden="true" />Boutiques inscrites avec votre code ou lien</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500 sm:hidden">Faites glisser le tableau horizontalement pour voir toutes les colonnes.</p>
          <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white" role="region" aria-label="Détail des visites et inscriptions par jour" tabIndex={0}>
            <table className="w-full min-w-[30rem] border-collapse text-left text-xs">
              <caption className="sr-only">Visites du lien et inscriptions attribuées par jour · {selectedPeriodDescription}</caption>
              <thead className="sticky top-0 bg-slate-100 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600">
                <tr><th scope="col" className="px-3 py-2.5">Date</th><th scope="col" className="px-3 py-2.5">Visites</th><th scope="col" className="px-3 py-2.5">Inscriptions attribuées</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linkStatsLoading
                  ? <tr><td colSpan={3} className="px-3 py-5 text-center text-slate-500">Chargement des statistiques…</td></tr>
                  : visibleActivity.length === 0
                    ? <tr><td colSpan={3} className="px-3 py-5 text-center text-slate-500">Aucune activité enregistrée pour cette période.</td></tr>
                    : [...visibleActivity].reverse().map((day) => (
                  <tr key={day.date} className="hover:bg-slate-50">
                    <th scope="row" className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">{new Date(`${day.date}T12:00:00.000Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</th>
                    <td className="px-3 py-2 font-bold tabular-nums text-sky-800">{day.clicks}</td>
                    <td className="px-3 py-2 font-bold tabular-nums text-emerald-800">{day.referrals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-slate-500">Le taux de conversion correspond au nombre d’inscriptions attribuées divisé par les visites du lien enregistrées sur la période. Une inscription peut aussi être attribuée avec votre code, même sans visite suivie.</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-black text-slate-900">Activité récente du lien</h3>
          <div className="mt-3 space-y-2">
            {dashboard.recent_link_events.length === 0 ? <p className="text-sm text-slate-600">Aucune activité enregistrée pour ce lien pour le moment.</p> : dashboard.recent_link_events.slice(0, 8).map((event) => (
              <div key={`${event.type}-${event.created_at}-${event.shop_name ?? 'no-shop'}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">{event.label}</p>
                  <p className="text-[11px] text-slate-500">{new Date(event.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>
                <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${event.type === 'click' ? 'border-sky-200 bg-sky-100 text-sky-900' : 'border-emerald-200 bg-emerald-100 text-emerald-800'}`}>
                  {event.type === 'click' ? 'visite du lien' : 'inscription'}
                </span>
              </div>
            ))}
          </div>
        </section>
          </div>
        </details>
      </section>}
      <section data-ambassador-panel="withdrawals" aria-labelledby="withdrawal-request-title" className="ambassador-panel rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.15em] text-emerald-800">Gestion des gains</p>
          <h2 id="withdrawal-request-title" className="mt-2 text-xl font-black text-slate-950">Retraits</h2>
          <p className="mt-1 text-sm text-slate-600">Demandez le retrait de vos commissions validées. Aucun seuil minimum n’est requis.</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">Les demandes approuvées sont traitées dans les cinq premiers jours ouvrés (hors week-ends et jours fériés) du mois suivant. Le transfert est manuel et n’est confirmé qu’après vérification.</p>
        </div>
        <div className="mt-4 grid gap-3 rounded-2xl border border-emerald-900/15 bg-[#ebfaf5] p-4 sm:grid-cols-3">
          <div><p className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-900">Disponible au retrait</p><p className="mt-1 text-xl font-black tabular-nums text-emerald-950">{formatAmount(availableBalance)}</p></div>
          <div><p className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-900">En demande</p><p className="mt-1 text-xl font-black tabular-nums text-emerald-950">{formatAmount(numericSummary?.withdrawal_commissions)}</p></div>
          <div><p className="text-[11px] font-black uppercase tracking-[0.12em] text-emerald-900">Déjà versé</p><p className="mt-1 text-xl font-black tabular-nums text-emerald-950">{formatAmount(numericSummary?.paid_commissions)}</p></div>
        </div>
        {openWithdrawal ? <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-950">{openWithdrawal.status === 'requested' ? 'Votre demande est en cours de vérification.' : 'Votre demande est validée et attend son transfert.'}</p>
              <p className="mt-1 text-sm text-amber-900">{formatAmount(openWithdrawal.amount)} · Demandée le {new Date(openWithdrawal.created_at).toLocaleDateString('fr-FR')}</p>
              <p className="mt-1 break-words text-xs text-amber-900">Portefeuille : {payoutMethodLabels[openWithdrawal.payout_method as PayoutMethod] || openWithdrawal.payout_method} · {openWithdrawal.payout_phone}</p>
            </div>
            <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${withdrawalStatusClasses[openWithdrawal.status]}`}>{withdrawalLabels[openWithdrawal.status]}</span>
          </div>
          {openWithdrawal.status === 'requested'
            ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 pt-3">
              <p className="text-xs leading-5 text-amber-900">Vous pouvez annuler la demande tant qu’elle n’a pas été validée.</p>
              <button type="button" disabled={requestingWithdrawal} onClick={() => void cancelWithdrawal(openWithdrawal.id)} className="min-h-10 rounded-lg border border-rose-300 bg-white px-3 text-xs font-bold text-rose-800 transition hover:bg-rose-50 disabled:opacity-50">Annuler la demande</button>
            </div>
            : <p className="mt-3 border-t border-amber-200 pt-3 text-xs leading-5 text-amber-900">Le statut passera à « Payée » après confirmation du transfert par MaTable.</p>}
        </div> : availableBalance > 0 ? <form onSubmit={(event) => void requestWithdrawal(event)} className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">Portefeuille mobile money<select required value={payoutMethod} onChange={(event) => setPayoutMethod(event.target.value as PayoutMethod)} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">{Object.entries(payoutMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-700">Numéro de réception<input required type="tel" inputMode="tel" autoComplete="tel" value={payoutPhone} onChange={(event) => setPayoutPhone(event.target.value)} placeholder="+225 07 00 00 00 00" className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" /></label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={requestingWithdrawal || !payoutPhone.trim()} className="ambassador-primary-btn inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-900 px-4 text-sm font-bold text-white disabled:opacity-40 sm:w-auto">{requestingWithdrawal ? 'Envoi…' : `Demander le retrait de ${formatAmount(availableBalance)}`}</button>
            <p className="mt-2 text-xs leading-5 text-slate-500">La demande porte sur tout le solde validé ({formatAmount(availableBalance)}). Vérifiez le numéro avant l’envoi ; vous pourrez annuler la demande tant qu’elle n’est pas validée.</p>
          </div>
        </form> : <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">Aucune commission n’est disponible pour le retrait. Les primes deviennent disponibles après validation, sans montant minimum.</p>}
        <div className="mt-6">
          <h3 className="text-sm font-black text-slate-900">Historique des demandes</h3>
          {withdrawals.length === 0 ? <p className="mt-2 text-sm text-slate-600">Aucune demande de retrait pour le moment.</p> : <div className="mt-2 space-y-2">{withdrawals.map((withdrawal) => <article key={withdrawal.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-slate-900">{formatAmount(withdrawal.amount)}</p><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${withdrawalStatusClasses[withdrawal.status]}`}>{withdrawalLabels[withdrawal.status]}</span></div>
              <p className="mt-1 break-words text-xs text-slate-600">{payoutMethodLabels[withdrawal.payout_method as PayoutMethod] || withdrawal.payout_method} · {withdrawal.payout_phone} · Demandée le {new Date(withdrawal.created_at).toLocaleDateString('fr-FR')}</p>
              {withdrawal.payout_reference && <p className="mt-1 break-all text-xs font-semibold text-emerald-800">Référence : {withdrawal.payout_reference}</p>}
              {withdrawal.admin_reason && <p className="mt-1 break-words text-xs text-rose-800">Motif : {withdrawal.admin_reason}</p>}
            </div>
            {withdrawal.processed_at && <time className="shrink-0 text-xs text-slate-500">Traitée le {new Date(withdrawal.processed_at).toLocaleDateString('fr-FR')}</time>}
          </article>)}</div>}
        </div>
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
          <p className="mt-2 text-sm leading-6 text-slate-600">Choisissez au moins 8 caractères. Une phrase longue et unique est recommandée. Les autres appareils seront déconnectés après la modification.</p>
          <form onSubmit={(event) => void changePassword(event)} className="mt-5 grid gap-4">
            <label className="text-sm font-semibold text-slate-700">Mot de passe actuel<input required type="password" autoComplete="current-password" maxLength={128} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label>
            <label className="text-sm font-semibold text-slate-700">Nouveau mot de passe<input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label>
            <label className="text-sm font-semibold text-slate-700">Confirmer le nouveau mot de passe<input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={newPasswordConfirmation} onChange={(event) => setNewPasswordConfirmation(event.target.value)} className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label>
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