export const MAX_LOYALTY_REWARDS = 10;

export interface LoyaltyReward {
  id: number;
  label: string;
  conditions: string;
  cost_points: number;
  remaining: number | null;
  ends_at: string | null;
  is_active: boolean;
}

/** Saisie du commerçant : tout est texte tant que rien n’est enregistré. */
export interface LoyaltyRewardDraft {
  key: string;
  id: number | null;
  label: string;
  conditions: string;
  cost: string;
  remaining: string;
  savedRemaining: number | null;
  endsOn: string;
  isActive: boolean;
}

export const toRewardDraft = (reward: LoyaltyReward): LoyaltyRewardDraft => ({
  key: `reward-${reward.id}`,
  id: reward.id,
  label: reward.label,
  conditions: reward.conditions,
  cost: String(reward.cost_points),
  remaining: reward.remaining === null ? '' : String(reward.remaining),
  savedRemaining: reward.remaining,
  endsOn: reward.ends_at ? reward.ends_at.slice(0, 10) : '',
  isActive: reward.is_active,
});

const isWholeNumber = (value: string, minimum: number, maximum: number) => /^\d+$/.test(value.trim())
  && Number(value) >= minimum && Number(value) <= maximum;

export function getRewardDraftError(draft: LoyaltyRewardDraft, today: string): string | null {
  if (draft.label.trim().length < 3) return 'Décrivez la récompense en 3 caractères au moins.';
  if (!isWholeNumber(draft.cost, 1, 50)) return 'Indiquez entre 1 et 50 points.';
  if (draft.remaining.trim() && !isWholeNumber(draft.remaining, 0, 100_000)) return 'La quantité doit être un nombre entier.';
  if (draft.endsOn && draft.isActive && draft.endsOn < today) return 'La date de fin est déjà passée.';
  return null;
}

/** La date choisie est incluse : la récompense reste valable jusqu’à minuit, heure d’Abidjan (UTC). */
export const toRewardPayload = (draft: LoyaltyRewardDraft) => ({
  ...(draft.id === null ? {} : { id: draft.id }),
  label: draft.label.trim(),
  conditions: draft.conditions.trim(),
  cost_points: Number(draft.cost),
  remaining: draft.remaining.trim() ? Number(draft.remaining) : null,
  ...(draft.savedRemaining === null ? {} : { previous_remaining: draft.savedRemaining }),
  ends_at: draft.endsOn ? `${draft.endsOn}T23:59:59.999Z` : null,
  is_active: draft.isActive,
});

export const isRewardOffered = (draft: LoyaltyRewardDraft, today: string) => draft.isActive
  && draft.remaining.trim() !== '0'
  && (!draft.endsOn || draft.endsOn >= today);
