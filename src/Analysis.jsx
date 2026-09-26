import { useMemo, useState } from 'react';
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Brush, ReferenceLine, PieChart, Pie, Cell } from 'recharts';
import { prepareTransactions, buildAnnualComparison, parseAmount, UNASSIGNED_PAYER } from './analysisData';
import './analysis.css';

const COLORS = ['#287cbe', '#c78632', '#8b5cf6', '#159778', '#dd6383', '#687581'];
const money = value => value == null ? '—' : `$${value.toLocaleString('zh-TW', { maximumFractionDigits: 2 })}`;
const percent = value => value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
const labels = { expense: '支出', income: '收入', balance: '結餘' };

export default function Analysis({ transactions = [], assets = [] }) {
  const [tab, setTab] = useState('transactions');
  const [metric, setMetric] = useState('expense');
  const [category, setCategory] = useState('');
  const [payer, setPayer] = useState('');
  const [month, setMonth] = useState(0);
  const [chosenYears, setChosenYears] = useState(null);
  const [chartView, setChartView] = useState('growth');
  const prepared = useMemo(() => prepareTransactions(transactions), [transactions]);
  const availableYears = useMemo(() => [...new Set([new Date().getFullYear(), ...prepared.valid.map(tx => tx.year)])].sort((a, b) => b - a), [prepared]);
  // Default to the newest recorded years, even when the imported file contains only history.
  const recordedYears = [...new Set(prepared.valid.map(tx => tx.year))].sort((a, b) => b - a);
  const years = chosenYears || (recordedYears.length ? recordedYears : availableYears.slice(0, 1));
  const categories = [...new Set(prepared.valid.filter(tx => metric === 'balance' || tx.type === metric).map(tx => tx.category))].sort();
  const payers = [...new Set(prepared.valid.map(tx => tx.payer).filter(Boolean))].sort();
  const comparison = useMemo(() => buildAnnualComparison(prepared.valid, { years, month, category, payer, metric }), [prepared, years, month, category, payer, metric]);
  const hasData = comparison.summaries.some(summary => summary.count > 0);
  const hasGrowth = comparison.points.some(point => point.growth !== null);
  const payerScope = prepared.valid.filter(tx => years.includes(tx.year) && (!month || tx.month === month)
    && (!category || tx.category === category) && (metric === 'balance' || tx.type === metric));
  const missingPayers = payerScope.filter(tx => !tx.payer).length;
  const toggleYear = year => setChosenYears(previous => {
    const current = previous || years;
    return current.includes(year) ? (current.length === 1 ? current : current.filter(y => y !== year)) : [...current, year].sort((a, b) => b - a);
  });

  return (
    <div className="analysis-page">
      <div className="analysis-heading"><div><span className="analysis-eyebrow">收支趨勢 · 年度比較</span><h2>看見每一年的變化</h2></div>
        <div className="analysis-segments" aria-label="分析內容">
          <button aria-pressed={tab === 'transactions'} onClick={() => setTab('transactions')}>收支走勢</button>
          <button aria-pressed={tab === 'assets'} onClick={() => setTab('assets')}>財產分布</button>
        </div>
      </div>
      {tab === 'assets' ? <AssetDistribution assets={assets} /> : <>
        <section className="card analysis-filters" aria-label="圖表篩選">
          <div className="analysis-filter-row">
            <label>比較指標<select value={metric} onChange={event => { setMetric(event.target.value); setCategory(''); }}>
              <option value="expense">支出</option><option value="income">收入</option><option value="balance">結餘（收入 − 支出）</option>
            </select></label>
            <label>分類<select value={category} onChange={event => setCategory(event.target.value)}><option value="">全部分類</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
            <label>時間範圍<select value={month} onChange={event => setMonth(Number(event.target.value))}><option value={0}>全年總和</option>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>各年度 {i + 1} 月總和</option>)}</select></label>
            <label>付款人<select value={payer} onChange={event => setPayer(event.target.value)}><option value="">全部付款人</option><option value={UNASSIGNED_PAYER}>未填付款人</option>{payers.map(value => <option key={value}>{value}</option>)}</select></label>
          </div>
          <fieldset className="analysis-years"><legend>比較年份（可複選）</legend>{availableYears.map(year => <label key={year}><input type="checkbox" checked={years.includes(year)} onChange={() => toggleYear(year)} />{year} 年</label>)}</fieldset>
          <p className="analysis-note">每年一個點，套用相同分類、月份與付款人條件。年增率與前一個日曆年度比較，即使未勾選去年仍會納入基準。當年度可能尚未記錄完整，不能直接視為全年成長。</p>
        </section>

        <details className="analysis-warning"><summary>付款人核對：{payer === UNASSIGNED_PAYER ? '未填付款人' : payer || '全部付款人'} · 符合 {comparison.summaries.reduce((sum, row) => sum + row.count, 0)} 筆</summary>
          <p>同名付款人的前後空白與全形字元已統一。不同名稱或 Emoji 仍視為不同付款人；不會自行推測是同一人。</p>
          <p>所選年份、分類與月份共有 {missingPayers} 筆未填付款人。選擇特定付款人時不會計入這些紀錄，可選「未填付款人」查看。</p>
          <p>若曾重新命名付款人，舊紀錄可能仍使用舊名稱。請展開下方原始紀錄核對；篩選不會改寫資料。</p>
        </details>

        {(prepared.invalid.length > 0 || prepared.duplicates.length > 0) && <details className="analysis-warning"><summary>資料核對：{prepared.invalid.length} 筆格式異常、{prepared.duplicates.length} 筆疑似重複</summary>
          <p>格式異常資料不納入計算；疑似重複仍計入，因同日同額也可能是不同筆消費。可到設定掃描重複紀錄。</p>
          {[...prepared.invalid.map(tx => ({ tx, reason: '日期、金額或收支類型異常' })), ...prepared.duplicates.map(tx => ({ tx, reason: '日期、類型、分類、內容、付款人與金額相同' }))].map(({ tx, reason }, i) => <p key={i}>{String(tx.date || '無日期')} · {String(tx.item || '無內容')} · {String(tx.amount)} — {reason}（ID：{tx.id || '無'}）</p>)}
        </details>}

        <div className="analysis-stats">{comparison.summaries.map((summary, index) => {
          return <section className="analysis-stat" key={summary.year} style={{ borderTopColor: COLORS[index % COLORS.length] }}>
            <span>{summary.year} 年{month ? ` ${month} 月` : ' 全年'} · {labels[metric]}</span><strong>{summary.count ? money(summary[metric]) : '無紀錄'}</strong>
            <small>{summary.count} 筆 · 年增率 {percent(summary.growth)}</small>
          </section>;
        })}</div>

        <section className="card analysis-chart-card">
          <div className="analysis-chart-heading"><div><h3>{category || '全部分類'} · 年度{labels[metric]}{chartView === 'growth' ? '增長率' : '總和'}</h3><p className="analysis-note">{month ? `每年 ${month} 月總和` : '每年全年總和'} · {payer === UNASSIGNED_PAYER ? '未填付款人' : payer || '全部付款人'}</p></div>
            <div className="analysis-segments"><button aria-pressed={chartView === 'growth'} onClick={() => setChartView('growth')}>年增率 %</button><button aria-pressed={chartView === 'total'} onClick={() => setChartView('total')}>年度總和</button></div>
          </div>
          {!hasData ? <div className="analysis-empty">所選條件沒有紀錄，請調整年份、分類或月份。</div> : <div className="analysis-chart">
            <ResponsiveContainer width="100%" height={380}>
              <LineChart key={`${years.join('-')}-${month}-${metric}-${category}-${payer}-${chartView}`} data={comparison.points} margin={{ top: 18, right: 16, bottom: 8, left: 0 }} accessibilityLayer>
                <CartesianGrid stroke="#e8edf0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} minTickGap={18} />
                <YAxis width={72} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={value => chartView === 'growth' ? `${+value.toFixed(1)}%` : Math.abs(value) >= 10000 ? `${+(value / 10000).toFixed(1)}萬` : value.toLocaleString()} />
                <Tooltip formatter={(value, name) => [chartView === 'growth' ? percent(value) : money(value), name]} cursor={{ stroke: '#9aabb7', strokeDasharray: '4 4' }} contentStyle={{ borderRadius: 12, border: '1px solid #e8edf0' }} />
                <Legend />
                <ReferenceLine y={0} stroke="#aebbc4" />
                <Line name={chartView === 'growth' ? '年增率' : `年度${labels[metric]}總和`} dataKey={chartView === 'growth' ? 'growth' : 'total'} type="linear" stroke={COLORS[0]} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls={false} isAnimationActive={false} />
                <Brush dataKey="name" height={25} stroke="#9aabb7" travellerWidth={10} />
              </LineChart>
            </ResponsiveContainer>
          </div>}
          {hasData && chartView === 'growth' && !hasGrowth && <p className="analysis-note">目前沒有可計算的年增率：需有前一年度同條件的紀錄，且前一年總額大於 0。可切換「年度總和」查看金額。</p>}
          <p className="analysis-note">年增率＝（本年總額 − 去年總額）÷ 去年總額 × 100%。無紀錄、去年為 0 或負值時顯示「—」，不當作 0%。拖曳下方可縮放年份區間。</p>
        </section>

        <section className="card"><h3>年度收支核對</h3><p className="analysis-note">同一組分類與付款人條件下，分開列出收入、支出及結餘。</p>
          <div className="analysis-table-scroll"><table className="analysis-table"><thead><tr><th>年度</th><th>收入</th><th>支出</th><th>結餘</th><th>年增率</th><th>圖表筆數</th></tr></thead><tbody>{comparison.summaries.map(summary => <tr key={summary.year}><th>{summary.year}</th><td>{money(summary.income)}</td><td>{money(summary.expense)}</td><td>{money(summary.balance)}</td><td>{percent(summary.growth)}</td><td>{summary.count}</td></tr>)}</tbody></table></div>
        </section>
        <details className="card analysis-details"><summary>展開圖表數值與原始紀錄</summary>
          <div className="analysis-table-scroll"><table className="analysis-table"><caption>年度{labels[metric]}總和與增長率</caption><thead><tr><th>年度</th><th>總和</th><th>前一年同條件總和</th><th>年增率</th></tr></thead><tbody>{comparison.points.map(point => <tr key={point.year}><th>{point.name}</th><td>{money(point.total)}</td><td>{money(point.previousTotal)}</td><td>{percent(point.growth)}</td></tr>)}</tbody></table></div>
          {comparison.summaries.map(summary => <details key={summary.year}><summary>{summary.year} 年 · {summary.count} 筆紀錄</summary><div className="analysis-table-scroll"><table className="analysis-table"><thead><tr><th>日期</th><th>類型</th><th>分類／內容</th><th>付款人</th><th>金額</th></tr></thead><tbody>{summary.rows.map((tx, i) => <tr key={tx.id || i}><td>{tx.date}</td><td>{labels[tx.type]}</td><td>{tx.category}<br />{tx.item}</td><td>{tx.payer || '—'}</td><td>{money(tx.amount)}</td></tr>)}</tbody></table></div></details>)}
        </details>
      </>}
    </div>
  );
}

function AssetDistribution({ assets }) {
  const [holder, setHolder] = useState('');
  const holders = [...new Set(assets.map(asset => asset.holder || asset.depositor).filter(Boolean))];
  const data = ['股票', '活期存款', '定期存款'].map(name => ({ name, value: 0 }));
  const number = value => parseAmount(value) || 0;
  assets.filter(asset => !holder || (asset.holder || asset.depositor) === holder).forEach(asset => {
    if (asset.type === 'stock') data[0].value += number(asset.shares) * (number(asset.refPrice) || number(asset.cost));
    if (asset.type === 'demand') data[1].value += number(asset.amount);
    if (asset.type === 'fixed') {
      let months = number(asset.durationMonths);
      if (!months && asset.startDate && asset.endDate) {
        const start = new Date(asset.startDate), end = new Date(asset.endDate);
        months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
      }
      data[2].value += number(asset.amount) * (asset.fixedType === '零存整付' && months > 0 ? months * (1 + number(asset.renewalCount)) : 1);
    }
  });
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return <section className="card"><div className="analysis-chart-heading"><h3>財產分布</h3><label>持有人 <select value={holder} onChange={event => setHolder(event.target.value)}><option value="">全部</option>{holders.map(value => <option key={value}>{value}</option>)}</select></label></div>
    <p className="analysis-note">股票採參考現價，無現價時採成本；定存採本金，零存整付計算方式與資產頁一致。</p>
    {total > 0 ? <ResponsiveContainer width="100%" height={300}><PieChart><Pie data={data.filter(item => item.value > 0)} dataKey="value" nameKey="name" innerRadius={65} outerRadius={95}>{data.filter(item => item.value > 0).map(item => <Cell key={item.name} fill={COLORS[data.indexOf(item)]} />)}</Pie><Tooltip formatter={money} /><Legend /></PieChart></ResponsiveContainer> : <div className="analysis-empty">尚無財產紀錄</div>}
    <table className="analysis-table"><thead><tr><th>類型</th><th>金額</th><th>比例</th></tr></thead><tbody>{data.map(item => <tr key={item.name}><th>{item.name}</th><td>{money(item.value)}</td><td>{total ? (item.value / total * 100).toFixed(1) : 0}%</td></tr>)}</tbody><tfoot><tr><th>總計</th><td>{money(total)}</td><td>{total > 0 ? '100%' : '—'}</td></tr></tfoot></table>
  </section>;
}
