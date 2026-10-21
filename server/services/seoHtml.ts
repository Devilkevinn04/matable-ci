import type { Request } from 'express';
import type { ProductRecord, ShopRecord } from '../types.ts';
import { escapeHtml, isShopPubliclyVisible } from './businessRules.ts';
import { getCategoryDefaults } from '../../src/utils/categoryDefaults.ts';
import { findPublicDiscoveryPage, toDiscoveryCitySlug } from '../../src/utils/discoverySeo.ts';
import { isAgeRestrictedProduct } from '../../src/utils/ageRestrictedProducts.ts';
import { FAQ_SECTIONS } from '../../src/utils/faqContent.ts';
import { getSubscriptionPrice, SUBSCRIPTION_PLANS, TRIAL_CATALOG_LIMIT, TRIAL_DURATION_DAYS } from '../../src/utils/subscriptionFeatures.ts';

interface SeoHtmlHelperOptions {
  shops: ShopRecord[];
  products: ProductRecord[];
  sanitizeTextField: (value: string | null | undefined, maxLength?: number) => string;
}

export function createSeoHtmlHelpers({ shops, products, sanitizeTextField }: SeoHtmlHelperOptions) {
  const getPublicOrigin = (req: Request) => String(process.env.APP_URL || `${req.protocol || 'https'}://${req.get('host') || 'matable.ci'}`).replace(/\/$/, '');

  const injectNoIndexSeo = (html: string, title: string) => html
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="robots" content=".*?" \/>/, '<meta name="robots" content="noindex, nofollow" />')
    .replace(/<link rel="canonical" href=".*?" \/>/, '');

  const injectFaqSeo = (html: string, req: Request) => {
    const origin = getPublicOrigin(req);
    const canonical = `${origin}/faq`;
    const questions = FAQ_SECTIONS.flatMap((section) => section.questions);
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      name: 'Questions fréquentes | MaTable.ci',
      url: canonical,
      inLanguage: 'fr-CI',
      mainEntity: questions.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    };
    const jsonLd = JSON.stringify(structuredData).replace(/</g, '\\u003c');
    const description = 'Réponses aux questions fréquentes sur les commandes, les comptes clients et les boutiques MaTable.ci.';
    const tags = [
      '<title>Questions fréquentes | MaTable.ci</title>',
      `<meta name="description" content="${escapeHtml(description)}" />`,
      '<meta name="robots" content="index, follow, max-image-preview:large" />',
      `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
      '<meta property="og:title" content="Questions fréquentes | MaTable.ci" />',
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      '<meta property="og:type" content="website" />',
      `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
      `<meta property="og:image" content="${origin}/icon-512.png" />`,
      '<meta property="og:image:alt" content="MaTable.ci, boutiques locales en Côte d’Ivoire" />',
      '<meta property="og:locale" content="fr_CI" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      '<meta name="twitter:title" content="Questions fréquentes | MaTable.ci" />',
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
      `<meta name="twitter:image" content="${origin}/icon-512.png" />`,
      `<script type="application/ld+json">${jsonLd}</script>`,
    ].join('\n  ');
    const faqSectionsHtml = FAQ_SECTIONS.map((section) => {
      const questionsHtml = section.questions
        .map(({ question, answer }) => `<dt>${escapeHtml(question)}</dt><dd>${escapeHtml(answer)}</dd>`)
        .join('');
      return `<section><h2>${escapeHtml(section.title)}</h2><dl>${questionsHtml}</dl></section>`;
    }).join('');
    const crawlableFaq = `<noscript><main><h1>Questions fréquentes</h1>${faqSectionsHtml}</main></noscript>`;
    return html
      .replace(/<title>.*?<\/title>/, '')
      .replace(/<meta name="description" content=".*?" \/>/, '')
      .replace(/<meta name="robots" content=".*?" \/>/, '')
      .replace(/<link rel="canonical" href=".*?" \/>/, '')
      .replace(/<meta (?:property|name)="(?:og:[^"]+|twitter:[^"]+)"[^>]*\/>/g, '')
      .replace('</head>', `  ${tags}\n  </head>`)
      .replace('</body>', `${crawlableFaq}\n  </body>`);
  };

  const injectHowItWorksSeo = (html: string, req: Request) => {
    const origin = getPublicOrigin(req);
    const canonical = `${origin}/comment-ca-marche`;
    const title = 'Comment ça marche ? | MaTable.ci';
    const description = 'Le guide pour découvrir une boutique locale, consulter sa vitrine, commander directement auprès du commerçant et convenir du retrait ou de la livraison.';
    const steps = [
      { name: 'Trouvez une boutique ou un produit', text: 'Parcourez les boutiques, explorez les catégories ou recherchez un produit, un quartier ou une ville.' },
      { name: 'Découvrez la vitrine', text: 'Consultez les produits, les prix, les horaires et les informations partagées par le commerçant.' },
      { name: 'Échangez directement avec le commerçant', text: 'Envoyez votre demande au vendeur sur WhatsApp et posez vos questions avant de confirmer.' },
      { name: 'Convenez du retrait ou de la livraison', text: 'Mettez-vous d’accord avec le commerçant sur la disponibilité, le paiement et la remise de votre commande.' },
    ];
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'Comment commander auprès d’une boutique MaTable.ci',
      description,
      inLanguage: 'fr-CI',
      step: steps.map((step, index) => ({
        '@type': 'HowToStep',
        position: index + 1,
        name: step.name,
        text: step.text,
        url: `${canonical}#etape-${index + 1}`,
      })),
    };
    const jsonLd = JSON.stringify(structuredData).replace(/</g, '\\u003c');
    const tags = [
      `<title>${escapeHtml(title)}</title>`,
      `<meta name="description" content="${escapeHtml(description)}" />`,
      '<meta name="robots" content="index, follow, max-image-preview:large" />',
      `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      '<meta property="og:type" content="article" />',
      `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
      `<meta property="og:image" content="${escapeHtml(`${origin}/icon-512.png`)}" />`,
      '<meta property="og:locale" content="fr_CI" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(`${origin}/icon-512.png`)}" />`,
      `<script type="application/ld+json">${jsonLd}</script>`,
    ].join('\n  ');
    const crawlableGuide = `<noscript><main><h1>Comment ça marche sur MaTable.ci ?</h1><p>${escapeHtml(description)}</p><ol>${steps.map((step) => `<li><h2>${escapeHtml(step.name)}</h2><p>${escapeHtml(step.text)}</p></li>`).join('')}</ol></main></noscript>`;
    return html
      .replace(/<title>.*?<\/title>/, '')
      .replace(/<meta name="description" content=".*?" \/>/, '')
      .replace(/<meta name="robots" content=".*?" \/>/, '')
      .replace(/<link rel="canonical" href=".*?" \/>/, '')
      .replace(/<meta (?:property|name)="(?:og:[^"]+|twitter:[^"]+)"[^>]*\/>/g, '')
      .replace('</head>', `  ${tags}\n  </head>`)
      .replace('</body>', `${crawlableGuide}\n  </body>`);
  };

  const injectMerchantPlansSeo = (html: string, req: Request) => {
    const origin = getPublicOrigin(req);
    const canonical = `${origin}/commercants`;
    const title = 'Formules commerçants et tarifs | MaTable.ci';
    const description = 'Comparez les formules Standard, Premium et Pro de MaTable.ci. Créez votre vitrine avec un essai gratuit de 7 jours, sans paiement pour démarrer.';
    const plans = Object.values(SUBSCRIPTION_PLANS);
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url: canonical,
      inLanguage: 'fr-CI',
      mainEntity: {
        '@type': 'OfferCatalog',
        name: 'Formules commerçants MaTable.ci',
        itemListElement: plans.map((plan) => ({
          '@type': 'Offer',
          name: plan.label,
          price: getSubscriptionPrice(plan.tier),
          priceCurrency: 'XOF',
          description: plan.description,
          url: canonical,
        })),
      },
    };
    const jsonLd = JSON.stringify(structuredData).replace(/</g, '\\u003c');
    const tags = [
      `<title>${escapeHtml(title)}</title>`,
      `<meta name="description" content="${escapeHtml(description)}" />`,
      '<meta name="robots" content="index, follow, max-image-preview:large" />',
      `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      '<meta property="og:type" content="website" />',
      `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
      `<meta property="og:image" content="${escapeHtml(`${origin}/icon-512.png`)}" />`,
      '<meta property="og:locale" content="fr_CI" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(`${origin}/icon-512.png`)}" />`,
      `<script type="application/ld+json">${jsonLd}</script>`,
    ].join('\n  ');
    const crawlablePlans = `<noscript><main><h1>Vendre sur MaTable.ci</h1><p>${escapeHtml(description)}</p><p>Essai gratuit de ${TRIAL_DURATION_DAYS} jours, jusqu’à ${TRIAL_CATALOG_LIMIT} produits, sans paiement pour démarrer.</p><h2>Formules commerçants</h2><ul>${plans.map((plan) => `<li><h3>${escapeHtml(plan.label)} — ${escapeHtml(new Intl.NumberFormat('fr-FR').format(getSubscriptionPrice(plan.tier)))} FCFA par mois</h3><p>${escapeHtml(plan.description)}</p><ul>${plan.benefits.map((benefit) => `<li>${escapeHtml(benefit)}</li>`).join('')}</ul></li>`).join('')}</ul><p><a href="${escapeHtml(`${origin}/app/creer-boutique`)}">Créer ma boutique</a></p></main></noscript>`;
    return html
      .replace(/<title>.*?<\/title>/, '')
      .replace(/<meta name="description" content=".*?" \/>/, '')
      .replace(/<meta name="robots" content=".*?" \/>/, '')
      .replace(/<link rel="canonical" href=".*?" \/>/, '')
      .replace(/<meta (?:property|name)="(?:og:[^"]+|twitter:[^"]+)"[^>]*\/>/g, '')
      .replace('</head>', `  ${tags}\n  </head>`)
      .replace('</body>', `${crawlablePlans}\n  </body>`);
  };

  const injectShopOpenGraph = (html: string, targetShop: ShopRecord, req: Request) => {
    const origin = getPublicOrigin(req);
    const shopUrl = `${origin}/${encodeURIComponent(targetShop.slug)}`;
    const title = `${sanitizeTextField(targetShop.name, 100)} — Boutique locale en Côte d’Ivoire | MaTable.ci`;
    const description = sanitizeTextField(targetShop.welcome_message || `Découvrez le catalogue de ${targetShop.name} et commandez directement sur WhatsApp.`, 160);
    const defaultImage = `${origin}/icon-512.svg`;
    const customImage = targetShop.theme_config?.custom_banner_url;
    const image = customImage && /^https?:\/\//i.test(String(customImage)) ? String(customImage) : defaultImage;
    const shopProducts = products
      .filter((product) => product.shop_id === targetShop.id && product.is_available && product.stock > 0 && !isAgeRestrictedProduct(product))
      .slice(0, 30);
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Store',
      name: targetShop.name,
      description,
      url: shopUrl,
      image,
      telephone: targetShop.whatsapp_number,
      address: {
        '@type': 'PostalAddress',
        addressLocality: targetShop.city || 'Abidjan',
        addressCountry: 'CI',
      },
      areaServed: 'Côte d’Ivoire',
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: `Catalogue ${targetShop.name}`,
        itemListElement: shopProducts.map((product) => ({
          '@type': 'Offer',
          priceCurrency: 'XOF',
          price: product.price,
          availability: 'https://schema.org/InStock',
          itemOffered: {
            '@type': 'Product',
            name: product.title,
            description: product.description || undefined,
            image: product.image_url,
          },
        })),
      },
    };
    const jsonLd = JSON.stringify(structuredData).replace(/</g, '\\u003c');
    const meta = [
      `<title>${escapeHtml(title)}</title>`,
      `<meta name="description" content="${escapeHtml(description)}" />`,
      `<meta name="robots" content="index, follow, max-image-preview:large" />`,
      `<link rel="canonical" href="${escapeHtml(shopUrl)}" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:url" content="${escapeHtml(shopUrl)}" />`,
      `<meta property="og:image" content="${escapeHtml(image)}" />`,
      `<meta property="og:image:alt" content="${escapeHtml(targetShop.name)}" />`,
      `<meta property="og:locale" content="fr_CI" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
      `<script type="application/ld+json">${jsonLd}</script>`,
    ].join('\n  ');

    return html
      .replace(/<title>.*?<\/title>/, '')
      .replace(/<meta name="description" content=".*?" \/>/, '')
      .replace(/<meta name="robots" content=".*?" \/>/, '')
      .replace(/<link rel="canonical" href=".*?" \/>/, '')
      .replace(/<meta (?:property|name)="(?:og:[^"]+|twitter:[^"]+)"[^>]*\/>/g, '')
      .replace('</head>', `  ${meta}\n  </head>`);
  };

  const injectLegalSeo = (html: string, page: string, req: Request) => {
    const metadata: Record<string, { title: string; description: string }> = {
      'mentions-legales': { title: 'Mentions légales | MaTable.ci', description: 'Mentions légales et responsabilités de la plateforme MaTable.ci.' },
      confidentialite: { title: 'Politique de confidentialité | MaTable.ci', description: 'Politique de confidentialité et traitement des données sur MaTable.ci.' },
      cgu: { title: 'Conditions générales d’utilisation | MaTable.ci', description: 'Conditions générales d’utilisation des vitrines et services MaTable.ci.' },
      cookies: { title: 'Politique relative aux cookies | MaTable.ci', description: 'Informations sur les cookies et traceurs utilisés par MaTable.ci.' },
    };
    const content = metadata[page];
    if (!content) return html;
    const canonical = `${getPublicOrigin(req)}/${page}`;
    return html
      .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(content.title)}</title>`)
      .replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${escapeHtml(content.description)}" />`)
      .replace(/<link rel="canonical" href=".*?" \/>/, `<link rel="canonical" href="${escapeHtml(canonical)}" />`)
      .replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${escapeHtml(content.title)}" />`)
      .replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${escapeHtml(content.description)}" />`)
      .replace(/<meta property="og:url" content=".*?" \/>/, `<meta property="og:url" content="${escapeHtml(canonical)}" />`);
  };

  const injectDiscoverySeo = (html: string, page: ReturnType<typeof findPublicDiscoveryPage>, req: Request) => {
    if (!page) return html;
    const origin = getPublicOrigin(req);
    const canonical = `${origin}${page.path}`;
    const pageShops = shops.filter((shop) => {
      if (!isShopPubliclyVisible(shop)) return false;
      if (page.category && shop.category !== page.category) return false;
      if (page.citySlug && toDiscoveryCitySlug(shop.city || '') !== page.citySlug) return false;
      return true;
    });
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: page.heading,
      description: page.description,
      url: canonical,
      inLanguage: 'fr-CI',
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: pageShops.length,
        itemListElement: pageShops.map((shop, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${origin}/${encodeURIComponent(shop.slug)}`,
          name: shop.name,
        })),
      },
    };
    const jsonLd = JSON.stringify(structuredData).replace(/</g, '\\u003c');
    const shareImage = page.category
      ? getCategoryDefaults(page.category).bannerPlaceholderImageUrl
      : `${origin}/icon-512.png`;
    const tags = [
      `<title>${escapeHtml(page.title)}</title>`,
      `<meta name="description" content="${escapeHtml(page.description)}" />`,
      '<meta name="robots" content="index, follow, max-image-preview:large" />',
      `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
      `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
      `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
      '<meta property="og:type" content="website" />',
      `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
      `<meta property="og:image" content="${escapeHtml(shareImage)}" />`,
      `<meta property="og:image:alt" content="${escapeHtml(page.heading)}" />`,
      '<meta property="og:locale" content="fr_CI" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(shareImage)}" />`,
      `<script type="application/ld+json">${jsonLd}</script>`,
    ].join('\n  ');
    const crawlableFallback = `<noscript><main><h1>${escapeHtml(page.heading)}</h1><p>${escapeHtml(page.description)}</p><ul>${pageShops.map((shop) => `<li><a href="${escapeHtml(`${origin}/${encodeURIComponent(shop.slug)}`)}">${escapeHtml(shop.name)}</a></li>`).join('')}</ul></main></noscript>`;
    return html
      .replace(/<title>.*?<\/title>/, '')
      .replace(/<meta name="description" content=".*?" \/>/, '')
      .replace(/<meta name="robots" content=".*?" \/>/, '')
      .replace(/<link rel="canonical" href=".*?" \/>/, '')
      .replace(/<meta (?:property|name)="(?:og:[^"]+|twitter:[^"]+)"[^>]*\/>/g, '')
      .replace('</head>', `  ${tags}\n  </head>`)
      .replace('</body>', `${crawlableFallback}\n  </body>`);
  };

  const injectShopDirectorySeo = (html: string, req: Request) => {
    const origin = getPublicOrigin(req);
    const canonical = `${origin}/boutiques`;
    const directoryShops = shops.filter((shop) => isShopPubliclyVisible(shop));
    const title = 'Boutiques locales en Côte d’Ivoire | MaTable.ci';
    const description = 'Découvrez les boutiques locales en Côte d’Ivoire, explorez les commerces par catégorie ou par ville et contactez directement les commerçants.';
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Découvrez les boutiques locales',
      description,
      url: canonical,
      inLanguage: 'fr-CI',
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: directoryShops.length,
        itemListElement: directoryShops.map((shop, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${origin}/${encodeURIComponent(shop.slug)}`,
          name: shop.name,
        })),
      },
    };
    const jsonLd = JSON.stringify(structuredData).replace(/</g, '\\u003c');
    const tags = [
      `<title>${escapeHtml(title)}</title>`,
      `<meta name="description" content="${escapeHtml(description)}" />`,
      '<meta name="robots" content="index, follow, max-image-preview:large" />',
      `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
      `<meta property="og:title" content="${escapeHtml(title)}" />`,
      `<meta property="og:description" content="${escapeHtml(description)}" />`,
      '<meta property="og:type" content="website" />',
      `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
      `<meta property="og:image" content="${escapeHtml(`${origin}/icon-512.png`)}" />`,
      '<meta property="og:locale" content="fr_CI" />',
      '<meta name="twitter:card" content="summary_large_image" />',
      `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
      `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
      `<meta name="twitter:image" content="${escapeHtml(`${origin}/icon-512.png`)}" />`,
      `<script type="application/ld+json">${jsonLd}</script>`,
    ].join('\n  ');
    const crawlableFallback = `<noscript><main><h1>Découvrez les boutiques locales</h1><p>${escapeHtml(description)}</p><ul>${directoryShops.map((shop) => `<li><a href="${escapeHtml(`${origin}/${encodeURIComponent(shop.slug)}`)}">${escapeHtml(shop.name)}</a></li>`).join('')}</ul></main></noscript>`;
    return html
      .replace(/<title>.*?<\/title>/, '')
      .replace(/<meta name="description" content=".*?" \/>/, '')
      .replace(/<meta name="robots" content=".*?" \/>/, '')
      .replace(/<link rel="canonical" href=".*?" \/>/, '')
      .replace(/<meta (?:property|name)="(?:og:[^"]+|twitter:[^"]+)"[^>]*\/>/g, '')
      .replace('</head>', `  ${tags}\n  </head>`)
      .replace('</body>', `${crawlableFallback}\n  </body>`);
  };

  return {
    getPublicOrigin,
    injectNoIndexSeo,
    injectFaqSeo,
    injectHowItWorksSeo,
    injectMerchantPlansSeo,
    injectShopOpenGraph,
    injectLegalSeo,
    injectDiscoverySeo,
    injectShopDirectorySeo,
  };
}
