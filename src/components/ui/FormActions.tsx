// Actions de formulaire partagées : bouton d’envoi avec indicateur de chargement,
// barre d’action collante en bas d’écran sur mobile, suivi d’un envoi asynchrone.
import React, { useCallback, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

/**
 * Enveloppe un gestionnaire d’envoi asynchrone : expose `pending` pendant l’appel,
 * puis `done` deux secondes si le gestionnaire renvoie `true`.
 * Les doubles appuis sont ignorés tant qu’un envoi est en cours.
 */
export function useSubmitting() {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const running = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const wrap = useCallback(<E extends { preventDefault?: () => void }>(handler: (event: E) => unknown) => async (event: E) => {
    if (running.current) {
      event.preventDefault?.();
      return;
    }
    running.current = true;
    setPending(true);
    setDone(false);
    window.clearTimeout(timer.current);
    try {
      // La coche n’apparaît que si le gestionnaire confirme explicitement le succès (true).
      if ((await handler(event)) === true) {
        setDone(true);
        timer.current = window.setTimeout(() => setDone(false), 2000);
      }
    } finally {
      running.current = false;
      setPending(false);
    }
  }, []);

  return { pending, done, wrap };
}

type SubmitButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  pending?: boolean;
  /** Affiche brièvement une coche après un envoi réussi. */
  done?: boolean;
  label: string;
  pendingLabel?: string;
  doneLabel?: string;
  tone?: 'primary' | 'secondary';
};

export function SubmitButton({ pending = false, done = false, label, pendingLabel = 'Enregistrement…', doneLabel = 'Enregistré', tone = 'primary', className = '', disabled, type = 'submit', ...props }: SubmitButtonProps) {
  const base = tone === 'primary'
    ? 'bg-[var(--mt-green-primary)] text-white hover:bg-[var(--mt-green-hover)]'
    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50';
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold shadow-sm transition-[background-color,transform,opacity] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${base} ${className}`}
      {...props}
    >
      {pending
        ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        : done ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
      <span>{pending ? pendingLabel : done ? doneLabel : label}</span>
      {/* Annonce discrète pour les lecteurs d’écran. */}
      <span className="sr-only" role="status" aria-live="polite">{done ? doneLabel : ''}</span>
    </button>
  );
}

/**
 * Barre d’action collée en bas de l’écran sur mobile (au-dessus de la barre de navigation
 * de l’espace commerçant quand `aboveNav` est vrai), en ligne sur grand écran.
 */
export function StickyActionBar({ children, aboveNav = false, className = '' }: { children: React.ReactNode; aboveNav?: boolean; className?: string }) {
  return (
    <div className={`mt-action-bar ${aboveNav ? 'mt-action-bar-above-nav' : ''} ${className}`}>
      {children}
    </div>
  );
}
