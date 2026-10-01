import { dbGet } from '../../db.ts';

export type RecordEntity = 'shops' | 'products' | 'orders';

export async function allocateRecordId(entity: RecordEntity): Promise<number> {
  const row = await dbGet<{ id: number }>(`
    INSERT INTO id_allocators (name, last_id)
    SELECT ?, COALESCE(MAX(id), 0) + 1 FROM ${entity} WHERE TRUE
    ON CONFLICT(name) DO UPDATE SET last_id = id_allocators.last_id + 1
    RETURNING last_id AS id
  `, [entity]);
  if (!row) throw new Error(`Impossible d’allouer un identifiant pour ${entity}.`);
  return Number(row.id);
}