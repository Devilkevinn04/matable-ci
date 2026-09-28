import React from 'react';
import { ArrowLeft, ArrowRight, MapPin } from 'lucide-react';

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
}

const AUTH_HERO_IMAGE = 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=1400&auto=format&fit=crop&q=85';

export const BrandMark: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#e8f1e9] ${className}`} aria-hidden="true">
    <MapPin className="h-7 w-7 fill-[#0f4d3d] text-[#0f4d3d]" strokeWidth={2.4} />
    <span className="absolute left-1/2 top-[35%] h-2 w-2 -translate-x-1/2 rounded-full bg-[#e6572b]" />
  </span>
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
}) => (
  <main className="auth-experience min-h-[calc(100svh-7rem)] bg-[#f6f3ed] px-3 py-4 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
    <div className="mx-auto grid w-full max-w-[1180px] gap-4 lg:min-h-[min(790px,calc(100svh-10rem))] lg:grid-cols-[0.92fr_1.08fr] lg:gap-7">
      <section className="auth-story relative isolate flex min-h-[350px] flex-col overflow-hidden rounded-[26px] bg-[#0f4d3d] p-4 text-white sm:min-h-[390px] sm:p-8 lg:min-h-[680px] lg:rounded-[30px] lg:p-10">
        <img
          src={AUTH_HERO_IMAGE}
          alt={imageAlt}
          className="auth-story-image absolute inset-x-0 bottom-0 -z-10 h-[30%] w-full object-cover object-[center_22%] sm:h-[42%] sm:object-[center_44%] lg:h-[44%]"
          onError={(event) => { event.currentTarget.hidden = true; }}
        />
        <div className="auth-story-shade absolute inset-0 -z-10" style={{ background: 'linear-gradient(180deg, #0f4d3d 0%, rgba(15,77,61,0.98) 37%, rgba(15,77,61,0.72) 62%, rgba(15,77,61,0.16) 100%)' }} />
        <div className="flex items-center gap-3">
          <BrandMark className="bg-white/95" />
          <div>
            <p className="text-[19px] font-extrabold leading-none tracking-tight">MaTable<span className="text-[#f2a347]">.ci</span></p>
            <p className="mt-1 text-[10px] font-medium text-white/75">Le plaisir de découvrir local</p>
          </div>
        </div>

        <div className="relative z-10 mt-4 max-w-[410px] sm:mt-9 lg:mt-12">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#f8c96b]">{eyebrow}</p>
          <h1 className="mt-2 max-w-[390px] text-[30px] font-extrabold leading-[1.08] sm:mt-3 sm:text-[42px]">{title}</h1>
          <p className="mt-2 max-w-[390px] text-xs leading-5 text-white/90 sm:mt-3 sm:text-base sm:leading-6 sm:text-white/85">{description}</p>
        </div>

        <div className="relative z-10 mt-auto flex items-center gap-2 pt-6 text-[10px] font-semibold text-white/95 sm:pt-24 sm:text-xs lg:pt-10">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f2a347] text-[#173f32] sm:h-8 sm:w-8"><MapPin className="h-4 w-4" /></span>
          <span>Abidjan aujourd’hui, partout en Côte d’Ivoire demain.</span>
        </div>
      </section>

      <section className="flex min-w-0 flex-col rounded-[26px] bg-[#fffdf9] px-5 py-5 shadow-[0_12px_34px_rgba(37,35,31,0.07)] sm:px-8 sm:py-7 lg:rounded-[30px] lg:px-10 lg:py-8">
        <div className="flex min-h-10 items-center justify-between gap-3">
          {onBack ? (
            <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-full px-2 py-2 text-sm font-semibold text-[#426458] transition hover:bg-[#edf3ec]">
              <ArrowLeft className="h-4 w-4" /> Retour
            </button>
          ) : <span />}
          {topPrompt && topActionLabel && onTopAction && (
            <div className="flex items-center gap-2 text-right text-xs sm:text-sm">
              <span className="hidden text-[#52635b] sm:inline">{topPrompt}</span>
              <button type="button" onClick={onTopAction} className="inline-flex items-center gap-1 font-bold text-[#0f4d3d] hover:text-[#e6572b]">
                {topActionLabel}<ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-1 items-center justify-center py-6 sm:py-8">
          <div className="w-full max-w-[460px]">
            {children}
          </div>
        </div>
        <p className="pt-4 text-center text-[11px] text-[#7b8279]">Vos informations restent protégées.</p>
      </section>
    </div>
  </main>
);
