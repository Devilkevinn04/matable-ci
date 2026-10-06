import React from 'react';
import { ArrowLeft, ChevronDown, CircleHelp, Store } from 'lucide-react';
import { FAQ_SECTIONS } from '../utils/faqContent';

export const FaqPage: React.FC = () => (
  <main className="min-h-[65vh] bg-[#f8f6f0] px-4 py-8 text-[#25231f] sm:px-6 sm:py-12">
    <div className="mx-auto max-w-4xl">
      <a href="/" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#176b55] transition hover:text-[#e6572b]">
        <ArrowLeft className="h-4 w-4" /> Retour aux boutiques
      </a>

      <header className="mt-8 border-b border-[#ded8ce] pb-7 sm:mt-10 sm:pb-9">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0f4d3d] text-white">
          <CircleHelp className="h-5 w-5" />
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-[#e6572b]">MaTable.ci · Aide</p>
        <h1 className="mt-2 text-3xl font-bold text-[#25231f] sm:text-4xl">Questions fréquentes</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6f6a61] sm:text-base">
          Les réponses utiles pour découvrir une boutique, commander et gérer votre compte.
        </p>
      </header>

      <div className="divide-y divide-[#ded8ce]">
        {FAQ_SECTIONS.map((section) => (
          <section key={section.title} className="py-7 sm:py-8">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-[#0f4d3d]">
              {section.title === 'Commerçants' && <Store className="h-4 w-4" />}
              {section.title}
            </h2>
            <div className="divide-y divide-[#e7e2d9]">
              {section.questions.map((item) => (
                <details key={item.question} className="group py-1">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-left text-sm font-semibold text-[#25231f] marker:hidden sm:text-base">
                    <span>{item.question}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-[#176b55] transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="max-w-3xl pb-4 pr-8 text-sm leading-6 text-[#6f6a61]">{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-[#ded8ce] py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[#6f6a61]">Vous avez encore une question sur une commande ?</p>
        <a href="/" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#0f4d3d] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#176b55]">Trouver une boutique</a>
      </div>
    </div>
  </main>
);
