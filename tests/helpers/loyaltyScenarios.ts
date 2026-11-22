import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { DatabaseTransaction } from '../../db.ts';

type Database = typeof import('../../db.ts');
type Engine = typeof import('../../server/services/loyaltyEngine.ts');

let sequence = 0;

/** Scénarios communs à SQLite et PostgreSQL : les règles doivent donner exactement les mêmes soldes. */
export async function runLoyaltyScenarios(t: TestContext, database: Database, engine: Engine): Promise<void> {
  const { dbAll, dbGet, dbRun, dbTransaction } = database;
  const base = Date.now() % 1_000_000_000;
  const nextId = () => base + (sequence += 1);
  const NOW = '2026-11-22T12:00:00.000Z';

  const createShop = async () => {
    const id = nextId();
    await dbRun(
      `INSERT INTO shops (id, name, slug, whatsapp_number, pin_code_hash, created_at, category, subscription_tier)
       VALUES (?, ?, ?, ?, 'hash', ?, 'food', 'standard')`,
      [id, `Boutique ${id}`, `boutique-fidelite-${id}`, `+225${String(id).padStart(10, '0')}`, NOW],
    );
    return id;
  };
  const createUser = async () => {
    const email = `client-${nextId()}@example.com`;
    await dbRun('INSERT INTO users (name, phone, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)', ['Client', '+2250700000000', email, 'hash', NOW]);
    return Number((await dbGet<{ id: number }>('SELECT id FROM users WHERE email = ?', [email]))!.id);
  };
  const createOrder = async (shopId: number, userId: number | null, createdAt = NOW, status = 'delivered') => {
    const id = nextId();
    await dbRun(
      `INSERT INTO orders (id, shop_id, customer_name, customer_phone, delivery_location, payment_method_preference, total_amount, created_at, status, items, customer_user_id)
       VALUES (?, ?, 'Client', '+2250700000000', '', 'to_confirm', 1000, ?, ?, '[]', ?)`,
      [id, shopId, createdAt, status, userId],
    );
    return id;
  };
  const createProgram = async (shopId: number, status = 'active', costs: { cost: number; remaining?: number | null; endsAt?: string | null }[] = [{ cost: 5 }]) => {
    await dbRun('INSERT INTO loyalty_programs (shop_id, status, activated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [shopId, status, status === 'inactive' ? null : NOW, NOW, NOW]);
    const programId = Number((await dbGet<{ id: number }>('SELECT id FROM loyalty_programs WHERE shop_id = ?', [shopId]))!.id);
    const rewardIds: number[] = [];
    for (const { cost, remaining = null, endsAt = null } of costs) {
      const row = await dbGet<{ id: number }>(
        'INSERT INTO loyalty_rewards (program_id, label, cost_points, remaining, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
        [programId, 'Article offert', cost, remaining, endsAt, NOW],
      );
      rewardIds.push(Number(row!.id));
    }
    return { programId, rewardIds };
  };
  const day = (index: number) => new Date(Date.parse('2026-10-01T10:00:00.000Z') + index * 86_400_000).toISOString();
  const earn = (orderId: number, actor = 'merchant') => dbTransaction((tx) => engine.earnForOrder(tx, { orderId, actor, now: NOW }));
  const reverse = (orderId: number) => dbTransaction((tx) => engine.reverseForOrder(tx, { orderId, actor: 'super_admin', reason: 'Annulation de la remise', now: NOW }));
  const reserve = (userId: number, rewardId: number, now = NOW) => dbTransaction((tx) => engine.reserveReward(tx, { userId, rewardId, now }));
  const confirm = (shopId: number, code: string, now = NOW) => dbTransaction((tx) => engine.confirmRedemption(tx, { shopId, code, actor: 'merchant', now }));
  const account = async (programId: number, userId: number) => {
    const row = await dbGet<{ id: number; balance: number; reserved: number }>('SELECT id, balance, reserved FROM loyalty_accounts WHERE program_id = ? AND user_id = ?', [programId, userId]);
    return row && { id: Number(row.id), balance: Number(row.balance), reserved: Number(row.reserved) };
  };
  const assertSound = async (accountId: number) => {
    const check = await dbTransaction((tx) => engine.checkAccount(tx, accountId));
    assert.equal(check.isSound, true, JSON.stringify(check));
  };
  const fund = async (shopId: number, userId: number, points: number) => {
    for (let index = 0; index < points; index += 1) {
      const result = await earn(await createOrder(shopId, userId, day(index)));
      assert.equal(result.type, 'earned');
    }
  };
  const setup = async (points = 0, rewards?: Parameters<typeof createProgram>[2]) => {
    const shopId = await createShop();
    const userId = await createUser();
    const program = await createProgram(shopId, 'active', rewards);
    await fund(shopId, userId, points);
    return { shopId, userId, ...program };
  };

  await t.test('une commande remise donne un point, une seule fois', async () => {
    const { shopId, userId, programId } = await setup();
    const orderId = await createOrder(shopId, userId);
    assert.deepEqual(await earn(orderId), { type: 'earned', points: 1, balance: 1 });
    assert.deepEqual(await earn(orderId), { type: 'already_earned' });
    const state = (await account(programId, userId))!;
    assert.equal(state.balance, 1);
    assert.equal((await dbAll('SELECT id FROM loyalty_transactions WHERE order_id = ?', [orderId])).length, 1);
    await assertSound(state.id);
  });

  await t.test('rien n’est attribué sans compte, hors remise, sans programme actif', async () => {
    const { shopId, userId, programId } = await setup();
    assert.deepEqual(await earn(await createOrder(shopId, null)), { type: 'guest' });
    for (const status of ['pending', 'confirmed', 'cancelled', 'rejected', 'expired']) {
      assert.deepEqual(await earn(await createOrder(shopId, userId, NOW, status)), { type: 'not_delivered' }, status);
    }
    assert.deepEqual(await earn(987_654_321), { type: 'missing' });
    for (const status of ['inactive', 'blocked']) {
      const otherShop = await createShop();
      await createProgram(otherShop, status);
      assert.deepEqual(await earn(await createOrder(otherShop, userId)), { type: 'inactive' }, status);
    }
    assert.deepEqual(await earn(await createOrder(await createShop(), userId)), { type: 'inactive' });
    assert.equal(await account(programId, userId), undefined);
  });

  await t.test('les soldes de deux boutiques restent indépendants', async () => {
    const first = await setup(3);
    const secondShop = await createShop();
    const second = await createProgram(secondShop);
    await earn(await createOrder(secondShop, first.userId));
    assert.equal((await account(first.programId, first.userId))!.balance, 3);
    assert.equal((await account(second.programId, first.userId))!.balance, 1);
  });

  await t.test('les commandes rapprochées et au-delà de trois par jour ne rapportent pas', async () => {
    const { shopId, userId, programId } = await setup();
    const at = (hour: string) => `2026-11-20T${hour}:00.000Z`;
    assert.equal((await earn(await createOrder(shopId, userId, at('06:00')))).type, 'earned');
    assert.equal((await earn(await createOrder(shopId, userId, at('07:59')))).type, 'limited');
    assert.equal((await earn(await createOrder(shopId, userId, at('04:01')))).type, 'limited');
    assert.equal((await earn(await createOrder(shopId, userId, at('08:00')))).type, 'earned');
    assert.equal((await earn(await createOrder(shopId, userId, at('12:00')))).type, 'earned');
    assert.equal((await earn(await createOrder(shopId, userId, at('18:00')))).type, 'limited');
    assert.equal((await earn(await createOrder(shopId, userId, '2026-11-21T06:00:00.000Z'))).type, 'earned');
    assert.equal((await account(programId, userId))!.balance, 4);
  });

  await t.test('remise, annulée puis remise à nouveau : le registre garde tout et le solde est juste', async () => {
    const { shopId, userId, programId } = await setup();
    const orderId = await createOrder(shopId, userId);
    assert.deepEqual(await reverse(orderId), { type: 'nothing_to_reverse' });
    await earn(orderId);
    assert.deepEqual(await reverse(orderId), { type: 'reversed', points: 1, balance: 0 });
    assert.deepEqual(await reverse(orderId), { type: 'nothing_to_reverse' });
    assert.deepEqual(await earn(orderId), { type: 'earned', points: 1, balance: 1 });
    const keys = (await dbAll<{ idempotency_key: string }>('SELECT idempotency_key FROM loyalty_transactions WHERE order_id = ? ORDER BY id', [orderId])).map((row) => row.idempotency_key);
    assert.deepEqual(keys, [`earn:order:${orderId}:1`, `reverse:order:${orderId}:1`, `earn:order:${orderId}:2`]);
    await assertSound((await account(programId, userId))!.id);
  });

  await t.test('une récompense se réserve puis se débite une seule fois', async () => {
    const { shopId, userId, programId, rewardIds } = await setup(6);
    const reserved = await reserve(userId, rewardIds[0]);
    assert.equal(reserved.type, 'reserved');
    if (reserved.type !== 'reserved') return;
    assert.match(reserved.code, /^[A-HJ-NP-Z2-9]{8}$/);
    assert.deepEqual({ ...(await account(programId, userId)), id: 0 }, { id: 0, balance: 6, reserved: 5 });
    assert.equal((await reserve(userId, rewardIds[0])).type, 'insufficient');
    const otherShop = await createShop();
    await createProgram(otherShop);
    assert.equal((await confirm(otherShop, reserved.code)).type, 'missing', 'code d’une autre boutique');
    assert.deepEqual(await confirm(shopId, ` ${reserved.code.toLowerCase()} `), { type: 'used', points: 5, balance: 1 });
    assert.equal((await confirm(shopId, reserved.code)).type, 'closed');
    const state = (await account(programId, userId))!;
    assert.deepEqual({ balance: state.balance, reserved: state.reserved }, { balance: 1, reserved: 0 });
    await assertSound(state.id);
  });

  await t.test('une réservation annulée ou périmée libère les points et la quantité', async () => {
    const { shopId, userId, programId, rewardIds } = await setup(5, [{ cost: 5, remaining: 1 }]);
    const remaining = async () => Number((await dbGet<{ remaining: number }>('SELECT remaining FROM loyalty_rewards WHERE id = ?', [rewardIds[0]]))!.remaining);
    const first = await reserve(userId, rewardIds[0]);
    assert.ok(first.type === 'reserved');
    assert.equal(await remaining(), 0);
    const stranger = await createUser();
    assert.equal((await dbTransaction((tx) => engine.releaseRedemption(tx, { redemptionId: first.redemptionId, userId: stranger, now: NOW }))).type, 'missing');
    assert.equal((await dbTransaction((tx) => engine.releaseRedemption(tx, { redemptionId: first.redemptionId, userId, now: NOW }))).type, 'released');
    assert.equal((await dbTransaction((tx) => engine.releaseRedemption(tx, { redemptionId: first.redemptionId, userId, now: NOW }))).type, 'closed');
    assert.equal(await remaining(), 1);
    const second = await reserve(userId, rewardIds[0]);
    assert.ok(second.type === 'reserved');
    const later = '2026-11-29T12:00:00.001Z';
    assert.equal((await confirm(shopId, second.code, later)).type, 'expired');
    assert.equal(await remaining(), 1);
    const third = await reserve(userId, rewardIds[0]);
    assert.ok(third.type === 'reserved');
    const thirdStatus = async () => (await dbGet<{ status: string }>('SELECT status FROM loyalty_redemptions WHERE id = ?', [third.redemptionId]))!.status;
    await engine.expireReservations(Date.parse('2026-11-29T11:59:59.000Z'));
    assert.equal(await thirdStatus(), 'reserved');
    assert.ok(await engine.expireReservations(Date.parse(later)) >= 1);
    assert.equal(await thirdStatus(), 'expired');
    assert.equal(await remaining(), 1);
    const state = (await account(programId, userId))!;
    assert.deepEqual({ balance: state.balance, reserved: state.reserved }, { balance: 5, reserved: 0 });
    await assertSound(state.id);
  });

  await t.test('récompense épuisée, terminée, retirée ou programme bloqué : réservation refusée', async () => {
    const { userId, programId, rewardIds, shopId } = await setup(5, [{ cost: 1, remaining: 0 }, { cost: 1, endsAt: '2026-11-22T11:59:59.000Z' }, { cost: 1 }]);
    assert.equal((await reserve(userId, rewardIds[0])).type, 'unavailable');
    assert.equal((await reserve(userId, rewardIds[1])).type, 'unavailable');
    assert.equal((await reserve(await createUser(), rewardIds[2])).type, 'insufficient');
    assert.equal((await reserve(userId, 987_654_321)).type, 'missing');
    const open = await reserve(userId, rewardIds[2]);
    assert.ok(open.type === 'reserved');
    await dbRun("UPDATE loyalty_programs SET status = 'blocked' WHERE id = ?", [programId]);
    assert.equal((await reserve(userId, rewardIds[2])).type, 'unavailable');
    assert.equal((await confirm(shopId, open.code)).type, 'blocked');
    await dbRun("UPDATE loyalty_programs SET status = 'inactive' WHERE id = ?", [programId]);
    assert.equal((await confirm(shopId, open.code)).type, 'used', 'une réservation acquise reste honorée si le commerçant met en pause');
  });

  await t.test('après une annulation, des points manquants bloquent l’utilisation', async () => {
    const { shopId, userId, programId, rewardIds } = await setup(4);
    const lastOrder = await createOrder(shopId, userId, day(40));
    await earn(lastOrder);
    const open = await reserve(userId, rewardIds[0]);
    assert.ok(open.type === 'reserved');
    await reverse(lastOrder);
    assert.equal((await confirm(shopId, open.code)).type, 'insufficient');
    const second = await setup(5);
    const used = await reserve(second.userId, second.rewardIds[0]);
    assert.ok(used.type === 'reserved');
    await confirm(second.shopId, used.code);
    const orders = await dbAll<{ id: number }>('SELECT id FROM orders WHERE shop_id = ? ORDER BY id', [second.shopId]);
    assert.deepEqual(await reverse(Number(orders[0].id)), { type: 'reversed', points: 1, balance: -1 });
    assert.equal((await reserve(second.userId, second.rewardIds[0])).type, 'insufficient');
    await assertSound((await account(programId, userId))!.id);
    await assertSound((await account(second.programId, second.userId))!.id);
  });

  await t.test('une correction exige un motif, laisse une trace et ne se répète pas', async () => {
    const { userId, programId } = await setup(2);
    const accountId = (await account(programId, userId))!.id;
    const adjust = (delta: number, reason: string, key = `test-${nextId()}`) => dbTransaction((tx) => engine.adjustPoints(tx, { accountId, delta, reason, actor: 'super_admin', requestKey: key, now: NOW }));
    assert.equal((await adjust(3, 'court')).type, 'invalid');
    for (const delta of [0, 1.5, 101, -101]) assert.equal((await adjust(delta, 'Motif suffisamment long')).type, 'invalid', String(delta));
    const key = `geste-${nextId()}`;
    assert.deepEqual(await adjust(3, 'Geste commercial après erreur', key), { type: 'adjusted', before: 2, after: 5 });
    assert.equal((await adjust(3, 'Geste commercial après erreur', key)).type, 'duplicate');
    assert.deepEqual(await adjust(-1, 'Correction de saisie'), { type: 'adjusted', before: 5, after: 4 });
    const trace = await dbAll<{ actor: string; reason: string; balance_after: number }>("SELECT actor, reason, balance_after FROM loyalty_transactions WHERE account_id = ? AND type = 'adjust' ORDER BY id", [accountId]);
    assert.deepEqual(trace.map((row) => [row.actor, row.reason, Number(row.balance_after)]), [['super_admin', 'Geste commercial après erreur', 5], ['super_admin', 'Correction de saisie', 4]]);
    await assertSound(accountId);
  });

  await t.test('supprimer un compte client libère ses réservations et garde le registre anonyme', async () => {
    const { userId, programId, rewardIds } = await setup(5, [{ cost: 5, remaining: 2 }]);
    const accountId = (await account(programId, userId))!.id;
    const open = await reserve(userId, rewardIds[0]);
    assert.ok(open.type === 'reserved');
    await dbTransaction(async (tx) => {
      await engine.closeCustomerAccounts(tx, userId, NOW);
      await tx.run('UPDATE orders SET customer_user_id = NULL WHERE customer_user_id = ?', [userId]);
      await tx.run('DELETE FROM users WHERE id = ?', [userId]);
    });
    const kept = await dbGet<{ user_id: number | null; balance: number; reserved: number }>('SELECT user_id, balance, reserved FROM loyalty_accounts WHERE id = ?', [accountId]);
    assert.deepEqual([kept!.user_id, Number(kept!.balance), Number(kept!.reserved)], [null, 5, 0]);
    assert.equal((await dbAll('SELECT id FROM loyalty_transactions WHERE account_id = ?', [accountId])).length, 5);
    assert.equal(Number((await dbGet<{ remaining: number }>('SELECT remaining FROM loyalty_rewards WHERE id = ?', [rewardIds[0]]))!.remaining), 2);
    await assertSound(accountId);
  });

  await t.test('supprimer une boutique efface son programme', async () => {
    const { shopId, programId, userId, rewardIds } = await setup(5);
    const open = await reserve(userId, rewardIds[0]);
    assert.ok(open.type === 'reserved');
    await confirm(shopId, open.code);
    await dbRun('DELETE FROM orders WHERE shop_id = ?', [shopId]);
    await dbRun('DELETE FROM shops WHERE id = ?', [shopId]);
    assert.equal(await dbGet('SELECT id FROM loyalty_programs WHERE id = ?', [programId]), undefined);
    assert.equal(await account(programId, userId), undefined);
  });

  await t.test('après 500 opérations aléatoires, le solde égale toujours la somme du registre', async () => {
    const { shopId, userId, programId, rewardIds } = await setup(0, [{ cost: 2 }, { cost: 3, remaining: 5 }]);
    let seed = 42;
    const random = (max: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % max;
    };
    const orders: number[] = [];
    const codes: { id: number; code: string }[] = [];
    for (let index = 0; index < 500; index += 1) {
      const choice = random(6);
      if (choice <= 1 || orders.length === 0) {
        const orderId = await createOrder(shopId, userId, day(index));
        orders.push(orderId);
        await earn(orderId);
      } else if (choice === 2) await reverse(orders[random(orders.length)]);
      else if (choice === 3) {
        const result = await reserve(userId, rewardIds[random(2)]);
        if (result.type === 'reserved') codes.push({ id: result.redemptionId, code: result.code });
      } else if (choice === 4 && codes.length > 0) await confirm(shopId, codes[random(codes.length)].code);
      else if (codes.length > 0) {
        const { id } = codes[random(codes.length)];
        await dbTransaction((tx) => engine.releaseRedemption(tx, { redemptionId: id, now: NOW }));
      } else await earn(orders[random(orders.length)]);
    }
    const state = (await account(programId, userId))!;
    const sum = await dbGet<{ total: number }>('SELECT SUM(points_delta) AS total FROM loyalty_transactions WHERE account_id = ?', [state.id]);
    assert.equal(state.balance, Number(sum!.total));
    assert.ok(state.reserved >= 0);
    await assertSound(state.id);
  });

  await t.test('chaque changement de statut est historisé', async () => {
    const shopId = await createShop();
    const orderId = await createOrder(shopId, null);
    await dbTransaction(async (tx) => {
      await engine.recordOrderStatus(tx, { orderId, shopId, from: null, to: 'pending', actor: 'customer', now: NOW });
      await engine.recordOrderStatus(tx, { orderId, shopId, from: 'pending', to: 'confirmed', actor: 'merchant', now: NOW });
    });
    const events = await dbAll<{ from_status: string | null; to_status: string; actor: string }>('SELECT from_status, to_status, actor FROM order_status_events WHERE order_id = ? ORDER BY id', [orderId]);
    assert.deepEqual(events.map((event) => [event.from_status, event.to_status, event.actor]), [[null, 'pending', 'customer'], ['pending', 'confirmed', 'merchant']]);
  });

  await t.test('le changement de statut attribue à la remise et reprend si la remise est annulée', async () => {
    const { shopId, userId, programId } = await setup();
    const orderId = await createOrder(shopId, userId, NOW, 'confirmed');
    const move = (from: string, to: string, actor: string) => dbTransaction(async (tx) => {
      await tx.run('UPDATE orders SET status = ? WHERE id = ?', [to, orderId]);
      await engine.applyOrderStatusChange(tx, { orderId, shopId, from, to, actor, now: NOW });
    });
    await move('confirmed', 'delivered', 'merchant');
    assert.equal((await account(programId, userId))!.balance, 1);
    await move('delivered', 'cancelled', 'super_admin');
    assert.equal((await account(programId, userId))!.balance, 0);
    await move('cancelled', 'confirmed', 'super_admin');
    await move('confirmed', 'delivered', 'merchant');
    assert.equal((await account(programId, userId))!.balance, 1);
    const events = await dbAll<{ to_status: string }>('SELECT to_status FROM order_status_events WHERE order_id = ? ORDER BY id', [orderId]);
    assert.deepEqual(events.map((event) => event.to_status), ['delivered', 'cancelled', 'confirmed', 'delivered']);
    const reversal = await dbGet<{ reason: string }>("SELECT reason FROM loyalty_transactions WHERE order_id = ? AND type = 'reverse'", [orderId]);
    assert.equal(reversal!.reason, 'Commande repassée au statut cancelled');
  });

  await t.test('deux utilisations simultanées ne dépassent jamais le solde', async () => {
    const { shopId, userId, programId, rewardIds } = await setup(5, [{ cost: 4 }]);
    const results = await Promise.all(Array.from({ length: 6 }, () => reserve(userId, rewardIds[0])));
    const winners = results.filter((result) => result.type === 'reserved');
    assert.equal(winners.length, 1);
    const winner = winners[0];
    assert.ok(winner.type === 'reserved');
    const confirmations = await Promise.all(Array.from({ length: 6 }, () => confirm(shopId, winner.code)));
    assert.equal(confirmations.filter((result) => result.type === 'used').length, 1);
    const orderId = await createOrder(shopId, userId, day(60));
    const earned = await Promise.all(Array.from({ length: 6 }, () => earn(orderId)));
    assert.equal(earned.filter((result) => result.type === 'earned').length, 1);
    const state = (await account(programId, userId))!;
    assert.deepEqual({ balance: state.balance, reserved: state.reserved }, { balance: 2, reserved: 0 });
    await assertSound(state.id);
  });

  await t.test('même ralenties entre la lecture et l’écriture, deux réservations d’un même client ne passent pas', async () => {
    const { shopId, userId, programId, rewardIds } = await setup(5, [{ cost: 4 }]);
    // Force le pire entrelacement : chaque transaction attend après avoir lu le solde.
    const slowly = (tx: DatabaseTransaction): DatabaseTransaction => ({
      ...tx,
      get: async <Row,>(sql: string, params?: unknown[]) => {
        const row = await tx.get<Row>(sql, params);
        if (/FROM loyalty_accounts WHERE/.test(sql)) await new Promise((resolve) => setTimeout(resolve, 120));
        return row;
      },
    });
    const results = await Promise.all([1, 2, 3].map(() => dbTransaction((tx) => engine.reserveReward(slowly(tx), { userId, rewardId: rewardIds[0], now: NOW }))));
    assert.deepEqual(results.map(({ type }) => type).sort(), ['insufficient', 'insufficient', 'reserved']);
    const winner = results.find((result) => result.type === 'reserved');
    assert.ok(winner?.type === 'reserved');
    const confirmations = await Promise.all([1, 2].map(() => dbTransaction((tx) => engine.confirmRedemption(slowly(tx), { shopId, code: winner.code, actor: 'merchant', now: NOW }))));
    assert.deepEqual(confirmations.map(({ type }) => type).sort(), ['closed', 'used']);
    await assertSound((await account(programId, userId))!.id);
  });

  await t.test('la dernière récompense disponible ne part qu’une fois entre plusieurs clients', async () => {
    const { shopId, rewardIds, userId } = await setup(1, [{ cost: 1, remaining: 1 }]);
    const others = await Promise.all(Array.from({ length: 4 }, createUser));
    for (const [index, other] of others.entries()) await earn(await createOrder(shopId, other, day(index)));
    const results = await Promise.all([userId, ...others].map((id) => reserve(id, rewardIds[0])));
    assert.equal(results.filter((result) => result.type === 'reserved').length, 1);
    assert.equal(results.filter((result) => result.type === 'unavailable').length, 4);
  });
}
