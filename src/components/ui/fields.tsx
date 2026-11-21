// Kit de champs de formulaire partagé : un seul aspect et un seul comportement
// pour tous les formulaires (48 px de haut, texte en 16 px, erreurs sous le champ).
import React, { useId, useRef, useState } from 'react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Validation : messages en français, affichés sous le champ           */
/* ------------------------------------------------------------------ */

type ValidatableElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function defaultValidationMessage(element: ValidatableElement, invalidMessage?: string): string {
  const { validity } = element;
  if (validity.valueMissing) {
    return element instanceof HTMLSelectElement ? 'Choisissez une option.' : 'Ce champ est obligatoire.';
  }
  if (invalidMessage) return invalidMessage;
  if (validity.typeMismatch && element.type === 'email') return 'Saisissez une adresse e-mail valide, par exemple vous@exemple.ci.';
  if (validity.tooShort && 'minLength' in element) return `Saisissez au moins ${element.minLength} caractères.`;
  if (validity.rangeUnderflow && 'min' in element) return `La valeur minimale est ${element.min}.`;
  if (validity.rangeOverflow && 'max' in element) return `La valeur maximale est ${element.max}.`;
  if (validity.customError) return element.validationMessage;
  return 'Vérifiez ce champ.';
}

/**
 * Remplace les bulles natives du navigateur : le message s’affiche sous le champ,
 * à la sortie du champ et à l’envoi du formulaire ; le premier champ en erreur
 * est amené à l’écran et reçoit le focus.
 */
function useInlineValidation(invalidMessage?: string, externalError?: string) {
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);

  const check = (element: ValidatableElement) => {
    setMessage(element.validity.valid ? '' : defaultValidationMessage(element, invalidMessage));
  };

  const handlers = {
    onBlur: (event: React.FocusEvent<ValidatableElement>) => {
      setTouched(true);
      check(event.currentTarget);
    },
    onInvalid: (event: React.FormEvent<ValidatableElement>) => {
      event.preventDefault();
      const element = event.currentTarget;
      setTouched(true);
      check(element);
      // `:invalid` vise aussi les <fieldset> : on ne garde que les vrais champs.
      const firstInvalid = element.form?.querySelector<ValidatableElement>('input:invalid, select:invalid, textarea:invalid');
      if (!firstInvalid || firstInvalid === element) {
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
        element.focus({ preventScroll: true });
      }
    },
    // Une fois l’erreur affichée, elle disparaît dès que la saisie devient valide.
    revalidate: (element: ValidatableElement) => {
      if (touched && message) check(element);
    },
  };

  return { error: externalError || (touched ? message : ''), handlers };
}

/* ------------------------------------------------------------------ */
/* Habillage commun : intitulé, aide, erreur                            */
/* ------------------------------------------------------------------ */

interface FieldFrameProps {
  id: string;
  label: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  /** Information alignée à droite de l’intitulé (compteur de caractères…). */
  aside?: React.ReactNode;
  children: React.ReactNode;
}

export function FieldFrame({ id, label, required, optional, hint, error, className = '', aside, children }: FieldFrameProps) {
  return (
    <div className={`mt-field ${className}`}>
      <label htmlFor={id} className="mt-field-label">
        {label}
        {required && <span aria-hidden="true" className="mt-field-required">*</span>}
        {optional && <span className="mt-field-optional">facultatif</span>}
        {aside}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-field-error" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: React.ReactNode) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

interface CommonFieldProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** Erreur imposée de l’extérieur (réponse serveur, règle métier). */
  error?: string;
  /** Message affiché quand le format ne correspond pas (pattern, minLength…). */
  invalidMessage?: string;
  optional?: boolean;
  className?: string;
}

/* ------------------------------------------------------------------ */
/* Texte, e-mail, mot de passe                                          */
/* ------------------------------------------------------------------ */

type TextFieldProps = CommonFieldProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  leadingIcon?: React.ReactNode;
};

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error: externalError, invalidMessage, optional, className, leadingIcon, id: providedId, type = 'text', onChange, onBlur, ...inputProps },
  ref,
) {
  const generatedId = useId();
  const id = providedId || generatedId;
  const [revealed, setRevealed] = useState(false);
  const { error, handlers } = useInlineValidation(invalidMessage, externalError);
  const isPassword = type === 'password';

  return (
    <FieldFrame id={id} label={label} required={inputProps.required} optional={optional} hint={hint} error={error} className={className}>
      <div className="mt-input-wrap">
        {leadingIcon && <span className="mt-input-icon" aria-hidden="true">{leadingIcon}</span>}
        <input
          ref={ref}
          id={id}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy(id, error, hint)}
          className={`mt-input ${leadingIcon ? 'mt-input-with-icon' : ''} ${isPassword ? 'mt-input-with-action' : ''}`}
          onChange={(event) => { onChange?.(event); handlers.revalidate(event.currentTarget); }}
          onBlur={(event) => { handlers.onBlur(event); onBlur?.(event); }}
          onInvalid={handlers.onInvalid}
          {...inputProps}
        />
        {isPassword && (
          <button type="button" className="mt-input-action" onClick={() => setRevealed((value) => !value)} aria-label={revealed ? 'Masquer' : 'Afficher'} aria-pressed={revealed}>
            {revealed ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
          </button>
        )}
      </div>
    </FieldFrame>
  );
});

/* ------------------------------------------------------------------ */
/* Texte long                                                           */
/* ------------------------------------------------------------------ */

type TextAreaFieldProps = CommonFieldProps & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & {
  /** Affiche le compteur « 46 / 200 » quand maxLength est fourni. */
  showCount?: boolean;
};

export function TextAreaField({ label, hint, error: externalError, invalidMessage, optional, className, showCount = true, id: providedId, onChange, onBlur, ...props }: TextAreaFieldProps) {
  const generatedId = useId();
  const id = providedId || generatedId;
  const { error, handlers } = useInlineValidation(invalidMessage, externalError);
  const length = String(props.value ?? '').length;
  return (
    <FieldFrame
      id={id}
      label={label}
      aside={showCount && props.maxLength ? <span className="mt-field-count">{length} / {props.maxLength}</span> : null}
      required={props.required}
      optional={optional}
      hint={hint}
      error={error}
      className={className}
    >
      <textarea
        id={id}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy(id, error, hint)}
        className="mt-input mt-textarea"
        onChange={(event) => { onChange?.(event); handlers.revalidate(event.currentTarget); }}
        onBlur={(event) => { handlers.onBlur(event); onBlur?.(event); }}
        onInvalid={handlers.onInvalid}
        {...props}
      />
    </FieldFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Liste déroulante                                                     */
/* ------------------------------------------------------------------ */

type SelectFieldProps = CommonFieldProps & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'className'>;

export function SelectField({ label, hint, error: externalError, invalidMessage, optional, className, id: providedId, children, onChange, onBlur, ...props }: SelectFieldProps) {
  const generatedId = useId();
  const id = providedId || generatedId;
  const { error, handlers } = useInlineValidation(invalidMessage, externalError);
  return (
    <FieldFrame id={id} label={label} required={props.required} optional={optional} hint={hint} error={error} className={className}>
      <div className="mt-input-wrap mt-select-wrap">
        <select
          id={id}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy(id, error, hint)}
          className="mt-input mt-select"
          onChange={(event) => { onChange?.(event); handlers.revalidate(event.currentTarget); }}
          onBlur={(event) => { handlers.onBlur(event); onBlur?.(event); }}
          onInvalid={handlers.onInvalid}
          {...props}
        >
          {children}
        </select>
      </div>
    </FieldFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Téléphone ivoirien : +225 fixe, chiffres groupés par deux            */
/* ------------------------------------------------------------------ */

/** Garde les 10 chiffres locaux, quel que soit le format reçu (+225…, 00225…, espaces). */
export function toLocalIvorianDigits(value: string): string {
  const compact = String(value ?? '').replace(/[\s.-]/g, '');
  let digits = compact.replace(/\D/g, '');
  // Indicatif écrit explicitement (+225…, 00225…) : on le retire, même si le numéro est encore partiel.
  if (compact.startsWith('+225')) digits = digits.slice(3);
  else if (compact.startsWith('00225')) digits = digits.slice(5);
  else if (digits.startsWith('225') && digits.length > 10) digits = digits.slice(3);
  return digits.slice(0, 10);
}

export function formatIvorianDigits(digits: string): string {
  return digits.replace(/(\d{2})(?=\d)/g, '$1 ');
}

export function isCompleteIvorianPhone(value: string): boolean {
  return /^(01|05|07)\d{8}$/.test(toLocalIvorianDigits(value));
}

type PhoneFieldProps = CommonFieldProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className' | 'value' | 'onChange' | 'type'> & {
  value: string;
  /** Reçoit « +225 07 11 22 33 44 » (partiel pendant la saisie, vide si le champ est vide). */
  onValueChange: (value: string) => void;
};

export function PhoneField({ label, hint, error: externalError, optional, className, id: providedId, value, onValueChange, onBlur, required, ...props }: PhoneFieldProps) {
  const generatedId = useId();
  const id = providedId || generatedId;
  const inputRef = useRef<HTMLInputElement>(null);
  const invalidMessage = 'Saisissez les 10 chiffres du numéro, en commençant par 01, 05 ou 07.';
  const { error, handlers } = useInlineValidation(invalidMessage, externalError);
  const digits = toLocalIvorianDigits(value);

  // La validité suit la règle du serveur (01, 05 ou 07 suivis de 8 chiffres).
  const syncValidity = (element: HTMLInputElement, nextDigits: string) => {
    element.setCustomValidity(nextDigits && !/^(01|05|07)\d{8}$/.test(nextDigits) ? invalidMessage : '');
  };

  return (
    <FieldFrame id={id} label={label} required={required} optional={optional} hint={hint} error={error} className={className}>
      <div className="mt-input-wrap">
        <span className="mt-input-prefix" aria-hidden="true">+225</span>
        <input
          ref={inputRef}
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="07 00 00 00 00"
          required={required}
          value={formatIvorianDigits(digits)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy(id, error, hint)}
          className="mt-input mt-input-with-prefix tabular-nums"
          onChange={(event) => {
            const nextDigits = toLocalIvorianDigits(event.target.value);
            syncValidity(event.currentTarget, nextDigits);
            onValueChange(nextDigits ? `+225 ${formatIvorianDigits(nextDigits)}` : '');
            handlers.revalidate(event.currentTarget);
          }}
          onBlur={(event) => { syncValidity(event.currentTarget, toLocalIvorianDigits(event.currentTarget.value)); handlers.onBlur(event); onBlur?.(event); }}
          onInvalid={(event) => { syncValidity(event.currentTarget, toLocalIvorianDigits(event.currentTarget.value)); handlers.onInvalid(event); }}
          {...props}
        />
      </div>
    </FieldFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Montant en FCFA : séparateur des milliers, suffixe, clavier chiffré  */
/* ------------------------------------------------------------------ */

const amountFormatter = new Intl.NumberFormat('fr-FR');

type AmountFieldProps = CommonFieldProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className' | 'value' | 'onChange' | 'type' | 'min' | 'max'> & {
  value: number | '';
  onValueChange: (value: number | '') => void;
  min?: number;
  max?: number;
};

export function AmountField({ label, hint, error: externalError, invalidMessage, optional, className, id: providedId, value, onValueChange, min, max, onBlur, required, ...props }: AmountFieldProps) {
  const generatedId = useId();
  const id = providedId || generatedId;
  const { error, handlers } = useInlineValidation(invalidMessage, externalError);

  const syncValidity = (element: HTMLInputElement, amount: number | '') => {
    let message = '';
    if (amount !== '' && min !== undefined && amount < min) message = `Le montant minimal est ${amountFormatter.format(min)} FCFA.`;
    if (amount !== '' && max !== undefined && amount > max) message = invalidMessage || `Le montant maximal est ${amountFormatter.format(max)} FCFA.`;
    element.setCustomValidity(message);
  };

  return (
    <FieldFrame id={id} label={label} required={required} optional={optional} hint={hint} error={error} className={className}>
      <div className="mt-input-wrap">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          required={required}
          value={value === '' ? '' : amountFormatter.format(value)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy(id, error, hint)}
          className="mt-input mt-input-with-suffix font-bold tabular-nums"
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '').slice(0, 9);
            const amount = digits === '' ? '' : Number(digits);
            syncValidity(event.currentTarget, amount);
            onValueChange(amount);
            handlers.revalidate(event.currentTarget);
          }}
          onBlur={(event) => { syncValidity(event.currentTarget, value); handlers.onBlur(event); onBlur?.(event); }}
          onInvalid={(event) => { syncValidity(event.currentTarget, value); handlers.onInvalid(event); }}
          {...props}
        />
        <span className="mt-input-suffix" aria-hidden="true">FCFA</span>
      </div>
    </FieldFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Code (PIN, code reçu par e-mail) : une case par chiffre              */
/* ------------------------------------------------------------------ */

type CodeFieldProps = CommonFieldProps & {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  length: number;
  /** Masque les chiffres (PIN) ; un bouton permet de les afficher. */
  secret?: boolean;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  name?: string;
};

export function CodeField({ label, hint, error: externalError, optional, className, id: providedId, value, onValueChange, length, secret = false, required, autoComplete = 'one-time-code', autoFocus, disabled, name }: CodeFieldProps) {
  const generatedId = useId();
  const id = providedId || generatedId;
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const invalidMessage = `Saisissez les ${length} chiffres.`;
  const { error, handlers } = useInlineValidation(invalidMessage, externalError);
  const chars = value.slice(0, length).split('');
  const activeIndex = Math.min(chars.length, length - 1);

  return (
    <FieldFrame id={id} label={label} required={required} optional={optional} hint={hint} error={error} className={className}>
      <div className="mt-code">
        <div className="mt-code-boxes" aria-hidden="true">
          {Array.from({ length }, (_, index) => (
            <span key={index} className={`mt-code-box ${focused && index === activeIndex ? 'is-active' : ''} ${chars[index] ? 'is-filled' : ''} ${error ? 'is-error' : ''}`}>
              {chars[index] ? (secret && !revealed ? '•' : chars[index]) : ''}
            </span>
          ))}
        </div>
        {/* Un seul vrai champ, invisible, posé sur les cases : collage et remplissage automatique fonctionnent. */}
        <input
          id={id}
          name={name}
          type={secret && !revealed ? 'password' : 'text'}
          inputMode="numeric"
          autoComplete={autoComplete}
          pattern={`[0-9]{${length}}`}
          minLength={length}
          maxLength={length}
          required={required}
          autoFocus={autoFocus}
          disabled={disabled}
          value={value}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy(id, error, hint)}
          className="mt-code-input"
          onChange={(event) => { onValueChange(event.target.value.replace(/\D/g, '').slice(0, length)); handlers.revalidate(event.currentTarget); }}
          onFocus={() => setFocused(true)}
          onBlur={(event) => { setFocused(false); handlers.onBlur(event); }}
          onInvalid={handlers.onInvalid}
        />
        {secret && (
          <button type="button" className="mt-code-reveal" onClick={() => setRevealed((shown) => !shown)} aria-label={revealed ? 'Masquer le code' : 'Afficher le code'} aria-pressed={revealed}>
            {revealed ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
          </button>
        )}
      </div>
    </FieldFrame>
  );
}

/* ------------------------------------------------------------------ */
/* Choix sous forme de cartes (remplace les listes de 2 à 4 options)    */
/* ------------------------------------------------------------------ */

export interface ChoiceOption<T extends string> {
  value: T;
  label: React.ReactNode;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  icon?: React.ReactNode;
}

interface ChoiceCardsProps<T extends string> {
  legend: React.ReactNode;
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: ChoiceOption<T>[];
  /** Nombre de colonnes sur mobile (1 pour des cartes détaillées, 2 pour des choix courts). */
  columns?: 1 | 2;
  hint?: React.ReactNode;
  className?: string;
}

export function ChoiceCards<T extends string>({ legend, name, value, onChange, options, columns = 1, hint, className = '' }: ChoiceCardsProps<T>) {
  return (
    <fieldset className={`mt-field ${className}`}>
      <legend className="mt-field-label">{legend}</legend>
      <div className={`grid gap-2 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label key={option.value} className={`mt-choice ${checked ? 'is-checked' : ''}`}>
              <input type="radio" name={name} value={option.value} checked={checked} onChange={() => onChange(option.value)} className="mt-choice-input" />
              {option.icon && <span className="mt-choice-icon" aria-hidden="true">{option.icon}</span>}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="mt-choice-label">{option.label}</span>
                  {option.aside && <span className="mt-choice-aside">{option.aside}</span>}
                </span>
                {option.description && <span className="mt-choice-description">{option.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {hint && <p className="mt-field-hint">{hint}</p>}
    </fieldset>
  );
}
