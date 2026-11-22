import test from 'node:test';
import { runLoyaltyApiScenarios } from './helpers/loyaltyApiScenarios.ts';
import { runLoyaltyScenarios } from './helpers/loyaltyScenarios.ts';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
if (!hasDatabaseUrl && process.env.REQUIRE_POSTGRES_TESTS === '1') {
  throw new Error('DATABASE_URL is required for PostgreSQL integration tests.');
}

// Écrit des boutiques et des clients de test : réservé à une base dédiée.
test('moteur de fidélité sur PostgreSQL', { skip: !hasDatabaseUrl || process.env.REQUIRE_POSTGRES_TESTS !== '1' }, async (t) => {
  process.env.NODE_ENV = 'production';
  const database = await import('../db.ts');
  try {
    await database.initializeDatabase();
    await runLoyaltyScenarios(t, database, await import('../server/services/loyaltyEngine.ts'));
    await runLoyaltyApiScenarios(t, database);
  } finally {
    await database.closeDatabase();
  }
});
