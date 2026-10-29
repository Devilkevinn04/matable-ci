import React, { useEffect, useState } from 'react';
import { Package, Plus, Edit3, Trash2, Clock, Search, Eye, EyeOff, Minus } from 'lucide-react';
import { MerchantState } from './useMerchant';
import { formatFCFA } from '../../utils/format';
import { getCategoryDefaults } from '../../utils/categoryDefaults';
import { CategoryProductImage } from '../CategoryProductImage';
import { getSubscriptionProductLimit, TRIAL_CATALOG_LIMIT } from '../../utils/subscriptionFeatures';
import { getActiveProductPrice, getProductSaleStatus } from '../../utils/productPricing';

interface CatalogTabProps {
  state: MerchantState;
  filteredProducts: any[];
}

export const CatalogTab: React.FC<CatalogTabProps> = ({ state, filteredProducts }) => {
  const {
    currentShop,
    products,
    dataLoading,
    setActiveTab,
    setSettingsSubTab,
    catalogSearch,
    setCatalogSearch,
    catalogFilter,
    setCatalogFilter,
    handleQuickStockChange,
    handleQuickToggleVisibility,
    handleOpenAddModal,
    handleOpenEditModal,
    handleDeleteProduct,
  } = state;
  const [saleNow, setSaleNow] = useState(Date.now());
  useEffect(() => {
    const nextBoundary = products
      .flatMap((product) => [product.sale_starts_at, product.sale_ends_at])
      .map((value) => value ? Date.parse(value) : Number.NaN)
      .filter((value) => Number.isFinite(value) && value > Date.now())
      .sort((left, right) => left - right)[0];
    if (!nextBoundary) return;
    const timer = window.setTimeout(() => setSaleNow(Date.now()), Math.max(0, nextBoundary - Date.now() + 25));
    return () => window.clearTimeout(timer);
  }, [products, saleNow]);
  const lowStockCount = products.filter((product) => product.stock > 0 && product.stock <= 3).length;
  const outOfStockCount = products.filter((product) => product.stock === 0).length;
  const promotionCount = products.filter((product) => product.sale_price !== null && product.sale_price !== undefined).length;
  const trialCatalogLimited = !currentShop.admin_mode && currentShop.subscription?.status === 'trialing' && currentShop.subscription.trialDaysRemaining > 0;
  const productLimit = trialCatalogLimited ? TRIAL_CATALOG_LIMIT : getSubscriptionProductLimit(currentShop.subscription?.plan, currentShop.subscription?.planFeatures);
  const catalogFull = !currentShop.admin_mode && Number.isFinite(productLimit) && products.length >= productLimit;
  const productLimitLabel = Number.isFinite(productLimit) ? productLimit : 'illimité';
  const catalogFilterOptions = [
    { id: 'all' as const, label: 'Tous les articles', count: products.length },
    { id: 'in_stock' as const, label: 'En stock', count: products.filter(product => product.stock > 0 && product.is_available !== false).length },
    { id: 'low_stock' as const, label: 'Stock bas', count: lowStockCount },
    { id: 'out_of_stock' as const, label: 'Épuisés', count: outOfStockCount },
    { id: 'hidden' as const, label: 'Masqués', count: products.filter(product => product.is_available === false).length },
    { id: 'promotions' as const, label: 'Avec promotion', count: promotionCount },
  ];

  return (
    <>
{/* TAB 1: CATALOG MANAGEMENT */}

          <div className="space-y-4">
            {/* Header with Search and Add Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">Articles du catalogue</h2>
                <p className="text-xs text-slate-500">
                  {trialCatalogLimited
                    ? `Essai gratuit · ${products.length}/${productLimitLabel} articles · ${currentShop.subscription?.trialDaysRemaining} jours restants`
                    : `${products.length} / ${productLimitLabel} articles · ${getCategoryDefaults(currentShop.category).catalogDescription}`}
                </p>
                {Number.isFinite(productLimit) && (
                  <div className="mt-2 max-w-sm">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                      <span>{products.length} sur {productLimit} articles utilisés</span>
                      {catalogFull && !currentShop.admin_mode && (
                        <button type="button" onClick={() => { setSettingsSubTab('subscription'); setActiveTab('settings'); }} className="font-extrabold text-[#047857] underline underline-offset-2">
                          Voir les formules
                        </button>
                      )}
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#e8e5dc]" role="progressbar" aria-label="Utilisation de la capacité du catalogue" aria-valuemin={0} aria-valuemax={productLimit} aria-valuenow={Math.min(products.length, productLimit)}>
                      <div className={`h-full rounded-full ${catalogFull ? 'bg-[#C2410C]' : 'bg-[#087F62]'}`} style={{ width: `${Math.min(100, (products.length / productLimit) * 100)}%` }} />
                    </div>
                  </div>
                )}
              </div>

              <button
                id="add-product-modal-btn"
                onClick={handleOpenAddModal}
                disabled={catalogFull}
                title={catalogFull ? `La limite de votre formule est de ${productLimit} articles.` : undefined}
                className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[#087F62] px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#047857] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
              >
                <Plus className="w-4 h-4" />
                <span>{catalogFull ? 'Limite du forfait atteinte' : 'Ajouter un article'}</span>
              </button>
            </div>

            {/* Filter pills & search bar */}
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-[#e7dfd3] bg-white p-3 shadow-sm sm:flex-row">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-[#47534b] absolute left-3 top-2.5" />
                <input
                  type="text"
                  aria-label="Rechercher un produit dans le catalogue"
                  placeholder="Rechercher un article..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-[#d9d5cd] bg-white py-2 pl-9 pr-3 text-sm text-[#292d2a] focus:border-[#047857] focus:outline-none focus:ring-2 focus:ring-[#047857]/15"
                />
              </div>

              <label className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-[#d9d5cd] bg-white px-3 text-sm font-bold text-[#47534b] sm:w-auto">
                <span className="shrink-0">Afficher</span>
                <select
                  aria-label="Filtrer les articles du catalogue"
                  value={catalogFilter}
                  onChange={(event) => setCatalogFilter(event.target.value as typeof catalogFilter)}
                  className="min-h-11 min-w-0 flex-1 bg-transparent py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#047857] sm:w-48 sm:flex-none"
                >
                  {catalogFilterOptions.map(({ id, label, count }) => (
                    <option key={id} value={id}>{label} ({count})</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Product Cards Grid */}
            {dataLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3" aria-label="Chargement du catalogue">
                {[1, 2, 3].map((skeleton) => (
                  <div key={skeleton} className="merchant-skeleton-card">
                    <div className="merchant-skeleton-media" />
                    <div className="merchant-skeleton-body">
                      <div className="merchant-skeleton-line short" />
                      <div className="merchant-skeleton-line" />
                      <div className="merchant-skeleton-line medium" />
                      <div className="merchant-skeleton-row">
                        <div className="merchant-skeleton-pill" />
                        <div className="merchant-skeleton-pill short" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-6">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="font-bold text-slate-900 text-base">{products.length === 0 && !catalogSearch && catalogFilter === 'all' ? 'Votre catalogue est vide' : 'Aucun article trouvé'}</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-5">
                  {catalogSearch || catalogFilter !== 'all'
                    ? 'Aucun produit ne correspond à vos filtres actuels.'
                    : 'Ajoutez votre premier produit pour commencer à vendre. Vous pourrez renseigner son prix, son stock et sa photo.'}
                </p>
                <button
                  onClick={handleOpenAddModal}
                  disabled={catalogFull}
                  title={catalogFull ? `La limite de votre formule est de ${productLimit} articles.` : undefined}
                  className="py-2.5 px-4 rounded-xl bg-slate-900 text-white font-bold text-xs inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Plus className="w-4 h-4" />
                  <span>{catalogFull ? 'Limite du forfait atteinte' : products.length === 0 && !catalogSearch && catalogFilter === 'all' ? 'Ajouter mon premier produit' : 'Ajouter un article'}</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {filteredProducts.map(prod => (
                  <div
                    key={prod.id}
                    className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${prod.is_available === false ? 'border-dashed border-[#d9d5cd] opacity-75' : 'border-[#e7dfd3]'}`}
                  >
                    <CategoryProductImage
                      imageUrl={prod.image_url}
                      category={currentShop.category}
                      title={prod.title}
                      className="aspect-4/3 bg-[#f3efe8]"
                    >
                      {prod.prep_time && (
                        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-[#292d2a]/85 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
                          <Clock className="h-3 w-3 shrink-0 text-[#e8a93a]" />
                          <span>{prod.prep_time} min</span>
                        </span>
                      )}

                      {prod.is_available === false && (
                        <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-[#292d2a]/90 px-2 py-0.5 text-[10px] font-bold text-white">
                          <EyeOff className="h-3 w-3 shrink-0 text-[#f4e6c8]" />
                          <span>Masqué</span>
                        </span>
                      )}

                      {prod.stock <= 0 ? (
                        <span className="absolute top-2 right-2 bg-[#b93712] text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-xs">
                          Épuisé
                        </span>
                      ) : prod.stock <= 3 ? (
                        <span className="absolute top-2 right-2 bg-[#e8a93a] text-[#292d2a] text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs">
                          Stock bas ({prod.stock})
                        </span>
                      ) : (
                        <span className="absolute top-2 right-2 rounded-md bg-[#065f46] px-2 py-0.5 text-[10px] font-bold text-white">
                          Stock: {prod.stock}
                        </span>
                      )}
                    </CategoryProductImage>

                    <div className="p-4 flex flex-col flex-1">
                      {prod.category && (
                        <span className="mb-1 w-fit max-w-full truncate rounded-full bg-[#edf3ec] px-2 py-0.5 text-[10px] font-bold text-[#315548]">
                          {prod.category}
                        </span>
                      )}
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-extrabold text-[#292d2a] text-sm line-clamp-1">
                          {prod.title}
                        </h3>
                        <span className="shrink-0 text-right">
                          <span className={`block text-sm font-black ${getActiveProductPrice(prod, saleNow) < prod.price ? 'text-[#c2410c]' : 'text-[#065f46]'}`}>
                            {formatFCFA(getActiveProductPrice(prod, saleNow))}
                          </span>
                          {getActiveProductPrice(prod, saleNow) < prod.price && <span className="block text-[10px] font-semibold text-slate-400 line-through">{formatFCFA(prod.price)}</span>}
                        </span>
                      </div>
                      {(() => {
                        const saleStatus = getProductSaleStatus(prod, saleNow);
                        if (saleStatus === 'none') return null;
                        const statusPresentation = {
                          invalid: { label: 'Promotion à corriger', style: 'bg-rose-50 text-rose-800' },
                          scheduled: { label: 'Promotion programmée', style: 'bg-sky-50 text-sky-800' },
                          active: { label: 'Promotion active', style: 'bg-orange-50 text-orange-800' },
                          expired: { label: 'Promotion terminée', style: 'bg-slate-100 text-slate-700' },
                        }[saleStatus];
                        const periodDate = saleStatus === 'scheduled' ? prod.sale_starts_at : prod.sale_ends_at;
                        const periodLabel = saleStatus === 'scheduled' ? 'Début' : 'Fin';
                        return (
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusPresentation.style}`}>{statusPresentation.label}</span>
                            {periodDate && <span className="text-[10px] font-medium text-slate-500">{periodLabel} : {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(periodDate))}</span>}
                          </div>
                        );
                      })()}

                      {prod.description && (
                        <p className="mb-2 whitespace-pre-line break-words text-xs leading-relaxed text-[#47534b]">
                          {prod.description}
                        </p>
                      )}

                      {Object.entries(prod.attributes || {}).some(([, value]) => typeof value === 'string' && value.trim()) && (
                        <dl className="mb-2 grid grid-cols-2 gap-x-3 gap-y-1">
                          {Object.entries(prod.attributes || {}).filter(([, value]) => typeof value === 'string' && value.trim()).map(([key, value]) => {
                            const field = getCategoryDefaults(currentShop.category).productAttributes.find((candidate) => candidate.key === key);
                            const label = field?.label || key.replace(/_/g, ' ');
                            const displayValue = typeof value === 'string' ? value : '';
                            return (
                              <div key={key} className="min-w-0">
                                <dt className="truncate text-[10px] font-semibold text-slate-500">{label}</dt>
                                <dd className="break-words text-[11px] font-bold text-[#315548]">{displayValue}</dd>
                              </div>
                            );
                          })}
                        </dl>
                      )}

                      {((prod.sizes?.length ?? 0) > 0 || (prod.colors?.length ?? 0) > 0) && (
                        <div className="mb-2 flex flex-wrap gap-1">
                          {prod.sizes?.map((size: string) => (
                            <span key={size} className="rounded border border-[#292d2a]/10 bg-[#f1f3f5] px-1.5 py-0.5 text-[10px] font-bold text-[#292d2a]">
                              Taille {size}
                            </span>
                          ))}
                          {prod.colors?.map((color: string | { name: string }) => {
                            const label = typeof color === 'string' ? color : color.name;
                            return (
                              <span key={label} className="rounded border border-[#292d2a]/10 bg-[#f1f3f5] px-1.5 py-0.5 text-[10px] font-bold text-[#292d2a]">
                                Couleur {label}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {prod.modifier_groups?.length > 0 && (
                        <div className="mb-2 space-y-2">
                          {prod.modifier_groups.map((group: { name: string; required?: boolean; max_selections?: number; options: (string | { label: string; price_delta: number })[] }) => (
                            <div key={group.name} className="min-w-0">
                              <p className="text-[10px] font-bold text-slate-600">
                                {group.name}{group.required ? ' · obligatoire' : ''}
                                {group.max_selections && group.max_selections > 1 ? ` · jusqu’à ${group.max_selections} choix` : ''}
                              </p>
                              <p className="break-words text-[11px] text-slate-700">
                                {group.options.map((option) => {
                                  if (typeof option === 'string') return option;
                                  return option.price_delta > 0 ? `${option.label} (+${formatFCFA(option.price_delta)})` : option.label;
                                }).join(' · ')}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {(prod.lookbook_image || prod.gallery_images?.length > 0) && (
                        <div className="mb-2 flex gap-1.5 overflow-x-auto" aria-label={`Photos supplémentaires de ${prod.title}`}>
                          {[...(prod.lookbook_image ? [prod.lookbook_image] : []), ...(prod.gallery_images || [])].map((imageUrl: string, index: number) => (
                            <img
                              key={`${prod.id}-photo-${index}`}
                              src={imageUrl}
                              alt={`${prod.title}, photo supplémentaire ${index + 1}`}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="h-12 w-12 shrink-0 rounded-lg border border-[#e7dfd3] object-cover"
                              onError={(event) => { event.currentTarget.hidden = true; }}
                            />
                          ))}
                        </div>
                      )}

                      <div className="mt-auto flex items-center justify-between border-t border-[#ece7de] pt-3">
                        <div className="flex items-center gap-1 rounded-xl border border-[#e7dfd3] bg-[#f8f5ef] p-1">
                          <button
                            type="button"
                            onClick={() => handleQuickStockChange(prod.id, -1)}
                            disabled={prod.stock <= 0}
                            aria-label={`Retirer une unité du stock de ${prod.title}`}
                            className="flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-white text-[#47534b] transition hover:bg-[#edf5f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047857] disabled:opacity-40"
                            title="Décrémenter le stock"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono font-bold text-xs px-1.5 min-w-[24px] text-center text-[#292d2a]">
                            {prod.stock}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQuickStockChange(prod.id, 1)}
                            aria-label={`Ajouter une unité au stock de ${prod.title}`}
                            className="flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-white text-[#47534b] transition hover:bg-[#edf5f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047857]"
                            title="Incrémenter le stock"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleQuickToggleVisibility(prod.id)}
                            aria-label={prod.is_available === false ? `Rendre ${prod.title} visible` : `Masquer ${prod.title} de la vitrine`}
                            className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-[#d9d5cd] bg-white text-[#47534b] transition hover:bg-[#edf5f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047857]"
                            title={prod.is_available === false ? "Rendre visible" : "Masquer de la vitrine"}
                          >
                            {prod.is_available === false ? <EyeOff className="h-4 w-4 shrink-0 text-[#b93712]" /> : <Eye className="h-4 w-4 shrink-0" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(prod)}
                            aria-label={`Modifier ${prod.title}`}
                            className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-[#d9d5cd] bg-white text-[#47534b] transition hover:bg-[#edf5f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#047857]"
                            title="Modifier"
                          >
                            <Edit3 className="h-4 w-4 shrink-0" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(prod.id)}
                            aria-label={`Supprimer ${prod.title}`}
                            className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-[#e9c8c2] bg-white text-rose-700 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4 shrink-0 text-[#b93712]" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
    </>
  );
  return null;
};
