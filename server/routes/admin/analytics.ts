// Statistiques de la plateforme et paiements.
import type { Router } from 'express';
import type { AdminContext } from './context.ts';

export function registerAnalyticsRoutes(router: Router, ctx: AdminContext) {
  const {
    dbAll,
    dbGet,
    dbRun,
    isVerificationAdmin,
    loadShops,
    getSubscriptionMetrics,
  } = ctx;

  router.get('/analytics', async (req, res) => {
    const shops = await loadShops();
    const requestedDays = Number(req.query.days);
    const days = Number.isInteger(requestedDays) ? Math.min(Math.max(requestedDays, 7), 90) : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const previousSince = new Date(Date.parse(since) - days * 86400000).toISOString();
    const [dailyTraffic, dailyOrders, currentTraffic, previousTraffic, currentOrders, previousOrders, sourceRows, campaignRows, campaignOrderRows, campaignClickRows, trafficByShop, ordersByShop, audienceRows, topPageRows, loginRows, signupRows, funnelRow, qrByShopRows, qrTotalRow, productRows, coViewRows] = await Promise.all([
      dbAll<{ date: string; page_views: number; unique_visitors: number }>(`
        SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS page_views,
          COUNT(DISTINCT session_id) AS unique_visitors
        FROM analytics_events WHERE event_type = 'page_view' AND created_at >= ?
        GROUP BY date ORDER BY date ASC
      `, [since]),
      dbAll<{ date: string; orders: number; sales: number }>(`
        SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS sales
        FROM orders WHERE created_at >= ? AND COALESCE(status, 'pending') NOT IN ('cancelled', 'rejected', 'expired')
        GROUP BY date ORDER BY date ASC
      `, [since]),
      dbGet<{ page_views: number; unique_visitors: number }>(`
        SELECT COUNT(*) AS page_views, COUNT(DISTINCT session_id) AS unique_visitors
        FROM analytics_events WHERE event_type = 'page_view' AND created_at >= ?
      `, [since]),
      dbGet<{ page_views: number; unique_visitors: number }>(`
        SELECT COUNT(*) AS page_views, COUNT(DISTINCT session_id) AS unique_visitors
        FROM analytics_events WHERE event_type = 'page_view' AND created_at >= ? AND created_at < ?
      `, [previousSince, since]),
      dbGet<{ orders: number; sales: number }>(`
        SELECT COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS sales
        FROM orders WHERE created_at >= ? AND COALESCE(status, 'pending') NOT IN ('cancelled', 'rejected', 'expired')
      `, [since]),
      dbGet<{ orders: number; sales: number }>(`
        SELECT COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS sales
        FROM orders WHERE created_at >= ? AND created_at < ? AND COALESCE(status, 'pending') NOT IN ('cancelled', 'rejected', 'expired')
      `, [previousSince, since]),
      dbAll<{ source: string; visits: number; visitors: number }>(`
        SELECT COALESCE(source, 'unknown') AS source, COUNT(*) AS visits, COUNT(DISTINCT session_id) AS visitors
        FROM analytics_events WHERE event_type = 'page_view' AND created_at >= ?
        GROUP BY source ORDER BY visits DESC
      `, [since]),
      dbAll<{ campaign: string; visits: number; visitors: number }>(`
        SELECT campaign, COUNT(*) AS visits, COUNT(DISTINCT session_id) AS visitors
        FROM analytics_events
        WHERE event_type = 'page_view' AND created_at >= ? AND campaign IS NOT NULL
        GROUP BY campaign ORDER BY visits DESC, campaign ASC
        LIMIT 50
      `, [since]),
      dbAll<{ campaign: string; orders: number; sales: number }>(`
        SELECT attribution_campaign AS campaign, COUNT(*) AS orders,
          COALESCE(SUM(total_amount), 0) AS sales
        FROM orders
        WHERE attribution_campaign IS NOT NULL AND created_at >= ?
          AND COALESCE(status, 'pending') NOT IN ('cancelled', 'rejected', 'expired')
        GROUP BY attribution_campaign
      `, [since]),
      dbAll<{ campaign: string; whatsapp_clicks: number }>(`
        SELECT orders.attribution_campaign AS campaign, COUNT(*) AS whatsapp_clicks
        FROM orders
        JOIN order_whatsapp_tracking ON order_whatsapp_tracking.order_id = orders.id
        WHERE orders.attribution_campaign IS NOT NULL AND order_whatsapp_tracking.clicked_at >= ?
        GROUP BY orders.attribution_campaign
      `, [since]),
      dbAll<{ shop_id: number; page_views: number; unique_visitors: number }>(`
        SELECT shop_id, COUNT(*) AS page_views, COUNT(DISTINCT session_id) AS unique_visitors
        FROM analytics_events WHERE event_type = 'page_view' AND shop_id IS NOT NULL AND created_at >= ?
        GROUP BY shop_id
      `, [since]),
      dbAll<{ shop_id: number; orders: number; sales: number }>(`
        SELECT shop_id, COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS sales
        FROM orders WHERE created_at >= ? AND COALESCE(status, 'pending') NOT IN ('cancelled', 'rejected', 'expired')
        GROUP BY shop_id
      `, [since]),
      dbAll<{ audience: string; events: number; sessions: number }>(`
        SELECT COALESCE(audience, 'unknown') AS audience, COUNT(*) AS events,
          COUNT(DISTINCT session_id) AS sessions
        FROM analytics_events WHERE created_at >= ?
        GROUP BY COALESCE(audience, 'unknown') ORDER BY events DESC
      `, [since]),
      dbAll<{ path: string; views: number; visitors: number }>(`
        SELECT path, COUNT(*) AS views, COUNT(DISTINCT session_id) AS visitors
        FROM analytics_events WHERE event_type = 'page_view' AND created_at >= ?
        GROUP BY path ORDER BY views DESC, path ASC LIMIT 20
      `, [since]),
      dbAll<{ audience: string; logins: number; sessions: number }>(`
        SELECT COALESCE(audience, 'unknown') AS audience, COUNT(*) AS logins,
          COUNT(DISTINCT session_id) AS sessions
        FROM analytics_events WHERE event_type = 'login' AND created_at >= ?
        GROUP BY COALESCE(audience, 'unknown') ORDER BY logins DESC
      `, [since]),
      dbAll<{ audience: string; signups: number; sessions: number }>(`
        SELECT COALESCE(audience, 'unknown') AS audience, COUNT(*) AS signups,
          COUNT(DISTINCT session_id) AS sessions
        FROM analytics_events WHERE event_type = 'signup' AND created_at >= ?
        GROUP BY COALESCE(audience, 'unknown') ORDER BY signups DESC
      `, [since]),
      dbGet<{ visits: number; product_views: number; cart_adds: number; checkouts: number; orders: number }>(`
        SELECT
          COUNT(DISTINCT CASE WHEN event_type = 'page_view' THEN session_id END) AS visits,
          COUNT(DISTINCT CASE WHEN event_type = 'product_view' THEN session_id END) AS product_views,
          COUNT(DISTINCT CASE WHEN event_type = 'add_to_cart' THEN session_id END) AS cart_adds,
          COUNT(DISTINCT CASE WHEN event_type = 'checkout_start' THEN session_id END) AS checkouts,
          COUNT(DISTINCT CASE WHEN event_type = 'order_created' THEN session_id END) AS orders
        FROM analytics_events WHERE created_at >= ?
      `, [since]),
      dbAll<{ shop_id: number; scans: number; visitors: number }>(`
        SELECT shop_id, COUNT(*) AS scans, COUNT(DISTINCT session_id) AS visitors
        FROM analytics_events
        WHERE event_type = 'page_view' AND campaign = 'qr' AND shop_id IS NOT NULL AND created_at >= ?
        GROUP BY shop_id
      `, [since]),
      dbGet<{ scans: number; visitors: number }>(`
        SELECT COUNT(*) AS scans, COUNT(DISTINCT session_id) AS visitors
        FROM analytics_events
        WHERE event_type = 'page_view' AND campaign = 'qr' AND created_at >= ?
      `, [since]),
      dbAll<{ product_id: number; shop_id: number; title: string | null; views: number; clicks: number }>(`
        SELECT events.entity_id AS product_id, events.shop_id, products.title,
          SUM(CASE WHEN events.event_type = 'product_view' THEN 1 ELSE 0 END) AS views,
          SUM(CASE WHEN events.event_type = 'product_click' THEN 1 ELSE 0 END) AS clicks
        FROM analytics_events events
        LEFT JOIN products ON products.id = events.entity_id
        WHERE events.event_type IN ('product_view', 'product_click')
          AND events.entity_id IS NOT NULL AND events.created_at >= ?
        GROUP BY events.entity_id, events.shop_id, products.title
        ORDER BY clicks DESC, views DESC LIMIT 20
      `, [since]),
      dbAll<{ product_a: number; product_b: number; title_a: string | null; title_b: string | null; sessions: number }>(`
        SELECT first.entity_id AS product_a, second.entity_id AS product_b,
          product_a.title AS title_a, product_b.title AS title_b,
          COUNT(DISTINCT first.session_id) AS sessions
        FROM analytics_events first
        JOIN analytics_events second
          ON second.session_id = first.session_id AND second.event_type = 'product_view'
          AND second.entity_id IS NOT NULL AND second.entity_id > first.entity_id
        LEFT JOIN products product_a ON product_a.id = first.entity_id
        LEFT JOIN products product_b ON product_b.id = second.entity_id
        WHERE first.event_type = 'product_view' AND first.entity_id IS NOT NULL
          AND first.created_at >= ? AND second.created_at >= ?
        GROUP BY first.entity_id, second.entity_id, product_a.title, product_b.title
        ORDER BY sessions DESC LIMIT 20
      `, [since, since]),
    ]);
    const trafficByShopId = new Map(trafficByShop.map((row) => [Number(row.shop_id), row]));
    const ordersByShopId = new Map(ordersByShop.map((row) => [Number(row.shop_id), row]));
    const qrByShopId = new Map(qrByShopRows.map((row) => [Number(row.shop_id), row]));
    const campaignOrdersByName = new Map(campaignOrderRows.map((row) => [row.campaign, row]));
    const campaignClicksByName = new Map(campaignClickRows.map((row) => [row.campaign, row]));
    const campaignNames = new Set([
      ...campaignRows.map((row) => row.campaign),
      ...campaignOrderRows.map((row) => row.campaign),
      ...campaignClickRows.map((row) => row.campaign),
    ]);
    const campaignVisitorsByName = new Map(campaignRows.map((row) => [row.campaign, row]));
    const campaigns = [...campaignNames].sort().map((campaign) => {
      const campaignVisitors = campaignVisitorsByName.get(campaign);
      const campaignOrders = campaignOrdersByName.get(campaign);
      return {
        campaign,
        visits: Number(campaignVisitors?.visits || 0),
        visitors: Number(campaignVisitors?.visitors || 0),
        orders: Number(campaignOrders?.orders || 0),
        sales: Number(campaignOrders?.sales || 0),
        whatsapp_clicks: Number(campaignClicksByName.get(campaign)?.whatsapp_clicks || 0),
      };
    });
    const byShop = shops.map((shop) => {
      const traffic = trafficByShopId.get(shop.id);
      const commerce = ordersByShopId.get(shop.id);
      const pageViews = Number(traffic?.page_views || 0);
      const uniqueVisitors = Number(traffic?.unique_visitors || 0);
      const shopOrders = Number(commerce?.orders || 0);
      return {
        shop_id: shop.id, shop_name: shop.name, slug: shop.slug, page_views: pageViews,
        unique_visitors: uniqueVisitors, orders: shopOrders, sales: Number(commerce?.sales || 0),
        qr_scans: Number(qrByShopId.get(shop.id)?.scans || 0),
        conversion_rate: uniqueVisitors ? Number(((shopOrders / uniqueVisitors) * 100).toFixed(1)) : 0,
      };
    }).sort((left, right) => right.page_views - left.page_views);
    const dailyTrafficByDate = new Map(dailyTraffic.map((row) => [row.date, row]));
    const dailyOrdersByDate = new Map(dailyOrders.map((row) => [row.date, row]));
    const funnelSteps = [
      { step: 'visite', count: Number(funnelRow?.visits || 0) },
      { step: 'produit_vu', count: Number(funnelRow?.product_views || 0) },
      { step: 'panier', count: Number(funnelRow?.cart_adds || 0) },
      { step: 'commande_commencee', count: Number(funnelRow?.checkouts || 0) },
      { step: 'commande_creee', count: Number(funnelRow?.orders || 0) },
    ];
    const funnel = funnelSteps.map((step, index) => ({
      ...step,
      conversion_from_previous: index === 0
        ? 100
        : funnelSteps[index - 1].count
          ? Number(((step.count / funnelSteps[index - 1].count) * 100).toFixed(1))
          : 0,
      conversion_from_visit: funnelSteps[0].count
        ? Number(((step.count / funnelSteps[0].count) * 100).toFixed(1))
        : 0,
    }));
    const daily = Array.from({ length: days }, (_, index) => {
      const date = new Date(Date.now() - (days - index - 1) * 86400000).toISOString().slice(0, 10);
      const traffic = dailyTrafficByDate.get(date);
      const commerce = dailyOrdersByDate.get(date);
      return {
        date,
        page_views: Number(traffic?.page_views || 0),
        unique_visitors: Number(traffic?.unique_visitors || 0),
        orders: Number(commerce?.orders || 0),
        sales: Number(commerce?.sales || 0),
      };
    });
    const totalViews = Number(currentTraffic?.page_views || 0);
    const totalVisitors = Number(currentTraffic?.unique_visitors || 0);
    const totalOrders = Number(currentOrders?.orders || 0);
    const totalSales = Number(currentOrders?.sales || 0);
    const previousTotalViews = Number(previousTraffic?.page_views || 0);
    const previousTotalVisitors = Number(previousTraffic?.unique_visitors || 0);
    const previousTotalOrders = Number(previousOrders?.orders || 0);
    const previousTotalSales = Number(previousOrders?.sales || 0);
    const response = {
      days, since, previous_since: previousSince, daily,
      order_daily: daily.map(({ date, orders: orderCount, sales }) => ({ date, orders: orderCount, sales })),
      sources: sourceRows.map((row) => ({
        source: row.source || 'unknown', visits: Number(row.visits || 0), visitors: Number(row.visitors || 0),
      })),
      campaigns,
      by_shop: byShop,
      audiences: audienceRows.map((row) => ({
        audience: row.audience || 'unknown',
        events: Number(row.events || 0),
        sessions: Number(row.sessions || 0),
      })),
      top_pages: topPageRows.map((row) => ({
        path: row.path || '/',
        views: Number(row.views || 0),
        visitors: Number(row.visitors || 0),
      })),
      logins: loginRows.map((row) => ({
        audience: row.audience || 'unknown',
        logins: Number(row.logins || 0),
        sessions: Number(row.sessions || 0),
      })),
      signups: signupRows.map((row) => ({
        audience: row.audience || 'unknown',
        signups: Number(row.signups || 0),
        sessions: Number(row.sessions || 0),
      })),
      funnel,
      qr_scans: {
        total: Number(qrTotalRow?.scans || 0),
        visitors: Number(qrTotalRow?.visitors || 0),
        by_shop: qrByShopRows.map((row) => ({
          shop_id: Number(row.shop_id),
          scans: Number(row.scans || 0),
          visitors: Number(row.visitors || 0),
        })),
      },
      top_products: productRows.map((row) => ({
        product_id: Number(row.product_id),
        shop_id: row.shop_id == null ? null : Number(row.shop_id),
        title: row.title || null,
        views: Number(row.views || 0),
        clicks: Number(row.clicks || 0),
      })),
      co_viewed_products: coViewRows.map((row) => ({
        product_a: Number(row.product_a),
        product_b: Number(row.product_b),
        title_a: row.title_a || null,
        title_b: row.title_b || null,
        sessions: Number(row.sessions || 0),
      })),
      totals: {
        page_views: totalViews, unique_visitors: totalVisitors, orders: totalOrders,
        sales: totalSales,
        conversion_rate: totalVisitors ? Number(((totalOrders / totalVisitors) * 100).toFixed(1)) : 0,
      },
      previous: {
        page_views: previousTotalViews,
        unique_visitors: previousTotalVisitors,
        orders: previousTotalOrders,
        sales: previousTotalSales,
        conversion_rate: previousTotalVisitors ? Number(((previousTotalOrders / previousTotalVisitors) * 100).toFixed(1)) : 0,
      },
    };
    if (isVerificationAdmin(req)) {
      response.daily.forEach((day) => { day.sales = 0; });
      response.order_daily.forEach((day) => { day.sales = 0; });
      response.campaigns.forEach((campaign) => { campaign.sales = 0; });
      response.by_shop.forEach((shop) => { shop.sales = 0; });
      response.totals.sales = 0;
      response.previous.sales = 0;
    }
    res.json(response);
  });

  router.get('/payments', async (req, res) => {
    const expiredIntentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await dbRun(`UPDATE subscription_payment_intents
      SET status = 'expired'
      WHERE payment_type = 'subscription' AND status = 'pending' AND created_at <= ?`, [expiredIntentCutoff]);
    const requestedDays = Number(req.query.days);
    const days = Number.isInteger(requestedDays) ? Math.min(Math.max(requestedDays, 7), 365) : 30;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const requestedOffset = Number(req.query.offset);
    const offset = Number.isInteger(requestedOffset) ? Math.max(0, requestedOffset) : 0;
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    const requestedStatus = String(req.query.status || 'all');
    const requestedType = String(req.query.type || 'all');
    const periodWhere = "((status = 'paid' AND paid_at >= ?) OR (status <> 'paid' AND created_at >= ?))";
    const summary = await dbGet<{
      confirmed_count: number;
      collected_amount: number;
      pending_count: number;
      pending_amount: number;
      failed_count: number;
      expired_count: number;
      refunded_count: number;
      subscription_count: number;
      subscription_amount: number;
      promotion_count: number;
      promotion_amount: number;
    }>(`
      SELECT
        COUNT(CASE WHEN status = 'paid' THEN 1 END) AS confirmed_count,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS collected_amount,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_count,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS pending_amount,
        COUNT(CASE WHEN status IN ('failed', 'cancelled', 'error') THEN 1 END) AS failed_count,
        COUNT(CASE WHEN status = 'expired' THEN 1 END) AS expired_count,
        COUNT(CASE WHEN status = 'refunded' THEN 1 END) AS refunded_count,
        COUNT(CASE WHEN status = 'paid' AND payment_type = 'subscription' THEN 1 END) AS subscription_count,
        COALESCE(SUM(CASE WHEN status = 'paid' AND payment_type = 'subscription' THEN amount ELSE 0 END), 0) AS subscription_amount,
        COUNT(CASE WHEN status = 'paid' AND payment_type = 'promotion' THEN 1 END) AS promotion_count,
        COALESCE(SUM(CASE WHEN status = 'paid' AND payment_type = 'promotion' THEN amount ELSE 0 END), 0) AS promotion_amount
      FROM subscription_payment_intents
      WHERE ${periodWhere}
    `, [since, since]);
    const paymentFilters = [
      "((intent.status = 'paid' AND intent.paid_at >= ?) OR (intent.status <> 'paid' AND intent.created_at >= ?))",
    ];
    const paymentParams: unknown[] = [since, since];
    if (search) {
      paymentFilters.push("(LOWER(shops.name) LIKE ? OR LOWER(COALESCE(intent.provider_reference, '')) LIKE ? OR LOWER(intent.id) LIKE ?)");
      const searchTerm = `%${search.toLocaleLowerCase('fr')}%`;
      paymentParams.push(searchTerm, searchTerm, searchTerm);
    }
    if (requestedStatus === 'failed') {
      paymentFilters.push("intent.status IN ('failed', 'error')");
    } else if (['paid', 'pending', 'cancelled', 'error', 'refunded', 'expired'].includes(requestedStatus)) {
      paymentFilters.push('intent.status = ?');
      paymentParams.push(requestedStatus);
    }
    if (requestedType === 'subscription' || requestedType === 'promotion') {
      paymentFilters.push('intent.payment_type = ?');
      paymentParams.push(requestedType);
    }
    const paymentWhere = paymentFilters.join(' AND ');
    const [payments, paymentCount] = await Promise.all([
      dbAll<{
      id: string;
      shop_id: number;
      shop_name: string;
      payment_type: 'subscription' | 'promotion';
      tier: string;
      subscription_term: 'monthly' | 'annual';
      amount: number;
      currency: string;
      status: string;
      provider_reference: string | null;
      created_at: string;
      paid_at: string | null;
    }>(`
      SELECT intent.id, intent.shop_id, shops.name AS shop_name, intent.payment_type, intent.tier, intent.subscription_term, intent.amount,
        intent.currency, intent.status, intent.provider_reference, intent.created_at, intent.paid_at
      FROM subscription_payment_intents AS intent
      JOIN shops ON shops.id = intent.shop_id
      WHERE ${paymentWhere}
      ORDER BY COALESCE(intent.paid_at, intent.created_at) DESC
      LIMIT ? OFFSET ?
    `, [...paymentParams, limit, offset]),
      dbGet<{ total: number }>(`
        SELECT COUNT(*) AS total
        FROM subscription_payment_intents AS intent
        JOIN shops ON shops.id = intent.shop_id
        WHERE ${paymentWhere}
      `, paymentParams),
    ]);
    const byTier = await dbAll<{ tier: string; count: number; amount: number }>(`
      SELECT tier, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
      FROM subscription_payment_intents
      WHERE status = 'paid' AND payment_type = 'subscription' AND paid_at >= ?
      GROUP BY tier ORDER BY amount DESC
    `, [since]);
    const subscriptionMetrics = await getSubscriptionMetrics();
    res.json({
      days,
      since,
      summary: {
        confirmed_count: Number(summary?.confirmed_count || 0),
        collected_amount: Number(summary?.collected_amount || 0),
        pending_count: Number(summary?.pending_count || 0),
        pending_amount: Number(summary?.pending_amount || 0),
        failed_count: Number(summary?.failed_count || 0),
        expired_count: Number(summary?.expired_count || 0),
        refunded_count: Number(summary?.refunded_count || 0),
        subscriptions: {
          count: Number(summary?.subscription_count || 0),
          amount: Number(summary?.subscription_amount || 0),
        },
        promotions: {
          count: Number(summary?.promotion_count || 0),
          amount: Number(summary?.promotion_amount || 0),
        },
        ...subscriptionMetrics,
      },
      by_tier: byTier.map((item) => ({ ...item, count: Number(item.count), amount: Number(item.amount) })),
      payments,
      payment_count: Number(paymentCount?.total || 0),
      payment_limit: limit,
      payment_offset: offset,
    });
  });

}
