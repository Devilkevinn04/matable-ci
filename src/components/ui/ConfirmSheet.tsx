// Feuille de confirmation MaTable : remplace window.confirm() et window.prompt().
// Usage : `if (!(await confirmAction({ title, message, confirmLabel }))) return;`
//         `const reason = await askReason({ title, ... }); if (reason === null) return;`
// <ConfirmHost /> est monté une seule fois à la racine de l’application.
import React, { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { lockBodyScroll } from '../../utils/scrollLock';

export type ConfirmTone = 'danger' | 'default';

export interface ConfirmOptions {
  title: string;
  /** Conséquence de l’action, en une ou deux phrases. */
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** « danger » : bouton rouge, pour ce qui supprime, suspend, refuse ou annule. */
  tone?: ConfirmTone;
}

export interface ReasonOptions extends ConfirmOptions {
  reasonLabel?: string;
  /** Motifs proposés en un geste ; le texte reste modifiable. */
  suggestions?: string[];
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
}

type Request =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'reason'; options: ReasonOptions; resolve: (value: string | null) => void };

/* -------- petit magasin global : un seul dialogue à la fois -------- */
let current: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function open(request: Request) {
  // Une nouvelle demande annule la précédente plutôt que de l’empiler.
  if (current) settle(null);
  current = request;
  emit();
}

function settle(value: boolean | string | null) {
  const request = current;
  current = null;
  emit();
  if (!request) return;
  if (request.kind === 'confirm') request.resolve(value === true);
  else request.resolve(typeof value === 'string' ? value : null);
}

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => open({ kind: 'confirm', options, resolve }));
}

export function askReason(options: ReasonOptions): Promise<string | null> {
  return new Promise((resolve) => open({ kind: 'reason', options, resolve }));
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/* -------- vue -------- */

interface ConfirmSheetViewProps {
  options: ReasonOptions;
  withReason: boolean;
  onCancel: () => void;
  onConfirm: (reason?: string) => void;
}

export function ConfirmSheetView({ options, withReason, onCancel, onConfirm }: ConfirmSheetViewProps) {
  const titleId = useId();
  const messageId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [showError, setShowError] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  // Référence stable : l’effet ci-dessous ne doit s’exécuter qu’à l’ouverture.
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const tone = options.tone ?? 'default';
  const minLength = options.minLength ?? 3;
  const maxLength = options.maxLength ?? 500;
  const trimmed = reason.trim();
  const reasonValid = trimmed.length >= minLength && trimmed.length <= maxLength;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Le focus part sur « Annuler » : pas de validation par réflexe, et sur mobile le clavier
    // ne s’ouvre pas tout de suite, ce qui laisse les motifs suggérés visibles.
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancelRef.current(); };
    document.addEventListener('keydown', onKey);
    const unlockScroll = lockBodyScroll();
    return () => {
      document.removeEventListener('keydown', onKey);
      unlockScroll();
      previouslyFocused?.focus?.();
    };
  }, [withReason]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (withReason && !reasonValid) {
      setShowError(true);
      reasonRef.current?.focus();
      return;
    }
    onConfirm(withReason ? trimmed : undefined);
  };

  const Icon = tone === 'danger' ? AlertTriangle : HelpCircle;

  return createPortal(
    <div className="mt-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <form
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={options.message ? messageId : undefined}
        className="mt-confirm-sheet"
        onSubmit={submit}
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
        <div className="flex items-start gap-3">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${tone === 'danger' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-[var(--mt-green-deep)]'}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 id={titleId} className="text-lg font-extrabold leading-snug text-slate-900">{options.title}</h2>
            {options.message && <div id={messageId} className="mt-1 text-sm leading-6 text-slate-600">{options.message}</div>}
          </div>
        </div>

        {withReason && (
          <div className="mt-5">
            {options.suggestions && options.suggestions.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Motifs fréquents">
                {options.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    aria-pressed={trimmed === suggestion}
                    onClick={() => { setReason(suggestion); setShowError(false); reasonRef.current?.focus(); }}
                    className={`min-h-10 rounded-full border px-3.5 text-sm font-semibold transition ${trimmed === suggestion ? 'border-[var(--mt-green-deep)] bg-[var(--mt-green-deep)] text-white' : 'border-[#ddd6ca] bg-white text-slate-700 hover:border-[#c9c1b3]'}`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <label htmlFor={reasonId} className="mt-field-label">
              {options.reasonLabel ?? 'Motif'}
              <span aria-hidden="true" className="mt-field-required">*</span>
              <span className="mt-field-count">{trimmed.length} / {maxLength}</span>
            </label>
            <textarea
              ref={reasonRef}
              id={reasonId}
              rows={3}
              maxLength={maxLength}
              value={reason}
              placeholder={options.placeholder ?? 'Expliquez en quelques mots'}
              aria-invalid={showError && !reasonValid ? true : undefined}
              aria-describedby={showError && !reasonValid ? `${reasonId}-error` : undefined}
              onChange={(event) => { setReason(event.target.value); if (showError) setShowError(false); }}
              className="mt-input mt-textarea mt-1.5"
            />
            {showError && !reasonValid && (
              <p id={`${reasonId}-error`} className="mt-field-error mt-1.5" role="alert">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Saisissez un motif d’au moins {minLength} caractères.</span>
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" onClick={onCancel} className="min-h-12 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
            {options.cancelLabel ?? 'Annuler'}
          </button>
          <button
            type="submit"
            className={`min-h-12 rounded-xl px-5 text-sm font-bold text-white transition active:scale-[0.98] ${tone === 'danger' ? 'bg-rose-700 hover:bg-rose-800' : 'bg-[var(--mt-green-deep)] hover:bg-[var(--mt-green-hover)]'}`}
          >
            {options.confirmLabel ?? 'Confirmer'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

export function ConfirmHost() {
  const request = useSyncExternalStore(subscribe, () => current, () => null);
  if (!request) return null;
  return (
    <ConfirmSheetView
      key={String(request.options.title)}
      options={request.options}
      withReason={request.kind === 'reason'}
      onCancel={() => settle(null)}
      onConfirm={(reason) => settle(request.kind === 'reason' ? reason ?? '' : true)}
    />
  );
}
