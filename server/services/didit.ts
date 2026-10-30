import { createHmac, timingSafeEqual } from 'node:crypto';

export const DIDIT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DiditSessionResponse {
  session_id: string;
  status: string;
  url: string;
}

export interface DiditWebhookEvent {
  event_id: string;
  session_id: string;
  status: string;
  webhook_type: string;
  timestamp: number;
}

export type DiditWebhookValidation =
  | { ok: true; event: DiditWebhookEvent; timestamp: number }
  | { ok: false; status: number; error: string };

function sortedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sortedJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${sortedJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function signatureMatches(signature: string | undefined, payload: Buffer, secret: string, canonicalPayload?: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(canonicalPayload ?? payload).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(signature.trim().toLowerCase(), 'hex');
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export function resolveDriverWorkflowId(driverWorkflowId?: string, merchantWorkflowId?: string): string | null {
  const driver = String(driverWorkflowId ?? '').trim();
  const merchant = String(merchantWorkflowId ?? '').trim();
  const candidate = driver || merchant;
  return DIDIT_UUID_PATTERN.test(candidate) ? candidate : null;
}

export function mapDiditStatus(status: string): 'verified' | 'rejected' | 'under_review' | 'submitted' | 'pending' {
  if (status === 'Approved') return 'verified';
  if (status === 'Declined') return 'rejected';
  if (status === 'In Review') return 'under_review';
  if (['Expired', 'Kyc Expired', 'Abandoned'].includes(status)) return 'pending';
  return 'submitted';
}

/** Statuts fournisseur qui ne peuvent plus évoluer sans nouvelle session. */
export const DIDIT_FINISHED_STATUSES = ['Approved', 'Declined', 'Expired', 'Kyc Expired', 'Abandoned'] as const;

/** Délai après lequel une session sans webhook est considérée comme abandonnée. */
export const DIDIT_RESUME_AFTER_MS = 30 * 60 * 1000;

/** Plafond de sessions terminées par boutique et par fenêtre de 30 jours. */
export const DIDIT_MAX_FINISHED_SESSIONS_PER_30_DAYS = 3;

/**
 * Une session « en cours » bloque une nouvelle vérification tant que Didit peut
 * encore la faire évoluer. Sans webhook reçu, une session ouverte depuis plus de
 * 30 minutes est considérée comme abandonnée : le marchand peut alors en relancer une.
 */
export function canRestartDiditSession(
  session: { status: string; lastWebhookAt?: string | null; createdAt?: string | null },
  now = Date.now(),
): boolean {
  const mapped = mapDiditStatus(session.status);
  if (mapped !== 'submitted' && mapped !== 'under_review') return true;
  if (session.lastWebhookAt) return false;
  const createdAt = session.createdAt ? Date.parse(session.createdAt) : Number.NaN;
  if (!Number.isFinite(createdAt)) return false;
  return now - createdAt >= DIDIT_RESUME_AFTER_MS;
}

export interface DiditDeclineReason {
  /** Contrôle concerné : document, liveness, face_match, aml… */
  check: string;
  /** Statut du contrôle renvoyé par Didit. */
  status: string;
  /** Codes de risque uniquement, jamais de données personnelles. */
  risks: string[];
}

const DIDIT_DECLINE_CHECKS: ReadonlyArray<{ key: string; check: string }> = [
  { key: 'id_verifications', check: 'document' },
  { key: 'liveness_checks', check: 'liveness' },
  { key: 'face_matches', check: 'face_match' },
  { key: 'nfc_verifications', check: 'nfc' },
  { key: 'poa_verifications', check: 'proof_of_address' },
  { key: 'database_validations', check: 'database' },
  { key: 'aml_screenings', check: 'aml' },
  { key: 'ip_analyses', check: 'ip' },
  { key: 'phone_verifications', check: 'phone' },
  { key: 'email_verifications', check: 'email' },
];

// Les codes de risque sont des constantes en majuscules. Ce filtre garantit
// qu'aucun texte libre (nom, adresse, numéro de pièce) n'est conservé en base.
const DIDIT_RISK_CODE_PATTERN = /^[A-Z0-9_]{1,64}$/;

const DIDIT_RISK_ADVICE: Record<string, string> = {
  IMAGE_TOO_BLURRY: 'La photo de la pièce est floue : refaites-la en gardant le téléphone stable, à la lumière du jour.',
  BLURRY: 'La photo de la pièce est floue : refaites-la en gardant le téléphone stable, à la lumière du jour.',
  LOW_IMAGE_QUALITY: 'La qualité de la photo est insuffisante : nettoyez l’objectif et évitez le zoom.',
  IMAGE_QUALITY_TOO_LOW: 'La qualité de la photo est insuffisante : nettoyez l’objectif et évitez le zoom.',
  IMAGE_TOO_DARK: 'La photo est trop sombre : placez-vous face à une source de lumière.',
  IMAGE_TOO_BRIGHT: 'La photo est surexposée : évitez le flash et les reflets directs.',
  GLARE: 'Un reflet masque la pièce : évitez le flash et inclinez légèrement le document.',
  REFLECTION: 'Un reflet masque la pièce : évitez le flash et inclinez légèrement le document.',
  DOCUMENT_EXPIRED: 'La pièce présentée est expirée : utilisez une pièce en cours de validité.',
  EXPIRED_DOCUMENT: 'La pièce présentée est expirée : utilisez une pièce en cours de validité.',
  DOCUMENT_NOT_FULLY_VISIBLE: 'La pièce est partiellement coupée : montrez les quatre coins et les bords.',
  CRITICAL_FIELD_OCCLUSION: 'Une information essentielle est masquée : ne couvrez pas la pièce avec vos doigts.',
  FACE_NOT_FOUND: 'Le visage n’est pas assez visible : retirez chapeau, masque et lunettes de soleil.',
  NO_FACE: 'Le visage n’est pas assez visible : retirez chapeau, masque et lunettes de soleil.',
  MULTIPLE_FACES: 'Plusieurs visages sont détectés : vérifiez seul, face à la caméra.',
  FACE_MISMATCH: 'La photo et le selfie ne correspondent pas : refaites le selfie avec le visage dégagé.',
  FACE_MATCH_FAILED: 'La photo et le selfie ne correspondent pas : refaites le selfie avec le visage dégagé.',
  LOW_FACE_MATCH_SCORE: 'La ressemblance entre la pièce et le selfie est insuffisante : refaites le selfie sans filtre.',
  LIVENESS_FAILED: 'La vérification de présence a échoué : regardez la caméra sans photo ni écran interposé.',
  SPOOF_DETECTED: 'La vérification de présence a échoué : regardez la caméra sans photo ni écran interposé.',
  PRESENTATION_ATTACK: 'La vérification de présence a échoué : regardez la caméra sans photo ni écran interposé.',
  DOCUMENT_TAMPERING: 'La pièce semble modifiée : présentez le document original, non retouché.',
  UNSUPPORTED_DOCUMENT_TYPE: 'Ce type de document n’est pas accepté : utilisez une CNI, un passeport ou un permis de conduire.',
};

const DIDIT_CHECK_ADVICE: Record<string, string> = {
  document: 'Vérifiez que votre pièce d’identité est originale, valide et entièrement visible, puis recommencez la capture.',
  liveness: 'Refaites la vérification de présence en regardant directement la caméra, dans un endroit bien éclairé.',
  face_match: 'Refaites le selfie sans filtre, avec le visage dégagé, pour que la comparaison avec la pièce soit possible.',
  nfc: 'La lecture de la puce a échoué : réessayez en maintenant la pièce contre le téléphone, ou utilisez la capture photo.',
  proof_of_address: 'Le justificatif de domicile n’a pas été accepté : utilisez un document récent et lisible.',
  database: 'Les informations de la pièce n’ont pas pu être confirmées : vérifiez la saisie ou utilisez un autre document.',
  aml: 'Un contrôle de conformité nécessite une vérification manuelle : contactez l’assistance.',
  ip: 'La connexion utilisée semble à risque : réessayez depuis un réseau mobile ou Wi-Fi habituel, sans VPN.',
  phone: 'Le numéro de téléphone n’a pas pu être vérifié : utilisez un numéro que vous contrôlez.',
  email: 'L’adresse e-mail n’a pas pu être vérifiée : utilisez une adresse valide et réessayez.',
};

/**
 * Extrait d'une décision Didit les seuls statuts de contrôle et codes de risque.
 * Les images, noms, numéros de document et autres données personnelles sont ignorés.
 */
export function extractDiditDeclineReasons(decision: unknown): DiditDeclineReason[] {
  if (!decision || typeof decision !== 'object') return [];
  const source = decision as Record<string, unknown>;
  const reasons: DiditDeclineReason[] = [];
  for (const { key, check } of DIDIT_DECLINE_CHECKS) {
    const items = source[key];
    if (!Array.isArray(items)) continue;
    for (const item of items.slice(0, 10)) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const status = typeof record.status === 'string' ? record.status.slice(0, 40) : '';
      const warnings = Array.isArray(record.warnings) ? record.warnings : [];
      const risks = [...new Set(warnings.flatMap((warning) => {
        if (!warning || typeof warning !== 'object') return [];
        const risk = (warning as Record<string, unknown>).risk;
        return typeof risk === 'string' && DIDIT_RISK_CODE_PATTERN.test(risk) ? [risk] : [];
      }))].slice(0, 10);
      if (!status && risks.length === 0) continue;
      if (status === 'Approved' && risks.length === 0) continue;
      reasons.push({ check, status: status || 'Declined', risks });
    }
  }
  return reasons.slice(0, 30);
}

/** Valide et normalise les raisons stockées en base avant de les renvoyer au client. */
export function parseDiditDeclineReasons(value: unknown): DiditDeclineReason[] {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.check !== 'string' || typeof record.status !== 'string') return [];
    const risks = Array.isArray(record.risks)
      ? record.risks.filter((risk): risk is string => typeof risk === 'string' && DIDIT_RISK_CODE_PATTERN.test(risk)).slice(0, 10)
      : [];
    return [{ check: record.check.slice(0, 40), status: record.status.slice(0, 40), risks }];
  }).slice(0, 30);
}

/** Traduit les codes de risque en conseils actionnables en français. */
export function describeDiditDeclineReasons(reasons: DiditDeclineReason[]): string[] {
  const advice: string[] = [];
  for (const reason of reasons) {
    let matched = false;
    for (const risk of reason.risks) {
      const text = DIDIT_RISK_ADVICE[risk.toUpperCase()];
      if (text) {
        advice.push(text);
        matched = true;
      }
    }
    if (!matched) {
      const fallback = DIDIT_CHECK_ADVICE[reason.check];
      if (fallback) advice.push(fallback);
    }
  }
  return [...new Set(advice)].slice(0, 5);
}

export function isDiditSession(value: unknown): value is DiditSessionResponse {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<DiditSessionResponse>;
  if (typeof session.session_id !== 'string' || !DIDIT_UUID_PATTERN.test(session.session_id)) return false;
  if (typeof session.status !== 'string' || typeof session.url !== 'string') return false;
  try {
    const url = new URL(session.url);
    return url.protocol === 'https:' && url.hostname === 'verify.didit.me';
  } catch {
    return false;
  }
}

export function validateDiditWebhook(
  rawBody: unknown,
  timestampHeader: string | undefined,
  signatureV2: string | undefined,
  signature: string | undefined,
  secret: string,
  now = Date.now(),
  previous: { signatureV2?: string; signature?: string } = {},
): DiditWebhookValidation {
  if (!secret) return { ok: false, status: 503, error: 'Le webhook Didit n’est pas configuré.' };
  if (!Buffer.isBuffer(rawBody)) return { ok: false, status: 400, error: 'Corps webhook invalide.' };

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp) || Math.abs(now / 1000 - timestamp) > 300) {
    return { ok: false, status: 401, error: 'Horodatage webhook invalide ou expiré.' };
  }

  let event: DiditWebhookEvent;
  try {
    event = JSON.parse(rawBody.toString('utf8')) as DiditWebhookEvent;
  } catch {
    return { ok: false, status: 400, error: 'Corps webhook JSON invalide.' };
  }
  if (!Number.isFinite(event.timestamp) || Math.abs(now / 1000 - event.timestamp) > 300) {
    return { ok: false, status: 401, error: 'Horodatage signé du webhook invalide ou expiré.' };
  }

  const canonicalPayload = sortedJson(event);
  // Pendant une rotation de secret, Didit signe avec le nouveau secret et envoie
  // l’ancienne signature dans les en-têtes `-Previous` pendant 24 h. On accepte
  // donc un match sur l’en-tête courant ou son équivalent `-Previous`.
  if (!signatureMatches(signatureV2, rawBody, secret, canonicalPayload)
    && !signatureMatches(previous.signatureV2, rawBody, secret, canonicalPayload)
    && !signatureMatches(signature, rawBody, secret)
    && !signatureMatches(previous.signature, rawBody, secret)) {
    return { ok: false, status: 401, error: 'Signature webhook Didit invalide.' };
  }

  return { ok: true, event, timestamp };
}