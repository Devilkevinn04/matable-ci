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
- Fait localement: grille centrale Standard 3 000 FCFA / 20 articles, Premium 4 000 FCFA / catalogue illimite, Pro 5 000 FCFA / catalogue illimite.
- A faire: configuration des offres par Super Admin, politique de migration pour les abonnements existants et implementation precise de la gestion avancee des prix/stocks Pro.
- Les changements ci-dessus ne sont pas encore commités ni deployes.
