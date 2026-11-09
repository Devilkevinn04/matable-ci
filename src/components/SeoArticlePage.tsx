import { ArrowRight, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SeoArticle } from '../utils/seoArticles';

interface SeoArticlePageProps {
  article: SeoArticle;
}

export function SeoArticlePage({ article }: SeoArticlePageProps) {
  return (
    <main className="min-h-screen bg-[var(--mt-gray-50)] px-4 py-10 text-[var(--mt-gray-900)] sm:px-8 sm:py-16">
      <article className="mx-auto max-w-3xl">
        <nav aria-label="Fil d’Ariane" className="mb-8 text-sm text-[var(--mt-gray-600)]">
          <Link to="/" className="font-semibold text-[var(--mt-green-deep)] hover:underline">Accueil</Link>
          <span aria-hidden="true" className="px-2">/</span>
          <Link to="/guide" className="font-semibold text-[var(--mt-green-deep)] hover:underline">Guide</Link>
          <span aria-hidden="true" className="px-2">/</span>
          <span>{article.updatedLabel}</span>
        </nav>

        <header className="rounded-3xl bg-[var(--mt-green-deep)] p-6 text-white shadow-[0_18px_48px_rgba(16,62,50,.16)] sm:p-10">
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--mt-orange-soft)]">
            <BookOpen className="h-4 w-4" aria-hidden="true" /> Guide MaTable
          </p>
          <h1 className="mt-4 font-display text-3xl font-extrabold leading-tight tracking-[-0.035em] sm:text-5xl">{article.heading}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/80 sm:text-base sm:leading-7">{article.description}</p>
        </header>

        <div className="mt-8 space-y-8">
          {article.sections.map((section) => (
            <section key={section.heading} aria-labelledby={`article-${article.slug}-${section.heading}`}>
              <h2 id={`article-${article.slug}-${section.heading}`} className="font-display text-xl font-extrabold leading-tight text-[var(--mt-green-deep)] sm:text-2xl">{section.heading}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-[#505a53] sm:text-base">
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-[#dce8df] bg-white p-5 shadow-sm sm:p-6">
          <Link to={article.ctaHref} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--mt-green-deep)] px-5 py-3 text-sm font-bold text-white transition hover:bg-[var(--mt-green-hover)]">
            {article.ctaLabel}<ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <nav aria-label="Autres guides pratiques" className="mt-8 border-t border-[#e5ded4] pt-5">
          <Link to="/faq" className="text-sm font-bold text-[var(--mt-green-deep)] underline underline-offset-4">Consulter les questions fréquentes</Link>
        </nav>
      </article>
    </main>
  );
}
