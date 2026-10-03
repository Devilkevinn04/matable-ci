import React from 'react';
import { MessageCircle } from 'lucide-react';
import { getSupportWhatsAppUrl } from '../utils/supportWhatsApp';

const SUPPORT_MESSAGE = "Bonjour, j'ai une question concernant MaTable.ci.";

export const WhatsAppFloatingButton: React.FC = () => {
  const href = getSupportWhatsAppUrl(SUPPORT_MESSAGE);
  if (!href) return null;

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
