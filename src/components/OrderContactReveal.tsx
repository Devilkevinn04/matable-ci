import React, { useEffect, useState } from 'react';
import { Eye, MessageCircle, ShieldCheck } from 'lucide-react';
import { cleanPhoneForWhatsApp } from '../utils/format';

interface ContactPreview {
  phone_masked: string;
  can_reveal: boolean;
}

interface RevealedContact {
  phone: string;
  revealed_at: string;
}

interface OrderContactRevealProps {
  endpoint: string;
  contactLabel: 'la boutique' | 'le client';
  orderStatus: string;
}

const TERMINAL_STATUSES = new Set(['delivered', 'cancelled', 'expired', 'refunded']);

export const OrderContactReveal: React.FC<OrderContactRevealProps> = ({ endpoint, contactLabel, orderStatus }) => {
  const [preview, setPreview] = useState<ContactPreview | null>(null);
  const [revealed, setRevealed] = useState<RevealedContact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const contactLocked = TERMINAL_STATUSES.has(orderStatus.trim().toLowerCase());

  useEffect(() => {
    setPreview(null);
    setRevealed(null);
    setError('');
  }, [endpoint, orderStatus]);

  const loadPreview = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(endpoint, { credentials: 'include', cache: 'no-store' });
      const data = await response.json() as ContactPreview & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Impossible de charger le contact.');
      setPreview(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger le contact.');
    } finally {
      setLoading(false);
    }
  };

  const revealContact = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json() as RevealedContact & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Impossible de révéler ce contact.');
      setRevealed(data);
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : 'Impossible de révéler ce contact.');
    } finally {
      setLoading(false);
    }
  };

  if (contactLocked) {
    return <p className="text-xs font-semibold text-slate-500">Contact verrouillé : commande terminée.</p>;
  }

  if (revealed) {
    const whatsappPhone = cleanPhoneForWhatsApp(revealed.phone);
    return (
      <div className="w-full space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left sm:w-auto">
        <p className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800">
          <ShieldCheck className="h-4 w-4" /> Numéro révélé et accès tracé
        </p>
        <p className="text-sm font-bold text-slate-800">{revealed.phone}</p>
        {whatsappPhone && (
          <a
            href={`https://wa.me/${whatsappPhone}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800"
          >
            <MessageCircle className="h-4 w-4" /> Continuer sur WhatsApp
          </a>
        )}
      </div>
    );
  }

  if (preview) {
    return (
      <div className="w-full space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left sm:w-auto">
        <p className="text-xs text-slate-600">Numéro masqué : <span className="font-bold text-slate-800">{preview.phone_masked}</span></p>
        <button
          type="button"
          onClick={() => void revealContact()}
          disabled={loading || !preview.can_reveal}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-900 transition hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
        >
          <Eye className="h-4 w-4" /> {loading ? 'Révélation…' : 'Révéler le numéro (tracé)'}
        </button>
        {error && <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}
      </div>
    );
  }

  return (
    <div className="w-full space-y-1.5 sm:w-auto">
      <button
        type="button"
        onClick={() => void loadPreview()}
        disabled={loading}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
      >
        <MessageCircle className="h-4 w-4" /> {loading ? 'Chargement…' : `Contacter ${contactLabel}`}
      </button>
      {error && <p role="alert" className="max-w-xs text-xs font-semibold text-rose-700">{error}</p>}
    </div>
  );
};
