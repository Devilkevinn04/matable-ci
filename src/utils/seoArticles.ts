export interface SeoArticleSection {
  heading: string;
  paragraphs: string[];
}

export interface SeoArticle {
  slug: string;
  title: string;
  description: string;
  heading: string;
  updatedLabel: string;
  sections: SeoArticleSection[];
  ctaLabel: string;
  ctaHref: string;
}

export const SEO_ARTICLES: SeoArticle[] = [
  {
    slug: 'vendre-en-ligne-a-abidjan',
    title: 'Comment vendre en ligne à Abidjan | MaTable',
    description: 'Les étapes pour présenter votre commerce à Abidjan en ligne : créer une vitrine, publier un catalogue à jour et partager un lien direct avec vos clients.',
    heading: 'Comment vendre en ligne à Abidjan ?',
    updatedLabel: 'Guide pratique pour les commerçants',
    sections: [
      {
        heading: 'Présentez clairement votre activité',
        paragraphs: [
          'Commencez par préciser ce que vous vendez, où se trouve votre commerce et comment vos clients peuvent vous joindre. Une présentation claire aide les personnes de votre quartier à savoir rapidement si votre offre leur correspond.',
          'Indiquez votre commune, vos horaires et les modalités de retrait ou de livraison que vous proposez. N’affichez que des informations exactes et que vous pouvez maintenir à jour.',
        ],
      },
      {
        heading: 'Publiez un catalogue utile et à jour',
        paragraphs: [
          'Ajoutez des photos récentes, des noms de produits compréhensibles, des prix corrects et les disponibilités réelles. Des photos nettes et des descriptions précises permettent aux clients de mieux comprendre votre offre avant de vous contacter.',
          'Pensez à mettre à jour le stock et à retirer ou désactiver les produits qui ne sont plus disponibles. Les prix et les options doivent refléter ce que vous proposez réellement.',
        ],
      },
      {
        heading: 'Partagez votre vitrine et répondez directement',
        paragraphs: [
          'Une vitrine en ligne est plus facile à retrouver si vous partagez son lien dans vos profils de réseaux sociaux, vos messages et vos supports habituels. Invitez aussi vos clients réguliers à enregistrer le lien.',
          'Sur MaTable, les clients consultent le catalogue et peuvent vous contacter directement. Confirmez avec eux la disponibilité, le montant final, le paiement et le retrait ou la livraison avant de conclure la vente.',
        ],
      },
      {
        heading: 'Démarrer sur MaTable',
        paragraphs: [
          'Créez votre vitrine, complétez les informations du commerce et ajoutez quelques produits représentatifs avant de partager le lien. Consultez la page des formules pour connaître les conditions et limites en vigueur.',
        ],
      },
    ],
    ctaLabel: 'Créer ma vitrine commerçant',
    ctaHref: '/app/creer-boutique',
  },
  {
    slug: 'commander-sans-compte',
    title: 'Comment commander sans créer de compte | MaTable',
    description: 'Le parcours pour commander auprès d’une boutique MaTable sans créer de compte client, et les informations à vérifier avec le commerçant.',
    heading: 'Comment commander chez un commerçant sans créer de compte ?',
    updatedLabel: 'Guide pratique pour les clients',
    sections: [
      {
        heading: 'Choisissez une boutique et vérifiez son catalogue',
        paragraphs: [
          'Parcourez l’annuaire MaTable ou recherchez une boutique par nom, catégorie ou ville. Ouvrez sa vitrine pour vérifier les produits, les prix, les options et les informations communiquées par le commerçant.',
          'Les catalogues sont gérés par les boutiques. Si une information importante manque ou semble ancienne, demandez confirmation avant de commander.',
        ],
      },
      {
        heading: 'Préparez votre demande',
        paragraphs: [
          'Sélectionnez les produits et les quantités, puis renseignez les coordonnées demandées dans le parcours de commande. La création d’un compte client est facultative.',
          'Vérifiez votre numéro de téléphone et les détails de votre demande avant de l’envoyer. Vous pouvez aussi contacter la boutique pour poser une question avant de continuer.',
        ],
      },
      {
        heading: 'Confirmez les modalités directement avec la boutique',
        paragraphs: [
          'Après l’envoi, échangez avec le commerçant pour confirmer la disponibilité, le prix final, le moyen de paiement, le retrait ou la livraison. L’enregistrement d’une demande ne signifie pas que le paiement ou la livraison est déjà confirmé.',
          'MaTable ne collecte pas le paiement de la vente : le client et le commerçant conviennent directement des modalités. N’envoyez jamais de code secret ou de mot de passe dans une conversation.',
        ],
      },
      {
        heading: 'Un compte reste facultatif',
        paragraphs: [
          'Vous pouvez utiliser MaTable sans créer de compte. Si vous choisissez d’en créer un, votre espace client peut vous aider à retrouver les informations et commandes associées à votre profil.',
        ],
      },
    ],
    ctaLabel: 'Parcourir les boutiques',
    ctaHref: '/boutiques',
  },
];

export function findSeoArticle(pathname: string): SeoArticle | undefined {
  const normalizedPath = pathname.replace(/\/+$/, '');
  if (!normalizedPath.startsWith('/guide/')) return undefined;
  const slug = normalizedPath.slice('/guide/'.length);
  if (slug.includes('/')) return undefined;
  return SEO_ARTICLES.find((article) => article.slug === slug);
}
