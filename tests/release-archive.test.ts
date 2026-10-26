import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

test('release archives exclude secrets, backups, local data, Git metadata, and generated caches', () => {
  const scriptPath = path.resolve('scripts/create-release-archive.py');
  const pythonCheck = `
import importlib.util
import sys

spec = importlib.util.spec_from_file_location("release_archive", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

excluded = [
    ".git/config",
    "src/.git/objects/secret",
    "backups/production.dump",
    "data/matable.db-wal",
    "scripts/__pycache__/archive.pyc",
    "scripts/archive.pyc",
    "scripts/.env.local",
    "private/merchant.key",
    "secrets/production.json",
    ".secrets/provider.env",
    ".aws/credentials",
    ".ssh/id_ed25519",
];
included = ["src/App.tsx", ".env.example", ".env.production.example", "data/.gitkeep"]
assert all(module.should_exclude(path) for path in excluded), excluded
assert not any(module.should_exclude(path) for path in included), included
`;

  const result = spawnSync('python3', ['-B', '-c', pythonCheck, scriptPath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message || 'Archive exclusion check failed.');
});
