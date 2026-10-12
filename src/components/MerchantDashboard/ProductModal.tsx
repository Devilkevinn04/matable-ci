import React from 'react';
import { createPortal } from 'react-dom';
import { Store, ShoppingBag, Package, Plus, Edit3, Trash2, Sparkles, Phone, Lock, Clock, Check, Send, ExternalLink, ChevronRight, UserPlus, X, UtensilsCrossed, Shirt, Search, Eye, EyeOff, Minus, TrendingUp, DollarSign, MapPin, Palette, Key, AlertTriangle, Copy, RotateCcw, Calendar, Upload, Boxes } from 'lucide-react';
import { MerchantState } from './useMerchant';
import type { ProductModifierGroupDraft } from './productForm';
import { ThemeCustomizer } from '../ThemeCustomizer';
import { formatFCFA } from '../../utils/format';
import { getCategoryDefaults } from '../../utils/categoryDefaults';
import { CategoryProductImage } from '../CategoryProductImage';
import { getSubscriptionProductPhotoLimit } from '../../utils/subscriptionFeatures';

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
    prodModifierGroups, setProdModifierGroups, prodAttributes, setProdAttributes, prodIsAvailable, setProdIsAvailable,
    imageCompressing, compressedSizeKB, originalImageSizeKB, flashBilan,
    handleSaveOpeningHours, handleResetManualOverride, handleTriggerCronBilan, handleQuickStockChange, handleQuickToggleVisibility,
    handleOpenAddModal, handleOpenEditModal, handleUpdateOrderStatus, handleImageUpload, handleLookbookImageUpload,
    prodGalleryImages, handleGalleryImageUpload, handleRemoveGalleryImage, handleSaveProduct, handleDeleteProduct,
    handleSaveGeneralSettings, addDeliveryZone, updateDeliveryZone, removeDeliveryZone, toast, copyOwnerLink, copyRegistrationLinks
  } = state;
  const [modifierOptionDrafts, setModifierOptionDrafts] = React.useState<Record<number, string>>({});

  if (!isProductModalOpen) return null;
  const categoryDefaults = getCategoryDefaults(currentShop.category);
  const productPhotoLimit = currentShop.admin_mode ? 6
    : currentShop.subscription?.status === 'trialing' && currentShop.subscription.trialDaysRemaining > 0
      ? getSubscriptionProductPhotoLimit('standard')
      : getSubscriptionProductPhotoLimit(currentShop.subscription?.plan);
  const productPhotoCount = (prodImage ? 1 : 0) + (prodLookbookImage ? 1 : 0) + prodGalleryImages.length;
  const canAddLookbookPhoto = Boolean(prodLookbookImage) || productPhotoCount < productPhotoLimit;
  const modifierGroups = prodModifierGroups;
  const updateModifierGroups = (update: (groups: ProductModifierGroupDraft[]) => ProductModifierGroupDraft[]) => {
    setProdModifierGroups((groups) => update(groups));
  };
  const addModifierOption = (groupIndex: number) => {
    const option = modifierOptionDrafts[groupIndex]?.trim();
    if (!option) return;
    updateModifierGroups((groups) => groups.map((group, index) => (
      index === groupIndex ? { ...group, options: [...group.options, option] } : group
    )));
    setModifierOptionDrafts((drafts) => ({ ...drafts, [groupIndex]: '' }));
  };
  return createPortal(
    <>
{/* PRODUCT ADD/EDIT MODAL */}

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-4 lg:p-6" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="product-dialog-title" className="w-full max-w-[980px] max-h-[94vh] overflow-y-auto rounded-2xl border border-slate-200 bg-[#fffdf9] p-4 shadow-2xl sm:p-5 lg:p-6">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
                  <Boxes className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 id="product-dialog-title" className="truncate text-base font-extrabold text-slate-900 sm:text-lg lg:text-xl">
                    {editingProduct ? 'Modifier l\'article' : 'Ajouter un article au catalogue'}
                  </h3>
                  <p className="mt-0.5 text-[10px] text-slate-500 sm:text-[11px] lg:text-xs">Renseignez les détails utiles à votre boutique et à vos clients.</p>
                </div>
              </div>
              <button
                onClick={() => setIsProductModalOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Fermer le formulaire"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="mt-5 space-y-4 lg:space-y-5">
              <section className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 lg:p-5">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">
                    Nom de l'article *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={categoryDefaults.productTitlePlaceholder}
                    value={prodTitle}
                    onChange={(e) => setProdTitle(e.target.value)}
                    className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  />
                </div>
              </section>

              <div className="max-w-md">
                <label className="mb-1.5 block text-xs font-bold text-slate-700">Prix (en FCFA) *</label>
                <input
                  type="number"
                  required
                  min={0}
                  step={1}
                  placeholder="15000"
                  value={prodPrice}
                  onChange={(e) => setProdPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono font-bold text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                />
              </div>

              <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
                  <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Catégorie d'article (optionnelle)
                    </label>
                    <span className="text-[11px] text-slate-500">Filtrage client</span>
                  </div>
                  <input
                    type="text"
                    list="product-category-suggestions"
                    placeholder={categoryDefaults.productCategoryPlaceholder}
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value)}
                    className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  />
                  <datalist id="product-category-suggestions">
                    {categoryDefaults.productCategorySuggestions.map((catSuggestion) => (
                      <option key={catSuggestion} value={catSuggestion} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="block text-xs font-bold text-slate-700">
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
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  />
                </div>
                  </section>

                  {categoryDefaults.productAttributes.length > 0 && (
                    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
                  <div>
                    <h4 className="text-sm font-extrabold text-emerald-900">{categoryDefaults.productAttributesHeading}</h4>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Ajoutez les précisions que vos clients cherchent le plus souvent.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {categoryDefaults.productAttributes.map((field) => (
                      <label key={field.key} className="block text-xs font-bold text-slate-700">
                        {field.label}
                        <input
                          value={prodAttributes[field.key] || ''}
                          onChange={(event) => setProdAttributes((previous) => ({ ...previous, [field.key]: event.target.value }))}
                          placeholder={field.placeholder}
                          className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                        />
                      </label>
                    ))}
                  </div>
                    </section>
                  )}

                  {(categoryDefaults.productFormType === 'fashion' || categoryDefaults.productFormType === 'food') && (
                    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4 lg:p-5">
                {categoryDefaults.productFormType === 'fashion' ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-slate-700">Tailles</label>
                      <input
                        type="text"
                        placeholder="S, M, L, XL"
                        value={prodSizes}
                        onChange={(e) => setProdSizes(e.target.value)}
                        className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-slate-700">Couleurs</label>
                      <input
                        type="text"
                        placeholder="Noir, Rouge, Doré"
                        value={prodColors}
                        onChange={(e) => setProdColors(e.target.value)}
                        className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                      />
                    </div>
                  </div>
                ) : categoryDefaults.productFormType === 'food' ? (
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-slate-700">Temps de préparation (minutes)</label>
                      <input
                        type="number"
                        min={5}
                        step={1}
                        placeholder="20"
                        value={prodPrepTime}
                        onChange={(e) => setProdPrepTime(e.target.value === '' ? '' : Number(e.target.value))}
                        className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                      />
                    </div>
                    <div className="space-y-3">
                      <div>
                        <h5 className="text-xs font-bold text-slate-700">Groupes d’options</h5>
                        <p className="mt-1 text-[11px] text-slate-500">Ajoutez les choix proposés avec le plat. Indiquez un supplément dans son nom, par exemple « Alloco (+500 F) ».</p>
                      </div>
                      {modifierGroups.map((group, groupIndex) => (
                        <div key={groupIndex} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-end gap-2">
                            <label className="min-w-0 flex-1 text-[11px] font-semibold text-slate-600">
                              Groupe {groupIndex + 1}
                              <input
                                value={group.name}
                                onChange={(event) => updateModifierGroups((groups) => groups.map((item, index) => (
                                  index === groupIndex ? { ...item, name: event.target.value } : item
                                )))}
                                placeholder="Ex. : Accompagnement"
                                className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                updateModifierGroups((groups) => groups.filter((_, index) => index !== groupIndex));
                                setModifierOptionDrafts({});
                              }}
                              aria-label={`Supprimer le groupe ${group.name || groupIndex + 1}`}
                              title="Supprimer ce groupe"
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                            <label className="flex min-h-10 items-center gap-2 text-xs font-semibold text-slate-700">
                              <input
                                type="checkbox"
                                checked={group.required}
                                onChange={(event) => updateModifierGroups((groups) => groups.map((item, index) => (
                                  index === groupIndex ? { ...item, required: event.target.checked } : item
                                )))}
                                className="h-4 w-4 rounded border-slate-300 text-emerald-800 focus:ring-emerald-700"
                              />
                              Choix obligatoire
                            </label>
                            <fieldset className="min-w-0">
                              <legend className="mb-1.5 text-[11px] font-bold text-slate-600">Maximum pour ce groupe</legend>
                              <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label={`Maximum de choix pour ${group.name || `Groupe ${groupIndex + 1}`}`}>
                                {[1, 2, 3, 4, 5].map((selectionCount) => (
                                  <label key={selectionCount} className={`flex min-h-9 cursor-pointer items-center justify-center rounded-lg border px-2 text-xs font-bold transition ${Number(group.max_selections) === selectionCount ? 'border-emerald-800 bg-emerald-800 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-700 hover:bg-emerald-50'}`}>
                                    <input
                                      type="radio"
                                      name={`modifier-group-${groupIndex}-max-selections`}
                                      value={selectionCount}
                                      checked={Number(group.max_selections) === selectionCount}
                                      onChange={() => updateModifierGroups((groups) => groups.map((item, index) => (
                                        index === groupIndex ? { ...item, max_selections: selectionCount } : item
                                      )))}
                                      className="sr-only"
                                    />
                                    {selectionCount}
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                          </div>
                          {group.options.length > 0 && (
                            <div className="flex flex-wrap gap-2" aria-label={`Choix du groupe ${group.name}`}>
                              {group.options.map((option, optionIndex) => (
                                <span key={`${option}-${optionIndex}`} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 py-1 pl-3 pr-1 text-xs font-semibold text-emerald-900">
                                  {option}
                                  <button
                                    type="button"
                                    onClick={() => updateModifierGroups((groups) => groups.map((item, index) => (
                                      index === groupIndex ? { ...item, options: item.options.filter((_, itemIndex) => itemIndex !== optionIndex) } : item
                                    )))}
                                    aria-label={`Retirer ${option}`}
                                    className="flex h-6 w-6 items-center justify-center rounded-full text-emerald-800 transition hover:bg-emerald-100"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                              value={modifierOptionDrafts[groupIndex] || ''}
                              onChange={(event) => setModifierOptionDrafts((drafts) => ({ ...drafts, [groupIndex]: event.target.value }))}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  addModifierOption(groupIndex);
                                }
                              }}
                              placeholder="Ex. : Attiéké ou Alloco (+500 F)"
                              className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                            />
                            <button
                              type="button"
                              onClick={() => addModifierOption(groupIndex)}
                              disabled={!modifierOptionDrafts[groupIndex]?.trim()}
                              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-emerald-700 hover:bg-emerald-50 hover:text-emerald-900 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              <Plus className="h-3.5 w-3.5" /> Ajouter
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => updateModifierGroups((groups) => [...groups, { name: `Groupe ${groups.length + 1}`, required: false, max_selections: 2, options: [] }])}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-dashed border-emerald-300 px-3 text-xs font-bold text-emerald-900 transition hover:bg-emerald-50"
                      >
                        <Plus className="h-4 w-4" /> Ajouter un groupe
                      </button>
                    </div>
                  </div>
                ) : null}
                    </section>
                  )}
                <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">Quantité en stock</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="10"
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value === '' ? '' : Number(e.target.value))}
                    className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"
                  />
                </div>

              <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 lg:p-5">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">Photo produit</label>
                  <div className="flex flex-col gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 sm:flex-row sm:items-center">
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
                      <label htmlFor="product-photo-upload" className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-emerald-800 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-900">
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

                <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">Photo secondaire / lookbook <span className="font-normal text-slate-400">(optionnelle)</span></label>
                  <div className="flex flex-col gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 sm:flex-row sm:items-center">
                    {prodLookbookImage ? (
                      <img src={prodLookbookImage} alt="Aperçu de la photo secondaire" className="h-20 w-20 shrink-0 rounded-xl border border-slate-200 bg-white object-cover" />
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400"><Upload className="h-6 w-6" /></div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <input id="product-lookbook-upload" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={handleLookbookImageUpload} disabled={!canAddLookbookPhoto} className="sr-only" />
                      <label htmlFor="product-lookbook-upload" className={`inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-800 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-900 ${canAddLookbookPhoto ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'}`}>
                        <Upload className="h-3.5 w-3.5" /> {prodLookbookImage ? 'Remplacer la photo' : 'Choisir une photo'}
                      </label>
                      {prodLookbookImage && <button type="button" onClick={() => setProdLookbookImage('')} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /> Retirer</button>}
                      <p className="w-full text-[10px] text-slate-500">JPG, PNG, WebP ou AVIF, 8 Mo maximum. Photo optimisée automatiquement.</p>
                      {!canAddLookbookPhoto && <p className="w-full text-[10px] font-semibold text-amber-700">Limite de {productPhotoLimit} photos atteinte pour votre formule.</p>}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700">Photos du produit <span className="font-normal text-slate-400">({productPhotoCount}/{productPhotoLimit})</span></label>
                  <div className="flex flex-wrap gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                    {prodGalleryImages.map((image, index) => (
                      <div key={index} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <img src={image} alt={`Photo supplémentaire ${index + 1}`} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveGalleryImage(index)}
                          className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-rose-700 text-white shadow-sm transition hover:bg-rose-800"
                          aria-label={`Retirer la photo ${index + 1}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {productPhotoCount < productPhotoLimit && prodGalleryImages.length < 6 && (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center">
                        <input
                          id="product-gallery-upload"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/avif"
                          multiple
                          onChange={handleGalleryImageUpload}
                          className="sr-only"
                        />
                        <label htmlFor="product-gallery-upload" className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white text-slate-500 hover:border-emerald-700 hover:bg-emerald-50 hover:text-emerald-900">
                          <Upload className="h-4 w-4" />
                          <span className="text-[10px] font-bold">Ajouter</span>
                        </label>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">Ajoutez jusqu'à 6 photos additionnelles pour montrer l'article sous différents angles.</p>
                </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <input
                    type="checkbox"
                    id="prod-available"
                    checked={prodIsAvailable}
                    onChange={(e) => setProdIsAvailable(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-emerald-800 focus:ring-emerald-700"
                  />
                  <label htmlFor="prod-available" className="cursor-pointer text-xs font-semibold text-emerald-900 lg:text-sm">
                    Afficher immédiatement cet article dans la vitrine client
                  </label>
                </div>
              </section>
              </section>

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end lg:gap-3">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto lg:px-5 lg:py-3 lg:text-sm"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-emerald-800 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-900 sm:w-auto lg:px-6 lg:py-3 lg:text-sm"
                >
                  {editingProduct ? 'Enregistrer les modifications' : 'Ajouter au catalogue'}
                </button>
              </div>
            </form>
          </div>
        </div>
    </>,
    document.body,
  );
  return null;
};
