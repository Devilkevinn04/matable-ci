# Programme Ambassadeurs MaTable.ci

## Proposition

Lancer un test avec trois à cinq ambassadeurs, sans forfait publicitaire garanti. Chaque partenaire reçoit un code et un lien personnels. La prime est unique : 20 % du tarif d'un mois de la formule correspondant au premier abonnement effectivement payé par le nouveau commerçant.

| Formule | Prix mensuel par défaut | Prime unique | Reste avant charges |
| --- | ---: | ---: | ---: |
| Standard | 3 000 FCFA | 600 FCFA | 2 400 FCFA |
| Premium | 5 000 FCFA | 1 000 FCFA | 4 000 FCFA |
| Pro | 8 000 FCFA | 1 600 FCFA | 6 400 FCFA |

Ces prix sont les valeurs par défaut : les tarifs applicables peuvent être modifiés dans le Super Admin. La prime utilise le montant du paiement confirmé, et non le tarif courant après modification. Un abonnement annuel coûte dix mensualités : la prime est calculée sur un dixième du paiement annuel, arrondie au FCFA le plus proche. Les frais de paiement, taxes et autres charges ne sont pas déduits dans le tableau.

Le commerçant peut profiter de deux mois d'essai Standard ou payer avant la fin de l'essai. Aucun paiement n'est dû pour une inscription seule ou un abonnement gratuit.

## Attribution et contrôle

- Un seul ambassadeur par nouvelle boutique. Le premier lien valide est conservé jusqu'à 90 jours, indépendamment du consentement aux statistiques d'audience, et prévaut sur un code saisi ultérieurement. Si le navigateur bloque le stockage ou si la capture du lien échoue, le code du lien est transmis à l'inscription et validé par le serveur ; le code peut aussi être saisi manuellement.
- Le lien personnel ouvre directement `/app/creer-boutique?ref=CODE`. Les ouvertures valides sont comptées séparément des jetons d'attribution ; seuls l'ambassadeur et l'heure de la visite sont enregistrés, sans adresse IP, agent utilisateur ni identifiant persistant de visiteur. Les jetons d'attribution restent hachés côté serveur et expirent après 90 jours. Les statistiques antérieures au suivi des visites reflètent les jetons d'attribution émis et ne sont pas directement comparables aux nouvelles visites mesurées.
- La prime est générée sur le premier paiement d'abonnement confirmé, y compris si la boutique n'est pas encore publiée. Elle reste en attente tant que le Super Admin ne l'a pas vérifiée et que la boutique n'est pas publiée.
- Avant validation, vérifier que le commerçant est réellement nouveau, que la boutique est authentique et qu'il ne s'agit pas d'une auto-inscription. Les correspondances de coordonnées sont des alertes, pas une preuve exhaustive de fraude.
- Un remboursement total ou partiel annule la prime non versée. Si la prime a déjà été versée, elle est signalée pour examen et régularisation manuelle. Un renouvellement ne crée pas de seconde prime.
- Traiter les demandes de retrait approuvées dans les cinq premiers jours ouvrés (hors week-ends et jours fériés) du mois suivant, sans seuil minimum. Une demande approuvée après cette période passe au prochain cycle. Le module enregistre une référence de versement effectué ; il ne transfère pas d'argent et ne programme pas de paiement automatique.
- Dans le Super Admin, la liste mensuelle affiche les primes encore non versées et validées jusqu'à la fin du mois choisi, y compris les reports des mois précédents. L'export CSV est un instantané actualisé, pas une preuve de paiement ni une reconstitution historique ; vérifier à nouveau chaque commission avant de payer.
- Le refus d'une commission nécessite un motif conservé dans le journal d'audit. Un motif peut aussi être ajouté lors de la validation.
- L'attribution ambassadeur sert uniquement à rattacher une inscription à un partenaire et reste distincte des statistiques facultatives. En cas de changement d'appareil ou de suppression des données du navigateur avant l'inscription, saisir le code ambassadeur lors de l'inscription.

## Espace ambassadeur

Le formulaire public de candidature est accessible à l'adresse `/ambassadeur/inscription` ; le Super Admin peut copier le lien depuis l'onglet Partenaires. Une candidature ne crée ni compte ni code de recommandation. Un accusé de réception est envoyé à l'adresse fournie. Le Super Admin l'approuve ou la refuse avec un motif ; l'approbation crée le compte et envoie par e-mail un lien d'activation à usage unique valable sept jours. Le refus envoie une notification générique sans divulguer le motif interne ; l'administration signale si cet e-mail n'a pas pu être envoyé.

Le Super Admin génère un lien d'activation de compte valable sept jours et utilisable une seule fois ; il est envoyé à l'adresse e-mail de l'ambassadeur. En cas d'échec d'envoi, le lien reste disponible une seule fois dans l'interface d'administration pour une transmission manuelle sécurisée. L'ambassadeur peut demander lui-même un lien de récupération depuis la page de connexion ; la réponse ne révèle pas si l'adresse correspond à un compte. Le lien permet de choisir un nouveau mot de passe et déconnecte les autres appareils. La MFA e-mail s'applique également aux connexions selon la règle générale du déploiement. L'ambassadeur choisit un mot de passe d'au moins 12 caractères et peut le modifier depuis son espace. Le dashboard propose le partage natif du téléphone ou WhatsApp et la copie du lien/code ; le lien amène directement à la création de boutique. Les statistiques présentent les visites du lien et les inscriptions attribuées, avec les périodes disponibles et l'historique. Elles affichent aussi le taux actuel de boutiques publiées et de commerçants payants parmi les inscriptions attribuées, ainsi que l'évolution mensuelle des inscriptions et primes versées sur six mois. Il permet de rechercher et filtrer les boutiques, masquer les montants, actualiser les résultats et exporter son rapport CSV. Il n'affiche pas les coordonnées des commerçants.

L'ambassadeur peut demander le retrait de tout son solde de commissions validées vers un portefeuille Wave, Orange Money, MTN MoMo ou Moov Money. Une seule demande peut être ouverte à la fois et l'ambassadeur peut l'annuler tant qu'elle n'a pas été validée. Le Super Admin peut l'approuver, la refuser avec un motif ou enregistrer un transfert effectué avec sa référence. Aucun transfert automatique n'est déclenché. Un remboursement d'un paiement inclus dans une demande encore ouverte annule celle-ci et remet les autres commissions du lot à disposition.

Le tableau de bord actualise les données toutes les 60 secondes lorsque l'espace est ouvert et actualise immédiatement les données lorsque l'utilisateur revient sur l'onglet du navigateur. Les messages de confirmation affichés à l'écran ne sont pas effacés par cet actualisage.

Lorsque son adresse e-mail est renseignée et Resend configuré, l'ambassadeur reçoit un e-mail lors de la validation, du refus ou du versement d'une commission, ou si un remboursement l'affecte. Il est également informé à la réception, l'approbation, au refus, à l'annulation ou au paiement d'une demande de retrait. Une approbation de retrait ne confirme pas le transfert : seul l'état « payé » avec sa référence le fait. En cas d'échec d'envoi, l'opération reste enregistrée et l'erreur est journalisée côté serveur ; aucun renvoi automatique n'est prévu. Les notifications ne remplacent donc pas la consultation du dashboard.

## Procédure manuelle de retrait et rapprochement

À chaque cycle mensuel, le Super Admin traite dans les cinq premiers jours ouvrés (hors week-ends et jours fériés) les demandes approuvées au moment du traitement. Il n'y a pas de seuil minimum. Les demandes approuvées après ce cycle sont reportées au suivant. Cette règle organise le traitement administratif ; elle ne déclenche aucun transfert automatique.

1. Dans l'onglet Retraits, vérifier l'identité de l'ambassadeur, le portefeuille sélectionné, le numéro destinataire et le montant. En cas de doute ou de changement de coordonnées, confirmer les informations par un canal déjà connu avant de valider la demande.
2. Vérifier que le montant correspond aux commissions du retrait, que les paiements d'abonnement sont toujours confirmés et qu'aucun remboursement ou signalement n'est en attente. En cas d'anomalie, ne pas payer ; documenter le refus afin de remettre les commissions à disposition.
3. Après validation, effectuer le transfert manuellement depuis le service de paiement approprié. Juste avant de confirmer, contrôler une seconde fois le numéro, le portefeuille et le montant. Ne jamais demander ni conserver le code PIN du bénéficiaire.
4. Une fois le transfert confirmé par le service, enregistrer dans MaTable sa référence effective. Ne pas marquer comme payé si le transfert est en attente, échoué ou si aucune référence vérifiable n'est disponible.
5. Pour le rapprochement mensuel, exporter depuis l'onglet Retraits le CSV des retraits payés du mois. Comparer chaque ligne à l'historique du service de paiement par référence, montant, date et destinataire ; investiguer les références absentes, les écarts de montant et les transferts sans ligne correspondante. Conserver le relevé externe selon les règles d'accès et de conservation de l'entreprise.

Le CSV est un outil de rapprochement, pas une preuve indépendante que le transfert a abouti. Seul l'historique du portefeuille ou du service utilisé confirme le mouvement de fonds.

## Message au partenaire

Bonjour,

Nous lançons un programme de partenariat à la performance pour MaTable.ci. Vous recevez un lien et un code personnels pour recommander la plateforme aux commerçants.

Pour chaque nouveau commerçant attribué qui crée et publie une boutique, puis règle son premier abonnement, vous recevez une prime unique de 20 % du tarif mensuel de la formule choisie, après confirmation du paiement et vérification. La même base d'un mois s'applique aux abonnements annuels.

Le commerçant peut commencer par deux mois d'essai gratuit ou choisir une formule payante immédiatement. Nous ne proposons pas de cachet fixe ; les primes validées sont réglées mensuellement. Les auto-inscriptions, les inscriptions fictives et les paiements remboursés ne sont pas rémunérés.

Si ce modèle vous intéresse, nous pourrons préciser ensemble les modalités de notre collaboration.