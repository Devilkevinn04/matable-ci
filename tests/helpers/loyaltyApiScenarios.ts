import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { TestContext } from 'node:test';
import express, { type RequestHandler } from 'express';

type Database = typeof import('../../db.ts');

let sequence = 0;

/** API et reprise de l’existant, exécutées à l’identique sur SQLite et PostgreSQL. */
export async function runLoyaltyApiScenarios(t: TestContext, database: Database): Promise<void> {
  const { createLoyaltyRouters } = await import('../../server/routes/loyalty.ts');
  const { importLegacyLoyalty } = await import('../../server/services/loyaltyLegacy.ts');
  const { earnForOrder, applyOrderStatusChange, checkAccount } = await import('../../server/services/loyaltyEngine.ts');
  const { getCustomerLoyaltyExport } = await import('../../server/repositories/loyalty.ts');
  const { migrateLoyalty } = await import('../../scripts/migrate-loyalty.ts');
  const { dbAll, dbGet, dbRun, dbTransaction } = database;
  const base = 1_000_000_000 + (Date.now() % 900_000_000);
  const nextId = () => base + (sequence += 1);
  const NOW = new Date().toISOString();
  const day = (index: number) => new Date(Date.now() - (index + 1) * 86_400_000).toISOString();

  const createShop = async (phone = `+225${String(nextId()).padStart(10, '0')}`) => {
    const id = nextId();
    await dbRun(
      `INSERT INTO shops (id, name, slug, whatsapp_number, pin_code_hash, created_at, category, subscription_tier)
       VALUES (?, ?, ?, ?, 'hash', ?, 'food', 'standard')`,
      [id, `Boutique ${id}`, `boutique-api-${id}`, phone, NOW],
    );
    return id;
  };
  const createUser = async (phone = '+2250700000000') => {
    const email = `api-${nextId()}@example.com`;
    await dbRun('INSERT INTO users (name, first_name, phone, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)', ['Awa Traoré', 'Awa', phone, email, 'hash', NOW]);
    return Number((await dbGet<{ id: number }>('SELECT id FROM users WHERE email = ?', [email]))!.id);
  };
  const createOrder = async (shopId: number, userId: number | null, createdAt: string, status = 'delivered') => {
    const id = nextId();
    await dbRun(
      `INSERT INTO orders (id, shop_id, customer_name, customer_phone, delivery_location, payment_method_preference, total_amount, created_at, status, items, customer_user_id)
       VALUES (?, ?, 'Client', '+2250700000000', '', 'to_confirm', 1000, ?, ?, '[]', ?)`,
      [id, shopId, createdAt, status, userId],
    );
    return id;
  };
  const deliver = async (shopId: number, userId: number, count: number, offset = 0) => {
    const ids: number[] = [];
    for (let index = 0; index < count; index += 1) ids.push(await createOrder(shopId, userId, day(offset + index)));
    return ids;
  };

  process.env.LOYALTY_PILOT_SHOP_IDS = '*';
  // Identités simulées par en-tête ; les vrais contrôles de session ont leurs propres tests.
  const requireMerchantOwnShop: RequestHandler = (req, res, next) => {
    const role = req.get('x-role');
    if (role === 'admin-shop') {
      req.adminShopAccess = true;
      req.adminRole = 'super_admin';
      return next();
    }
    if (role !== 'merchant') return res.status(401).json({ error: 'Session marchand requise.' });
    return Number(req.get('x-id')) === Number(req.params.id) ? next() : res.status(403).json({ error: 'Accès refusé à cette boutique.' });
  };
  const requireSuperAdminAccess: RequestHandler = (req, res, next) => (req.get('x-role') === 'super_admin' ? next() : res.status(403).json({ error: 'Refusé.' }));
  const app = express();
  app.use(express.json());
  const routers = createLoyaltyRouters({
    getCustomerSessionState: async (req) => (req.get('x-role') === 'customer' ? { authenticated: true, user: { id: Number(req.get('x-id')) } } : { authenticated: false, user: null }),
    requireMerchantOwnShop,
    requireSuperAdminAccess,
    rateLimitPublicRequest: () => (_req, _res, next) => next(),
  });
  app.use('/api/loyalty', routers.customerRouter);
  app.use('/api/shops', routers.merchantRouter);
  app.use('/api/admin/loyalty', routers.adminRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (role: string, id: number, method: string, path: string, body?: unknown) => {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: { 'x-role': role, 'x-id': String(id), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() as any };
  };
  const reward = (extra: Record<string, unknown> = {}) => ({ label: 'Jus offert', cost_points: 5, ...extra });
  const activate = (shopId: number, rewards: unknown[] = [reward()]) => call('merchant', shopId, 'PUT', `/api/shops/${shopId}/loyalty/program`, { status: 'active', rewards });

  try {
    await t.test('API : chaque espace refuse les autres', async () => {
      const shopId = await createShop();
      const otherShop = await createShop();
      for (const path of ['/api/loyalty/me', '/api/loyalty/me/transactions']) assert.equal((await call('anonymous', 0, 'GET', path)).status, 401, path);
      for (const path of ['/api/loyalty/rewards/1/redeem', '/api/loyalty/redemptions/1/cancel']) assert.equal((await call('anonymous', 0, 'POST', path, {})).status, 401, path);
      for (const path of ['program', 'members', 'analytics']) {
        assert.equal((await call('customer', 1, 'GET', `/api/shops/${shopId}/loyalty/${path}`)).status, 401, path);
        assert.equal((await call('merchant', otherShop, 'GET', `/api/shops/${shopId}/loyalty/${path}`)).status, 403, path);
      }
      assert.equal((await call('merchant', otherShop, 'PUT', `/api/shops/${shopId}/loyalty/program`, { status: 'active', rewards: [reward()] })).status, 403);
      assert.equal((await call('admin-shop', 0, 'PUT', `/api/shops/${shopId}/loyalty/program`, { status: 'active', rewards: [reward()] })).status, 403, 'un admin ne gère pas le programme');
      assert.equal((await call('admin-shop', 0, 'POST', `/api/shops/${shopId}/loyalty/redemptions/confirm`, { code: 'ABCDEFGH' })).status, 403);
      for (const role of ['merchant', 'customer', 'anonymous', 'verification_admin']) {
        for (const path of ['overview', 'programs', 'programs/1/accounts', 'accounts/1']) assert.equal((await call(role, shopId, 'GET', `/api/admin/loyalty/${path}`)).status, 403, `${role} ${path}`);
        for (const path of ['adjustments', 'programs/1/block']) assert.equal((await call(role, shopId, 'POST', `/api/admin/loyalty/${path}`, {})).status, 403, `${role} ${path}`);
      }
    });

    await t.test('API : un programme s’active seulement avec une récompense disponible', async () => {
      const shopId = await createShop();
      assert.deepEqual((await call('merchant', shopId, 'GET', `/api/shops/${shopId}/loyalty/program`)).data, { is_open: true, program: null, rewards: [] });
      for (const rewards of [[], [reward({ is_active: false })], [reward({ remaining: 0 })], [reward({ ends_at: '2020-01-01' })]]) assert.equal((await activate(shopId, rewards)).status, 400);
      for (const bad of [reward({ label: 'x' }), reward({ cost_points: 0 }), reward({ cost_points: 51 }), reward({ cost_points: 2.5 }), reward({ remaining: -1 }), reward({ ends_at: 'demain' }), reward({ id: -3 }), null]) {
        assert.equal((await activate(shopId, [bad])).status, 400, JSON.stringify(bad));
      }
      assert.equal((await activate(shopId, Array.from({ length: 11 }, () => reward()))).status, 400);
      assert.equal((await activate(shopId, [reward({ id: 987_654_321 })])).status, 400, 'récompense d’une autre boutique');
      const saved = await activate(shopId, [reward(), reward({ label: 'Réduction de 500 FCFA', cost_points: 10, remaining: 20 })]);
      assert.equal(saved.status, 200);
      assert.equal(saved.data.program.status, 'active');
      assert.equal(saved.data.rewards.length, 2);
      const kept = saved.data.rewards[0];
      const paused = await call('merchant', shopId, 'PUT', `/api/shops/${shopId}/loyalty/program`, { status: 'inactive', rewards: [{ ...kept, label: 'Jus de bissap offert' }] });
      assert.equal(paused.data.program.status, 'inactive');
      assert.ok(paused.data.program.activated_at);
      assert.deepEqual(paused.data.rewards.map((item: any) => [item.label, item.is_active]), [['Jus de bissap offert', true], ['Réduction de 500 FCFA', false]]);
    });

    await t.test('API : seules les boutiques pilotes peuvent activer les points', async () => {
      const pilot = await createShop();
      const other = await createShop();
      const isOpen = async (shopId: number) => (await call('merchant', shopId, 'GET', `/api/shops/${shopId}/loyalty/program`)).data.is_open;
      try {
        delete process.env.LOYALTY_PILOT_SHOP_IDS;
        assert.deepEqual([await isOpen(pilot), (await activate(pilot)).status], [false, 403], 'fermé par défaut');
        process.env.LOYALTY_PILOT_SHOP_IDS = ` ${pilot} , 12`;
        assert.deepEqual([await isOpen(pilot), await isOpen(other), (await activate(other)).status, (await activate(pilot)).status], [true, false, 403, 200]);
        process.env.LOYALTY_PILOT_SHOP_IDS = '';
        assert.equal(await isOpen(pilot), true, 'une boutique déjà en points garde son onglet');
        assert.equal((await call('merchant', pilot, 'PUT', `/api/shops/${pilot}/loyalty/program`, { status: 'inactive', rewards: [reward()] })).status, 200, 'et peut se mettre en pause');
      } finally {
        process.env.LOYALTY_PILOT_SHOP_IDS = '*';
      }
    });

    await t.test('API : parcours complet du client au commerçant', async () => {
      const shopId = await createShop();
      const userId = await createUser();
      await deliver(shopId, userId, 4);
      const activated = await activate(shopId);
      assert.equal(activated.status, 200);
      const wallet = async () => (await call('customer', userId, 'GET', '/api/loyalty/me')).data;
      let state = await wallet();
      assert.equal(state.programs[0].balance, 4, 'les anciennes commandes sont reprises à l’activation');
      assert.equal(state.programs[0].next_reward_points, 5);
      assert.equal(state.available_rewards, 0);
      const rewardId = state.programs[0].rewards[0].id;
      assert.equal((await call('customer', userId, 'POST', `/api/loyalty/rewards/${rewardId}/redeem`, {})).status, 409);
      const fifth = await createOrder(shopId, userId, day(40), 'confirmed');
      await dbTransaction(async (tx) => {
        await tx.run("UPDATE orders SET status = 'delivered' WHERE id = ?", [fifth]);
        await applyOrderStatusChange(tx, { orderId: fifth, shopId, from: 'confirmed', to: 'delivered', actor: 'merchant', now: NOW });
      });
      assert.equal((await wallet()).available_rewards, 1);
      const redeemed = await call('customer', userId, 'POST', `/api/loyalty/rewards/${rewardId}/redeem`, {});
      assert.equal(redeemed.status, 201);
      state = await wallet();
      assert.deepEqual([state.programs[0].balance, state.programs[0].reserved, state.programs[0].available], [5, 5, 0]);
      assert.equal(state.programs[0].open_redemptions[0].code, redeemed.data.redemption.code);
      const stranger = await createUser();
      assert.equal((await call('customer', stranger, 'POST', `/api/loyalty/redemptions/${redeemed.data.redemption.id}/cancel`, {})).status, 404);
      assert.deepEqual((await call('customer', stranger, 'GET', '/api/loyalty/me')).data.programs, []);
      const otherShop = await createShop();
      const confirm = (shop: number, code: unknown) => call('merchant', shop, 'POST', `/api/shops/${shop}/loyalty/redemptions/confirm`, { code });
      for (const code of [undefined, '', 'court', 'ABCDEFGHI', "' OR 1=1"]) assert.equal((await confirm(shopId, code)).status, 400, String(code));
      assert.equal((await confirm(otherShop, redeemed.data.redemption.code)).status, 404);
      assert.deepEqual((await confirm(shopId, redeemed.data.redemption.code.toLowerCase())).data, { success: true, points: 5 });
      assert.equal((await confirm(shopId, redeemed.data.redemption.code)).status, 409);
      assert.equal((await call('customer', userId, 'POST', `/api/loyalty/redemptions/${redeemed.data.redemption.id}/cancel`, {})).status, 409);
      const history = (await call('customer', userId, 'GET', '/api/loyalty/me/transactions')).data;
      assert.equal(history.items.length, 6);
      assert.deepEqual([history.items[0].type, history.items[0].points, history.items[0].balance_after, history.items[0].reward_label], ['redeem', -5, 0, 'Jus offert']);
      assert.equal('actor' in history.items[0], false);
      const members = (await call('merchant', shopId, 'GET', `/api/shops/${shopId}/loyalty/members`)).data;
      assert.deepEqual(Object.keys(members.items[0]).sort(), ['balance', 'earned', 'id', 'last_activity_at', 'name', 'reserved', 'spent'], 'ni téléphone ni e-mail');
      assert.deepEqual([members.items[0].name, members.items[0].earned, members.items[0].spent, members.items[0].balance], ['Awa', 5, 5, 0]);
      const analytics = (await call('merchant', shopId, 'GET', `/api/shops/${shopId}/loyalty/analytics?days=7`)).data;
      assert.deepEqual([analytics.points_earned, analytics.points_used, analytics.redemptions_used, analytics.usage_rate, analytics.active_members, analytics.daily.length], [1, 5, 1, 100, 1, 7]);
      assert.equal(analytics.daily.at(-1).earned, 1);
      assert.equal((await call('merchant', shopId, 'GET', `/api/shops/${shopId}/loyalty/analytics?days=12`)).status, 400);
      const personal = await getCustomerLoyaltyExport(userId);
      assert.equal(personal.movements.length, 6);
      assert.equal(personal.redemptions.length, 1);
    });

    await t.test('API : le client peut annuler sa réservation', async () => {
      const shopId = await createShop();
      const userId = await createUser();
      await deliver(shopId, userId, 5);
      await activate(shopId, [reward({ remaining: 1 })]);
      const rewardId = (await call('customer', userId, 'GET', '/api/loyalty/me')).data.programs[0].rewards[0].id;
      const redeemed = await call('customer', userId, 'POST', `/api/loyalty/rewards/${rewardId}/redeem`, {});
      assert.equal((await call('customer', userId, 'POST', `/api/loyalty/redemptions/${redeemed.data.redemption.id}/cancel`, {})).status, 200);
      const program = (await call('customer', userId, 'GET', '/api/loyalty/me')).data.programs[0];
      assert.deepEqual([program.available, program.open_redemptions.length, program.rewards[0].remaining], [5, 0, 1]);
    });

    await t.test('API : enregistrer un formulaire ouvert avant une réservation ne recrée pas de récompense', async () => {
      const shopId = await createShop();
      const userId = await createUser();
      await deliver(shopId, userId, 5);
      const loaded = (await activate(shopId, [reward({ remaining: 3 })])).data.rewards[0];
      assert.equal((await call('customer', userId, 'POST', `/api/loyalty/rewards/${loaded.id}/redeem`, {})).status, 201);
      const stale = await activate(shopId, [{ ...loaded, label: 'Jus de bissap', previous_remaining: 3 }]);
      assert.equal(stale.data.rewards[0].remaining, 2, 'la réservation du client est conservée');
      const restocked = await activate(shopId, [{ ...stale.data.rewards[0], remaining: 10, previous_remaining: 2 }]);
      assert.equal(restocked.data.rewards[0].remaining, 10);
      const unlimited = await activate(shopId, [{ ...restocked.data.rewards[0], remaining: null, previous_remaining: 10 }]);
      assert.equal(unlimited.data.rewards[0].remaining, null);
      assert.equal((await activate(shopId, [{ ...loaded, previous_remaining: -1 }])).status, 400);
    });

    await t.test('API : les pages de 30 mouvements s’enchaînent sans trou ni doublon', async () => {
      const shopId = await createShop();
      const userId = await createUser();
      await deliver(shopId, userId, 35);
      await activate(shopId);
      const first = (await call('customer', userId, 'GET', '/api/loyalty/me/transactions')).data;
      const second = (await call('customer', userId, 'GET', `/api/loyalty/me/transactions?cursor=${first.next_cursor}`)).data;
      assert.deepEqual([first.items.length, second.items.length, second.next_cursor], [30, 5, null]);
      assert.equal(new Set([...first.items, ...second.items].map((item: any) => item.id)).size, 35);
      for (const cursor of ['abc', '-1', '0', '1.5']) assert.equal((await call('customer', userId, 'GET', `/api/loyalty/me/transactions?cursor=${cursor}`)).status, 400, cursor);
    });

    await t.test('API : le Super-admin bloque, débloque et corrige avec une trace complète', async () => {
      const shopId = await createShop();
      const userId = await createUser();
      await deliver(shopId, userId, 5);
      const programId = (await activate(shopId)).data.program.id;
      const admin = (method: string, path: string, body?: unknown) => call('super_admin', 0, method, `/api/admin/loyalty/${path}`, body);
      const accountId = (await admin('GET', `programs/${programId}/accounts`)).data.items[0].id;
      assert.equal((await admin('POST', `programs/${programId}/block`, { blocked: true, reason: 'court' })).status, 400);
      assert.equal((await admin('POST', `programs/${programId}/block`, { blocked: true, reason: 'Points distribués sans commande' })).status, 200);
      assert.equal((await admin('POST', `programs/${programId}/block`, { blocked: true, reason: 'Points distribués sans commande' })).status, 409);
      assert.equal((await activate(shopId)).status, 409, 'le commerçant ne peut pas se débloquer');
      assert.equal((await admin('POST', `programs/${programId}/block`, { blocked: false, reason: 'Explications reçues et vérifiées' })).status, 200);
      assert.equal((await call('merchant', shopId, 'GET', `/api/shops/${shopId}/loyalty/program`)).data.program.status, 'inactive');
      const key = `cle-${nextId()}`;
      const adjust = (extra: Record<string, unknown> = {}) => admin('POST', 'adjustments', { account_id: accountId, delta: 2, reason: 'Commande oubliée, vérifiée', request_key: key, ...extra });
      for (const bad of [{ delta: '2' }, { delta: 0 }, { delta: 101 }, { reason: 'court' }, { request_key: '' }, { account_id: 'x' }]) assert.equal((await adjust(bad)).status, 400, JSON.stringify(bad));
      assert.equal((await adjust({ account_id: 987_654_321 })).status, 404);
      assert.deepEqual((await adjust()).data, { success: true, before: 5, after: 7 });
      assert.equal((await adjust()).status, 409);
      const detail = (await admin('GET', `accounts/${accountId}`)).data;
      assert.deepEqual([detail.balance, detail.transactions.items[0].type, detail.transactions.items[0].reason], [7, 'adjust', 'Commande oubliée, vérifiée']);
      const logs = await dbAll<{ action: string; details: string }>('SELECT action, details FROM admin_audit_logs WHERE shop_id = ? ORDER BY id', [shopId]);
      assert.deepEqual(logs.map((row) => row.action), ['loyalty_program_blocked', 'loyalty_program_unblocked', 'loyalty_points_adjusted']);
      const trace = typeof logs[2].details === 'string' ? JSON.parse(logs[2].details) : logs[2].details;
      assert.deepEqual([trace.user_id, trace.delta, trace.before, trace.after], [userId, 2, 5, 7]);
      const overview = (await admin('GET', 'overview')).data;
      assert.equal(overview.unsound_accounts, 0);
      assert.ok(overview.points_earned >= 5 && overview.members >= 1);
      assert.ok((await admin('GET', 'programs')).data.items.some((item: any) => item.shop_id === shopId));
    });

    await t.test('API : les distributions anormales sont signalées', async () => {
      const phone = `+225${String(nextId()).padStart(10, '0')}`;
      const shopId = await createShop(phone);
      await activate(shopId);
      const owner = await createUser(phone);
      const friends = [await createUser(), await createUser()];
      for (const [index, orderId] of (await deliver(shopId, owner, 12)).entries()) {
        assert.equal((await dbTransaction((tx) => earnForOrder(tx, { orderId, actor: 'merchant', now: NOW }))).type, 'earned', String(index));
      }
      for (const friend of friends) {
        const [orderId] = await deliver(shopId, friend, 1);
        await dbTransaction((tx) => earnForOrder(tx, { orderId, actor: 'merchant', now: NOW }));
      }
      const codes = (await call('super_admin', 0, 'GET', '/api/admin/loyalty/overview')).data.anomalies.filter((item: any) => item.shop_id === shopId).map((item: any) => item.code).sort();
      assert.deepEqual(codes, ['concentrated', 'many_points', 'same_phone']);
    });

    await t.test('reprise : soldes identiques à l’ancienne carte, rejouable, et simulation sans effet', async () => {
      const shopId = await createShop();
      const users = [await createUser(), await createUser(), await createUser()];
      await deliver(shopId, users[0], 13);
      await deliver(shopId, users[1], 5);
      await deliver(shopId, users[2], 2);
      await createOrder(shopId, null, day(1));
      await createOrder(shopId, users[2], day(50), 'cancelled');
      await createOrder(shopId, 987_654_321, day(51));
      for (const milestone of [5, 10]) await dbRun("INSERT INTO customer_loyalty_redemptions (shop_id, user_id, qualifying_order_count, redeemed_at, redeemed_by) VALUES (?, ?, ?, ?, 'merchant')", [shopId, users[0], milestone, NOW]);
      await dbRun("INSERT INTO customer_loyalty_redemptions (shop_id, user_id, qualifying_order_count, redeemed_at, redeemed_by) VALUES (?, ?, 5, ?, 'merchant')", [shopId, users[1], NOW]);
      const simulated = (await migrateLoyalty(false)).find((item) => item.shopId === shopId);
      assert.deepEqual(simulated, { shopId, customers: 3, orders: 20, redemptions: 3, skipped: false });
      assert.equal(await dbGet('SELECT id FROM loyalty_programs WHERE shop_id = ?', [shopId]), undefined, 'la simulation n’enregistre rien');
      await migrateLoyalty(true);
      const balances = await dbAll<{ user_id: number; balance: number; id: number }>(
        `SELECT accounts.id, accounts.user_id, accounts.balance FROM loyalty_accounts AS accounts JOIN loyalty_programs AS programs ON programs.id = accounts.program_id
         WHERE programs.shop_id = ? ORDER BY accounts.user_id`, [shopId]);
      assert.deepEqual(balances.map((row) => Number(row.balance)), [3, 0, 2]);
      for (const row of balances) assert.equal((await dbTransaction((tx) => checkAccount(tx, Number(row.id)))).isSound, true);
      const again = (await migrateLoyalty(true)).find((item) => item.shopId === shopId)!;
      assert.deepEqual([again.orders, again.redemptions, again.customers], [0, 0, 3], 'rejouable sans doublon');
      const late = await createOrder(shopId, users[2], day(60));
      assert.equal((await dbTransaction((tx) => importLegacyLoyalty(tx, shopId, NOW))).orders, 1, 'une commande remise entre-temps est reprise');
      const program = await dbGet<{ status: string; activated_at: string | null }>('SELECT status, activated_at FROM loyalty_programs WHERE shop_id = ?', [shopId]);
      assert.deepEqual([program!.status, program!.activated_at], ['inactive', null]);
      await activate(shopId);
      assert.equal((await dbTransaction((tx) => importLegacyLoyalty(tx, shopId, NOW))).skipped, true, 'plus de reprise après activation');
      assert.equal((await dbTransaction((tx) => earnForOrder(tx, { orderId: late, actor: 'merchant', now: NOW }))).type, 'already_earned');
    });

    await t.test('reprise : un seul écart annule tout', async () => {
      const shopId = await createShop();
      const userId = await createUser();
      await deliver(shopId, userId, 5);
      await migrateLoyalty(true);
      await dbRun('UPDATE loyalty_accounts SET balance = balance + 1 WHERE user_id = ?', [userId]);
      const otherShop = await createShop();
      await deliver(otherShop, await createUser(), 2);
      await assert.rejects(migrateLoyalty(true), /Reprise de fidélité incohérente/);
      assert.equal(await dbGet('SELECT id FROM loyalty_programs WHERE shop_id = ?', [otherShop]), undefined, 'les autres boutiques ne sont pas reprises non plus');
      await dbRun('UPDATE loyalty_accounts SET balance = balance - 1 WHERE user_id = ?', [userId]);
    });

    await t.test('une remise encore en cours d’enregistrement retarde l’activation au lieu d’être perdue', async () => {
      const shopId = await createShop();
      const userId = await createUser();
      await call('merchant', shopId, 'PUT', `/api/shops/${shopId}/loyalty/program`, { status: 'inactive', rewards: [reward()] });
      const orderId = await createOrder(shopId, userId, day(0), 'confirmed');
      let markStarted: () => void = () => undefined;
      const started = new Promise<void>((resolve) => { markStarted = resolve; });
      const delivery = dbTransaction(async (tx) => {
        await tx.run("UPDATE orders SET status = 'delivered' WHERE id = ?", [orderId]);
        await applyOrderStatusChange(tx, { orderId, shopId, from: 'confirmed', to: 'delivered', actor: 'merchant', now: NOW });
        markStarted();
        await new Promise((resolve) => setTimeout(resolve, 250));
      });
      await started;
      const [activated] = await Promise.all([activate(shopId), delivery]);
      assert.equal(activated.status, 200);
      assert.equal((await call('customer', userId, 'GET', '/api/loyalty/me')).data.programs[0]?.balance, 1);
    });

    await t.test('activation et remise simultanées ne perdent aucune commande', async () => {
      for (let round = 0; round < 8; round += 1) {
        const shopId = await createShop();
        const userId = await createUser();
        const orders: number[] = [];
        for (let index = 0; index < 4; index += 1) orders.push(await createOrder(shopId, userId, day(index), 'confirmed'));
        await Promise.all([
          activate(shopId),
          ...orders.map((orderId) => dbTransaction(async (tx) => {
            await tx.run("UPDATE orders SET status = 'delivered' WHERE id = ?", [orderId]);
            await applyOrderStatusChange(tx, { orderId, shopId, from: 'confirmed', to: 'delivered', actor: 'merchant', now: NOW });
          })),
        ]);
        const account = await dbGet<{ id: number; balance: number }>(
          'SELECT accounts.id, accounts.balance FROM loyalty_accounts AS accounts JOIN loyalty_programs AS programs ON programs.id = accounts.program_id WHERE programs.shop_id = ?', [shopId]);
        assert.equal(Number(account?.balance), 4, `tour ${round}`);
      }
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
