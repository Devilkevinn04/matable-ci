import { pathToFileURL } from 'node:url';
import { closeDatabase, databaseMode, dbAll, dbTransaction, initializeDatabase } from '../db.ts';
import { importLegacyLoyalty, type LegacyImportResult } from '../server/services/loyaltyLegacy.ts';

class DryRun extends Error {}

/** Toutes les boutiques dans une seule transaction : un seul écart annule tout. Sans `apply`, rien n’est enregistré. */
export async function migrateLoyalty(apply: boolean): Promise<LegacyImportResult[]> {
  const shops = await dbAll<{ shop_id: number | string }>(
    `SELECT shop_id FROM orders WHERE status = 'delivered' AND customer_user_id IS NOT NULL
     UNION SELECT shop_id FROM customer_loyalty_redemptions ORDER BY shop_id`,
  );
  const now = new Date().toISOString();
  const results: LegacyImportResult[] = [];
  try {
    await dbTransaction(async (tx) => {
      for (const shop of shops) results.push(await importLegacyLoyalty(tx, Number(shop.shop_id), now));
      if (!apply) throw new DryRun();
    });
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply');
  try {
    await initializeDatabase();
    const results = await migrateLoyalty(apply);
    for (const result of results) {
      console.log(`Boutique ${result.shopId} : ${result.skipped ? 'déjà en points, ignorée' : `${result.customers} client(s), ${result.orders} commande(s) et ${result.redemptions} récompense(s) reprises, soldes vérifiés`}`);
    }
    console.log(apply ? `Reprise enregistrée (${databaseMode}).` : `Simulation terminée (${databaseMode}) : rien n’a été enregistré. Ajoutez --apply pour l’appliquer.`);
  } catch (error) {
    console.error('Reprise annulée, rien n’a été enregistré.', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}
