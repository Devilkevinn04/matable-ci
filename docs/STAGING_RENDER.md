# Préproduction Render

Cette configuration décrit un service de préproduction séparé. Elle ne modifie
pas `render.yaml`, qui reste la configuration de production. Aucun service,
aucune base de données et aucun déploiement Render ne sont créés par ce fichier.

## Préparer l’environnement

1. Dans Render, créez une base PostgreSQL dédiée aux tests. Ne réutilisez jamais
   la base de production et ne restaurez pas de données clients réelles dans
   cette base.
2. Créez un Blueprint Render depuis la branche de test et sélectionnez
   `render.staging.yaml` comme fichier de configuration.
3. Avant de créer le service, vérifiez que son nom est `matable-ci-staging` et
   que le service de production existant n'est ni remplacé ni modifié.
4. Renseignez les variables demandées par Render :
   - `APP_URL` : URL HTTPS attribuée au service de préproduction.
   - `DATABASE_URL` : URL interne de la base PostgreSQL de préproduction.
   - `VITE_WHATSAPP_ADMIN_PHONE` : numéro d'assistance au format international.
5. Vérifiez que les trois clés d'administration et de signature sont générées
   par Render et distinctes des clés de production. Ne copiez aucun secret de
   production.
6. Gardez le déploiement automatique désactivé. Lancez un déploiement explicite
   après avoir contrôlé les variables et la base ciblée.

## Vérifications

- Attendez que `/health` soit sain, puis contrôlez que le mode de base de
  données signalé par l'outil de santé est PostgreSQL.
- Créez uniquement des comptes, boutiques et contenus fictifs. Utilisez des
  adresses e-mail de test et des numéros contrôlés par l'équipe.
- Les identifiants Didit, GeniusPay, OAuth et WhatsApp Cloud ne sont pas
  configurés par ce Blueprint. Les tests correspondants restent indisponibles
  jusqu'à ce que des identifiants de bac à sable dédiés soient configurés.
- N'ajoutez pas de clés de production et ne déclenchez aucun paiement réel.
- Une fois les essais terminés, supprimez seulement les ressources de
  préproduction après avoir confirmé leur nom et vérifié qu'aucune donnée utile
  n'y reste.
