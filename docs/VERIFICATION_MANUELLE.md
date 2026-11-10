# Vérification manuelle des boutiques

## Politique

Les contrôles boutique et identité sont indépendants :

- `business_verification_status` contrôle la publication publique, le contact commercial et les commandes.
- `identity_verification_status` décrit l’examen du document d’identité. Un examen visuel manuel ne prouve ni l’authenticité officielle ni l’identité biométrique.
- `merchant_verification_status` reste le statut historique utilisé par Didit pendant la transition.

Une boutique peut être approuvée et visible/contactable avec l’identité encore en attente. Le badge public « vérifiée » reste réservé à une identité validée par Didit et à une boutique approuvée.

## Parcours et décisions

Dans Paramètres > Vérification, le commerçant accepte le consentement spécifique puis dépose :

- une photo de devanture et une photo de l’intérieur ou des produits/prestations;
- le recto et le verso de sa pièce d’identité, ou un passeport.

Seuls les JPEG, PNG et WebP jusqu’à 10 Mo sont acceptés. Le serveur vérifie le type, la taille et la signature binaire. Les justificatifs sont envoyés directement vers le bucket privé au moyen d’une URL présignée de courte durée; aucune URL publique n’est enregistrée ou affichée au commerçant.

Le Super Admin peut examiner chaque image par un lien de consultation valable 60 secondes. L’émission de chaque lien, les décisions et les suppressions sont journalisées. Pour approuver la boutique, il faut une devanture et un justificatif supplémentaire (intérieur ou produits). Pour approuver l’identité, il faut un passeport ou les deux faces de la pièce. Tout refus ou demande de correction exige un motif. Les statuts commerciaux et d’identité restent indépendants.

Les images de boutique ordinaires relèvent du stockage média public existant; celui-ci ne doit jamais contenir de justificatifs.

## Conservation et configuration requise

Les pièces sont supprimées 90 jours après la décision correspondante. Les URL de dépôt expirent après 10 minutes; les dépôts incomplets et les copies temporaires sont supprimés par la purge horaire suivante. Un échec est inscrit dans les journaux du serveur et les documents ne sont pas supprimés de la base si leur suppression dans R2 échoue.

Avant d’activer le dépôt, configurez sur Render :

- `R2_PRIVATE_BUCKET`, nom distinct de `R2_BUCKET`;
- `R2_PRIVATE_ENDPOINT` (ou `R2_ENDPOINT`);
- `R2_PRIVATE_ACCESS_KEY_ID` et `R2_PRIVATE_SECRET_ACCESS_KEY`, de préférence des clés limitées au bucket privé.

Ne configurez aucun domaine public pour le bucket privé. Son CORS doit autoriser uniquement l’origine MaTable et les requêtes `PUT` avec `Content-Type`. Le dépôt répond `503` si le bucket privé distinct ou les identifiants manquent. Un lien de lecture temporaire nécessite aussi le bucket configuré.

Le consentement est versionné et horodaté. Le rôle d’administration de vérification ne peut pas accéder à ces justificatifs; l’accès aux pièces est réservé au Super Admin. Ne demandez jamais leur envoi par WhatsApp.
