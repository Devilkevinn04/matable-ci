import React from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, CheckCircle2, MapPin, MessageCircle, ShoppingBag, Store, UserRound } from 'lucide-react';

export const MerchantRegistrationProgress: React.FC<{ step: 1 | 2 }> = ({ step }) => (
  <ol aria-label="Étapes de création de boutique" className="grid grid-cols-2 gap-2">
    {['Votre boutique', 'Votre accès'].map((label, index) => {
      const number = (index + 1) as 1 | 2;
      const isComplete = step > number;
      const isCurrent = step === number;
      return (
        <li key={label} aria-current={isCurrent ? 'step' : undefined} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition-colors ${isCurrent ? 'border-[#047857] bg-[#edf6ef] text-[#065f46]' : isComplete ? 'border-[#d4e8d9] bg-[#f5faf5] text-[#426458]' : 'border-[#e8e2d8] bg-[#faf9f6] text-[#8a9089]'}`}>
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isCurrent ? 'bg-[#047857] text-white' : isComplete ? 'bg-[#dcefe2] text-[#047857]' : 'bg-[#eeece6] text-[#7b8279]'}`}>
            {isComplete ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : number}
          </span>
          {label}
        </li>
      );
    })}
  </ol>
);

export const AuthAudienceSwitcher: React.FC<{
  activeAudience: 'customer' | 'merchant';
  onSelectCustomer: () => void;
  onSelectMerchant: () => void;
}> = ({ activeAudience, onSelectCustomer, onSelectMerchant }) => (
  <nav aria-label="Type de connexion" className="mb-6 grid grid-cols-2 rounded-2xl border border-[#e5e1d8] bg-[#f3f1eb] p-1">
    <button
      type="button"
      onClick={onSelectCustomer}
      aria-current={activeAudience === 'customer' ? 'page' : undefined}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition ${activeAudience === 'customer' ? 'bg-white text-[#065f46] shadow-sm' : 'text-[#667168] hover:bg-white/70'}`}
    >
      <UserRound className="h-4 w-4" aria-hidden="true" />
      Connexion client
    </button>
    <button
      type="button"
      onClick={onSelectMerchant}
      aria-current={activeAudience === 'merchant' ? 'page' : undefined}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold transition ${activeAudience === 'merchant' ? 'bg-white text-[#065f46] shadow-sm' : 'text-[#667168] hover:bg-white/70'}`}
    >
      <Store className="h-4 w-4" aria-hidden="true" />
      Connexion marchand
    </button>
  </nav>
);

interface AuthExperienceLayoutProps {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  topPrompt?: string;
  topActionLabel?: string;
  onTopAction?: () => void;
  onBack?: () => void;
  imageAlt?: string;
  storyCard?: React.ReactNode;
}

export const BrandMark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#e8f1e9] ${className}`} aria-hidden="true">
    <MapPin className="h-7 w-7 fill-[#065f46] text-[#065f46]" strokeWidth={2.4} />
    <span className="absolute left-1/2 top-[35%] h-2 w-2 -translate-x-1/2 rounded-full bg-[#F97316]" />
  </span>
);

export const MerchantShopPreview: React.FC<{ name: string; category: string; city: string }> = ({ name, category, city }) => (
  <div className="min-w-0 flex-1">
    <div className="flex items-center justify-between gap-2">
      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#f0ba80]">Votre aperçu MaTable</p>
      <span className="inline-flex items-center gap-1 rounded-full bg-[#c1f1d4]/15 px-2 py-1 text-[8px] font-bold text-[#c1f1d4]"><span className="h-1.5 w-1.5 rounded-full bg-[#86efac]" /> EN DIRECT</span>
    </div>
    <p className="mt-2 truncate font-display text-lg font-extrabold leading-tight text-white sm:text-xl">{name.trim() || 'Nom de votre boutique'}</p>
    <div className="mt-2 flex flex-wrap gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[9px] font-semibold text-white/85"><Store className="h-3 w-3 text-[#f0ba80]" aria-hidden="true" />{category || 'Votre activité'}</span>
      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[9px] font-semibold text-white/85"><MapPin className="h-3 w-3 text-[#f0ba80]" aria-hidden="true" />{city || 'Votre ville'}</span>
    </div>
    <div className="mt-3 flex items-center gap-2 border-t border-white/10 pt-2.5 text-[9px] font-medium text-white/65">
      <MessageCircle className="h-3.5 w-3.5 text-[#f0ba80]" aria-hidden="true" />
      Une vitrine locale, un contact direct
    </div>
  </div>
);

export const AuthExperienceLayout: React.FC<AuthExperienceLayoutProps> = ({
  eyebrow,
  title,
  description,
  children,
  topPrompt,
  topActionLabel,
  onTopAction,
  onBack,
  imageAlt = 'Une cliente découvre le commerce local en Côte d’Ivoire',
  storyCard,
}) => (
  <main className="min-h-[100svh] bg-[#f1eee6] px-3 py-3 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
    <div className="mx-auto grid w-full max-w-[1240px] gap-3 lg:min-h-[min(820px,calc(100svh-4rem))] lg:grid-cols-[.94fr_1.06fr] lg:gap-5">
      <section className="relative isolate flex min-h-[250px] flex-col overflow-hidden rounded-[24px] bg-[#073f32] p-5 text-white sm:min-h-[300px] sm:rounded-[30px] sm:p-8 lg:min-h-[700px] lg:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 -z-10 h-80 w-80 rounded-full border border-white/10 sm:h-[28rem] sm:w-[28rem]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 -left-20 -z-10 h-80 w-80 rounded-full bg-[#f0ba80]/10 blur-3xl" />
        <div className="flex items-center gap-3">
          <BrandMark className="bg-white/95" />
          <div>
            <p className="text-[19px] font-extrabold leading-none tracking-tight">MaTable<span className="text-[#f0ba80]">.ci</span></p>
            <p className="mt-1 text-[10px] font-medium text-white/75">Le commerce local, en lien direct</p>
          </div>
        </div>

        <div className="relative z-10 mt-6 max-w-[460px] sm:mt-9 lg:mt-14">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#f0ba80] sm:text-xs">{eyebrow}</p>
          <h1 className="mt-2 text-[27px] font-extrabold leading-[1.07] tracking-[-0.035em] sm:mt-3 sm:text-[42px] lg:text-[48px]">{title}</h1>
          <p className="mt-3 max-w-[410px] text-sm leading-6 text-white/80 sm:mt-4 sm:text-base">{description}</p>
        </div>

        <div
          role="img"
          aria-label={imageAlt}
          className="relative z-10 mt-5 flex max-w-[430px] items-center gap-3 rounded-[22px] border border-white/15 bg-white/[0.08] p-3 backdrop-blur sm:mt-6 sm:gap-4 sm:p-4 lg:mt-auto lg:p-5"
        >
          {storyCard ?? (
            <>
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f0ba80] text-[#073f32] sm:h-[76px] sm:w-[76px]">
                <Store className="h-6 w-6 sm:h-8 sm:w-8" strokeWidth={1.8} aria-hidden="true" />
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#16483a] bg-white text-[#047857] sm:h-7 sm:w-7"><BadgeCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" /></span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-[0.13em] text-[#f0ba80] sm:text-[10px]">Une vitrine à votre image</p>
                <p className="mt-1 font-display text-base font-extrabold leading-tight sm:text-lg">Votre quartier, vos clients.</p>
                <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-1 text-[9px] font-semibold text-white/85 sm:px-2.5 sm:text-[10px]"><MapPin className="h-3 w-3 text-[#f0ba80]" aria-hidden="true" /> Près de vous</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-1 text-[9px] font-semibold text-white/85 sm:px-2.5 sm:text-[10px]"><MessageCircle className="h-3 w-3 text-[#f0ba80]" aria-hidden="true" /> En direct</span>
                </div>
              </div>
              <ShoppingBag className="absolute right-3 top-3 h-4 w-4 text-white/35 sm:right-4 sm:top-4" aria-hidden="true" />
            </>
          )}
        </div>
      </section>

      <section className="flex min-w-0 flex-col rounded-[24px] border border-[#e8e2d8] bg-[#fffefa] px-4 py-4 shadow-[0_14px_40px_rgba(37,35,31,0.06)] sm:rounded-[30px] sm:px-8 sm:py-6 lg:px-10 lg:py-7">
        <div className="flex min-h-10 items-center justify-between gap-3">
          {onBack ? (
            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-full px-2 py-2 text-sm font-semibold text-[#426458] transition hover:bg-[#edf3ec]">
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>
          ) : <span />}
          {topPrompt && topActionLabel && onTopAction && (
            <div className="flex items-center gap-2 text-right text-xs sm:text-sm">
              <span className="hidden text-[#47534b] sm:inline">{topPrompt}</span>
              <button type="button" onClick={onTopAction} className="inline-flex items-center gap-1 font-bold text-[#065f46] hover:text-[#F97316]">
                {topActionLabel}<ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-1 items-center justify-center py-3 sm:py-6 lg:py-4">
          <div className="w-full max-w-[460px]">
            {children}
          </div>
        </div>
        <p className="pt-3 text-center text-[11px] text-[#7b8279]">Vos informations restent protégées.</p>
      </section>
    </div>
  </main>
);
