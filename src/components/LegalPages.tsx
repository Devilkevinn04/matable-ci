import React from 'react';
import { ArrowLeft, FileText, LockKeyhole, ShieldCheck } from 'lucide-react';
import { hasAnalyticsConsent, saveCookiePreferences } from './CookieBanner';
import { getSupportWhatsAppUrl, supportWhatsAppDisplayNumber } from '../utils/supportWhatsApp';

export type LegalPageKey = 'mentions-legales' | 'confidentialite' | 'cgu' | 'cookies';

interface LegalPagesProps {
  page: LegalPageKey;
}

const CookiePreferenceControls: React.FC = () => {
  const [analyticsEnabled, setAnalyticsEnabled] = React.useState(hasAnalyticsConsent);
  const [message, setMessage] = React.useState('');

  const save = () => {
    const saved = saveCookiePreferences(analyticsEnabled);
    setMessage(saved ? 'Votre choix a été enregistré dans ce navigateur.' : 'Impossible d’enregistrer ce choix dans ce navigateur.');
  };

  return (
    <section className="mt-6 rounded-xl border border-[#dce4dc] bg-white p-4" aria-labelledby="cookie-preferences-title">
      <h2 id="cookie-preferences-title">Vos préférences</h2>
      <p>Les traceurs essentiels restent actifs. Vous pouvez autoriser ou refuser les statistiques de fréquentation, puis modifier ce choix ici à tout moment.</p>
      <label className="mt-4 flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-800">
        <input type="checkbox" checked={analyticsEnabled} onChange={(event) => { setAnalyticsEnabled(event.target.checked); setMessage(''); }} />
        Autoriser les statistiques de fréquentation
      </label>
      <button type="button" onClick={save} className="mt-3 min-h-11 rounded-lg bg-[#0f4d3d] px-4 py-2 text-sm font-bold text-white">Enregistrer mon choix</button>
      {message && <p className="mt-3 text-sm" role="status" aria-live="polite">{message}</p>}
    </section>
  );
};

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
  const supportUrl = getSupportWhatsAppUrl('Bonjour, je souhaite contacter l’assistance MaTable.ci.');
  const supportContact = supportUrl
    ? <a href={supportUrl} target="_blank" rel="noreferrer">{supportWhatsAppDisplayNumber} sur WhatsApp</a>
    : <strong>Le contact WhatsApp doit être configuré par l’exploitant.</strong>;

  return (
    <main className="legal-page">
      <div className="legal-page-inner">
        <a href="/" className="legal-back-link"><ArrowLeft className="h-4 w-4" /> Retour aux boutiques</a>
        <header className="legal-header">
          <div className="legal-icon">{content.icon}</div>
          <p className="legal-kicker">MaTable.ci · Côte d’Ivoire</p>
          <h1>{content.title}</h1>
          <p>{content.intro}</p>
          <small>Dernière mise à jour : 10 octobre 2026</small>
        </header>

        {page === 'mentions-legales' && (
          <div className="legal-content">
            <section>
              <h2>Éditeur et exploitant</h2>
              <p>MaTable.ci est le nom commercial de la plateforme de mise en relation entre commerçants et clients, exploitée en nom propre par Kouadio Kevin Marc Armel, à Cocody, Côte d’Ivoire. L’exploitant indique ne pas disposer à ce jour de numéro RCCM. L’adresse administrative complète et le statut d’immatriculation doivent être confirmés avant l’exploitation commerciale publique et les présentes mentions doivent être relues par un professionnel du droit.</p>
              <p>La plateforme agit comme prestataire technique de mise en relation et ne collecte pas les paiements entre le client et le vendeur.</p>
            </section>
            <section>
              <h2>Contact</h2>
              <p>Contact téléphonique de l’exploitant et de l’assistance : <a href="tel:0102749775">0102749775</a>. Contact WhatsApp : {supportContact}. Aucune adresse e-mail officielle n’est disponible à ce jour. L’adresse administrative complète reste à renseigner.</p>
            </section>
            <section>
              <h2>Hébergement</h2>
              <p>Le service applicatif est configuré sur Render. La base de données est fournie par le prestataire indiqué dans la configuration de production; son nom légal, la région d’hébergement et les coordonnées du fournisseur doivent être confirmés dans le compte de déploiement avant publication définitive de ces mentions.</p>
            </section>
            <section>
              <h2>Responsabilités</h2>
              <p>Chaque commerçant reste responsable du contenu de sa vitrine, des prix, stocks, disponibilités, délais, produits et conditions commerciales. MaTable.ci facilite la mise en relation et la transmission des demandes, sans se substituer au vendeur pour la vente, la livraison, le service après-vente ou le paiement.</p>
            </section>
            <section>
              <h2>Signalement</h2>
              <p>Les contenus illicites, erreurs ou difficultés d’accès peuvent être signalés par téléphone au 0102749775. L’identité et le contact sont publiés selon les informations communiquées par l’exploitant; l’adresse administrative et les éléments d’immatriculation restent à régulariser ou confirmer.</p>
            </section>
          </div>
        )}

        {page === 'confidentialite' && (
          <div className="legal-content">
            <section>
              <h2>Responsable et contact</h2>
              <p>Le responsable des traitements est Kouadio Kevin Marc Armel, exploitant de MaTable.ci en nom propre à Cocody, Côte d’Ivoire. Pour une question ou une demande relative à vos données, contactez-le par téléphone au 0102749775. Aucune adresse e-mail officielle n’est disponible à ce jour. L’adresse administrative complète et le statut d’immatriculation restent à confirmer. Une vérification raisonnable de votre identité peut être demandée avant toute communication ou suppression.</p>
            </section>
            <section>
              <h2>Données traitées</h2>
              <p>Pour créer un compte client, nous traitons le prénom, le nom, le téléphone, l’adresse e-mail et le mot de passe sous forme hachée. Si vous choisissez Google ou Apple, nous recevons l’identifiant propre à ce fournisseur et les informations de profil qu’il transmet, notamment l’e-mail vérifié et, lorsqu’il est disponible, le nom. Le mot de passe de votre compte Google ou Apple ne nous est jamais transmis. Les informations du compte client sont distinctes de l’abonnement d’une boutique. Lorsque vous êtes connecté, vos favoris de boutiques et de produits ainsi que vos mentions « J’aime » sur les produits sont associés à votre compte. Les favoris restent privés; seul le nombre total de mentions « J’aime » par produit est affiché publiquement.</p>
              <p>Pour une commande, nous traitons le nom, le téléphone, le lieu et les indications de livraison, le créneau éventuel, les articles, quantités, options, montant recalculé, statut, date et l’identifiant du compte client associé. Le moyen de paiement enregistré est une préférence (espèces, mobile money, Wave ou à convenir), et non une donnée de carte ou une preuve de paiement.</p>
              <p>Lorsqu’un commerçant active le rappel WhatsApp, nous enregistrons son choix et sa date de consentement. Si l’intégration WhatsApp Business est configurée, le numéro WhatsApp de la boutique, son nom et la date d’échéance de l’abonnement sont transmis à Meta pour envoyer le modèle de rappel approuvé. Pour un renouvellement lancé par le commerçant, KadevPay reçoit les données nécessaires au paiement; MaTable.ci conserve l’intention, le montant, la formule, le statut, la référence fournisseur et les dates de traitement. MaTable.ci ne stocke pas de numéro de carte bancaire.</p>
            </section>
            <section>
              <h2>Vérification d’identité des commerçants</h2>
              <p>Après avoir donné son consentement, le commerçant est redirigé vers le parcours hébergé de Didit, qui peut traiter des pièces d’identité et des données biométriques nécessaires à la vérification. Ces données sont traitées par Didit selon ses propres conditions et sa politique de confidentialité. Le commerçant doit consulter les informations affichées par Didit avant de poursuivre.</p>
              <p>MaTable.ci conserve l’identifiant de session Didit, le statut de vérification, l’identifiant du workflow, la version et la date du consentement ainsi que les dates techniques nécessaires au suivi. Les pièces et données biométriques ne sont pas conservées dans la base MaTable.ci. Les événements techniques de webhook sont conservés au maximum 30 jours pour éviter le traitement multiple d’une même notification. Une vérification positive est requise pour publier une boutique.</p>
            </section>
            <section>
              <h2>Finalités et bases d’utilisation</h2>
              <p>Les données servent à créer et gérer les comptes, mémoriser les boutiques et produits favoris, afficher les mentions « J’aime » agrégées, traiter les commandes et leur suivi, assurer la vérification des commerçants, effectuer les renouvellements demandés, fournir l’assistance, protéger les comptes et prévenir les abus. Les statistiques de fréquentation ne sont enregistrées que si vous les autorisez dans la bannière ou sur la page Cookies. Les rappels automatiques d’échéance par WhatsApp ne sont envoyés qu’aux commerçants ayant activé cette option; le consentement peut être retiré dans les réglages de l’abonnement. Les données nécessaires à une fonctionnalité sont utilisées pour la fournir; les statistiques et les rappels reposent sur vos choix.</p>
            </section>
            <section>
              <h2>Comptes clients, commandes et services tiers</h2>
              <p>Une commande peut être passée sans compte client; dans ce cas, elle n’apparaît pas dans un historique personnel. Un client connecté peut télécharger une copie de son profil, de ses commandes, de ses favoris, de ses mentions « J’aime », de ses avis et de ses signalements depuis la rubrique Sécurité de son compte. La suppression du compte efface le profil et ces données d’engagement; les commandes sont conservées pour le commerçant et leurs coordonnées client sont anonymisées.</p>
              <p>La fin ou la suspension de l’abonnement d’un commerçant ne supprime pas automatiquement les commandes déjà enregistrées. Elle rend la vitrine concernée indisponible et bloque les nouvelles commandes auprès de cette boutique tant qu’elle n’est pas réactivée. Le compte client reste utilisable pour consulter les autres boutiques accessibles. Toute demande concernant les données doit être vérifiée et traitée sous réserve des obligations applicables.</p>
              <p>MaTable.ci ne collecte pas le paiement des commandes clients. Le commerçant reçoit les informations nécessaires à leur préparation. Si vous choisissez d’ouvrir WhatsApp pour envoyer une commande, vous quittez MaTable.ci; WhatsApp/Meta traite alors les informations que vous lui transmettez selon ses propres conditions. MaTable.ci enregistre le clic de redirection associé à la commande, pas l’ouverture effective de l’application ni l’envoi ou le contenu du message.</p>
              <p>Si vous choisissez de contacter l’assistance MaTable.ci sur WhatsApp, vous quittez également le site. WhatsApp/Meta traite alors le numéro et le contenu que vous choisissez d’envoyer selon ses propres conditions; MaTable.ci ne reçoit pas le contenu du message par le seul fait d’ouvrir le lien.</p>
              <p>Pour les rappels d’abonnement, Meta reçoit le numéro WhatsApp professionnel, le nom de la boutique et la date d’échéance uniquement après consentement du commerçant et si l’intégration est activée. Lorsqu’un commerçant initie un renouvellement, KadevPay traite le paiement selon ses propres conditions. Les comptes clients ne sont pas utilisés pour les rappels d’abonnement des commerçants.</p>
            </section>
            <section>
              <h2>Destinataires et hébergement</h2>
              <p>Les données de commande sont accessibles au commerçant concerné et aux personnes autorisées à administrer le service. Les statuts de vérification et identifiants de session sont accessibles aux personnes habilitées à administrer les boutiques; les pièces d’identité et données biométriques sont traitées par Didit dans le cadre de son parcours hébergé. Les prestataires d’hébergement et de base de données configurés par l’exploitant peuvent traiter des données pour fournir l’infrastructure; leur identité et la région effective d’hébergement doivent être confirmées pour le déploiement utilisé. MaTable.ci ne vend pas les données personnelles.</p>
            </section>
            <section>
              <h2>Durées de conservation</h2>
              <p>Les identifiants et statuts de session Didit sont conservés aussi longtemps que nécessaire au suivi du compte commerçant. Les identifiants d’événements webhook sont purgés après 30 jours. La conservation des pièces et données biométriques recueillies par Didit relève de la politique de conservation de ce prestataire. Les autres données sont conservées selon la durée nécessaire aux comptes, boutiques, commandes et obligations applicables; une demande d’effacement peut être adressée à l’assistance, sous réserve des obligations de conservation et des données nécessaires à la sécurité ou aux litiges.</p>
            </section>
            <section>
              <h2>Sécurité et droits</h2>
              <p>Les accès aux comptes reposent sur des sessions sécurisées; les mots de passe clients sont hachés et les webhooks Didit sont authentifiés avant tout changement de statut. Aucune mesure ne peut garantir un risque nul. Vous pouvez demander l’accès, la rectification, la suppression ou la limitation des données vous concernant et poser une question sur leur traitement en contactant l’assistance. Les demandes sont traitées après vérification et sous réserve des obligations applicables.</p>
            </section>
          </div>
        )}

        {page === 'cgu' && (
          <div className="legal-content">
            <section>
              <h2>Objet du service</h2>
              <p>MaTable.ci propose des vitrines locales, des catalogues et la transmission de demandes de commande. Les clients doivent disposer d’un compte pour commander. La plateforme met en relation le client et le commerçant; elle ne devient pas partie au contrat de vente conclu entre eux.</p>
            </section>
            <section>
              <h2>Commande et paiement</h2>
              <p>La commande enregistrée est une demande de commande et non un paiement. MaTable.ci peut réserver le stock et afficher le montant calculé à partir du catalogue. Le client et le vendeur confirment directement la disponibilité, la livraison, les frais éventuels et le paiement. Les paiements des abonnements et des boosts marchands passent par KadevPay; MaTable.ci n’encaisse pas les paiements des commandes clients, ne reçoit pas ces fonds et ne confirme pas qu’un règlement entre client et commerçant a eu lieu.</p>
            </section>
            <section>
              <h2>Comptes et parcours commerçant</h2>
              <p>Le commerçant doit fournir des informations exactes, protéger ses identifiants et liens d’accès privés, maintenir son catalogue à jour et respecter les règles applicables à ses ventes. La création d’une boutique ne la publie pas automatiquement. La publication peut dépendre de la vérification d’identité réalisée par Didit et d’un essai ou forfait actif. Le commerçant doit consentir au traitement des données demandé dans le parcours Didit pour effectuer cette vérification.</p>
              <p>Toute nouvelle boutique bénéficie automatiquement, dès sa création, d’un essai gratuit de 7 jours avec les fonctions Standard et un maximum de 2 produits. À la fin de l’essai, le commerçant choisit Standard (3 000 FCFA par mois), Premium (5 000 FCFA par mois) ou Pro (8 000 FCFA par mois), puis règle son abonnement avec KadevPay. L’abonnement choisi est activé uniquement après confirmation sécurisée du paiement; aucun prélèvement automatique n’est effectué. La formule annuelle donne 12 mois de service pour le prix de 10 mensualités. Les abonnements payés avant l’entrée en vigueur de ces tarifs conservent leur accès jusqu’à leur échéance; les nouveaux tarifs s’appliquent ensuite au renouvellement. Après l’échéance d’un abonnement payé, la vitrine reste visible pendant 2 jours avant son masquage.</p>
              <p>Premium ajoute la personnalisation de la vitrine, les liens vers les réseaux sociaux et le bandeau événementiel. Pro ajoute les statistiques détaillées sur 90 jours, un meilleur classement naturel dans l’annuaire et une réduction de 15 % sur les boosts. Les bonus de classement ne remplacent pas les critères de pertinence de l’annuaire.</p>
              <p>Une boutique vérifiée, ouverte et disposant d’au moins 2 produits peut acheter un boost de 24 heures (1 000 FCFA), 3 jours (1 500 FCFA) ou 7 jours (2 000 FCFA), avant réduction Pro éventuelle de 15 %. Chaque achat porte sur un seul emplacement : accueil, haut de catégorie ou boutiques de la ville. Cinq boosts simultanés au maximum sont proposés sur l’accueil, par catégorie ou par ville selon l’emplacement. Lorsque les créneaux sont occupés, une réservation payée est planifiée au premier créneau disponible. Le bilan indique les visites consenties de la vitrine et les clics WhatsApp suivis pendant la campagne; ces statistiques ne garantissent ni ventes ni portée. La durée du boost court à partir de sa date de début même si la boutique est temporairement masquée. Aucun remboursement n’est prévu après activation; si MaTable.ci ne peut pas activer le boost payé, le commerçant peut contacter l’assistance pour demander un remboursement.</p>
              <p>Après l’essai, le commerçant choisit et règle manuellement son abonnement avec KadevPay. Le renouvellement est activé uniquement après confirmation sécurisée du paiement par webhook. MaTable.ci ne collecte pas les paiements des commandes clients, qui restent réglés directement entre le client et le commerçant. Les boosts sponsorisés sont des achats ponctuels séparés de l’abonnement et sont proposés dans le dashboard commerçant lorsque la boutique remplit les conditions d’éligibilité.</p>
            </section>
            <section>
              <h2>Prix, livraison et qualité</h2>
              <p>Les prix affichés, la disponibilité des produits, les délais, les conditions de livraison, les frais de livraison éventuels et le mode de paiement sont fixés par le commerçant. MaTable.ci agit comme outil de mise en relation et de diffusion technique. La plateforme n’exerce pas le contrôle direct sur l’exécution de la vente, la qualité du produit livré ou le paiement final.</p>
            </section>
            <section>
              <h2>Disponibilité et sécurité</h2>
              <p>MaTable.ci s’efforce de maintenir le service accessible et sécurisé, mais la plateforme ne garantit pas une continuité absolue de disponibilité et peut procéder à des interventions techniques, des mises à jour ou des maintenances nécessaires au bon fonctionnement du service.</p>
            </section>
            <section>
              <h2>Contenus et responsabilité commerciale</h2>
              <p>Le commerçant répond de ses produits, prix, disponibilités, descriptions, livraisons et obligations envers le client. Le client doit vérifier les modalités avec le vendeur avant de finaliser la vente. Les utilisateurs s’engagent à ne pas publier de contenu illicite, trompeur, contrefaisant ou portant atteinte aux droits d’autrui. L’accès peut être suspendu en cas d’abus, de fraude, de risque de sécurité ou de violation des présentes conditions.</p>
            </section>
          </div>
        )}

        {page === 'cookies' && (
          <div className="legal-content">
            <section>
              <h2>Stockage nécessaire au service</h2>
              <p>Les cookies d’authentification HttpOnly et SameSite=Lax maintiennent les sessions client, commerçant et administrateur et sont supprimés à la déconnexion ou à leur expiration. Le choix de consentement est enregistré dans le stockage local du navigateur. Le panier de commande et certains identifiants temporaires sont conservés dans le stockage de session du navigateur; ils ne sont pas des cookies.</p>
            </section>
            <section>
              <h2>Statistiques facultatives</h2>
              <p>Si vous y consentez, MaTable.ci enregistre des événements de consultation sur ses propres serveurs : identifiant de session aléatoire, boutique consultée, chemin de page, vues de produits, clics sur l’ajout au panier et dates correspondantes. L’identifiant temporaire est conservé dans le stockage de session du navigateur. Ces événements servent à produire des statistiques internes et sont pseudonymisés, mais ne sont pas présentés comme anonymes. L’application n’utilise actuellement pas de cookie d’analyse tiers ni de régie publicitaire.</p>
            </section>
            <section>
              <h2>Gestion de vos choix</h2>
              <p>Les traceurs essentiels ne peuvent pas être désactivés depuis ce réglage, car ils sont nécessaires au service. Les statistiques facultatives restent désactivées jusqu’à votre accord. Vous pouvez modifier votre choix avec le contrôle ci-dessous; le lien « Cookies » du pied de page permet de revenir à cette page.</p>
            </section>
            <section>
              <h2>Durée et stockage</h2>
              <p>Le stockage de session est supprimé par le navigateur à la fin de la session. Le choix de consentement reste dans le stockage local jusqu’à sa modification ou sa suppression par l’utilisateur. Les cookies de connexion expirent selon la durée de session configurée ou sont supprimés à la déconnexion. Les événements statistiques sont conservés côté serveur; aucune purge automatique n’est actuellement configurée pour ces événements.</p>
            </section>
            <CookiePreferenceControls />
          </div>
        )}
      </div>
    </main>
  );
};
