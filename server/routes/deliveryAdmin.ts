import { Router } from 'express';

interface DeliveryAdminRouterOptions {
  dbAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  dbGet: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | undefined>;
  dbRun: (sql: string, params?: unknown[]) => Promise<{ changes: number; lastInsertRowid?: number }>;
  dbTransaction: <T>(operation: (transaction: {
    get: <Row = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<Row | undefined>;
    all: <Row = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<Row[]>;
    run: (sql: string, params?: unknown[]) => Promise<{ changes: number; lastInsertRowid?: number }>;
  }) => Promise<T>) => Promise<T>;
  testMode: boolean;
}

interface DeliveryZoneRow {
  id: number | string;
  label: string;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

interface DeliveryTariffRow {
  id: number | string;
  origin_zone_id: number | string;
  destination_zone_id: number | string;
  origin_label: string;
  destination_label: string;
  amount: number;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function toActive(value: number | boolean): boolean {
  return value === true || value === 1;
}

function toSafeId(value: number | string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid delivery configuration identifier returned by the database.');
  return id;
}

export function normalizeDeliveryConfiguration(zones: DeliveryZoneRow[], tariffs: DeliveryTariffRow[]) {
  return {
    zones: zones.map((zone) => ({
      ...zone,
      id: toSafeId(zone.id),
      is_active: toActive(zone.is_active),
    })),
    tariffs: tariffs.map((tariff) => ({
      ...tariff,
      id: toSafeId(tariff.id),
      origin_zone_id: toSafeId(tariff.origin_zone_id),
      destination_zone_id: toSafeId(tariff.destination_zone_id),
      is_active: toActive(tariff.is_active),
    })),
  };
}

export function createDeliveryAdminRouter({ dbAll, dbGet, dbRun, dbTransaction, testMode }: DeliveryAdminRouterOptions) {
  const router = Router();

  const loadConfiguration = async () => {
    const [zones, tariffs] = await Promise.all([
      dbAll<DeliveryZoneRow>('SELECT * FROM delivery_zones ORDER BY label, id'),
      dbAll<DeliveryTariffRow>(`
        SELECT tariffs.*, origin.label AS origin_label, destination.label AS destination_label
        FROM delivery_zone_tariffs AS tariffs
        JOIN delivery_zones AS origin ON origin.id = tariffs.origin_zone_id
        JOIN delivery_zones AS destination ON destination.id = tariffs.destination_zone_id
        ORDER BY origin.label, destination.label
      `),
    ]);
    return normalizeDeliveryConfiguration(zones, tariffs);
  };

  const writeAuditLog = async (req: { adminRole?: string }, action: string, details: object) => {
    await dbRun(
      'INSERT INTO admin_audit_logs (actor, action, shop_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
      [req.adminRole || 'super_admin', action, null, JSON.stringify(details), new Date().toISOString()],
    );
  };

  router.get('/configuration', async (_req, res) => {
    return res.json(await loadConfiguration());
  });

  router.post('/zones', async (req, res) => {
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    if (label.length < 2 || label.length > 80) {
      return res.status(400).json({ error: 'Le nom de la zone doit contenir entre 2 et 80 caractères.' });
    }
    const duplicate = await dbGet<{ id: number }>(
      'SELECT id FROM delivery_zones WHERE LOWER(label) = LOWER(?)',
      [label],
    );
    if (duplicate) return res.status(409).json({ error: 'Cette zone existe déjà.' });

    const now = new Date().toISOString();
    const inserted = await dbRun(
      'INSERT INTO delivery_zones (label, is_active, created_at, updated_at) VALUES (?, 1, ?, ?)',
      [label, now, now],
    );
    await writeAuditLog(req, 'delivery_zone_created', { zone_id: inserted.lastInsertRowid, label });
    return res.status(201).json(await loadConfiguration());
  });

  router.patch('/zones/:id', async (req, res) => {
    const zoneId = Number(req.params.id);
    if (!isPositiveSafeInteger(zoneId)) return res.status(400).json({ error: 'Identifiant de zone invalide.' });

    const current = await dbGet<DeliveryZoneRow>('SELECT * FROM delivery_zones WHERE id = ?', [zoneId]);
    if (!current) return res.status(404).json({ error: 'Zone introuvable.' });

    const hasLabel = Object.hasOwn(req.body || {}, 'label');
    const hasActive = Object.hasOwn(req.body || {}, 'is_active');
    if (!hasLabel && !hasActive) return res.status(400).json({ error: 'Aucune modification à enregistrer.' });

    let label = current.label;
    if (hasLabel) {
      if (typeof req.body.label !== 'string' || req.body.label.trim().length < 2 || req.body.label.trim().length > 80) {
        return res.status(400).json({ error: 'Le nom de la zone doit contenir entre 2 et 80 caractères.' });
      }
      label = req.body.label.trim();
      const duplicate = await dbGet<{ id: number }>(
        'SELECT id FROM delivery_zones WHERE LOWER(label) = LOWER(?) AND id <> ?',
        [label, zoneId],
      );
      if (duplicate) return res.status(409).json({ error: 'Cette zone existe déjà.' });
    }

    if (hasActive && typeof req.body.is_active !== 'boolean') {
      return res.status(400).json({ error: 'Le statut de la zone est invalide.' });
    }
    const active = hasActive ? req.body.is_active : toActive(current.is_active);
    await dbRun(
      'UPDATE delivery_zones SET label = ?, is_active = ?, updated_at = ? WHERE id = ?',
      [label, active ? 1 : 0, new Date().toISOString(), zoneId],
    );
    await writeAuditLog(req, 'delivery_zone_updated', {
      zone_id: zoneId,
      previous_label: current.label,
      label,
      is_active: active,
    });
    return res.json(await loadConfiguration());
  });

  router.put('/tariffs', async (req, res) => {
    const originZoneId = req.body?.origin_zone_id;
    const destinationZoneId = req.body?.destination_zone_id;
    const amount = req.body?.amount;
    if (!isPositiveSafeInteger(originZoneId) || !isPositiveSafeInteger(destinationZoneId)
      || !isPositiveSafeInteger(amount) || amount > 1_000_000) {
      return res.status(400).json({ error: 'Les zones et le tarif doivent être des identifiants valides et un montant de 1 à 1 000 000 FCFA.' });
    }
    const zones = await dbAll<{ id: number; label: string }>(
      'SELECT id, label FROM delivery_zones WHERE id IN (?, ?) AND is_active = 1',
      [originZoneId, destinationZoneId],
    );
    if (zones.length !== new Set([originZoneId, destinationZoneId]).size) {
      return res.status(409).json({ error: 'Activez les deux zones avant de configurer leur tarif.' });
    }

    const now = new Date().toISOString();
    await dbRun(`INSERT INTO delivery_zone_tariffs
        (origin_zone_id, destination_zone_id, amount, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT (origin_zone_id, destination_zone_id) DO UPDATE SET
        amount = excluded.amount, is_active = 1, updated_at = excluded.updated_at`,
    [originZoneId, destinationZoneId, amount, now, now]);
    await writeAuditLog(req, 'delivery_zone_tariff_updated', {
      origin_zone_id: originZoneId,
      destination_zone_id: destinationZoneId,
      amount,
    });
    return res.json(await loadConfiguration());
  });

  router.patch('/tariffs/:id', async (req, res) => {
    const tariffId = Number(req.params.id);
    if (!isPositiveSafeInteger(tariffId)) return res.status(400).json({ error: 'Identifiant de tarif invalide.' });
    if (typeof req.body?.is_active !== 'boolean') {
      return res.status(400).json({ error: 'Le statut du tarif est invalide.' });
    }
    const current = await dbGet<{ id: number; origin_zone_id: number; destination_zone_id: number }>(
      'SELECT id, origin_zone_id, destination_zone_id FROM delivery_zone_tariffs WHERE id = ?',
      [tariffId],
    );
    if (!current) return res.status(404).json({ error: 'Tarif introuvable.' });
    if (req.body.is_active) {
      const activeZones = await dbAll<{ id: number }>(
        'SELECT id FROM delivery_zones WHERE id IN (?, ?) AND is_active = 1',
        [current.origin_zone_id, current.destination_zone_id],
      );
      if (activeZones.length !== new Set([current.origin_zone_id, current.destination_zone_id]).size) {
        return res.status(409).json({ error: 'Activez les deux zones avant de réactiver ce tarif.' });
      }
    }
    await dbRun(
      'UPDATE delivery_zone_tariffs SET is_active = ?, updated_at = ? WHERE id = ?',
      [req.body.is_active ? 1 : 0, new Date().toISOString(), tariffId],
    );
    await writeAuditLog(req, 'delivery_zone_tariff_status_updated', {
      tariff_id: tariffId,
      is_active: req.body.is_active,
    });
    return res.json(await loadConfiguration());
  });

  if (testMode) {
    router.get('/drivers', async (_req, res) => {
      const rows = await dbAll<{
        id: number | string;
        name: string;
        phone: string;
        status: string;
        access_expires_at: string | null;
        zone_id: number | string | null;
        zone_label: string | null;
      }>(`
        SELECT drivers.id, drivers.name, drivers.phone, drivers.status, drivers.access_expires_at,
          zones.id AS zone_id, zones.label AS zone_label
        FROM delivery_drivers AS drivers
        LEFT JOIN delivery_driver_zones AS driver_zones ON driver_zones.driver_id = drivers.id
        LEFT JOIN delivery_zones AS zones ON zones.id = driver_zones.zone_id
        ORDER BY drivers.created_at DESC, drivers.id DESC, zones.label
      `);
      const drivers = new Map<number, {
        id: number;
        name: string;
        phone: string;
        status: string;
        access_expires_at: string | null;
        zone_ids: number[];
        zones: string[];
      }>();
      for (const row of rows) {
        const id = toSafeId(row.id);
        let driver = drivers.get(id);
        if (!driver) {
          driver = {
            id,
            name: row.name,
            phone: row.phone,
            status: row.status,
            access_expires_at: row.access_expires_at,
            zone_ids: [],
            zones: [],
          };
          drivers.set(id, driver);
        }
        if (row.zone_id !== null && row.zone_label) {
          driver.zone_ids.push(toSafeId(row.zone_id));
          driver.zones.push(row.zone_label);
        }
      }
      return res.json({ drivers: [...drivers.values()] });
    });

    router.patch('/drivers/:id', async (req, res) => {
      const driverId = Number(req.params.id);
      if (!isPositiveSafeInteger(driverId)) return res.status(400).json({ error: 'Identifiant de livreur invalide.' });
      const hasStatus = Object.hasOwn(req.body || {}, 'status');
      const hasZones = Object.hasOwn(req.body || {}, 'zone_ids');
      if (!hasStatus && !hasZones) return res.status(400).json({ error: 'Aucune modification à enregistrer.' });

      const status = req.body?.status;
      if (hasStatus && !['pending', 'active', 'suspended'].includes(status)) {
        return res.status(400).json({ error: 'Statut de livreur invalide.' });
      }
      const zoneIds = req.body?.zone_ids;
      if (hasZones && (!Array.isArray(zoneIds) || zoneIds.length > 30
        || zoneIds.some((id: unknown) => !isPositiveSafeInteger(id)))) {
        return res.status(400).json({ error: 'La sélection de zones attribuées est invalide.' });
      }
      const selectedZones: number[] = hasZones ? [...new Set<number>(zoneIds)] : [];
      if (hasZones && selectedZones.length > 0) {
        const activeZones = await dbAll<{ id: number | string }>(
          `SELECT id FROM delivery_zones WHERE is_active = 1 AND id IN (${selectedZones.map(() => '?').join(',')})`,
          selectedZones,
        );
        if (activeZones.length !== selectedZones.length) {
          return res.status(400).json({ error: 'Toutes les zones attribuées doivent exister et être actives.' });
        }
      }

      const current = await dbGet<{ id: number | string; status: string }>(
        'SELECT id, status FROM delivery_drivers WHERE id = ?',
        [driverId],
      );
      if (!current) return res.status(404).json({ error: 'Livreur introuvable.' });
      const now = new Date().toISOString();
      await dbTransaction(async (transaction) => {
        if (hasStatus) {
          await transaction.run('UPDATE delivery_drivers SET status = ?, updated_at = ? WHERE id = ?', [status, now, driverId]);
        }
        if (hasZones) {
          await transaction.run('DELETE FROM delivery_driver_zones WHERE driver_id = ?', [driverId]);
          for (const zoneId of selectedZones) {
            await transaction.run(`INSERT INTO delivery_driver_zones
              (driver_id, zone_id, is_active, assigned_at) VALUES (?, ?, 0, ?)`,
            [driverId, zoneId, now]);
          }
        }
      });
      await writeAuditLog(req, 'delivery_driver_updated', {
        driver_id: driverId,
        previous_status: current.status,
        status: hasStatus ? status : current.status,
        zone_ids: hasZones ? selectedZones : undefined,
      });
      return res.json({ success: true });
    });

    router.get('/shop-origins', async (_req, res) => {
      const origins = await dbAll<{
        shop_id: number | string;
        shop_name: string;
        city: string | null;
        zone_id: number | string | null;
        zone_label: string | null;
      }>(`
        SELECT shops.id AS shop_id, shops.name AS shop_name, shops.city,
          zones.id AS zone_id, zones.label AS zone_label
        FROM shops
        LEFT JOIN delivery_shop_origins AS origins ON origins.shop_id = shops.id
        LEFT JOIN delivery_zones AS zones ON zones.id = origins.zone_id
        WHERE shops.is_active = 1
        ORDER BY shops.name
      `);
      return res.json({ shops: origins.map((origin) => ({
        shop_id: toSafeId(origin.shop_id),
        shop_name: origin.shop_name,
        city: origin.city,
        zone_id: origin.zone_id === null ? null : toSafeId(origin.zone_id),
        zone_label: origin.zone_label,
      })) });
    });

    router.put('/shop-origins/:shopId', async (req, res) => {
      const shopId = Number(req.params.shopId);
      const zoneId = req.body?.zone_id;
      if (!isPositiveSafeInteger(shopId) || !isPositiveSafeInteger(zoneId)) {
        return res.status(400).json({ error: 'Boutique ou zone invalide.' });
      }
      const shop = await dbGet<{ id: number }>('SELECT id FROM shops WHERE id = ? AND is_active = 1', [shopId]);
      if (!shop) return res.status(404).json({ error: 'Boutique active introuvable.' });
      const zone = await dbGet<{ id: number; label: string }>(
        'SELECT id, label FROM delivery_zones WHERE id = ? AND is_active = 1',
        [zoneId],
      );
      if (!zone) return res.status(400).json({ error: 'La zone de retrait doit être active.' });
      const now = new Date().toISOString();
      await dbRun(`INSERT INTO delivery_shop_origins (shop_id, zone_id, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(shop_id) DO UPDATE SET zone_id = excluded.zone_id, updated_at = excluded.updated_at`,
      [shopId, zoneId, now]);
      await writeAuditLog(req, 'delivery_shop_origin_updated', {
        shop_id: shopId,
        zone_id: zoneId,
        zone_label: zone.label,
      });
      return res.json({ success: true, shop_id: shopId, zone_id: zoneId, zone_label: zone.label });
    });
  }

  return router;
}
