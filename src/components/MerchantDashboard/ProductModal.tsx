import React from 'react';
import { Store, ShoppingBag, Package, Plus, Edit3, Trash2, Sparkles, Phone, Lock, Clock, Check, Send, ExternalLink, ChevronRight, UserPlus, X, UtensilsCrossed, Shirt, Search, Eye, EyeOff, Minus, TrendingUp, DollarSign, MapPin, Palette, Key, AlertTriangle, Copy, RotateCcw, Calendar, Upload, Boxes } from 'lucide-react';
import { MerchantState } from './useMerchant';
import { ThemeCustomizer } from '../ThemeCustomizer';
import { formatFCFA } from '../../utils/format';
import { getCategoryDefaults } from '../../utils/categoryDefaults';
import { CategoryProductImage } from '../CategoryProductImage';

interface ProductModalProps {
  state: MerchantState;

}

export const ProductModal: React.FC<ProductModalProps> = ({ state }) => {
  const {
    currentShop, products, orders, activeTab, settingsSubTab, setSettingsSubTab,
    catalogSearch, setCatalogSearch, catalogFilter, setCatalogFilter,
    orderSearch, setOrderSearch, orderPaymentFilter, setOrderPaymentFilter, orderStatusFilter, setOrderStatusFilter,
    settingsName, setSettingsName, settingsWelcome, setSettingsWelcome, settingsOpen, setSettingsOpen,
    settingsPhone, setSettingsPhone, settingsCity, setSettingsCity, settingsNewPin, setSettingsNewPin,
    settingsSocialLinks, setSettingsSocialLinks, settingsDeliveryZones, setSettingsDeliveryZones, settingsSaved,
    hoursEnabled, setHoursEnabled, openTime, setOpenTime, closeTime, setCloseTime, activeDays, setActiveDays,
    manualOverride, hoursSaved, cronRunning, cronResult, copiedBilan, setCopiedBilan,
    isProductModalOpen, setIsProductModalOpen, editingProduct, prodTitle, setProdTitle, prodCategory, setProdCategory,
    prodDescription, setProdDescription, prodPrice, setProdPrice, prodStock, setProdStock, prodImage, setProdImage,
    prodLookbookImage, setProdLookbookImage, prodSizes, setProdSizes, prodColors, setProdColors, prodPrepTime, setProdPrepTime,
    prodModifiers, setProdModifiers, prodModifierMaxSelections, setProdModifierMaxSelections, prodAttributes, setProdAttributes, prodIsAvailable, setProdIsAvailable,
    imageCompressing, compressedSizeKB, originalImageSizeKB, flashBilan,
    handleSaveOpeningHours, handleResetManualOverride, handleTriggerCronBilan, handleQuickStockChange, handleQuickToggleVisibility,
    handleOpenAddModal, handleOpenEditModal, handleUpdateOrderStatus, handleImageUpload, handleLookbookImageUpload, handleSaveProduct, handleDeleteProduct,
    handleSaveGeneralSettings, addDeliveryZone, updateDeliveryZone, removeDeliveryZone, toast, copyOwnerLink, copyRegistrationLinks
  } = state;

  if (!isProductModalOpen) return null;
  const categoryDefaults = getCategoryDefaults(currentShop.category);
  return (
    <>
{/* PRODUCT ADD/EDIT MODAL */}

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#211712]/60 p-3 backdrop-blur-sm sm:p-4 lg:p-6" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="product-dialog-title" className="w-full max-w-[980px] max-h-[94vh] overflow-y-auto rounded-[28px] border-[3px] border-[#211712] bg-[#fffaf2] p-4 shadow-[12px_12px_0_rgba(33,23,18,0.96)] sm:p-5 lg:p-6">
            <div className="flex items-center justify-between gap-3 border-b-[2px] border-[#211712] pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border-[2px] border-[#211712] bg-[#f7e7c7] text-[#211712]">
                  <Boxes className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 id="product-dialog-title" className="truncate text-base font-extrabold text-[#211712] sm:text-lg lg:text-xl">
                    {editingProduct ? 'Modifier l\'article' : 'Ajouter un article au catalogue'}
                  </h3>
                  <p className="mt-0.5 text-[10px] text-[#6b5548] sm:text-[11px] lg:text-xs">Complétez les détails utiles pour la vitrine et les commandes.</p>
                </div>
              </div>
              <button
                onClick={() => setIsProductModalOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[2px] border-[#211712] bg-[#f7e7c7] text-[#211712] transition hover:bg-[#f0d6a5]"
                aria-label="Fermer le formulaire"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="mt-5 space-y-4 lg:space-y-5">
              <section className="space-y-3 rounded-2xl border-[2px] border-[#211712] bg-white p-3 sm:p-4 lg:p-5">
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-[#1b3a63] lg:text-[11px]">
                    Nom de l'article *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={categoryDefaults.productTitlePlaceholder}
                    value={prodTitle}
                    onChange={(e) => setProdTitle(e.target.value)}
                    className="w-full rounded-xl border-[2px] border-[#211712] bg-white p-3 text-sm font-bold text-[#211712] placeholder:text-slate-400 lg:text-[15px]"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-[10px] font-black uppercase tracking-[0.14em] text-[#1b3a63] lg:text-[11px]">
                      Catégorie d'article (optionnelle)
                    </label>
                    <span className="text-[10px] text-slate-400">Filtrage client</span>
                  </div>
                  <input
                    type="text"
                    placeholder={categoryDefaults.productCategoryPlaceholder}
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value)}
                    className="w-full rounded-xl border-[2px] border-[#211712] bg-white p-2.5 text-xs text-[#211712] lg:text-sm"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {categoryDefaults.productCategorySuggestions.map((catSuggestion) => (
                      <button
                        key={catSuggestion}
                        type="button"
                        onClick={() => setProdCategory(catSuggestion)}
                        className={`rounded-full border px-2.5 py-1 text-[10px] transition ${
                          prodCategory === catSuggestion
                            ? 'border-[#211712] bg-[#211712] font-bold text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {catSuggestion}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-[10px] font-black uppercase tracking-[0.14em] text-[#1b3a63] lg:text-[11px]">
                      Descriptif court
                    </label>
                    <span className={`text-[11px] font-mono ${prodDescription.length > 200 ? 'font-bold text-amber-700' : 'text-slate-400'}`}>
                      {prodDescription.length}/200
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={200}
                    placeholder={categoryDefaults.productDescriptionPlaceholder}
                    value={prodDescription}
                    onChange={(e) => setProdDescription(e.target.value)}
                    className="w-full rounded-xl border-[2px] border-[#211712] bg-white p-3 text-xs text-[#211712] lg:text-sm"
                  />
                </div>
              </section>

              {categoryDefaults.productAttributes.length > 0 && (
                <section className="space-y-3 rounded-2xl border border-[#d9ded7] bg-[#f6f8f3] p-3 sm:p-4">
                  <div>
                    <h4 className="text-sm font-extrabold text-[#0f4d3d]">{categoryDefaults.productAttributesHeading}</h4>
                    <p className="mt-1 text-xs leading-5 text-[#68756c]">Ajoutez les précisions que vos clients cherchent le plus souvent.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {categoryDefaults.productAttributes.map((field) => (
                      <label key={field.key} className="block text-xs font-bold text-[#34463d]">
                        {field.label}
                        <input
                          value={prodAttributes[field.key] || ''}
                          onChange={(event) => setProdAttributes((previous) => ({ ...previous, [field.key]: event.target.value }))}
                          placeholder={field.placeholder}
                          className="mt-1.5 min-h-10 w-full rounded-xl border border-[#d9ded7] bg-white px-3 py-2 text-sm font-normal text-[#25231f] outline-none focus:border-[#176b55]"
                        />
                      </label>
                    ))}
                  </div>
                </section>
              )}

              <section className="space-y-3 rounded-2xl border-[2px] border-[#211712] bg-[#fff] p-3 sm:p-4 lg:p-5">
                {categoryDefaults.productFormType === 'fashion' ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-[#1b3a63] lg:text-[11px]">Tailles</label>
                      <input
                        type="text"
                        placeholder="S, M, L, XL"
                        value={prodSizes}
                        onChange={(e) => setProdSizes(e.target.value)}
                        className="w-full rounded-xl border-[2px] border-[#211712] bg-white p-2.5 text-xs text-[#211712] lg:text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-[#1b3a63] lg:text-[11px]">Couleurs</label>
                      <input
                        type="text"
                        placeholder="Noir, Rouge, Doré"
                        value={prodColors}
                        onChange={(e) => setProdColors(e.target.value)}
                        className="w-full rounded-xl border-[2px] border-[#211712] bg-white p-2.5 text-xs text-[#211712] lg:text-sm"
                      />
                    </div>
                  </div>
                ) : categoryDefaults.productFormType === 'food' ? (
                  <div className="space-y-3 rounded-xl border-[2px] border-[#e7d4ae] bg-[#fff8ed] p-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-[#8a5a12] lg:text-[11px]">Temps de préparation (minutes)</label>
                      <input
                        type="number"
                        min={5}
                        step={1}
                        placeholder="20"
                        value={prodPrepTime}
                        onChange={(e) => setProdPrepTime(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full rounded-xl border-[2px] border-[#e7d4ae] bg-white p-2.5 text-xs text-[#211712] lg:text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-[#8a5a12] lg:text-[11px]">Options / Sauces</label>
                      <input
                        type="text"
                        placeholder="Sauce : Doux, Pimenté | Accompagnement : Alloco (+500 F), Attiéké"
                        value={prodModifiers}
                        onChange={(e) => setProdModifiers(e.target.value)}
                        className="w-full rounded-xl border-[2px] border-[#e7d4ae] bg-white p-2.5 text-xs text-[#211712] lg:text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-[#8a5a12] lg:text-[11px]">Choix max par groupe</label>
                      <select
                        value={prodModifierMaxSelections}
                        onChange={(e) => setProdModifierMaxSelections(Number(e.target.value))}
                        className="w-full rounded-xl border-[2px] border-[#e7d4ae] bg-white p-2.5 text-xs font-bold text-[#211712] lg:text-sm"
                      >
                        <option value={1}>1 choix</option>
                        <option value={2}>Jusqu’à 2 choix</option>
                        <option value={3}>Jusqu’à 3 choix</option>
                        <option value={4}>Jusqu’à 4 choix</option>
                        <option value={5}>Jusqu’à 5 choix</option>
                      </select>
                      <p className="mt-1 text-[10px] leading-4 text-[#8a5a12]">Séparez les groupes par « | » et les choix par virgule. Ajoutez un supplément avec « (+500 F) », par exemple : Extra : Alloco (+500 F), Igname (+1 000 F).</p>
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-[#1b3a63] lg:text-[11px]">Prix (en FCFA) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    step={1}
                    placeholder="15000"
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full rounded-xl border-[2px] border-[#211712] bg-white p-3 text-xs font-mono font-bold text-[#211712] lg:text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-[#1b3a63] lg:text-[11px]">Quantité en stock</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="10"
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full rounded-xl border-[2px] border-[#211712] bg-white p-3 text-xs font-mono text-[#211712] lg:text-sm"
                  />
                </div>
              </section>

              <section className="space-y-3 rounded-2xl border-[2px] border-[#211712] bg-[#fff] p-3 sm:p-4 lg:p-5">
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-[#1b3a63] lg:text-[11px]">Photo produit</label>
                  <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 sm:flex-row sm:items-center">
                    <CategoryProductImage
                      imageUrl={prodImage}
                      category={currentShop.category}
                      title={prodTitle || 'Aperçu du produit'}
                      className="h-20 w-20 shrink-0 rounded-xl border border-slate-200 bg-white"
                      loading="eager"
                    />
                    <div className="flex-1">
                      <input
                        id="product-photo-upload"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/avif"
                        onChange={handleImageUpload}
                        className="sr-only"
                      />
                      <label htmlFor="product-photo-upload" className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#211712] px-3 py-2 text-xs font-black text-white transition hover:bg-[#3a2d28]">
                        <Upload className="h-3.5 w-3.5" /> Choisir une photo HD
                      </label>
                      <p className="mt-2 text-[11px] text-slate-500">JPG, PNG, WebP ou AVIF. La photo est optimisée automatiquement.</p>
                      {imageCompressing && <span className="mt-2 block text-[11px] font-bold text-amber-700">Optimisation de la photo en cours...</span>}
                      {compressedSizeKB && (
                        <span className="mt-2 block text-[11px] font-bold text-emerald-600">
                          ✓ Photo prête : {originalImageSizeKB || '?'} KB → {compressedSizeKB} KB
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-[#1b3a63] lg:text-[11px]">Photo secondaire / lookbook <span className="font-normal text-slate-400">(optionnelle)</span></label>
                  <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-3 sm:flex-row sm:items-center">
                    {prodLookbookImage ? (
                      <img src={prodLookbookImage} alt="Aperçu de la photo secondaire" className="h-20 w-20 shrink-0 rounded-xl border border-slate-200 bg-white object-cover" />
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400"><Upload className="h-6 w-6" /></div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <input id="product-lookbook-upload" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={handleLookbookImageUpload} className="sr-only" />
                      <label htmlFor="product-lookbook-upload" className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#211712] px-3 py-2 text-xs font-black text-white transition hover:bg-[#3a2d28]">
                        <Upload className="h-3.5 w-3.5" /> {prodLookbookImage ? 'Remplacer la photo' : 'Choisir une photo'}
                      </label>
                      {prodLookbookImage && <button type="button" onClick={() => setProdLookbookImage('')} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /> Retirer</button>}
                      <p className="w-full text-[10px] text-slate-500">JPG, PNG, WebP ou AVIF, 8 Mo maximum. Photo optimisée automatiquement.</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl border-[2px] border-[#211712] bg-[#edf7f2] p-3">
                  <input
                    type="checkbox"
                    id="prod-available"
                    checked={prodIsAvailable}
                    onChange={(e) => setProdIsAvailable(e.target.checked)}
                    className="mt-0.5 rounded border-[#211712] text-[#211712] focus:ring-[#211712]"
                  />
                  <label htmlFor="prod-available" className="cursor-pointer text-xs font-bold text-[#155c3d] lg:text-sm">
                    Afficher immédiatement cet article dans la vitrine client
                  </label>
                </div>
              </section>

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end lg:gap-3">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="w-full rounded-xl border-[2px] border-[#211712] bg-white px-4 py-3 text-xs font-bold text-[#211712] shadow-[3px_3px_0_rgba(33,23,18,0.94)] transition hover:-translate-y-0.5 sm:w-auto lg:px-5 lg:py-3.5 lg:text-sm"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="w-full rounded-xl border-[2px] border-[#211712] bg-[#1b3a63] px-5 py-3 text-xs font-bold text-white shadow-[4px_4px_0_rgba(33,23,18,0.95)] transition hover:-translate-y-0.5 sm:w-auto lg:px-6 lg:py-3.5 lg:text-sm"
                >
                  {editingProduct ? 'Enregistrer les modifications' : 'Ajouter au catalogue'}
                </button>
              </div>
            </form>
          </div>
        </div>
    </>
  );
  return null;
};
