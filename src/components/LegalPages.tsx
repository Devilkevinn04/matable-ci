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
          <small>Dernière mise à jour : 15 septembre 2026</small>
        </header>

        {page === 'mentions-legales' && (
          <div className="legal-content">
            <section>
              <h2>Éditeur du site</h2>
              <p>Le site MaTable.ci est édité par la plateforme MaTable.ci, opérateur de la vitrine commerciale et du service de commande directe. L’exploitation du service est assurée par l’équipe responsable du projet, dans le cadre de la mise à disposition de vitrines locales et de catalogues de commerce de proximité.</p>
              <p>MaTable.ci peut être contacté via le formulaire de contact ou par les coordonnées de contact publiées sur le site et mises à jour par l’exploitant du service.</p>
            </section>
            <section>
              <h2>Siège social et immatriculation</h2>
              <p>Les informations juridiques complètes du responsable légal, de la forme juridique, du siège social et de l’immatriculation sont communiquées selon les exigences locales et peuvent être mises à jour en fonction de l’entité juridique qui exploite la plateforme.</p>
              <p>La plateforme agit en qualité de prestataire technologique et d’intermédiaire de mise en relation entre les commerçants et leurs clients.</p>
            </section>
            <section>
              <h2>Hébergement</h2>
              <p>Le site est hébergé par un prestataire de services cloud choisi par l’exploitant de la plateforme et configuré pour garantir la disponibilité, la sécurité et la redondance du service.</p>
              <p>Les coordonnées de l’hébergeur peuvent être mises à jour selon l’infrastructure retenue pour la production.</p>
            </section>
            <section>
              <h2>Responsabilités</h2>
              <p>Chaque commerçant est responsable du contenu qu’il publie sur sa vitrine, notamment les descriptions, tarifs, stock, disponibilité, photos, conditions de vente, délais de livraison et informations commerciales. MaTable.ci sert de support technique et ne se substitue pas au vendeur pour l’exécution commerciale.</p>
            </section>
            <section>
              <h2>Contact</h2>
              <p>Pour toute question relative aux mentions légales, à l’utilisation du site ou au fonctionnement du service, les utilisateurs peuvent contacter l’exploitant de la plateforme via les moyens de contact publiés sur le site.</p>
            </section>
          </div>
        )}

        {page === 'confidentialite' && (
          <div className="legal-content">
            <section>
              <h2>Données collectées</h2>
              <p>MaTable.ci traite les informations nécessaires au bon fonctionnement du service : identité commerciale, coordonnées de contact, informations de livraison, données de compte, contenu de catalogue, historique de commandes, paramètres de session et éléments techniques liés à la sécurité.</p>
            </section>
            <section>
              <h2>Finalités du traitement</h2>
              <p>Les données sont utilisées pour afficher les vitrines, gérer les catalogues, recevoir et suivre les commandes, sécuriser les accès, prévenir les abus, améliorer la qualité du service et assurer la conformité technique et juridique du site.</p>
            </section>
            <section>
              <h2>Conservation et sécurité</h2>
              <p>Les données sont conservées pendant la durée nécessaire à la fourniture du service, à l’exécution des commandes et à la gestion des obligations légales ou comptables applicables. Les accès aux espaces propriétaires et administrateurs sont protégés par des sessions sécurisées, des contrôles d’authentification et des mécanismes de protection contre les abus.</p>
            </section>
            <section>
              <h2>Partage et transferts</h2>
              <p>Les données ne sont pas vendues ni commercialisées à des fins publicitaires. Elles peuvent être partagées avec des prestataires techniques strictement nécessaires au fonctionnement du service, notamment l’hébergement, le stockage de données, le support technique ou le traitement des paiements, conformément aux obligations légales applicables.</p>
            </section>
            <section>
              <h2>Droits et contact</h2>
              <p>Les personnes concernées peuvent demander l’accès, la rectification ou la suppression de leurs données, ainsi que toute information utile sur les traitements, via le canal de contact officiel indiqué par l’exploitant du service.</p>
            </section>
          </div>
        )}

        {page === 'cgu' && (
          <div className="legal-content">
            <section>
              <h2>Objet du service</h2>
              <p>MaTable.ci met à disposition une plateforme de vitrines locales, de catalogue produit, de gestion de stock et de commande directe. Le service permet aux commerçants de présenter leurs offres et aux clients de contacter directement les vendeurs via WhatsApp ou les outils de commande mis à disposition.</p>
            </section>
            <section>
              <h2>Compte commerçant</h2>
              <p>Le commerçant s’engage à fournir des informations exactes, à protéger l’accès à son compte et à ses liens privés, à respecter les règles applicables à la vente en ligne et à signaler toute utilisation non autorisée. L’exploitant du service peut suspendre un accès en cas d’abus, de fraude, de contenu illicite ou de non-respect des conditions d’utilisation.</p>
            </section>
            <section>
              <h2>Commandes, tarifs et livraison</h2>
              <p>Les prix, stocks, délais, modes de livraison, modes de paiement et conditions de vente sont fixés par le commerçant. MaTable.ci agit comme outil de mise en relation et de diffusion technique. La plateforme n’exerce pas le contrôle direct sur l’exécution des ventes ni sur la qualité des produits livrés.</p>
            </section>
            <section>
              <h2>Contenus interdits</h2>
              <p>Sont interdits les contenus illégaux, trompeurs, discriminatoires, contrefaisants ou portant atteinte aux droits de tiers. Les contenus jugés non conformes peuvent être retirés, signalés ou suspendus après vérification.</p>
            </section>
            <section>
              <h2>Disponibilité du service</h2>
              <p>MaTable.ci s’efforce de maintenir le service accessible et sécurisé. Toutefois, la plateforme ne garantit pas une disponibilité continue ininterrompue et peut procéder à des interventions techniques, des mises à jour ou des maintenances nécessaires au bon fonctionnement du service.</p>
            </section>
          </div>
        )}

        {page === 'cookies' && (
          <div className="legal-content">
            <section>
              <h2>Cookies essentiels</h2>
              <p>Le site peut utiliser des cookies ou technologies similaires pour maintenir une session utilisateur, mémoriser des préférences de navigation, sécuriser les accès et assurer le bon fonctionnement des vitrines et des espaces propriétaires.</p>
            </section>
            <section>
              <h2>Cookies de mesure d’audience</h2>
              <p>Des données d’usage limitées peuvent être collectées afin d’analyser la fréquentation du site et d’améliorer l’expérience utilisateur. Ces informations sont généralement anonymisées ou pseudonymisées et utilisées uniquement pour des fins de mesure et de sécurité.</p>
            </section>
            <section>
              <h2>Gestion des préférences</h2>
              <p>Les utilisateurs peuvent supprimer les cookies enregistrés dans leur navigateur, bloquer certains types de traceurs ou ajuster les préférences de confidentialité à tout moment. La désactivation de cookies essentiels peut toutefois empêcher certaines fonctionnalités de fonctionnement du site ou de l’espace propriétaire.</p>
            </section>
            <section>
              <h2>Durée de conservation</h2>
              <p>La durée de conservation des cookies dépend de leur finalité. Les cookies de session sont supprimés à la fermeture du navigateur ou après expiration, tandis que certaines données techniques peuvent être conservées temporairement pour des motifs de sécurité et de maintenance.</p>
            </section>
          </div>
        )}
      </div>
    </main>
  );
};
