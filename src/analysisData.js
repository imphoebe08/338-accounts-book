// Date-only ledger values must not shift with the browser's timezone.
export function parseLedgerDate(value) {
  const match = typeof value === 'string' && value.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== m || date.getUTCDate() !== d) return null;
  return { year: y, month: m, day: d };
}

export function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/^(?:NT\$|TWD|\$)\s*/i, '');
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) return null;
  const amount = Number(text.replaceAll(',', ''));
  return Number.isFinite(amount) ? amount : null;
}

export const UNASSIGNED_PAYER = '__unassigned_payer__';

export function normalizePayer(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ') : '';
}

export function prepareTransactions(transactions) {
  const valid = [], invalid = [], duplicates = [];
  const seen = new Set();
  for (const tx of transactions) {
    const parts = parseLedgerDate(tx.date);
    const amount = parseAmount(tx.amount);
    const cents = amount === null ? NaN : Math.round(Math.abs(amount) * 100);
    if (!parts || !Number.isSafeInteger(cents) || !['income', 'expense'].includes(tx.type)) {
      invalid.push(tx);
      continue;
    }
    const category = tx.category || '未分類';
    const payer = normalizePayer(tx.payer);
    const key = JSON.stringify([parts.year, parts.month, parts.day, tx.type, category, tx.item || '', payer, cents]);
    if (seen.has(key)) duplicates.push(tx);
    seen.add(key);
    valid.push({ ...tx, ...parts, amount: cents / 100, cents, category, payer });
  }
  return { valid, invalid, duplicates };
}

export function buildComparison(transactions, { years, month = 0, category = '', payer = '', metric = 'expense', cumulative = false }) {
  const selected = transactions.filter(tx => years.includes(tx.year) && (!month || tx.month === month)
    && (!category || tx.category === category) && (!payer || (payer === UNASSIGNED_PAYER ? !tx.payer : tx.payer === normalizePayer(payer))));
  const size = month ? Math.max(...years.map(year => new Date(Date.UTC(year, month, 0)).getUTCDate())) : 12;
  const points = Array.from({ length: size }, (_, i) => ({ name: `${i + 1}${month ? '日' : '月'}` }));
  const summaries = years.map(year => {
    const rows = selected.filter(tx => tx.year === year);
    const totals = rows.reduce((acc, tx) => { acc[tx.type] += tx.cents; return acc; }, { income: 0, expense: 0 });
    const relevant = rows.filter(tx => metric === 'balance' || tx.type === metric);
    const buckets = Array(size).fill(0);
    relevant.forEach(tx => { buckets[(month ? tx.day : tx.month) - 1] += metric === 'balance' && tx.type === 'expense' ? -tx.cents : tx.cents; });
    let running = 0;
    const days = month ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 12;
    points.forEach((point, index) => {
      running += buckets[index];
      point[`y${year}`] = index >= days || relevant.length === 0 ? null : (cumulative ? running : buckets[index]) / 100;
    });
    return { year, income: totals.income / 100, expense: totals.expense / 100,
      balance: (totals.income - totals.expense) / 100, count: relevant.length,
      rows: relevant.sort((a, b) => b.month - a.month || b.day - a.day) };
  });
  return { points, summaries };
}

// Annual totals and YoY use the same filters, including an unselected prior year.
export function buildAnnualComparison(transactions, { years, month = 0, category = '', payer = '', metric = 'expense' }) {
  const baselineYears = [...new Set(years.flatMap(year => [year, year - 1]))];
  const { summaries } = buildComparison(transactions, { years: baselineYears, month, category, payer, metric });
  const annual = [...years].sort((a, b) => a - b).map(year => {
    const summary = summaries.find(item => item.year === year);
    const previous = summaries.find(item => item.year === year - 1);
    const total = summary.count ? summary[metric] : null;
    const previousTotal = previous?.count ? previous[metric] : null;
    const growth = total !== null && previousTotal > 0 ? (total - previousTotal) / previousTotal * 100 : null;
    return { ...summary, name: `${year} 年`, total, previousTotal, growth };
  });
  return { points: annual, summaries: annual };
}
