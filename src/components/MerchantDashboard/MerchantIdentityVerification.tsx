import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, FileCheck2, LoaderCircle, ShieldCheck, X } from 'lucide-react';

export interface VerificationStatus {
  status: string;
  document_type: string | null;
  document_number_last4: string | null;
  submitted_at: string | null;
  decision_method: string;
  reviewed_at: string | null;
  reviewer_note: string | null;
}

interface MerchantIdentityVerificationProps {
  shopId: number;
  onStatusChange?: (status: VerificationStatus) => void;
}

type CaptureTarget = 'document_front' | 'document_back' | 'selfie';

const verificationStatus: Record<string, { label: string; description: string; tone: string }> = {
  pending: { label: 'À compléter', description: 'Envoyez vos informations pour démarrer la revue.', tone: 'border-amber-200 bg-amber-50 text-amber-950' },
  submitted: { label: 'Dossier reçu', description: 'Votre dossier attend une vérification par l’équipe.', tone: 'border-sky-200 bg-sky-50 text-sky-950' },
  under_review: { label: 'En cours de revue', description: 'L’équipe examine actuellement votre dossier.', tone: 'border-sky-200 bg-sky-50 text-sky-950' },
  verified: { label: 'Identité vérifiée', description: 'La revue manuelle est terminée.', tone: 'border-emerald-200 bg-emerald-50 text-emerald-950' },
  rejected: { label: 'Dossier à corriger', description: 'Consultez le retour de l’équipe puis envoyez un nouveau dossier.', tone: 'border-rose-200 bg-rose-50 text-rose-950' },
};

function extractLabeledValue(text: string, labels: string) {
  const expression = new RegExp(`(?:${labels})\\s*[:\\-]?\\s*([^\\n\\r]{2,80})`, 'i');
  return text.match(expression)?.[1]?.trim() || '';
}

export function MerchantIdentityVerification({ shopId, onStatusChange }: MerchantIdentityVerificationProps) {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [documentType, setDocumentType] = useState<'cni' | 'passport'>('cni');
  const [documentNumber, setDocumentNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [documentImage, setDocumentImage] = useState<string | null>(null);
  const [documentBackImage, setDocumentBackImage] = useState<string | null>(null);
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [cameraTarget, setCameraTarget] = useState<CaptureTarget | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [ocrConfidence, setOcrConfidence] = useState(0);
  const [faceDistance, setFaceDistance] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const statusDetails = status?.status === 'verified' && status.decision_method === 'local_auto'
    ? { label: 'Identité vérifiée automatiquement', description: 'Les contrôles locaux sont passés. Ce prototype ne vérifie pas le liveness.', tone: 'border-emerald-200 bg-emerald-50 text-emerald-950' }
    : verificationStatus[status?.status || 'pending'] || verificationStatus.pending;

  useEffect(() => {
    let cancelled = false;
    const refreshStatus = async () => {
      try {
        const response = await fetch(`/api/shops/${shopId}/identity-verification`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json() as VerificationStatus;
        if (cancelled) return;
        setStatus(data);
        onStatusChange?.(data);
      } catch {
        // Keep the current onboarding state if the status endpoint is temporarily unavailable.
      }
    };
    void refreshStatus();
    const timer = window.setInterval(() => void refreshStatus(), 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [shopId]);

  useEffect(() => {
    if (!cameraTarget || !videoRef.current || !cameraStreamRef.current) return;
    videoRef.current.srcObject = cameraStreamRef.current;
    void videoRef.current.play().catch(() => setError('Impossible de démarrer la caméra. Vérifiez son autorisation.'));
  }, [cameraTarget]);

  useEffect(() => () => cameraStreamRef.current?.getTracks().forEach((track) => track.stop()), []);

  async function startCamera(target: CaptureTarget) {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('La caméra est indisponible. Ouvrez cette page en HTTPS ou sur localhost.');
      return;
    }
    try {
      cameraStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: target === 'selfie' ? 'user' : 'environment' },
      });
      setCameraTarget(target);
    } catch {
      setError('Accès à la caméra refusé ou indisponible. Autorisez la caméra puis réessayez.');
    }
  }

  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraTarget(null);
  }

  function captureCameraFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !cameraTarget) return;
    const scale = Math.min(1, 1500 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/jpeg', 0.8);
    const target = cameraTarget;
    stopCamera();
    if (target === 'document_front') void handleDocumentImage(image);
    else if (target === 'document_back') setDocumentBackImage(image);
    else void handleSelfieImage(image);
  }

  async function handleDocumentImage(image: string) {
    setError('');
    setBusy('Lecture OCR locale en français…');
    try {
      setFaceDistance(null);
      setDocumentImage(image);
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('fra', 1, {
        workerPath: '/models/ocr/worker.min.js',
        langPath: '/models/ocr/tessdata',
        corePath: '/models/ocr/tesseract-core.wasm.js',
        workerBlobURL: false,
      });
      let result;
      try {
        result = await worker.recognize(image);
      } finally {
        await worker.terminate();
      }
      const text = result.data.text.slice(0, 8000);
      setOcrText(text);
      setOcrConfidence(Number(result.data.confidence) || 0);
      setFirstName((current) => current || extractLabeledValue(text, 'PR[ÉE]NOMS?|GIVEN NAMES?'));
      setLastName((current) => current || extractLabeledValue(text, 'NOM|SURNAME'));
      setBirthDate((current) => current || extractLabeledValue(text, 'DATE DE NAISSANCE|DATE OF BIRTH'));
      const numberCandidate = text.match(/\b[A-Z0-9]{2,5}[ -]?[0-9A-Z]{5,12}\b/i)?.[0];
      if (numberCandidate) setDocumentNumber((current) => current || numberCandidate.replace(/[ -]/g, '').toUpperCase());
    } catch {
      setError('Lecture OCR indisponible. Vous pouvez saisir les informations manuellement.');
    } finally {
      setBusy('');
    }
  }

  async function handleSelfieImage(image: string) {
    setError('');
    setFaceDistance(null);
    setBusy('Comparaison faciale indicative…');
    try {
      setSelfieImage(image);
      if (!documentImage) {
        setFaceDistance(null);
        setBusy('');
        return;
      }
      const faceapi = await import('@vladmandic/face-api');
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri('/models/face-api'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models/face-api'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models/face-api'),
      ]);
      const [documentPhoto, selfiePhoto] = await Promise.all([faceapi.fetchImage(documentImage), faceapi.fetchImage(image)]);
      const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35 });
      const [documentFaces, selfieFaces] = await Promise.all([
        faceapi.detectAllFaces(documentPhoto, options).withFaceLandmarks().withFaceDescriptors(),
        faceapi.detectAllFaces(selfiePhoto, options).withFaceLandmarks().withFaceDescriptors(),
      ]);
      if (documentFaces.length !== 1 || selfieFaces.length !== 1) throw new Error('Un visage unique doit être visible sur chaque image.');
      setFaceDistance(faceapi.euclideanDistance(documentFaces[0].descriptor, selfieFaces[0].descriptor));
    } catch (caught) {
      setFaceDistance(null);
      setError(caught instanceof Error && caught.message.includes('visage') ? caught.message : 'Comparaison locale indisponible. Reprenez les deux images.');
    } finally {
      setBusy('');
    }
  }

  async function submit() {
    if (!documentImage || !documentBackImage || !selfieImage || faceDistance === null) return;
    setBusy('Envoi chiffré…');
    setError('');
    try {
      const response = await fetch(`/api/shops/${shopId}/identity-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_type: documentType,
          document_number: documentNumber,
          document_image: documentImage,
          document_back_image: documentBackImage,
          selfie_image: selfieImage,
          face_distance: faceDistance,
          identity_data: { first_name: firstName, last_name: lastName, birth_date: birthDate, ocr_text: ocrText, ocr_confidence: ocrConfidence },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Envoi impossible.');
      setStatus(data);
      onStatusChange?.(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Envoi impossible.');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
    <section className="max-w-4xl space-y-5 rounded-2xl border border-slate-200 bg-white p-5 pb-24 shadow-2xs sm:p-6">
      <header className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
        <div>
          <h3 className="font-extrabold text-slate-900">Vérification du commerçant</h3>
          <p className="mt-1 text-sm leading-5 text-slate-600">Prototype KYC : l’OCR et la comparaison sont exécutés dans ce navigateur. Les cas nets sont validés automatiquement ; les cas incertains sont transmis en revue manuelle. Aucun contrôle de liveness n’est effectué.</p>
        </div>
      </header>

      <div role="status" className={`flex items-start gap-3 rounded-xl border p-3.5 text-sm ${statusDetails.tone}`}>
        {status?.status === 'verified' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">{statusDetails.label}{status?.document_number_last4 && <span className="ml-2 font-medium">· document finissant par {status.document_number_last4}</span>}</p>
          <p className="mt-0.5 text-xs leading-5 opacity-80">{statusDetails.description}</p>
          {status?.submitted_at && <p className="mt-1 text-[11px] opacity-70">Envoyé le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(status.submitted_at))}</p>}
        </div>
      </div>
      {status?.reviewer_note && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Retour de l’équipe : {status.reviewer_note}</p>}

      {status?.status !== 'verified' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-semibold text-slate-800">Type de document
              <select value={documentType} onChange={(event) => setDocumentType(event.target.value as 'cni' | 'passport')} className="w-full rounded-lg border border-slate-300 p-2.5">
                <option value="cni">Carte nationale d’identité</option><option value="passport">Passeport</option>
              </select>
            </label>
            <label className="space-y-1 text-sm font-semibold text-slate-800">Numéro du document
              <input value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} maxLength={32} autoComplete="off" className="w-full rounded-lg border border-slate-300 p-2.5" />
            </label>
            <button type="button" onClick={() => void startCamera('document_front')} disabled={Boolean(busy)} className="flex min-h-36 min-w-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-center text-sm font-semibold text-slate-700 transition hover:border-emerald-600 hover:bg-emerald-50/50 disabled:opacity-50">
              <span className="text-xs font-bold uppercase text-slate-500">Recto de la pièce</span>
              {documentImage ? <img src={documentImage} alt="Aperçu du recto capturé" className="h-20 max-w-full rounded-md object-contain" /> : <Camera className="h-5 w-5 text-emerald-700" />}
              <span>{documentImage ? 'Reprendre le recto' : 'Ouvrir la caméra'}</span>
            </button>
            <button type="button" onClick={() => void startCamera('document_back')} disabled={!documentImage || Boolean(busy)} className="flex min-h-36 min-w-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-center text-sm font-semibold text-slate-700 transition hover:border-emerald-600 hover:bg-emerald-50/50 disabled:cursor-not-allowed disabled:opacity-50">
              <span className="text-xs font-bold uppercase text-slate-500">Verso de la pièce</span>
              {documentBackImage ? <img src={documentBackImage} alt="Aperçu du verso capturé" className="h-20 max-w-full rounded-md object-contain" /> : <Camera className="h-5 w-5 text-emerald-700" />}
              <span>{documentBackImage ? 'Reprendre le verso' : 'Ouvrir la caméra'}</span>
            </button>
            <button type="button" onClick={() => void startCamera('selfie')} disabled={!documentBackImage || Boolean(busy)} className="flex min-h-36 min-w-0 flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-center text-sm font-semibold text-slate-700 transition hover:border-emerald-600 hover:bg-emerald-50/50 disabled:cursor-not-allowed disabled:opacity-50">
              <span className="text-xs font-bold uppercase text-slate-500">Votre selfie</span>
              {selfieImage ? <img src={selfieImage} alt="Aperçu du selfie capturé" className="h-20 max-w-full rounded-md object-contain" /> : <Camera className="h-5 w-5 text-emerald-700" />}
              <span>{selfieImage ? 'Reprendre le selfie' : 'Ouvrir la caméra'}</span>
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-semibold text-slate-700">Prénoms<input value={firstName} onChange={(event) => setFirstName(event.target.value)} maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-700">Nom<input value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={100} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-700">Date de naissance<input value={birthDate} onChange={(event) => setBirthDate(event.target.value)} maxLength={20} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" /></label>
          </div>

          {ocrText && <details className="text-xs text-slate-600"><summary className="cursor-pointer font-semibold">Texte OCR extrait (à vérifier)</summary><pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3">{ocrText}</pre></details>}
          {faceDistance !== null && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="mr-1 inline h-4 w-4" />Comparaison indicative calculée localement. Distance : {faceDistance.toFixed(3)}. Ce score n’est ni une probabilité ni une preuve de présence réelle ; aucun contrôle de vivacité n’est effectué.</p>}
          {error && <p role="alert" className="text-sm font-medium text-rose-700">{error}</p>}
          {busy && <p className="flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" />{busy}</p>}
          <button type="button" disabled={Boolean(busy) || !documentNumber || !documentImage || !documentBackImage || !selfieImage || faceDistance === null} onClick={() => void submit()} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40">Lancer la vérification</button>
        </>
      )}
    </section>
    {cameraTarget && <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="Capture caméra">
      <section className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
        <header className="flex items-center justify-between gap-3">
          <div><p className="text-xs font-bold uppercase text-emerald-800">Capture sécurisée</p><h3 className="font-extrabold text-slate-900">{cameraTarget === 'document_front' ? 'Photographiez le recto' : cameraTarget === 'document_back' ? 'Photographiez le verso' : 'Prenez votre selfie'}</h3></div>
          <button type="button" onClick={stopCamera} aria-label="Fermer la caméra" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><X className="h-4 w-4" /></button>
        </header>
        <video ref={videoRef} autoPlay playsInline muted className="aspect-[4/3] w-full rounded-xl bg-black object-cover" />
        <button type="button" onClick={captureCameraFrame} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"><Camera className="h-4 w-4" />Prendre la photo</button>
      </section>
    </div>}
    </>
  );
}
