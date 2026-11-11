# État d’avancement de MaTable

État au **11 novembre 2026**, d’après le code, les tests locaux et les contrôles
de production indiqués ci-dessous. Ce document décrit l’étendue fonctionnelle
actuelle ; il ne remplace pas les guides détaillés ni les vérifications des
fournisseurs.

## Corrections récemment déployées

La PR #2 (`fix: address audit findings`) a été fusionnée vers `production` et
déployée le 11 novembre 2026 sous le commit `fdc2bc8`. Le conteneur était
`healthy` après bascule ; le smoke test public post-déploiement a réussi ses 47
contrôles. Le parcours d’âge n’a pas été vérifié en direct faute de boutique de
production avec un produit réservé aux adultes.

- La politique CSP autorise les origines HTTPS des stockages configurés pour
  les téléversements directs vers R2.
- La tâche périodique de nettoyage des sessions journalise ses erreurs au lieu
  de laisser un rejet non traité.
- La déduplication analytics est atomique via un index unique ; la migration
  retire les doublons historiques en conservant le premier événement.
- L’adresse de facturation GeniusPay est utilisée pour le paiement sans
  remplacer l’adresse propriétaire vérifiée, utilisée notamment pour le MFA.
- La vérification MFA de connexion admin reste accessible pendant le mode
  maintenance.
- Les tailles et couleurs de commande sont contrôlées par type et par rapport
  aux options du produit ; les modificateurs acceptés sont normalisés et leur
  supplément est recalculé côté serveur.
- Les favoris et mentions J’aime ne s’appliquent pas aux produits indisponibles.
- Les produits soumis au contrôle d’âge nécessitent un jeton HMAC limité à la
  boutique, valable 30 minutes, pour le catalogue et la commande. La date de
  naissance déclarative n’est pas conservée ; ce contrôle n’est pas une preuve
  d’identité. Le catalogue concerné n’est pas mis en cache.
- `AGE_VERIFICATION_SECRET` est exigé en production et sa configuration est
  vérifiée au démarrage.

La validation locale avant déploiement a exécuté `npm run test:ci` :
303 tests (302 réussis, aucun échec et un ignoré) ; `npm run lint` et
`npm run build` ont réussi. Le test navigateur local du contrôle d’âge a aussi
confirmé le refus d’une date mineure, l’accès après une date admissible et
l’absence de stockage de la date dans le navigateur. Les tests GeniusPay sont
dans `tests/geniuspay.test.ts`.

Le nom historique `migrations/015_kadevpay_subscription_payments.sql` est
conservé volontairement : le runner enregistre le nom complet de chaque
migration dans `schema_migrations`. Le renommer ferait apparaître une nouvelle
version et pourrait réexécuter une migration déjà appliquée ; son nom ne
représente pas le fournisseur de paiement actuellement utilisé.

## Production et déploiement

Vérifications publiques réalisées le **11 novembre 2026** : après le
déploiement du commit `fdc2bc8`, le conteneur `matable-web` était sain et
`https://matable-ci.com/health` répondait avec l’état `ok`. Le smoke test public
en lecture seule a réussi ses 47 contrôles (pages, API, ressources et
en-têtes). Le secret `AGE_VERIFICATION_SECRET` était présent et suffisamment
long.

- Le site est hébergé sur un VPS Hostinger, avec l’application dans Docker et
  PostgreSQL dans un conteneur séparé.
- Le commit `0bce997` a été déployé avec succès. Le conteneur MaTable a été
  confirmé `healthy` après son démarrage.
- La MFA par e-mail est configurée. L’envoi dépend de Resend, de son domaine
  expéditeur vérifié et des adresses de sécurité conservées dans la
  configuration privée du VPS. Les comptes existants ont une période de
  transition de 30 jours à partir de la date de démarrage configurée ; les
  connexions Super-admin et Admin de vérification exigent la MFA dès cette date.
- Le code contient désormais des rappels dans les comptes client et marchand,
  une preuve d’adresse par code et un parcours guidé pour les boutiques sans
  e-mail ou dont l’adresse doit être remplacée. À la connexion MFA réussie,
  l’adresse est marquée vérifiée. Après déploiement, l’avis e-mail aux comptes
  existants qui ont déjà une adresse reste une action manuelle, idempotente :
  `docker exec matable-web node /app/scripts/send-email-mfa-rollout-notices.mjs`.
  Les utilisateurs sans adresse e-mail ne peuvent être contactés par ce canal ;
  il faut les informer par un autre moyen. Leur déploiement en production
  n’est pas confirmé par les vérifications consignées ici.
- Une sauvegarde PostgreSQL datée du 8 novembre a été vérifiée par checksum et
  reconnue comme archive lisible par `pg_restore`.
- Le timer systemd `matable-auto-deploy.timer` est actif sur le VPS. Lors de
  l’audit du déploiement, son override exécutait un outil installé hors du
  dépôt, qui lisait `MATABLE_RELEASE_SHA` dans Portainer et suivait encore la
  branche `production`. Cette dérive a rendu la dernière publication
  inutilement complexe.
- La procédure cible est désormais une seule branche de livraison : PR vers
  `main`, puis approbation SSH du SHA fusionné. La synchronisation initiale de
  `main` avec la version déployée et l’installation du script versionné restent
  à effectuer ; jusqu’à cette migration, continuer à utiliser l’ancienne
  procédure opérationnelle.

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
- Les invitations et la récupération d’accès des ambassadeurs utilisent Resend
  quand il est configuré. Les liens expirent après sept jours et sont à usage
  unique ; la récupération ne révèle pas si l’adresse e-mail est enregistrée.
  En cas d’échec d’envoi d’une invitation par l’administration, un lien de
  secours est proposé dans la session d’administration.
- La candidature publique des ambassadeurs est disponible sur
  `/ambassadeur/inscription` ; le Super Admin peut copier ce lien depuis la
  rubrique Partenaires. Une candidature ne crée aucun compte ni code avant
  approbation ; le refus exige un motif et est journalisé.

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
