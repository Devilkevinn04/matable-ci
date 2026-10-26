# Audit publicité et partenariats — MaTable.ci

Date : 25 octobre 2026
Périmètre : audit local du worktree, sans connexion à la production ni aux
fournisseurs de paiement.

## Conclusion

Le boost de boutique déjà payant reste séparé des campagnes produit et bannière.
Le code local contient maintenant le modèle, les routes, les interfaces
marchand/admin et le point de diffusion de la bêta gratuite, ainsi que les
demandes manuelles de partenariat externe. Les nouvelles créations sont
réservées aux boutiques actives, vérifiées et complètes, limitées à sept jours
et soumises à une validation du Super-admin. Une campagne produit et une
bannière au maximum sont permises par boutique; la page publique n’affiche
qu’un seul module sponsorisé, et seulement avec au moins six produits naturels.

**État : décisions commerciales intégrées au code et testées localement; bêta
fermée, aucune campagne lancée, aucune migration appliquée en production et
aucun déploiement effectué. La production est verrouillée par défaut par
`ADVERTISING_BETA_ENABLED=false` dans tous les environnements hors tests. La préproduction, la charte finale, le contrôle
de la stabilité de l’ensemble de la plateforme et l’autorisation de lancement
restent requis.**

## Inventaire vérifié

| Fonction | État observé |
|---|---|
| Boost de boutique | Opérationnel côté code : durées de 1, 3 et 7 jours, prix initiaux de 1 000, 1 500 et 2 000 FCFA, réduction Pro configurable, sélection de l’accueil, d’une catégorie ou des boutiques de la ville. Cinq réservations simultanées sont permises par périmètre; les réservations payées commencent au premier créneau disponible. |
| Éligibilité et paiement du boost | Le serveur contrôle la boutique propre au marchand, son état actif/ouvert, la vérification du commerçant, la ville et au moins deux produits. L’intention de paiement est associée à `shop_boosts`; le paiement GeniusPay confirmé par webhook signé ou réconciliation est contrôlé par référence et montant avant activation. Une réservation expirée peut être replanifiée après paiement tardif. |
| Diffusion des boosts | Les API publiques n’exposent que les boosts dans leur période effective. Le classement de visibilité prend en compte le sponsoring; les cartes de boutiques et le carrousel affichent une mention sponsorisée pour un boost payé. Aucun service de diffusion publicitaire distinct n’existe. |
| Mise à la une administrative | L’administration peut définir `featured_until` pour une boutique. Cette mise en avant est indépendante d’un achat de boost et doit rester une action éditoriale/admin, pas une preuve de paiement publicitaire. |
| Campagnes, créations et inventaire | Migration `033_advertising_beta.sql`, campagnes produit/bannière et événements consentis présents dans le worktree; une création de chaque format au plus par boutique, durée fixe de sept jours, périodes bornées par les 30 jours de bêta et demandes externes manuelles. Migration de production non appliquée. |
| Interface marchand | Le marchand peut soumettre, consulter ou annuler sa campagne depuis Abonnement et visibilité. Les coordonnées complètes et l’éligibilité sont contrôlées côté serveur; les motifs précis de blocage sont renvoyés au tableau de bord. Le marchand doit confirmer la charte avant envoi. |
| Interface admin | La rubrique Publicité est visible uniquement au Super-admin; elle ouvre/met en pause/reprend la bêta, examine les campagnes, approuve/refuse/suspend/reprend/arrête et traite les demandes externes. Une vue Promotions paginée distingue les offres actives, programmées, terminées et invalides sans modifier les prix marchands. Les gardes sont également vérifiées côté backend. |
| Promotions catalogue | Les statuts temporels sont calculés à partir du prix normal, du prix réduit et de sa période. Le marchand voit le statut et la date de transition dans son catalogue; le Super-admin dispose d’un endpoint paginé et de totaux par état pour le suivi transversal. |
| Diffusion publique | Le fil n’étiquette plus les produits d’une boutique boostée comme produits sponsorisés. Une campagne approuvée fournit une seule bannière ou un seul produit sponsorisé; la diffusion est filtrée par date, disponibilité, état de boutique, vérification et état de bêta. |
| Mesure | Impressions/clics de campagne uniquement avec consentement explicite, jeton HMAC valide, visiteur pseudonymisé par HMAC et déduplication quotidienne. Les chiffres reflètent les événements reçus; aucune commande, conversion ou recette n’est attribuée. |
| Partenariats | Formulaire public avec consentement au traitement des coordonnées; suivi Super-admin, sans inscription annonceur, publication autonome, tarif automatique ou checkout partenaire. |
| Fichiers vides | Les deux routes placeholders `server/routes/homepage.ts` et `server/routes/productOffers.ts`, vides et sans référence, ont été retirées; la logique publicitaire est regroupée dans `server/routes/advertising.ts`. |
| Tests | `tests/advertising-beta.test.ts` couvre rôles, accès inter-boutiques, éligibilité produit, modération, consentement, déduplication, expiration et traitement d’une demande partenaire. La migration 033 et l’adaptateur ont aussi été testés sur un cluster PostgreSQL local jetable; cela ne remplace pas la préproduction. |

## Fichiers historiques, build et référence locale

- L’historique Git montre que `server/routes/homepage.ts` et
  `server/routes/productOffers.ts` étaient vides dans un changement ultérieur.
  Leurs versions plus anciennes (`7070568`) reposaient sur
  `homepage_campaigns` et `product_offers`, tables qui ne correspondent pas au
  modèle publicitaire courant. Elles n’ont donc pas été restaurées telles
  quelles : les routes actives sont centralisées dans
  `server/routes/advertising.ts`.
- Les trois composants d’interface
  (`AdminHomepageMarketing.tsx`, `PublicCampaignCarousel.tsx` et
  `MerchantDashboard/ProductOffersManager.tsx`) ont des versions utiles dans
  l’historique et sont présents dans l’application courante. Ils sont
  réimplémentés pour le modèle actuel plutôt que reconnectés aux anciennes
  routes.
- Installation propre : `npm ci` a installé 277 paquets; aucune vulnérabilité
  n’a été signalée. `npm audit --omit=dev` rapporte zéro vulnérabilité.
- Première exécution complète : deux tests de configuration de production
  échouaient car leurs fixtures omettaient le secret désormais obligatoire
  `AD_EVENT_SIGNING_SECRET`. Les fixtures de `tests/security.test.ts` ont été
  complétées; ces échecs étaient dus aux tests, pas à une régression runtime.
- Référence après intégration du suivi des promotions : `npm test` — 180 tests,
  179 réussis, 0 échec, 1 ignoré. `npm run lint` (TypeScript) et
  `npm run build` réussissent.
- Le smoke test de `build/server.cjs` en mode production avec un PostgreSQL
  local jetable réussit : `/health`, `dist/index.html` et le bundle JavaScript
  versionné répondent correctement, aucun client Vite de développement n’est
  servi, et la réconciliation publicitaire ne s’exécute plus avant
  l’initialisation de la base.
- Render utilise déjà `npm ci && npm run build`, puis `npm start`. Le build
  local recrée `dist/` et `build/server.cjs`; aucun déploiement n’a été
  effectué. Des avertissements de port WebSocket déjà occupé ont été observés
  pendant les tests, sans échec de la suite.

## Corrections après relecture navigateur

- Le carrousel ne demande plus de campagnes tant que le fil contient moins de
  six produits. Une impression consentie n’est envoyée qu’après visibilité
  d’au moins 50 % du module dans le viewport, une fois par campagne et par
  page.
- La diffusion trie les campagnes par nombre réel d’impressions croissant
  (puis par date de début et de création) afin de favoriser les moins exposées,
  et plafonne à dix candidates par requête.
- Les réponses sont mises en cache 60 secondes en mémoire du serveur. La
  suspension/modération, les changements de bêta et l’annulation marchand
  invalident le cache; le navigateur ne garde pas de copie privée périmée.
- Le texte sous le badge « Sponsorisé » indique maintenant « Mise en avant
  par [boutique] », sans laisser entendre qu’il s’agit d’une sélection
  éditoriale.
- `render.yaml` déclare `AD_EVENT_SIGNING_SECRET` comme valeur générée par
  Render. Vérifier sa présence dans les variables du service avant tout
  déploiement; cette modification locale n’a pas synchronisé ni déployé
  Render.
- Vérification après ces corrections : `npm test` — 177 tests, 176 réussis,
  0 échec, 1 ignoré; `npm run lint` et `npm run build` réussissent.

## Risques et corrections préalables

1. **Confusion entre boost de boutique et produit sponsorisé — corrigée
   localement.** Le flux produit n’associe plus le boost boutique au badge
   « Sponsorisé ». Le carrousel peut continuer à signaler le boost de boutique;
   seules les campagnes individuelles approuvées portent le badge produit.
2. **Mise à la une éditoriale séparée.** `featured_until` peut alimenter le
   carrousel sans paiement. Cette sélection éditoriale reste séparée et ne
   produit ni statistique publicitaire ni revenu attribué.
3. **Statut d’expiration.** La diffusion filtre les dates de début et de fin,
   mais aucun processus de clôture des lignes `shop_boosts` expirées n’a été
   trouvé. Le boost n’est donc plus montré après sa date de fin, mais son statut
   persistant peut rester `active`; l’historique marchand le présente comme
   terminé en recalculant les dates côté interface. Un futur état administratif
   doit s’appuyer sur les dates et une transition serveur cohérente.
4. **Statistiques non attribuées.** Le total des visites durant un boost ne
   démontre pas que les visiteurs ont vu ou cliqué son emplacement. Ne pas
   présenter ces chiffres comme impressions, clics publicitaires, commandes
   confirmées ou retour sur investissement.

## Découpage et statut des 12 phases

| Phase | État | Base ou travail restant |
|---|---|---|
| 1. Audit existant | **Effectué localement** | Inventaire du boost, de la mise à la une et des mesures existantes; badge produit trompeur corrigé dans le code. |
| 2. Décisions stratégiques | **Décidé pour la bêta** | Commerçants vérifiés et demandes externes manuelles; pas d’annonceur externe autonome; aucun nouveau tarif; formats produit/bannière gratuits pour les boutiques sélectionnées. |
| 3. Catalogue des formats | **Codé, à valider en préproduction** | Boosts tarifés inchangés; produit et bannière bêta gratuits, sept jours; une campagne par format et par boutique; densité publique plafonnée. |
| 4. Architecture technique | **Implémentée localement** | Migration, API, dates, contrôle d’éligibilité, événements signés, demande partenaire et processus d’expiration; migration production non exécutée. |
| 5. Interface administrateur | **Implémentée localement** | Contrôle super-admin côté UI et backend, modération, arrêt, dates, partenaires et mesures observées. |
| 6. Interface commerçant/annonceur | **Implémentée localement** | Soumission et suivi marchand, confirmation de charte, annulation; demandes externes manuelles. |
| 7. Diffusion publique | **Implémentée localement** | Un module sponsorisé par page et maximum un produit sponsorisé pour six produits naturels; campagnes cachées hors période ou si la boutique/le produit n’est plus éligible. |
| 8. Statistiques et revenus | **Mesure minimale codée** | Impression/clic réels, consentis et dédupliqués; aucune attribution de commande ou revenu ni facturation publicitaire. |
| 9. Sécurité et conformité | **Partiel** | Autorisations, token HMAC, validation, consentement et charte d’envoi intégrés; politique de confidentialité, charte publiée complète, signalement et revue juridique encore à confirmer. |
| 10. Tests et bêta | **Tests locaux réussis; bêta non lancée** | Parcours d’API et migration/adaptateur PostgreSQL vérifiés localement; PostgreSQL en staging, recettes mobile/public et contrôles préproduction restent à exécuter. |
| 11. Commercialisation | **Non lancée** | Boost existant conserve son tarif; les campagnes bêta sont gratuites; pas de tarifs externes ni support commercial finalisé. |
| 12. Amélioration continue | **En attente de données réelles** | Aucun chiffre de campagne disponible avant consentement et lancement contrôlé; ne pas extrapoler à partir des boosts. |

## Décisions commerciales intégrées

- **Annonceurs :** commerçants MaTable.ci vérifiés; partenaires externes sur
  demande, étudiés manuellement.
- **Formats :** boost boutique conservé; produit sponsorisé et bannière gratuits
  pour les boutiques sélectionnées pendant une bêta de 30 jours.
- **Capacité :** une campagne produit et une bannière au maximum par boutique,
  sept jours chacune; un module sponsorisé par page, au plus un produit
  sponsorisé pour six produits naturels.
- **Validation :** approbation Super-admin obligatoire avant diffusion;
  boutique active/vérifiée, informations complètes et confirmation de charte.
- **Paiements :** aucun checkout ou tarif ajouté aux nouveaux formats; règles
  de remboursement des boosts non transposées.
- **Contrôle de diffusion :** le verrou préalable de préproduction sur les
  actions admin `open` et `resume` a été retiré du code. La diffusion publique
  reste contrôlée par `ADVERTISING_BETA_ENABLED`, configuré à `false` par
  défaut en production. Ce changement de code ne modifie pas la configuration
  d’environnement, ne lance pas la bêta et ne déploie rien.

Aucune migration production, campagne, transaction publicitaire, action
fournisseur, message WhatsApp ou déploiement n’a été effectué.
