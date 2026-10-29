import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Download, LoaderCircle, QrCode, X } from 'lucide-react';
import type { Shop } from '../../types';
import { getCategoryDefaults } from '../../utils/categoryDefaults';

interface MerchantQrShareKitProps {
  shop: Shop;
  onClose: () => void;
}

type DownloadKind = 'qr' | 'poster';

function normalizeBrandColor(value: string | undefined): string {
  if (value && /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value)) return value;
  return '#087F62';
}

function safeFilename(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'boutique';
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Impossible de préparer le QR code pour le téléchargement.'));
    image.src = source;
  });
}

function createPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Le navigateur n’a pas pu créer l’image PNG.'));
    }, 'image/png');
  });
}

function downloadFile(url: string, filename: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  x: number,
  y: number,
  lineHeight: number,
  maxLines: number,
): void {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let lastLine = visibleLines[maxLines - 1];
    while (lastLine && context.measureText(`${lastLine}…`).width > maxWidth) {
      lastLine = lastLine.slice(0, -1);
    }
    visibleLines[maxLines - 1] = `${lastLine.trimEnd()}…`;
  }
  visibleLines.forEach((visibleLine, index) => context.fillText(visibleLine, x, y + index * lineHeight, maxWidth));
}

export const MerchantQrShareKit: React.FC<MerchantQrShareKitProps> = ({ shop, onClose }) => {
  const publicUrl = useMemo(() => new URL(`/${encodeURIComponent(shop.slug)}`, window.location.origin).toString(), [shop.slug]);
  const brandColor = normalizeBrandColor(shop.theme_config?.primary_color || shop.theme_color);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrError, setQrError] = useState('');
  const [downloadKind, setDownloadKind] = useState<DownloadKind | null>(null);

  useEffect(() => {
    let isCurrent = true;
    setQrDataUrl('');
    setQrError('');
    QRCode.toDataURL(publicUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 720,
      color: { dark: '#10231D', light: '#FFFFFF' },
    }).then((dataUrl) => {
      if (isCurrent) setQrDataUrl(dataUrl);
    }).catch((error: unknown) => {
      if (isCurrent) {
        setQrError(error instanceof Error ? error.message : 'Impossible de générer le QR code.');
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [publicUrl]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  const handleDownload = async (kind: DownloadKind) => {
    if (!qrDataUrl || downloadKind) return;
    setDownloadKind(kind);
    try {
      if (kind === 'qr') {
        downloadFile(qrDataUrl, `${safeFilename(shop.slug)}-qr.png`);
        return;
      }

      const image = await loadImage(qrDataUrl);
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1440;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Le navigateur ne permet pas de créer l’affiche.');

      context.fillStyle = '#F7F5EF';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.textAlign = 'center';
      context.fillStyle = '#1B2B24';
      context.font = '700 30px sans-serif';
      context.fillText('DÉCOUVREZ NOTRE BOUTIQUE', 540, 130);
      context.font = '900 64px sans-serif';
      drawWrappedText(context, shop.name, 900, 540, 225, 76, 2);
      context.fillStyle = '#52645B';
      context.font = '700 26px sans-serif';
      context.fillText(categoryLabel.toUpperCase(), 540, 355);

      context.fillStyle = brandColor;
      context.fillRect(430, 380, 220, 10);
      context.fillStyle = '#FFFFFF';
      context.fillRect(190, 420, 700, 700);
      context.drawImage(image, 230, 460, 620, 620);

      context.fillStyle = '#1B2B24';
      context.font = '800 36px sans-serif';
      context.fillText('Scannez pour visiter', 540, 1180);
      context.fillStyle = '#52645B';
      context.font = '500 26px sans-serif';
      context.fillText(publicUrl, 540, 1235, 920);
      context.fillStyle = brandColor;
      context.fillRect(0, 1418, canvas.width, 22);

      const blob = await createPngBlob(canvas);
      const objectUrl = URL.createObjectURL(blob);
      downloadFile(objectUrl, `${safeFilename(shop.slug)}-affiche-qr.png`);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setQrError(error instanceof Error ? error.message : 'Le téléchargement a échoué.');
    } finally {
      setDownloadKind(null);
    }
  };

  const categoryLabel = getCategoryDefaults(shop.category).label;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="merchant-qr-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <header className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-900">
              <QrCode className="h-4 w-4" /> Votre kit de partage
            </span>
            <h2 id="merchant-qr-title" className="mt-3 text-2xl font-black text-slate-950">Un QR code pour votre boutique</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Téléchargez le QR code ou une affiche personnalisée avec le nom, la catégorie et la couleur de votre boutique.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer le kit de partage" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="mt-6 grid gap-6 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
          <div className="rounded-2xl border border-slate-200 bg-[#F7F5EF] p-5 text-center">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">{categoryLabel}</p>
            <h3 className="mt-2 break-words text-xl font-black text-slate-950">{shop.name}</h3>
            <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3 shadow-sm">
              {qrDataUrl
                ? <img src={qrDataUrl} alt={`QR code vers la vitrine de ${shop.name}`} className="h-48 w-48" />
                : <div role={qrError ? 'alert' : 'status'} className="flex h-48 w-48 items-center justify-center px-4 text-sm text-slate-600">{qrError || 'Génération du QR code…'}</div>}
            </div>
            <p className="mt-3 break-all text-xs text-slate-600">{publicUrl}</p>
            <div className="mx-auto mt-3 h-1 w-16 rounded-full" style={{ backgroundColor: brandColor }} />
          </div>

          <div className="space-y-3">
            <button type="button" disabled={!qrDataUrl || downloadKind !== null} onClick={() => void handleDownload('qr')} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#087F62] px-4 py-3 text-sm font-black text-white hover:bg-[#047857] disabled:cursor-not-allowed disabled:opacity-50">
              {downloadKind === 'qr' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Télécharger le QR code
            </button>
            <button type="button" disabled={!qrDataUrl || downloadKind !== null} onClick={() => void handleDownload('poster')} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-800 px-4 py-3 text-sm font-black text-emerald-900 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50">
              {downloadKind === 'poster' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Télécharger l’affiche
            </button>
            {qrError && <p role="alert" className="text-xs leading-5 text-rose-700">{qrError}</p>}
            <p className="text-xs leading-5 text-slate-500">Le code ouvre uniquement votre vitrine publique. Gardez-la publiée pour que vos clients puissent la consulter.</p>
          </div>
        </div>
      </section>
    </div>
  );
};
