import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, MapPin, MessageCircle, ShoppingBag } from 'lucide-react';
import { CategoryProductImage } from './CategoryProductImage';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { formatFCFA } from '../utils/format';

interface OrderStoryProps {
  title: string;
  price: number;
  imageUrl: string;
  category?: string;
  shopName: string;
}

const steps = [
  { icon: ShoppingBag, title: 'Choisissez', text: 'De vraies photos, de vrais prix. Vous pouvez commander sans compte.' },
  { icon: CheckCircle2, title: 'Envoyez votre demande', text: 'Vos articles sont réservés 2 h, le temps que la boutique accepte.' },
  { icon: MessageCircle, title: 'La boutique vous répond', text: 'Vous convenez ensemble de la remise et du règlement sur WhatsApp. Rien à payer sur MaTable.' },
];

const bubble = 'max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-5';

/**
 * « Comment commander », en trois temps. Sur grand écran, la séquence suit le défilement ;
 * ailleurs, avec le mouvement réduit ou sans GSAP, les trois étapes sont affichées d’un coup.
 */
export const OrderStory: React.FC<OrderStoryProps> = ({ title, price, imageUrl, category, shopName }) => {
  const canPlay = useMediaQuery('(min-width: 1024px) and (min-height: 640px) and (prefers-reduced-motion: no-preference)');
  const [hasFailed, setHasFailed] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const section = useRef<HTMLElement>(null);
  const isStaged = canPlay && !hasFailed;

  useEffect(() => {
    const element = section.current;
    if (!isStaged || !element) return;
    let isCurrent = true;
    let stop: (() => void) | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      import('../utils/orderStoryTimeline')
        .then(({ startOrderStory }) => { if (isCurrent) stop = startOrderStory(element, setActiveStep); })
        .catch(() => { if (isCurrent) setHasFailed(true); });
    }, { rootMargin: '100% 0px' });
    observer.observe(element);
    return () => {
      isCurrent = false;
      observer.disconnect();
      stop?.();
      setActiveStep(0);
    };
  }, [isStaged]);

  const heading = <h2 id="home-story-title" className="font-display text-2xl font-extrabold tracking-[-.04em] sm:text-4xl">Commander, en trois gestes</h2>;

  if (!isStaged) {
    return (
      <section aria-labelledby="home-story-title" className="mx-auto max-w-[1280px] px-4 pt-8 sm:px-10 sm:pt-16">
        {heading}
        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {steps.map(({ icon: Icon, title: stepTitle, text }, index) => (
            <li key={stepTitle} className="rounded-3xl border border-[#e7e2d9] bg-white p-5">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--mt-green-deep)] text-white"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <strong className="mt-4 block font-display text-lg font-extrabold text-[#173c32]">{index + 1}. {stepTitle}</strong>
              <p className="mt-1 text-sm leading-6 text-[var(--mt-gray-600)]">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  const screen = 'absolute inset-0 flex flex-col p-4';
  return (
    <section ref={section} aria-labelledby="home-story-title" className="relative h-[185vh]">
      {/* 4,75 rem : hauteur de l’en-tête fixe. */}
      <div className="sticky top-0 grid h-screen place-items-center pt-[4.75rem]">
        <div className="mx-auto grid w-full max-w-[1280px] grid-cols-[1.1fr_1fr] items-center gap-10 px-10">
          <div>
            {heading}
            <div className="relative mt-8 pl-8">
              <span aria-hidden="true" className="absolute bottom-2 left-0 top-2 w-1 rounded-full bg-[#dfe8e2]" />
              <span aria-hidden="true" data-story-rail className="absolute bottom-2 left-0 top-2 w-1 origin-top rounded-full bg-[var(--mt-green-primary)] [transform:scaleY(.333)]" />
              <ol className="space-y-7">
                {steps.map(({ icon: Icon, title: stepTitle, text }, index) => (
                  <li key={stepTitle} aria-current={activeStep === index ? 'step' : undefined} className="flex gap-4">
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-colors duration-[var(--mt-motion-standard)] ${activeStep === index ? 'bg-[var(--mt-green-deep)] text-white' : 'bg-[#e6efe9] text-[var(--mt-green-deep)]'}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
                    <span>
                      <strong className="block font-display text-xl font-extrabold text-[#173c32]">{index + 1}. {stepTitle}</strong>
                      <span className="mt-1 block max-w-md text-base leading-7 text-[var(--mt-gray-600)]">{text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div aria-hidden="true" className="relative grid place-items-center">
            <span className="absolute h-[min(26rem,52vh)] w-[min(26rem,52vh)] rounded-full bg-[var(--mt-orange-bright)]" />
            <div data-story-phone className="relative h-[min(34rem,68vh)] w-[17.5rem] overflow-hidden rounded-[2.5rem] border-[10px] border-[#14231d] bg-[#fffdf9] shadow-[0_30px_70px_rgb(16_62_50_/_28%)] [transform:rotate(-3deg)]">
              <div data-story-screen className={screen}>
                <CategoryProductImage imageUrl={imageUrl} category={category} title={title} sizes="280px" className="min-h-0 w-full flex-1 rounded-2xl" />
                <strong className="mt-3 line-clamp-2 text-base font-extrabold text-[#173c32]">{title}</strong>
                <span className="mt-1 flex items-center gap-1 text-xs text-[var(--mt-gray-600)]"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{shopName}</span></span>
                <span className="mt-2 text-lg font-black text-[#173c32]">{formatFCFA(price)}</span>
                <span className="mt-3 grid min-h-11 place-items-center rounded-xl bg-[var(--mt-green-deep)] text-sm font-extrabold text-white">Choisir</span>
              </div>
              <div data-story-screen className={`${screen} invisible items-center justify-center text-center`}>
                <span data-story-check className="grid h-16 w-16 place-items-center rounded-full bg-[#E3F1EA] text-[var(--mt-green-primary)] ring-8 ring-[#F4F8F5]"><CheckCircle2 className="h-9 w-9" /></span>
                <strong className="mt-6 font-display text-lg font-extrabold text-[#173c32]">Demande enregistrée</strong>
                <span className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-[#E4D9C8] bg-[#F8F3EC] p-3 text-left text-xs">
                  <span className="line-clamp-2 font-bold text-[#173c32]">1 × {title}</span>
                  <span className="shrink-0 font-black text-[#173c32]">{formatFCFA(price)}</span>
                </span>
                <span className="mt-3 text-xs leading-5 text-[var(--mt-gray-600)]">Articles réservés 2 h</span>
              </div>
              <div data-story-screen className={`${screen} invisible justify-end gap-2 bg-[#f3efe8]`}>
                <span className="mx-auto mb-auto rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[var(--mt-gray-600)]">Exemple de conversation</span>
                <span data-story-bubble className={`${bubble} self-end bg-[#d9f2e3] text-[#173c32]`}>Bonjour, voici ma demande : 1 × {title}.</span>
                <span data-story-bubble className={`${bubble} self-start bg-white text-[#173c32]`}>Bonjour ! C’est accepté. Quand souhaitez-vous passer ?</span>
                <span data-story-bubble className={`${bubble} self-end bg-[#d9f2e3] text-[#173c32]`}>Vers 17 h, je règle sur place. Merci !</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
