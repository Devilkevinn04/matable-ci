import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createTickFormatter, fillDailyRows, niceTicks, groupOrdersByStatus, periodStart, pickTrendShape, sampleSeries, summarizePoints, toDailyPoints, toMonthlyPoints } from '../src/utils/chartData.ts';

const plain = (value: string) => value.replace(/[  ]/g, ' ');

test('les points quotidiens gardent la date de la donnée', () => {
  const [point] = toDailyPoints([{ date: '2026-11-01', orders: 3 }], (row) => row.orders);
  assert.equal(point.id, '2026-11-01');
  assert.equal(point.value, 3);
  assert.match(plain(point.label), /^1 nov/);
  assert.match(plain(point.longLabel), /dimanche 1 novembre 2026/);
  assert.equal(toMonthlyPoints([{ month: '2026-11', label: 'nov.', n: 1 }], (row) => row.n)[0].longLabel, 'novembre 2026');
});

test('le résumé donne le total et le premier pic, et rien quand tout est à zéro', () => {
  const points = toDailyPoints([{ date: '2026-11-01', v: 2 }, { date: '2026-11-02', v: 5 }, { date: '2026-11-03', v: 5 }], (row) => row.v);
  const summary = summarizePoints(points);
  assert.equal(summary.total, 12);
  assert.equal(summary.peak?.id, '2026-11-02');
  assert.equal(summarizePoints(toDailyPoints([{ date: '2026-11-01', v: 0 }], (row) => row.v)).peak, null);
  assert.equal(summarizePoints([]).peak, null);
});

test('les graduations restent courtes et la forme suit le nombre de points', () => {
  assert.equal(plain(createTickFormatter(6000)(1500)), '1 500');
  assert.deepEqual([0, 7000, 14000].map(createTickFormatter(14000)).map(plain), ['0', '7 k', '14 k']);
  assert.deepEqual(niceTicks(1), [0, 1]);
  assert.deepEqual(niceTicks(14), [0, 5, 10, 15]);
  assert.deepEqual(niceTicks(2800), [0, 1000, 2000, 3000]);
  assert.deepEqual(niceTicks(45000), [0, 20000, 40000, 60000]);
  assert.equal(pickTrendShape(31), 'bars');
  assert.equal(pickTrendShape(90), 'area');
});

test('chaque commande compte une fois dans la répartition', () => {
  const statuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'rejected', 'expired'];
  const segments = groupOrdersByStatus(statuses.map((status) => ({ status })));
  assert.deepEqual(segments.map((segment) => segment.value), [1, 3, 1, 3]);
  assert.equal(segments.reduce((sum, segment) => sum + segment.value, 0), statuses.length);
});

test('une longue série garde son premier et son dernier point', () => {
  const series = Array.from({ length: 90 }, (_, index) => index);
  const sampled = sampleSeries(series);
  assert.equal(sampled.length, 12);
  assert.equal(sampled[0], 0);
  assert.equal(sampled.at(-1), 89);
});

test('les jours sans activité apparaissent à zéro, sans perdre une ligne hors période', () => {
  const rows = [{ date: '2026-10-30', v: 4 }, { date: '2026-11-02', v: 2 }];
  const empty = (date: string) => ({ date, v: 0 });
  assert.deepEqual(fillDailyRows(rows, '2026-11-01', '2026-11-03', empty).map((row) => `${row.date}:${row.v}`), ['2026-10-30:4', '2026-10-31:0', '2026-11-01:0', '2026-11-02:2', '2026-11-03:0']);
  assert.equal(fillDailyRows([], '2026-11-01', '2026-11-07', empty).length, 7);
  assert.equal(periodStart(7, Date.parse('2026-11-22T23:30:00Z')), '2026-11-16');
  assert.equal(periodStart(1, Date.parse('2026-11-22T00:10:00Z')), '2026-11-22');
});

test('Recharts reste dans un seul fichier, chargé à la demande', () => {
  const root = path.resolve(import.meta.dirname, '../src');
  const files = (fs.readdirSync(root, { recursive: true }) as string[]).filter((file) => /\.tsx?$/.test(file));
  const importers = files.filter((file) => /from 'recharts'/.test(fs.readFileSync(path.join(root, file), 'utf8')));
  assert.deepEqual(importers.map((file) => path.basename(file)), ['TrendPlot.tsx']);
  const direct = files.filter((file) => /^import .*TrendPlot'/m.test(fs.readFileSync(path.join(root, file), 'utf8')));
  assert.deepEqual(direct, []);
});
