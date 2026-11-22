import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatedNumber } from '../AnimatedNumber';
import { Gift, Pause, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { TrendChart } from '../charts/TrendChart';
import { CHART_COLORS, toDailyPoints } from '../../utils/chartData';
import { ProgressRing } from '../ProgressRing';
import { useToast } from '../Toast';
import { confirmAction } from '../ui/ConfirmSheet';
import { TextField } from '../ui/fields';
import { LoyaltyCodeForm } from './LoyaltyCodeForm';
import {
  getRewardDraftError, isRewardOffered, MAX_LOYALTY_REWARDS, toRewardDraft, toRewardPayload, type LoyaltyReward, type LoyaltyRewardDraft,
} from '../../utils/loyaltyRewards';

interface ProgramResponse {
  is_open: boolean;
  program: { status: 'inactive' | 'active' | 'blocked'; points_per_order: number; blocked_reason: string | null; activated_at: string | null } | null;
  rewards: LoyaltyReward[];
}

interface Member { id: number; name: string; balance: number; reserved: number; earned: number; spent: number; last_activity_at: string | null }

interface Analytics {
  active_members: number;
  returning_members: number;
  points_earned: number;
  points_used: number;
  redemptions_used: number;
  usage_rate: number | null;
  daily: { date: string; earned: number; used: number }[];
}

const PERIODS = [7, 30, 90];
const formatPoints = (value: number) => `${value} point${Math.abs(value) === 1 ? '' : 's'}`;
const getToday = () => new Date().toISOString().slice(0, 10);

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || 'Une erreur est survenue. Réessayez.');
  return data;
}

const STATUS = {
  inactive: { label: 'En pause', className: 'bg-slate-100 text-slate-700' },
  active: { label: 'Actif', className: 'bg-emerald-100 text-emerald-900' },
  blocked: { label: 'Suspendu par MaTable', className: 'bg-rose-100 text-rose-900' },
} as const;

export const LoyaltyTab: React.FC<{ shopId: number; shopName: string; isReadOnly: boolean }> = ({ shopId, shopName, isReadOnly }) => {
  const toast = useToast();
  const base = `/api/shops/${shopId}/loyalty`;
  const [program, setProgram] = useState<ProgramResponse['program']>(null);
  const [drafts, setDrafts] = useState<LoyaltyRewardDraft[]>([]);
  const [savedDrafts, setSavedDrafts] = useState('[]');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [days, setDays] = useState(30);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [activityKey, setActivityKey] = useState(0);
  const newRewardCount = useRef(0);

  const applyProgram = useCallback((data: ProgramResponse) => {
    const next = data.rewards.filter((reward) => reward.is_active).map(toRewardDraft);
    setProgram(data.program);
    setDrafts(next);
    setSavedDrafts(JSON.stringify(next));
    setShowErrors(false);
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      applyProgram(await readJson<ProgramResponse>(`${base}/program`));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Chargement impossible.');
    } finally {
      setIsLoading(false);
    }
  }, [applyProgram, base]);

  useEffect(() => { void load(); }, [load]);

  const hasStarted = Boolean(program?.activated_at);
  useEffect(() => {
    if (!hasStarted) return undefined;
    let active = true;
    readJson<Analytics>(`${base}/analytics?days=${days}`).then((data) => { if (active) setAnalytics(data); }).catch(() => { if (active) setAnalytics(null); });
    return () => { active = false; };
  }, [base, days, hasStarted, activityKey]);
  useEffect(() => {
    if (!hasStarted) return undefined;
    let active = true;
    readJson<{ items: Member[]; next_cursor: number | null }>(`${base}/members`).then((data) => {
      if (!active) return;
      setMembers(data.items);
      setNextCursor(data.next_cursor);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [base, hasStarted, activityKey]);

  const loadMoreMembers = async () => {
    try {
      const data = await readJson<{ items: Member[]; next_cursor: number | null }>(`${base}/members?cursor=${nextCursor}`);
      setMembers((current) => [...current, ...data.items]);
      setNextCursor(data.next_cursor);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Chargement impossible.');
    }
  };

  const today = getToday();
  const status = program?.status || 'inactive';
  const isLocked = isReadOnly || status === 'blocked';
  const hasChanges = JSON.stringify(drafts) !== savedDrafts;
  const offered = drafts.filter((draft) => !getRewardDraftError(draft, today) && isRewardOffered(draft, today));
  const previewReward = [...offered].sort((left, right) => Number(left.cost) - Number(right.cost))[0];

  const updateDraft = (key: string, changes: Partial<LoyaltyRewardDraft>) => setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...changes } : draft)));
  const addDraft = () => {
    newRewardCount.current += 1;
    setDrafts((current) => [...current, { key: `new-${newRewardCount.current}`, id: null, label: '', conditions: '', cost: '5', remaining: '', savedRemaining: null, endsOn: '', isActive: true }]);
  };

  const save = async (nextStatus: 'active' | 'inactive') => {
    if (isSaving) return;
    if (drafts.some((draft) => getRewardDraftError(draft, today))) {
      setShowErrors(true);
      toast.error('Corrigez les récompenses signalées.');
      return;
    }
    if (nextStatus === 'active' && offered.length === 0) {
      toast.error('Ajoutez au moins une récompense disponible.');
      return;
    }
    if (nextStatus === 'active' && status !== 'active') {
      const confirmed = await confirmAction({
        title: hasStarted ? 'Réactiver les points ?' : 'Activer les points ?',
        message: hasStarted
          ? 'Vos clients gagneront de nouveau 1 point par commande remise.'
          : 'Les commandes déjà remises à vos clients inscrits deviennent des points. L’ancienne carte « 5 commandes » est remplacée définitivement.',
        confirmLabel: 'Activer',
      });
      if (!confirmed) return;
    }
    if (nextStatus === 'inactive' && status === 'active') {
      const confirmed = await confirmAction({
        title: 'Mettre les points en pause ?',
        message: 'Vos clients gardent leurs points, mais n’en gagnent plus et ne peuvent plus en réserver. Les codes déjà réservés restent valables.',
        confirmLabel: 'Mettre en pause',
      });
      if (!confirmed) return;
    }
    setIsSaving(true);
    try {
      const wasActive = status === 'active';
      applyProgram(await readJson<ProgramResponse>(`${base}/program`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, points_per_order: program?.points_per_order ?? 1, rewards: drafts.map(toRewardPayload) }),
      }));
      setActivityKey((key) => key + 1);
      toast.success(nextStatus === 'active' ? (wasActive ? 'Récompenses enregistrées.' : 'Les points sont actifs.') : (wasActive ? 'Les points sont en pause.' : 'Récompenses enregistrées.'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div role="status" aria-label="Chargement de la fidélité" className="space-y-3">{[0, 1, 2].map((item) => <div key={item} className="mt-skeleton h-28 rounded-2xl bg-white" aria-hidden="true" />)}</div>;
  if (loadError) {
    return (
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center">
        <p className="text-sm font-bold text-rose-900">{loadError}</p>
        <button type="button" onClick={() => void load()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--mt-green-deep)] px-5 text-sm font-bold text-white"><RotateCcw className="h-4 w-4" aria-hidden="true" /> Réessayer</button>
      </div>
    );
  }

  return (
    <section aria-labelledby="loyalty-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="loyalty-title" className="text-lg font-black text-[var(--mt-green-hover)]">Fidélité</h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS[status].className}`}>{STATUS[status].label}</span>
          </div>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[var(--mt-gray-600)]">
            {status === 'blocked'
              ? `Motif : ${program?.blocked_reason || 'non précisé'}. Contactez l’assistance MaTable.`
              : 'Un client connecté gagne 1 point par commande remise, dans la limite d’une toutes les 2 heures et de 3 par jour. Vous choisissez et financez les récompenses.'}
          </p>
        </div>
        {!isLocked && (
          <button type="button" disabled={isSaving} onClick={() => void save(status === 'active' ? 'inactive' : 'active')} className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold disabled:opacity-50 sm:w-auto ${status === 'active' ? 'border border-[#cbd9d0] bg-white text-[var(--mt-green-deep)]' : 'bg-[var(--mt-green-deep)] text-white'}`}>
            {status === 'active' ? <><Pause className="h-4 w-4" aria-hidden="true" /> Mettre en pause</> : <><Play className="h-4 w-4" aria-hidden="true" /> {hasStarted ? 'Réactiver' : 'Activer les points'}</>}
          </button>
        )}
      </div>

      {hasStarted && !isReadOnly && status !== 'blocked' && <LoyaltyCodeForm shopId={shopId} onUsed={() => setActivityKey((key) => key + 1)} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.8fr)] xl:items-start">
        <section aria-labelledby="loyalty-rewards-title" className="min-w-0 rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:p-5">
          <h3 id="loyalty-rewards-title" className="font-extrabold text-[#183b31]">Vos récompenses</h3>
          {drafts.length === 0 && <p className="mt-2 text-sm leading-6 text-[var(--mt-gray-600)]">Ajoutez une première récompense, par exemple « Jus offert » pour 5 points.</p>}
          <ul className="mt-3 space-y-3">
            {drafts.map((draft, index) => {
              const error = showErrors ? getRewardDraftError(draft, today) : null;
              return (
                <li key={draft.key} className={`rounded-2xl border p-3 sm:p-4 ${error ? 'border-rose-300 bg-rose-50/50' : 'border-[#ebe5da] bg-[#fdfcf9]'}`}>
                  <fieldset disabled={isLocked || isSaving} className="min-w-0">
                    <legend className="sr-only">Récompense {index + 1}</legend>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
                      <TextField label="Récompense" value={draft.label} maxLength={80} placeholder="Ex. : Jus offert" onChange={(event) => updateDraft(draft.key, { label: event.target.value })} />
                      <TextField label="Points" inputMode="numeric" value={draft.cost} maxLength={2} onChange={(event) => updateDraft(draft.key, { cost: event.target.value.replace(/\D/g, '') })} />
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <TextField label="Quantité restante" optional inputMode="numeric" value={draft.remaining} maxLength={6} placeholder="Illimitée" onChange={(event) => updateDraft(draft.key, { remaining: event.target.value.replace(/\D/g, '') })} />
                      <TextField label="Valable jusqu’au" optional type="date" min={today} value={draft.endsOn} onChange={(event) => updateDraft(draft.key, { endsOn: event.target.value })} />
                    </div>
                    <TextField className="mt-3" label="Conditions" optional value={draft.conditions} maxLength={300} placeholder="Ex. : sur place, hors promotions" onChange={(event) => updateDraft(draft.key, { conditions: event.target.value })} />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <p role={error ? 'alert' : undefined} className="text-xs font-bold text-rose-800">{error}</p>
                      {!isLocked && <button type="button" onClick={() => setDrafts((current) => current.filter(({ key }) => key !== draft.key))} className="ml-auto inline-flex min-h-11 items-center gap-1.5 px-2 text-xs font-bold text-[#8a3b12]"><Trash2 className="h-4 w-4" aria-hidden="true" /> Retirer</button>}
                    </div>
                  </fieldset>
                </li>
              );
            })}
          </ul>
          {!isLocked && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={drafts.length >= MAX_LOYALTY_REWARDS} onClick={addDraft} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-[#b9d5ca] px-4 text-sm font-bold text-[var(--mt-green-deep)] disabled:opacity-50"><Plus className="h-4 w-4" aria-hidden="true" /> Ajouter une récompense</button>
              {hasChanges && <button type="button" disabled={isSaving} onClick={() => void save(status === 'active' ? 'active' : 'inactive')} className="min-h-11 rounded-xl bg-[var(--mt-green-deep)] px-5 text-sm font-extrabold text-white disabled:opacity-50">{isSaving ? 'Enregistrement…' : 'Enregistrer'}</button>}
            </div>
          )}
          <p className="mt-3 text-xs leading-5 text-[var(--mt-gray-600)]">Une récompense retirée n’est plus proposée. Les codes déjà réservés restent valables 7 jours.</p>
        </section>

        <section aria-labelledby="loyalty-preview-title" className="rounded-2xl border border-[#d6e5dc] bg-[#f6faf7] p-4 sm:p-5">
          <h3 id="loyalty-preview-title" className="text-xs font-bold text-[var(--mt-gray-600)]">Aperçu côté client</h3>
          {previewReward ? (
            <div className="mt-3 flex items-center gap-3">
              <ProgressRing value={Math.max(1, Math.round(Number(previewReward.cost) * 0.6))} max={Number(previewReward.cost)} label="Exemple de progression" />
              <div className="min-w-0">
                <p className="truncate font-display text-base font-extrabold text-[var(--mt-green-deep)]">{shopName}</p>
                <p className="mt-0.5 text-sm font-bold text-[var(--mt-gray-900)]">{previewReward.label.trim()}</p>
                <p className="text-xs text-[var(--mt-gray-600)]">{formatPoints(Number(previewReward.cost))}{previewReward.conditions.trim() ? ` · ${previewReward.conditions.trim()}` : ''}</p>
              </div>
            </div>
          ) : <p className="mt-3 flex items-center gap-2 text-sm text-[var(--mt-gray-600)]"><Gift className="h-5 w-5 shrink-0" aria-hidden="true" /> Ajoutez une récompense pour voir l’aperçu.</p>}
        </section>
      </div>

      {hasStarted && (
        <>
          <section aria-labelledby="loyalty-figures-title" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="loyalty-figures-title" className="font-extrabold text-[#183b31]">Vos chiffres</h3>
              <div role="group" aria-label="Période" className="inline-flex rounded-full border border-[#d9dfd7] bg-white p-1">
                {PERIODS.map((period) => <button key={period} type="button" aria-pressed={days === period} onClick={() => setDays(period)} className={`min-h-10 rounded-full px-4 text-xs font-bold ${days === period ? 'bg-[var(--mt-green-deep)] text-white' : 'text-[var(--mt-gray-600)]'}`}>{period} j</button>)}
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
              {[
                ['Clients actifs', analytics?.active_members],
                ['Clients revenus', analytics?.returning_members],
                ['Points gagnés', analytics?.points_earned],
                ['Points utilisés', analytics?.points_used],
                ['Récompenses remises', analytics?.redemptions_used],
                ['Codes utilisés', analytics ? (analytics.usage_rate === null ? '—' : `${analytics.usage_rate} %`) : undefined],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-[#e7dfd3] bg-white p-3">
                  <dt className="text-xs font-semibold leading-4 text-[var(--mt-gray-600)]">{label}</dt>
                  <dd className="mt-1 text-xl font-black tabular-nums text-[var(--mt-green-hover)]"><AnimatedNumber>{value ?? '…'}</AnimatedNumber></dd>
                </div>
              ))}
            </dl>
            {analytics && (
              <div className="grid gap-3 xl:grid-cols-2">
                <TrendChart title="Points gagnés" description={`Par jour, sur ${days} jours`} points={toDailyPoints(analytics.daily, (row) => row.earned)} color={CHART_COLORS.green} formatValue={String} emptyMessage="Aucun point sur cette période." />
                <TrendChart title="Points utilisés" description={`Par jour, sur ${days} jours`} points={toDailyPoints(analytics.daily, (row) => row.used)} color={CHART_COLORS.rust} formatValue={String} emptyMessage="Aucune récompense sur cette période." />
              </div>
            )}
          </section>

          <section aria-labelledby="loyalty-members-title" className="rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:p-5">
            <h3 id="loyalty-members-title" className="font-extrabold text-[#183b31]">Clients fidèles</h3>
            {members.length === 0 ? <p className="mt-2 text-sm text-[var(--mt-gray-600)]">Vos clients apparaîtront ici après leur première commande remise.</p> : (
              <ul className="mt-2 divide-y divide-[#eee8dc]">
                {members.map((member) => (
                  <li key={member.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-[var(--mt-gray-900)]">{member.name}</span>
                      <span className="block text-xs text-[var(--mt-gray-600)]">{formatPoints(member.earned)} gagné{member.earned === 1 ? '' : 's'} · {member.spent} utilisé{member.spent === 1 ? '' : 's'}{member.last_activity_at ? ` · ${new Date(member.last_activity_at).toLocaleDateString('fr-FR')}` : ''}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-base font-black tabular-nums text-[var(--mt-green-hover)]">{member.balance}</span>
                      {member.reserved > 0 && <span className="block text-[11px] font-semibold text-[#8a5a12]">dont {member.reserved} réservé{member.reserved === 1 ? '' : 's'}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {nextCursor !== null && <button type="button" onClick={() => void loadMoreMembers()} className="mt-2 min-h-11 w-full rounded-xl border border-[#cbd9d0] text-sm font-bold text-[var(--mt-green-deep)]">Voir plus</button>}
          </section>
        </>
      )}
    </section>
  );
};
