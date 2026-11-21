import React from 'react';
import { m, useReducedMotion } from 'motion/react';
import { ArrowRight, BadgePercent, Clock3, MessageCircle, Search, ShoppingBag, Store } from 'lucide-react';
import { Link } from 'react-router-dom';

const tourSteps = [
  {
    label: 'Explorer',
    title: 'Le commerce local, facile à trouver',
    description: 'Cherchez une boutique, un produit ou une ville. Vous pouvez aussi partir des catégories ou des tendances pour découvrir de nouvelles adresses.',
    icon: Search,
    accent: 'bg-[#e2eee6] text-[var(--mt-green-deep)]',
  },
  {
    label: 'Découvrir',
    title: 'Chaque boutique a son univers',
    description: 'La vitrine rassemble les informations partagées par le commerçant : présentation, horaires, emplacement et catalogue avec les prix.',
    icon: Store,
    accent: 'bg-[#f8e3d4] text-[#a53a1d]',
  },
  {
    label: 'Échanger',
    title: 'Une relation directe, sans intermédiaire',
    description: 'Vous contactez le commerçant sur WhatsApp pour vérifier la disponibilité, poser vos questions et préciser votre demande.',
    icon: MessageCircle,
    accent: 'bg-[#e3f2e7] text-[var(--mt-green-hover)]',
  },
];

const shopSteps = [
  'Créez la boutique avec son nom, son numéro WhatsApp, sa commune et sa catégorie. Gardez le PIN choisi pour vous reconnecter.',
  'Complétez la vitrine : coordonnées, horaires, présentation et identité visuelle.',
  'Ajoutez vos produits, leurs prix, leur disponibilité et des photos à jour.',
  'Faites vérifier l’identité du responsable (pièce d’identité) : c’est requis avant la publication.',
  'Choisissez une formule et réglez-la avec GeniusPay. Aucun prélèvement automatique n’est effectué.',
  'Publiez la boutique après les étapes requises, puis gérez les demandes des clients depuis votre espace et échangez avec eux sur WhatsApp.',
];

const reveal = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const HowItWorksPage: React.FC = () => {
  const reduceMotion = useReducedMotion();

  return (
    <main className="min-h-screen bg-[var(--mt-gray-50)] text-[var(--mt-gray-900)]">
      <section className="relative isolate overflow-hidden bg-[var(--mt-green-deep)] text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-40 -z-10 h-[520px] w-[520px] rounded-full border border-white/10 sm:right-[10%] sm:top-[-320px] sm:h-[800px] sm:w-[800px]" />
        <div className="mx-auto max-w-[1184px] px-5 pb-7 pt-5 sm:px-8 sm:pb-12 sm:pt-8">
          <m.div
            initial={reduceMotion ? false : 'hidden'}
            animate="visible"
            variants={reveal}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="max-w-3xl"
          >
            <p className="text-xs font-bold text-[var(--mt-orange-soft)] sm:text-sm">La vision MaTable</p>
            <h1 className="mt-3 font-display text-3xl font-extrabold leading-[1.04] tracking-[-0.045em] sm:mt-4 sm:text-6xl">
              Le commerce local, <span className="text-[var(--mt-orange-soft)]">plus proche.</span>
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-6 text-[#e0ebe5] sm:mt-5 sm:text-lg sm:leading-7">
              Découvrez les commerces ivoiriens et échangez directement avec eux.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:mt-7 sm:flex-row sm:items-center">
              <Link to="/boutiques" className="motion-interactive inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--mt-orange-soft)] px-5 text-sm font-extrabold text-[var(--mt-gray-900)] transition hover:bg-[#ffd09a]">
                Je cherche une boutique <Search className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link to="/commercants" className="motion-interactive inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/25 bg-white/[0.08] px-5 text-sm font-bold text-white transition hover:bg-white/15">
                Je suis commerçant <Store className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </m.div>
        </div>
      </section>

      <section id="visite-guidee" className="mx-auto max-w-[1184px] px-5 py-12 sm:px-8 sm:py-16">
        <h2 className="font-display text-2xl font-extrabold leading-tight sm:text-4xl">En trois étapes</h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4">
          {tourSteps.map(({ label, title, description, icon: Icon, accent }, index) => (
            <li key={label} className="rounded-3xl border border-[#e7ddd0] bg-white p-5">
              <div className="flex items-center gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${accent}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <p className="text-sm font-bold text-[var(--mt-gray-600)]">{index + 1}. {label}</p>
              </div>
              <h3 className="mt-3 font-display text-lg font-extrabold leading-snug">{title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-[var(--mt-gray-600)]">{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="promotions" className="border-y border-[#e8dfd2] bg-white">
        <div className="mx-auto grid max-w-[1184px] gap-7 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold text-[var(--mt-orange-deep)]"><BadgePercent className="h-4 w-4" aria-hidden="true" /> Les promotions MaTable</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold leading-tight sm:text-4xl">Un prix réduit doit rester lisible.</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--mt-gray-600)]">Les offres affichées ici sont des promotions produits réellement actives, renseignées par les boutiques avec un prix et une période de validité.</p>
            <Link to="/promotions" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--mt-orange-deep)] px-5 text-sm font-bold text-white transition hover:bg-[#a53a1d]">
              Voir les offres actives <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: BadgePercent, title: 'Le prix', text: 'Le prix habituel et le prix réduit sont visibles ensemble.' },
              { icon: Clock3, title: 'La période', text: 'Une offre n’apparaît comme active que pendant ses dates.' },
              { icon: MessageCircle, title: 'Le contact', text: 'La boutique confirme disponibilité et modalités directement.' },
            ].map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-[#e8dfd2] bg-[var(--mt-gray-50)] p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e9f5ee] text-[var(--mt-green-deep)]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <h3 className="mt-3 font-display text-base font-extrabold text-[var(--mt-gray-900)]">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--mt-gray-600)]">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#eee8df]">
        <div id="parcours-commercant" className="mx-auto grid max-w-[1100px] scroll-mt-24 gap-8 px-5 py-14 sm:px-8 sm:py-18 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-xs font-bold text-[var(--mt-orange-deep)]">Et côté commerçant ?</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold leading-tight sm:text-4xl">Votre vitrine, vos échanges.</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--mt-gray-600)]">Présentez votre activité et restez en contact direct avec vos clients.</p>
            <Link to="/commercants" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--mt-green-deep)] px-5 text-sm font-bold text-white transition hover:bg-[var(--mt-green-hover)]">
              Découvrir l’espace commerçant <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to="/app" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#c8dbd0] bg-[var(--mt-surface)] px-5 text-sm font-bold text-[var(--mt-green-deep)] transition hover:bg-[#d1fae5]">
              Déjà commerçant ? Ouvrir mon espace et sa checklist <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <ol className="space-y-3">
            {shopSteps.map((step, index) => (
              <li
                key={step}
                className="flex items-start gap-4 rounded-2xl border border-[#e1d8cc] bg-[var(--mt-surface)] p-4"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#d1fae5] font-bold text-[var(--mt-green-deep)]">0{index + 1}</span>
                <span className="pt-1 text-sm leading-6 text-[#47534b]">{step}</span>
              </li>
            ))}
          </ol>
          <aside className="mt-4 rounded-2xl border border-[#ecc9ae] bg-[#fff6eb] p-4 sm:p-5">
            <p className="inline-flex items-center gap-2 text-sm font-extrabold text-[#8f351d]"><BadgePercent className="h-4 w-4" aria-hidden="true" />Mettre un produit en promotion</p>
            <p className="mt-2 text-sm leading-6 text-[#654a3b]">Depuis le catalogue, choisissez un prix inférieur au prix habituel et définissez les dates de début et de fin. L’offre n’est présentée comme active que pendant cette période.</p>
            <Link to="/app" className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#8f351d] underline decoration-[#d9a98b] underline-offset-4 hover:text-[#652612]">Ouvrir mon espace commerçant <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          </aside>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1100px] flex-col items-start justify-between gap-5 px-5 py-12 sm:flex-row sm:items-center sm:px-8 sm:py-16">
        <div>
          <p className="text-xs font-bold text-[var(--mt-orange-deep)]">À vous de jouer</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">Prêt à découvrir les commerces près de vous ?</h2>
        </div>
        <Link to="/boutiques" className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[var(--mt-orange-deep)] px-6 text-sm font-bold text-white transition hover:bg-[#a53a1d]">
          <ShoppingBag className="h-4 w-4" aria-hidden="true" /> Explorer les boutiques <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
};

export default HowItWorksPage;
