# État d’avancement de MaTable

État au **8 novembre 2026**, d’après le code du dépôt et les vérifications de
production effectuées pendant cette session. Ce document décrit l’étendue
fonctionnelle actuelle ; il ne remplace pas les guides détaillés ni les
vérifications des fournisseurs.

## Production et déploiement

- Le site est hébergé sur un VPS Hostinger, avec l’application dans Docker et
  PostgreSQL dans un conteneur séparé.
- Le commit `0bce997` a été déployé avec succès. Le conteneur MaTable a été
  confirmé `healthy` après son démarrage.
- La MFA par e-mail est configurée. L’envoi dépend de Resend, de son domaine
  expéditeur vérifié et des adresses de sécurité conservées dans la
  configuration privée du VPS. Les comptes existants ont une période de
  transition de 30 jours à partir de la date de démarrage configurée ; les
  connexions Super-admin et Admin de vérification exigent la MFA dès cette date.
- Une sauvegarde PostgreSQL datée du 8 novembre a été vérifiée par checksum et
  reconnue comme archive lisible par `pg_restore`.
- Le timer systemd `matable-auto-deploy.timer` est actif sur le VPS. Il vérifie
  `main` périodiquement ; son premier passage a construit puis déployé le
  commit `3d3dcc2`, et le service était sain après déploiement.
- Pour chaque nouveau commit sur `main`, le VPS récupère les sources, exécute
  le lint, les tests CI et le build dans Docker, puis ne remplace que le service
  Web MaTable. Le contrôle de santé a jusqu’à trois minutes ; en cas d’échec,
  la configuration précédente et son image sont remises en service. Les
  changements sur une autre branche ne sont pas déployés tant qu’ils ne sont
  pas fusionnés dans `main`.

L’automatisation ne rend pas les changements de schéma incompatibles
automatiquement réversibles. Une migration qui supprime ou transforme des
données, un changement de fournisseur ou une opération nécessitant une fenêtre
de maintenance doit être planifié séparément.

## Fonctionnalités présentes dans le code

### Vitrines et parcours client

- Annuaire, recherche et pages publiques de boutiques ; catalogue filtrable,
  disponibilité des produits et personnalisation visuelle.
- Inscription et connexion client, gestion du compte et sessions ; des parcours
  OAuth Google et Apple sont prévus dans le code et nécessitent les identifiants
  des fournisseurs.
- Commandes client avec choix de produits et options, recalcul du prix côté
  serveur, réservation de stock et suivi de la réponse du commerçant.
- Le paiement d’une commande se fait directement avec la boutique, notamment
  par WhatsApp : le checkout d’abonnement MaTable ne constitue pas un paiement
  de commande.
- Favoris, avis et signalements, sous réserve des règles d’accès et de
  modération du serveur.

### Espace commerçant

- Création de boutique, catalogue et gestion des produits, options, photos,
  stock, horaires, apparence et publication.
- Tableau de bord pour commandes, statistiques, partage, QR code, import/export
  du catalogue et export des commandes.
- Abonnement avec essai, niveaux de forfait et visibilité de la boutique selon
  les statuts de publication, de vérification et de paiement.
- Abonnements et boosts intégrés au code avec GeniusPay : la configuration du
  compte marchand, des clés et du webhook reste nécessaire. Les paiements ne
  déclenchent pas de prélèvement automatique récurrent.
- Notifications navigateur et rappels : l’envoi réel dépend de l’activation
  consentie par le commerçant, des clés VAPID et, pour les courriels,
  d’expéditeurs et de clés fournisseurs valides.

### Administration et opérations

- Deux rôles serveur distincts : Super-admin et administrateur de vérification,
  avec des permissions limitées et des files de modération.
- Gestion de boutiques, abonnements, vérifications d’identité, commandes en
  attente, signalements, avis et journal d’audit selon le rôle.
- Vérification d’identité marchand intégrée au parcours ; les appels réels à
  Didit requièrent les paramètres du fournisseur.
- Outils d’ambassadeurs et de campagnes/partenariats existent dans le code ;
  les commissions et demandes enregistrées ne réalisent pas de transferts
  financiers automatiques.

## Fonctions en veille ou non autonomes

- **Livraison MaTable : en veille.** Les écrans opérationnels et routes de
  production ne doivent pas être réactivés ; les données et migrations
  historiques sont conservées.
- **Publicité et partenariats :** le code de campagnes et de suivi est présent,
  mais la bêta reste soumise à son indicateur de configuration, à la modération
  et à une autorisation de lancement. La présence du code ne signifie pas que
  des campagnes sont actives.
- **Passage aux microservices :** seule une fondation de passerelle est
  documentée ; le backend Express monolithique reste la source de vérité métier.
  Les domaines de l’API versionnée ne sont pas encore migrés vers des services
  autonomes.
- **Dépendances externes :** la présence d’une intégration dans le dépôt ne
  prouve pas qu’un compte fournisseur, un webhook, une clé ou une autorisation
  de production fonctionne. Vérifier séparément Resend, Didit, GeniusPay,
  VAPID, R2 et OAuth avant de compter sur chaque fonction en production.
- **Paiement en ligne des commandes :** non implémenté comme checkout MaTable ;
  les commandes sont réglées directement auprès des boutiques.

## Données, tests et suite du développement

- Le développement local et une partie des tests utilisent SQLite. La
  production utilise PostgreSQL via `DATABASE_URL`; les évolutions de schéma
  sont versionnées dans `migrations/`.
- Le dépôt contient lint TypeScript, tests unitaires/intégration, tests
  PostgreSQL et build de production. Le workflow PostgreSQL GitHub Actions
  vérifie les changements sur les pull requests et les pushes.
- Le Dockerfile Hostinger exécute lint, tests CI et build avant de produire
  l’image de production. Le timer VPS ne déploie que `main`.
- Pour une prochaine évolution, séparer explicitement ce qui est livré dans le
  code, ce qui a été activé par configuration et ce qui a été vérifié en
  production ; préserver la sauvegarde, le contrôle de santé et le retour
  arrière pour tout changement à risque.

## Références

- [Guide de déploiement VPS](../infra/hostinger/README.md)
- [Description fonctionnelle du projet](../README.md#état-actuel)
- [Fondation de migration multiservice](./MULTISERVICE_MIGRATION.md)
- [Programme ambassadeurs](./PROGRAMME_AMBASSADEURS.md)
- [Audit publicité et partenariats](./AUDIT_PUBLICITE_PARTENARIATS.md)
