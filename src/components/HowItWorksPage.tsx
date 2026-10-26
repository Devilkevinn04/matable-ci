import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, BadgeCheck, BadgePercent, CheckCircle2, Clock3, Heart, MapPin, MessageCircle, Search, ShoppingBag, Store, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';

const tourSteps = [
  {
    label: 'Explorer',
    title: 'Le commerce local, facile à trouver',
    description: 'Cherchez une boutique, un produit ou une ville. Vous pouvez aussi partir des catégories ou des tendances pour découvrir de nouvelles adresses.',
    icon: Search,
    accent: 'bg-[#e2eee6] text-[#065f46]',
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
    accent: 'bg-[#e3f2e7] text-[#047857]',
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

const reveal = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

const HowItWorksPage: React.FC = () => {
  const reduceMotion = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);
  const [stepDirection, setStepDirection] = useState(1);
  const active = tourSteps[activeStep];
  const ActiveIcon = active.icon;

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(() => {
      setStepDirection(1);
      setActiveStep((step) => (step + 1) % tourSteps.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [activeStep, reduceMotion]);

  return (
    <main className="min-h-screen bg-[#FAF8F2] text-[#292d2a]">
      <section className="relative isolate overflow-hidden bg-[#065f46] text-white">
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
            <div className="mt-5 flex flex-col gap-2 sm:mt-7 sm:flex-row sm:items-center">
              <Link to="/boutiques" className="motion-interactive inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#f0ba80] px-5 text-sm font-extrabold text-[#292d2a] transition hover:bg-[#ffd09a]">
                Je cherche une boutique <Search className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link to="/commercants" className="motion-interactive inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/25 bg-white/[0.08] px-5 text-sm font-bold text-white transition hover:bg-white/15">
                Je suis commerçant <Store className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <a href="#visite-guidee" className="mt-3 inline-flex min-h-10 items-center text-xs font-semibold text-white/70 underline decoration-white/30 underline-offset-4 transition hover:text-white sm:text-sm">
              Voir le parcours étape par étape
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
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#c2410c]">{reduceMotion ? 'Visite guidée' : 'Visite guidée animée'}</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold leading-tight sm:text-4xl">Découvrez MaTable en quelques étapes.</h2>
          <p className="mt-3 text-sm leading-6 text-[#647067] sm:text-base">{reduceMotion ? 'Les animations sont désactivées selon votre préférence. La première étape reste affichée.' : 'Le parcours avance automatiquement et présente les étapes de la découverte au contact avec les boutiques.'}</p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[1.35fr_.85fr] lg:items-stretch">
          <div className="relative isolate min-h-[500px] overflow-hidden rounded-[30px] bg-[#082f25] p-4 text-white shadow-[0_28px_80px_rgba(8,47,37,.25)] sm:min-h-[610px] sm:p-7">
            <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 -z-10 h-80 w-80 rounded-full bg-[#0fa879]/20 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -left-20 -z-10 h-80 w-80 rounded-full bg-[#f0ba80]/10 blur-3xl" />
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#065f46]"><ShoppingBag className="h-5 w-5" aria-hidden="true" /></span>
                <span><strong className="block text-xs font-black tracking-tight text-white">MaTable<span className="text-[#f0ba80]">.ci</span></strong><span className="block text-[9px] font-medium text-white/55">Le commerce local en mouvement</span></span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-[9px] font-bold text-white/80"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#86efac]" /> VISITE EN DIRECT</span>
            </div>

            <div className="relative mx-auto mt-5 flex min-h-[388px] max-w-[560px] items-center justify-center sm:mt-7 sm:min-h-[455px]">
              <div aria-hidden="true" className="absolute inset-x-[7%] top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <motion.div
                aria-hidden="true"
                className="absolute top-[25%] h-3 w-3 rounded-full bg-[#f0ba80] shadow-[0_0_28px_8px_rgba(240,186,128,.5)]"
                animate={reduceMotion ? undefined : { left: ['12%', '84%', '12%'], y: [0, 24, 0], opacity: [0, 1, 1, 0] }}
                transition={{ duration: 4.6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.3 }}
              />
              <motion.div
                aria-hidden="true"
                className="absolute right-[9%] top-[18%] flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-[#f0ba80] backdrop-blur"
                animate={reduceMotion ? undefined : { y: [0, -12, 0], rotate: [0, 6, 0] }}
                transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                {activeStep === 0 ? <MapPin className="h-5 w-5" /> : activeStep === 1 ? <Store className="h-5 w-5" /> : activeStep === 2 ? <MessageCircle className="h-5 w-5" /> : <Truck className="h-5 w-5" />}
              </motion.div>
              <motion.div
                aria-hidden="true"
                className="absolute bottom-[13%] left-[8%] flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] text-[#f0ba80]"
                animate={reduceMotion ? undefined : { y: [0, 10, 0], x: [0, 5, 0] }}
                transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
              >
                {activeStep === 2 ? <Heart className="h-4 w-4" /> : <BadgeCheck className="h-4 w-4" />}
              </motion.div>

              <div className="relative w-[min(100%,330px)] rounded-[34px] border border-white/25 bg-[#101a17] p-2 shadow-[0_28px_70px_rgba(0,0,0,.45)] sm:w-[310px]">
                <div className="absolute left-1/2 top-2 z-20 h-4 w-20 -translate-x-1/2 rounded-full bg-[#101a17]" />
                <div className="overflow-hidden rounded-[27px] bg-[#f8f6f0] text-[#292d2a]">
                  <div className="flex h-9 items-center justify-between px-4 pt-1 text-[9px] font-bold text-[#52615a]"><span>9:41</span><span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm border border-[#52615a]" /><span className="h-2 w-2 rounded-full bg-[#52615a]" /></span></div>
                  <div className="flex items-center justify-between border-b border-[#e9e3d9] bg-white px-4 py-2.5">
                    <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e9f5ee] text-[#065f46]"><ShoppingBag className="h-4 w-4" aria-hidden="true" /></span><strong className="text-xs">MaTable<span className="text-[#047857]">.ci</span></strong></div>
                    <span className="rounded-full bg-[#f4f1eb] px-2.5 py-1 text-[8px] font-bold text-[#647067]">Abidjan</span>
                  </div>

                  <div className="relative grid min-h-[315px] overflow-hidden px-4 py-4 sm:min-h-[350px]">
                    <AnimatePresence initial={false}>
                      <motion.div
                        key={activeStep}
                        initial={reduceMotion ? false : { opacity: 0, x: stepDirection * 36, scale: 0.97 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={reduceMotion ? undefined : { opacity: 0, x: stepDirection * -28, scale: 0.98 }}
                        transition={{ duration: reduceMotion ? 0 : 0.48, ease: [0.22, 1, 0.36, 1] }}
                        className="col-start-1 row-start-1 min-h-[280px]"
                      >
                        {activeStep === 0 && (
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[.15em] text-[#a85b38]">Tout près, tout simplement</p>
                            <h3 className="mt-2 font-display text-[22px] font-black leading-[1.05] tracking-tight">La bonne adresse<br />est à deux pas.</h3>
                            <motion.div className="mt-4 flex min-h-11 items-center gap-2 rounded-xl border border-[#b9d5ca] bg-white px-3 shadow-[0_8px_20px_rgba(6,95,70,.12)]" animate={reduceMotion ? undefined : { boxShadow: ['0 4px 12px rgba(6,95,70,.08)', '0 8px 24px rgba(6,95,70,.2)', '0 4px 12px rgba(6,95,70,.08)'] }} transition={{ duration: 2.5, repeat: Infinity }}>
                              <Search className="h-4 w-4 text-[#047857]" aria-hidden="true" /><span className="text-[10px] font-semibold text-[#47534b]">Artisanat à Abidjan</span><span className="h-3.5 w-px animate-pulse bg-[#c2410c]" />
                            </motion.div>
                            <div className="mt-3 flex gap-1.5">{['Mode', 'Cuisine', 'Déco'].map((tag, index) => <motion.span key={tag} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : 0.18 + index * 0.1 }} className="rounded-full bg-[#e9f5ee] px-2.5 py-1 text-[8px] font-bold text-[#065f46]">{tag}</motion.span>)}</div>
                            <motion.div initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : 0.34 }} className="mt-5 flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-sm">
                              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[#f0ba80] via-[#edd8b9] to-[#bfd9c9] text-[#6a4b32]"><MapPin className="h-6 w-6" aria-hidden="true" /></div>
                              <div><span className="text-[8px] font-bold uppercase tracking-wide text-[#a85b38]">Une adresse vous attend</span><strong className="mt-0.5 block text-xs">Atelier Naya</strong><span className="mt-0.5 flex items-center gap-1 text-[9px] text-[#647067]"><MapPin className="h-3 w-3" /> Cocody · Abidjan</span></div>
                              <ArrowRight className="ml-auto h-4 w-4 text-[#047857]" aria-hidden="true" />
                            </motion.div>
                            <div className="mt-3 flex items-center gap-2 text-[9px] font-semibold text-[#647067]"><span className="h-1.5 w-1.5 rounded-full bg-[#c2410c]" />Boutiques, produits et quartiers</div>
                          </div>
                        )}

                        {activeStep === 1 && (
                          <div>
                            <div className="relative flex h-[104px] items-end overflow-hidden rounded-2xl bg-gradient-to-br from-[#c8a783] via-[#eed6b4] to-[#b8d2bd] p-3">
                              <span className="absolute -right-5 -top-9 h-32 w-32 rounded-full border-[14px] border-white/25" />
                              <motion.span className="absolute right-7 top-5 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/75 text-[#065f46] shadow" animate={reduceMotion ? undefined : { rotate: [0, 8, -5, 0], y: [0, -5, 0] }} transition={{ duration: 3, repeat: Infinity }}><Store className="h-5 w-5" aria-hidden="true" /></motion.span>
                              <span className="relative rounded-full bg-white/90 px-2.5 py-1 text-[8px] font-black uppercase tracking-wide text-[#065f46]">Vitrine locale</span>
                            </div>
                            <div className="mt-3 flex items-center gap-2.5">
                              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#065f46] font-display text-sm font-black text-white">AN</span>
                              <div className="min-w-0 flex-1"><strong className="block truncate text-sm">Atelier Naya</strong><span className="mt-0.5 flex items-center gap-1 text-[9px] text-[#647067]"><MapPin className="h-3 w-3" /> Cocody · Abidjan</span></div>
                              <span className="rounded-full bg-[#e9f5ee] px-2 py-1 text-[8px] font-bold text-[#065f46]">Ouvert</span>
                            </div>
                            <div className="mt-3 flex items-center justify-between"><span className="text-[9px] font-black uppercase tracking-wide text-[#647067]">La vitrine du moment</span><span className="text-[8px] font-bold text-[#047857]">Tout voir →</span></div>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              {[['Sac tissé', '18 500 FCFA'], ['Pochette bogolan', '9 000 FCFA']].map(([name, price], index) => <motion.div key={name} initial={reduceMotion ? false : { opacity: 0, y: 14, rotate: index ? 2 : -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: reduceMotion ? 0 : 0.18 + index * 0.12 }} className="overflow-hidden rounded-xl border border-[#ebe4da] bg-white p-2">
                                <div className={`flex h-[62px] items-center justify-center rounded-lg ${index ? 'bg-gradient-to-br from-[#d4b68e] to-[#f2e2c7]' : 'bg-gradient-to-br from-[#93b6a2] to-[#e5c5a2]'}`}><ShoppingBag className="h-6 w-6 text-[#065f46]" aria-hidden="true" /></div>
                                <strong className="mt-1.5 block truncate text-[9px]">{name}</strong><span className="text-[8px] font-bold text-[#647067]">{price}</span>
                              </motion.div>)}
                            </div>
                            <motion.div initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: reduceMotion ? 0 : 0.4 }} className="mt-2 flex items-center gap-2 rounded-xl bg-[#e9f5ee] px-3 py-2 text-[9px] font-bold text-[#065f46]"><BadgeCheck className="h-4 w-4" />Une boutique, son histoire, ses produits</motion.div>
                          </div>
                        )}

                        {activeStep === 2 && (
                          <div>
                            <div className="flex items-center gap-2 border-b border-[#e9e3d9] pb-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#d9e9dc] text-[#065f46]"><Store className="h-4 w-4" aria-hidden="true" /></span>
                              <div><strong className="block text-[11px]">Atelier Naya</strong><span className="flex items-center gap-1 text-[8px] font-semibold text-[#047857]"><span className="h-1.5 w-1.5 rounded-full bg-[#059669]" />Échange direct</span></div>
                              <MessageCircle className="ml-auto h-4 w-4 text-[#047857]" aria-hidden="true" />
                            </div>
                            <p className="mt-3 text-center text-[8px] font-semibold uppercase tracking-wide text-[#8a8176]">Aujourd’hui · discussion boutique</p>
                            <motion.div initial={reduceMotion ? false : { opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduceMotion ? 0 : 0.12 }} className="mt-3 max-w-[82%] rounded-2xl rounded-tl-sm bg-white p-3 shadow-sm">
                              <p className="text-[9px] leading-4 text-[#47534b]">Bonjour, je voudrais en savoir plus sur vos créations.</p><span className="mt-1 block text-right text-[7px] text-[#8a8176]">10:42</span>
                            </motion.div>
                            <motion.div initial={reduceMotion ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduceMotion ? 0 : 0.55 }} className="ml-auto mt-2 max-w-[86%] rounded-2xl rounded-tr-sm bg-[#dff1e4] p-3 shadow-sm">
                              <p className="text-[9px] leading-4 text-[#315548]">Bonjour 👋 Posez vos questions directement à la boutique.</p><span className="mt-1 block text-right text-[7px] text-[#647067]">10:43 · Envoyé</span>
                            </motion.div>
                            <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : 0.9 }} className="mt-4 flex min-h-10 items-center gap-2 rounded-full border border-[#e4ded4] bg-white px-3">
                              <span className="flex-1 text-[9px] text-[#8a8176]">Votre message…</span><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#047857] text-white"><ArrowRight className="h-3.5 w-3.5" /></span>
                            </motion.div>
                            <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#cfe3d5] bg-[#e9f5ee] px-3 py-2 text-[9px] font-semibold text-[#315548]"><Heart className="h-3.5 w-3.5 shrink-0 text-[#047857]" />Une question ? Le commerçant vous répond en direct.</div>
                          </div>
                        )}

                        {activeStep === 3 && (
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[.15em] text-[#a85b38]">La suite, à votre rythme</p>
                            <h3 className="mt-2 font-display text-[22px] font-black leading-[1.05] tracking-tight">Vous convenez<br />ensemble.</h3>
                            <p className="mt-2 text-[9px] leading-4 text-[#647067]">Le commerçant garde la main sur le paiement, le retrait et la livraison.</p>
                            <div className="mt-4 space-y-2">
                              {[{ icon: MessageCircle, title: 'Vous échangez', text: 'Disponibilité et détails du produit' }, { icon: ShoppingBag, title: 'Vous choisissez', text: 'Retrait ou livraison, selon la boutique' }, { icon: CheckCircle2, title: 'Vous confirmez', text: 'Les modalités directement ensemble' }].map(({ icon: Icon, title, text }, index) => <motion.div key={title} initial={reduceMotion ? false : { opacity: 0, x: index % 2 ? 18 : -18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduceMotion ? 0 : 0.13 + index * 0.16 }} className="flex items-center gap-3 rounded-xl border border-[#e9e3d9] bg-white p-2.5 shadow-[0_3px_12px_rgba(20,40,30,.04)]">
                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${index === 2 ? 'bg-[#065f46] text-white' : 'bg-[#e9f5ee] text-[#065f46]'}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
                                <span><strong className="block text-[10px]">{title}</strong><span className="mt-0.5 block text-[8px] text-[#647067]">{text}</span></span>
                                {index < 2 && <ArrowRight className="ml-auto h-3.5 w-3.5 text-[#a8b8ad]" aria-hidden="true" />}
                              </motion.div>)}
                            </div>
                            <motion.div initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: reduceMotion ? 0 : 0.6 }} className="mt-3 rounded-xl bg-[#065f46] px-3 py-2.5 text-center text-[9px] font-bold text-white">MaTable rapproche. Vous décidez.</motion.div>
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <div className="flex items-center justify-between border-t border-[#e9e3d9] bg-white px-4 py-2.5"><span className="text-[8px] font-semibold text-[#8a8176]">Votre prochaine belle adresse</span><span className="flex items-center gap-1 text-[8px] font-black text-[#047857]">MATABLE.CI <ArrowRight className="h-3 w-3" /></span></div>
                </div>
                <span className="absolute bottom-1 left-1/2 h-1 w-16 -translate-x-1/2 rounded-full bg-white/70" />
              </div>

              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={`float-${activeStep}`} initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8, scale: 0.96 }} transition={{ duration: reduceMotion ? 0 : 0.3 }} className="absolute bottom-[8%] right-[1%] z-10 hidden max-w-[175px] rounded-2xl border border-white/15 bg-[#16483a]/95 p-3 shadow-xl backdrop-blur sm:block">
                  <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wide text-[#f0ba80]">{activeStep === 0 ? <MapPin className="h-3.5 w-3.5" /> : activeStep === 1 ? <Store className="h-3.5 w-3.5" /> : activeStep === 2 ? <MessageCircle className="h-3.5 w-3.5" /> : <Truck className="h-3.5 w-3.5" />}{active.label}</span>
                  <span className="mt-1 block text-[10px] font-semibold leading-4 text-white">{activeStep === 0 ? 'Une recherche, de nouvelles adresses.' : activeStep === 1 ? 'Entrez dans l’univers des boutiques.' : activeStep === 2 ? 'Le contact se fait en direct.' : 'Les modalités se décident ensemble.'}</span>
                </motion.div>
              </AnimatePresence>
            </div>

            <ol className="relative z-10 grid list-none grid-cols-4 gap-1.5 p-0 sm:gap-2" aria-label="Étapes de la visite guidée">
              {tourSteps.map(({ label, icon: Icon }, index) => (
                <li key={label} aria-current={activeStep === index ? 'step' : undefined} className={`flex min-h-[54px] items-center justify-center gap-1.5 overflow-hidden rounded-xl border px-1.5 text-[9px] font-bold sm:min-h-12 sm:gap-2 sm:px-3 sm:text-[10px] ${activeStep === index ? 'border-[#f0ba80]/60 bg-[#f0ba80] text-[#292d2a] shadow-[0_8px_24px_rgba(240,186,128,.15)]' : 'border-white/10 bg-white/[0.06] text-white/65'}`}>
                  <Icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden="true" /><span className="truncate">{label}</span>
                </li>
              ))}
            </ol>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2" aria-label={`Étape ${activeStep + 1} sur ${tourSteps.length}`}>
                <span className="text-[8px] font-bold tabular-nums text-white/50">0{activeStep + 1}</span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
                  <motion.span className="block h-full origin-left rounded-full bg-[#f0ba80]" animate={{ scaleX: (activeStep + 1) / tourSteps.length }} transition={{ duration: reduceMotion ? 0 : 0.45, ease: 'easeOut' }} />
                </div>
                <span className="text-[8px] font-bold text-white/50">04</span>
              </div>
              {!reduceMotion && <span className="text-[9px] font-semibold text-white/60">Progression automatique</span>}
            </div>
          </div>

          <div className="relative flex flex-col rounded-[28px] border border-[#e5d9ca] bg-[#FFFFFF] p-5 shadow-[0_12px_35px_rgba(36,28,22,.06)] sm:p-7" aria-live="off" aria-atomic="true">
            <span aria-hidden="true" className="absolute -left-2 top-12 hidden h-4 w-4 rotate-45 border-b border-l border-[#e5d9ca] bg-[#FFFFFF] lg:block" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#c2410c]">
                {reduceMotion ? 'Visite sans animation · ' : 'Visite automatique · '}{active.label}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold tabular-nums text-[#8a8176]">0{activeStep + 1} / 04</span>
              </div>
            </div>
            <ol className="mt-4 flex list-none gap-2 p-0" aria-label="Progression de la visite guidée">
              {tourSteps.map(({ label }, index) => (
                <li key={label} aria-current={activeStep === index ? 'step' : undefined} aria-label={`Étape ${index + 1} : ${label}`} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[#e9e1d7]">
                  {activeStep === index && !reduceMotion && <motion.span key={activeStep} className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-[#c2410c]" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 5.2, ease: 'linear' }} />}
                  {activeStep === index && reduceMotion && <span className="absolute inset-0 rounded-full bg-[#c2410c]" />}
                </li>
              ))}
            </ol>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeStep}
                initial={reduceMotion ? false : { opacity: 0, x: stepDirection * 14, y: 8 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: stepDirection * -10, y: -6 }}
                transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="my-auto py-8"
              >
                <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${active.accent}`}><ActiveIcon className="h-6 w-6" aria-hidden="true" /></span>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-[#8a8176]">Étape 0{activeStep + 1} · {active.label}</p>
                <h3 className="mt-2 font-display text-2xl font-extrabold leading-tight sm:text-3xl">{active.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#647067]">{active.description}</p>
                <div className="mt-5 rounded-2xl border border-[#e7ddd0] bg-[#FAF8F2] p-4">
                  <p className="text-xs font-bold text-[#47534b]">L’esprit MaTable.ci</p>
                  <p className="mt-1 text-xs leading-5 text-[#647067]">Découvrir le commerce local, rapprocher les personnes et laisser les commerçants maîtres de leurs échanges.</p>
                </div>
              </motion.div>
            </AnimatePresence>
            <div className="border-t border-[#eee6dd] pt-4 text-xs font-semibold text-[#647067]">
              {reduceMotion ? 'La visite est présentée sans animation.' : 'Les étapes défilent automatiquement.'}
            </div>
          </div>
        </div>
      </section>

      <section id="promotions" className="border-y border-[#e8dfd2] bg-white">
        <div className="mx-auto grid max-w-[1184px] gap-7 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#c2410c]"><BadgePercent className="h-4 w-4" aria-hidden="true" /> Les promotions MaTable</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold leading-tight sm:text-4xl">Un prix réduit doit rester lisible.</h2>
            <p className="mt-3 text-sm leading-6 text-[#647067]">Les offres affichées ici sont des promotions produits réellement actives, renseignées par les boutiques avec un prix et une période de validité.</p>
            <Link to="/promotions" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#c2410c] px-5 text-sm font-bold text-white transition hover:bg-[#a53a1d]">
              Voir les offres actives <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: BadgePercent, title: 'Le prix', text: 'Le prix habituel et le prix réduit sont visibles ensemble.' },
              { icon: Clock3, title: 'La période', text: 'Une offre n’apparaît comme active que pendant ses dates.' },
              { icon: MessageCircle, title: 'Le contact', text: 'La boutique confirme disponibilité et modalités directement.' },
            ].map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-[#e8dfd2] bg-[#FAF8F2] p-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e9f5ee] text-[#065f46]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <h3 className="mt-3 font-display text-base font-extrabold text-[#292d2a]">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-[#647067]">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#eee8df]">
        <div id="parcours-commercant" className="mx-auto grid max-w-[1100px] scroll-mt-24 gap-8 px-5 py-14 sm:px-8 sm:py-18 lg:grid-cols-[.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#c2410c]">Et côté commerçant ?</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold leading-tight sm:text-4xl">Votre vitrine, vos échanges.</h2>
            <p className="mt-3 text-sm leading-6 text-[#647067]">Présentez votre activité et restez en contact direct avec vos clients.</p>
            <Link to="/commercants" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#065f46] px-5 text-sm font-bold text-white transition hover:bg-[#047857]">
              Découvrir l’espace commerçant <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to="/app" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#c8dbd0] bg-[#FFFFFF] px-5 text-sm font-bold text-[#065f46] transition hover:bg-[#d1fae5]">
              Déjà commerçant ? Ouvrir mon espace et sa checklist <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
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
                className="flex items-start gap-4 rounded-2xl border border-[#e1d8cc] bg-[#FFFFFF] p-4"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#d1fae5] font-bold text-[#065f46]">0{index + 1}</span>
                <span className="pt-1 text-sm leading-6 text-[#47534b]">{step}</span>
              </motion.li>
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
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#c2410c]">À vous de jouer</p>
          <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">Prêt à découvrir les commerces près de vous ?</h2>
        </div>
        <Link to="/boutiques" className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-[#c2410c] px-6 text-sm font-bold text-white transition hover:bg-[#a53a1d]">
          <ShoppingBag className="h-4 w-4" aria-hidden="true" /> Explorer les boutiques <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
};

export default HowItWorksPage;
