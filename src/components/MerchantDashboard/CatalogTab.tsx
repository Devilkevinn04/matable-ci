import React from 'react';
import { Store, ShoppingBag, Package, Plus, Edit3, Trash2, Sparkles, Phone, Lock, Clock, Check, Send, ExternalLink, ChevronRight, UserPlus, X, UtensilsCrossed, Shirt, Search, Eye, EyeOff, Minus, TrendingUp, DollarSign, MapPin, Palette, Key, AlertTriangle, Copy, RotateCcw, Calendar, Upload, Boxes } from 'lucide-react';
import { MerchantState } from './useMerchant';
import { ThemeCustomizer } from '../ThemeCustomizer';
import { formatFCFA } from '../../utils/format';
import { getCategoryDefaults } from '../../utils/categoryDefaults';
import { CategoryProductImage } from '../CategoryProductImage';

interface CatalogTabProps {
  state: MerchantState;
  filteredProducts: any[];
}

export const CatalogTab: React.FC<CatalogTabProps> = ({ state, filteredProducts }) => {
  const {
    currentShop, products, orders, dataLoading, activeTab, settingsSubTab, setSettingsSubTab,
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
    prodIsAvailable, setProdIsAvailable,
    imageCompressing, compressedSizeKB, originalImageSizeKB, flashBilan,
    handleSaveOpeningHours, handleResetManualOverride, handleTriggerCronBilan, handleQuickStockChange, handleQuickToggleVisibility,
    handleOpenAddModal, handleOpenEditModal, handleUpdateOrderStatus, handleImageUpload, handleSaveProduct, handleDeleteProduct,
    handleSaveGeneralSettings, addDeliveryZone, updateDeliveryZone, removeDeliveryZone, toast, copyOwnerLink, copyRegistrationLinks
  } = state;
  const lowStockCount = products.filter((product) => product.stock > 0 && product.stock <= 3).length;
  const outOfStockCount = products.filter((product) => product.stock === 0).length;
  const trialCatalogLimited = currentShop.subscription?.status === 'trialing' && currentShop.subscription.trialDaysRemaining > 0;
  const trialCatalogFull = trialCatalogLimited && products.length >= 6;

  return (
    <>
{/* TAB 1: CATALOG MANAGEMENT */}

          <div className="space-y-4">
            {/* Header with Search and Add Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900">Articles du catalogue</h2>
                <p className="text-xs text-slate-500">
                  {trialCatalogLimited ? `Essai gratuit · ${products.length}/6 articles · ${currentShop.subscription?.trialDaysRemaining} jours restants` : getCategoryDefaults(currentShop.category).catalogDescription}
                </p>
              </div>

              <button
                id="add-product-modal-btn"
                onClick={handleOpenAddModal}
                disabled={trialCatalogFull}
                title={trialCatalogFull ? 'La période d’essai est limitée à 6 articles.' : undefined}
                className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors self-start sm:self-auto disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Plus className="w-4 h-4" />
                <span>{trialCatalogFull ? 'Limite d’essai atteinte' : 'Ajouter un article'}</span>
              </button>
            </div>

            {/* Filter pills & search bar */}
            <div className="bg-[#fffaf2] p-3 rounded-2xl border-[2px] border-[#211712] shadow-[4px_4px_0_rgba(33,23,18,0.94)] flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-[#4a3a30] absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Rechercher un article..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="w-full text-xs py-2 pl-9 pr-3 rounded-xl border-[2px] border-[#211712] bg-white text-[#211712] focus:outline-none focus:border-[#1b3a63]"
                />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                <button
                  onClick={() => setCatalogFilter('all')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 border-[2px] ${
                    catalogFilter === 'all'
                      ? 'bg-[#1b3a63] text-white border-[#211712] shadow-[2px_2px_0_rgba(33,23,18,0.94)]'
                      : 'bg-white text-[#211712] border-[#211712] hover:bg-[#f7f0e7]'
                  }`}
                >
                  Tous ({products.length})
                </button>
                <button
                  onClick={() => setCatalogFilter('in_stock')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 border-[2px] ${
                    catalogFilter === 'in_stock'
                      ? 'bg-[#155c3d] text-white border-[#211712] shadow-[2px_2px_0_rgba(33,23,18,0.94)]'
                      : 'bg-[#edf7f2] text-[#155c3d] border-[#211712] hover:bg-[#e3f3ea]'
                  }`}
                >
                  En stock ({products.filter(p => p.stock > 3 && p.is_available !== false).length})
                </button>
                <button
                  onClick={() => setCatalogFilter('low_stock')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 border-[2px] ${
                    catalogFilter === 'low_stock'
                      ? 'bg-[#b93712] text-white border-[#211712] shadow-[2px_2px_0_rgba(33,23,18,0.94)]'
                      : 'bg-[#f9e7d6] text-[#b93712] border-[#211712] hover:bg-[#f4d9c0]'
                  }`}
                >
                  Stock bas ({lowStockCount})
                </button>
                <button
                  onClick={() => setCatalogFilter('out_of_stock')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 border-[2px] ${
                    catalogFilter === 'out_of_stock'
                      ? 'bg-[#b93712] text-white border-[#211712] shadow-[2px_2px_0_rgba(33,23,18,0.94)]'
                      : 'bg-[#fdf1ee] text-[#b93712] border-[#211712] hover:bg-[#fbe5df]'
                  }`}
                >
                  Épuisé ({outOfStockCount})
                </button>
                <button
                  onClick={() => setCatalogFilter('hidden')}
                  className={`text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shrink-0 border-[2px] ${
                    catalogFilter === 'hidden'
                      ? 'bg-[#211712] text-white border-[#211712] shadow-[2px_2px_0_rgba(33,23,18,0.94)]'
                      : 'bg-[#f3f4f6] text-[#211712] border-[#211712] hover:bg-[#eceef1]'
                  }`}
                >
                  Masqués ({products.filter(p => p.is_available === false).length})
                </button>
              </div>
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
                  disabled={trialCatalogFull}
                  title={trialCatalogFull ? 'La période d’essai est limitée à 6 articles.' : undefined}
                  className="py-2.5 px-4 rounded-xl bg-slate-900 text-white font-bold text-xs inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Plus className="w-4 h-4" />
                  <span>{trialCatalogFull ? 'Limite d’essai atteinte' : products.length === 0 && !catalogSearch && catalogFilter === 'all' ? 'Ajouter mon premier produit' : 'Ajouter un article'}</span>
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
                            className="w-6 h-6 rounded-lg bg-white hover:bg-[#f0f0f0] flex items-center justify-center text-[#211712] disabled:opacity-40"
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
                            className="w-6 h-6 rounded-lg bg-white hover:bg-[#f0f0f0] flex items-center justify-center text-[#211712]"
                            title="Incrémenter le stock"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleQuickToggleVisibility(prod.id)}
                            className="p-1.5 rounded-lg border-[2px] border-[#211712] bg-white text-[#211712] hover:bg-[#f7e7c7]"
                            title={prod.is_available === false ? "Rendre visible" : "Masquer de la vitrine"}
                          >
                            {prod.is_available === false ? <EyeOff className="w-4 h-4 text-[#b93712]" /> : <Eye className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(prod)}
                            className="p-1.5 rounded-lg border-[2px] border-[#211712] bg-white text-[#211712] hover:bg-[#edf2fb]"
                            title="Modifier"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(prod.id)}
                            className="p-1.5 rounded-lg border-[2px] border-[#211712] bg-white text-[#211712] hover:bg-[#fdf1ee]"
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
