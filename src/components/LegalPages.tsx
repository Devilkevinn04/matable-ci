import React from 'react';
import { ArrowLeft, FileText, LockKeyhole, ShieldCheck } from 'lucide-react';
import { hasAnalyticsConsent, saveCookiePreferences } from './CookieBanner';

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

  return (
    <main className="legal-page">
      <div className="legal-page-inner">
        <a href="/" className="legal-back-link"><ArrowLeft className="h-4 w-4" /> Retour aux boutiques</a>
        <header className="legal-header">
          <div className="legal-icon">{content.icon}</div>
          <p className="legal-kicker">MaTable.ci · Côte d’Ivoire</p>
          <h1>{content.title}</h1>
          <p>{content.intro}</p>
          <small>Dernière mise à jour : 1 octobre 2026</small>
        </header>

        {page === 'mentions-legales' && (
          <div className="legal-content">
            <section>
              <h2>Éditeur et exploitant</h2>
              <p>MaTable.ci est le nom commercial de la plateforme de mise en relation entre commerçants et clients, exploitée depuis la Côte d’Ivoire. La dénomination juridique, la forme sociale, l’adresse du siège et le numéro d’immatriculation de l’exploitant ne sont pas renseignés sur cette version du site et doivent être complétés avant l’exploitation publique.</p>
              <p>La plateforme agit comme prestataire technique de mise en relation et ne collecte pas les paiements entre le client et le vendeur.</p>
            </section>
            <section>
              <h2>Contact</h2>
              <p>Pour contacter l’assistance MaTable.ci, écrivez au <a href="https://wa.me/2250102749775" target="_blank" rel="noreferrer">+225 01 02 74 97 75 sur WhatsApp</a>. Ce contact d’assistance ne remplace pas les coordonnées juridiques complètes de l’exploitant, qui restent à publier.</p>
            </section>
            <section>
              <h2>Hébergement</h2>
              <p>L’application et sa base de données sont hébergées auprès des prestataires cloud configurés par l’exploitant. Le nom légal de l’hébergeur et l’adresse de l’infrastructure de production doivent être renseignés selon le déploiement effectivement utilisé.</p>
            </section>
            <section>
              <h2>Responsabilités</h2>
              <p>Chaque commerçant reste responsable du contenu de sa vitrine, des prix, stocks, disponibilités, délais, produits et conditions commerciales. MaTable.ci facilite la mise en relation et la transmission des demandes, sans se substituer au vendeur pour la vente, la livraison, le service après-vente ou le paiement.</p>
            </section>
            <section>
              <h2>Signalement</h2>
              <p>Les contenus illicites, erreurs ou difficultés d’accès peuvent être signalés à l’assistance WhatsApp ci-dessus. Les informations d’identification de l’éditeur doivent être complétées par l’exploitant avant mise en production publique.</p>
            </section>
          </div>
        )}

        {page === 'confidentialite' && (
          <div className="legal-content">
            <section>
              <h2>Responsable et contact</h2>
              <p>Le responsable des traitements est l’exploitant de MaTable.ci. Son identité juridique complète et son adresse administrative ne sont pas encore publiées sur cette version du site; elles doivent être ajoutées avant l’exploitation publique. Pour une question ou une demande relative à vos données, contactez l’assistance au <a href="https://wa.me/2250102749775" target="_blank" rel="noreferrer">+225 01 02 74 97 75 sur WhatsApp</a>. Une vérification raisonnable de votre identité peut être demandée avant toute communication ou suppression.</p>
            </section>
            <section>
              <h2>Données traitées</h2>
              <p>Selon votre usage, nous traitons les informations de compte client (prénom, nom, téléphone, adresse e-mail et mot de passe sous forme hachée), les informations de boutique et de son responsable, le catalogue, les prix, stocks et horaires, ainsi que les données techniques de session nécessaires à la sécurité. Si vous choisissez Google ou Apple, nous recevons l’identifiant propre à ce fournisseur et les informations de profil qu’il transmet (notamment l’e-mail vérifié et, lorsqu’il est disponible, le nom). Le mot de passe de votre compte Google ou Apple ne nous est jamais transmis.</p>
              <p>Pour une commande, nous traitons le nom, le téléphone, le lieu et les indications de livraison, le créneau éventuel, les articles, quantités, options, montant recalculé, statut et date. Le moyen de paiement enregistré est une préférence (espèces, mobile money, Wave ou à convenir), et non une donnée de carte ou une preuve de paiement.</p>
            </section>
            <section>
              <h2>Vérification d’identité des commerçants</h2>
              <p>Le parcours de vérification peut traiter le type de pièce, les images du recto et du verso, un selfie, les champs extraits par OCR (notamment nom, prénom, date de naissance et texte reconnu), le numéro de document sous forme d’empreinte HMAC et ses quatre derniers caractères, un score de comparaison faciale, le statut, la méthode et les dates de décision, ainsi qu’une note de revue.</p>
              <p>L’OCR et la comparaison faciale sont exécutés dans le navigateur. Après réception par le serveur, les images et les données extraites sont chiffrées au repos avec AES-GCM lorsque la clé KYC de production est correctement configurée. Les dossiers sont accessibles aux administrateurs autorisés pour la revue. Les décisions automatiques dépendent de valeurs calculées par le navigateur et peuvent être falsifiées; elles ne prouvent ni le caractère authentique du document ni la présence réelle de la personne. Aucun contrôle de vivacité n’est effectué. Il s’agit d’un prototype, pas d’une vérification certifiée.</p>
            </section>
            <section>
              <h2>Finalités et bases d’utilisation</h2>
              <p>Les données servent à créer et gérer les comptes, publier les vitrines, traiter les commandes et leur suivi, assurer la vérification des commerçants, fournir l’assistance, protéger les comptes et prévenir les abus. Les statistiques de fréquentation ne sont envoyées que si vous les autorisez dans la bannière ou sur la page Cookies. Les données nécessaires à une fonctionnalité sont utilisées pour fournir celle-ci; les statistiques reposent sur votre choix; les mesures de sécurité répondent au fonctionnement et à la protection du service.</p>
            </section>
            <section>
              <h2>Commandes et services tiers</h2>
              <p>MaTable.ci ne collecte pas le paiement de la vente. Le commerçant reçoit les informations nécessaires à la préparation de la commande. Si vous choisissez d’ouvrir WhatsApp, vous quittez MaTable.ci; WhatsApp/Meta traite alors les informations que vous lui transmettez selon ses propres conditions. MaTable.ci enregistre uniquement le clic de redirection associé à la commande, pas l’ouverture effective de l’application ni l’envoi ou le contenu du message.</p>
            </section>
            <section>
              <h2>Destinataires et hébergement</h2>
              <p>Les données de commande sont accessibles au commerçant concerné et aux personnes autorisées à administrer le service. Les données d’identité sont limitées aux personnes habilitées à examiner les dossiers. Les prestataires d’hébergement et de base de données configurés par l’exploitant peuvent traiter des données pour fournir l’infrastructure; leur identité et la région effective d’hébergement doivent être confirmées pour le déploiement utilisé. MaTable.ci ne vend pas les données personnelles.</p>
            </section>
            <section>
              <h2>Durées de conservation</h2>
              <p>Les données sont conservées selon la durée nécessaire aux comptes, boutiques, commandes, vérifications et obligations applicables. À la date de cette politique, l’application ne configure ni échéance de conservation ni purge automatique pour les comptes, commandes, images KYC ou événements statistiques. Une demande d’effacement peut être adressée à l’assistance; elle sera examinée au regard des obligations de conservation et des données nécessaires à la sécurité ou aux litiges. L’exploitant doit définir les durées par catégorie et mettre en place leur application avant la production.</p>
            </section>
            <section>
              <h2>Sécurité et droits</h2>
              <p>Les accès aux comptes reposent sur des sessions sécurisées; les mots de passe clients sont hachés et les données KYC sont chiffrées côté serveur lorsque la clé est configurée. Aucune mesure ne peut garantir un risque nul. Vous pouvez demander l’accès, la rectification, la suppression ou la limitation des données vous concernant et poser une question sur leur traitement en contactant l’assistance. Les demandes sont traitées après vérification et sous réserve des obligations applicables.</p>
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
              <p>La commande enregistrée est une demande de commande et non un paiement. MaTable.ci peut réserver le stock et afficher le montant calculé à partir du catalogue. Le client et le vendeur confirment directement la disponibilité, la livraison, les frais éventuels et le paiement. La plateforme n’intègre actuellement aucun paiement, ne reçoit pas les fonds et ne confirme pas qu’un règlement a eu lieu.</p>
            </section>
            <section>
              <h2>Comptes et parcours commerçant</h2>
              <p>Le commerçant doit fournir des informations exactes, protéger ses identifiants et liens d’accès privés, maintenir son catalogue à jour et respecter les règles applicables à ses ventes. La création d’une boutique ne la publie pas automatiquement. La publication peut dépendre de la vérification d’identité et d’un essai ou forfait actif. La vérification d’identité est un prototype reposant notamment sur des contrôles exécutés dans le navigateur; elle ne certifie pas l’identité ni l’authenticité d’une pièce.</p>
              <p>Le parcours actuel propose un essai de 30 jours après activation, avec un maximum de 6 articles durant l’essai. Les forfaits affichés sont Standard à 3 000 FCFA, Premium à 4 000 FCFA et Pro à 5 000 FCFA par mois. Les paiements, renouvellements automatiques et différences de fonctionnalités entre forfaits ne sont pas activés; aucun paiement n’est demandé au démarrage de l’essai.</p>
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
              <p>Si vous y consentez, MaTable.ci enregistre des événements de consultation sur ses propres serveurs : identifiant de session aléatoire, boutique consultée, chemin de page et date. L’identifiant temporaire est conservé dans le stockage de session du navigateur. Ces événements servent à produire des statistiques internes et sont pseudonymisés, mais ne sont pas présentés comme anonymes. L’application n’utilise actuellement pas de cookie d’analyse tiers ni de régie publicitaire.</p>
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
