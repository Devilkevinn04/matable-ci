import { Order, Product, Shop } from '../types';
import { getCategoryDefaults } from './categoryDefaults';
import { getActiveProductPrice } from './productPricing';

export function getProductUnitPrice(product: Product, selectedModifiers?: string[]): number {
  const selected = new Set((selectedModifiers || []).map(value => value.trim()).filter(Boolean));
  const basePrice = getActiveProductPrice(product);

  if (!product.modifier_groups || product.modifier_groups.length === 0) {
    return basePrice;
  }

  let modifiersTotal = 0;

  for (const group of product.modifier_groups) {
    for (const option of group.options) {
      const label = typeof option === 'string' ? option : option.label;
      if (selected.has(label)) {
        modifiersTotal += typeof option === 'string' ? 0 : Number(option.price_delta || 0);
      }
    }
  }

  return basePrice + modifiersTotal;
}

const FCFA_FORMATTER = new Intl.NumberFormat('fr-FR');

export function formatFCFA(amount: number): string {
  return FCFA_FORMATTER.format(amount) + ' FCFA';
}

export function cleanPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('00')) cleaned = cleaned.slice(2);
  if (cleaned.length === 10 && /^(01|05|07)/.test(cleaned)) return `225${cleaned}`;
  if (cleaned.length === 8) return `225${cleaned}`;
  if (cleaned.length === 13 && cleaned.startsWith('225')) return cleaned;
  return cleaned;
}

export function isValidWhatsAppPhone(phone: string): boolean {
  return /^(225)(01|05|07)\d{8}$/.test(cleanPhoneForWhatsApp(phone));
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  wave: 'Wave souhaité',
  mobile_money: 'Mobile Money souhaité',
  cash: 'Espèces souhaitées',
  to_confirm: 'À convenir avec le vendeur',
};

/** Retire les caractères de mise en forme WhatsApp des données saisies par l’utilisateur. */
function sanitizeWhatsAppText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function generateWhatsAppOrderReceipt(
  shop: Shop,
  order: Pick<Order, 'id' | 'customer_name' | 'customer_phone' | 'delivery_location' | 'delivery_note' | 'payment_method_preference' | 'items' | 'total_amount' | 'delivery_slot' | 'delivery_fee'>
): { text: string; url: string } {
  const articlesTotal = Number(order.total_amount) || 0;
  const deliveryFee = Number(order.delivery_fee || 0);
  const items = order.items || [];
  const blocks: string[] = [];

  blocks.push([
    `🧾 *COMMANDE MATABLE.CI #${order.id}*`,
    `${sanitizeWhatsAppText(shop.name)} · ${getCategoryDefaults(shop.category).label}`,
  ].join('\n'));

  const customerLines = ['*CLIENT*', sanitizeWhatsAppText(order.customer_name)];
  const customerPhone = sanitizeWhatsAppText(order.customer_phone);
  const deliveryLocation = sanitizeWhatsAppText(order.delivery_location);
  if (customerPhone) customerLines.push(customerPhone);
  if (deliveryLocation) customerLines.push(deliveryLocation);
  if (order.delivery_slot) customerLines.push(`Créneau : ${sanitizeWhatsAppText(order.delivery_slot)}`);
  const deliveryNote = sanitizeWhatsAppText(order.delivery_note);
  if (deliveryNote) customerLines.push(`Repère : ${deliveryNote}`);
  blocks.push(customerLines.filter((line, index) => line.length > 0 || index === 0).join('\n'));

  const itemLines = ['*ARTICLES*'];
  items.forEach((item, index) => {
    itemLines.push('');
    itemLines.push(`${index + 1}. *${sanitizeWhatsAppText(item.product_title) || `Article #${item.product_id}`}*`);
    const options: string[] = [];
    if (item.selected_size) options.push(`Taille ${sanitizeWhatsAppText(item.selected_size)}`);
    if (item.selected_color) options.push(`Couleur ${sanitizeWhatsAppText(item.selected_color)}`);
    if (item.selected_modifiers && item.selected_modifiers.length > 0) {
      options.push(item.selected_modifiers.map((modifier) => sanitizeWhatsAppText(modifier)).filter(Boolean).join(', '));
    }
    if (options.length > 0) itemLines.push(options.join(' · '));
    const unitPrice = Number(item.unit_price) || 0;
    const quantity = Number(item.quantity) || 0;
    itemLines.push(`${quantity} × ${formatFCFA(unitPrice)} = ${formatFCFA(quantity * unitPrice)}`);
  });
  blocks.push(itemLines.join('\n'));

  const paymentLines = ['*RÈGLEMENT*', 'Paiement à convenir directement avec le vendeur'];
  if (order.payment_method_preference) {
    const preference = order.payment_method_preference;
    paymentLines.push(`Mode souhaité : ${PAYMENT_METHOD_LABELS[preference] || sanitizeWhatsAppText(preference)}`);
  }
  blocks.push(paymentLines.join('\n'));

  if (deliveryFee > 0) {
    blocks.push([
      '🛵 *LIVRAISON MATABLE*',
      `Frais de livraison MaTable : ${formatFCFA(deliveryFee)}`,
      'Course créée : un livreur est recherché.',
      'Le règlement des articles et des frais de livraison reste à convenir avec la boutique ou le livreur.',
    ].join('\n'));
    blocks.push(`💰 *TOTAL À RÉGLER : ${formatFCFA(articlesTotal + deliveryFee)}*`);
  } else {
    blocks.push([
      '📦 *RETRAIT / LIVRAISON*',
      'Disponibilité, retrait ou livraison et frais éventuels à confirmer directement avec la boutique.',
      'La livraison de cette commande n’est pas organisée par MaTable.',
    ].join('\n'));
    blocks.push(`💰 *TOTAL INDICATIF : ${formatFCFA(articlesTotal)}*`);
  }

  blocks.push('Merci de me confirmer la disponibilité, le montant final et le mode de paiement.');

  const fullText = blocks.join('\n\n');
  const cleanPhone = cleanPhoneForWhatsApp(shop.whatsapp_number);
  const encodedText = encodeURIComponent(fullText);
  const url = `https://wa.me/${cleanPhone}?text=${encodedText}`;

  return { text: fullText, url };
}

/**
 * Client-side image compressor (< 100 KB) as requested in specs.
 * Takes a File object, resizes if needed, compresses with canvas to JPEG,
 * and returns dataURL and size in KB.
 */
export async function compressImageClientSide(
  file: File,
  maxDimension = 1000,
  maxSizeKB = 100
): Promise<{ dataUrl: string; sizeKB: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        let { width, height } = img;

        // Calculate aspect ratio
        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Iterative compression to stay under maxSizeKB
        let quality = 0.85;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        let sizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);

        while (sizeKB > maxSizeKB && quality > 0.3) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          sizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);
        }

        resolve({ dataUrl, sizeKB });
      };
      img.onerror = () => reject(new Error("Échec du chargement de l'image"));
    };
    reader.onerror = () => reject(new Error('Échec de lecture du fichier'));
  });
}
