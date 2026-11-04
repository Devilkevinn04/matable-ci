import React from 'react';
import { ArrowLeft, ChevronDown, CircleHelp, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { FAQ_SECTIONS } from '../utils/faqContent';

export const FaqPage: React.FC = () => (
  <main className="min-h-[70vh] bg-[var(--mt-gray-50)] px-4 py-8 text-[var(--mt-gray-900)] sm:px-6 sm:py-12">
    <div className="mx-auto max-w-[1184px]">
      <Link to="/" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[var(--mt-green-hover)] transition hover:text-[var(--mt-orange-deep)]">
        <ArrowLeft className="h-4 w-4" /> Retour aux boutiques
      </Link>

      <header className="relative mt-6 overflow-hidden rounded-3xl bg-[var(--mt-green-deep)] p-5 text-white sm:mt-8 sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-28 h-72 w-72 rounded-full border border-white/10 sm:right-12 sm:h-96 sm:w-96" />
        <div className="relative max-w-3xl">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-[var(--mt-orange-soft)]">
            <CircleHelp className="h-5 w-5" />
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-[var(--mt-orange-soft)]">MaTable · Aide</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-[-.035em] sm:text-4xl">Questions fréquentes</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">
            Les réponses utiles pour découvrir une boutique, commander et gérer votre compte.
          </p>
        </div>
      </header>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {FAQ_SECTIONS.map((section) => (
          <section key={section.title} className="rounded-2xl border border-[#e7e1d7] bg-white p-5 shadow-[0_8px_24px_rgba(36,28,22,.04)] sm:p-6">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-[var(--mt-green-deep)]">
              {section.title === 'Commerçants' && <Store className="h-4 w-4" />}
              {section.title}
            </h2>
            <div className="divide-y divide-[#eee9e1]">
              {section.questions.map((item) => (
                <details key={item.question} className="group py-1">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-left text-sm font-semibold text-[var(--mt-gray-900)] marker:hidden sm:text-base">
                    <span>{item.question}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-[var(--mt-green-hover)] transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-faq-answer max-w-3xl pb-4 pr-8 text-sm leading-6 text-[var(--mt-gray-600)]">{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-[#e7e1d7] bg-[#f1ede5] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-[var(--mt-gray-600)]">Vous avez encore une question sur une commande ?</p>
        <Link to="/" className="inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--mt-green-deep)] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--mt-green-hover)]">Trouver une boutique</Link>
      </div>
    </div>
  </main>
);
