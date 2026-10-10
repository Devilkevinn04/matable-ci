export interface FaqQuestion {
  question: string;
  answer: string;
}

export interface FaqSection {
  title: string;
  questions: FaqQuestion[];
}

export const FAQ_SECTIONS: FaqSection[] = [
  {
    title: 'Commander',
    questions: [
      {
        question: 'Comment passer une commande ?',
        answer: 'Ouvrez une boutique, choisissez vos articles et options, puis indiquez les informations demandées. La commande est acceptée automatiquement et le stock est réservé. Vous pouvez ensuite contacter le commerçant sur WhatsApp pour convenir de la livraison et du paiement. Le commerçant peut annuler la commande depuis son dashboard.',
      },
      {
        question: 'Les options avec un supplément changent-elles le prix ?',
        answer: 'Oui. Le prix unitaire est recalculé dès que vous sélectionnez une option payante. Le panier et le serveur reprennent aussi ce supplément dans le total de la commande.',
      },
      {
        question: 'Le commerçant sait-il si j’ai ouvert WhatsApp ?',
        answer: 'Le dashboard indique si vous avez cliqué sur le bouton qui mène à WhatsApp. Ce suivi ne permet pas de savoir si WhatsApp s’est effectivement ouvert ni si le message prérempli a été envoyé.',
      },
      {
        question: 'Faut-il un compte pour passer commande ?',
        answer: 'Non. Vous pouvez commander sans créer de compte en renseignant les informations demandées au paiement. La connexion ou la création d’un compte reste facultative et permet de retrouver les commandes associées à votre profil.',
      },
      {
        question: 'Comment suivre ou modifier ma commande ?',
        answer: 'Connectez-vous puis ouvrez « Mon compte » pour consulter les commandes enregistrées et leur statut. Pour confirmer un détail, modifier une demande ou poser une question sur la livraison, contactez directement le commerçant, notamment via WhatsApp.',
      },
    ],
  },
  {
    title: 'Compte et paiement',
    questions: [
      {
        question: 'Que puis-je faire dans mon profil client ?',
        answer: 'Votre espace client affiche votre adresse e-mail, votre téléphone et les commandes liées à votre compte avec leur statut et leur montant. Depuis la rubrique Sécurité, vous pouvez aussi télécharger les données du compte ou demander sa suppression. Vous pouvez y accéder depuis « Mon compte » après connexion.',
      },
      {
        question: 'Comment demander une copie ou la suppression des données de ma boutique ?',
        answer: 'Téléchargez les données MaTable.ci de votre boutique depuis Paramètres, rubrique « Mes données ». Les fichiers ou données conservés directement par des prestataires externes ne sont pas inclus. La suppression d’un compte commerçant n’est pas proposée en libre-service : contactez l’assistance depuis la page de récupération d’accès; une vérification du compte peut être nécessaire.',
      },
      {
        question: 'MaTable.ci encaisse-t-il le paiement ?',
        answer: 'Non. MaTable.ci ne collecte pas le paiement de la vente. Le client et le commerçant conviennent directement du montant final, de la livraison et du moyen de paiement.',
      },
      {
        question: 'À qui m’adresser en cas de problème avec un article ?',
        answer: 'La vente est conclue directement avec le commerçant. Contactez la boutique concernée pour vérifier la disponibilité, la qualité, la livraison ou toute demande après commande.',
      },
    ],
  },
  {
    title: 'Commerçants',
    questions: [
      {
        question: 'Comment créer ma boutique ?',
        answer: 'Choisissez « Vendre sur MaTable » depuis l’annuaire et suivez les étapes. Vous pourrez ensuite gérer votre catalogue, vos stocks, vos commandes et les informations de votre vitrine depuis l’espace propriétaire.',
      },
      {
        question: 'Comment ajouter mes photos et les options de mes articles ?',
        answer: 'Dans le dashboard commerçant, ajoutez ou modifiez un article pour téléverser ses photos. Pour un article alimentaire, vous pouvez organiser les choix par groupes et indiquer un supplément dans le libellé, par exemple « Igname (+1 000 F) ».',
      },
      {
        question: 'Comment personnaliser les photos de ma vitrine ?',
        answer: 'Ouvrez Thème et paramètres dans votre dashboard pour téléverser une photo de couverture et un logo. Une photo de couverture personnalisée permet de mieux distinguer votre boutique dans l’annuaire.',
      },
      {
        question: 'Quelles sont les formules et les tarifs ?',
        answer: 'Standard coûte 3 000 FCFA par mois, Premium 5 000 FCFA et Pro 8 000 FCFA. Le paiement annuel correspond à 10 mensualités pour 12 mois de service. Un essai Standard gratuit de 7 jours est proposé, avec un maximum de 2 produits; vous pouvez aussi payer directement une formule.',
      },
      {
        question: 'Comment fonctionne la mise en avant payante ?',
        answer: 'Une boutique vérifiée, ouverte et disposant d’au moins 2 produits peut acheter un boost de 7 jours (2 000 FCFA), 15 jours (2 800 FCFA) ou 30 jours (3 000 FCFA). Les boutiques Pro bénéficient de 15 % de réduction. Cinq boosts peuvent se dérouler simultanément par ville et catégorie; si les créneaux sont occupés, votre boost est réservé et commence au premier créneau disponible après confirmation du paiement.',
      },
    ],
  },
];
