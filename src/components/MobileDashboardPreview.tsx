import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  CreditCard,
  Edit3,
  Eye,
  EyeOff,
  Key,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Minus,
  MoreHorizontal,
  Package,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  Users,
  X,
} from 'lucide-react';

type PreviewView = 'merchant' | 'admin' | 'identity';

const previewViews: { id: PreviewView; label: string }[] = [
  { id: 'merchant', label: 'Commerçant' },
  { id: 'admin', label: 'Super-admin' },
  { id: 'identity', label: 'Vérification' },
];

const demoVerifications = [
  { id: 17, name: 'Beauté Awa', slug: 'beaute-awa', status: 'À vérifier', provider: 'Terminé', session: '…8f2', date: '16 oct. 2026, 10:30' },
  { id: 22, name: 'Atelier Kossi', slug: 'atelier-kossi', status: 'En revue', provider: 'En revue', session: '…3c9', date: '18 oct. 2026, 08:30' },
];

function PreviewBottomNav({ items, active, onSelect }: {
  items: { label: string; icon: typeof Store }[];
  active: string;
  onSelect: (label: string) => void;
}) {
  return (
    <nav aria-label="Aperçu de la navigation mobile" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }} className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-md border-t border-[#e7dfd3] bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-8px_24px_rgba(33,23,18,0.08)] backdrop-blur">
      {items.map(({ label, icon: Icon }) => (
        <button key={label} type="button" aria-current={label === active ? 'page' : undefined} onClick={() => onSelect(label)} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-bold ${label === active ? 'text-[#047857]' : 'text-slate-500'}`}>
          <Icon className="h-5 w-5" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function PreviewSection({ title, detail, items, onBack }: {
  title: string;
  detail: string;
  items: { label: string; value: string; icon: typeof Store; onClick?: () => void }[];
  onBack?: () => void;
}) {
  return (
    <main className="space-y-4 pb-24">
      <section>
        {onBack && <button type="button" onClick={onBack} className="mb-3 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#047857]"><ArrowLeft className="h-4 w-4" />Retour</button>}
        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#047857]">Aperçu de navigation</p>
        <h1 className="mt-1 text-2xl font-black text-[#292d2a]">{title}</h1>
        <p className="mt-1 text-xs text-slate-500">{detail}</p>
      </section>
      <section className="overflow-hidden rounded-2xl border border-[#e7dfd3] bg-white shadow-sm">
        {items.map(({ label, value, icon: Icon, onClick }, index) => (
          onClick ? (
            <button key={label} type="button" onClick={onClick} className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 ${index ? 'border-t border-slate-100' : ''}`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#d1fae5] text-[#047857]"><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1 text-sm font-bold text-slate-800">{label}</span>
              <span className="text-right text-xs font-semibold text-slate-500">{value}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          ) : (
            <article key={label} className={`flex min-h-16 items-center gap-3 px-4 py-3 ${index ? 'border-t border-slate-100' : ''}`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#d1fae5] text-[#047857]"><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1 text-sm font-bold text-slate-800">{label}</span>
              <span className="text-right text-xs font-semibold text-slate-500">{value}</span>
            </article>
          )
        ))}
      </section>
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><strong>Données fictives de test.</strong> Les commandes, boutiques et chiffres affichés ne sont pas des données réelles.</p>
    </main>
  );
}

function PreviewPageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-4 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#047857] text-base font-black text-white">M</span>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-[#047857]">MaTable.ci · {title}</p>
          <p className="truncate text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-[#fff0e8] px-2.5 py-1 text-[10px] font-extrabold text-[#b84320]">APERÇU</span>
    </header>
  );
}

function MerchantPreview() {
  const [activeTab, setActiveTab] = useState('Plus');
  const [menuTarget, setMenuTarget] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState('');
  const [isShopOpen, setIsShopOpen] = useState(true);
  const [products, setProducts] = useState([
    { id: 1, title: 'Robe wax Soleil', price: 18000, stock: 8, visible: true },
    { id: 2, title: 'Sac Naya', price: 12500, stock: 2, visible: true },
    { id: 3, title: 'Ensemble bogolan', price: 24000, stock: 5, visible: false },
  ]);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftPrice, setDraftPrice] = useState('');
  const [draftStock, setDraftStock] = useState('');
  const [orderStatuses, setOrderStatuses] = useState<Record<number, string>>({
    1048: 'pending',
    1047: 'preparing',
    1046: 'ready',
  });
  const [orderNotice, setOrderNotice] = useState('');
  const openProductForm = (product?: typeof products[number]) => {
    setEditingProductId(product?.id ?? null);
    setDraftTitle(product?.title ?? '');
    setDraftPrice(product ? String(product.price) : '');
    setDraftStock(product ? String(product.stock) : '');
    setProductFormOpen(true);
    setActionNotice('');
  };
  const saveDemoProduct = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draftTitle.trim();
    const price = Number(draftPrice);
    const stock = Number(draftStock);
    if (!title || !Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) return;
    if (editingProductId !== null) {
      setProducts((current) => current.map((product) => product.id === editingProductId ? { ...product, title, price, stock } : product));
    } else {
      setProducts((current) => [...current, { id: Date.now(), title, price, stock, visible: true }]);
    }
    setProductFormOpen(false);
    setEditingProductId(null);
    setActionNotice('Aperçu uniquement : la modification est conservée dans cet écran de démonstration, pas dans la base.');
  };
  const updateDemoOrderStatus = (orderId: number, status: string) => {
    setOrderStatuses((current) => ({ ...current, [orderId]: status }));
    setOrderNotice(`Commande #${orderId} mise à jour dans l’aperçu uniquement. Aucun client n’a été contacté.`);
  };
  const nextOrderAction: Record<string, { label: string; next: string }> = {
    pending: { label: 'Accepter la commande', next: 'confirmed' },
    confirmed: { label: 'Préparer', next: 'preparing' },
    preparing: { label: 'Marquer prête', next: 'ready' },
    ready: { label: 'Marquer livrée', next: 'delivered' },
  };
  const navItems = [
    { label: 'Accueil', icon: LayoutDashboard },
    { label: 'Produits', icon: Package },
    { label: 'Commandes', icon: ShoppingBag },
    { label: 'Stats', icon: BarChart3 },
    { label: 'Plus', icon: MoreHorizontal },
  ];
  const sections = [
    {
      title: 'Ma boutique',
      items: [
        { label: 'Apparence de la vitrine', icon: Settings },
        { label: 'Horaires et disponibilité', icon: Clock3 },
        { label: 'Informations publiques', icon: Store },
      ],
    },
    { title: 'Visibilité', items: [{ label: 'Promotion et boost', icon: Activity }] },
    { title: 'Mon activité', items: [
      { label: 'Flash bilan', icon: MessageCircle },
      { label: 'Statistiques Pro', icon: BarChart3 },
    ] },
    {
      title: 'Mon compte',
      items: [
        { label: 'Mon abonnement', icon: CreditCard, badge: 'Premium' },
        { label: 'Vérification d’identité', icon: ShieldCheck, badge: 'À faire' },
        { label: 'Notifications', icon: Bell },
        { label: 'Profil et mes données', icon: Users },
      ],
    },
    {
      title: 'Partage',
      items: [
        { label: 'Lien vitrine', icon: Copy },
        { label: 'Lien d’accès privé', icon: Key },
      ],
    },
  ];

  return (
    <>
      <PreviewPageHeader title="Commerçant" subtitle="Atelier Awa · Abidjan" />
      {activeTab === 'Plus' && menuTarget ? <PreviewSection
        title={menuTarget}
        detail="Cette rubrique existe dans l’espace commerçant authentifié. L’aperçu n’enregistre aucune modification."
        onBack={() => setMenuTarget(null)}
        items={[{
          label: menuTarget === 'Horaires et disponibilité' ? 'Jours et heures d’ouverture' : 'Paramètres de la boutique',
          value: 'Disponible dans l’espace réel',
          icon: menuTarget === 'Horaires et disponibilité' ? Clock3 : Settings,
        }]}
      /> : activeTab === 'Plus' ? <main className="space-y-4 pb-24">
        <section className="rounded-2xl border border-[#e7dfd3] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Votre boutique</p>
              <h1 className="mt-1 text-xl font-black text-[#292d2a]">Atelier Awa</h1>
            </div>
            <button type="button" aria-pressed={isShopOpen} onClick={() => setIsShopOpen((open) => !open)} className={`min-h-10 rounded-full px-3 text-[11px] font-bold ${isShopOpen ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
              {isShopOpen ? 'Boutique ouverte' : 'Boutique fermée'}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Vitrine : matable.ci/atelier-awa</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[['Commandes', '12'], ['Produits', String(products.length)], ['À traiter', '3']].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-[#f8f6f1] p-2.5">
                <p className="text-[10px] font-semibold text-slate-500">{label}</p>
                <p className="mt-1 text-lg font-black text-[#292d2a]">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="merchant-plus-title" className="overflow-hidden rounded-2xl border border-[#e7dfd3] bg-[#fffdf8] shadow-sm">
          <header className="border-b border-[#e7dfd3] px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-[#047857]">Menu commerçant</p>
            <h2 id="merchant-plus-title" className="mt-0.5 text-lg font-black text-[#292d2a]">Plus</h2>
          </header>
          <div className="space-y-4 p-3">
            {sections.map((section) => (
              <section key={section.title}>
                <h3 className="mb-1 px-2 text-[10px] font-black uppercase tracking-wide text-slate-500">{section.title}</h3>
                <div className="overflow-hidden rounded-xl border border-[#e9e5dc] bg-white">
                  {section.items.map(({ label, icon: Icon, badge }, index) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => label.startsWith('Lien ')
                        ? setActionNotice(`Aperçu uniquement : le ${label.toLocaleLowerCase('fr')} n’a pas été copié.`)
                        : setMenuTarget(label)}
                      className={`flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 ${index ? 'border-t border-[#eee9e1]' : ''}`}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-[#047857]" />
                      <span className="min-w-0 flex-1">{label}</span>
                      {badge && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${badge === 'À faire' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`}>{badge}</span>}
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <div className="overflow-hidden rounded-xl border border-[#e9e5dc] bg-white">
              <button type="button" onClick={() => setActionNotice('Aperçu uniquement : aucun lien réel n’a été copié.')} className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50">
                <MessageCircle className="h-4 w-4 shrink-0 text-[#047857]" />
                <span className="flex-1">Aide et assistance</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
              <button type="button" onClick={() => setActionNotice('Aperçu uniquement : la déconnexion n’est pas exécutée.')} className="flex min-h-12 w-full items-center gap-3 border-t border-[#eee9e1] px-3 text-left text-sm font-bold text-rose-800 hover:bg-rose-50">
                <LogOut className="h-4 w-4 shrink-0" />
                <span className="flex-1">Déconnexion</span>
                <span className="text-[10px] font-semibold text-slate-500">Démo</span>
              </button>
            </div>
          </div>
          {actionNotice && <p role="status" className="mx-3 mb-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">{actionNotice}</p>}
        </section>
      </main> : activeTab === 'Produits' ? <main className="space-y-4 pb-24">
        <section className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-[#047857]">Catalogue de démonstration</p>
            <h1 className="mt-1 text-xl font-black text-[#292d2a]">Produits ({products.length})</h1>
          </div>
          <button type="button" onClick={() => openProductForm()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#047857] px-3 text-xs font-bold text-white">
            <Plus className="h-4 w-4" /> Ajouter
          </button>
        </section>
        {productFormOpen && (
          <form onSubmit={saveDemoProduct} className="space-y-3 rounded-2xl border border-[#d7e4da] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-black text-slate-900">{editingProductId === null ? 'Ajouter un produit' : 'Modifier le produit'}</h2>
              <button type="button" aria-label="Fermer le formulaire" onClick={() => setProductFormOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            <label className="block text-xs font-bold text-slate-700">Nom du produit
              <input required value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-slate-700">Prix (FCFA)
                <input required min="1" type="number" value={draftPrice} onChange={(event) => setDraftPrice(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" />
              </label>
              <label className="block text-xs font-bold text-slate-700">Stock
                <input required min="0" type="number" value={draftStock} onChange={(event) => setDraftStock(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal" />
              </label>
            </div>
            <button type="submit" className="min-h-11 w-full rounded-xl bg-[#047857] text-sm font-bold text-white">Enregistrer dans l’aperçu</button>
          </form>
        )}
        <section aria-label="Actions des produits" className="space-y-3">
          {products.map((product) => (
            <article key={product.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-black text-slate-900">{product.title}</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-600">{new Intl.NumberFormat('fr-FR').format(product.price)} FCFA · Stock {product.stock}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${product.visible ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{product.visible ? 'Visible' : 'Masqué'}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" aria-label={`Retirer une unité du stock de ${product.title}`} disabled={product.stock === 0} onClick={() => setProducts((current) => current.map((item) => item.id === product.id ? { ...item, stock: item.stock - 1 } : item))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 disabled:opacity-40"><Minus className="h-4 w-4" /> Stock</button>
                <button type="button" aria-label={`Ajouter une unité au stock de ${product.title}`} onClick={() => setProducts((current) => current.map((item) => item.id === product.id ? { ...item, stock: item.stock + 1 } : item))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700"><Plus className="h-4 w-4" /> Stock</button>
                <button type="button" onClick={() => setProducts((current) => current.map((item) => item.id === product.id ? { ...item, visible: !item.visible } : item))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700">{product.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{product.visible ? 'Masquer' : 'Rendre visible'}</button>
                <button type="button" onClick={() => openProductForm(product)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-700"><Edit3 className="h-4 w-4" /> Modifier</button>
              </div>
            </article>
          ))}
        </section>
        {actionNotice && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">{actionNotice}</p>}
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><strong>Mode démonstration :</strong> ajout, modification, stock et visibilité changent uniquement dans cet aperçu.</p>
      </main> : activeTab === 'Commandes' ? <main className="space-y-4 pb-24">
        <section>
          <p className="text-[10px] font-black uppercase tracking-wide text-[#047857]">Gestion commerciale</p>
          <h1 className="mt-1 text-xl font-black text-[#292d2a]">Commandes</h1>
          <p className="mt-1 text-xs text-slate-500">Accepter, préparer, remettre ou annuler une commande.</p>
        </section>
        {[1048, 1047, 1046].map((orderId, index) => {
          const status = orderStatuses[orderId];
          const nextAction = nextOrderAction[status];
          const customer = ['Aïcha K.', 'Mariam S.', 'Kader T.'][index];
          const amount = ['18 500', '32 000', '12 500'][index];
          return (
            <article key={orderId} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="text-sm font-black text-slate-900">Commande #{orderId}</h2><p className="mt-1 text-xs text-slate-600">{customer} · {amount} FCFA</p></div>
                <span className="rounded-full bg-[#d1fae5] px-2 py-1 text-[10px] font-bold capitalize text-[#047857]">{status === 'pending' ? 'À confirmer' : status === 'delivered' ? 'Livrée' : status === 'ready' ? 'Prête' : status === 'preparing' ? 'En préparation' : 'Acceptée'}</span>
              </div>
              {nextAction && <button type="button" onClick={() => updateDemoOrderStatus(orderId, nextAction.next)} className="min-h-11 w-full rounded-xl bg-[#047857] px-3 text-sm font-bold text-white">{nextAction.label}</button>}
              {['pending', 'confirmed', 'preparing', 'ready'].includes(status) && <button type="button" onClick={() => updateDemoOrderStatus(orderId, 'cancelled')} className="min-h-10 w-full rounded-xl border border-rose-200 bg-rose-50 text-xs font-bold text-rose-800">Annuler la commande (démo)</button>}
              {status === 'cancelled' && <button type="button" onClick={() => updateDemoOrderStatus(orderId, 'pending')} className="min-h-10 w-full rounded-xl border border-slate-300 text-xs font-bold text-slate-700">Réactiver (démo)</button>}
              {status === 'delivered' && <p className="text-xs font-bold text-emerald-800">Commande terminée</p>}
            </article>
          );
        })}
        {orderNotice && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">{orderNotice}</p>}
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><strong>Mode démonstration :</strong> statuts temporaires à l’écran ; aucun client ni service externe n’est contacté.</p>
      </main> : activeTab === 'Accueil' ? <main className="space-y-4 pb-24">
        <section className="rounded-2xl border border-[#e7dfd3] bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-wide text-[#047857]">Vue d’ensemble</p>
          <h1 className="mt-1 text-xl font-black text-[#292d2a]">Atelier Awa</h1>
          <p className="mt-1 text-xs text-slate-600">Commandes à traiter · Produits · État de la boutique</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setIsShopOpen((open) => !open)} className="min-h-11 rounded-xl border border-[#d7e4da] bg-[#f5faf6] px-3 text-xs font-bold text-[#047857]">{isShopOpen ? 'Fermer la boutique' : 'Ouvrir la boutique'}</button>
            <button type="button" onClick={() => setActionNotice('Aperçu uniquement : la vitrine publique ne sera pas ouverte.')} className="min-h-11 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-700">Voir ma vitrine</button>
            <button type="button" onClick={() => { setActiveTab('Produits'); openProductForm(); }} className="min-h-11 rounded-xl bg-[#047857] px-3 text-xs font-bold text-white">Ajouter un produit</button>
            <button type="button" onClick={() => setActiveTab('Commandes')} className="min-h-11 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-700">Traiter les commandes</button>
          </div>
          <p role="status" className="mt-3 text-xs font-semibold text-slate-600">Boutique {isShopOpen ? 'ouverte' : 'fermée'} · {products.length} produits de démonstration.</p>
          {actionNotice && <p role="status" className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-950">{actionNotice}</p>}
        </section>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><strong>Données fictives de test.</strong> Ces commandes et produits ne sont pas réels.</p>
      </main> : <PreviewSection
        title={activeTab}
        detail={`Atelier Awa · données de démonstration`}
        items={[
          { label: 'Visites de la vitrine', value: '1 248', icon: Activity },
          { label: 'Commandes reçues', value: '42', icon: ShoppingBag },
          { label: 'Taux de conversion', value: '3,4 %', icon: BarChart3 },
        ]}
      />}
      <PreviewBottomNav active={activeTab} items={navItems} onSelect={(tab) => { setActiveTab(tab); setMenuTarget(null); }} />
    </>
  );
}

function AdminPreview() {
  const [activeTab, setActiveTab] = useState('Accueil');
  const [moreTarget, setMoreTarget] = useState<string | null>(null);
  const navItems = [
    { label: 'Accueil', icon: LayoutDashboard },
    { label: 'Boutiques', icon: Store },
    { label: 'Identité', icon: ShieldCheck },
    { label: 'Finances', icon: CreditCard },
    { label: 'Plus', icon: MoreHorizontal },
  ];
  const metrics = [
    { label: 'Boutiques actives', value: '24 / 31', icon: Store, color: 'text-[#047857] bg-[#d1fae5]' },
    { label: 'Commandes', value: '186', icon: ShoppingBag, color: 'text-blue-800 bg-blue-50' },
    { label: 'Montant commandé', value: '2,48 M F', icon: CreditCard, color: 'text-amber-900 bg-amber-50' },
    { label: 'Conversion', value: '4,8 %', icon: Activity, color: 'text-violet-800 bg-violet-50' },
  ];
  const tasks = [
    { label: 'Identités à suivre', detail: '2 dossiers attendent un suivi', count: '2', icon: ShieldCheck, color: 'bg-amber-50 text-amber-900' },
    { label: 'Boutiques à vérifier', detail: '7 boutiques récemment inscrites', count: '7', icon: Store, color: 'bg-emerald-50 text-emerald-900' },
    { label: 'Commandes à surveiller', detail: '3 commandes en attente', count: '3', icon: ShoppingBag, color: 'bg-blue-50 text-blue-900' },
  ];

  return (
    <>
      <PreviewPageHeader title="Super-admin" subtitle="Pilotage de la plateforme" />
      {activeTab === 'Accueil' ? <main className="space-y-4 pb-24">
        <section className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#047857]">Centre de pilotage</p>
            <h1 className="mt-1 text-2xl font-black text-[#292d2a]">Vue d’ensemble</h1>
            <p className="mt-1 text-xs text-slate-500">Indicateurs de démonstration · 30 derniers jours</p>
          </div>
          <button type="button" disabled className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-500">30 jours</button>
        </section>
        <section aria-label="Indicateurs de la plateforme" className="grid grid-cols-2 gap-2.5">
          {metrics.map(({ label, value, icon: Icon, color }) => (
            <article key={label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className={`grid h-8 w-8 place-items-center rounded-lg ${color}`}><Icon className="h-4 w-4" /></span>
              <p className="mt-2 min-h-8 text-[10px] font-bold uppercase leading-4 tracking-wide text-slate-500">{label}</p>
              <strong className="block break-words text-lg font-black text-slate-900">{value}</strong>
            </article>
          ))}
        </section>
        <section className="overflow-hidden rounded-2xl border border-[#e7dfd3] bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-base font-black text-[#292d2a]">À traiter</h2>
              <p className="text-xs text-slate-500">Priorités pour l’équipe</p>
            </div>
            <span className="rounded-full bg-[#fff0e8] px-2.5 py-1 text-xs font-black text-[#b84320]">12</span>
          </header>
          <div className="divide-y divide-slate-100">
            {tasks.map(({ label, detail, count, icon: Icon, color }) => (
              <button key={label} type="button" onClick={() => {
                setMoreTarget(label === 'Commandes à surveiller' ? 'Commandes' : null);
                setActiveTab(label === 'Identités à suivre' ? 'Identité' : label === 'Boutiques à vérifier' ? 'Boutiques' : 'Plus');
              }} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm font-bold text-slate-900">{label}</strong>
                  <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>
                </span>
                <span className="text-base font-black text-slate-800">{count}</span>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-[#dcebe3] bg-[#edf6f1] p-4">
          <div className="flex items-center gap-2 text-[#047857]"><CreditCard className="h-4 w-4" /><h2 className="text-sm font-black">Encaissements confirmés</h2></div>
          <p className="mt-1 text-xs text-slate-600">Sur les 90 derniers jours</p>
          <p className="mt-2 text-2xl font-black text-[#047857]">845 000 F CFA</p>
          <p className="mt-1 text-xs font-semibold text-slate-600">36 paiements confirmés · période de démonstration</p>
        </section>
      </main> : activeTab === 'Plus' && moreTarget ? <PreviewSection
        title={moreTarget}
        detail="Rubrique du super-admin · contenu de démonstration uniquement"
        onBack={() => setMoreTarget(null)}
        items={moreTarget === 'Commandes' ? [
          { label: 'Commande #1048 · Atelier Awa', value: 'À confirmer · 18 500 F', icon: ShoppingBag },
          { label: 'Commande #1047 · Chez Mado', value: 'En préparation · 32 000 F', icon: ShoppingBag },
        ] : moreTarget === 'Clients' ? [
          { label: 'Aïcha K.', value: 'Compte client · Abidjan', icon: Users },
          { label: 'Mariam S.', value: 'Compte client · Cocody', icon: Users },
        ] : moreTarget === 'Avis et signalements' ? [
          { label: 'Avis clients à modérer', value: '2 en attente', icon: Bell },
          { label: 'Signalements à examiner', value: '1 en attente', icon: Bell },
        ] : moreTarget === 'Audience' ? [
          { label: 'Visites consenties', value: '12 480', icon: BarChart3 },
          { label: 'Visiteurs uniques', value: '8 240', icon: Users },
        ] : moreTarget === 'Abonnements' ? [
          { label: 'Abonnements', value: '19 actifs', icon: CreditCard },
          { label: 'Essais en cours', value: '5', icon: Activity },
        ] : moreTarget === 'Opérations' ? [
          { label: 'État du service', value: 'Opérationnel', icon: Activity },
          { label: 'Mode maintenance', value: 'Désactivé', icon: Settings },
        ] : moreTarget === 'Annonces Push' ? [
          { label: 'Annonces envoyées', value: '3', icon: Bell },
          { label: 'Destinataires', value: '24 boutiques', icon: Store },
        ] : moreTarget === 'Journal d’audit' ? [
          { label: 'Dernière action', value: 'Statut Didit synchronisé', icon: Check },
          { label: 'Évènements récents', value: 'Consulter', icon: Activity },
        ] : [
          { label: 'Outil indisponible dans cette démonstration', value: '—', icon: Settings },
        ]}
      /> : <PreviewSection
        title={activeTab === 'Plus' ? 'Autres rubriques' : activeTab}
        detail={activeTab === 'Plus' ? 'Outils de pilotage réservés au super-admin' : 'Vue de démonstration · super-admin'}
        items={activeTab === 'Boutiques' ? [
          { label: 'Atelier Awa', value: 'Active · Abidjan', icon: Store },
          { label: 'Chez Mado', value: 'À vérifier · Yopougon', icon: Store },
          { label: 'Koffi Délices', value: 'Active · Cocody', icon: Store },
        ] : activeTab === 'Identité' ? [
          { label: 'Beauté Awa', value: 'À vérifier', icon: ShieldCheck },
          { label: 'Atelier Kossi', value: 'En revue', icon: ShieldCheck },
        ] : activeTab === 'Finances' ? [
          { label: 'Encaissements confirmés · 90 j', value: '845 000 F CFA', icon: CreditCard },
          { label: 'Paiements confirmés', value: '36', icon: Check },
          { label: 'Abonnements actifs', value: '19', icon: Activity },
        ] : [
          { label: 'Commandes', value: 'Ouvrir la gestion', icon: ShoppingBag, onClick: () => setMoreTarget('Commandes') },
          { label: 'Clients', value: 'Ouvrir les comptes', icon: Users, onClick: () => setMoreTarget('Clients') },
          { label: 'Avis et signalements', value: 'Ouvrir la modération', icon: Bell, onClick: () => setMoreTarget('Avis et signalements') },
          { label: 'Audience', value: 'Consulter les statistiques', icon: BarChart3, onClick: () => setMoreTarget('Audience') },
          { label: 'Abonnements', value: '19 actifs', icon: CreditCard, onClick: () => setMoreTarget('Abonnements') },
          { label: 'Opérations', value: 'État du service', icon: Activity, onClick: () => setMoreTarget('Opérations') },
          { label: 'Annonces Push', value: 'Gestion des annonces', icon: Bell, onClick: () => setMoreTarget('Annonces Push') },
          { label: 'Journal d’audit', value: 'Historique des actions', icon: Check, onClick: () => setMoreTarget('Journal d’audit') },
        ]}
      />}
      <PreviewBottomNav active={activeTab} items={navItems} onSelect={(tab) => { setActiveTab(tab); setMoreTarget(null); }} />
    </>
  );
}

function IdentityPreview() {
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState('Identité');
  const [query, setQuery] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const filtered = useMemo(
    () => demoVerifications.filter((item) => `${item.name} ${item.slug}`.toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr'))),
    [query],
  );
  const selectedIndex = filtered.findIndex((item) => item.id === selectedShopId);
  const selected = selectedIndex >= 0 ? filtered[selectedIndex] : null;
  const navItems = [
    { label: 'Boutiques', icon: Store },
    { label: 'Identité', icon: ShieldCheck },
    { label: 'Avis & signalements', icon: Bell },
  ];
  const isIdentityTab = activeTab === 'Identité';

  return (
    <>
      <PreviewPageHeader title={activeTab === 'Identité' ? 'Vérifications' : 'Admin de vérification'} subtitle="Accès limité · données de démonstration" />
      {isIdentityTab ? <main className="space-y-4 pb-24">
        <section className="overflow-hidden rounded-2xl border border-[#e7dfd3] bg-white shadow-sm">
          <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#d1fae5] text-[#047857]"><ShieldCheck className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-black text-[#292d2a]">{selected ? 'Dossier de vérification' : 'File de vérification Didit'}</h1>
              <p className="text-xs text-slate-500">{selected ? 'Consultation seule · décision synchronisée par Didit' : `${filtered.length} dossiers de démonstration`}</p>
            </div>
          </header>
          {!selected ? (
            <div className="space-y-3 p-3">
              <label className="relative block">
                <span className="sr-only">Rechercher une boutique</span>
                <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une boutique" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#047857] focus:ring-2 focus:ring-[#047857]/20" />
              </label>
              {filtered.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-black text-[#292d2a]">{item.name}</h2>
                      <p className="mt-1 text-xs text-slate-500">/{item.slug} · Boutique #{item.id}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${item.status === 'À vérifier' ? 'bg-amber-100 text-amber-900' : 'bg-blue-50 text-blue-900'}`}>{item.status}</span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-slate-500">
                    <p>Session {item.session} · {item.date}</p>
                    <p>Statut fournisseur : <strong className="text-slate-700">{item.provider}</strong></p>
                  </div>
                  <button type="button" onClick={() => setSelectedShopId(item.id)} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700">
                    Consulter le dossier <ChevronRight className="h-4 w-4" />
                  </button>
                </article>
              ))}
              {filtered.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Aucun dossier ne correspond.</p>}
            </div>
          ) : (
            <div className="p-4">
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => setSelectedShopId(null)} className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#047857]"><ArrowLeft className="h-4 w-4" />Retour à la file</button>
                <span className="text-xs font-semibold text-slate-500">{selectedIndex + 1} sur {filtered.length}</span>
              </div>
              <article className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h2 className="text-base font-black text-[#292d2a]">{selected.name}</h2><p className="mt-1 text-sm text-slate-500">/{selected.slug} · Boutique #{selected.id}</p></div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${selected.status === 'À vérifier' ? 'bg-amber-100 text-amber-900' : 'bg-blue-50 text-blue-900'}`}>{selected.status}</span>
                </div>
                <dl className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
                  {[['Résultat Didit', selected.provider], ['Session', selected.session], ['Démarrée le', selected.date]].map(([label, value]) => (
                    <div key={label} className="flex items-start justify-between gap-3 py-3 text-xs"><dt className="text-slate-500">{label}</dt><dd className="text-right font-bold text-slate-900">{value}</dd></div>
                  ))}
                </dl>
                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Le statut est transmis par Didit. Cet écran permet de consulter le dossier et de relancer le propriétaire ; aucune validation ou décision manuelle n’est effectuée ici.</p>
                <button type="button" onClick={() => setActionNotice('Aperçu uniquement : aucun rappel WhatsApp n’a été préparé ni envoyé.')} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#047857] px-3 text-sm font-bold text-white"><MessageCircle className="h-4 w-4" />Préparer un rappel WhatsApp</button>
              </article>
              {actionNotice && <p role="status" className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">{actionNotice}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" disabled={selectedIndex <= 0} onClick={() => setSelectedShopId(filtered[selectedIndex - 1]?.id ?? null)} className="min-h-11 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700 disabled:opacity-40">Précédent</button>
                <button type="button" disabled={selectedIndex >= filtered.length - 1} onClick={() => setSelectedShopId(filtered[selectedIndex + 1]?.id ?? null)} className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700 disabled:opacity-40">Suivant <ArrowRight className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </section>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950"><strong>Données fictives de test.</strong> Aucun statut réel n’est affiché et aucune action ne sera envoyée.</p>
      </main> : <PreviewSection
        title={activeTab}
        detail="Rubrique disponible pour l’admin de vérification"
        items={activeTab === 'Boutiques' ? [
          { label: 'Beauté Awa', value: 'À vérifier', icon: Store },
          { label: 'Atelier Kossi', value: 'En cours de revue', icon: Store },
        ] : [
          { label: 'Avis clients', value: 'À modérer : 2', icon: Bell },
          { label: 'Signalements', value: 'À examiner : 1', icon: Bell },
        ]}
      />}
      <PreviewBottomNav
        active={activeTab}
        items={navItems}
        onSelect={setActiveTab}
      />
    </>
  );
}

export default function MobileDashboardPreview() {
  const [activeView, setActiveView] = useState<PreviewView>(() => {
    const initial = new URLSearchParams(window.location.search).get('view');
    return previewViews.some((view) => view.id === initial) ? initial as PreviewView : 'merchant';
  });
  const content = activeView === 'merchant' ? <MerchantPreview />
    : activeView === 'admin' ? <AdminPreview />
      : <IdentityPreview />;

  return (
    <div className="min-h-screen bg-[#FAF8F2] px-3 pb-20 pt-4 text-slate-800 sm:px-5">
      <div className="mx-auto max-w-md">
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950">
          <strong>Aperçu mobile · environnement de test.</strong> Contenu de démonstration, indépendant des comptes et des données réelles.
        </div>
        <nav aria-label="Choisir un aperçu" className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-[#e7dfd3] bg-white p-1">
          {previewViews.map(({ id, label }) => (
            <button key={id} type="button" aria-pressed={activeView === id} onClick={() => setActiveView(id)} className={`min-h-10 rounded-lg px-2 text-xs font-bold transition ${activeView === id ? 'bg-[#047857] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </nav>
        {content}
      </div>
    </div>
  );
}
