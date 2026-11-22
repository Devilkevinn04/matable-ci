// Seul fichier qui importe GSAP : il est téléchargé quand la séquence approche de l’écran.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/** Relie la séquence au défilement. Les éléments visés ne sont animés par aucune autre bibliothèque. */
export const startOrderStory = (section: HTMLElement, onStep: (step: number) => void): (() => void) => {
  let currentStep = 0;
  const context = gsap.context((self) => {
    const all = (selector: string) => self.selector?.(selector) as HTMLElement[];
    const [choose, send, reply] = all('[data-story-screen]');
    const timeline = gsap.timeline({
      defaults: { duration: 1, ease: 'power2.inOut' },
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.4,
        onUpdate: ({ progress }) => {
          const step = Math.min(2, Math.floor(progress * 3));
          if (step !== currentStep) onStep(currentStep = step);
        },
      },
    });
    // Chaque écran reste lisible un temps, puis cède la place : uniquement transform et opacity.
    timeline
      .fromTo('[data-story-rail]', { scaleY: 1 / 3 }, { scaleY: 1, duration: 6, ease: 'none' }, 0)
      .fromTo('[data-story-phone]', { rotation: -3 }, { rotation: 3, duration: 6, ease: 'none' }, 0)
      .to(choose, { yPercent: -14, autoAlpha: 0 }, 1.5)
      .fromTo(send, { yPercent: 22, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1 }, 1.7)
      .fromTo('[data-story-check]', { scale: 0.4, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.6, ease: 'back.out(2)' }, 2.4)
      .to(send, { yPercent: -14, autoAlpha: 0 }, 3.6)
      .fromTo(reply, { yPercent: 22, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1 }, 3.8)
      .fromTo('[data-story-bubble]', { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.4, ease: 'power2.out' }, 4.4)
      .to({}, { duration: 0.2 }, 5.8);
  }, section);
  return () => context.revert();
};
