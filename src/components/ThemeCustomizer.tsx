import React, { useState } from 'react';
import { 
  Palette, 
  Sparkles, 
  Crown, 
  Check, 
  Lock, 
  Layers, 
  Type, 
  Image as ImageIcon, 
  Sliders, 
  Megaphone, 
  RefreshCw, 
  ExternalLink 
} from 'lucide-react';
import { Shop, ThemeConfig, SubscriptionTier } from '../types';
import { SAFE_THEME_COLORS, estimateDominantColorFromPixels, getContrastTextColor, mixHexColors, normalizeHex } from '../utils/color';
import { 
  getAllPresetsForCategory, 
  isFeatureAllowed, 
  ThemePreset
} from '../utils/themePresets';

interface ThemeCustomizerProps {
  shop: Shop;
  onUpdateShop: (updatedShop: Shop) => void;
}

export const ThemeCustomizer: React.FC<ThemeCustomizerProps> = ({ shop, onUpdateShop }) => {
  const [currentTier] = useState<SubscriptionTier>('pro');
  const [brandDirection, setBrandDirection] = useState<'luxe' | 'moderne' | 'authentique'>(
    shop.category === 'food' ? 'authentique' : 'luxe'
  );
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>({
    primary_color: normalizeHex(shop.theme_config?.primary_color || shop.theme_color || '#0F172A'),
    secondary_color: normalizeHex(shop.theme_config?.secondary_color || '#F8FAFC'),
    font_family: shop.theme_config?.font_family || 'Plus Jakarta Sans',
    layout_style: shop.theme_config?.layout_style || (shop.category === 'food' ? 'card_landscape' : 'grid_portrait'),
    theme_preset_id: shop.theme_config?.theme_preset_id,
    custom_banner_url: shop.theme_config?.custom_banner_url || '',
    logo_url: shop.theme_config?.logo_url || '',
    event_mode_enabled: shop.theme_config?.event_mode_enabled || false,
    event_banner_text: shop.theme_config?.event_banner_text || '🎉 VENTES FLASH DU MOMENT — LIVRAISON EXPRESS À ABIDJAN',
    advanced_css: {
      borderRadius: shop.theme_config?.advanced_css?.borderRadius || 'rounded-xl',
      shadowIntensity: shop.theme_config?.advanced_css?.shadowIntensity || 'subtle',
      accentGlow: shop.theme_config?.advanced_css?.accentGlow || false,
    },
  });

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [upgradeNotice, setUpgradeNotice] = useState<string | null>(null);

  const presets = getAllPresetsForCategory(shop.category);
  const currentPrimaryTextColor = getContrastTextColor(themeConfig.primary_color || '#0F172A');
  const currentSecondaryTextColor = getContrastTextColor(themeConfig.secondary_color || '#F8FAFC');

  const brandDirectionMeta = {
    luxe: {
      label: 'Luxe discret',
      description: 'Palette sombre, spacing haut de gamme, impression premium.',
      preview: 'Style couture, contenu premium et mise en scène élevée.',
      config: {
        primary_color: '#1F2937',
        secondary_color: '#F7F3EE',
        font_family: 'Playfair Display',
        layout_style: shop.category === 'food' ? 'card_landscape' : 'grid_portrait',
      },
    },
    moderne: {
      label: 'Moderne & fluide',
      description: 'Surfaces claires, accents forts, navigation ultra claire.',
      preview: 'Cadrage digital, offres bien lisibles, ton très commercial.',
      config: {
        primary_color: '#0F172A',
        secondary_color: '#F8FAFC',
        font_family: 'Plus Jakarta Sans',
        layout_style: shop.category === 'food' ? 'card_landscape' : 'grid_portrait',
      },
    },
    authentique: {
      label: 'Authentique & chaleureux',
      description: 'Tonalités terreuses, ambiance locale, message plus humain.',
      preview: 'Mise en avant du produit, storytelling locale et confiance.',
      config: {
        primary_color: '#C2410C',
        secondary_color: '#FEF2F2',
        font_family: 'Poppins',
        layout_style: shop.category === 'food' ? 'card_landscape' : 'grid_portrait',
      },
    },
  } as const;

  const applyBrandDirection = (direction: keyof typeof brandDirectionMeta) => {
    setBrandDirection(direction);
    setThemeConfig((prev) => ({
      ...prev,
      ...brandDirectionMeta[direction].config,
      primary_color: normalizeHex(brandDirectionMeta[direction].config.primary_color),
      secondary_color: normalizeHex(brandDirectionMeta[direction].config.secondary_color),
      font_family: brandDirectionMeta[direction].config.font_family as ThemeConfig['font_family'],
      layout_style: brandDirectionMeta[direction].config.layout_style as ThemeConfig['layout_style'],
    }));
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 4 * 1024 * 1024) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const source = String(reader.result || '');

      const image = new Image();
      image.onload = () => {
        const maxSize = 512;
        const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        const context = canvas.getContext('2d');
        if (!context) return;

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const optimizedLogo = canvas.toDataURL('image/webp', 0.86);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        const dominant = estimateDominantColorFromPixels(data, canvas.width, canvas.height);
        const secondary = mixHexColors(dominant, '#FFFFFF', 0.8);

        setThemeConfig((prev) => ({
          ...prev,
          logo_url: optimizedLogo,
          primary_color: normalizeHex(dominant),
          secondary_color: normalizeHex(secondary),
        }));
      };
      image.src = source;
    };
    reader.readAsDataURL(file);
  };

  // Apply a preset
  const handleSelectPreset = (preset: ThemePreset) => {
    setUpgradeNotice(null);
    setThemeConfig(prev => ({
      ...prev,
      ...preset.config,
      theme_preset_id: preset.id,
    }));
  };

  // Save full theme
  const handleSaveTheme = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await fetch(`/api/shops/${shop.id}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme_config: themeConfig }),
      });
      if (res.ok) {
        const data = await res.json();
        onUpdateShop(data.shop);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Subscription Tier Header & Switcher */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-500" />
              <h3 className="font-extrabold text-slate-900 text-base">
                Fonctionnalités de la Boutique
              </h3>
              <span className={`text-xs font-black uppercase px-2.5 py-0.5 rounded-full ${
                currentTier === 'pro'
                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                  : currentTier === 'premium'
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-slate-100 text-slate-700'
              }`}>
                ACCÈS COMPLET
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Secteur d'activité : <strong className="text-slate-800">{shop.category === 'food' ? '🍲 Restauration (Food)' : shop.category === 'fashion' ? '👗 Mode & Lingerie' : '🏪 Commerce local'}</strong>. Toutes les options visuelles, promotions et outils marketing sont inclus gratuitement.
            </p>
            <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3">
              <p className="text-xs font-black text-slate-800">Accès complet inclus</p>
              <p className="text-[11px] text-slate-500 mt-1">Aucune fonctionnalité n’est réservée à un pack.</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {['Vitrine publique', 'Catalogue et stock', 'Commandes WhatsApp', 'Thèmes et bannières', 'Studio marketing', 'CSS avancé'].map(feature => (
                  <span key={feature} className="text-[10px] font-bold px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-600">
                    {feature}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-100 p-1">
            <span className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">Accès actif</span>
            <span className={`rounded-lg px-3 py-1.5 text-xs font-black shadow-xs ${
              currentTier === 'pro' ? 'bg-purple-600 text-white' : currentTier === 'premium' ? 'bg-amber-500 text-white' : 'bg-white text-slate-900'
            }`}>
              Accès complet
            </span>
          </div>
        </div>

        {upgradeNotice && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
            <span>{upgradeNotice}</span>
          </div>
        )}
      </div>

      {/* 2. Theme Customization Form */}
      <form onSubmit={handleSaveTheme} className="space-y-6">
        {/* Preset Gallery */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <Palette className="w-4 h-4 text-rose-600" />
              <span>Galerie de Thèmes Prédéfinis ({shop.category === 'food' ? 'Food & Grillades' : 'Fashion & Lingerie'})</span>
            </h4>
            <span className="text-[11px] text-slate-400">
              Cliquez pour appliquer instantanément
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {presets.map(p => {
              const isSelected = themeConfig.theme_preset_id === p.id;
              const isLocked = false;

              return (
                <div
                  key={p.id}
                  onClick={() => handleSelectPreset(p)}
                  className={`relative p-3.5 rounded-2xl border text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'border-slate-900 ring-2 ring-slate-900/10 bg-slate-50/70'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className={`h-16 rounded-xl bg-gradient-to-tr ${p.previewGradient} p-2 flex flex-col justify-between text-white mb-2.5`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-black/30 backdrop-blur-xs">
                        Inclus
                      </span>
                      {isSelected && (
                        <span className="w-5 h-5 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-xs">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {isLocked && (
                        <span className="w-5 h-5 rounded-full bg-black/40 text-white flex items-center justify-center">
                          <Lock className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-black truncate">{p.name}</span>
                  </div>

                  <h5 className="font-bold text-slate-900 text-xs truncate">{p.name}</h5>
                  <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                    {p.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Brand Assistant */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-600" />
              <span>Assistant d'identité visuelle</span>
            </h4>
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
              Direction : {brandDirectionMeta[brandDirection].label}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {(['luxe', 'moderne', 'authentique'] as const).map((option) => {
              const isActive = brandDirection === option;
              return (
                <button
                  type="button"
                  key={option}
                  onClick={() => applyBrandDirection(option)}
                  className={`text-left rounded-2xl border p-3.5 transition-all ${
                    isActive
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-80">
                    {option === 'luxe' ? 'Luxe' : option === 'moderne' ? 'Moderne' : 'Authentique'}
                  </div>
                  <div className="mt-2 text-xs font-bold leading-relaxed">
                    {brandDirectionMeta[option].label}
                  </div>
                </button>
              );
            })}
          </div>

          <div
            className="rounded-2xl border border-slate-200 p-4"
            style={{
              background: `linear-gradient(135deg, ${themeConfig.primary_color} 0%, ${themeConfig.secondary_color} 100%)`,
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: currentPrimaryTextColor }}>
                  Aperçu boutique
                </div>
                <div className="mt-2 text-md font-black" style={{ color: currentPrimaryTextColor }}>
                  {shop.name}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {themeConfig.logo_url ? (
                  <img src={themeConfig.logo_url} alt={shop.name} className="w-11 h-11 rounded-xl object-cover border-2 border-white bg-white" />
                ) : (
                  <div className="w-11 h-11 rounded-xl border-2 border-white bg-white/80 flex items-center justify-center text-[10px] font-black" style={{ color: themeConfig.primary_color }}>
                    {shop.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-white/20 backdrop-blur-sm p-3">
              <p className="text-[11px] font-bold" style={{ color: currentPrimaryTextColor }}>
                {brandDirectionMeta[brandDirection].description}
              </p>
              <p className="mt-2 text-[10px]" style={{ color: currentPrimaryTextColor }}>
                {brandDirectionMeta[brandDirection].preview}
              </p>
            </div>
          </div>
        </div>

        {/* Logo & Colors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-rose-600" />
              <span>Logo de la boutique</span>
            </h4>

            <div className="flex items-center gap-4">
              {themeConfig.logo_url ? (
                <img src={themeConfig.logo_url} alt="Logo boutique" className="w-16 h-16 rounded-2xl object-cover border border-slate-200 bg-white" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}

              <label className="flex-1 cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-center text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition-colors">
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                {themeConfig.logo_url ? 'Remplacer le logo' : 'Téléverser un logo'}
              </label>
            </div>

            {themeConfig.logo_url && (
              <button
                type="button"
                onClick={() => setThemeConfig((prev) => ({ ...prev, logo_url: '' }))}
                className="text-[11px] font-bold text-rose-700 hover:text-rose-800"
              >
                Supprimer le logo
              </button>
            )}
          </div>

          {/* Colors */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <Sliders className="w-4 h-4 text-rose-600" />
              <span>Palette de Couleurs</span>
            </h4>

            {/* Primary Accent Color */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Couleur d'Accent Primaire (Boutons, Prix, Badges)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  list="safe-theme-colors"
                  value={themeConfig.primary_color}
                  onChange={(e) => setThemeConfig(prev => ({ ...prev, primary_color: normalizeHex(e.target.value) }))}
                  className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 p-0.5 shrink-0"
                />
                <datalist id="safe-theme-colors">
                  {SAFE_THEME_COLORS.map((color) => (
                    <option key={color} value={color} />
                  ))}
                </datalist>
                <input
                  type="text"
                  value={themeConfig.primary_color}
                  onChange={(e) => setThemeConfig(prev => ({ ...prev, primary_color: normalizeHex(e.target.value) }))}
                  className="w-28 text-xs p-2 rounded-xl border border-slate-300 font-mono font-bold"
                />
                <div 
                  className="h-10 flex-1 rounded-xl flex items-center justify-center font-bold text-xs shadow-inner"
                  style={{ backgroundColor: themeConfig.primary_color, color: currentPrimaryTextColor }}
                >
                  Aperçu Accent
                </div>
              </div>
            </div>

            {/* Secondary Color */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Couleur Secondaire (Fonds subtils, Cartes)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  list="safe-theme-colors"
                  value={themeConfig.secondary_color}
                  onChange={(e) => setThemeConfig(prev => ({ ...prev, secondary_color: normalizeHex(e.target.value) }))}
                  className="w-10 h-10 rounded-xl cursor-pointer border border-slate-200 p-0.5 shrink-0"
                />
                <input
                  type="text"
                  value={themeConfig.secondary_color}
                  onChange={(e) => setThemeConfig(prev => ({ ...prev, secondary_color: normalizeHex(e.target.value) }))}
                  className="w-28 text-xs p-2 rounded-xl border border-slate-300 font-mono font-bold"
                />
                <div 
                  className="h-10 flex-1 rounded-xl border border-slate-200 flex items-center justify-center font-bold text-xs shadow-2xs"
                  style={{ backgroundColor: themeConfig.secondary_color, color: currentSecondaryTextColor }}
                >
                  Aperçu Fond
                </div>
              </div>
            </div>
          </div>

          {/* Typography & Layout Style */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <Type className="w-4 h-4 text-rose-600" />
              <span>Typographie & Mode d'Affichage</span>
            </h4>

            {/* Font Family Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Police Typographique
              </label>
              <select
                value={themeConfig.font_family}
                onChange={(e) => setThemeConfig(prev => ({ ...prev, font_family: e.target.value as any }))}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-800 focus:ring-2 focus:ring-rose-500"
              >
                <option value="Plus Jakarta Sans">Plus Jakarta Sans (Moderne & Net)</option>
                <option value="Poppins">Poppins (Chaleureux & Arrondi - Populaire Babi)</option>
                <option value="Playfair Display">Playfair Display (Haute Couture & Gastronomie)</option>
                <option value="Cinzel">Cinzel (Luxe & Artisanat d'Or)</option>
              </select>
            </div>

            {/* Layout Style: Grid Portrait (Fashion) vs Card Landscape (Food) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Ratio des Fiches Articles
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setThemeConfig(prev => ({ ...prev, layout_style: 'grid_portrait' }))}
                  className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all ${
                    themeConfig.layout_style === 'grid_portrait'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span>👗 Portrait 3:4 (Fashion)</span>
                  <p className="text-[10px] font-normal opacity-80 mt-0.5">Idéal vêtements & mannequins</p>
                </button>

                <button
                  type="button"
                  onClick={() => setThemeConfig(prev => ({ ...prev, layout_style: 'card_landscape' }))}
                  className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all ${
                    themeConfig.layout_style === 'card_landscape'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span>🍲 Paysage 16:9 / Carré (Food)</span>
                  <p className="text-[10px] font-normal opacity-80 mt-0.5">Idéal plats & grillades</p>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Banner & Promotional Event Banner */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-rose-600" />
              <span>Bannière d'En-tête & Mode Événementiel (Soldes, Tabaski, Fêtes)</span>
            </h4>
            {!isFeatureAllowed(currentTier, 'event_banner') && (
              <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                <Lock className="w-3 h-3" /> Premium
              </span>
            )}
          </div>

          {/* Custom Banner URL */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              URL de l'image de bannière d'en-tête (HD)
            </label>
            <input
              type="url"
              placeholder="https://images.unsplash.com/..."
              value={themeConfig.custom_banner_url || ''}
              onChange={(e) => setThemeConfig(prev => ({ ...prev, custom_banner_url: e.target.value }))}
              disabled={!isFeatureAllowed(currentTier, 'custom_banner')}
              className="w-full text-xs p-2.5 rounded-xl border border-slate-300 font-mono focus:ring-2 focus:ring-rose-500 disabled:opacity-50"
            />
          </div>

          {/* Event Announcement Bar Toggle */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={themeConfig.event_mode_enabled || false}
                  onChange={(e) => setThemeConfig(prev => ({ ...prev, event_mode_enabled: e.target.checked }))}
                  disabled={!isFeatureAllowed(currentTier, 'event_banner')}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 disabled:opacity-50"
                />
                <span>Activer le bandeau d'annonce promotionnel en haut de la vitrine</span>
              </label>
              {themeConfig.event_mode_enabled && (
                <span className="text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                  Actif
                </span>
              )}
            </div>

            {themeConfig.event_mode_enabled && (
              <div>
                <input
                  type="text"
                  placeholder="Ex: ✨ NOUVELLE COLLECTION DISPONIBLE — LIVRAISON EXPRESS ABIDJAN"
                  value={themeConfig.event_banner_text || ''}
                  onChange={(e) => setThemeConfig(prev => ({ ...prev, event_banner_text: e.target.value }))}
                  disabled={!isFeatureAllowed(currentTier, 'event_banner')}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 font-bold bg-white focus:ring-2 focus:ring-rose-500 disabled:opacity-50"
                />
              </div>
            )}
          </div>
        </div>

        {/* Advanced CSS Controls (PRO Tier Only) */}
        <div className={`p-5 rounded-2xl border shadow-2xs space-y-4 ${
          currentTier === 'pro' ? 'bg-white border-slate-200' : 'bg-slate-50/70 border-dashed border-slate-300'
        }`}>
          <div className="flex items-center justify-between">
            <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span>Studio CSS Avancé & Ambiance Visuelle</span>
            </h4>
            <span className="text-[11px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">✓ Inclus gratuitement</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Border Radius */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Arrondi des Cartes
              </label>
              <select
                disabled={false}
                value={themeConfig.advanced_css?.borderRadius || 'rounded-xl'}
                onChange={(e) => setThemeConfig(prev => ({
                  ...prev,
                  advanced_css: { ...prev.advanced_css, borderRadius: e.target.value as any }
                }))}
                className="w-full text-xs p-2 rounded-xl border border-slate-300 bg-white font-bold disabled:opacity-50"
              >
                <option value="rounded-none">Carré strict (rounded-none)</option>
                <option value="rounded-xl">Standard équilibré (rounded-xl)</option>
                <option value="rounded-2xl">Couture doux (rounded-2xl)</option>
                <option value="rounded-3xl">Pillule luxueuse (rounded-3xl)</option>
              </select>
            </div>

            {/* Shadow Intensity */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Intensité d'Ombrage
              </label>
              <select
                disabled={false}
                value={themeConfig.advanced_css?.shadowIntensity || 'subtle'}
                onChange={(e) => setThemeConfig(prev => ({
                  ...prev,
                  advanced_css: { ...prev.advanced_css, shadowIntensity: e.target.value as any }
                }))}
                className="w-full text-xs p-2 rounded-xl border border-slate-300 bg-white font-bold disabled:opacity-50"
              >
                <option value="none">Aucun ombrage (Plat)</option>
                <option value="subtle">Subtil (Subtle 2xs)</option>
                <option value="soft">Doux & Aérien (Soft)</option>
                <option value="strong">Profondeur marquée (Strong)</option>
              </select>
            </div>

            {/* Accent Glow */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Halo Lumineux d'Accent
              </label>
              <label className="flex items-center gap-2 p-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={false}
                  checked={themeConfig.advanced_css?.accentGlow || false}
                  onChange={(e) => setThemeConfig(prev => ({
                    ...prev,
                    advanced_css: { ...prev.advanced_css, accentGlow: e.target.checked }
                  }))}
                  className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4 disabled:opacity-50"
                />
                <span>Halo sur bouton d'action</span>
              </label>
            </div>
          </div>
        </div>

        {/* Submit Bar */}
        <div className="flex items-center justify-between gap-3 pt-2">
          {saveSuccess && (
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Thème & styles appliqués à votre vitrine !</span>
            </div>
          )}

          <div className="ml-auto">
            <button
              type="submit"
              disabled={saving}
              className="py-3 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-colors flex items-center gap-2"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Enregistrer et appliquer le thème</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
