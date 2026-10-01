import React from 'react';
import { ArrowLeft, ChevronDown, CircleHelp, Store } from 'lucide-react';

const faqSections = [
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
        answer: 'Oui. Vous pouvez parcourir les boutiques et préparer votre panier librement. La connexion ou la création de votre compte MaTable.ci sera demandée au moment de finaliser la commande, et votre panier sera conservé.',
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
        answer: 'Votre espace client affiche votre adresse e-mail, votre téléphone et les commandes liées à votre compte avec leur statut et leur montant. Vous pouvez y accéder depuis « Mon compte » après connexion.',
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
        answer: 'Choisissez « Créer ma boutique » depuis l’annuaire et suivez les étapes. Vous pourrez ensuite gérer votre catalogue, vos stocks, vos commandes et les informations de votre vitrine depuis l’espace propriétaire.',
      },
      {
        question: 'Comment ajouter mes photos et les options de mes articles ?',
        answer: 'Dans le dashboard commerçant, ajoutez ou modifiez un article pour téléverser ses photos. Pour un article alimentaire, vous pouvez organiser les choix par groupes et indiquer un supplément dans le libellé, par exemple « Igname (+1 000 F) ».',
      },
      {
        question: 'Comment personnaliser les photos de ma vitrine ?',
        answer: 'Ouvrez Thème et paramètres dans votre dashboard pour téléverser une photo de couverture et un logo. Une photo de couverture personnalisée permet de mieux distinguer votre boutique dans l’annuaire.',
      },
    ],
  },
];

export const FaqPage: React.FC = () => (
  <main className="min-h-[65vh] bg-[#f8f6f0] px-4 py-8 text-[#25231f] sm:px-6 sm:py-12">
    <div className="mx-auto max-w-4xl">
      <a href="/" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#176b55] transition hover:text-[#e6572b]">
        <ArrowLeft className="h-4 w-4" /> Retour aux boutiques
      </a>

      <header className="mt-8 border-b border-[#ded8ce] pb-7 sm:mt-10 sm:pb-9">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0f4d3d] text-white">
          <CircleHelp className="h-5 w-5" />
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-[#e6572b]">MaTable.ci · Aide</p>
        <h1 className="mt-2 text-3xl font-bold text-[#25231f] sm:text-4xl">Questions fréquentes</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6f6a61] sm:text-base">
          Les réponses utiles pour découvrir une boutique, commander et gérer votre compte.
        </p>
      </header>

      <div className="divide-y divide-[#ded8ce]">
        {faqSections.map((section) => (
          <section key={section.title} className="py-7 sm:py-8">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-[#0f4d3d]">
              {section.title === 'Commerçants' && <Store className="h-4 w-4" />}
              {section.title}
            </h2>
            <div className="divide-y divide-[#e7e2d9]">
              {section.questions.map((item) => (
                <details key={item.question} className="group py-1">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-left text-sm font-semibold text-[#25231f] marker:hidden sm:text-base">
                    <span>{item.question}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-[#176b55] transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="max-w-3xl pb-4 pr-8 text-sm leading-6 text-[#6f6a61]">{item.answer}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-[#ded8ce] py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[#6f6a61]">Vous avez encore une question sur une commande ?</p>
        <a href="/" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[#0f4d3d] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#176b55]">Trouver une boutique</a>
      </div>
    </div>
  </main>
);
