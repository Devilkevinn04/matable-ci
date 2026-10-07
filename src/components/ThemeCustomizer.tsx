import React, { useEffect, useState } from 'react';
import {
  Palette, 
  Sparkles, 
  Check, 
  Type, 
  Image as ImageIcon, 
  Sliders, 
  Megaphone, 
  RefreshCw, 
  ChevronDown,
} from 'lucide-react';
import { BrandDirection, Shop, ThemeConfig } from '../types';
import { SAFE_THEME_COLORS, estimateDominantColorFromPixels, getContrastTextColor, mixHexColors, normalizeHex } from '../utils/color';
import { getCategoryDefaults } from '../utils/categoryDefaults';
import { getAllPresetsForCategory, ThemePreset } from '../utils/themePresets';
import { compressImageClientSide } from '../utils/format';
import { isSubscriptionFeatureIncluded } from '../utils/subscriptionFeatures';

interface ThemeCustomizerProps {
  shop: Shop;
  onUpdateShop: (updatedShop: Shop) => void;
}

export const ThemeCustomizer: React.FC<ThemeCustomizerProps> = ({ shop, onUpdateShop }) => {
  const currentTier = shop.subscription?.plan || 'standard';
  const canCustomize = shop.admin_mode || shop.subscription?.isActive === true
    && isSubscriptionFeatureIncluded(currentTier, 'custom_branding');
  const categoryDefaults = getCategoryDefaults(shop.category);
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>({
    primary_color: normalizeHex(shop.theme_config?.primary_color || shop.theme_color || categoryDefaults.primaryColor),
    secondary_color: normalizeHex(shop.theme_config?.secondary_color || categoryDefaults.secondaryColor),
    font_family: shop.theme_config?.font_family || 'Plus Jakarta Sans',
    layout_style: shop.theme_config?.layout_style || categoryDefaults.layoutStyle,
    theme_preset_id: shop.theme_config?.theme_preset_id,
    brand_direction: shop.theme_config?.brand_direction || categoryDefaults.brandDirection,
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
  const [savedThemeConfig, setSavedThemeConfig] = useState<ThemeConfig>(() => ({
    primary_color: normalizeHex(shop.theme_config?.primary_color || shop.theme_color || categoryDefaults.primaryColor),
    secondary_color: normalizeHex(shop.theme_config?.secondary_color || categoryDefaults.secondaryColor),
    font_family: shop.theme_config?.font_family || 'Plus Jakarta Sans',
    layout_style: shop.theme_config?.layout_style || categoryDefaults.layoutStyle,
    theme_preset_id: shop.theme_config?.theme_preset_id,
    brand_direction: shop.theme_config?.brand_direction || categoryDefaults.brandDirection,
    custom_banner_url: shop.theme_config?.custom_banner_url || '',
    logo_url: shop.theme_config?.logo_url || '',
    event_mode_enabled: shop.theme_config?.event_mode_enabled || false,
    event_banner_text: shop.theme_config?.event_banner_text || '🎉 VENTES FLASH DU MOMENT — LIVRAISON EXPRESS À ABIDJAN',
    advanced_css: {
      borderRadius: shop.theme_config?.advanced_css?.borderRadius || 'rounded-xl',
      shadowIntensity: shop.theme_config?.advanced_css?.shadowIntensity || 'subtle',
      accentGlow: shop.theme_config?.advanced_css?.accentGlow || false,
    },
  }));
  const [primaryColorDraft, setPrimaryColorDraft] = useState(themeConfig.primary_color);
  const [secondaryColorDraft, setSecondaryColorDraft] = useState(themeConfig.secondary_color);
  const [colorInputError, setColorInputError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const presets = getAllPresetsForCategory(shop.category);
  const brandDirection = themeConfig.brand_direction || categoryDefaults.brandDirection;
  const hasUnsavedChanges = JSON.stringify(themeConfig) !== JSON.stringify(savedThemeConfig);
  const currentPrimaryTextColor = getContrastTextColor(themeConfig.primary_color || '#0F172A');
  const currentSecondaryTextColor = getContrastTextColor(themeConfig.secondary_color || '#F8FAFC');
  const previewFont = themeConfig.font_family === 'Playfair Display' || themeConfig.font_family === 'Cinzel'
    ? 'Georgia, serif'
    : 'system-ui, sans-serif';
  const previewRadius = themeConfig.advanced_css?.borderRadius === 'rounded-none'
    ? '0px'
    : themeConfig.advanced_css?.borderRadius === 'rounded-3xl'
      ? '20px'
      : themeConfig.advanced_css?.borderRadius === 'rounded-2xl'
        ? '14px'
        : '8px';
  const previewShadow = themeConfig.advanced_css?.shadowIntensity === 'none'
    ? 'none'
    : themeConfig.advanced_css?.shadowIntensity === 'strong'
      ? '0 8px 18px rgba(37,35,31,.18)'
      : themeConfig.advanced_css?.shadowIntensity === 'soft'
        ? '0 5px 14px rgba(37,35,31,.12)'
        : '0 2px 6px rgba(37,35,31,.08)';

  useEffect(() => setPrimaryColorDraft(themeConfig.primary_color), [themeConfig.primary_color]);
  useEffect(() => setSecondaryColorDraft(themeConfig.secondary_color), [themeConfig.secondary_color]);

  const updateCustomTheme = (update: (current: ThemeConfig) => ThemeConfig) => {
    setThemeConfig((current) => ({
      ...update(current),
      theme_preset_id: undefined,
      brand_direction: undefined,
    }));
  };

  const updateHexDraft = (value: string, which: 'primary' | 'secondary') => {
    const setDraft = which === 'primary' ? setPrimaryColorDraft : setSecondaryColorDraft;
    const key = which === 'primary' ? 'primary_color' : 'secondary_color';
    setDraft(value);
    if (/^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim())) {
      setColorInputError(null);
      updateCustomTheme((current) => ({ ...current, [key]: normalizeHex(value) }));
    } else if (value.trim()) {
      setColorInputError('Entrez un code couleur valide, par exemple #176B55.');
    }
  };

  const commitHexDraft = (which: 'primary' | 'secondary') => {
    const draft = which === 'primary' ? primaryColorDraft : secondaryColorDraft;
    const key = which === 'primary' ? 'primary_color' : 'secondary_color';
    if (!/^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(draft.trim())) {
      const savedValue = themeConfig[key];
      if (which === 'primary') setPrimaryColorDraft(savedValue);
      else setSecondaryColorDraft(savedValue);
      setColorInputError(null);
      return;
    }
    const normalized = normalizeHex(draft);
    if (which === 'primary') setPrimaryColorDraft(normalized);
    else setSecondaryColorDraft(normalized);
    updateCustomTheme((current) => ({ ...current, [key]: normalized }));
    setColorInputError(null);
  };

  const brandDirectionMeta = {
    luxe: {
      label: 'Luxe discret',
      description: 'Pour une vitrine élégante et soignée.',
      preview: 'Couleurs profondes, touches claires et présentation raffinée.',
      config: {
        primary_color: '#1F2937',
        secondary_color: '#F7F3EE',
        font_family: 'Playfair Display',
        layout_style: categoryDefaults.layoutStyle,
      },
    },
    moderne: {
      label: 'Moderne & fluide',
      description: 'Pour un style actuel et facile à parcourir.',
      preview: 'Fonds clairs, contrastes nets et présentation épurée.',
      config: {
        primary_color: '#0F172A',
        secondary_color: '#F8FAFC',
        font_family: 'Plus Jakarta Sans',
        layout_style: categoryDefaults.layoutStyle,
      },
    },
    authentique: {
      label: 'Authentique & chaleureux',
      description: 'Pour une ambiance accueillante et proche.',
      preview: 'Tons chaleureux, détails doux et mise en avant des articles.',
      config: {
        primary_color: '#C2410C',
        secondary_color: '#FEF2F2',
        font_family: 'Poppins',
        layout_style: categoryDefaults.layoutStyle,
      },
    },
  } as const;

  const applyBrandDirection = (direction: keyof typeof brandDirectionMeta) => {
    setThemeConfig((prev) => ({
      ...prev,
      brand_direction: direction,
      theme_preset_id: undefined,
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

        updateCustomTheme((prev) => ({
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

  const handleBannerUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      setSaveError('Choisissez une image de 8 Mo maximum.');
      event.target.value = '';
      return;
    }
    try {
      const { dataUrl } = await compressImageClientSide(file, 1600, 350);
      updateCustomTheme((current) => ({ ...current, custom_banner_url: dataUrl }));
      setSaveError(null);
    } catch {
      setSaveError("La photo n'a pas pu être optimisée. Essayez un autre fichier.");
    }
    event.target.value = '';
  };

  const inferBrandDirection = (preset: ThemePreset): BrandDirection => {
    if (preset.config.brand_direction) return preset.config.brand_direction;
    if (preset.config.font_family === 'Cinzel' || preset.config.font_family === 'Playfair Display') return 'luxe';
    if (preset.config.font_family === 'Poppins') return 'authentique';
    return 'moderne';
  };

  const handleSelectPreset = (preset: ThemePreset) => {
    const direction = inferBrandDirection(preset);
    setThemeConfig(prev => ({
      ...prev,
      ...preset.config,
      brand_direction: direction,
      theme_preset_id: preset.id,
    }));
  };

  // Save full theme
  const handleSaveTheme = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
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
        setSavedThemeConfig({ ...themeConfig });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || 'Le thème n’a pas pu être enregistré. Réessayez.');
      }
    } catch {
      setSaveError('Impossible de joindre le serveur. Vos changements ne sont pas enregistrés.');
    } finally {
      setSaving(false);
    }
  };

  if (!canCustomize) {
    return (
      <section className="max-w-3xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-emerald-700" />
          <h3 className="text-base font-extrabold text-slate-900">Personnalisation de la vitrine</h3>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase text-amber-900">Premium · Pro</span>
        </div>
        <p className="text-sm leading-6 text-slate-600">Les couleurs, polices, logo, bannière, réseaux sociaux et bandeau événementiel sont inclus dans Premium et Pro.</p>
        <p className="text-xs leading-5 text-slate-500">Votre vitrine actuelle reste en ligne. Vous pourrez modifier son identité visuelle en choisissant Premium ou Pro à votre prochaine période d’essai ou échéance d’abonnement.</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-500" />
              <h3 className="font-extrabold text-slate-900 text-base">
                Fonctionnalités de la Boutique
              </h3>
              <span className="text-xs font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                {currentTier}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {categoryDefaults.icon} {categoryDefaults.label} · Choisissez un style, regardez l’aperçu, puis enregistrez.
            </p>
            <p className="mt-2 text-[11px] text-slate-500">Personnalisez votre vitrine Premium/Pro. Rien ne change sur votre boutique avant l’enregistrement.</p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-100 p-1">
            <span className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500">Mode</span>
            <span className="rounded-lg px-3 py-1.5 text-xs font-black shadow-xs bg-emerald-600 text-white">
              {currentTier === 'pro' ? 'Pro' : 'Premium'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Theme Customization Form */}
      <form onSubmit={handleSaveTheme} className="space-y-6">
        {/* Preset Gallery */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <Palette className="w-4 h-4 text-[#176b55]" />
              <span>Choisir un style ({categoryDefaults.label})</span>
            </h4>
            <span className="text-[11px] text-slate-500">
              {hasUnsavedChanges ? 'Modifications à enregistrer' : 'Style actuel enregistré'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {presets.map(p => {
              const isSelected = themeConfig.theme_preset_id === p.id;

              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => handleSelectPreset(p)}
                  aria-pressed={isSelected}
                  className={`relative w-full p-3.5 rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b55] ${
                    isSelected
                      ? 'border-[#176b55] ring-2 ring-[#176b55]/15 bg-[#f4f8f5]'
                      : 'border-slate-200 hover:border-[#176b55] bg-white'
                  }`}
                >
                  <div
                    className={`h-16 rounded-xl ${p.previewColors ? '' : `bg-gradient-to-tr ${p.previewGradient}`} p-2 flex flex-col justify-between text-white mb-2.5`}
                    style={p.previewColors ? { background: `linear-gradient(135deg, ${p.previewColors[0]}, ${p.previewColors[1]})` } : undefined}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/30">
                        Style proposé
                      </span>
                      {isSelected && (
                        <span className="w-5 h-5 rounded-full bg-white text-[#0f4d3d] flex items-center justify-center shadow-xs" aria-label="Style sélectionné">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-black truncate">{p.name}</span>
                  </div>

                  <h5 className="font-bold text-slate-900 text-sm">{p.name}</h5>
                  <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                    {p.description}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#0f4d3d]">{isSelected ? 'Sélectionné' : 'Utiliser ce style'} <Check className={`h-3.5 w-3.5 ${isSelected ? '' : 'invisible'}`} /></span>
                </button>
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
              <span className="text-[10px] font-semibold text-slate-500">
              Ambiance : {brandDirectionMeta[brandDirection].label}
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
                  aria-pressed={isActive}
                  className={`text-left rounded-xl border p-3.5 transition-all ${
                    isActive
                      ? 'border-[#0f4d3d] bg-[#0f4d3d] text-white shadow-sm'
                      : 'border-slate-200 bg-slate-50 hover:border-[#176b55] text-slate-700'
                  }`}
                >
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] opacity-80">
                    {option === 'luxe' ? 'Luxe' : option === 'moderne' ? 'Moderne' : 'Authentique'}
                  </div>
                  <div className="mt-2 text-xs font-bold leading-relaxed">
                    {brandDirectionMeta[option].label}
                  </div>
                  <p className="mt-1 text-[11px] font-normal leading-4 opacity-80">{brandDirectionMeta[option].description}</p>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h5 className="text-sm font-bold text-slate-900">Aperçu en direct</h5>
                <p className="mt-0.5 text-xs text-slate-500">Exemple de rendu · visible après enregistrement</p>
              </div>
              {hasUnsavedChanges && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900">Brouillon non enregistré</span>}
            </div>
            <div className="mx-auto max-w-sm overflow-hidden border border-slate-200 bg-white" style={{ borderRadius: previewRadius, boxShadow: previewShadow, fontFamily: previewFont }}>
              <div className="flex items-center justify-between gap-2 px-3 py-2.5" style={{ backgroundColor: themeConfig.primary_color, color: currentPrimaryTextColor }}>
                <div className="flex min-w-0 items-center gap-2">
                  {themeConfig.logo_url
                    ? <img src={themeConfig.logo_url} alt="" className="h-7 w-7 shrink-0 rounded-md border border-white/50 bg-white object-cover" />
                    : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/90 text-[10px] font-bold" style={{ color: themeConfig.primary_color }}>{shop.name.slice(0, 2).toUpperCase()}</span>}
                  <span className="truncate text-xs font-bold">{shop.name}</span>
                </div>
                <span className="shrink-0 text-[10px]">Boutique</span>
              </div>
              {themeConfig.custom_banner_url && <div className="h-16 bg-cover bg-center" role="img" aria-label="Aperçu de la bannière" style={{ backgroundImage: `url("${themeConfig.custom_banner_url}")` }} />}
              {themeConfig.event_mode_enabled && <div className="truncate px-3 py-1.5 text-center text-[10px] font-semibold" style={{ backgroundColor: themeConfig.secondary_color, color: currentSecondaryTextColor }}>{themeConfig.event_banner_text || 'Votre annonce apparaîtra ici'}</div>}
              <div className="p-3" style={{ backgroundColor: themeConfig.secondary_color, color: currentSecondaryTextColor }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{categoryDefaults.label} · Abidjan</p>
                <h6 className="mt-1 text-sm font-bold">Bienvenue chez {shop.name}</h6>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[0, 1].map((item) => <div key={item} className="overflow-hidden border border-black/5 bg-white" style={{ borderRadius: previewRadius, boxShadow: previewShadow }}>
                    <div className="flex h-14 items-center justify-center text-xl" style={{ backgroundColor: `${themeConfig.primary_color}12` }}>{categoryDefaults.icon}</div>
                    <div className="p-2"><span className="block truncate text-[10px] font-semibold text-slate-800">Exemple d’article</span><span className="mt-1 block text-[10px] font-bold" style={{ color: themeConfig.primary_color }}>5 000 FCFA</span></div>
                  </div>)}
                </div>
                <button type="button" className="mt-3 w-full px-3 py-2 text-[10px] font-semibold text-white" style={{ backgroundColor: themeConfig.primary_color, borderRadius: previewRadius }}>Commander sur WhatsApp</button>
              </div>
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
              <label htmlFor="theme-primary-color" className="block text-xs font-bold text-slate-700 mb-1.5">
                Couleur principale <span className="font-normal text-slate-500">(boutons et prix)</span>
              </label>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <input
                  id="theme-primary-color"
                  type="color"
                  list="safe-theme-colors"
                  value={themeConfig.primary_color}
                  aria-label="Choisir la couleur principale"
                  onChange={(e) => updateCustomTheme((prev) => ({ ...prev, primary_color: normalizeHex(e.target.value) }))}
                  className="h-11 w-12 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white p-1"
                />
                <datalist id="safe-theme-colors">
                  {SAFE_THEME_COLORS.map((color) => (
                    <option key={color} value={color} />
                  ))}
                </datalist>
                <span className="min-w-0 text-xs text-slate-600">Utilisée pour les boutons, prix et repères.</span>
                <div 
                  className="h-10 w-10 shrink-0 rounded-md border border-black/5"
                  aria-label={`Aperçu couleur ${themeConfig.primary_color}`}
                  style={{ backgroundColor: themeConfig.primary_color, color: currentPrimaryTextColor }}
                />
              </div>
              <details className="mt-2 text-xs text-slate-600">
                <summary className="w-fit cursor-pointer font-medium text-[#0f4d3d]">Saisir un code couleur précis</summary>
                <label htmlFor="theme-primary-hex" className="mt-2 block text-[11px]">Code de la couleur principale</label>
                <input id="theme-primary-hex" type="text" inputMode="text" autoComplete="off" spellCheck={false} value={primaryColorDraft} onChange={(event) => updateHexDraft(event.target.value, 'primary')} onBlur={() => commitHexDraft('primary')} aria-invalid={Boolean(colorInputError)} aria-describedby={colorInputError ? 'theme-color-error' : undefined} placeholder="#176B55" className="mt-1 w-36 rounded-md border border-slate-300 px-2.5 py-2 font-mono text-xs" />
              </details>
            </div>

            {/* Secondary Color */}
            <div>
              <label htmlFor="theme-secondary-color" className="block text-xs font-bold text-slate-700 mb-1.5">
                Couleur de fond <span className="font-normal text-slate-500">(surfaces et cartes)</span>
              </label>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <input
                  id="theme-secondary-color"
                  type="color"
                  list="safe-theme-colors"
                  value={themeConfig.secondary_color}
                  aria-label="Choisir la couleur de fond"
                  onChange={(e) => updateCustomTheme((prev) => ({ ...prev, secondary_color: normalizeHex(e.target.value) }))}
                  className="h-11 w-12 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white p-1"
                />
                <span className="min-w-0 flex-1 text-xs text-slate-600">Utilisée derrière le contenu de la vitrine.</span>
                <div className="h-10 w-10 shrink-0 rounded-md border border-slate-200" aria-label={`Aperçu couleur ${themeConfig.secondary_color}`} style={{ backgroundColor: themeConfig.secondary_color }} />
              </div>
              <details className="mt-2 text-xs text-slate-600">
                <summary className="w-fit cursor-pointer font-medium text-[#0f4d3d]">Saisir un code couleur précis</summary>
                <label htmlFor="theme-secondary-hex" className="mt-2 block text-[11px]">Code de la couleur de fond</label>
                <input id="theme-secondary-hex" type="text" inputMode="text" autoComplete="off" spellCheck={false} value={secondaryColorDraft} onChange={(event) => updateHexDraft(event.target.value, 'secondary')} onBlur={() => commitHexDraft('secondary')} aria-invalid={Boolean(colorInputError)} aria-describedby={colorInputError ? 'theme-color-error' : undefined} placeholder="#F8FAFC" className="mt-1 w-36 rounded-md border border-slate-300 px-2.5 py-2 font-mono text-xs" />
              </details>
              {colorInputError && <p id="theme-color-error" role="alert" className="mt-2 text-xs text-rose-700">{colorInputError}</p>}
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
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-700">Photo de couverture de la boutique</label>
            {themeConfig.custom_banner_url && (
              <img src={themeConfig.custom_banner_url} alt="Aperçu de la couverture de la boutique" className="h-36 w-full rounded-xl border border-slate-200 bg-slate-50 object-cover sm:h-44" />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-slate-700">
                <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={handleBannerUpload} className="sr-only" />
                <ImageIcon className="h-4 w-4" /> {themeConfig.custom_banner_url ? 'Remplacer la photo' : 'Téléverser une photo'}
              </label>
              {themeConfig.custom_banner_url && (
                <button type="button" onClick={() => updateCustomTheme((current) => ({ ...current, custom_banner_url: '' }))} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">
                  <RefreshCw className="h-3.5 w-3.5" /> Retirer la photo
                </button>
              )}
              <span className="text-[11px] text-slate-500">JPG, PNG, WebP ou AVIF, 8 Mo maximum. Optimisée automatiquement.</span>
            </div>
          </div>

          {/* Event Announcement Bar Toggle */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={themeConfig.event_mode_enabled || false}
                  onChange={(e) => setThemeConfig(prev => ({ ...prev, event_mode_enabled: e.target.checked }))}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
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
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 font-bold bg-white focus:ring-2 focus:ring-rose-500"
                />
              </div>
            )}
          </div>
        </div>

        {/* Advanced CSS Controls */}
        <div className="p-5 rounded-2xl border shadow-2xs space-y-4 bg-white border-slate-200">
          <div className="flex items-center justify-between">
            <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span>Studio CSS Avancé & Ambiance Visuelle</span>
            </h4>
            <span className="text-[11px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">Premium · Pro</span>
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
          {saveError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">{saveError}</p>}
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
