import { dbAll, dbGet } from '../../db.ts';
import { getVapidConfiguration, sendMerchantPush } from './pushNotifications.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export const AUTOMATED_ANNOUNCEMENT_RULES = [
  { id: 'welcome', prefix: 'auto-welcome', label: 'Bienvenue', description: 'Confirme l’activation des alertes sur le premier appareil de la boutique.' },
  { id: 'trial', prefix: 'subscription-', label: 'Fin d’essai ou d’abonnement', description: 'Rappel à J−14, J−7, J−3 et J−1 avant l’échéance.' },
  { id: 'no-products', prefix: 'auto-no-products', label: 'Boutique sans produit', description: 'Une seule relance 48 h après la création si aucun produit n’est ajouté.' },
  { id: 'identity', prefix: 'auto-identity', label: 'Identité à compléter', description: 'Une relance 24 h après la création tant que la vérification n’est pas envoyée, et après un refus.' },
  { id: 'weekly', prefix: 'auto-weekly', label: 'Résumé hebdomadaire', description: 'Chaque lundi : visiteurs et commandes de la semaine écoulée, si la boutique a eu de l’activité.' },
  { id: 'inactive', prefix: 'auto-inactive', label: 'Inactivité de 14 jours', description: 'Au plus une relance par mois pour une boutique publiée sans visite ni commande depuis 14 jours.' },
] as const;

interface EligibleShop {
  id: number;
  name: string;
  created_at: string;
  publication_status: string | null;
  merchant_verification_status: string | null;
}

export interface AutomatedAnnouncementResult {
  checked: number;
  queued: number;
}

function startOfIsoWeekUtc(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setTime(start.getTime() - ((start.getUTCDay() + 6) % 7) * DAY_MS);
  return start;
}

async function countRows(sql: string, params: unknown[]) {
  const row = await dbGet<{ count: number | string }>(sql, params);
  return Number(row?.count || 0);
}

async function getActivity(shopId: number, fromIso: string, toIso: string) {
  const [visitors, orders] = await Promise.all([
    countRows(
      `SELECT COUNT(DISTINCT session_id) AS count FROM analytics_events
       WHERE shop_id = ? AND event_type = 'page_view' AND created_at >= ? AND created_at < ?`,
      [shopId, fromIso, toIso],
    ),
    countRows(
      'SELECT COUNT(*) AS count FROM orders WHERE shop_id = ? AND created_at >= ? AND created_at < ?',
      [shopId, fromIso, toIso],
    ),
  ]);
  return { visitors, orders };
}

// Envoie les annonces déclenchées par l'état des boutiques. Chaque clé d'événement est
// unique par boutique, donc un cycle répété ne renvoie jamais deux fois la même annonce.
export async function runAutomatedMerchantAnnouncements(now = new Date()): Promise<AutomatedAnnouncementResult> {
  if (!getVapidConfiguration()) return { checked: 0, queued: 0 };

  const shops = await dbAll<EligibleShop>(
    `SELECT s.id, s.name, s.created_at, s.publication_status, s.merchant_verification_status
     FROM shops s
     WHERE s.is_active = 1
       AND EXISTS (SELECT 1 FROM merchant_push_subscriptions p WHERE p.shop_id = s.id)
     ORDER BY s.id ASC`,
  );

  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  const weekStart = startOfIsoWeekUtc(now);
  const weekKey = weekStart.toISOString().slice(0, 10);
  const weeklyDue = nowMs >= weekStart.getTime() + 8 * HOUR_MS && nowMs < weekStart.getTime() + 3 * DAY_MS;
  const previousWeekIso = new Date(weekStart.getTime() - 7 * DAY_MS).toISOString();
  const inactivityFromIso = new Date(nowMs - 14 * DAY_MS).toISOString();
  const monthKey = nowIso.slice(0, 7);
  let queued = 0;

  const send = async (shop: EligibleShop, eventKey: string, title: string, body: string, url: string, category: 'announcement' | 'identity' = 'announcement') => {
    const result = await sendMerchantPush(shop.id, { eventKey, category, title, body, url, tag: eventKey });
    if (result.sent > 0) queued += 1;
  };

  for (const shop of shops) {
    try {
      const ageMs = nowMs - new Date(shop.created_at).getTime();
      if (!Number.isFinite(ageMs)) continue;

      await send(shop, 'auto-welcome', 'Alertes activées ✅', `Vous recevrez ici les commandes de ${shop.name}, les alertes de stock et les nouveautés MaTable.`, '/app');

      const verification = shop.merchant_verification_status || 'not_required';
      if (ageMs >= DAY_MS && (verification === 'pending' || verification === 'rejected')) {
        await send(
          shop,
          `auto-identity-${verification}`,
          verification === 'rejected' ? 'Vérification d’identité à refaire' : 'Complétez votre vérification d’identité',
          verification === 'rejected'
            ? 'Votre dernière vérification n’a pas abouti. Relancez-la pour publier votre boutique.'
            : 'Une dernière étape avant de publier votre boutique : envoyez votre vérification d’identité.',
          '/app',
          'identity',
        );
      }

      if (ageMs >= 2 * DAY_MS && await countRows('SELECT COUNT(*) AS count FROM products WHERE shop_id = ?', [shop.id]) === 0) {
        await send(shop, 'auto-no-products', 'Ajoutez votre premier produit', 'Votre boutique est vide. Ajoutez un produit pour recevoir vos premières commandes.', '/app');
      }

      if (weeklyDue && new Date(shop.created_at).getTime() < weekStart.getTime()) {
        const activity = await getActivity(shop.id, previousWeekIso, weekStart.toISOString());
        if (activity.visitors + activity.orders > 0) {
          await send(
            shop,
            `auto-weekly-${weekKey}`,
            'Votre semaine sur MaTable',
            `${activity.visitors} visiteur${activity.visitors > 1 ? 's' : ''} et ${activity.orders} commande${activity.orders > 1 ? 's' : ''} sur ${shop.name} la semaine dernière.`,
            '/app',
          );
        }
      }

      if (shop.publication_status === 'active' && ageMs >= 14 * DAY_MS) {
        const activity = await getActivity(shop.id, inactivityFromIso, nowIso);
        if (activity.visitors + activity.orders === 0) {
          await send(shop, `auto-inactive-${monthKey}`, 'Votre boutique est calme', 'Aucune visite ni commande depuis 14 jours. Partagez votre lien ou votre QR code pour relancer l’activité.', '/app');
        }
      }
    } catch (error) {
      console.error(`Automated announcement cycle failed for shop ${shop.id}.`, error);
    }
  }

  return { checked: shops.length, queued };
}

export async function getAutomatedAnnouncementStats() {
  const since = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const rows = await dbAll<{ event_key: string; sent_at: string | null; sent_count: number | null; failed_count: number | null }>(
    `SELECT event_key, sent_at, sent_count, failed_count FROM merchant_push_deliveries
     WHERE attempted_at >= ? AND (event_key LIKE 'auto-%' OR event_key LIKE 'subscription-%')`,
    [since],
  );
  return AUTOMATED_ANNOUNCEMENT_RULES.map((rule) => {
    const matching = rows.filter((row) => row.event_key.startsWith(rule.prefix));
    return {
      id: rule.id,
      label: rule.label,
      description: rule.description,
      shops_reached_30d: matching.filter((row) => row.sent_at).length,
      failed_30d: matching.reduce((total, row) => total + Number(row.failed_count || 0), 0),
    };
  });
}
