import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProAnalyticsPanel } from '../src/components/MerchantDashboard/ProAnalyticsPanel';
import type { Shop } from '../src/types';

function makeShop(isActive: boolean): Shop {
  return {
    id: 12,
    name: 'Atelier Awa',
    slug: 'atelier-awa',
    whatsapp_number: '+2250700000000',
    pin_code_hash: '',
    theme_color: '#176b55',
    welcome_message: null,
    is_open: true,
    is_active: true,
    last_notification_sent_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    category: 'fashion',
    theme_config: {
      primary_color: '#176b55',
      secondary_color: '#f0ba80',
      font_family: 'Plus Jakarta Sans',
      layout_style: 'grid_portrait',
    },
    subscription: {
      plan: 'standard',
      upcomingPlan: null,
      upcomingPlanAt: null,
      cancellationAt: null,
      status: isActive ? 'trialing' : 'expired',
      trialStart: null,
      trialEnd: null,
      expiresAt: null,
      trialDaysRemaining: isActive ? 60 : 0,
      isActive,
    },
  };
}

test('merchant analytics shows a mobile-friendly overview and respects the plan period limit', () => {
  const html = renderToStaticMarkup(React.createElement(ProAnalyticsPanel, { shop: makeShop(true) }));

  assert.match(html, /Vos statistiques/);
  assert.match(html, /Visites de la vitrine/);
  assert.match(html, /Commandes reçues/);
  assert.match(html, /Valeur des commandes/);
  assert.match(html, /Articles qui attirent le plus/);
  assert.match(html, /7 jours/);
  assert.doesNotMatch(html, /30 jours/);
  assert.match(html, /pas un paiement encaissé/);
});

test('merchant analytics stays locked when the subscription is inactive', () => {
  const html = renderToStaticMarkup(React.createElement(ProAnalyticsPanel, { shop: makeShop(false) }));

  assert.match(html, /Les statistiques sont accessibles pendant un essai ou un abonnement actif/);
  assert.doesNotMatch(html, /Articles qui attirent le plus/);
});
