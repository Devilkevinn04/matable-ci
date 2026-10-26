import React, { useState } from 'react';
import { ArrowUpRight, BadgeCheck, Megaphone, ShieldCheck, Store } from 'lucide-react';
import { PublicPartnerCarousel, type PublicPermanentPartner } from './PublicPartnerCarousel';

type PreviewView = 'public' | 'merchant' | 'admin';
type CampaignFormat = 'product' | 'banner';

const previewCampaign = {
  shop: 'Atelier Awa',
  category: 'Mode',
  city: 'Abidjan',
  product: 'Sac Kente tissé à la main',
  price: '12 500 FCFA',
  headline: 'Le savoir-faire ivoirien à porter partout',
  body: 'Un sac artisanal tissé avec soin, pensé pour accompagner vos journées.',
};

const previewPartners: PublicPermanentPartner[] = [
  { id: 'preview-koro', name: 'KÔRÔ', descriptor: 'Artisanat & création', headline: 'Les talents d’ici rayonnent.', logo_url: null, destination_url: null },
  { id: 'preview-naya', name: 'NAYA', descriptor: 'Solutions de paiement', headline: 'Le commerce avance avec vous.', logo_url: null, destination_url: null },
  { id: 'preview-terre-ici', name: 'TERRE D’ICI', descriptor: 'Produits du terroir', headline: 'Le meilleur de nos terroirs.', logo_url: null, destination_url: null },
];

const tabs: Array<{ id: PreviewView; label: string }> = [
  { id: 'public', label: 'Rendu public' },
  { id: 'merchant', label: 'Espace commerçant' },
  { id: 'admin', label: 'Modération admin' },
];

export const AdvertisingPreviewPage: React.FC = () => {
  const [view, setView] = useState<PreviewView>('public');
  const [format, setFormat] = useState<CampaignFormat>('product');
  const isBanner = format === 'banner';

  return (
    <main className="min-h-screen bg-[#FAF8F2] px-4 py-8 text-[#292d2a] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-3xl border border-[#cce3d7] bg-white p-5 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#e3f1e8] px-3 py-1.5 text-xs font-black uppercase tracking-wide text-[#065f46]">
              <Megaphone className="h-4 w-4" aria-hidden="true" /> Aperçu publicitaire
            </span>
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900">Données fictives · local uniquement</span>
          </div>
          <h1 className="mt-4 font-display text-3xl font-black tracking-tight sm:text-4xl">Voici à quoi ressemblera la publicité</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#647067] sm:text-base">
            Parcours de démonstration rempli pour visualiser les campagnes produit et bannière. Les boutons de ce prototype ne publient rien, ne contactent personne et ne modifient aucune donnée.
          </p>
          <nav className="mt-6 flex flex-wrap gap-2" aria-label="Choisir le parcours à prévisualiser">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={view === tab.id}
                onClick={() => setView(tab.id)}
                className={`min-h-10 rounded-full px-4 text-sm font-bold transition ${view === tab.id ? 'bg-[#065f46] text-white' : 'border border-[#d9e4dc] bg-white text-[#315548] hover:bg-[#f2f8f4]'}`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </header>

        {view === 'public' && (
          <section className="mt-6 space-y-7" aria-labelledby="preview-public-title">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#c2410c]">Disposition des espaces sponsorisés</p>
                <h2 id="preview-public-title" className="mt-1 text-2xl font-black">La publicité s’intègre aux temps forts de l’accueil</h2>
              </div>
              <div className="flex gap-2" aria-label="Format de campagne à prévisualiser">
                {(['product', 'banner'] as const).map((kind) => (
                  <button key={kind} type="button" aria-pressed={format === kind} onClick={() => setFormat(kind)} className={`min-h-10 rounded-full px-4 text-xs font-bold ${format === kind ? 'bg-[#d1fae5] text-[#065f46] ring-1 ring-[#83b49d]' : 'border border-[#d9e4dc] bg-white text-[#47534b]'}`}>
                    {kind === 'product' ? 'Produit sponsorisé' : 'Bannière boutique'}
                  </button>
                ))}
              </div>
            </div>

            <section aria-labelledby="preview-discovery-slot-title" className="rounded-3xl border border-[#d9e4dc] bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#c2410c]">Dans la sélection locale</p>
                  <h3 id="preview-discovery-slot-title" className="mt-1 text-xl font-black">Une mise en avant au milieu des boutiques</h3>
                </div>
                <span className="rounded-full bg-[#f2f6f2] px-3 py-1.5 text-[10px] font-bold text-[#47534b]">Format intégré · clairement identifié</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <article className="relative isolate flex min-h-48 flex-col justify-end overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_75%_22%,#f4cd9c_0,transparent_28%),linear-gradient(135deg,#075f48,#31816a_58%,#b6d7c4)] p-4 text-white sm:row-span-2 sm:min-h-full sm:p-6">
                  <span aria-hidden="true" className="absolute -right-8 top-8 -z-10 flex h-48 w-48 items-center justify-center rounded-full border-[18px] border-white/20 text-7xl sm:h-60 sm:w-60 sm:text-8xl">👜</span>
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-[#8f351d]">
                    <Megaphone className="h-3 w-3" aria-hidden="true" /> Sponsorisé · Exemple
                  </span>
                  <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.12em] text-white/80">{previewCampaign.shop} · {previewCampaign.city}</p>
                  <h4 className="mt-1 max-w-sm font-display text-xl font-black leading-tight sm:text-3xl">{previewCampaign.headline}</h4>
                  <p className="mt-2 max-w-sm text-xs leading-5 text-white/85 sm:text-sm">{previewCampaign.product} · {previewCampaign.price}</p>
                  <span className="mt-4 inline-flex w-fit min-h-9 items-center gap-2 rounded-full bg-white px-4 text-xs font-extrabold text-[#065f46]">
                    Découvrir la boutique <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </article>
                {[
                  { shop: 'Chez Aminata', category: 'Restauration', city: 'Abidjan', image: '🍲', tone: 'from-[#f7d8c5] to-[#ead8b6]' },
                  { shop: 'L’Éclat d’Abidjan', category: 'Beauté', city: 'Grand-Bassam', image: '🧴', tone: 'from-[#eee1ee] to-[#d3e5db]' },
                ].map((shop) => (
                  <article key={shop.shop} className={`relative flex min-h-28 items-center gap-3 overflow-hidden rounded-2xl border border-[#e7dfd3] bg-gradient-to-br ${shop.tone} p-3 sm:min-h-36 sm:p-4`}>
                    <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/65 text-4xl sm:h-20 sm:w-20">{shop.image}</span>
                    <span className="min-w-0">
                      <span className="block text-[9px] font-black uppercase tracking-wide text-[#8f351d]">{shop.category}</span>
                      <span className="mt-1 block truncate font-display text-sm font-extrabold text-[#292d2a] sm:text-base">{shop.shop}</span>
                      <span className="mt-0.5 block text-xs text-[#647067]">{shop.city} · Boutique</span>
                    </span>
                    <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-[#065f46]" aria-hidden="true" />
                  </article>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-5 text-[#647067]">La carte sponsorisée prend une place visible dans la sélection, sans se confondre avec les boutiques organiques. La version réelle n’apparaît qu’après approbation et activation.</p>
            </section>

            <section aria-label="Bannière publicitaire principale" className="relative isolate flex min-h-[260px] flex-col justify-between overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_79%_24%,#f4ce9c_0,transparent_25%),linear-gradient(110deg,#9c3423,#e36b3e_55%,#f2a05c)] p-5 text-white shadow-[0_12px_32px_rgba(20,40,30,.13)] sm:min-h-[330px] sm:p-8 lg:min-h-[370px] lg:flex-row lg:items-end">
              <div aria-hidden="true" className="pointer-events-none absolute -right-8 top-8 -z-10 flex h-52 w-52 items-center justify-center rounded-full border-[20px] border-white/30 text-7xl sm:right-10 sm:top-10 sm:h-64 sm:w-64 sm:text-8xl">{isBanner ? '🏬' : '👜'}</div>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-[#8f351d] shadow">
                <Megaphone className="h-3.5 w-3.5" aria-hidden="true" /> Sponsorisé · Bannière principale
              </span>
              <div className="relative mt-10 max-w-2xl lg:mt-0">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-white/80">{previewCampaign.category} · {previewCampaign.city} · {previewCampaign.shop}</p>
                <h3 className="mt-2 max-w-xl font-display text-3xl font-black leading-tight sm:text-5xl">{isBanner ? previewCampaign.headline : 'Les créations locales à découvrir cette semaine'}</h3>
                <p className="mt-3 max-w-xl text-sm leading-6 text-white/90 sm:text-base">{isBanner ? previewCampaign.body : `À la une : ${previewCampaign.product} chez ${previewCampaign.shop}. Une campagne approuvée apparaît ici.`}</p>
                <button type="button" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-extrabold text-[#8f351d]">
                  Découvrir la boutique <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <span className="absolute bottom-4 right-5 rounded-full bg-black/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white/90">Exemple · aucun achat réel</span>
            </section>

            <section aria-labelledby="preview-permanent-partners-title" className="overflow-hidden rounded-3xl border border-[#d9e4dc] bg-white shadow-sm">
              <div className="grid lg:min-h-[300px] lg:grid-cols-[.88fr_1.12fr]">
                <div className="flex min-w-0 flex-col justify-center p-4 sm:p-6 lg:p-8">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#647067]">Emplacement fixe · partenaires permanents</p>
                  <h3 id="preview-permanent-partners-title" className="mt-2 text-xl font-black sm:text-2xl">À leurs côtés, le commerce local.</h3>
                  <p className="mt-1 text-xs leading-5 text-[#647067] sm:text-sm">Le même carrousel que sur l’accueil, alimenté par les partenaires approuvés.</p>
                  <PublicPartnerCarousel previewPartners={previewPartners} />
                  <p className="mt-2 text-[10px] leading-5 text-[#647067]">Les promotions ponctuelles gardent un autre emplacement et leur mention « Sponsorisé ».</p>
                </div>

                <div className="relative isolate flex min-h-48 flex-col justify-end overflow-hidden bg-[radial-gradient(circle_at_78%_20%,#f4cd9c_0,transparent_27%),linear-gradient(135deg,#075f48,#31816a_58%,#b6d7c4)] p-5 text-white sm:min-h-56 sm:p-7 lg:min-h-full">
                  <span aria-hidden="true" className="pointer-events-none absolute -right-8 top-4 -z-10 flex h-48 w-48 items-center justify-center rounded-full border-[18px] border-white/20 text-7xl sm:h-60 sm:w-60 sm:text-8xl">👜</span>
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-[#8f351d]"><Megaphone className="h-3 w-3" aria-hidden="true" /> Campagne produit · exemple</span>
                  <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.12em] text-white/80">{previewCampaign.shop} · {previewCampaign.city}</p>
                  <h4 className="mt-1 max-w-sm font-display text-xl font-black leading-tight sm:text-3xl">{previewCampaign.headline}</h4>
                  <p className="mt-2 max-w-sm text-xs leading-5 text-white/85 sm:text-sm">{previewCampaign.product} · {previewCampaign.price}</p>
                  <span className="mt-4 inline-flex w-fit min-h-9 items-center gap-2 rounded-full bg-white px-4 text-xs font-extrabold text-[#065f46]">Découvrir la boutique <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></span>
                  <span className="absolute bottom-3 right-4 text-[9px] font-bold uppercase tracking-wide text-white/80">Exemple · local uniquement</span>
                </div>
              </div>
            </section>

            <section aria-labelledby="preview-promo-tiles-title">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#c2410c]">Sous la bannière principale</p>
                  <h3 id="preview-promo-tiles-title" className="mt-1 text-xl font-black">Tuiles promotionnelles</h3>
                </div>
                <span className="text-xs font-semibold text-[#647067]">Campagnes et boutiques sponsorisées</span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { title: previewCampaign.product, shop: previewCampaign.shop, image: '👜', tone: 'from-[#f5dfc4] to-[#e8c69a]', price: previewCampaign.price },
                  { title: 'Jus de bissap maison', shop: 'Chez Aminata', image: '🥤', tone: 'from-[#f7d8d3] to-[#e8aaa0]', price: '2 500 FCFA' },
                  { title: 'Coffret soin karité', shop: 'L’Éclat d’Abidjan', image: '🧴', tone: 'from-[#e8deef] to-[#c9b4d5]', price: '8 000 FCFA' },
                ].map((tile, index) => (
                  <article key={tile.title} className={`relative overflow-hidden rounded-2xl border border-[#e0d5c6] bg-gradient-to-br ${tile.tone} p-4 shadow-sm sm:min-h-36`}>
                    <span className="absolute right-3 top-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/55 text-4xl sm:h-20 sm:w-20">{tile.image}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-[#8f351d]"><Megaphone className="h-3 w-3" aria-hidden="true" /> Sponsorisé</span>
                    <div className="relative mt-3 max-w-[72%]">
                      <h4 className="line-clamp-2 text-sm font-black text-[#292d2a]">{tile.title}</h4>
                      <p className="mt-1 truncate text-xs font-semibold text-[#47534b]">{tile.shop} · {tile.price}</p>
                    </div>
                    <span className="absolute bottom-3 right-3 text-[9px] font-bold text-[#647067]">Démo {index + 1}</span>
                  </article>
                ))}
              </div>
            </section>

            <section aria-labelledby="preview-sponsored-feed-title">
              <div className="mb-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#c2410c]">Dans le fil de produits</p>
                <h3 id="preview-sponsored-feed-title" className="mt-1 text-xl font-black">Produits naturels et insertion sponsorisée</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                {[
                  { title: 'Chemise lin naturel', shop: 'Atelier Awa', image: '👔', price: '16 000 FCFA' },
                  { title: 'Plateau en bois sculpté', shop: 'Maison Kouadio', image: '🪵', price: '12 000 FCFA' },
                  { title: 'Sac Kente tissé à la main', shop: previewCampaign.shop, image: '👜', price: previewCampaign.price, promoted: true },
                  { title: 'Pommade karité & coco', shop: 'L’Éclat d’Abidjan', image: '🧴', price: '4 500 FCFA' },
                ].map((product) => (
                  <article key={product.title} className="overflow-hidden rounded-2xl border border-[#e0d5c6] bg-white shadow-sm">
                    <div className={`relative flex aspect-[4/3] items-center justify-center bg-gradient-to-br ${product.promoted ? 'from-[#f3d3a9] to-[#d7e9dd]' : 'from-[#eef3ed] to-[#d9e9df]'}`}>
                      <span className="text-6xl" aria-hidden="true">{product.image}</span>
                      {product.promoted && <span className="absolute left-2 top-2 rounded-full bg-white px-2.5 py-1 text-[9px] font-black uppercase text-[#8f351d]">Sponsorisé</span>}
                    </div>
                    <div className="p-3">
                      <p className="truncate text-[10px] font-semibold text-[#647067]">{product.shop}</p>
                      <h4 className="mt-1 line-clamp-2 min-h-10 text-sm font-bold">{product.title}</h4>
                      <p className="mt-2 font-display text-sm font-black text-[#065f46]">{product.price}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">Aperçu de disposition seulement : les campagnes réelles n’apparaissent dans ces emplacements qu’après soumission, approbation et activation de la diffusion. Aucun contenu fictif ne sera publié sur le vrai accueil.</p>
          </section>
        )}

        {view === 'merchant' && (
          <section className="mt-6 rounded-3xl border border-[#d8e9df] bg-[#f5faf6] p-5 sm:p-8" aria-labelledby="preview-merchant-title">
            <header className="flex items-start gap-3">
              <span className="rounded-2xl bg-[#e3f1e8] p-3 text-[#047857]"><Store className="h-5 w-5" aria-hidden="true" /></span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#c2410c]">Espace commerçant · aperçu rempli</p>
                <h2 id="preview-merchant-title" className="mt-1 text-2xl font-black">Préparer une mise en avant</h2>
                <p className="mt-2 text-sm leading-6 text-[#647067]">Les campagnes réelles sont gratuites pendant la bêta, durent 7 jours et attendent l’approbation du Super-admin.</p>
              </div>
            </header>
            <div className="mt-6 grid gap-4 rounded-2xl border border-[#e7dfd3] bg-white p-4 sm:grid-cols-2 sm:p-6">
              <label className="text-xs font-bold text-slate-700">Format
                <select value={format} onChange={(event) => setFormat(event.target.value as CampaignFormat)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                  <option value="product">Produit sponsorisé</option><option value="banner">Bannière de boutique</option>
                </select>
              </label>
              <p className="self-end rounded-lg bg-[#f5faf6] px-3 py-3 text-xs font-bold text-[#315548]">Durée de la campagne <span className="float-right">7 jours</span></p>
              {format === 'product' && <label className="text-xs font-bold text-slate-700 sm:col-span-2">Produit à mettre en avant
                <select defaultValue="bag" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="bag">{previewCampaign.product} · 8 en stock</option></select>
              </label>}
              <label className="text-xs font-bold text-slate-700 sm:col-span-2">Titre
                <input readOnly value={previewCampaign.headline} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm" />
              </label>
              <label className="text-xs font-bold text-slate-700 sm:col-span-2">Description
                <textarea readOnly value={previewCampaign.body} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm" />
              </label>
              <label className="flex items-start gap-2 text-xs leading-5 text-slate-600 sm:col-span-2">
                <input type="checkbox" defaultChecked className="mt-1 accent-[#047857]" />
                <span>Je confirme l’exactitude des informations et respecte la charte de contenu. *</span>
              </label>
              <button type="button" className="min-h-11 rounded-full bg-[#047857] px-5 text-sm font-bold text-white sm:col-span-2 sm:justify-self-start">Soumettre pour validation · aperçu</button>
            </div>
            <div className="mt-5 rounded-2xl border border-[#d9e4dc] bg-white p-4">
              <h3 className="text-sm font-black">Mes campagnes</h3>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-4">
                <div><p className="text-sm font-bold">{previewCampaign.headline}</p><p className="mt-1 text-xs text-amber-900">Produit · En attente de validation · 7 jours</p></div>
                <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-black text-amber-950">À examiner</span>
              </div>
            </div>
          </section>
        )}

        {view === 'admin' && (
          <section className="mt-6 space-y-5" aria-labelledby="preview-admin-title">
            <header className="rounded-3xl border border-[#d8e9df] bg-[#f5faf6] p-5 sm:p-8">
              <div className="flex items-start gap-3">
                <span className="rounded-2xl bg-[#e3f1e8] p-3 text-[#047857]"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#c2410c]">Administration · aperçu rempli</p>
                  <h2 id="preview-admin-title" className="mt-1 text-2xl font-black">Publicité et visibilité</h2>
                  <p className="mt-2 text-sm leading-6 text-[#647067]">Exemple de la file de modération, sans demande ni décision réelle.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-white p-4"><p className="text-xs font-semibold text-[#647067]">Bêta</p><p className="mt-1 text-lg font-black text-amber-800">En aperçu</p><p className="text-xs text-[#647067]">30 jours · diffusion selon configuration</p></div>
                <div className="rounded-2xl bg-white p-4"><p className="text-xs font-semibold text-[#647067]">Campagnes à examiner</p><p className="mt-1 text-2xl font-black">1</p><p className="text-xs text-[#647067]">Donnée fictive</p></div>
                <div className="rounded-2xl bg-white p-4"><p className="text-xs font-semibold text-[#647067]">Demandes partenaires</p><p className="mt-1 text-2xl font-black">1</p><p className="text-xs text-[#647067]">Donnée fictive</p></div>
              </div>
            </header>
            <article className="rounded-3xl border border-[#e7dfd3] bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase text-amber-900">À examiner</span>
                  <h3 className="mt-3 text-lg font-black">{previewCampaign.headline} · {previewCampaign.shop}</h3>
                  <p className="mt-1 text-sm text-[#647067]">Produit sponsorisé · {previewCampaign.city} · 7 jours</p>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[#47534b]">{previewCampaign.body}</p>
                  <p className="mt-3 text-xs text-[#647067]">Charte confirmée · 25 octobre 2026 · Mesures consenties : 0 impression · 0 clic</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#e3f1e8] px-3 py-1.5 text-xs font-bold text-[#065f46]"><BadgeCheck className="h-4 w-4" aria-hidden="true" /> Boutique vérifiée</span>
              </div>
              <label className="mt-5 block text-xs font-bold text-slate-700">Note de modération
                <input readOnly value="Exemple : visuel et description conformes à la charte." className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm" />
              </label>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="min-h-10 rounded-lg bg-emerald-700 px-4 text-xs font-bold text-white">Approuver · aperçu</button>
                <button type="button" className="min-h-10 rounded-lg border border-rose-300 px-4 text-xs font-bold text-rose-900">Refuser · aperçu</button>
              </div>
            </article>
            <article className="rounded-3xl border border-[#e7dfd3] bg-white p-5 sm:p-6">
              <h3 className="text-lg font-black">Demande partenaire · exemple</h3>
              <p className="mt-1 text-sm text-[#647067]">Maison Ivoire · Partenariat · contact@maison-ivoire.example</p>
              <p className="mt-3 text-sm leading-6">« Nous souhaitons présenter une sélection de produits fabriqués localement. »</p>
              <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">En attente</span><button type="button" className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold">Marquer contactée · aperçu</button><button type="button" className="min-h-9 rounded-lg border border-rose-300 px-3 text-xs font-bold text-rose-900">Refuser · aperçu</button></div>
            </article>
          </section>
        )}
      </div>
    </main>
  );
};
