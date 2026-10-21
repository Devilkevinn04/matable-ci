import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowDown, ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, Heart, MapPin, MessageCircle, Search, ShoppingBag, Store, Truck } from 'lucide-react';

const tourSteps = [
  {
    label: 'Explorer',
    title: 'Le commerce local, facile à trouver',
    description: 'Cherchez une boutique, un produit ou une ville. Vous pouvez aussi partir des catégories ou des tendances pour découvrir de nouvelles adresses.',
    icon: Search,
    accent: 'bg-[#e2eee6] text-[#0f4d3d]',
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
    accent: 'bg-[#e3f2e7] text-[#176b55]',
  },
  {
    label: 'Convenir',
    title: 'Vous vous mettez d’accord ensemble',
    description: 'Le paiement, le retrait ou la livraison se décident directement avec le vendeur. MaTable facilite la rencontre, le commerçant garde la main.',
    icon: Truck,
    accent: 'bg-[#f3e6c9] text-[#805516]',
  },
];

const shopSteps = [
  'Créez la boutique avec son nom, son numéro WhatsApp, sa commune et sa catégorie. Gardez le PIN choisi pour vous reconnecter.',
  'Complétez la vitrine : coordonnées, horaires, présentation et identité visuelle.',
  'Ajoutez vos produits, leurs prix, leur disponibilité et des photos à jour.',
  'Soumettez la vérification d’identité du responsable. Elle est nécessaire avant la publication.',
  'Choisissez une formule et réglez-la avec GeniusPay. Aucun prélèvement automatique n’est effectué.',
  'Publiez la boutique après les étapes requises, puis gérez les demandes des clients depuis votre espace et échangez avec eux sur WhatsApp.',
];

const hotspotPositions: React.CSSProperties[] = [
  { left: '19%', top: '39%' },
  { right: '14%', top: '61%' },
  { right: '13%', bottom: '12%' },
  { left: '18%', bottom: '32%' },
];

const reveal = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const HowItWorksPage: React.FC = () => {
  const reduceMotion = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);
  const active = tourSteps[activeStep];
  const ActiveIcon = active.icon;
  const selectStep = (nextStep: number) => setActiveStep((nextStep + tourSteps.length) % tourSteps.length);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveStep((step) => (step + 1) % tourSteps.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f3ee] text-[#25231f]">
      <section className="relative isolate overflow-hidden bg-[#123b31] text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-40 -z-10 h-[520px] w-[520px] rounded-full border border-white/10 sm:right-[10%] sm:top-[-320px] sm:h-[800px] sm:w-[800px]" />
        <div className="mx-auto max-w-[1184px] px-5 pb-7 pt-5 sm:px-8 sm:pb-12 sm:pt-8">
          <motion.div
            initial={reduceMotion ? false : 'hidden'}
            animate="visible"
            variants={reveal}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="max-w-3xl"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#f0ba80] sm:text-sm">La vision MaTable.ci</p>
            <h1 className="mt-3 font-display text-3xl font-extrabold leading-[1.04] tracking-[-0.045em] sm:mt-4 sm:text-6xl">
              Le commerce local, <span className="text-[#f0ba80]">plus proche.</span>
            </h1>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-[#e0ebe5] sm:mt-5 sm:text-lg sm:leading-7">
              Découvrez les commerces ivoiriens et échangez directement avec eux.
            </p>
            <a href="#visite-guidee" className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-full bg-[#f0ba80] px-4 text-xs font-bold text-[#25231f] transition hover:bg-[#ffd09a] sm:mt-7 sm:min-h-12 sm:px-5 sm:text-sm">
              Visiter la plateforme <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </a>
          </motion.div>
          <div className="mt-5 flex snap-x gap-2 overflow-x-auto pb-1 sm:mt-9 sm:grid sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:pb-0" aria-label="Les principes de MaTable.ci">
            {[
              { icon: Heart, title: 'Mettre en lumière', text: 'Les commerces de proximité' },
              { icon: MessageCircle, title: 'Créer le lien', text: 'Client et commerçant en direct' },
              { icon: BadgeCheck, title: 'Laisser le choix', text: 'À ceux qui font le commerce' },
            ].map(({ icon: Icon, title, text }, index) => (
              <motion.div
                key={title}
                initial={reduceMotion ? false : 'hidden'}
                whileInView="visible"
                viewport={{ once: true, amount: 0.4 }}
                variants={reveal}
                transition={{ duration: 0.4, delay: reduceMotion ? 0 : index * 0.08 }}
                className="flex min-w-[190px] snap-start items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] p-2.5 sm:min-w-0 sm:gap-3 sm:p-4"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[#f0ba80] sm:h-10 sm:w-10 sm:rounded-xl"><Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" /></span>
                <span className="min-w-0"><strong className="block whitespace-nowrap text-[11px] sm:text-sm">{title}</strong><span className="block truncate text-[9px] text-white/65 sm:text-xs">{text}</span></span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="visite-guidee" className="mx-auto max-w-[1184px] px-5 py-14 sm:px-8 sm:py-20">
        <header className="mb-8 max-w-2xl sm:mb-10">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#b9441f]">Visite guidée animée</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold leading-tight sm:text-4xl">Découvrez MaTable en quelques étapes.</h2>
          <p className="mt-3 text-sm leading-6 text-[#6f6a61] sm:text-base">La visite avance automatiquement. Vous pouvez aussi choisir un repère pour explorer une étape.</p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1.35fr_.85fr] lg:items-stretch">
          <div
            className="relative overflow-hidden rounded-[28px] border border-[#ded6ca] bg-[#ece6dc] p-3 shadow-[0_18px_50px_rgba(36,28,22,.1)] sm:p-5"
          >
            <div className="overflow-hidden rounded-[20px] border border-[#e6dfd5] bg-[#fffdf9]">
              <div className="flex h-11 items-center gap-1.5 border-b border-[#eee7de] bg-white px-4">
                <span className="h-2.5 w-2.5 rounded-full bg-[#d98473]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#edc879]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#91b99e]" />
                <div className="ml-3 flex h-6 min-w-0 flex-1 items-center rounded-md bg-[#f5f1eb] px-2 text-[10px] text-[#8a8176]">matable.ci · commerces locaux</div>
              </div>
              <div className="bg-[#f8f6f0] p-4 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0f4d3d] text-xs font-black text-white">M</span>
                    <span className="font-display text-sm font-extrabold">MaTable<span className="text-[#176b55]">.ci</span></span>
                  </div>
                  <span className="rounded-full border border-[#e5d9ca] bg-white px-3 py-1.5 text-[10px] font-bold text-[#31584c]">Boutiques locales</span>
                </div>
                <div className="mt-5 rounded-2xl bg-[#123b31] p-4 text-white sm:p-5">
                  <p className="text-[9px] font-bold uppercase tracking-[.14em] text-[#f0ba80]">Près de vous · Côte d’Ivoire</p>
                  <p className="mt-1 font-display text-lg font-extrabold leading-tight sm:text-2xl">Les belles trouvailles sont ici.</p>
                  <div className={`mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] text-[#81796f] shadow-sm transition-all duration-500 ${activeStep === 0 ? 'border-[#b9441f] bg-white ring-4 ring-[#b9441f]/15' : 'border-transparent bg-white'}`}>
                    <Search className="h-3.5 w-3.5 shrink-0" /> Boutique, produit ou quartier…
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    {['Mode', 'Cuisine', 'Beauté'].map((category) => <span key={category} className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[9px] font-semibold text-white/90">{category}</span>)}
                  </div>
                </div>
                <div className={`mt-4 flex items-center justify-between rounded-xl transition-all duration-500 ${activeStep === 1 ? 'bg-[#f0ba80]/25 p-2 ring-2 ring-[#b9441f]/20' : 'p-2'}`}>
                  <div><p className="text-[9px] font-bold uppercase tracking-[.12em] text-[#b9441f]">Une adresse à découvrir</p><p className="mt-0.5 font-display text-sm font-bold">Aya Chic · Abidjan</p></div>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e4f1ec] text-[#0f4d3d]"><MapPin className="h-4 w-4" /></span>
                </div>
                <div className={`mt-3 grid grid-cols-2 gap-2 rounded-xl transition-all duration-500 ${activeStep === 1 ? 'ring-2 ring-[#b9441f]/35 ring-offset-2' : ''}`}>
                  <div className="rounded-xl border border-[#ebe4da] bg-white p-2">
                    <div className="flex h-16 items-center justify-center rounded-lg bg-gradient-to-br from-[#efc4b2] to-[#e7e2d8]"><ShoppingBag className="h-6 w-6 text-[#855b4c]" /></div>
                    <p className="mt-2 text-[10px] font-bold">Nuisette satin</p><p className="text-[9px] text-[#6f6a61]">12 000 FCFA</p>
                  </div>
                  <div className="rounded-xl border border-[#ebe4da] bg-white p-2">
                    <div className="flex h-16 items-center justify-center rounded-lg bg-gradient-to-br from-[#d9e8da] to-[#e9d7c5]"><Heart className="h-6 w-6 text-[#176b55]" /></div>
                    <p className="mt-2 text-[10px] font-bold">Sélection locale</p><p className="text-[9px] text-[#6f6a61]">Voir la vitrine</p>
                  </div>
                </div>
                <div className={`mt-3 flex items-center justify-between rounded-xl px-3 py-2 transition-all duration-500 ${activeStep === 2 ? 'bg-[#d1ead9] shadow-[0_0_0_4px_rgba(23,107,85,.12)]' : 'bg-[#e4f1ec]'}`}>
                  <span className="text-[10px] font-bold text-[#31584c]">Une question ? Échangez avec la boutique.</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#176b55] text-white"><MessageCircle className="h-3.5 w-3.5" /></span>
                </div>
              </div>
            </div>

            {tourSteps.map(({ label, icon: Icon }, index) => (
              <button
                key={label}
                type="button"
                onClick={() => selectStep(index)}
                aria-label={`Étape ${index + 1} : ${label}`}
                aria-pressed={activeStep === index}
                style={hotspotPositions[index]}
                className={`absolute z-10 flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-white shadow-lg transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b9441f] focus-visible:ring-offset-2 ${activeStep === index ? 'scale-110 bg-[#b9441f] text-white ring-4 ring-[#b9441f]/20' : 'bg-[#123b31] text-white'}`}
              >
                <motion.span
                  className="absolute inset-0 rounded-full border-2 border-[#b9441f]"
                  animate={activeStep === index && !reduceMotion ? { scale: [1, 1.8], opacity: [0.7, 0] } : { scale: 1, opacity: 0 }}
                  transition={activeStep === index && !reduceMotion ? { duration: 1.35, repeat: Infinity, ease: 'easeOut' } : { duration: 0.2 }}
                  aria-hidden="true"
                />
                <Icon className="relative h-4 w-4" aria-hidden="true" />
              </button>
            ))}
            <span className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 rounded-full bg-[#25231f]/80 px-3 py-1.5 text-[10px] font-semibold text-white sm:block">Sélectionnez un repère</span>
          </div>

          <div className="relative flex flex-col rounded-[28px] border border-[#e5d9ca] bg-[#fffdf9] p-5 shadow-[0_12px_35px_rgba(36,28,22,.06)] sm:p-7" aria-live="off" aria-atomic="true">
            <span aria-hidden="true" className="absolute -left-2 top-12 hidden h-4 w-4 rotate-45 border-b border-l border-[#e5d9ca] bg-[#fffdf9] lg:block" />
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#b9441f]">
                Visite automatique · {active.label}
              </p>
              <span className="text-xs font-bold tabular-nums text-[#8a8176]">0{activeStep + 1} / 04</span>
            </div>
            <div className="mt-4 flex gap-2" role="group" aria-label="Choisir une étape">
              {tourSteps.map(({ label }, index) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => selectStep(index)}
                  aria-label={`Afficher l’étape ${index + 1} : ${label}`}
                  aria-pressed={activeStep === index}
                  className={`relative h-1.5 flex-1 overflow-hidden rounded-full ${activeStep === index ? 'bg-[#e9e1d7]' : 'bg-[#e9e1d7] hover:bg-[#c8b9a8]'}`}
                >
                  {activeStep === index && <motion.span
                    key={activeStep}
                    className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-[#b9441f]"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: reduceMotion ? 0 : 5.2, ease: 'linear' }}
                  />}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeStep}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: reduceMotion ? 0 : 0.22 }}
                className="my-auto py-8"
              >
                <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${active.accent}`}><ActiveIcon className="h-6 w-6" aria-hidden="true" /></span>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-[#8a8176]">Étape 0{activeStep + 1} · {active.label}</p>
                <h3 className="mt-2 font-display text-2xl font-extrabold leading-tight sm:text-3xl">{active.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#6f6a61]">{active.description}</p>
                <div className="mt-5 rounded-2xl border border-[#e7ddd0] bg-[#f7f3ee] p-4">
                  <p className="text-xs font-bold text-[#31584c]">L’esprit MaTable.ci</p>
                  <p className="mt-1 text-xs leading-5 text-[#6f6a61]">Découvrir le commerce local, rapprocher les personnes et laisser les commerçants maîtres de leurs échanges.</p>
                </div>
              </motion.div>
            </AnimatePresence>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eee6dd] pt-4">
              <button type="button" onClick={() => selectStep(activeStep - 1)} className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-bold text-[#4a3a30] transition hover:bg-[#f5f0e9]">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Précédent
              </button>
              {activeStep < tourSteps.length - 1
                ? <button type="button" onClick={() => selectStep(activeStep + 1)} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#0f4d3d] px-4 text-sm font-bold text-white transition hover:bg-[#176b55]">Suivant <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
                : <a href="/boutiques" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#b9441f] px-4 text-sm font-bold text-white transition hover:bg-[#a53a1d]">Découvrir <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#eee8df]">
        <div className="mx-auto grid max-w-[1100px] gap-8 px-5 py-14 sm:px-8 sm:py-18 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#b9441f]">Et côté commerçant ?</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold leading-tight sm:text-4xl">Votre vitrine, vos échanges.</h2>
            <p className="mt-3 text-sm leading-6 text-[#6f6a61]">Présentez votre activité et restez en contact direct avec vos clients.</p>
            <a href="/app/creer-boutique" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#0f4d3d] px-5 text-sm font-bold text-white transition hover:bg-[#176b55]">
              Créer ma boutique <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <ol className="space-y-3">
            {shopSteps.map((step, index) => (
              <motion.li
                key={step}
                initial={reduceMotion ? false : 'hidden'}
                whileInView="visible"
                viewport={{ once: true, amount: 0.35 }}
                variants={reveal}
                transition={{ duration: 0.4, delay: reduceMotion ? 0 : index * 0.08 }}
                className="flex items-start gap-4 rounded-2xl border border-[#e1d8cc] bg-[#fffdf9] p-4"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e4f1ec] font-bold text-[#0f4d3d]">0{index + 1}</span>
                <span className="pt-1 text-sm leading-6 text-[#4a3a30]">{step}</span>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto flex max-w-[1100px] flex-col items-start justify-between gap-5 px-5 py-12 sm:flex-row sm:items-center sm:px-8 sm:py-16">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#b9441f]">À vous de jouer</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">Prêt à découvrir les commerces près de vous ?</h2>
        </div>
        <a href="/boutiques" className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[#b9441f] px-6 text-sm font-bold text-white transition hover:bg-[#a53a1d]">
          <ShoppingBag className="h-4 w-4" aria-hidden="true" /> Explorer les boutiques <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </section>
    </main>
  );
};

export default HowItWorksPage;
