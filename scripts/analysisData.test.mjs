import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTransactions, buildComparison, parseLedgerDate } from '../src/analysisData.js';

const tx = (date, amount, type = 'expense', category = '飲食', payer = '自己') => ({ date, amount, type, category, payer });
const build = (rows, options = {}) => buildComparison(prepareTransactions(rows).valid, { years: [2024, 2023], ...options });

test('numeric strings, currency, decimals and signed ledger values are normalized before summing', () => {
  const data = build([tx('2024-01-01', '1,200'), tx('2024-01-02', 'NT$ 30.25'), tx('2024-01-03', -10), tx('2024-01-04', 0.1), tx('2024-01-05', 0.2)]);
  assert.equal(data.summaries[0].expense, 1240.55);
  assert.equal(data.points[0].y2024, 1240.55);
});

test('dates are validated without timezone rollover; malformed values are reported', () => {
  assert.deepEqual(parseLedgerDate('2024-01-01'), { year: 2024, month: 1, day: 1 });
  assert.equal(parseLedgerDate('2023-02-29'), null);
  const result = prepareTransactions([tx('2024-02-30', 10), tx('2024-01-01', 'bad'), tx('2024-01-01', ''), tx('2024-01-01', 10, 'unknown'), tx('2024-02-29', 50)]);
  assert.equal(result.valid.length, 1);
  assert.equal(result.invalid.length, 4);
});

test('same category, payer and month filters apply across years', () => {
  const data = build([tx('2024-02-01', 100), tx('2023-02-01', 80), tx('2024-01-01', 999), tx('2024-02-01', 777, 'expense', '交通'), tx('2024-02-01', 555, 'expense', '飲食', '別人')], { month: 2, category: '飲食', payer: '自己' });
  assert.equal(data.summaries[0].expense, 100);
  assert.equal(data.summaries[1].expense, 80);
  assert.equal(data.points[0].y2024, 100);
  assert.equal(data.points[0].y2023, 80);
});

test('income, expense and net balance stay distinct, with exact cumulative totals', () => {
  const rows = [tx('2024-01-01', 1000, 'income'), tx('2024-01-02', 300), tx('2024-02-01', 900)];
  assert.equal(build(rows, { metric: 'income' }).points[0].y2024, 1000);
  assert.equal(build(rows, { metric: 'expense' }).points[0].y2024, 300);
  const data = build(rows, { metric: 'balance', cumulative: true });
  assert.equal(data.points[0].y2024, 700);
  assert.equal(data.points[1].y2024, -200);
  assert.equal(data.points[11].y2024, data.summaries[0].balance);
});

test('leap days and completely absent years are gaps; recorded periods without activity are zero', () => {
  const data = build([tx('2024-02-29', 20), tx('2023-02-01', 10)], { month: 2 });
  assert.equal(data.points.length, 29);
  assert.equal(data.points[28].y2023, null);
  assert.equal(data.points[28].y2024, 20);
  assert.equal(data.points[1].y2023, 0);
  assert.ok(build([tx('2024-01-01', 10)]).points.every(point => point.y2023 === null));
});

test('possible duplicates are reported without silently deleting legitimate transactions', () => {
  const result = prepareTransactions([tx('2024-01-01', 10), tx('2024-01-01', '10'), tx('2024-01-01', 10, 'income')]);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.valid.length, 3);
  assert.equal(buildComparison(result.valid, { years: [2024] }).summaries[0].expense, 20);
});
