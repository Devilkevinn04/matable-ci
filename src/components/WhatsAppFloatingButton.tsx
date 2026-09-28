import React from 'react';
import { MessageCircle } from 'lucide-react';
import { cleanPhoneForWhatsApp } from '../utils/format';

const SUPPORT_WHATSAPP_NUMBER = '0102749775';
const SUPPORT_MESSAGE = "Bonjour, j'ai une question concernant MaTable.ci.";

export const WhatsAppFloatingButton: React.FC = () => {
  const href = `https://wa.me/${cleanPhoneForWhatsApp(SUPPORT_WHATSAPP_NUMBER)}?text=${encodeURIComponent(SUPPORT_MESSAGE)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="whatsapp-float-btn"
      aria-label="Contacter MaTable.ci sur WhatsApp"
      title="Une question ? Contactez-nous sur WhatsApp"
    >
      <MessageCircle className="h-6 w-6" />
    </a>
  );
};
