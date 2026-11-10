# MaTable

Le backend Express existant reste la source de vérité métier. La fondation de
passerelle multiservice est documentée dans
[docs/MULTISERVICE_MIGRATION.md](./docs/MULTISERVICE_MIGRATION.md) ; elle ne
déplace aucune route métier pour l’instant.

Application React + Vite + Express pour la gestion de vitrines locales, de commandes WhatsApp et de tableaux de bord MaTable.

## Sécurité des connexions

L’authentification ajoute un code e-mail à usage unique après le secret principal
(clé admin, PIN marchand ou mot de passe). Les nouveaux comptes sont concernés
à partir de `AUTH_EMAIL_MFA_ROLLOUT_STARTED_AT` ; les comptes déjà existants
basculent 30 jours après cette date. Aucun SMS n’est envoyé.
Les connexions Super-admin et Admin de vérification exigent la MFA dès cette
date, sans période de grâce.

Les clients voient un rappel dans leur compte et peuvent vérifier leur adresse
avec un code avant l’échéance. Les commerçants voient un rappel dans leur
dashboard et dans leur profil ; une adresse saisie n’est enregistrée qu’après
vérification. À l’échéance, le parcours de connexion guide les commerçants sans
adresse vérifiée vers un formulaire protégé par leur numéro et leur PIN. Un
avis e-mail unique peut être envoyé à tous les comptes existants qui ont déjà
une adresse ; après déploiement, exécutez une fois sur le VPS :
`docker exec matable-web node /app/scripts/send-email-mfa-rollout-notices.mjs`.
Le suivi rend la commande idempotente. Les commerçants sans adresse ne peuvent
pas recevoir cet avis et nécessitent un contact par un autre canal.

Avant le démarrage en production, configurez dans l’environnement privé du
serveur (sur le VPS Hostinger, `/srv/apps/matable/shared/app.env`) :
`AUTH_EMAIL_MFA_ROLLOUT_STARTED_AT` (date ISO UTC), `RESEND_API_KEY`,
`AUTH_EMAIL_MFA_PEPPER` (clé forte générée par l’hébergeur),
`RESEND_FROM_EMAIL`, `ADMIN_MFA_EMAIL` et
`VERIFICATION_ADMIN_MFA_EMAIL`. Les valeurs sont des paramètres d’hébergement,
pas des secrets ou adresses à ajouter au dépôt. Le serveur refuse de démarrer
si ces paramètres de MFA sont absents ou invalides. Resend doit être configuré
avec un domaine expéditeur vérifié. Cette MFA par e-mail ne protège pas contre
la compromission simultanée du mot de passe et de la boîte e-mail.

## Déploiement VPS

Le déploiement automatique du VPS Hostinger est actif : son timer vérifie
`main` périodiquement et ne remplace que le service MaTable après la réussite
des vérifications de construction et du contrôle de santé. Voir le
[guide de déploiement](./infra/hostinger/README.md) et
[l’état d’avancement du projet](./docs/ETAT_AVANCEMENT.md).

## Identité visuelle du frontend

Les couleurs partagées sont définies dans `src/index.css` : vert émeraude
(`#087F62`), orange (`#F97316`), ivoire (`#FAF8F2`) et surfaces blanches.
Les couleurs fixes de l’interface réutilisent les variables `--mt-*` pour garder
une palette, des contrastes et des ombres cohérents. Les couleurs configurées
par les commerçants pour leur propre vitrine restent indépendantes de cette
identité.
L’accueil met en avant les catégories disponibles et les boutiques ayant une
photo réelle, sans substituer des vitrines fictives aux commerces publiés. Le
catalogue d’accueil présente une grille de produits sans défilement automatique,
avec filtres par catégorie, disponibilité, prix et boutique ; les campagnes
actives y sont identifiées et affichées avant les produits.

## État actuel

- Les demandes de commande utilisent le click-to-chat WhatsApp (`wa.me`) : le mode sélectionné au checkout est une préférence transmise à la boutique, pas un paiement en ligne. Les paiements d’abonnement et de boosts utilisent l’API et le checkout hébergé GeniusPay, qui achemine les paiements vers ses passerelles; les rappels d’échéance WhatsApp Business nécessitent une configuration fournisseur et le consentement du commerçant.
- Une commande client commence en attente de réponse du commerçant. Si la boutique a activé les notifications Push, un rappel unique est envoyé après 30 minutes sans réponse ; le stock reste réservé pendant deux heures, puis le système expire automatiquement les demandes encore sans réponse et libère le stock. Le commerçant peut accepter ou refuser dans son dashboard. Un client connecté peut annuler une demande encore en attente depuis son compte. Les invités suivent leur demande par WhatsApp ; leur adresse e-mail facultative sert uniquement à l’envoi du récapitulatif.
- Le compte client suit une carte de fidélité par boutique : cinq commandes livrées liées à ce compte ouvrent une récompense. Le commerçant la remet et l’enregistre depuis une commande livrée ; aucun rabais n’est appliqué automatiquement. Les commandes invitées ne sont pas comptabilisées.
- Sur mobile, le catalogue est une liste compacte (photo, titre, une ligne de description, prix, bouton « + »). Toucher un produit ouvre une feuille d'options : choix obligatoires ou facultatifs avec suppléments, taille et couleur pour la mode, détails, total en direct et ajout au panier. Sur grand écran, les cartes restent inchangées.
- Sur mobile, la vitrine respecte les zones sûres des iPhone, affiche un squelette de chargement aux dimensions réelles de la page (avec un bouton « Réessayer » après 8 s de connexion lente), permet de tirer pour actualiser le catalogue sans perdre le panier, et propose d'installer l'application à partir de la 2e visite (bouton natif sur Android, instructions Safari sur iPhone, rappel repoussé de 14 jours après un refus).
- La vitrine publique indique la date de dernière actualisation du catalogue. Cette date suit les changements de produits et de stock ainsi que les mises à jour des horaires.
- Le service de livraison MaTable (livreurs, courses et frais de livraison) est en veille. Les données historiques et les migrations sont conservées ; les commandes restent sans paiement intégré.
- Le prix d’une commande est recalculé côté serveur à partir du catalogue et des options sélectionnées.
- La publication (`publication_status`) est distincte de l’ouverture (`is_open`). Une boutique n’est publique que si elle est publiée, éligible KYC et couverte par un essai ou un abonnement actif, ou encore dans ses deux jours de grâce après échéance. Elle est masquée ensuite sans suppression de ses données ni blocage de l’accès marchand ; `is_open` contrôle uniquement la prise de commandes.
- Le stockage local et les tests utilisent SQLite (`better-sqlite3`). En production (`NODE_ENV=production`), le serveur utilise PostgreSQL via `DATABASE_URL` (Neon recommandé). Les écritures de commandes et de stock sont transactionnelles.
- Les sessions marchand et administrateur sont sécurisées via cookies `HttpOnly` et contrôles de sécurité sur les tentatives.
- La gestion de stock est protégée contre les oversells concurrentiels.
- Les nouvelles boutiques démarrent automatiquement un essai Standard de deux mois (2 produits maximum). Le commerçant peut choisir et payer directement une formule à tout moment, y compris dès la création de sa boutique. Les tarifs initiaux sont Standard (3 000), Premium (5 000) et Pro (8 000 FCFA/mois); le Super-admin peut modifier les tarifs et la page Formules affiche les montants actuels.
- Pendant l’essai, l’identité est vérifiée avant l’accès au dashboard. Une boutique vérifiée doit ensuite être publiée explicitement ; son ouverture commerciale reste contrôlée séparément.
- Les notifications Push navigateur restent soumises à l’accord du commerçant, mais une fenêtre « Activez les alertes de commande » s’affiche à chaque connexion au dashboard tant que l’appareil n’est pas abonné (le navigateur exige un clic pour l’autorisation). « Plus tard » la masque pour la session en cours ; un appareil déjà autorisé est abonné automatiquement, et si le navigateur bloque les notifications, la fenêtre explique comment les réautoriser. L’activation et la désactivation restent disponibles dans « Plus > Paramètres > Compte > Notifications ».
- Le centre opérationnel Super-admin contrôle la base de données, les commandes en attente au-delà de deux heures, les rappels de commande dus et les échecs Push des dernières 24 heures. Les alertes et compteurs se rafraîchissent toutes les 30 secondes lorsque l’onglet est visible ; ils signalent les situations à examiner sans modifier automatiquement une commande.

## Espace commerçant

Le dashboard propose les vues Accueil, Produits, Commandes et Statistiques, avec une navigation mobile à cinq onglets ; les réglages, le partage, l’abonnement, les boosts et l’assistance sont regroupés dans « Plus ». Le catalogue, le suivi des commandes, les horaires, l’apparence, la vérification, les rappels d’échéance consentis et les statistiques sont disponibles selon l’état de la boutique et le forfait.

Sur mobile, le catalogue commerçant est une liste compacte pensée pour des mises à jour sans saisie complexe : toucher le prix le modifie sur place, les boutons « − / + » ajustent le stock, et un bouton « Visible / Masqué » règle la vitrine. « Choisir plusieurs » permet de masquer, afficher, épuiser, lancer une promotion de −10 % ou −20 % pendant 7 jours, ou arrêter les promotions de plusieurs articles à la fois, avec confirmation ; seuls les articles concernés sont modifiés. Dans le formulaire d’un plat, chaque choix d’option a un nom et des boutons « Gratuit / +500 / +1 000 / Autre » pour le supplément (aucune syntaxe à écrire), et « Ajouter en un geste » reprend les groupes déjà créés sur les autres plats ou des modèles prêts (Sauce, Accompagnement, Boisson, Portion). Les mots du dashboard suivent la catégorie de la boutique (`src/utils/merchantVocabulary.ts`) : « Mon menu », « Ajouter un plat » et « Plus disponible » pour la restauration, « Mes prestations » et « Complet » pour les services, « Mes articles » et « Épuisé » pour la mode, etc.

Les limites sont vérifiées côté serveur : Standard permet 20 produits et 2 photos par produit, Premium un nombre illimité de produits et 5 photos, Pro un nombre illimité de produits et jusqu’à 6 photos. Pro incluant « Tout Premium », une configuration Pro ne peut pas descendre sous 5 photos par article. Les statistiques couvrent respectivement 7, 30 et 90 jours. Les sections avancées (parcours jusqu’à la commande, campagnes, audiences, pages et appareils) sont réservées à la formule Pro et vérifiées côté serveur. L’essai reste limité à 2 produits et bénéficie des statistiques sur 7 jours.

Le menu « Partage » génère un QR code PNG et une affiche PNG personnalisée avec le nom, la catégorie et la couleur de la boutique. Le QR code ne contient que le lien public et reste désactivé tant que la vitrine n’est pas publiée. Le dashboard propose l’export CSV du catalogue, l’import avec aperçu (ID MaTable renseigné pour modifier, ID vide pour créer; les cellules vides conservent les valeurs existantes) et l’export des commandes de la boutique. Les comptes d’équipe, codes promotionnels et programmes de parrainage ne sont pas encore disponibles.

## Administration

Le tableau de bord `/admin` propose deux rôles distincts, sélectionnés au moment de la connexion :

- **Vue générale Super-admin** : les statistiques reprennent les cartes et graphiques simples du dashboard commerçant, avec le périmètre global de la plateforme : visiteurs distincts, commandes reçues, ratio brut commandes/visiteurs et montant demandé. Le ratio peut dépasser 100 % lorsque des visiteurs passent plusieurs commandes ; il ne représente pas une part de personnes converties. Chaque carte compare la période sélectionnée à la période précédente ; l’état des comptes boutiques est présenté séparément, et des graphiques en barres montrent les visites et commandes quotidiennes. Les libellés précisent que le montant demandé n’est pas un paiement encaissé et que les visiteurs sont comptés après consentement. Une file d’intervention regroupe aussi les signalements, vérifications d’identité, commandes en attente de réponse et avis à modérer, avec un accès direct à chaque file. Les files de commandes et de modération se rafraîchissent toutes les 30 secondes lorsque l’onglet est visible ; les erreurs de chargement sont signalées au lieu d’être présentées comme une file vide. Ce suivi ne confirme ni n’annule automatiquement les commandes à la place du commerçant.
- **Super-admin** : accès complet aux outils d’administration, notamment aux paiements et abonnements, aux liens d’accès des boutiques, au mode maintenance, au suivi des annonces automatiques, à la suspension/réactivation des boutiques et comptes clients, à la suppression de boutiques et au journal d’audit global consultable et filtrable. Toute suspension ou réactivation exige un motif; suspendre un compte client révoque ses sessions actives. Toute prolongation d’essai gratuit exige également un motif explicite inscrit au journal d’audit.
- **Admin de vérification** : espace centré sur la file Didit et la modération de contenu, avec la possibilité de préparer un rappel WhatsApp de vérification. Il dispose d’une liste de boutiques strictement en lecture seule, limitée au nom, à la ville, à la catégorie et aux statuts de publication et d’identité ; elle n’expose pas les coordonnées privées ni les données financières. Il ne peut pas modifier les statuts des commandes, gérer les paiements ou abonnements, supprimer des boutiques, créer des liens d’accès privés, modifier le mode maintenance ou consulter le suivi des annonces automatiques. Un accès en lecture seule aux commandes d’une boutique reste disponible sur l’API marchand pour les besoins limités.

Les autorisations sont vérifiées côté serveur ; masquer une rubrique dans l’interface n’est pas le mécanisme de contrôle d’accès. Les deux rôles utilisent des clés indépendantes configurées uniquement sur le serveur. En production, `ADMIN_ACCESS_KEY` et `VERIFICATION_ADMIN_ACCESS_KEY` sont obligatoires et doivent chacune être fortes, uniques, distinctes et comporter au moins 32 caractères. Configurez-les dans l’environnement de déploiement (par exemple les variables du service Render) ; ne les ajoutez pas au dépôt, au frontend, aux journaux ou aux captures d’écran.

### Livraison MaTable — en veille

Les écrans de configuration et d’exploitation (livreurs, zones, courses et suivi) ont été retirés de l’expérience courante. Garder `DELIVERY_OPERATIONS_ENABLED=false` dans les environnements ; ne pas appliquer de migration de livraison ni activer les routes pendant cette mise en veille. Les données et migrations historiques restent dans le dépôt et la base. Les modalités de retrait ou d’une livraison organisée directement avec une boutique restent à convenir avec celle-ci.

Les paragraphes techniques ci-dessous documentent l’implémentation conservée pour référence, pas un service actuellement disponible. Pour le développement et les tests :

```sh
DELIVERY_TEST_MODE=true DELIVERY_SANDBOX_PAYMENTS=true MATABLE_DB_PATH=:memory: npm run dev
```

L’aperçu local reste accessible sur `/__preview/delivery-courier` en développement uniquement. La route publique `/livreur` affiche un avis de mise en veille et ne permet plus de créer un compte ou de gérer des courses. Le mode simulé reste réservé aux tests avec `DELIVERY_SANDBOX_PAYMENTS=true`; les références aux fournisseurs et aux workflows Didit ci-dessous ne doivent pas être utilisées pour réactiver le service.

En production, ne passez pas `DELIVERY_OPERATIONS_ENABLED` à `true`. Les migrations et les lignes historiques doivent être conservées.

Avant de clôturer une course en `delivered`, le livreur doit enregistrer une preuve photo (JPEG, PNG ou WebP, 300 Ko maximum), stockée en base avec son empreinte SHA-256. L’exigence est active par défaut et peut être levée avec `DELIVERY_REQUIRE_PROOF=false`. La preuve reste remplaçable tant que la course n’est pas livrée, puis consultable par le commerçant et le client concernés.

Chaque course expose un historique horodaté (`delivery_course_events`) commun au livreur, au commerçant et au client. L’interface livreur s’actualise toutes les 12 secondes, celle du commerçant toutes les 15 secondes et le suivi client toutes les 20 secondes, uniquement lorsque l’onglet est visible. Les trois espaces proposent une activation Push appareil par appareil : nouvelle course correspondant aux zones actives du livreur, acceptation et changements de statut pour le marchand, suivi et preuve photo pour le client. Sans configuration VAPID, les routes d’abonnement répondent `503` et l’interface l’indique sans bloquer le parcours.

Un livreur peut libérer une course acceptée avant la récupération du colis (trois fois par 24 h au maximum) : elle redevient disponible et le marchand, le client et les autres livreurs éligibles sont notifiés. Une course restée `requested` au-delà de `DELIVERY_OFFER_TTL_MINUTES` (120 minutes par défaut) est annulée automatiquement avec notification des parties. Le Super-admin dispose d’une supervision des courses dans **Livraison** : filtrage par statut, retrait d’un livreur avec motif et annulation motivée. En environnement de test uniquement, il peut aussi déclencher manuellement l’expiration des offres. Toutes ces actions sont inscrites dans le journal d’audit admin. Une annulation de commande par le marchand annule aussi la course liée et notifie le livreur et le client.

Le code conserve les anciens flux de paiement livreur et de gestion des zones à titre de référence, mais ils ne sont pas disponibles dans les interfaces courantes. Les routes correspondantes ne sont montées qu’avec `DELIVERY_OPERATIONS_ENABLED=true` ; garder ce paramètre à `false` pendant la mise en veille. Les contacts des commandes classiques sont masqués dans les listes client et marchand; une révélation explicite est limitée à cinq par compte et dix par IP sur dix minutes, consignée dans `order_contact_audits` et verrouillée après livraison, annulation, expiration ou remboursement. Les changements de schéma PostgreSQL sont versionnés dans `migrations/036_delivery_mvp.sql`, `migrations/037_order_contact_audits.sql`, `migrations/038_delivery_tickets_proofs_payments.sql`, `migrations/039_delivery_notifications.sql` et `migrations/040_delivery_order_fees.sql`; ils n’ont pas été appliqués à une base de production.

Dans **Abonnements**, le Super-admin peut modifier les tarifs mensuels des formules. Les changements sont validés et journalisés; les pages commerçantes et les nouveaux paiements utilisent le tarif enregistré. Un paiement déjà confirmé et l’échéance qu’il a financée ne sont pas modifiés. Le tarif annuel correspond à 10 mensualités. Les paiements GeniusPay sont initiés manuellement par le commerçant, sans prélèvement automatique : programmer l’arrêt des droits à l’échéance ne bloque donc pas un renouvellement payé avant cette date. Il peut aussi accorder temporairement une formule ou suspendre les droits d’une boutique précise, jusqu’à une date choisie, avec un motif obligatoire. À cette date, l’état de facturation et les changements programmés reprennent automatiquement ; ces dérogations ne créent aucun paiement et ne désactivent pas la boutique. La dérogation peut aussi être retirée immédiatement pour rétablir l’automatisation.

La liste Super Admin des boutiques permet de filtrer les statuts de publication, d’identité et d’abonnement. Le journal des paiements est paginé côté serveur et ses filtres couvrent l’ensemble de la période, sans modifier le statut des transactions. Le journal d’audit global enregistre également les transitions de statut acceptées par webhook Didit ; il ne contient ni documents d’identité, ni contenu libre du webhook, ni secrets. Les annonces Push sont entièrement automatiques (voir « Annonces automatiques »).

## Démarrage local

Prérequis : Node.js 22 LTS recommandé.

1. Installer les dépendances :
   `npm install`
2. Créer un fichier `.env` à partir de la section « Variables d’environnement » ci-dessous.
3. Démarrer l’application :
   `npm run dev`

L’application est disponible sur : `http://localhost:3000`
En développement, la clé KYC peut rester vide (clé fixe réservée aux données de test) ; n’y stockez pas de vrais documents d’identité.

## Configuration requise

### Variables d’environnement

`HOST` est facultatif. Utilisez `127.0.0.1` pour limiter l’accès à la machine locale ; par défaut, le serveur écoute sur `0.0.0.0`.

```env
NODE_ENV="development"
HOST="127.0.0.1"
PORT="3000"
MATABLE_DB_PATH="./data/matable.db"
DATABASE_URL="postgresql://..."
APP_URL="http://localhost:3000"
TRUST_PROXY_HOPS="0"
ADMIN_ACCESS_KEY="CHANGE_ME_ADMIN_KEY"
VERIFICATION_ADMIN_ACCESS_KEY="CHANGE_ME_VERIFICATION_ADMIN_KEY"
AD_EVENT_SIGNING_SECRET=""
ADVERTISING_BETA_ENABLED="false"
DIDIT_API_KEY=""
DIDIT_WORKFLOW_ID=""
DIDIT_DRIVER_WORKFLOW_ID="" # facultatif : workflow distinct, sinon DIDIT_WORKFLOW_ID
DIDIT_WEBHOOK_SECRET=""
VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_SUBJECT="mailto:assistance@matable-ci.com"
GOOGLE_OAUTH_CLIENT_ID=""
GOOGLE_OAUTH_CLIENT_SECRET=""
APPLE_SERVICE_ID=""
APPLE_TEAM_ID=""
APPLE_KEY_ID=""
APPLE_PRIVATE_KEY=""

VITE_WHATSAPP_ADMIN_PHONE=""
RESEND_API_KEY=""
RESEND_FROM_EMAIL="MaTable <welcome@exemple.com>"
EMAIL_FROM="MaTable <welcome@exemple.com>"
GENIUSPAY_API_KEY=""
GENIUSPAY_API_SECRET=""
GENIUSPAY_WEBHOOK_SECRET=""
GENIUSPAY_API_URL="https://geniuspay.ci/api/v1/merchant/payments"
```

### Production / Neon PostgreSQL

En production, `NODE_ENV=production` sélectionne PostgreSQL et `DATABASE_URL`; le fichier SQLite n’est alors pas ouvert. Au premier démarrage, le serveur crée les tables de base si nécessaire, puis applique de façon idempotente les évolutions de schéma. Le runner versionné peut aussi être exécuté explicitement après la création du schéma de base avec `npm run migrate:neon`. Les migrations sont additives : elles ne copient ni ne réécrivent les données métier existantes.

Le fil public interroge le catalogue par lots paginés côté base, au lieu de charger tous les produits à chaque visite. Le CDN peut ainsi mettre en cache les pages publiques sans que chaque rendu du fil transfère le catalogue entier depuis PostgreSQL.

### Médias publics (Cloudflare R2)

Les photos produits, logos et bannières sont compressés dans le navigateur puis téléversés directement vers Cloudflare R2 via une URL présignée (5 minutes). L’API ne reçoit que les métadonnées et signe aussi la taille du fichier. Variables à définir dans Render :

- `R2_ENDPOINT` (par exemple `https://<account-id>.r2.cloudflarestorage.com`)
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL` (domaine public du bucket, obligatoire : sans lui le téléversement est refusé en `503`)

Formats acceptés : JPEG, PNG, WebP et GIF (SVG refusé), 8 Mo maximum. Le bucket doit autoriser les requêtes `PUT` présignées depuis l’origine publique de l’application et servir les objets en lecture publique avec `Cache-Control` immutable. Tant que R2 n’est pas configuré, l’interface reste utilisable : le client conserve une image base64 compressée, et les écritures marchandes préservent les images base64 existantes (bornées à 2 Mo) au lieu de les effacer. Ces données historiques restent affichables via `/media/products/...`; une migration vers R2 pourra être planifiée sans bloquer les commerçants. `npm run check:prod` signale une configuration R2 incomplète en avertissement.

Les pièces de vérification manuelle utilisent un bucket **R2 privé distinct** du stockage média public. Configurez `R2_PRIVATE_BUCKET` (nom différent de `R2_BUCKET`), `R2_PRIVATE_ENDPOINT` (peut reprendre `R2_ENDPOINT`) et des identifiants `R2_PRIVATE_ACCESS_KEY_ID` / `R2_PRIVATE_SECRET_ACCESS_KEY` à droits limités au bucket privé. Aucun domaine public ne doit être configuré pour ce bucket. Son CORS doit autoriser uniquement l’origine MaTable à envoyer des `PUT` avec `Content-Type`; les objets doivent rester privés. Le parcours de dépôt renvoie `503` tant que le bucket privé distinct n’est pas configuré. Seuls les JPEG, PNG et WebP jusqu’à 10 Mo sont acceptés; le serveur contrôle taille, type, signature et décodage, limite la résolution et réencode l’image pour supprimer les métadonnées. Les liens d’examen Super Admin expirent après 60 secondes et chaque émission est journalisée. Les fichiers sont purgés 90 jours après une décision finale; les URL de dépôt expirent après 10 minutes et les dépôts incomplets sont retirés lors de la purge horaire suivante.

Le workflow GitHub Actions « PostgreSQL integration » exécute le lint, les tests et un test de migrations/adaptateur sur un PostgreSQL temporaire. Pour valider un environnement Neon séparément, exécutez `DATABASE_URL=<URL-de-la-base-de-test> npm run test:postgres`; n’utilisez jamais l’URL de production pour ce test.

### Sauvegarde PostgreSQL et validation de restauration

`npm run db:backup` utilise `DATABASE_URL` (en production, celle configurée dans Render) et `pg_dump` au format custom. Il refuse d’écraser un fichier existant, vérifie l’archive avec `pg_restore --list` et produit un fichier SHA-256 adjacent (`.dump.sha256`). Exemple avec un chemin choisi :

```sh
npm run db:backup -- --output backups/matable-prod-2026-10-10.dump
```

Installez les outils client PostgreSQL (`pg_dump`, `pg_restore` et `psql`) dans l’environnement d’exécution, avec une version compatible avec le serveur. Le dossier local `backups/` est ignoré par Git et ne constitue pas un stockage durable. L’opérateur doit configurer séparément une planification (par exemple un ordonnanceur externe) et la copie chiffrée vers un stockage indépendant, avec rétention et contrôle d’accès adaptés. **Le workflow `.github/workflows/db-backup.yml` fournit une planification quotidienne optionnelle : il s’exécute uniquement lorsque les secrets `DATABASE_URL` et `BACKUP_AGE_RECIPIENT` (clé publique `age`) sont configurés dans GitHub, chiffre l’archive avant de la téléverser comme artefact de 30 jours, et ignore silencieusement la sauvegarde dans le cas contraire. Les artefacts GitHub ne remplacent pas une destination durable : l’opérateur doit encore copier les archives chiffrées vers un stockage indépendant et tester une restauration. Générez la paire avec `age-keygen -o backup-key.txt` : conservez la clé privée hors de GitHub et n’y enregistrez que la clé publique dans `BACKUP_AGE_RECIPIENT`. Tant que ces responsabilités externes ne sont pas mises en place et vérifiées, les sauvegardes ne sont pas déclarées pleinement opérationnelles.** Les fichiers de sauvegarde contiennent des données de production : ne les commitez pas et protégez-les comme des secrets.

Pour tester réellement une restauration, créez d’abord une base PostgreSQL jetable dont le schéma applicatif `public` est vide, distincte de la production. Le script exige la confirmation `--confirm-disposable`, vérifie le SHA-256, compare source et cible, autorise les schémas système du fournisseur mais refuse tout objet applicatif déjà présent dans `public`, restaure uniquement `public` sans supprimer d’objets existants et compare les nombres de lignes des tables métier principales avec la source. Lancez d’abord le préflight non destructif :

```sh
export DATABASE_URL='postgresql://…' # base source utilisée pour protéger la production
export RESTORE_TARGET_DATABASE_URL='postgresql://…' # base jetable vide, jamais la production
npm run db:restore:validate -- --dump backups/matable-prod-2026-10-10.dump --confirm-disposable --preflight-only
```

Après confirmation qu’il s’agit bien d’une base jetable, relancez cette commande sans `--preflight-only` pour effectuer la restauration. Alternative : passer la cible explicitement avec `--target-url '<URL-de-la-base-jetable>'`. Ne mettez jamais une URL avec identifiants dans des journaux ou scripts versionnés. La validation peuple la cible ; supprimez/recréez cette base avant un nouvel essai. Pour une vérification manuelle du checksum : `(cd backups && shasum -a 256 -c matable-prod-2026-10-10.dump.sha256)`. N’exécutez jamais cette procédure avec une cible de production.

Les commandes de sauvegarde et de validation chargent `.env` automatiquement. Pour migrer vers une autre base PostgreSQL, conserver l’URL source dans `DATABASE_URL` (ou `SOURCE_DATABASE_URL`) et placer temporairement l’URL cible dans `RESTORE_TARGET_DATABASE_URL` (ou `TARGET_DATABASE_URL`); une cible explicite peut aussi être passée à `--target-url`. Créer d’abord une archive avec `npm run db:backup`, puis lancer le préflight avec `--preflight-only`. La validation vérifie le checksum, protège la source, refuse tout objet applicatif préexistant dans `public` et ne restaure que ce schéma. Utiliser une cible vide et jetable ; pour une destination déjà utilisée, faire d’abord une sauvegarde séparée et ne pas contourner le refus de la validation.

#### Bascule Supabase vers Neon PostgreSQL

1. Créer une base Neon dédiée dans une région proche du déploiement et générer un mot de passe dédié, conservé uniquement dans le gestionnaire de secrets. L’application utilise des noms de tables non qualifiés : privilégier l’URI de connexion **directe** Neon et vérifier avec cette même URI que `SELECT current_schema()` renvoie `public`. Le pooler Neon peut ne pas appliquer le `search_path` nécessaire à ces requêtes.
2. Arrêter temporairement les écritures applicatives ou prévoir une courte fenêtre de maintenance afin que la sauvegarde finale soit cohérente.
3. Conserver l’URL Supabase dans `DATABASE_URL` (ou `SOURCE_DATABASE_URL`) et configurer temporairement l’URL de la base Neon vide dans `RESTORE_TARGET_DATABASE_URL` (ou `TARGET_DATABASE_URL`). Ne coller aucune URL dans le dépôt, un ticket ou le chat.
4. Créer l’archive source avec `npm run db:backup -- --output backups/matable-supabase-<date>.dump`, puis lancer d’abord le préflight non destructif avec `--preflight-only`. Après vérification qu’il s’agit bien de la base Neon vide, lancer la restauration avec `--confirm-disposable`.
5. Vérifier les nombres de lignes des tables principales et appliquer les migrations manquantes si nécessaire avec `DATABASE_URL=<URL-directe-Neon> npm run migrate:neon`. Tester l’application et les parcours de boutiques, produits, commandes et paiements avant la bascule.
6. Au créneau de bascule, refaire une sauvegarde finale de Supabase, restaurer cette archive sur la cible validée, remplacer le secret `DATABASE_URL` du service Render par l’URI directe Neon, redéployer et contrôler le bilan de santé et les opérations métier.
7. Garder Supabase intact en lecture seule comme solution de retour arrière jusqu’à validation complète des commandes et paiements après bascule. Ne pas supprimer la source avant une période d’observation et une sauvegarde restaurable conservée hors fournisseur.

Une URL de connexion PostgreSQL est un secret d’accès complet. Protéger les archives et leurs checksums comme des données sensibles, ne pas les commiter, et planifier des sauvegardes chiffrées vers un stockage indépendant avec des restaurations périodiques sur une base jetable.


Exemple de configuration :

```env
NODE_ENV="production"
PORT="3000"
DATABASE_URL="postgresql://..."
APP_URL="https://matable-ci.com"
TRUST_PROXY_HOPS="1"
ADMIN_ACCESS_KEY="<cle-tres-longue-et-securisee>"
DIDIT_API_KEY="<cle-api-didit>"
DIDIT_WORKFLOW_ID="<uuid-du-workflow-didit>"
DIDIT_WEBHOOK_SECRET="<secret-webhook-didit>"
```

Dans la console Didit, configurez le webhook `https://<domaine-public>/api/webhooks/didit` pour les événements de changement de statut (`status.updated`). L’API key, l’identifiant du workflow et le secret du webhook restent dans les variables serveur Render et ne doivent jamais être exposés au navigateur. Le serveur refuse de démarrer une vérification tant que l’API key et l’identifiant de workflow ne sont pas configurés.

L’URL publique principale est `https://matable-ci.com` (avec `www.matable-ci.com` redirigé vers le domaine racine). Conservez `https://matable-ci.onrender.com` comme adresse de secours. Configurez `APP_URL` et les URL canoniques, Open Graph et JSON-LD sur le domaine principal. Les URI de retour des fournisseurs doivent correspondre à `APP_URL`; les webhooks peuvent conserver temporairement l’alias Render tant que celui-ci reste actif.

#### Audience et actions super-admin

Les statistiques d’audience sont collectées uniquement après consentement analytique. Les liens `?src=tiktok`, `?utm_source=instagram` et `?utm_campaign=campagne_nom` attribuent la visite consentie à une campagne (identifiant limité à 80 caractères alphanumériques, tirets et tirets bas). L’onglet Audience présente l’origine, les campagnes, les sessions, les commandes, le volume de ventes associé et les clics WhatsApp attribués ; il ne conserve pas les URL complètes de provenance. Les boutiques créées et les clics WhatsApp sont aussi résumés sur 7 jours dans Abonnements.

Les actions super-admin de suspension/réactivation exigent un motif, une confirmation et sont consignées. La correction manuelle d’une échéance d’abonnement actif demande une date et un motif de vérification ; elle ne confirme pas un paiement et ne doit être utilisée qu’après contrôle d’un justificatif. Les corrections d’essai synchronisent uniquement l’expiration technique avec la fin d’essai enregistrée. Une dérogation manuelle active bloque les autres commandes de cycle de vie et de facturation jusqu’à son retrait ou son expiration.


### Base Neon gratuite sur Render

Créer le projet Neon puis configurer `DATABASE_URL` dans Render. Le service Render Free n’a pas besoin d’un disque local persistant pour les données métier lorsque Neon est utilisé.

### Paiements GeniusPay

MaTable utilise l’API marchande et le checkout hébergé GeniusPay pour les abonnements mensuels/annuels et les boosts. GeniusPay se décrit comme facilitateur d’intégration technique et non comme établissement de paiement, PSP ou agrégateur; les transactions sont acheminées par les passerelles proposées dans son checkout. L’annuel facture 10 mensualités pour 12 mois de service. Les commandes clients restent réglées directement auprès des boutiques. Le dashboard crée une intention côté serveur et redirige vers le checkout; au retour sur `/app`, il vérifie le statut du paiement et affiche le résultat, quel que soit l’écran marchand ouvert. Une ancienne boutique sans adresse e-mail peut la renseigner au paiement; elle est enregistrée sur la boutique et utilisée pour envoyer le reçu MaTable après confirmation. Ne remplacez pas cette adresse par une valeur fictive.

Configurer `GENIUSPAY_API_KEY`, `GENIUSPAY_API_SECRET`, `GENIUSPAY_WEBHOOK_SECRET` et `GENIUSPAY_API_URL` côté serveur. L’URL documentée V3 est `https://geniuspay.ci/api/v1/merchant/payments`; l’application refuse les hôtes hors `geniuspay.ci` en dehors des tests. Les créations transmettent l’ID de l’intent dans `Idempotency-Key` pour éviter les doublons lors d’un retry réseau, sans envoyer simultanément `external_reference`. Déclarer `https://<domaine-public>/api/webhooks/geniuspay` dans les webhooks GeniusPay et s’abonner à `payment.success`, `payment.failed`, `payment.cancelled`, `payment.expired` et `payment.refunded`. L’implémentation vérifie la signature HMAC-SHA256 documentée sur `timestamp + "." + corps JSON brut`, rejette les horodatages de plus de cinq minutes, journalise l’ID et un hash du webhook sans garder son corps, et n’active que les paiements dont l’intention, le type, la référence et le montant correspondent.

Le document d’intégration fourni contient des exemples `http://`; ils ne sont pas utilisés par l’application. Conservez l’URL HTTPS : `X-API-Secret` ne doit jamais transiter en clair.

Les intents d’abonnement expirent localement après 24 heures, mais l’URL de checkout peut encore être payée côté fournisseur : un webhook signé ou une réconciliation authentifiée par référence peut activer un intent expiré uniquement après confirmation `completed` et vérification du montant, de la devise, du type et des metadata. La réconciliation s’exécute au démarrage puis toutes les cinq minutes, avec un maximum de 25 transactions par passage et un délai minimum entre vérifications. Les réservations de boost expirent après 15 minutes; un paiement confirmé tardivement est replanifié sur un créneau disponible. Les événements sont conservés 180 jours. Un remboursement d’abonnement est signalé à l’administration pour revue et ne suspend pas automatiquement la boutique; un boost remboursé est annulé. Commencez en sandbox. Les identifiants sandbox/live, le compte marchand et les retraits doivent être configurés et testés dans le tableau de bord GeniusPay avant toute mise en production.

Un paiement confirmé active les droits d’abonnement, mais ne réactive pas une boutique désactivée ou non publiée et ne contourne pas la vérification d’identité. Une suspension manuelle active empêche la création d’un nouveau checkout GeniusPay. Si un checkout avait déjà été ouvert avant cette suspension et est réglé ensuite, le paiement est enregistré, mais les droits restent suspendus jusqu’à la levée ou à l’expiration de la dérogation; l’espace commerçant l’indique au retour du paiement.

Le checkout exige une adresse e-mail de facturation. MaTable ne collecte ni ne stocke de données de carte et ne déclenche aucun prélèvement automatique : le commerçant initie et confirme chaque paiement. Voir la [documentation API GeniusPay](https://geniuspay.ci/docs/api) pour les détails officiels du contrat marchand et des webhooks.


Les échéances restent actives jusqu’à la fin de leur date civile en Côte d’Ivoire; l’écran de renouvellement apparaît le lendemain. Le statut effectif passe à `past_due` pendant le délai de grâce, puis `suspended` et la boutique est masquée publiquement. Les données et l’accès marchand sont conservés afin de permettre le renouvellement. Si les secrets WhatsApp Business sont configurés, le serveur envoie les rappels à J−14, J−7, J−3 et J−1 uniquement aux commerçants ayant activé l’opt-in dans « Mon forfait ». Chaque échéance et chaque palier sont enregistrés pour éviter les doublons; un échec fournisseur est journalisé et peut être retenté. Changer le numéro WhatsApp révoque l’accord. Configurer dans Render `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_SUBSCRIPTION_REMINDER_TEMPLATE` et `WHATSAPP_GRAPH_API_VERSION`. Le modèle Meta doit être approuvé comme modèle utilitaire et contenir deux paramètres de corps : le nom de la boutique et sa date d’échéance. L’envoi automatique dépend de ces identifiants secrets Meta et de l’approbation du modèle; aucune valeur secrète ne doit être placée dans le dépôt. Le code ne déclenche aucun prélèvement automatique : le commerçant doit toujours ouvrir le checkout GeniusPay et confirmer le paiement.

### Notifications Push navigateur

**Annonces automatiques** (`server/services/automatedAnnouncements.ts`, cycle de 15 minutes et au démarrage) : bienvenue à l’activation du Push, rappels d’échéance J−14/J−7/J−3/J−1 (essai gratuit ou abonnement), relance 48 h après la création d’une boutique sans produit, relance d’identité à compléter (24 h après la création, et après un refus), résumé du lundi (visiteurs et commandes de la semaine, si activité) et relance au plus mensuelle après 14 jours sans visite ni commande pour une boutique publiée. Aucune annonce automatique ne part entre 20 h et 8 h (heure d’Abidjan). Le commerçant peut désactiver deux catégories dans « Paramètres > Notifications » (table `merchant_push_preferences`) : « Résumé du lundi » et « Conseils et relances » (produit, identité, inactivité). La bienvenue, les commandes, le stock et les échéances restent toujours actifs. Chaque annonce est idempotente par boutique (`merchant_push_deliveries`) et n’est envoyée qu’aux appareils abonnés ; sans clés VAPID, rien n’est envoyé. Le Super-admin ne les rédige pas : l’onglet « Annonces automatiques » n’affiche que leur suivi.

Générez une paire VAPID dédiée au serveur, par exemple avec `npx web-push generate-vapid-keys`, puis configurez `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT` dans les variables d’environnement de Render et en local. Le sujet doit être une URL HTTPS du service ou une adresse `mailto:` de support. La clé privée reste exclusivement côté serveur : ne la placez ni dans une variable `VITE_*`, ni dans le dépôt, ni dans un ticket ou une capture. Sans les trois variables, l’interface indique que le service n’est pas configuré et aucun abonnement Push ne peut être créé.

Chaque commerçant choisit explicitement ses appareils et peut les désabonner dans ses paramètres. Les abonnements sont liés à la boutique authentifiée ; les endpoints expirés (HTTP 404/410) sont supprimés. Les envois sont dédupliqués et les échecs sont journalisés sans annuler la commande, la modification du stock ou la vérification d’identité à l’origine de l’alerte. Les Push exigent HTTPS (Render le fournit) et l’autorisation du navigateur. Le centre opérationnel admin affiche le nombre d’appareils associés, l’état VAPID, le suivi des annonces automatiques sur 30 jours. Il n’y a plus d’envoi manuel.

Les tables Push des livreurs (`delivery_driver_push_subscriptions`) sont conservées avec l’historique de livraison ; les notifications liées aux courses ne font pas partie du service actuellement disponible. Les clients peuvent toujours gérer leurs notifications liées aux commandes sans activer de paiement en ligne.

### Publicité et partenariats

Le boost payant de boutique reste inchangé et conserve son checkout GeniusPay. La nouvelle bêta, lorsqu’elle sera autorisée, permet aux boutiques actives, vérifiées et dont les informations publiques sont complètes de soumettre gratuitement une campagne produit et une bannière au maximum par format, pour sept jours chacune. Chaque création exige l’acceptation de la charte affichée dans l’espace marchand et une approbation du Super-admin avant diffusion. Les emplacements publicitaires restent limités à un module sponsorisé par page; un produit sponsorisé n’est présenté qu’après au moins six produits naturels. Les demandes de partenaires externes sont examinées manuellement, sans compte annonceur ni paiement autonome.

La bêta dure 30 jours et n’est pas lancée par défaut. Hors tests automatisés, `ADVERTISING_BETA_ENABLED=false` verrouille le démarrage et la reprise; ne positionnez ce drapeau à `true` qu’après validation de la préproduction, des commandes, des contrôles de sécurité et de la stabilité. `AD_EVENT_SIGNING_SECRET` doit être une clé aléatoire, propre à l’environnement et d’au moins 32 caractères; elle signe les jetons d’événements et protège la pseudonymisation. Les impressions et clics ne sont enregistrés qu’après consentement explicite de mesure et sont dédupliqués par visiteur pseudonymisé, campagne, type et jour. Ces mesures ne prouvent ni commande ni revenu publicitaire. Aucune nouvelle tarification ou facturation automatique n’est prévue pour ces formats.

Après confirmation d’un abonnement par un webhook GeniusPay signé et vérifié, un reçu est généré et envoyé à l’adresse e-mail du propriétaire via Resend. Configurer `RESEND_API_KEY` et une adresse d’expédition vérifiée dans `RESEND_FROM_EMAIL` (ou `EMAIL_FROM`). Aucun reçu d’abonnement n’est émis à partir d’une simple déclaration de paiement côté navigateur. La validation locale ne prouve pas le fonctionnement d’un compte GeniusPay ou Resend en production : un paiement réel exige les identifiants et domaines vérifiés des fournisseurs.

Resend sert également aux messages de bienvenue client et commerçant, aux récapitulatifs de commande client, à la récupération de mot de passe client et à la réinitialisation du PIN marchand. Le récapitulatif est envoyé à l’adresse du compte connecté ou, pour une commande invitée, à l’adresse facultative saisie au checkout; il précise que le paiement reste à convenir avec la boutique. Les liens de récupération expirent après 30 minutes, sont stockés sous forme hachée et ne peuvent être utilisés qu’une fois; leur utilisation révoque les sessions client existantes. La réinitialisation du PIN marchand (`/reinitialiser-pin-commercant`) envoie un lien à l’adresse e-mail du propriétaire, expire après 30 minutes, est à usage unique et déconnecte toutes les sessions commerçant de la boutique. Après confirmation d’un abonnement, un reçu de paiement distinct est envoyé au propriétaire. Les rappels d’abonnement par e-mail sont distincts des rappels WhatsApp et restent désactivés tant que le commerçant n’a pas donné son accord dans les paramètres. Appliquer les migrations `045_transactional_email_preferences` et `046_merchant_pin_reset_tokens` avant le déploiement. L’envoi réel reste inactif tant que la clé Resend et un expéditeur vérifié ne sont pas configurés dans Render.

## Règles métier

L’essai marchand Standard reste gratuit pendant deux mois calendaires et permet deux produits. Le commerçant peut payer une formule à tout moment, y compris dès la création de sa boutique. Les tarifs mensuels par formule sont configurables par le Super-admin et affichés sur la page Formules; l’annuel coûte 10 mensualités pour 12 mois de service. Le délai de grâce avant masquage est de deux jours. Un boost de 24 h, 3 jours ou 7 jours coûte respectivement 1 000, 1 500 ou 2 000 FCFA; Pro donne 15 % de remise. Chaque achat choisit un seul emplacement au même tarif : accueil, haut de catégorie ou boutiques de la ville. Cinq créneaux simultanés sont disponibles sur l’accueil, par catégorie ou par ville selon l’emplacement; les réservations payées débutent au premier créneau libre. Une boutique doit être vérifiée, ouverte et présenter au moins deux produits. Le bilan d’un boost présente les visites consenties de la vitrine et les clics WhatsApp suivis sur sa période; il ne s’agit pas d’une mesure de ventes ni d’une garantie de portée. Les boosts courent pendant leur durée prévue même si la vitrine est masquée. Après activation, les paiements ne sont pas remboursables, sauf impossibilité de MaTable d’activer le service payé, auquel cas le commerçant peut demander un remboursement à l’assistance.

Les valeurs initiales de catégorie (message, présentation, exemples de produits, palette et illustrations) sont centralisées dans `src/utils/categoryDefaults.ts`. Les illustrations produit sont des placeholders d’affichage : `image_url` reste vide tant qu’aucune photo réelle n’est fournie. Les anciennes valeurs génériques connues sont remplacées à l’affichage, sans migration automatique des boutiques ou produits existants.

## WhatsApp

Le projet utilise uniquement le click-to-chat `wa.me`. Le navigateur prépare le reçu de commande et le client choisit lui-même de l’envoyer au vendeur.

## Connexion Google et Apple

La connexion sociale client est facultative et reste masquée tant qu’un fournisseur n’est pas entièrement configuré. Les secrets restent uniquement dans l’environnement serveur. Déclarez dans les consoles OAuth les URL de retour exactes `https://votre-domaine/api/auth/customer-oauth/google/callback` et `https://votre-domaine/api/auth/customer-oauth/apple/callback`, puis renseignez les identifiants correspondants ci-dessus (ou dans Render). En local, utilisez l’URL et le port configurés dans `APP_URL`.

Les jetons OIDC sont vérifiés côté serveur avec issuer, audience, nonce, PKCE et e-mail vérifié. Une identité sociale dont l’e-mail vérifié correspond à un compte client existant est liée à ce compte; un nouveau compte doit fournir un téléphone ivoirien avant sa création. Les commandes et sessions restent associées au même profil client. Google/Apple ne peuvent pas être activés en production avant la configuration des identifiants et URL autorisées dans leurs consoles.

## Sécurité et vérifications

- `npm run archive:release` crée un ZIP des fichiers suivis ou non ignorés du dépôt. Il exclut les métadonnées Git, caches, sauvegardes, bases locales et journaux, clés privées et fichiers d’environnement secrets (sauf `.env.example` et `.env.production.example`). Les données de `data/` sont exclues sauf `data/.gitkeep`. Contrôlez toujours la liste avant envoi avec `npm run archive:release -- --dry-run`.
- Si une archive contenant une clé ou une base de données a déjà été partagée, considérez ces secrets et données comme compromis : renouvelez les clés concernées via les paramètres de déploiement et n’envoyez plus cette archive.
- Les routes marchand exigent une session `HttpOnly`, son empreinte de requête et une boutique active.
- Les routes admin exigent une session admin séparée.
- Express ne fait confiance aux en-têtes proxy que si `TRUST_PROXY_HOPS` est explicitement configuré pour l’infrastructure réelle.
- La vérification d’identité des commerçants est effectuée sur le parcours hébergé de Didit après consentement explicite. Seuls l’identifiant de session, le statut fourni par Didit et les éléments techniques nécessaires au traitement idempotent des webhooks sont conservés par MaTable. Le serveur authentifie les webhooks et aucune décision d’identité ne peut être saisie manuellement par un administrateur.

## Checklist de production

Avant un déploiement réel, vérifiez bien les points suivants :

1. Définir un `ADMIN_ACCESS_KEY` fort et unique.
2. Définir `APP_URL` avec l’URL publique exacte du site.
3. Définir `PORT` et `DATABASE_URL` explicitement dans l’environnement de production.
4. Vérifier qu’aucun ancien process Node n’écoute déjà sur le port cible.
5. Vérifier que `/api/admin/health` indique `postgresql` en production et que les comptes de boutiques, produits et commandes correspondent aux données attendues.
6. Ne jamais exposer la clé admin ni les secrets serveur dans le navigateur.
7. Laisser les boutiques non actives hors du directory public.
8. Tester le flux complet : création boutique → commande → ouverture du reçu WhatsApp du vendeur.
9. Vérifier le comportement de stock avec un test de surcharge sur le dernier article disponible.
10. Vérifier `npm audit` et corriger les vulnérabilités avant mise en production.
11. Configurer `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID` et `DIDIT_WEBHOOK_SECRET` dans Render, puis déclarer l’URL webhook Didit et tester le parcours hébergé ainsi que les événements signés.

### Contrôle de production

Deux commandes encadrent la bascule. Elles se chargent de `.env` si le fichier existe et n’écrivent aucun secret dans la sortie.

```sh
# Avant le déploiement : variables, secrets et schéma PostgreSQL cible
npm run check:prod

# Après le déploiement : pages, API, santé, assets et en-têtes de sécurité
npm run smoke:prod -- --url https://votre-domaine.com
```

`check:prod` bloque si `NODE_ENV` n’est pas `production`, si une variable obligatoire manque, si une clé est trop courte ou identique à l’autre, si `APP_URL` n’est pas une URL HTTPS publique, si `DATABASE_URL` n’utilise pas PostgreSQL, si une table ou une colonne récente manque, ou si une migration versionnée n’est pas enregistrée. Il signale en avertissement les intégrations facultatives incomplètes (Didit, GeniusPay, Resend, R2, Push, WhatsApp, OAuth) et un `DELIVERY_OPERATIONS_ENABLED=true` prématuré. Utilisez `--json` pour un rapport machine et `--skip-database` pour un contrôle hors ligne.

`smoke:prod` vérifie les pages publiques, `/health`, le refus `401` de `/api/admin/health`, les assets `/brand-kit/`, le manifeste PWA, `robots.txt`, `sitemap.xml` et les en-têtes de sécurité (`CSP`, `HSTS`, `nosniff`, `DENY`). En local derrière le serveur de production, ajoutez `SMOKE_FORWARDED_PROTO=https` pour satisfaire la redirection HTTPS.

État validé sur PostgreSQL 16 vierge : `npm run test:postgres`, `npm run migrate:neon` (47/47 migrations), `npm run db:backup`, `npm run db:restore:validate`, `npm run check:prod` et `npm run smoke:prod` (47 contrôles) réussissent. Le déploiement Render et l’activation de la livraison restent subordonnés à la fourniture des secrets réels et à l’application des migrations sur la base cible.

## Déploiement rapide

```bash
export NODE_ENV=production
export ADMIN_ACCESS_KEY="<clé très forte>"
export APP_URL="https://votre-domaine.com"
export PORT="3000"
export MATABLE_DB_PATH="./data/matable.db" # développement/tests uniquement
```

Puis :

```bash
npm run build
npm start
```

## Déploiement recommandé

Cette version finale est un serveur Node/Express avec Neon PostgreSQL. Déployez-la sur Render, Railway, Fly.io ou un VPS et configurez `DATABASE_URL` avec une base PostgreSQL persistante.

Le service Render décrit dans `render.yaml` exécute `npm ci --include=dev && npm run lint && npm run test:ci && npm run build` avant chaque déploiement : un test ou un contrôle TypeScript en échec bloque la mise en production. `test:ci` force `NODE_ENV=test` et neutralise `DATABASE_URL` afin que la suite n’ouvre jamais la base de production depuis le build. `autoDeploy` reste actif sur `main`, donc chaque push doit être vert localement au préalable. Il n’existe pas encore d’environnement de préproduction distinct.

Vercel convient au frontend statique, mais ne doit pas héberger directement ce serveur Express avec une base locale. Une base PostgreSQL externe est nécessaire.

Variables de production minimales : `NODE_ENV=production`, `APP_URL=https://votre-domaine`, `PORT` fourni par l’hébergeur, `DATABASE_URL`, `ADMIN_ACCESS_KEY` et `VERIFICATION_ADMIN_ACCESS_KEY` fortes, uniques et distinctes, `ADVERTISING_BETA_ENABLED=false`, les trois variables Didit et `TRUST_PROXY_HOPS` adapté au reverse proxy. Les cinq variables R2 (`R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`) sont facultatives au démarrage mais requises pour le téléversement d’images ; sans elles, l’interface bascule sur des images base64 compressées. `AD_EVENT_SIGNING_SECRET` est nécessaire uniquement si `ADVERTISING_BETA_ENABLED=true`; dans ce cas, configurez une clé forte, unique et d’au moins 32 caractères. Ne déverrouillez la bêta publicitaire qu’après les contrôles de préproduction décrits ci-dessus.

## Build production

```bash
npm run build
npm start
```
# Fondement multiservice (phase passerelle)

Le serveur actuel reste la source de vérité métier. Une passerelle HTTP
optionnelle et un environnement Compose local permettent de la conserver
derrière un point d’entrée stable, sans déplacer prématurément les domaines.
Consultez [la stratégie de migration multiservice](./docs/MULTISERVICE_MIGRATION.md)
pour le démarrage local, les contrats actuels et les garde-fous de migration.
