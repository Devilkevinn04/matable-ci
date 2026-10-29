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

export function generateWhatsAppOrderReceipt(
  shop: Shop,
  order: Pick<Order, 'id' | 'customer_name' | 'customer_phone' | 'delivery_location' | 'delivery_note' | 'payment_method_preference' | 'items' | 'total_amount' | 'delivery_slot' | 'delivery_fee'>
): { text: string; url: string } {
  const lines: string[] = [
    `🛒 *COMMANDE MATABLE.CI #${order.id}*`,
    `🏪 *Boutique :* ${shop.name} (${getCategoryDefaults(shop.category).label})`,
    `----------------------------------------`,
    `👤 *Client :* ${order.customer_name.trim()}`,
    `📞 *Téléphone :* ${order.customer_phone.trim()}`,
    `📍 *Commune / lieu souhaité :* ${order.delivery_location.trim()}`,
  ];

  if (order.delivery_slot) {
    lines.push(`⏰ *Créneau souhaité :* ${order.delivery_slot}`);
  }

  if (order.delivery_note && order.delivery_note.trim().length > 0) {
    lines.push(`ℹ️ *Précision repère :* ${order.delivery_note.trim()}`);
  }

  lines.push(`💳 *Paiement :* à convenir directement avec le vendeur`);
  if (order.payment_method_preference) {
    lines.push(`📲 *Mode souhaité :* ${PAYMENT_METHOD_LABELS[order.payment_method_preference] || order.payment_method_preference}`);
  }
  lines.push(`----------------------------------------`);
  lines.push(`📦 *ARTICLES COMMANDÉS :*`);

  (order.items || []).forEach((item, index) => {
    const unitPrice = Number(item.unit_price);
    const subtotal = Number(item.quantity) * unitPrice;
    let itemLine = `${index + 1}. *${item.product_title || `Article #${item.product_id}`}*`;
    if (item.selected_size) {
      itemLine += ` [Taille: ${item.selected_size}]`;
    }
    if (item.selected_color) {
      itemLine += ` [Couleur: ${item.selected_color}]`;
    }
    lines.push(itemLine);

    if (item.selected_modifiers && item.selected_modifiers.length > 0) {
      lines.push(`   _(Options/Sauces : ${item.selected_modifiers.join(', ')})_`);
    }
    lines.push(`   Quantité : ${item.quantity} x ${formatFCFA(unitPrice)} = *${formatFCFA(subtotal)}*`);
  });

  lines.push(`----------------------------------------`);
  const deliveryFee = Number(order.delivery_fee || 0);
  const articlesTotal = Number(order.total_amount) || 0;
  if (deliveryFee > 0) {
    lines.push(`🛵 *Frais de livraison MaTable : ${formatFCFA(deliveryFee)}*`);
    lines.push(`💰 *TOTAL À RÉGLER : ${formatFCFA(articlesTotal + deliveryFee)}*`);
    lines.push(`📌 *Livraison organisée par MaTable : la course est créée et un livreur est recherché.*`);
    lines.push(`📌 *Le règlement des articles et des frais de livraison reste à convenir avec la boutique ou le livreur.*`);
  } else {
    lines.push(`💰 *TOTAL INDICATIF : ${formatFCFA(articlesTotal)}*`);
    lines.push(`📌 *Disponibilité, retrait ou livraison et frais éventuels à confirmer directement avec la boutique.*`);
    lines.push(`🚚 *MaTable ne fournit ni n’organise la livraison pour cette commande.*`);
  }
  lines.push(`----------------------------------------`);
  lines.push(`Merci de me confirmer la disponibilité, le montant final et le mode de paiement. ✨`);

  const fullText = lines.join('\n');
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
