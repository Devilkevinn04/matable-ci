import React from 'react';
import { Package, Plus, Edit3, Trash2, Clock, Search, Eye, EyeOff, Minus } from 'lucide-react';
import { MerchantState } from './useMerchant';
import { formatFCFA } from '../../utils/format';
import { getCategoryDefaults } from '../../utils/categoryDefaults';
import { CategoryProductImage } from '../CategoryProductImage';
import { getSubscriptionProductLimit, TRIAL_CATALOG_LIMIT } from '../../utils/subscriptionFeatures';

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
  const lowStockCount = products.filter((product) => product.stock > 0 && product.stock <= 3).length;
  const outOfStockCount = products.filter((product) => product.stock === 0).length;
  const trialCatalogLimited = !currentShop.admin_mode && currentShop.subscription?.status === 'trialing' && currentShop.subscription.trialDaysRemaining > 0;
  const productLimit = trialCatalogLimited ? TRIAL_CATALOG_LIMIT : getSubscriptionProductLimit(currentShop.subscription?.plan);
  const catalogFull = !currentShop.admin_mode && Number.isFinite(productLimit) && products.length >= productLimit;
  const productLimitLabel = Number.isFinite(productLimit) ? productLimit : 'illimité';
  const catalogFilterOptions = [
    { id: 'all' as const, label: 'Tous les articles', count: products.length },
    { id: 'in_stock' as const, label: 'En stock', count: products.filter(product => product.stock > 0 && product.is_available !== false).length },
    { id: 'low_stock' as const, label: 'Stock bas', count: lowStockCount },
    { id: 'out_of_stock' as const, label: 'Épuisés', count: outOfStockCount },
    { id: 'hidden' as const, label: 'Masqués', count: products.filter(product => product.is_available === false).length },
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
                        <button type="button" onClick={() => { setSettingsSubTab('subscription'); setActiveTab('settings'); }} className="font-extrabold text-[#155544] underline underline-offset-2">
                          Voir les formules
                        </button>
                      )}
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#e8e5dc]" role="progressbar" aria-label="Utilisation de la capacité du catalogue" aria-valuemin={0} aria-valuemax={productLimit} aria-valuenow={Math.min(products.length, productLimit)}>
                      <div className={`h-full rounded-full ${catalogFull ? 'bg-[#b94c24]' : 'bg-[#1D6B57]'}`} style={{ width: `${Math.min(100, (products.length / productLimit) * 100)}%` }} />
                    </div>
                  </div>
                )}
              </div>

              <button
                id="add-product-modal-btn"
                onClick={handleOpenAddModal}
                disabled={catalogFull}
                title={catalogFull ? `La limite de votre formule est de ${productLimit} articles.` : undefined}
                className="py-2.5 px-4 rounded-xl bg-[#1D6B57] hover:bg-[#155544] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors self-start sm:self-auto disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Plus className="w-4 h-4" />
                <span>{catalogFull ? 'Limite du forfait atteinte' : 'Ajouter un article'}</span>
              </button>
            </div>

            {/* Filter pills & search bar */}
            <div className="bg-[#fffaf2] p-3 rounded-2xl border-[2px] border-[#211712] shadow-[4px_4px_0_rgba(33,23,18,0.94)] flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-[#4a3a30] absolute left-3 top-2.5" />
                <input
                  type="text"
                  aria-label="Rechercher un produit dans le catalogue"
                  placeholder="Rechercher un article..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="w-full text-xs py-2 pl-9 pr-3 rounded-xl border-[2px] border-[#211712] bg-white text-[#211712] focus:outline-none focus:border-[#1D6B57]"
                />
              </div>

              <label className="flex min-h-10 w-full items-center gap-2 rounded-xl border-[2px] border-[#211712] bg-white px-3 text-xs font-bold text-[#211712] sm:w-auto">
                <span className="shrink-0">Afficher</span>
                <select
                  aria-label="Filtrer les articles du catalogue"
                  value={catalogFilter}
                  onChange={(event) => setCatalogFilter(event.target.value as typeof catalogFilter)}
                  className="min-w-0 flex-1 bg-transparent py-2 outline-none sm:w-48 sm:flex-none"
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
                    className={`bg-[#fffaf2] rounded-[1.5rem] border-[2px] ${prod.is_available === false ? 'border-dashed border-[#211712] opacity-75' : 'border-[#211712]'} overflow-hidden shadow-[5px_5px_0_rgba(33,23,18,0.92)] flex flex-col transition-all hover:-translate-y-0.5`}
                  >
                    <CategoryProductImage
                      imageUrl={prod.image_url}
                      category={currentShop.category}
                      title={prod.title}
                      className="aspect-4/3 bg-[#f3efe8]"
                    >
                      {prod.prep_time && (
                        <span className="absolute top-2 left-2 bg-[#211712]/85 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#e8a93a]" />
                          <span>{prod.prep_time} min</span>
                        </span>
                      )}

                      {prod.is_available === false && (
                        <span className="absolute bottom-2 left-2 bg-[#211712]/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                          <EyeOff className="w-3 h-3 text-[#f4e6c8]" />
                          <span>Masqué</span>
                        </span>
                      )}

                      {prod.stock <= 0 ? (
                        <span className="absolute top-2 right-2 bg-[#b93712] text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-xs">
                          Épuisé
                        </span>
                      ) : prod.stock <= 3 ? (
                        <span className="absolute top-2 right-2 bg-[#e8a93a] text-[#211712] text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs">
                          Stock bas ({prod.stock})
                        </span>
                      ) : (
                        <span className="absolute top-2 right-2 bg-[#1b3a63] text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                          Stock: {prod.stock}
                        </span>
                      )}
                    </CategoryProductImage>

                    <div className="p-4 flex flex-col flex-1">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-extrabold text-[#211712] text-sm line-clamp-1">
                          {prod.title}
                        </h3>
                        <span className="font-black text-[#211712] text-sm shrink-0">
                          {formatFCFA(prod.price)}
                        </span>
                      </div>

                      {prod.description && (
                        <p className="text-[#4a3a30] text-xs line-clamp-2 mb-2 leading-relaxed">
                          {prod.description}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-1 mb-2">
                        {Object.entries(prod.attributes || {}).map(([key, value]) => (
                          <span key={key} className="text-[10px] bg-[#edf3ec] font-bold px-1.5 py-0.5 rounded text-[#315548] border border-[#315548]/15">
                            {typeof value === 'string' ? value : ''}
                          </span>
                        ))}
                        {prod.sizes && prod.sizes.map(s => (
                          <span key={s} className="text-[10px] bg-[#f1f3f5] font-bold px-1.5 py-0.5 rounded text-[#211712] border border-[#211712]/10">
                            Taille {s}
                          </span>
                        ))}
                        {prod.colors && prod.colors.map(c => {
                          const label = typeof c === 'string' ? c : c.name;
                          return (
                            <span key={label} className="text-[10px] bg-[#f1f3f5] font-bold px-1.5 py-0.5 rounded text-[#211712] border border-[#211712]/10">
                              {label}
                            </span>
                          );
                        })}
                      </div>

                      <div className="mt-auto pt-3 border-t-[2px] border-[#211712]/15 flex items-center justify-between">
                        <div className="flex items-center gap-1 bg-[#f2efe9] p-1 rounded-xl border-[2px] border-[#211712]">
                          <button
                            type="button"
                            onClick={() => handleQuickStockChange(prod.id, -1)}
                            disabled={prod.stock <= 0}
                            aria-label={`Retirer une unité du stock de ${prod.title}`}
                            className="min-h-10 min-w-10 rounded-lg bg-white hover:bg-[#f0f0f0] flex items-center justify-center text-[#211712] disabled:opacity-40"
                            title="Décrémenter le stock"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono font-bold text-xs px-1.5 min-w-[24px] text-center text-[#211712]">
                            {prod.stock}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQuickStockChange(prod.id, 1)}
                            aria-label={`Ajouter une unité au stock de ${prod.title}`}
                            className="min-h-10 min-w-10 rounded-lg bg-white hover:bg-[#f0f0f0] flex items-center justify-center text-[#211712]"
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
                            className="min-h-10 min-w-10 rounded-lg border-[2px] border-[#211712] bg-white text-[#211712] hover:bg-[#f7e7c7]"
                            title={prod.is_available === false ? "Rendre visible" : "Masquer de la vitrine"}
                          >
                            {prod.is_available === false ? <EyeOff className="w-4 h-4 text-[#b93712]" /> : <Eye className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(prod)}
                            aria-label={`Modifier ${prod.title}`}
                            className="min-h-10 min-w-10 rounded-lg border-[2px] border-[#211712] bg-white text-[#211712] hover:bg-[#edf2fb]"
                            title="Modifier"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(prod.id)}
                            aria-label={`Supprimer ${prod.title}`}
                            className="min-h-10 min-w-10 rounded-lg border-[2px] border-[#211712] bg-white text-[#211712] hover:bg-[#fdf1ee]"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4 text-[#b93712]" />
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
