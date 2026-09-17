import React, { useRef, useEffect, useState } from 'react';
import { Download, Share2, Sparkles, Check, Palette, Sparkle } from 'lucide-react';
import { Product, Shop } from '../types';
import { formatFCFA } from '../utils/format';

interface MarketingStoryStudioProps {
  shop: Shop;
  products: Product[];
}

export const MarketingStoryStudio: React.FC<MarketingStoryStudioProps> = ({ shop, products }) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(
    products.length > 0 ? products[0] : null
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [storyTemplate, setStoryTemplate] = useState<'luxury_dark' | 'clean_light' | 'promo_event'>('luxury_dark');

  const themeColor = shop.theme_config?.primary_color || shop.theme_color || '#E11D48';
  const logoUrl = shop.theme_config?.logo_url;
  const fontFamily = shop.theme_config?.font_family || 'Plus Jakarta Sans';

  useEffect(() => {
    if (!selectedProduct) return;
    renderStoryCanvas(selectedProduct);
  }, [selectedProduct, shop, storyTemplate]);

  useEffect(() => {
    setSelectedProduct((current) => {
      if (current && products.some((product) => product.id === current.id)) {
        return products.find((product) => product.id === current.id) || current;
      }
      return products[0] || null;
    });
  }, [products]);

  const renderStoryCanvas = (prod: Product) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 9:16 vertical story format (1080 x 1920)
    canvas.width = 1080;
    canvas.height = 1920;

    // 1. Background gradient based on selected template
    if (storyTemplate === 'luxury_dark') {
      const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1920);
      bgGrad.addColorStop(0, '#090D16');
      bgGrad.addColorStop(0.5, '#131B2E');
      bgGrad.addColorStop(1, themeColor);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1080, 1920);
    } else if (storyTemplate === 'clean_light') {
      const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1920);
      bgGrad.addColorStop(0, '#F8FAFC');
      bgGrad.addColorStop(0.6, '#EDF2F7');
      bgGrad.addColorStop(1, '#E2E8F0');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1080, 1920);
    } else {
      // Promo Event
      const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1920);
      bgGrad.addColorStop(0, '#7F1D1D');
      bgGrad.addColorStop(0.5, '#991B1B');
      bgGrad.addColorStop(1, themeColor);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1080, 1920);
    }

    const isLight = storyTemplate === 'clean_light';

    // Decorative shapes
    ctx.fillStyle = isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath();
    ctx.arc(900, 300, 450, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(150, 1600, 500, 0, Math.PI * 2);
    ctx.fill();

    // 2. Top Header - Sector Tag & Shop Name
    if (logoUrl) {
      const logo = new Image();
      logo.crossOrigin = 'anonymous';
      logo.src = logoUrl;
      logo.onload = () => {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(90, 70, 120, 120, 30);
        ctx.clip();
        ctx.drawImage(logo, 90, 70, 120, 120);
        ctx.restore();
      };
    }

    ctx.fillStyle = isLight ? '#0F172A' : '#FFFFFF';
    ctx.font = `bold 34px "${fontFamily}", sans-serif`;
    ctx.textAlign = 'center';

    const sectorTag = shop.category === 'food' 
      ? '🍲 FRAIS DU JOUR • DISPONIBLE À ABIDJAN' 
      : '👗 NOUVELLE COLLECTION • ABIDJAN CHIC';
    ctx.fillText(sectorTag, 540, 160);

    ctx.font = `800 68px "${fontFamily}", sans-serif`;
    ctx.fillText(shop.name.toUpperCase(), 540, 245);

    if (shop.welcome_message) {
      ctx.fillStyle = isLight ? '#475569' : 'rgba(255, 255, 255, 0.8)';
      ctx.font = `400 30px "${fontFamily}", sans-serif`;
      const shortSlogan = shop.welcome_message.length > 55 
        ? shop.welcome_message.substring(0, 52) + '...' 
        : shop.welcome_message;
      ctx.fillText(`« ${shortSlogan} »`, 540, 305);
    }

    // 3. Load & Draw Product Image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = prod.image_url;

    const finalizeDraw = () => {
      // Border around image
      ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 6;
      ctx.stroke();

      // Category specific badge on photo corner
      if (prod.prep_time) {
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.roundRect(120, 410, 280, 70, 20);
        ctx.fill();

        ctx.fillStyle = '#F59E0B';
        ctx.font = `bold 28px "${fontFamily}", sans-serif`;
        ctx.fillText(`⏱️ PRÊT EN ${prod.prep_time} MIN`, 260, 455);
      } else if (prod.sizes && prod.sizes.length > 0) {
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.roundRect(120, 410, 320, 70, 20);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold 28px "${fontFamily}", sans-serif`;
        ctx.fillText(`TAILLES : ${prod.sizes.join(' • ')}`, 280, 455);
      }

      // 4. Product Title
      ctx.fillStyle = isLight ? '#0F172A' : '#FFFFFF';
      ctx.font = `800 60px "${fontFamily}", sans-serif`;
      ctx.textAlign = 'center';
      
      const words = prod.title.split(' ');
      let line1 = '';
      let line2 = '';
      for (const w of words) {
        if ((line1 + ' ' + w).length < 24) {
          line1 = (line1 + ' ' + w).trim();
        } else {
          line2 = (line2 + ' ' + w).trim();
        }
      }

      ctx.fillText(line1, 540, 1370);
      if (line2) {
        ctx.fillText(line2, 540, 1445);
      }

      // 5. Short Description Pill
      if (prod.description) {
        ctx.fillStyle = isLight ? '#475569' : 'rgba(255, 255, 255, 0.85)';
        ctx.font = `500 30px "${fontFamily}", sans-serif`;
        const descPreview = prod.description.length > 70 
          ? prod.description.substring(0, 67) + '...' 
          : prod.description;
        ctx.fillText(descPreview, 540, line2 ? 1515 : 1450);
      }

      // 6. Price Badge (FCFA)
      const badgeY = line2 ? 1570 : 1520;
      const priceText = formatFCFA(prod.price);
      
      // Draw golden price tag pill
      ctx.fillStyle = '#F59E0B'; // Amber gold
      const badgeW = 620;
      const badgeH = 115;
      const badgeX = (1080 - badgeW) / 2;
      
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 58);
      ctx.fill();

      ctx.fillStyle = '#0F172A';
      ctx.font = `900 58px "${fontFamily}", sans-serif`;
      ctx.fillText(priceText, 540, badgeY + 78);

      // 7. Call To Action Footer
      ctx.fillStyle = isLight ? '#0F172A' : '#FFFFFF';
      ctx.font = `700 38px "${fontFamily}", sans-serif`;
      ctx.fillText('📲 COMMANDER EN 1 CLIC SUR WHATSAPP', 540, 1775);

      ctx.fillStyle = isLight ? '#64748B' : 'rgba(255, 255, 255, 0.75)';
      ctx.font = `500 28px "${fontFamily}", sans-serif`;
      ctx.fillText(`Lien direct vitrine : matable.ci/${shop.slug}`, 540, 1830);

      setPreviewUrl(canvas.toDataURL('image/png'));
    };

    img.onload = () => {
      // Draw shadow box for image
      const imgX = 90;
      const imgY = 370;
      const imgW = 900;
      const imgH = 900;
      const radius = 44;

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 35;
      ctx.shadowOffsetY = 18;

      // Rounded clip for image
      ctx.beginPath();
      ctx.moveTo(imgX + radius, imgY);
      ctx.lineTo(imgX + imgW - radius, imgY);
      ctx.quadraticCurveTo(imgX + imgW, imgY, imgX + imgW, imgY + radius);
      ctx.lineTo(imgX + imgW, imgY + imgH - radius);
      ctx.quadraticCurveTo(imgX + imgW, imgY + imgH, imgX + imgW - radius, imgY + imgH);
      ctx.lineTo(imgX + radius, imgY + imgH);
      ctx.quadraticCurveTo(imgX, imgY + imgH, imgX, imgY + imgH - radius);
      ctx.lineTo(imgX, imgY + radius);
      ctx.quadraticCurveTo(imgX, imgY, imgX + radius, imgY);
      ctx.closePath();
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.clip();

      ctx.drawImage(img, imgX, imgY, imgW, imgH);
      ctx.restore();

      finalizeDraw();
    };

    img.onerror = () => {
      // Fallback placeholder box
      const imgX = 90;
      const imgY = 370;
      const imgW = 900;
      const imgH = 900;
      ctx.fillStyle = '#334155';
      ctx.fillRect(imgX, imgY, imgW, imgH);
      finalizeDraw();
    };
  };

  const handleDownload = () => {
    if (!previewUrl || !selectedProduct) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = `story-${shop.slug}-${selectedProduct.id}.png`;
    a.click();
  };

  const handleCopyLink = () => {
    const shareText = `Découvrez *${selectedProduct?.title}* à seulement *${formatFCFA(selectedProduct?.price || 0)}* sur ma boutique : https://matable.ci/${shop.slug}`;
    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
              <Sparkles className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-black text-slate-900">Studio Marketing & Statuts WhatsApp</h2>
          </div>
          <p className="text-xs text-slate-500">
            Générez en 1 clic un visuel vertical 9:16 aux couleurs de votre thème ({shop.category === 'food' ? 'Food & Grillades' : 'Fashion & Lingerie'}) pour vos Statuts WhatsApp.
          </p>
        </div>

        {/* Product selector dropdown */}
        <div className="w-full sm:w-72">
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Choisir un article du catalogue
          </label>
          <select
            value={selectedProduct?.id || ''}
            onChange={(e) => {
              const p = products.find(prod => prod.id === Number(e.target.value));
              if (p) setSelectedProduct(p);
            }}
            className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-800"
          >
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.title} ({formatFCFA(p.price)})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Template selector */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-bold text-slate-700">Modèle de Fond :</span>
        </div>
        <div className="flex items-center gap-2">
          {[
            { id: 'luxury_dark', label: 'Ambiance Sombre & Luxe' },
            { id: 'clean_light', label: 'Épuré & Lumineux' },
            { id: 'promo_event', label: 'Vente Flash & Promo' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setStoryTemplate(t.id as any)}
              className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-colors ${
                storyTemplate === t.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Visual Story Display */}
        <div className="md:col-span-6 flex justify-center">
          <div className="relative w-full max-w-[340px] aspect-[9/16] rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-900 bg-black">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Story Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                Génération du visuel...
              </div>
            )}
          </div>
          {/* Hidden canvas for high-resolution rendering */}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Action Controls & Sharing Tools */}
        <div className="md:col-span-6 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="font-extrabold text-slate-900 text-sm">
              Actions rapides de diffusion
            </h3>

            <button
              onClick={handleDownload}
              disabled={!previewUrl || !selectedProduct}
              className="w-full py-3.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Télécharger l'image 9:16 (HD 1080x1920)</span>
            </button>

            <button
              onClick={handleCopyLink}
              disabled={!selectedProduct}
              className="w-full py-3 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
              <span>{copied ? 'Texte de vente copié !' : 'Copier le texte prêt à l’emploi'}</span>
            </button>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-emerald-900 text-xs space-y-1.5">
            <span className="font-bold block">💡 Conseil pour commerçant en Côte d'Ivoire :</span>
            <p className="leading-relaxed text-emerald-800">
              Téléchargez cette affiche et postez-la directement en Statut WhatsApp entre <strong>11h30 et 13h30</strong> (pause déjeuner) ou entre <strong>18h30 et 20h30</strong> (fin de journée). Les clients n'ont qu'à cliquer sur le lien de votre vitrine pour passer commande sans vous demander le prix !
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
