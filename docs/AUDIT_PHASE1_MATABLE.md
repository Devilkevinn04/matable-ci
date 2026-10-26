# Rapport d’audit — Phase 1

Date initiale : 21 octobre 2026

Le rapport ci-dessous conserve le périmètre de l’audit initial. Son état de
suivi est actualisé après les tranches locales consignées dans
`PLAN_EXECUTION_MATABLE.md`; les validations locales ne valent pas certification
de l’environnement cible.

## Périmètre et méthode

Inventaire du dépôt, lecture des points d’entrée React/Express, des routes
principales, de la configuration des abonnements, du schéma et des migrations,
des documents fonctionnels, et de la suite de tests. Le contenu de `.env` et
des sauvegardes de base de données n’a pas été consulté.

Vérifications exécutées :

| Vérification | Résultat |
|---|---|
| `npm test` | Réussi |
| `npm run lint` | Réussi |
| `npm run build` | Réussi |

Ces résultats valident le comportement couvert par les tests locaux et la
compilation; ils ne constituent pas une recette en production ni une preuve de
fonctionnement des fournisseurs externes.

## Architecture et flux principaux

- **Frontend** : React 19, TypeScript et Vite. `src/App.tsx` expose l’annuaire,
  les fiches publiques, l’espace client, l’espace marchand, l’administration,
  la FAQ, les pages légales et le parcours « comment ça marche ».
- **Backend** : Express 5 et TypeScript, démarré par `server.ts`. Les routes
  métier sont organisées dans `server/routes/`; les sessions et règles sont
  notamment dans `server/services/` et `server/repositories/`.
- **Données** : SQLite en local et pour les tests; PostgreSQL lorsque
  `NODE_ENV=production`. Les données métier principales couvrent boutiques,
  produits, commandes, comptes clients, sessions, paiements d’abonnement,
  boosts, vérifications, notifications, analytique et journal d’audit.
- **Schéma** : le schéma SQLite et les évolutions au démarrage sont déclarés
  dans `db.ts`. Le bootstrap PostgreSQL a également ses déclarations dans
  `db.ts`; les 30 fichiers de `migrations/` sont appliqués séparément par
  `scripts/migrate-neon.ts`.
- **Services externes** : GeniusPay (paiements d’abonnement et de boosts),
  Didit (vérification d’identité), Resend (reçus), OAuth Google/Apple,
  notifications Push et WhatsApp Business selon configuration.
- **Passerelle** : `services/api-gateway/` et `infra/docker-compose.yml`
  fournissent une passerelle de développement; les routes métier restent dans
  le serveur Express.

## Cartographie fonctionnelle et état

| Domaine | État observé |
|---|---|
| Site public, annuaire, boutiques et catalogue | Présent; contrôles de visibilité et parcours client implémentés. Tests ciblent notamment recherche, SEO, panier, commandes et attribution. |
| Comptes clients | Inscription, connexion, OAuth facultatif, sessions, profil, export et suppression présents côté serveur. |
| Inscription et dashboard marchand | Présents; gestion du catalogue, variantes/attributs par catégorie, commandes, statistiques, apparence, publication, abonnements, boosts et notifications. |
| Commandes | Enregistrement et recalcul des prix côté serveur; stock traité transactionnellement. La commande ouvre ensuite WhatsApp; ce n’est pas un paiement de commande en ligne. |
| Administration Super Admin | Présente pour boutiques, commandes, répertoire et détail de comptes clients, paiements, abonnements, maintenance, annonces et journal d’audit; les données du détail client sont minimisées et les opérations restent soumises aux rôles. |
| Administration de vérification | Périmètre séparé pour vérification Didit et modération; contrôles de rôle côté serveur et vues de boutiques en lecture seule. |
| Offres et droits | Prix des formules configurables par Super Admin. Les limites numériques Pro (catalogue, photos, période analytique) et la remise sur les boosts sont également configurables; la modification est immédiate pour les nouveaux abonnements et prend effet au prochain renouvellement pour les abonnements Pro existants. |
| Aide et accompagnement | Guide individuel selon le rôle, sans sélecteur global, intégré sous forme repliable aux espaces client, marchand et admin. Progression locale séparée par compte client/boutique et par rôle admin; l’authentification admin actuelle n’identifie pas les personnes distinctement. Recette locale avec comptes clients et boutique de test effectuée. Correctif structurel du dashboard client vérifié dans le navigateur: largeur document égale à la fenêtre à 320, 390 et 1 440 px, sans débordement horizontal. Certification cible non effectuée. |
| Tests et déploiement | Suite locale, contrôles TypeScript et build disponibles et réussis. Des recettes isolées locales ont couvert les principaux parcours public, client et administratifs; aucune certification de l’environnement cible, aucun déploiement ni test réel des fournisseurs n’a été effectué. |

## Problèmes confirmés et propositions

| Priorité | Problème et cause | Fichiers concernés | Dépendances / correction proposée |
|---|---|---|---|
| P0 — traité | **Offres commerciales désynchronisées dans les textes.** Les valeurs tarifaires initiales Standard 3 000, Premium 5 000 et Pro 8 000 FCFA et les limites de catalogue ont été alignées dans le README, la FAQ et les mentions sur l’abonnement. La page Formules et le checkout utilisent désormais les tarifs configurés par le Super-admin. | `src/utils/subscriptionFeatures.ts`, `README.md`, `src/utils/faqContent.ts`, `src/components/LegalPages.tsx`, `tests/subscription-catalog.test.ts` | Les tests vérifient les tarifs initiaux, les limites et les renvois des textes publics vers la grille de tarifs dynamique. |
| P0 — traité localement, limites de périmètre | **Configuration tarifaire et avantages numériques Pro.** Le Super Admin peut modifier les trois tarifs mensuels et les paramètres numériques du plan Pro : limite d’articles (ou illimitée), photos par article, jours de statistiques et remise sur les boosts. | `src/utils/subscriptionFeatures.ts`, `server/routes/admin.ts`, `src/components/AdminSubscriptionPlanFeatures.tsx`, `src/components/AdminDashboard.tsx`, `db.ts`, `migrations/028_subscription_plan_prices.sql`, `migrations/031_subscription_plan_features.sql` | Configuration persistée, validée et auditée. Les nouvelles offres utilisent les valeurs courantes; les abonnements Pro existants conservent leur snapshot jusqu’à leur prochain renouvellement. Les paiements déjà créés gardent leur montant. Les inclusions qualitatives (personnalisation, réseaux sociaux, modes) restent définies dans le code. |
| P1 — traité localement | **Cycle de vie des abonnements administratifs.** Changement de formule à échéance, résiliation à échéance, suspension immédiate distincte de la désactivation de boutique, réactivation conditionnelle, audit et conflits de paiements en attente sont maintenant couverts. | `server/routes/admin.ts`, `src/components/AdminDashboard.tsx`, `server/services/businessRules.ts`, `server/routes/geniusPay.ts`, `migrations/029_scheduled_subscription_tier.sql`, `migrations/030_subscription_lifecycle_controls.sql` | Tests d’intégration et validations locales réussis. La recette sur l’environnement cible et les fournisseurs externes reste hors de ce constat. |
| P1 — traité localement | **Détail de compte client Super Admin.** Le répertoire expose une vue détaillée avec identité déjà disponible, état et jusqu’à 50 commandes récentes; les informations de livraison, articles, sessions et secrets d’authentification ne sont pas renvoyés. | `server/routes/admin.ts`, `src/components/AdminDashboard.tsx`, `src/components/adminDashboardTypes.ts`, `tests/full-flow.test.ts` | Les tests couvrent les accès anonymes et par rôle, le compte absent et la forme minimisée des données. Conserver les contrôles de rôle, la minimisation et l’audit pour toute extension. |
| P1 — traité localement | **Accompagnement opérationnel individuel.** Chaque espace affiche uniquement son guide repliable; la page guide autonome ne présente plus les rôles ensemble. La progression est isolée par compte client/boutique et, pour l’admin, par rôle faute d’identifiant individuel fourni par l’authentification. | `src/components/UserGuidePage.tsx`, `src/utils/guideProgress.ts`, `src/components/CustomerAuth.tsx`, `src/components/MerchantDashboard/index.tsx`, `src/components/AdminDashboard.tsx` | Tests unitaires, lint, build et recette locale avec comptes de test réussis; la certification sur l’environnement de recette reste à effectuer. |
| P1 — suivi local effectué, simplification encore ouverte | **Deux sources d’évolution de schéma restent à maintenir.** Le bootstrap SQLite/PostgreSQL dans `db.ts` coexiste avec les fichiers SQL versionnés, pilotés par un runner distinct. | `db.ts`, `migrations/`, `scripts/migrate-neon.ts`, `tests/schema-parity.test.ts`, `tests/postgres-db.test.ts` | La parité tables/colonnes/index est testée; bootstrap et migrations ont été exercés sur un PostgreSQL temporaire local. Continuer les tests à chaque évolution; la fusion des sources de schéma reste un travail d’architecture distinct. |
| P2 | **Catégories métier regroupées.** Les formulaires partent de catégories générales comme restauration, mode, beauté, électronique et maison; certains commerces demandés (boulangerie, épicerie, etc.) ne possèdent pas une catégorie spécialisée explicitement identifiée. | `src/utils/categoryDefaults.ts`, `src/components/MerchantDashboard/productForm.ts` | Vérifier les besoins par secteur et les champs réellement nécessaires avant d’ajouter des catégories ou d’altérer les données existantes. |
| P2 | **Recette de production non réalisée.** Les contrôles locaux ne vérifient pas la configuration réelle de PostgreSQL, GeniusPay, Didit, Resend, OAuth ou de l’hébergement. | `README.md`, `scripts/`, `render.yaml` | Exécuter la recette sur une base jetable et des environnements de test; ne pas utiliser la production pour des tests de restauration ou de migration. |

## Permissions et protection des données

Les routes admin sont protégées côté serveur; les rôles Super Admin et
vérification disposent de gardes distinctes. Les routes marchandes vérifient
la session, l’empreinte de requête et la boutique associée. L’administration
de vérification dispose d’un accès limité et en lecture seule aux informations
de boutiques hors de son périmètre. Le dépôt contient des tests liés aux
sessions, limites de requêtes, en-têtes de sécurité, contrôles admin, paiements
et migrations.

Le worktree était déjà marqué comme contenant `.idea/caches/` non suivi; cet
audit ne l’a ni lu ni modifié. Aucun fichier `.env`, dump de base ou
identifiant de fournisseur n’a été ajouté au rapport.

## Suivi des suites proposées

1. **Terminé localement** : alignement des textes commerciaux et cohérence des
   tarifs. Les limites numériques Pro sont désormais configurables; la règle
   décidée est une prise d’effet au prochain renouvellement pour les abonnés en
   cours (voir phase 8).
2. **Terminé localement pour les tarifs** : configuration Super Admin avec
   conservation des montants déjà engagés et des accès payés; aucun changement
   de formule ne retire des droits avant son échéance.
3. **Terminé localement** : actions de comptes et cycle de vie des abonnements,
   avec contrôles d’accès, motifs et journalisation.
4. **Validé localement, certification cible différée** : parité des schémas,
   bootstrap PostgreSQL, migrations, restauration vers une base neuve et
   rollback transactionnel ont été testés sur des cibles temporaires isolées.
   La restauration de données métier représentatives et le rollback d’un
   déploiement complet sont différés, car aucune préproduction n’est disponible.
   Ne pas exécuter ces opérations sur la production.
5. **Recette locale effectuée, certification cible en attente** : parcours
   public, client, marchand, Super Admin et vérification, dont le checkout sans
   soumission de commande. Le centre de guides multi-rôle a été vérifié sur
   navigateur local à 390 px et 1 440 px; absence du sélecteur global, guides
   administrateur Super-admin/vérification, reprise et séparation de
   progression entre deux identifiants de boutique ont été vérifiés. Les
   comptes de test client, marchand et les deux rôles admin ont été supprimés.
   Le débordement horizontal du tableau de bord client a été corrigé puis vérifié
   à 320, 390 et 1 440 px. La certification sur l’environnement cible est différée
   faute de préproduction; aucune vérification ni action de déploiement en
   production n’a été effectuée.

## Modifications et résultats de phase

- Créé `docs/AUDIT_PHASE1_MATABLE.md`, ce rapport.
- Aligné les tarifs et limites de catalogue de `README.md`, `src/utils/faqContent.ts`
  et `src/components/LegalPages.tsx` sur la configuration active.
- Le contrôle de configuration production refuse maintenant la réutilisation
  de la même clé pour les deux rôles admin; un test de régression couvre le cas.
- Aucun changement de base de données, migration ou donnée existante.
- Validation finale : `npm test`, `npm run lint`, `npm run build`,
  `node --import tsx --test tests/security.test.ts` (19 tests) et
  `git diff --check` ont réussi. Une recherche des anciens tarifs et limites
  dans le README, les documents et le code source n’a retourné aucune occurrence.
- Aucun parcours externe ou déploiement de production n’a été exécuté.

## Phase 2 — stabilisation sécurité (contrôles locaux effectués)

- Vérifié les protections de routes admin au montage Express et dans le routeur
  admin, ainsi que les tests de refus du rôle vérification pour les paiements,
  abonnements, maintenance, commandes modifiables, données clients et
  opérations Super Admin. Les tests existants couvrent aussi les données
  privées exclues de la liste de boutiques en lecture seule.
- Corrigé l’écart entre la politique documentée et le contrôle de démarrage :
  `ADMIN_ACCESS_KEY` et `VERIFICATION_ADMIN_ACCESS_KEY` doivent maintenant
  être différentes en production.
- Les tests locaux des autorisations et du contrôle de configuration sont
  réussis. Aucune migration ou modification de schéma n’étant requise pour les
  corrections effectuées, aucune donnée existante n’a été migrée.
- Aucun identifiant réel n’a été lu ou modifié. Les tests PostgreSQL, la parité
  de schéma, les migrations, le rollback transactionnel et la restauration vers
  une base neuve ont été effectués sur un cluster local temporaire isolé. Les
  fournisseurs de paiement et Didit n’ont pas été appelés.
- **Limite restante — différée** : la restauration avec données métier
  représentatives et le rollback d’un déploiement complet exigent une
  préproduction isolée, actuellement indisponible. Ne pas effectuer ces
  opérations en production; reprendre la certification si une préproduction
  devient disponible.

## Phase 3 — gestion des comptes (première tranche)

- Ajout d’une action Super Admin pour suspendre ou réactiver un compte client,
  avec vérification optimiste du statut, motif obligatoire et journalisation
  atomique.
- La suspension révoque les sessions client persistées. Les contrôles de
  session client interrogent désormais le stockage avant de faire confiance à
  un cache local, afin qu’une révocation reste effective même après une
  réactivation ou entre instances du serveur.
- L’Admin de vérification ne peut pas appeler cette opération; la vérification
  est effectuée côté serveur.
- Test de bout en bout : accès anonyme refusé, motif vide rejeté, suspension,
  révocation vérifiée, journal vérifié, statut concurrent obsolète rejeté,
  réactivation sans restauration des sessions, et rôle de vérification refusé.
- Validation de cette tranche : test intégral `tests/full-flow.test.ts`,
  `tests/security.test.ts`, suite complète, lint et build. Aucun changement de
  schéma ou de données préexistantes.

## Phase 3 — abonnements (motif des prolongations)

- Les opérations de prolongation, synchronisation d’échéance et correction
  manuelle existaient déjà; la correction manuelle exigeait déjà un motif. La
  prolongation d’essai, qui accorde un accès gratuit, ne le demandait pas.
- Le backend et l’interface exigent maintenant un motif explicite d’au moins
  10 caractères; celui-ci est inclus dans la transaction avec le journal.
- Le test d’intégration vérifie le rejet sans motif, l’acceptation avec motif
  et sa présence dans le journal, ainsi que les limites de cumul.
- La documentation Super Admin est mise à jour dans `README.md`.

## Phase 3 — suspension des boutiques et sessions marchandes

- La suspension d’une boutique supprime désormais, dans la même transaction
  que le changement d’état et son audit, toutes les sessions marchandes
  persistées de cette boutique. Le nombre révoqué est journalisé.
- Le cache local est nettoyé après la validation de la transaction. Les
  contrôles de session marchand consultent désormais le stockage avant le
  cache, afin qu’une session révoquée ne puisse pas redevenir valide après
  réactivation ou sur une autre instance.
- Le Super Admin conserve l’accès de diagnostic; les sessions marchandes ne
  sont pas restaurées lors de la réactivation.
- Test de bout en bout : authentification marchand avant suspension, rejet
  pendant la suspension, absence en base, puis rejet persistant après
  réactivation.
- Validation : `tests/full-flow.test.ts` réussit; suite complète `npm test`
  (153 tests, 152 réussis, 0 échec, 1 ignoré), `npm run lint`,
  `npm run build` et `git diff --check` réussis.

## Phase 3 — cohérence des textes d’offres

- Un test de régression vérifie les tarifs initiaux, les limites de catalogue
  et d’essai, et s’assure que FAQ/CGU orientent vers les tarifs dynamiques.
- Tarifs mensuels confirmés : Standard 3 000 FCFA, Premium 5 000 FCFA et Pro
  8 000 FCFA. Les vues, paiements GeniusPay, statistiques financières, SEO et
  documentation ont été synchronisés avec cette grille; aucun paiement
  confirmé ni abonnement existant n’a été modifié.
- Validation de la tranche initiale : tests tarifaires ciblés réussis; `npm
  test` (154 tests, 153 réussis, 0 échec, 1 ignoré), lint, build et
  `git diff --check` réussis.

## Phase 3 — configuration des tarifs par le Super Admin

- Ajout d’un stockage des trois tarifs mensuels dans `platform_settings`, avec
  une évolution SQLite/PostgreSQL et la migration versionnée
  `028_subscription_plan_prices.sql`. Les montants sont limités aux entiers
  positifs jusqu’à 1 000 000 FCFA.
- L’écran Abonnements permet au Super Admin de lire et modifier les tarifs.
  L’API refuse l’accès anonyme et le rôle de vérification, et consigne les
  valeurs précédentes et suivantes dans le journal d’audit.
- Les pages de formules, l’intégration SEO et le démarrage d’essai lisent les
  tarifs persistés. Le checkout calcule les nouveaux paiements avec le tarif
  actuel; les intentions existantes et paiements déjà confirmés gardent leur
  montant enregistré.
- La FAQ et les CGU renvoient vers la page de formules pour éviter des prix
  statiques devenus périmés. À la clôture de cette tranche, les avantages et
  limites restaient fixes; les évolutions suivantes sont consignées en phase 8.
- Tests ciblés vérifient validation, accès par rôle, persistance, journalisation,
  affichage SEO, montant du checkout et conservation du montant d’une intention
  antérieure; une modification basée sur des tarifs précédemment chargés est
  aussi rejetée si les tarifs ont changé entre-temps.
- La migration `028_subscription_plan_prices.sql` est enregistrée dans le
  runner PostgreSQL. Un test local vérifie que chaque fichier SQL versionné
  figure dans le runner; les tests d’opérations PostgreSQL couvrent aussi le
  checksum, le refus de cible non vide/source identique et le preflight.
- Un contrôle local compare les tables, colonnes et noms d’index du schéma
  SQLite initialisé à ceux du bootstrap PostgreSQL combiné aux migrations
  versionnées. Il a révélé un index absent côté SQLite sur
  `customer_oauth_identities`, désormais ajouté. Ce contrôle ne remplace pas
  une validation PostgreSQL réelle des types et contraintes.
- Validation finale : `npm test` (157 tests, 156 réussis, 0 échec, 1 ignoré),
  `npm run lint`, `npm run build` et `git diff --check` réussis. Le test
  PostgreSQL conditionnel reste ignoré faute de base jetable confirmée.
- La validation PostgreSQL réelle des types et contraintes, ainsi qu’une
  migration/restauration/retour-arrière effectifs sur serveur PostgreSQL
  jetable, restent à vérifier avant certification.

## Phase 3 — répertoire clients (filtrage)

- Ajout du filtre « tous / actifs / suspendus » au répertoire Super Admin.
  L’API applique le filtre et la recherche ensemble côté serveur, valide les
  valeurs de filtre et conserve la pagination.
- L’accès reste soumis à l’autorisation d’administration générale, qui refuse
  déjà ce parcours au rôle de vérification; aucune donnée client supplémentaire
  n’est exposée.
- Test d’intégration : filtrage actif/suspendu combiné à la recherche,
  résultat de comptage cohérent et rejet d’une valeur de statut invalide.
- Validation finale : `npm test` (153 tests, 152 réussis, 0 échec, 1 ignoré),
  `npm run lint`, `npm run build` et `git diff --check` réussis.

## Phase 4 — recette PostgreSQL locale jetable

- Création d’un cluster PostgreSQL neuf et local, sans lecture de `.env` ni
  connexion à un service distant. Le bootstrap production a révélé que la
  migration `admin_sessions.role` précédait la création de sa table; l’ordre a
  été corrigé dans `db.ts`.
- Le bootstrap a ensuite réussi sur base vierge. Les 28 migrations versionnées
  se sont appliquées, puis un second passage les a toutes reconnues comme déjà
  appliquées. Le test d’intégration PostgreSQL a réussi.
- Contrôles PostgreSQL réels sur `platform_settings.subscription_plan_prices`
  (type `text`, NOT NULL, valeur par défaut attendue), `admin_sessions.role`
  (type `text`, NOT NULL, défaut Super Admin) et la contrainte `id = 1`.
- Une opération DDL a été annulée par rollback transactionnel et la colonne
  est restée présente. `pg_dump` a généré une archive validée et son checksum;
  `pg_restore` l’a restaurée dans une base neuve, avec 77 objets et les comptes
  de tables cœur rapprochés. Une ligne d’analytique de test a aussi été
  restaurée puis relue dans la base cible.
- Le cluster et les fichiers temporaires ont été arrêtés et supprimés. Aucun
  identifiant externe n’a été utilisé.
- Validation finale locale : suite complète `npm test` (157 tests,
  156 réussis, 0 échec, 1 ignoré), `npm run lint`, `npm run build` et
  `git diff --check` réussis. Le test PostgreSQL conditionnel ordinaire reste
  ignoré sans `DATABASE_URL`; l’intégration a été exécutée séparément avec
  l’URL temporaire générée pour ce cluster.
- Restent à faire avant certification : restauration d’un jeu représentatif de
  données métier, scénario de rollback de déploiement complet et vérification
  sur le fournisseur PostgreSQL distant visé. La production n’a pas été testée.

## Phase 5 — changement de formule à la prochaine échéance

- Le Super Admin peut programmer ou annuler le changement d’un abonnement payé
  actif; le motif est obligatoire et l’action est journalisée. Les droits de la
  formule payée restent actifs jusqu’à la date effective.
- Le checkout marchand est contraint à la formule programmée. Un renouvellement
  payé avant l’échéance prolonge l’accès actuel sans déplacer la date effective
  du changement; la sortie d’essai, elle, active immédiatement la formule payée.
- Les corrections manuelles d’échéance déplacent une programmation encore à
  venir. Les changements déjà effectifs sont réconciliés avant une nouvelle
  programmation ou une correction.
- La migration `029_scheduled_subscription_tier` est incluse dans les deux
  schémas et dans le runner PostgreSQL. Les tests couvrent les transitions,
  l’autorisation, les conflits/états obsolètes, l’audit, l’annulation,
  l’échéance corrigée et le renouvellement GeniusPay.
- Validation locale : `npm test` (160 tests, 159 réussis, 0 échec, 1 ignoré),
  `npm run lint`, `npm run build` et `git diff --check` réussis. Aucune
  migration distante ni opération en production n’a été effectuée.

## Phase 6 — résiliation et suspension d’abonnement

- Le Super Admin peut programmer la résiliation à l’échéance payée; les droits
  restent actifs jusque-là. Le commerçant en est informé, le checkout est
  bloqué pendant la période de résiliation et l’action peut être annulée avant
  l’échéance. Une échéance corrigée déplace également cette date.
- La suspension d’abonnement est distincte de la désactivation globale de la
  boutique. Elle bloque immédiatement les droits, préserve échéance et
  paiements et n’altère pas `is_active`; la réactivation administrative restaure
  les droits seulement si la période précédente reste valide.
- Les opérations incompatibles sont refusées en présence d’un paiement
  d’abonnement non résolu. Les renouvellements sont refusés pendant une
  suspension administrative ou une résiliation encore programmée.
- Les actions exigent un motif, vérifient l’état attendu et la concurrence,
  puis ajoutent un événement au journal d’audit durable déjà consultable avec
  recherche et pagination.
- La migration `030_subscription_lifecycle_controls` complète les schémas
  SQLite/PostgreSQL. Tests dédiés : résiliation et annulation, suspension,
  refus en attente de paiement, réactivation avant/après échéance, correction
  d’échéance, checkout et audit.
- Validation locale : `npm test` (162 tests, 161 réussis, 0 échec, 1 ignoré),
  `npm run lint`, `npm run build` et `git diff --check` réussis. Aucune
  migration distante, opération sur `.env` ni modification de production.

## Phase 7 — recette client et accessibilité du checkout

- La fiche boutique et le formulaire de panier/commande ont été parcourus sur
  mobile et desktop sans soumettre de commande. Le créneau restaurant, les
  coordonnées et les précisions disposent de libellés associés; les choix de
  lieu sont regroupés sémantiquement et les contrôles du panier ont des noms
  accessibles.
- Le test navigateur a permis de corriger le nom du bouton de fermeture et des
  boutons de quantité. Aucun débordement horizontal ni contrôle non nommé n’a
  été relevé dans le formulaire vérifié.
- Validation finale : `npm test` (162 tests, 161 réussis, 0 échec, 1 ignoré),
  `npm run lint`, `npm run build`, test ciblé du checkout et `git diff --check`
  réussis. Aucune commande n’a été soumise.

## Phase 8 — configuration des limites et avantages Pro

- Le Super Admin peut configurer la limite d’articles (ou un catalogue
  illimité), le nombre de photos par article, la période des statistiques et
  la remise sur les boosts. Les valeurs alimentent les pages de formules, les
  contrôles marchands et les vérifications serveur; les bornes d’entrée sont
  validées et les changements sont consignés au journal d’audit.
- Les nouveaux abonnements utilisent immédiatement la configuration courante.
  Lors d’une modification, les abonnements Pro en cours reçoivent un snapshot
  de leurs conditions actuelles jusqu’à leur prochaine échéance; la dernière
  configuration publiée s’applique à cette échéance. Les renouvellements
  successifs et plusieurs changements avant l’échéance conservent cette règle.
- La migration `031_subscription_plan_features` ajoute la configuration
  SQLite/PostgreSQL et les snapshots d’échéance. Les champs qualitatifs
  d’inclusion des plans ne sont pas rendus modifiables.
- L’intégration PostgreSQL a réussi sur un cluster neuf et temporaire local :
  bootstrap, application des migrations, défaut de configuration Pro, types et
  contrainte `platform_settings`, puis test de requêtes paramétrées et
  transactions. Le cluster et ses données ont été supprimés après le test.
- Recette navigateur locale avec serveur isolé, SQLite temporaire, clés de test
  et Dotenv désactivé : l’interface Super-admin a chargé et enregistré les
  limites Pro, puis la page Formules a reflété le scénario 120 articles,
  8 photos, 180 jours et 20 % de remise. Contrôle à 390 px et 1 440 px sans
  débordement horizontal. Aucun paiement ni commande n’a été déclenché; serveur
  et base temporaires ont été arrêtés et supprimés.
- Tests ciblés : validation des limites, application au jour de renouvellement,
  accès Super Admin, refus du rôle vérification, conflit de version,
  persistance et audit. Validation complète : `npm test` (166 tests,
  165 réussis, 0 échec, 1 ignoré), `npm run lint`, `npm run build` et
  `git diff --check` réussis. Le test PostgreSQL conditionnel de la suite
  ordinaire reste ignoré sans `DATABASE_URL`; le test dédié a été exécuté à
  part avec une URL locale éphémère. Aucune migration distante ni opération en
  production n’a été effectuée.

## Conclusion de phase

L’architecture et les principaux flux sont identifiés. Les corrections locales
sur les comptes, les abonnements, les guides opérationnels et les parcours
client sont vérifiées par les tests et la recette décrits ci-dessus. La
certification d’une restauration avec données métier représentatives et du
rollback d’un déploiement complet reste différée faute de préproduction. Ce
rapport ne certifie pas le comportement en production; aucun déploiement ni
appel distant n’a été effectué.

## Vérifications complémentaires du checklist — 25 octobre 2026

Cette mise à jour consigne les vérifications supplémentaires effectuées
localement. Elle ne certifie ni la préproduction ni la production.

| Domaine | Résultat local | Limite restante |
|---|---|---|
| Authentification et rôles | Tests de renouvellement et d’expiration des sessions client, marchand et admin; tests d’isolation inter-boutiques et de révocation après déconnexion. | Aucune session ni identité réelle de production testée. |
| Commandes | Suite locale, routes et règles de recalcul des prix et de réservation de stock vérifiées par tests automatisés. Le parcours client reste gratuit, avec remise manuelle du reçu à WhatsApp. | Aucun message WhatsApp réel envoyé; l’accusé de réception et la confirmation du vendeur ne sont pas prouvés par le click-to-chat. |
| Recherche et interface mobile | Recherche globale visible sur l’accueil; flux API local HTTP 200; largeurs 320, 390 et 1 440 px mesurées sans débordement horizontal; aucune erreur JavaScript observée pendant cette recette. | Tous les filtres combinés, tris et scénarios de résultats vides n’ont pas fait l’objet d’une recette navigateur exhaustive. Une image Unsplash distante a été bloquée par l’environnement de test. |
| PWA | Manifest HTTP 200, cache `matable-ci-v3` et service worker activé dans le navigateur sur le build; le shell de l’accueil et ses ressources statiques réchauffées s’affichent hors ligne. | Les routes API ne sont pas disponibles hors ligne; installation sur un appareil réel et transition entre versions du service worker non testées. |
| Publicité | Les boosts de boutique et une mise en avant de boutiques existent déjà. | Les routes et composants de campagnes produit/marketing présents dans le worktree sont vides (0 octet); offres, tarifs, validation admin, paiement et mesure de campagnes ne sont donc pas certifiés. Aucune campagne n’a été activée. |
| PostgreSQL et sauvegarde | Test dédié PostgreSQL réussi sur un cluster local jetable. Sauvegarde personnalisée créée, checksum vérifié, puis restauration dans une base cible distincte : 71 objets restaurés et comptages concordants pour les six tables métier suivies. | Base de test fraîche sans données métier (comptages à zéro); stockage externe chiffré, planification, rétention et restauration de données représentatives non configurés ni validés. |
| Qualité et dépendances | `npm test`: 176 tests, 175 réussis, 0 échec, 1 ignoré; `npm run lint`, `npm run build` et `npm audit --audit-level=moderate` réussis; audit des dépendances : 0 vulnérabilité connue. | Les tests ne certifient pas les fournisseurs externes ni les environnements hébergés. |
| Environnements et livraison | Modèle `.env.production.example` complété; `archives/matable-ci-release-20261025.zip` générée et inspectée : 238 fichiers, aucun élément interdit détecté (secrets, bases/sauvegardes, caches ou métadonnées Git). | L’archive contient aussi les cinq fichiers publicitaires vides du worktree. Aucune configuration de préproduction séparée n’est démontrée dans le dépôt. Aucun déploiement, test post-déploiement, surveillance ou retour arrière réel effectué. |

### État de préparation

**Version non prête pour la livraison ou le déploiement.** Les contrôles locaux
réussis sont utiles mais ne remplacent pas les blocages critiques suivants :

- créer et valider une préproduction séparée, avec variables et base de test
  dédiées;
- configurer le stockage externe et la planification des sauvegardes, puis
  restaurer un jeu de données de test représentatif;
- exécuter un parcours de commande et de remise WhatsApp avec des coordonnées
  de test, et valider les états métier jusqu’à la confirmation;
- décider des offres et tarifs publicitaires, puis compléter et tester le flux
  produit, les validations admin et la confirmation des paiements avant toute
  activation;
- faire la recette finale sur les cibles mobiles et sur la préproduction,
  documenter le rollback, puis vérifier logs et surveillance après un
  déploiement autorisé.

Aucun secret n’a été lu ni copié; aucune base, sauvegarde, campagne ou
configuration de production n’a été modifiée. Les services et données
temporaires créés pour les vérifications locales ont été arrêtés et supprimés.
