import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

interface OrderRow {
  id: number;
  shop_id: number;
  items: unknown;
}

interface ProductRow {
  id: number;
  shop_id: number;
}

interface RepairCandidate {
  orderId: number;
  previousShopId: number;
  expectedShopId: number;
}

interface SkippedOrder {
  orderId: number;
  reason: 'empty_items' | 'invalid_items' | 'missing_product' | 'multiple_product_shops' | 'missing_shop';
}

export function parseOrderItems(value: unknown): unknown[] | null {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  return Array.isArray(parsed) ? parsed : null;
}

export function findOrderShopCorrections(
  orders: OrderRow[],
  products: ProductRow[],
  shopIds: Set<number>,
): { candidates: RepairCandidate[]; skipped: SkippedOrder[] } {
  const productShops = new Map(products.map((product) => [Number(product.id), Number(product.shop_id)]));
  const candidates: RepairCandidate[] = [];
  const skipped: SkippedOrder[] = [];

  for (const order of orders) {
    const items = parseOrderItems(order.items);
    if (!items || items.length === 0) {
      skipped.push({ orderId: Number(order.id), reason: items ? 'empty_items' : 'invalid_items' });
      continue;
    }

    const itemShopIds = new Set<number>();
    let invalidItems = false;
    let missingProduct = false;
    for (const item of items) {
      if (!item || typeof item !== 'object' || !('product_id' in item)) {
        invalidItems = true;
        break;
      }
      const productId = Number(item.product_id);
      if (!Number.isSafeInteger(productId) || productId <= 0) {
        invalidItems = true;
        break;
      }
      const productShopId = productShops.get(productId);
      if (productShopId === undefined) {
        missingProduct = true;
        break;
      }
      itemShopIds.add(productShopId);
    }

    if (invalidItems) {
      skipped.push({ orderId: Number(order.id), reason: 'invalid_items' });
      continue;
    }
    if (missingProduct) {
      skipped.push({ orderId: Number(order.id), reason: 'missing_product' });
      continue;
    }
    if (itemShopIds.size !== 1) {
      skipped.push({ orderId: Number(order.id), reason: 'multiple_product_shops' });
      continue;
    }

    const expectedShopId = itemShopIds.values().next().value as number;
    if (!shopIds.has(expectedShopId)) {
      skipped.push({ orderId: Number(order.id), reason: 'missing_shop' });
      continue;
    }
    if (expectedShopId !== Number(order.shop_id)) {
      candidates.push({
        orderId: Number(order.id),
        previousShopId: Number(order.shop_id),
        expectedShopId,
      });
    }
  }

  return { candidates, skipped };
}

export async function runOrderShopAttributionRepair(args = process.argv.slice(2)) {
  const isApplyMode = args.includes('--apply');
  const unknownArguments = args.filter((argument) => argument !== '--apply');
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown argument(s): ${unknownArguments.join(', ')}`);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !/^postgres(?:ql)?:\/\//i.test(connectionString)) {
    throw new Error('Set DATABASE_URL to the PostgreSQL database to inspect.');
  }

  const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 });
  const runId = randomUUID();
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('matable:repair-order-shop-attribution'))");

      const orderResult = await client.query<OrderRow>(
        'SELECT id, shop_id, items FROM orders ORDER BY id',
      );
      const orders = orderResult.rows.map((order) => ({
        ...order,
        id: Number(order.id),
        shop_id: Number(order.shop_id),
      }));
      const productIds = new Set<number>();
      for (const order of orders) {
        for (const item of parseOrderItems(order.items) || []) {
          if (item && typeof item === 'object' && 'product_id' in item) {
            const productId = Number(item.product_id);
            if (Number.isSafeInteger(productId) && productId > 0) productIds.add(productId);
          }
        }
      }

      const productResult = productIds.size > 0
        ? await client.query<ProductRow>(
          'SELECT id, shop_id FROM products WHERE id = ANY($1::int[]) ORDER BY id FOR SHARE',
          [[...productIds]],
        )
        : { rows: [] as ProductRow[] };
      const productRows = productResult.rows.map((product) => ({
        id: Number(product.id),
        shop_id: Number(product.shop_id),
      }));
      const existingShopIds = new Set<number>();
      if (productRows.length > 0) {
        const shopResult = await client.query<{ id: number }>(
          'SELECT id FROM shops WHERE id = ANY($1::int[]) ORDER BY id FOR SHARE',
          [[...new Set(productRows.map((product) => product.shop_id))]],
        );
        for (const shop of shopResult.rows) existingShopIds.add(Number(shop.id));
      }

      const { candidates, skipped } = findOrderShopCorrections(orders, productRows, existingShopIds);
      console.log(JSON.stringify({
        mode: isApplyMode ? 'apply' : 'dry-run',
        run_id: runId,
        inspected_orders: orders.length,
        correction_candidates: candidates,
        skipped_count: skipped.length,
        skipped_orders: skipped,
      }, null, 2));

      if (!isApplyMode) {
        await client.query('ROLLBACK');
        console.log('Dry run only; no database changes were made. Re-run with -- --apply to apply the listed corrections.');
      } else if (candidates.length === 0) {
        await client.query('ROLLBACK');
        console.log('No unambiguous corrections found; no database changes were made.');
      } else {
        await client.query(`
          CREATE TABLE IF NOT EXISTS order_shop_attribution_repairs (
            id BIGSERIAL PRIMARY KEY,
            run_id UUID NOT NULL,
            order_id INTEGER NOT NULL,
            previous_shop_id INTEGER NOT NULL,
            repaired_shop_id INTEGER NOT NULL,
            repaired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        for (const candidate of candidates) {
          const update = await client.query(
            'UPDATE orders SET shop_id = $1 WHERE id = $2 AND shop_id = $3',
            [candidate.expectedShopId, candidate.orderId, candidate.previousShopId],
          );
          if (update.rowCount !== 1) {
            throw new Error(`Order ${candidate.orderId} changed during repair; transaction aborted.`);
          }
          await client.query(
            `INSERT INTO order_shop_attribution_repairs (run_id, order_id, previous_shop_id, repaired_shop_id)
             VALUES ($1, $2, $3, $4)`,
            [runId, candidate.orderId, candidate.previousShopId, candidate.expectedShopId],
          );
        }

        await client.query('COMMIT');
        console.log(`Applied ${candidates.length} correction(s). Audit run: ${runId}`);
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runOrderShopAttributionRepair().catch((error: unknown) => {
    if (error instanceof Error && !('code' in error)) {
      console.error(error.message);
    } else {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'REPAIR_FAILED';
      console.error(`Order attribution repair failed (${code}); transaction rolled back.`);
    }
    process.exitCode = 1;
  });
}
