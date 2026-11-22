import React, { useState } from 'react';
import { CheckCircle2, Ticket } from 'lucide-react';

/** Valide le code présenté par le client : c’est le seul moment où ses points sont débités. */
export const LoyaltyCodeForm: React.FC<{ shopId: number; onUsed?: () => void }> = ({ shopId, onUsed }) => {
  const [code, setCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/shops/${shopId}/loyalty/redemptions/confirm`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await response.json() as { error?: string; points?: number };
      if (!response.ok) throw new Error(data.error || 'Le code n’a pas pu être validé. Réessayez.');
      setCode('');
      setMessage({ type: 'success', text: `Récompense validée : ${data.points} point${data.points === 1 ? '' : 's'} utilisé${data.points === 1 ? '' : 's'}. Remettez-la au client.` });
      onUsed?.();
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Le code n’a pas pu être validé. Réessayez.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#d6e5dc] bg-[#f0f8f4] p-4">
      <label htmlFor="loyalty-code" className="flex items-center gap-2 text-sm font-extrabold text-[var(--mt-green-deep)]"><Ticket className="h-4 w-4" aria-hidden="true" /> Code du client</label>
      <p className="mt-1 text-xs leading-5 text-[var(--mt-gray-600)]">Demandez son code au client, puis remettez la récompense une fois le code accepté.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          id="loyalty-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="8 caractères"
          aria-describedby="loyalty-code-message"
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-[#cbd9d0] bg-white px-3 text-base font-black tracking-[0.18em] text-[var(--mt-gray-900)] outline-none placeholder:font-semibold placeholder:tracking-normal focus:border-[var(--mt-green-primary)] focus:ring-2 focus:ring-[var(--mt-green-primary)]/20"
        />
        <button type="submit" disabled={isSaving || code.length !== 8} className="min-h-12 rounded-xl bg-[var(--mt-green-deep)] px-5 text-sm font-extrabold text-white disabled:opacity-50">{isSaving ? 'Vérification…' : 'Valider'}</button>
      </div>
      <p id="loyalty-code-message" role={message?.type === 'error' ? 'alert' : 'status'} className={`mt-2 flex items-center gap-1.5 text-sm font-bold empty:hidden ${message?.type === 'error' ? 'text-rose-800' : 'text-emerald-800'}`}>
        {message && <>{message.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}{message.text}</>}
      </p>
    </form>
  );
};
