import { Router, type RequestHandler } from 'express';
import { decryptKycValue, encryptKycValue, hashDocumentNumber, isKycEncryptionConfigured } from '../services/identityCrypto.ts';
import { evaluateLocalIdentityVerification } from '../services/businessRules.ts';
import type { ShopRecord } from '../types.ts';

type DbRun = (sql: string, params?: unknown[]) => Promise<{ changes: number }>;
type DbGet = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | undefined>;
type DbAll = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

interface VerificationRow {
  shop_id: number;
  document_type: string;
  document_number_last4: string;
  identity_data_ciphertext: string;
  document_mime_type: string;
  document_ciphertext: string;
  document_back_mime_type?: string | null;
  document_back_ciphertext?: string | null;
  selfie_mime_type: string;
  selfie_ciphertext: string;
  client_face_distance: number | null;
  status: string;
  decision_method: string;
  submitted_at: string;
  reviewed_at: string | null;
  reviewer_note: string | null;
  has_document_back?: boolean;
  identity_data?: { first_name: string; last_name: string; birth_date: string };
  shop_name?: string;
  shop_slug?: string;
  owner_email?: string | null;
}

interface MerchantVerificationOptions {
  dbRun: DbRun;
  dbGet: DbGet;
  dbAll: DbAll;
  requireMerchantOwnShop: RequestHandler;
  shops: ShopRecord[];
}

function parseImage(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(value);
  if (!match || match[2].length > 1_100_000) return null;
  const bytes = Buffer.from(match[2], 'base64');
  const validMagic = match[1] === 'image/jpeg'
    ? bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : match[1] === 'image/png'
      ? bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return validMagic ? { mimeType: match[1], base64: match[2] } : null;
}

function publicStatus(row?: VerificationRow) {
  if (!row) return { status: 'pending', decision_method: 'none', document_type: null, document_number_last4: null, submitted_at: null, reviewed_at: null, reviewer_note: null };
  return {
    status: row.status,
    decision_method: row.decision_method,
    document_type: row.document_type,
    document_number_last4: row.document_number_last4,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    reviewer_note: row.reviewer_note,
  };
}

export function createMerchantVerificationRouter(options: MerchantVerificationOptions) {
  const { dbRun, dbGet, dbAll, requireMerchantOwnShop, shops } = options;
  const router = Router();

  router.get('/:id/identity-verification', requireMerchantOwnShop, async (req, res) => {
    const row = await dbGet<VerificationRow>('SELECT * FROM merchant_identity_verifications WHERE shop_id = ?', [Number(req.params.id)]);
    res.setHeader('Cache-Control', 'no-store');
    res.json(publicStatus(row));
  });

  router.post('/:id/identity-verification', requireMerchantOwnShop, async (req, res) => {
    if (!isKycEncryptionConfigured()) return res.status(503).json({ error: 'La vérification d’identité est temporairement indisponible.' });
    const shopId = Number(req.params.id);
    const documentType = ['cni', 'passport'].includes(String(req.body?.document_type)) ? String(req.body.document_type) : '';
    const documentNumber = String(req.body?.document_number || '').trim();
    const documentImage = parseImage(req.body?.document_image);
    const documentBackImage = parseImage(req.body?.document_back_image);
    const selfieImage = parseImage(req.body?.selfie_image);
    const faceDistance = Number(req.body?.face_distance);
    const ocrText = String(req.body?.identity_data?.ocr_text || '').slice(0, 8000);
    const ocrConfidence = Number(req.body?.identity_data?.ocr_confidence);
    if (!documentType || !documentImage || !documentBackImage || !selfieImage || !Number.isFinite(faceDistance) || faceDistance < 0 || faceDistance > 2) {
      return res.status(400).json({ error: 'Pièce, selfie ou comparaison locale invalide.' });
    }
    let documentHash: string;
    try {
      documentHash = hashDocumentNumber(documentNumber);
    } catch {
      return res.status(400).json({ error: 'Le numéro de document est invalide.' });
    }
    const existing = await dbGet<{ status: string }>('SELECT status FROM merchant_identity_verifications WHERE shop_id = ?', [shopId]);
    if (existing?.status === 'verified') return res.status(409).json({ error: 'Cette identité a déjà été vérifiée.' });

    const identityFields = {
      first_name: String(req.body?.identity_data?.first_name || '').slice(0, 100),
      last_name: String(req.body?.identity_data?.last_name || '').slice(0, 100),
      birth_date: String(req.body?.identity_data?.birth_date || '').slice(0, 20),
      ocr_text: ocrText,
      ocr_confidence: ocrConfidence,
    };
    const localDecision = evaluateLocalIdentityVerification({
      faceDistance,
      ocrConfidence,
      ocrText,
      documentNumber,
      firstName: identityFields.first_name,
      lastName: identityFields.last_name,
    });
    const status = localDecision.automaticApproval ? 'verified' : 'under_review';
    const decisionMethod = localDecision.automaticApproval ? 'local_auto' : 'manual_review';
    const now = new Date().toISOString();
    const reviewedAt = localDecision.automaticApproval ? now : null;
    try {
      await dbRun(`INSERT INTO merchant_identity_verifications (
        shop_id, document_type, document_number_hash, document_number_last4, identity_data_ciphertext,
        document_mime_type, document_ciphertext, document_back_mime_type, document_back_ciphertext,
        selfie_mime_type, selfie_ciphertext,
        client_face_distance, status, decision_method, submitted_at, reviewed_at, reviewer_note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(shop_id) DO UPDATE SET document_type = excluded.document_type,
        document_number_hash = excluded.document_number_hash, document_number_last4 = excluded.document_number_last4,
        identity_data_ciphertext = excluded.identity_data_ciphertext, document_mime_type = excluded.document_mime_type,
        document_ciphertext = excluded.document_ciphertext, document_back_mime_type = excluded.document_back_mime_type,
        document_back_ciphertext = excluded.document_back_ciphertext, selfie_mime_type = excluded.selfie_mime_type,
        selfie_ciphertext = excluded.selfie_ciphertext, client_face_distance = excluded.client_face_distance,
        status = excluded.status, decision_method = excluded.decision_method,
        submitted_at = excluded.submitted_at, reviewed_at = excluded.reviewed_at, reviewer_note = NULL`, [
          shopId, documentType, documentHash, documentNumber.replace(/\s/g, '').slice(-4), encryptKycValue(JSON.stringify(identityFields)),
        documentImage.mimeType, encryptKycValue(documentImage.base64), documentBackImage.mimeType,
        encryptKycValue(documentBackImage.base64), selfieImage.mimeType,
        encryptKycValue(selfieImage.base64), faceDistance, status, decisionMethod, now, reviewedAt,
      ]);
      await dbRun('UPDATE shops SET merchant_verification_status = ? WHERE id = ?', [status, shopId]);
      const shop = shops.find((candidate) => candidate.id === shopId);
      if (shop) shop.merchant_verification_status = status;
      res.setHeader('Cache-Control', 'no-store');
      res.status(201).json({ success: true, ...publicStatus({ status, decision_method: decisionMethod, document_type: documentType, document_number_last4: documentNumber.replace(/\s/g, '').slice(-4), submitted_at: now, reviewed_at: reviewedAt, reviewer_note: null } as VerificationRow) });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/unique|duplicate/i.test(message)) return res.status(409).json({ error: 'Ce numéro de document est déjà associé à une autre boutique.' });
      throw error;
    }
  });

  const adminRouter = Router();
  adminRouter.get('/', async (_req, res) => {
    const rows = await dbAll<VerificationRow>(`SELECT v.shop_id, v.document_type, v.document_number_last4, v.identity_data_ciphertext,
      v.document_back_ciphertext IS NOT NULL AS has_document_back,
      v.client_face_distance, v.status, v.decision_method, v.submitted_at, v.reviewed_at, v.reviewer_note,
      s.name AS shop_name, s.slug AS shop_slug, s.owner_email
      FROM merchant_identity_verifications v JOIN shops s ON s.id = v.shop_id
      ORDER BY CASE WHEN v.status IN ('submitted', 'under_review') THEN 0 ELSE 1 END, v.submitted_at DESC`);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ verifications: rows.map((row) => {
      try {
        const identity = JSON.parse(decryptKycValue(row.identity_data_ciphertext)) as VerificationRow['identity_data'] & { ocr_text?: string };
        return { ...row, identity_data: { first_name: identity?.first_name || '', last_name: identity?.last_name || '', birth_date: identity?.birth_date || '' }, identity_data_ciphertext: undefined };
      } catch {
        return { ...row, identity_data: null, identity_data_ciphertext: undefined };
      }
    }) });
  });

  adminRouter.get('/:shopId/media/:kind', async (req, res) => {
    const column = req.params.kind === 'document' ? 'document' : req.params.kind === 'back' ? 'document_back' : req.params.kind === 'selfie' ? 'selfie' : null;
    if (!column) return res.status(404).json({ error: 'Média introuvable.' });
    const row = await dbGet<VerificationRow>(`SELECT ${column}_mime_type, ${column}_ciphertext FROM merchant_identity_verifications WHERE shop_id = ?`, [Number(req.params.shopId)]);
    if (!row) return res.status(404).json({ error: 'Vérification introuvable.' });
    try {
      const mimeType = row[`${column}_mime_type` as 'document_mime_type' | 'document_back_mime_type' | 'selfie_mime_type'];
      const encrypted = row[`${column}_ciphertext` as 'document_ciphertext' | 'document_back_ciphertext' | 'selfie_ciphertext'];
      if (!mimeType || !encrypted) return res.status(404).json({ error: 'Média introuvable.' });
      res.setHeader('Cache-Control', 'no-store, private');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.type(mimeType).send(Buffer.from(decryptKycValue(encrypted), 'base64'));
    } catch {
      res.status(500).json({ error: 'Impossible de déchiffrer le média.' });
    }
  });

  adminRouter.patch('/:shopId', async (req, res) => {
    const shopId = Number(req.params.shopId);
    const status = String(req.body?.status || '');
    if (!['under_review', 'verified', 'rejected'].includes(status)) return res.status(400).json({ error: 'Décision de vérification invalide.' });
    const row = await dbGet<{ shop_id: number }>('SELECT shop_id FROM merchant_identity_verifications WHERE shop_id = ?', [shopId]);
    if (!row) return res.status(404).json({ error: 'Vérification introuvable.' });
    const note = String(req.body?.reviewer_note || '').replace(/[<>]/g, '').slice(0, 500) || null;
    const reviewedAt = status === 'under_review' ? null : new Date().toISOString();
    await dbRun("UPDATE merchant_identity_verifications SET status = ?, decision_method = 'manual', reviewed_at = ?, reviewer_note = ? WHERE shop_id = ?", [status, reviewedAt, note, shopId]);
    await dbRun('UPDATE shops SET merchant_verification_status = ? WHERE id = ?', [status, shopId]);
    const shop = shops.find((candidate) => candidate.id === shopId);
    if (shop) shop.merchant_verification_status = status as ShopRecord['merchant_verification_status'];
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, status, reviewed_at: reviewedAt });
  });

  return { merchantRouter: router, adminRouter };
}
