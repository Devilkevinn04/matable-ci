import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runLoyaltyApiScenarios } from './helpers/loyaltyApiScenarios.ts';
import { runLoyaltyScenarios } from './helpers/loyaltyScenarios.ts';

test('moteur de fidélité sur SQLite', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'matable-loyalty-'));
  process.env.NODE_ENV = 'test';
  process.env.MATABLE_DB_PATH = path.join(directory, 'loyalty.db');
  const database = await import('../db.ts');
  try {
    await database.initializeDatabase();
    await runLoyaltyScenarios(t, database, await import('../server/services/loyaltyEngine.ts'));
    await runLoyaltyApiScenarios(t, database);
  } finally {
    database.closeDatabase();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
