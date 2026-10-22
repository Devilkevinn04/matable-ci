# Plan d'execution MaTable.ci

Ce document fixe les responsabilites et l'ordre de livraison. Les statuts sont manuels et ne remplacent pas les tests ni la recette.

## Matrice des responsabilites

R = realise; A = responsable final; C = consulte; I = informe.

| Domaine | Super-admin | Admin verification | Marchand | Client | Backend |
|---|---|---|---|---|---|
| Comptes, boutiques et acces | A/R | I | R pour sa boutique | R pour son compte | R pour les controles et donnees |
| Identite et moderation | A | R dans son perimetre | C pour ses justificatifs | C pour ses signalements | R pour les regles, preuves et journal |
| Abonnements et offres | A/R | I | C, choisit et paie | I | R pour tarifs, droits et echeances |
| Finances et remboursements | A/R | I | I sur ses paiements | I sur ses commandes | R pour transactions, rapprochement et audit |
| Catalogue, disponibilite et commandes | I / diagnostic | I si necessaire | A/R | R pour ses demandes | R pour validation et synchronisation |
| Site public et parcours client | A sur les regles plateforme | I | R sur les informations publiees | A/R sur son parcours | R pour APIs, confidentialite et disponibilite |
| Migrations, sauvegardes et deploiement | A | I | I | I | R |

Les permissions sont appliquees et verifiees par le backend. L'interface ne constitue jamais une autorisation.

## Priorites et dependances

| Priorite | Module | Depend de | Validation avant suite |
|---|---|---|---|
| P0 | Secrets, archives et environnements | Aucune | Aucun secret, dump, `.git`, dependance ou donnees locales dans un livrable partage |
| P0 | Authentification, sessions et roles | Source de donnees et contrats API | Tests d'acces autorise/interdit sur chaque role, y compris routes directes |
| P0 | Source de verite abonnements/offres | Authentification, schema et politique commerciale | Prix, limites et avantages identiques dans checkout, serveur, dashboard, SEO et finances |
| P0 | Finances, paiements et audit | Intentions de paiement et abonnements coherents | Montants rapproches, idempotence, journal d'audit et aucun acces non autorise |
| P0 | Sauvegardes, migrations et retour arriere | Schema stabilise | Restauration validee sur cible jetable et procedure de rollback documentee |
| P1 | Dashboard marchand et merchandising | Permissions et entitlements | Catalogue, prix, stock, disponibilite et commandes coherents avec le site public |
| P1 | Site public et espace client | Donnees boutiques/catalogue fiables | Recherche, fiche, commande et suivi valides de bout en bout |
| P1 | Administration et verification | Authentification et journalisation | Actions par role testees, effets visibles dans les espaces concernes |
| P1 | Tutoriels et aide | Parcours reel stabilise | Chaque etape renvoie vers une fonction existante et testee |
| P1 | Design et recette | Modules fonctionnels | Recette mobile/desktop, accessibilite et regressions passees |

Ordre de dependance: securite et donnees -> roles -> offres/abonnements -> finances -> parcours marchands et clients -> tutoriels -> recette -> deploiement.

## Etat d'execution

- Fait localement: exclusion des secrets, dumps, sauvegardes, logs et artefacts sensibles du generateur d'archives.
- Fait localement: refus fail-closed des routes admin lorsque les gardes ne sont pas configurees, avec test de regression.
- Fait localement: grille de tarifs initiale Standard 3 000 FCFA / 20 articles, Premium 5 000 FCFA / catalogue illimite, Pro 8 000 FCFA / catalogue illimite; les montants mensuels sont maintenant configurables par Super-admin.
- Fait localement: FAQ, CGU, README, SEO, checkout GeniusPay et reporting financier alignes sur les valeurs tarifaires initiales de 3 000 / 5 000 / 8 000 FCFA; les vues et nouveaux paiements lisent maintenant les tarifs administrables.
- Fait localement: edition Super-admin des trois tarifs mensuels, validation, stockage SQLite/PostgreSQL, audit, prix publics dynamiques et instantane des montants des intentions de paiement.
- Fait localement: migration `028_subscription_plan_prices` ajoutee au runner PostgreSQL; un test verifie que tous les fichiers SQL versionnes sont enregistres. Les tests locaux de sauvegarde/restauration couvrent checksum, cible non vide, source identique et preflight.
- Fait localement: changement de formule administrable avec prise d'effet a la prochaine echeance; les droits payes sont conserves jusque-la, le checkout impose la formule programmee, et une correction d'echeance met a jour sa date d'effet. Programmation, annulation, audit, refus par role, etat obsolete et calcul des droits ont des tests.
- Fait localement: migration `029_scheduled_subscription_tier` ajoutee aux schemas SQLite/PostgreSQL et au runner PostgreSQL; les champs du changement programme restent coherents dans les repositories.
- Validation de cette tranche: `npm test` (160 tests, 159 réussis, 0 échec, 1 ignoré), `npm run lint`, `npm run build` et `git diff --check` réussis.
- Fait localement: cycle de vie administratif distinct de l’activation globale de la boutique; résiliation à l’échéance, suspension immédiate des droits et réactivation uniquement si la période payée/d’essai reste valide. Les paiements en attente bloquent les opérations incompatibles; les renouvellements sont bloqués pendant la résiliation programmée ou une suspension administrative.
- Fait localement: migration `030_subscription_lifecycle_controls` pour la date de résiliation et la trace de suspension réversible; les changements d’échéance mettent à jour une résiliation programmée. Toutes les transitions sont inscrites au journal d’audit existant, consultable avec pagination et recherche.
- Validation de cette tranche: `npm test` (162 tests, 161 réussis, 0 échec, 1 ignoré), `npm run lint`, `npm run build` et `git diff --check` réussis.
- Fait localement: limites numériques Pro administrables (catalogue illimité ou plafond, photos par article, jours de statistiques et remise sur les boosts), affichées dans les formules et appliquées côté interface et serveur. Nouveaux abonnements : valeurs courantes; abonnements Pro en cours : snapshot conservé jusqu’au prochain renouvellement. Mise à jour optimiste, validation, audit, migration `031_subscription_plan_features` et snapshots d’échéance inclus.
- Validation de cette tranche: `npm test` (166 tests, 165 réussis, 0 échec, 1 ignoré), `npm run lint`, `npm run build` et `git diff --check` réussis; tests couvrant bornes, autorisations, persistance/audit et effet au renouvellement. L’intégration PostgreSQL a aussi réussi sur un cluster local temporaire isolé, bootstrap vierge et migrations comprises; le cluster et ses données ont été supprimés. Aucune migration distante n’a été exécutée.
- Recette navigateur locale: serveur isolé sur une base SQLite temporaire et clés de test, sans chargement de `.env`. L’écran Super-admin a chargé les tarifs et limites, puis enregistré un scénario Pro de 120 articles, 8 photos, 180 jours de statistiques et 20 % de remise; la page Formules a affiché ces valeurs. Largeurs 390 px et 1 440 px vérifiées sans débordement horizontal. Aucun paiement ni commande déclenché; serveur arrêté et base temporaire supprimée.
- Fait localement: détail de compte réservé au Super-admin, accessible depuis le répertoire clients; affiche l’identité déjà disponible, l’état et les 50 commandes liées les plus récentes (boutique, date, statut, quantité et montant demandé). Les informations de livraison, le contenu des articles, les sessions et les secrets d’authentification ne sont pas renvoyés.
- Validation du détail client: `npm test` (162 tests, 161 réussis, 0 échec, 1 ignoré), `npm run lint`, `npm run build` et `git diff --check` réussis; tests couvrant accès anonyme, rôle verification, compte absent, forme minimale des données et historique de commandes.
- Fait localement: repères d’administration adaptés aux rôles; les Super-admins accèdent directement aux espaces boutiques/comptes, finances/abonnements et audit/opérations, tandis que l’équipe de vérification dispose d’un guide de traitement limité à la consultation, aux statuts Didit et à la modération. Le guide rappelle de ne jamais demander d’identifiants ou codes secrets.
- Fait localement: la visite publique propose aux commerçants déjà inscrits un accès direct à leur tableau de bord et à sa checklist, sans détour par le parcours de création de boutique.
- Fait localement: la visite guidée peut être mise en pause/reprise; elle ne défile plus automatiquement lorsque la préférence système « réduire les animations » est active, et ses libellés indiquent le mode manuel.
- Fiabilisation admin: `showNotice` est maintenant initialisé avant les callbacks asynchrones qui l’utilisent, supprimant le risque d’accès avant initialisation observé pendant le chargement. `npm test` (168 tests, 167 réussis, 0 échec, 1 ignoré), `npm run lint`, `npm run build` et `git diff --check` réussis.
- Fait localement: guides personnels distincts du client, du marchand, du Super-admin et de la vérification; plus de sélecteur ni de liste globale des rôles. Chaque tableau de bord expose son guide repliable; les progressions client et marchand sont scindées par identifiant de compte/boutique, celles des administrateurs par rôle (l’authentification admin actuelle ne fournit pas d’identifiant individuel). Les étapes et erreurs de stockage sont annoncées.
- Adaptation à la demande: la page `/guide` affiche un seul parcours selon le rôle sélectionné par le lien d’accès; progression réutilisable par compte via le scope fourni par l’espace connecté. Aucun secret ni détail de compte n’est enregistré dans la progression.
- Validation des guides: `npm test` (168 tests, 167 réussis, 0 échec, 1 ignoré), `npm run lint`, `npm run build`, `git diff --check` et tests unitaires ciblés réussis. En recette locale isolée, comptes clients de test distincts, boutique créée pour la recette, liens individuels de compte vers guide et rôles Super-admin/vérification ont été vérifiés; les progressions client et marchand sont isolées et reprises, sans identifiant personnel exposé dans l’URL. La page guide seule ne déborde pas à 390 px ni à 1 440 px. Le correctif du dashboard client a été mesuré dans le navigateur avec un compte fictif: largeur document = fenêtre à 320, 390 et 1 440 px, donc aucun débordement horizontal. Serveur, compte et base temporaires supprimés; aucun paiement ni commande métier déclenché.
- Recette visuelle locale isolée: le tutoriel, l’accueil public et les espaces Super-admin, vérification et marchand ont été ouverts dans un navigateur avec un serveur local, une base SQLite jetable, des données de démonstration et des clés de test uniquement. Les parcours authentifiés ont été parcourus sans déclencher de mutation métier. Tutoriel, accueil et dashboards admin/marchand vérifiés à 390 px; tutoriel, vues admin et espace marchand vérifiés à 1 440 px; aucun débordement horizontal ni contrôle interactif sans nom accessible dans les vues examinées. Les parcours navigués (boutiques, commandes, clients, abonnements, opérations) se sont chargés; la page publique a affiché le catalogue de démonstration. Pause et préférence « réduire les animations » testées dans le navigateur. Aucune donnée réelle, production ou API distante n’a été utilisée; la certification visuelle sur l’environnement cible est différée faute de préproduction.
- Vérification complémentaire du parcours client: fiche publique de boutique et formulaire de panier/commande parcourus sur mobile et desktop sans soumettre la commande. Le formulaire restaurant affiche son créneau de retrait/livraison avec un label associé; les champs de contact, précision et commune personnalisée sont correctement associés à leurs libellés. Le test navigateur a révélé puis permis de corriger les noms accessibles du bouton de fermeture et des contrôles de quantité; aucun contrôle non nommé ni débordement horizontal dans le formulaire vérifié.
- Fait localement: comparaison automatisee des tables, colonnes et index nommes entre le schema SQLite initialise et le bootstrap PostgreSQL combine aux migrations versionnees. Elle a detecte puis corrige l'index manquant `idx_customer_oauth_user_id` dans SQLite.
- Fait localement sur un cluster PostgreSQL temporaire : bootstrap vierge, 28 migrations versionnees, second passage idempotent, test de l'adaptateur, verification de types/defauts/contraintes, rollback transactionnel DDL et sauvegarde/restauration reelle vers une base neuve contenant une ligne de test restauree et verifiee.
- Differe (absence de preproduction): la restauration de donnees metier representatives et le rollback d'un deploiement complet sur l'environnement vise ne seront pas executes pour l'instant. La validation locale PostgreSQL sur cluster jetable (bootstrap, migrations, rollback transactionnel et restauration vers une base neuve) est faite; aucun fournisseur PostgreSQL distant ni aucune production n'ont ete testes. Reprendre cette etape uniquement si un environnement de preproduction isole devient disponible.
- Les changements ci-dessus ne sont pas encore commités ni deployes.
