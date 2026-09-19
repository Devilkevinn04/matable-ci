import React from 'react';
import { ArrowLeft, FileText, LockKeyhole, ShieldCheck } from 'lucide-react';

export type LegalPageKey = 'mentions-legales' | 'confidentialite' | 'cgu' | 'cookies';

interface LegalPagesProps {
  page: LegalPageKey;
}

const pageContent: Record<LegalPageKey, { title: string; intro: string; icon: React.ReactNode }> = {
  'mentions-legales': {
    title: 'Mentions légales',
    intro: 'Les informations légales de MaTable.ci et les responsabilités de chaque partie.',
    icon: <FileText className="h-5 w-5" />,
  },
  confidentialite: {
    title: 'Politique de confidentialité',
    intro: 'Comment MaTable.ci utilise les données nécessaires au fonctionnement du service.',
    icon: <LockKeyhole className="h-5 w-5" />,
  },
  cgu: {
    title: 'Conditions générales d’utilisation',
    intro: 'Les règles applicables à l’utilisation des vitrines, catalogues et commandes.',
    icon: <ShieldCheck className="h-5 w-5" />,
  },
  cookies: {
    title: 'Politique relative aux cookies',
    intro: 'Les traceurs utilisés par MaTable.ci et les moyens de les contrôler.',
    icon: <LockKeyhole className="h-5 w-5" />,
  },
};

export const LegalPages: React.FC<LegalPagesProps> = ({ page }) => {
  const content = pageContent[page];

  return (
    <main className="legal-page">
      <div className="legal-page-inner">
        <a href="/" className="legal-back-link"><ArrowLeft className="h-4 w-4" /> Retour aux boutiques</a>
        <header className="legal-header">
          <div className="legal-icon">{content.icon}</div>
          <p className="legal-kicker">MaTable.ci · Côte d’Ivoire</p>
          <h1>{content.title}</h1>
          <p>{content.intro}</p>
          <small>Dernière mise à jour : 19 septembre 2026</small>
        </header>

        {page === 'mentions-legales' && (
          <div className="legal-content">
            <section>
              <h2>Éditeur du site</h2>
              <p>MaTable.ci est exploité par l’équipe responsable du projet MaTable.ci, opérateur de la plateforme de mise en relation entre commerçants et clients. Le service est proposé depuis la Côte d’Ivoire et vise à aider les boutiques locales à présenter leurs offres et à recevoir des demandes de commande.</p>
              <p>La plateforme agit comme prestataire technique de mise en relation et ne collecte pas les paiements entre le client et le vendeur.</p>
            </section>
            <section>
              <h2>Siège social, forme juridique et contact</h2>
              <p>Les informations juridiques complètes de la structure exploiteuse, y compris la raison sociale, la forme juridique, l’adresse du siège, l’immatriculation et les coordonnées officielles, doivent être publiées de manière exacte et mise à jour par l’exploitant du service selon le statut retenu.</p>
              <p>Les coordonnées de contact effectives du service sont publiées sur le site et peuvent être modifiées par l’exploitant en fonction de l’organisation juridique de la plateforme.</p>
            </section>
            <section>
              <h2>Hébergement</h2>
              <p>Le site est hébergé par un prestataire de services cloud choisi par l’exploitant du service afin de garantir la disponibilité, la sécurité et la redondance de la plateforme. Les informations précises concernant l’hébergeur peuvent être mises à jour selon l’infrastructure de production retenue.</p>
            </section>
            <section>
              <h2>Responsabilités</h2>
              <p>Chaque commerçant reste responsable du contenu de sa vitrine, notamment la description des produits, les prix affichés, les stocks, les disponibilités, les délais, la qualité des produits et les conditions commerciales qu’il propose. MaTable.ci facilite la mise en relation, la transmission des demandes de commande et la gestion technique du service, sans se substituer au vendeur pour la vente finale ou pour le paiement.</p>
            </section>
            <section>
              <h2>Contact</h2>
              <p>Pour toute question relative aux mentions légales, au fonctionnement du service, aux demandes de droit ou au traitement des données, les utilisateurs peuvent contacter l’exploitant du service via les coordonnées publiées sur le site.</p>
            </section>
          </div>
        )}

        {page === 'confidentialite' && (
          <div className="legal-content">
            <section>
              <h2>Données collectées</h2>
              <p>MaTable.ci peut traiter les informations nécessaires au fonctionnement du service : nom commercial, coordonnées de contact, informations de livraison, données de boutique, produits et stocks, historique de commandes, données de navigation et éléments techniques nécessaires à la sécurité du site.</p>
            </section>
            <section>
              <h2>Finalités du traitement</h2>
              <p>Les données sont utilisées pour afficher les vitrines, gérer les catalogues, recevoir et suivre les demandes de commande, sécuriser l’accès aux comptes, prévenir les abus, améliorer la qualité du service et gérer la conformité technique et juridique du site.</p>
            </section>
            <section>
              <h2>Mode de paiement</h2>
              <p>MaTable.ci ne collecte ni ne conserve aucun paiement effectué entre le client et le vendeur. Les modalités de paiement, de livraison, de disponibilité et de finalisation de la vente sont convenues directement entre les parties, notamment via WhatsApp ou tout autre canal de communication accepté par le vendeur.</p>
            </section>
            <section>
              <h2>Conservation et sécurité</h2>
              <p>Les données sont conservées pendant la durée nécessaire à la fourniture du service, à la gestion des demandes de commande et au respect des obligations légales applicables. Les accès aux espaces professionnels et administrateurs sont protégés par des sessions sécurisées et des contrôles d’authentification.</p>
            </section>
            <section>
              <h2>Droits et contact</h2>
              <p>Les personnes concernées peuvent demander l’accès, la rectification, la limitation ou la suppression des données les concernant, ainsi que toute information utile sur les traitements, via le canal de contact officiel indiqué par l’exploitant du service.</p>
            </section>
          </div>
        )}

        {page === 'cgu' && (
          <div className="legal-content">
            <section>
              <h2>Objet du service</h2>
              <p>MaTable.ci met à disposition une plateforme gratuite de vitrines locales, de catalogue produit et de commande directe. Le service permet à des commerçants de présenter leurs offres et à des clients de passer des demandes de commande via la plateforme puis d’échanger directement avec le vendeur, notamment sur WhatsApp.</p>
            </section>
            <section>
              <h2>Commande et paiement</h2>
              <p>La commande enregistrée sur MaTable.ci correspond à une demande de commande, pas à un paiement collecté par la plateforme. Le montant final, la disponibilité, les frais de livraison éventuels, le mode de paiement et le bon de commande sont discutés et convenus directement entre le client et le vendeur.</p>
              <p>MaTable.ci ne reçoit pas, ne garde pas et ne traite pas d’argent au titre des ventes. La plateforme ne facture ni commission, ni frais de service, ni frais de commande au client ni au vendeur dans le modèle actuel.</p>
            </section>
            <section>
              <h2>Compte commerçant</h2>
              <p>Le commerçant s’engage à fournir des informations exactes, à protéger l’accès à son compte et à ses liens privés, à respecter les règles applicables à la vente et à signaler toute utilisation non autorisée. L’exploitant du service peut suspendre un accès en cas d’abus, de fraude, de contenu illicite ou de non-respect des conditions d’utilisation.</p>
            </section>
            <section>
              <h2>Prix, livraison et qualité</h2>
              <p>Les prix affichés, la disponibilité des produits, les délais, les conditions de livraison, les frais de livraison éventuels et le mode de paiement sont fixés par le commerçant. MaTable.ci agit comme outil de mise en relation et de diffusion technique. La plateforme n’exerce pas le contrôle direct sur l’exécution de la vente, la qualité du produit livré ou le paiement final.</p>
            </section>
            <section>
              <h2>Disponibilité et sécurité</h2>
              <p>MaTable.ci s’efforce de maintenir le service accessible et sécurisé, mais la plateforme ne garantit pas une continuité absolue de disponibilité et peut procéder à des interventions techniques, des mises à jour ou des maintenances nécessaires au bon fonctionnement du service.</p>
            </section>
          </div>
        )}

        {page === 'cookies' && (
          <div className="legal-content">
            <section>
              <h2>Cookies essentiels</h2>
              <p>Le site utilise des cookies essentiels afin de maintenir la session de navigation, mémoriser les préférences de l’utilisateur, sécuriser les accès et garantir le bon fonctionnement des vitrines et des espaces de gestion des boutiques.</p>
            </section>
            <section>
              <h2>Cookies d’analyse anonymisée</h2>
              <p>Des cookies de mesure d’audience peuvent être utilisés uniquement si l’utilisateur les accepte. Ils servent à mesurer l’usage du service, mieux comprendre la fréquentation et améliorer l’expérience utilisateur. Ces données sont anonymisées ou pseudonymisées et ne servent pas à la collecte ou au suivi des paiements.</p>
            </section>
            <section>
              <h2>Gestion des préférences</h2>
              <p>Les visiteurs peuvent refuser tout ou partie des cookies, personnaliser leurs choix ou modifier leur consentement à tout moment en revenant sur cette page ou en utilisant le bouton de gestion des cookies présent sur le site. Les cookies essentiels restent activés pour des raisons techniques et de sécurité.</p>
            </section>
            <section>
              <h2>Durée de conservation</h2>
              <p>La durée de conservation des cookies dépend de leur finalité. Les cookies de session sont supprimés à la fermeture du navigateur ou après expiration, tandis que les cookies techniques et d’analyse sont conservés pendant des durées limitées et non supérieures au besoin de fonctionnement ou de mesure du service.</p>
            </section>
          </div>
        )}
      </div>
    </main>
  );
};
