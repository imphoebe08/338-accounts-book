import { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

const COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', 
  '#ec4899', '#14b8a6', '#f43f5e', '#0ea5e9', '#84cc16', 
  '#eab308', '#d946ef', '#6366f1', '#64748b', '#78716c',
  '#06b6d4', '#f97316', '#22c55e', '#a855f7', '#fb923c'
];

// 客製化圓餅圖標籤，讓文字換行並過濾極小數值避免重疊
const renderCustomizedLabel = ({ x, y, cx, percent, value, name }) => {
  if (percent < 0.02) return null; // 佔比小於 2% 則不顯示標籤
  return (
    <text x={x} y={y} fill="#333" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={12} fontWeight="bold" fontFamily="Microsoft JhengHei, sans-serif">
      <tspan x={x} dy="-0.5em">{name} {(percent * 100).toFixed(0)}%</tspan>
      <tspan x={x} dy="1.2em" fill="#666" fontSize={11} fontWeight="normal">${value.toLocaleString()}</tspan>
    </text>
  );
};

// 動態產生圖表標題
const generateTitle = (y, m, txT, cat, payer) => {
  let title = `${y}年`;
  if (m) title += `${m}月`;
  if (txT === 'income') title += '收入';
  else if (txT === 'expense') title += '支出';
  else title += '收支';
  if (cat) title += ` - ${cat}`;
  if (payer) title += ` (${payer})`;
  return title;
};

export default function Analysis() {
  const [tab, setTab] = useState('income_expense');
  const [chartType, setChartType] = useState('bar'); // 'bar', 'line', 'pie'
  const [transactions, setTransactions] = useState([]);
  const [assets, setAssets] = useState([]);

  // 共用主條件
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(''); // '' 表示全年
  const [filterCategory, setFilterCategory] = useState('');
  const [filterTxType, setFilterTxType] = useState(''); // '' 表示所有收支
  const [filterPayer, setFilterPayer] = useState('');

  // 比較條件
  const [isComparing, setIsComparing] = useState(false);
  const [compYear, setCompYear] = useState(new Date().getFullYear() - 1);
  const [compMonth, setCompMonth] = useState(new Date().getMonth() + 1); // 有篩選主月份時才會出現
  const [compCategory, setCompCategory] = useState('');
  const [compTxType, setCompTxType] = useState(''); // '' 表示所有收支
  const [compPayer, setCompPayer] = useState('');

  // 表格呈現條件
  const [compareCondition, setCompareCondition] = useState('expense_ratio'); // 'expense_ratio', 'income_expense'

  // 即時監聽 Firebase 資料
  useEffect(() => {
    const unsubTx = onSnapshot(collection(db, "transactions"), (snapshot) => {
      setTransactions(snapshot.docs.map(doc => doc.data()));
    });
    const unsubAssets = onSnapshot(collection(db, "assets"), (snapshot) => {
      setAssets(snapshot.docs.map(doc => doc.data()));
    });
    return () => { unsubTx(); unsubAssets(); };
  }, []);

  // 動態取得所有年份
  const availableYears = useMemo(() => {
    const years = transactions.map(t => new Date(t.date).getFullYear()).filter(y => !isNaN(y));
    const uniqueYears = Array.from(new Set(years)).sort((a, b) => b - a); // 由新到舊
    return uniqueYears.length > 0 ? uniqueYears : [new Date().getFullYear()];
  }, [transactions]);

  // 動態取得所有用過的類別
  const allCategories = useMemo(() => {
    return Array.from(new Set(transactions.map(t => t.category).filter(Boolean)));
  }, [transactions]);

  // 動態取得所有付款人
  const allPayers = useMemo(() => {
    return Array.from(new Set(transactions.map(t => t.payer).filter(Boolean)));
  }, [transactions]);

  // 過濾資料的共用函數
  const getFilteredTx = (txs, y, m, cat, txType, payer) => {
    return txs.filter(tx => {
      const date = new Date(tx.date);
      const matchYear = date.getFullYear() === y;
      const matchMonth = m ? (date.getMonth() + 1 === m) : true;
      const matchCat = cat ? tx.category === cat : true;
      const matchTxType = txType ? tx.type === txType : true;
      const matchPayer = payer ? tx.payer === payer : true;
      return matchYear && matchMonth && matchCat && matchTxType && matchPayer;
    });
  };

  const primaryTx = getFilteredTx(transactions, filterYear, filterMonth, filterCategory, filterTxType, filterPayer);
  const compTx = isComparing ? getFilteredTx(transactions, compYear, filterMonth ? compMonth : '', compCategory, compTxType, compPayer) : [];

  // 組合圖表時間軸資料 (Timeline Data)
  let timelineData = [];
  if (!filterMonth) {
    // 主副條件皆為「年度」，顯示 12 個月
    timelineData = Array.from({length: 12}, (_, i) => {
      const pTx = primaryTx.filter(t => new Date(t.date).getMonth() === i);
      const cTx = compTx.filter(t => new Date(t.date).getMonth() === i);
      return {
        name: `${i+1}月`,
        主條件_收入: pTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0),
        主條件_支出: pTx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0),
        比較條件_收入: cTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0),
        比較條件_支出: cTx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0),
      };
    });
  } else {
    // 主副條件皆為「月份」，顯示該月每一天
    const daysInPrimary = new Date(filterYear, filterMonth, 0).getDate();
    const daysInComp = isComparing ? new Date(compYear, compMonth || filterMonth, 0).getDate() : daysInPrimary;
    const maxDays = Math.max(daysInPrimary, daysInComp);
    
    timelineData = Array.from({length: maxDays}, (_, i) => {
      const pTx = primaryTx.filter(t => new Date(t.date).getDate() === i+1);
      const cTx = compTx.filter(t => new Date(t.date).getDate() === i+1);
      return {
        name: `${i+1}日`,
        主條件_收入: pTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0),
        主條件_支出: pTx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0),
        比較條件_收入: cTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0),
        比較條件_支出: cTx.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0),
      };
    });
  }

  // 供圓餅圖使用 (Yearly/Monthly Summary)
  let yearlySummaryData = [];
  if (filterTxType === 'income' || filterTxType === 'expense') {
    const map = {};
    primaryTx.forEach(t => map[t.category || '未分類'] = (map[t.category || '未分類'] || 0) + t.amount);
    yearlySummaryData = Object.entries(map).map(([name, value]) => ({ name, value })).filter(d => d.value > 0).sort((a,b) => b.value - a.value);
  } else {
    yearlySummaryData = [
      { name: '收入', value: primaryTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0) },
      { name: '支出', value: primaryTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0) }
    ].filter(d => d.value > 0);
  }

  let compSummaryData = [];
  if (isComparing) {
    if (compTxType === 'income' || compTxType === 'expense') {
      const map = {};
      compTx.forEach(t => map[t.category || '未分類'] = (map[t.category || '未分類'] || 0) + t.amount);
      compSummaryData = Object.entries(map).map(([name, value]) => ({ name: name + '(比較)', value })).filter(d => d.value > 0).sort((a,b) => b.value - a.value);
    } else {
      compSummaryData = [
        { name: '收入(比較)', value: compTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0) },
        { name: '支出(比較)', value: compTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0) }
      ].filter(d => d.value > 0);
    }
  }

  // 動態計算財產佔比
  const assetDataMap = { '股票': 0, '活期存款': 0, '定期存款': 0 };
  assets.forEach(asset => {
    if (asset.type === 'stock') assetDataMap['股票'] += (Number(asset.shares) * Number(asset.cost)) || 0;
    else if (asset.type === 'demand') assetDataMap['活期存款'] += Number(asset.amount) || 0;
    else if (asset.type === 'fixed') assetDataMap['定期存款'] += Number(asset.amount) || 0;
  });
  const dynamicAssetData = Object.entries(assetDataMap).filter(([_, val]) => val > 0).map(([name, value]) => ({ name, value }));

  // 計算圖例比例 (分開處理主條件與比較條件)
  const totalPrimary = yearlySummaryData.reduce((sum, d) => sum + d.value, 0);
  const totalComp = compSummaryData.reduce((sum, d) => sum + d.value, 0);
  const formatYearlyLegend = (value, entry) => {
    const total = value.includes('比較') ? totalComp : totalPrimary;
    const percentage = total > 0 ? ((entry.payload.value / total) * 100).toFixed(1) : 0;
    return `${value} (${percentage}%)`;
  };

  const totalAssets = dynamicAssetData.reduce((sum, d) => sum + d.value, 0);
  const formatAssetLegend = (value, entry) => {
    const percentage = totalAssets > 0 ? ((entry.payload.value / totalAssets) * 100).toFixed(1) : 0;
    return `${value} (${percentage}%)`;
  };

  // 處理狀態明細比較表資料
  let tableData = [];
  if (compareCondition === 'expense_ratio') {
    const getExpRatio = (txs) => {
      const expTx = txs.filter(t => t.type === 'expense');
      const totalExp = expTx.reduce((sum, t) => sum + t.amount, 0);
      const map = {};
      expTx.forEach(t => map[t.category] = (map[t.category] || 0) + t.amount);
      return { totalExp, map };
    };
    const pData = getExpRatio(primaryTx);
    const cData = isComparing ? getExpRatio(compTx) : null;
    
    const allCatNames = new Set([...Object.keys(pData.map), ...(cData ? Object.keys(cData.map) : [])]);
    tableData = Array.from(allCatNames).map(name => {
      const pAmt = pData.map[name] || 0;
      const pRat = pData.totalExp > 0 ? ((pAmt / pData.totalExp) * 100).toFixed(1) + '%' : '0%';
      const cAmt = cData ? (cData.map[name] || 0) : null;
      const cRat = cData ? (cData.totalExp > 0 ? ((cAmt / cData.totalExp) * 100).toFixed(1) + '%' : '0%') : null;
      return { name, pAmt, pRat, cAmt, cRat };
    }).sort((a, b) => b.pAmt - a.pAmt);
  } else if (compareCondition === 'income_expense') {
    const getIncExp = (txs) => {
      const inc = txs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
      const exp = txs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
      return { inc, exp, bal: inc - exp };
    };
    const pData = getIncExp(primaryTx);
    const cData = isComparing ? getIncExp(compTx) : null;
    const calcRatio = (val, inc) => inc > 0 ? ((val / inc) * 100).toFixed(1) + '%' : (val === inc && val > 0 ? '100%' : 'N/A');
    
    tableData = [
      { name: '總收入', pAmt: pData.inc, pRat: pData.inc > 0 ? '100%' : '0%', cAmt: cData?.inc, cRat: cData?.inc > 0 ? '100%' : '0%' },
      { name: '總支出', pAmt: pData.exp, pRat: calcRatio(pData.exp, pData.inc), cAmt: cData?.exp, cRat: cData ? calcRatio(cData.exp, cData.inc) : null },
      { name: '結餘', pAmt: pData.bal, pRat: calcRatio(pData.bal, pData.inc), cAmt: cData?.bal, cRat: cData ? calcRatio(cData.bal, cData.inc) : null }
    ];
  } else if (compareCondition === 'payer_ratio') {
    const getPayerRatio = (txs) => {
      const expTx = txs.filter(t => t.type === 'expense');
      const totalExp = expTx.reduce((sum, t) => sum + t.amount, 0);
      const map = {};
      expTx.forEach(t => map[t.payer || '未知'] = (map[t.payer || '未知'] || 0) + t.amount);
      return { totalExp, map };
    };
    const pData = getPayerRatio(primaryTx);
    const cData = isComparing ? getPayerRatio(compTx) : null;
    
    const allPayerNames = new Set([...Object.keys(pData.map), ...(cData ? Object.keys(cData.map) : [])]);
    tableData = Array.from(allPayerNames).map(name => {
      const pAmt = pData.map[name] || 0;
      const pRat = pData.totalExp > 0 ? ((pAmt / pData.totalExp) * 100).toFixed(1) + '%' : '0%';
      const cAmt = cData ? (cData.map[name] || 0) : null;
      const cRat = cData ? (cData.totalExp > 0 ? ((cAmt / cData.totalExp) * 100).toFixed(1) + '%' : '0%') : null;
      return { name, pAmt, pRat, cAmt, cRat };
    }).sort((a, b) => b.pAmt - a.pAmt);
  }

  const selectStyle = { padding: '6px 10px', borderRadius: '6px', border: '1px solid #ddd', color: '#333', fontSize: '14px', background: '#fff' };

  // 為圖表產生相對應名稱
  const primaryTitle = generateTitle(filterYear, filterMonth, filterTxType, filterCategory, filterPayer);
  const compTitle = isComparing ? generateTitle(compYear, filterMonth ? compMonth : '', compTxType, compCategory, compPayer) : '';
  const pIncName = filterTxType ? primaryTitle : `${primaryTitle} - 收入`;
  const pExpName = filterTxType ? primaryTitle : `${primaryTitle} - 支出`;
  const cIncName = compTxType ? compTitle : `${compTitle} - 收入`;
  const cExpName = compTxType ? compTitle : `${compTitle} - 支出`;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: '#333' }}>總覽分析</h2>
      </div>

      {/* 共用統一篩選器 */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 'bold', minWidth: '60px' }}>主條件:</span>
          <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} style={selectStyle}>
            {availableYears.map(y => <option key={y} value={y}>{y} 年</option>)}
          </select>
          <select value={filterMonth} onChange={e => setFilterMonth(e.target.value ? Number(e.target.value) : '')} style={selectStyle}>
            <option value="">全年</option>
            {Array.from({length: 12}, (_, i) => <option key={i+1} value={i+1}>{i+1} 月</option>)}
          </select>
          <select value={filterTxType} onChange={e => setFilterTxType(e.target.value)} style={selectStyle}>
            <option value="">所有收支</option>
            <option value="income">收入</option>
            <option value="expense">支出</option>
          </select>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={selectStyle}>
            <option value="">所有類別</option>
            {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterPayer} onChange={e => setFilterPayer(e.target.value)} style={selectStyle}>
            <option value="">所有付款人</option>
            {allPayers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', marginLeft: 'auto', fontWeight: 'bold', color: isComparing ? '#8b5cf6' : '#666' }}>
            <input type="checkbox" checked={isComparing} onChange={e => setIsComparing(e.target.checked)} />
            啟用比較
          </label>
        </div>

        {isComparing && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed #ddd' }}>
            <span style={{ fontWeight: 'bold', minWidth: '60px', color: '#8b5cf6' }}>比較條件:</span>
            <select value={compYear} onChange={e => setCompYear(Number(e.target.value))} style={selectStyle}>
              {availableYears.map(y => <option key={y} value={y}>{y} 年</option>)}
            </select>
            {filterMonth !== '' && (
              <select value={compMonth} onChange={e => setCompMonth(Number(e.target.value))} style={selectStyle}>
                {Array.from({length: 12}, (_, i) => <option key={i+1} value={i+1}>{i+1} 月</option>)}
              </select>
            )}
            <select value={compTxType} onChange={e => setCompTxType(e.target.value)} style={selectStyle}>
              <option value="">所有收支</option>
              <option value="income">收入</option>
              <option value="expense">支出</option>
            </select>
            <select value={compCategory} onChange={e => setCompCategory(e.target.value)} style={selectStyle}>
              <option value="">所有類別</option>
              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={compPayer} onChange={e => setCompPayer(e.target.value)} style={selectStyle}>
              <option value="">所有付款人</option>
              {allPayers.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
      </div>
      
      <div style={{ display: 'flex', borderBottom: '1px solid #ddd', marginBottom: '20px' }}>
        <button className={`tab-btn ${tab === 'income_expense' ? 'active' : ''}`} onClick={() => setTab('income_expense')}>收支比較</button>
        <button className={`tab-btn ${tab === 'assets' ? 'active' : ''}`} onClick={() => setTab('assets')}>財產分佈</button>
      </div>

      {tab === 'income_expense' && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>
              {primaryTitle}
              {isComparing && (
                <span style={{ color: '#8b5cf6', fontSize: '14px', marginLeft: '8px' }}>vs {compTitle}</span>
              )}
            </h3>
            <div style={{ display: 'flex', gap: '5px' }}>
              <button onClick={() => setChartType('bar')} style={{ padding: '4px 8px', background: chartType === 'bar' ? '#10b981' : '#f0f2f5', color: chartType === 'bar' ? '#fff' : '#666', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>柱狀圖</button>
              <button onClick={() => setChartType('line')} style={{ padding: '4px 8px', background: chartType === 'line' ? '#10b981' : '#f0f2f5', color: chartType === 'line' ? '#fff' : '#666', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>折線圖</button>
              <button onClick={() => setChartType('pie')} style={{ padding: '4px 8px', background: chartType === 'pie' ? '#10b981' : '#f0f2f5', color: chartType === 'pie' ? '#fff' : '#666', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>圓餅圖</button>
            </div>
          </div>
          <div style={{ width: '100%', minHeight: '450px' }}>
          <ResponsiveContainer width="100%" height={450}>
            {chartType === 'bar' ? (
              <BarChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip cursor={{fill: '#f4f4f4'}} formatter={(value, name) => [`$${value.toLocaleString()}`, name.replace('_', '-')]} />
                <Legend />
                {(!filterTxType || filterTxType === 'income') && <Bar dataKey="主條件_收入" name={pIncName} fill="#10b981" radius={[4, 4, 0, 0]} />}
                {(!filterTxType || filterTxType === 'expense') && <Bar dataKey="主條件_支出" name={pExpName} fill="#ef4444" radius={[4, 4, 0, 0]} />}
                {isComparing && (!compTxType || compTxType === 'income') && <Bar dataKey="比較條件_收入" name={cIncName} fill="#3b82f6" radius={[4, 4, 0, 0]} />}
                {isComparing && (!compTxType || compTxType === 'expense') && <Bar dataKey="比較條件_支出" name={cExpName} fill="#f59e0b" radius={[4, 4, 0, 0]} />}
              </BarChart>
            ) : chartType === 'line' ? (
              <LineChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip formatter={(value, name) => [`$${value.toLocaleString()}`, name.replace('_', '-')]} />
                <Legend />
                {(!filterTxType || filterTxType === 'income') && <Line type="monotone" dataKey="主條件_收入" name={pIncName} stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />}
                {(!filterTxType || filterTxType === 'expense') && <Line type="monotone" dataKey="主條件_支出" name={pExpName} stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />}
                {isComparing && (!compTxType || compTxType === 'income') && <Line type="monotone" strokeDasharray="5 5" dataKey="比較條件_收入" name={cIncName} stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />}
                {isComparing && (!compTxType || compTxType === 'expense') && <Line type="monotone" strokeDasharray="5 5" dataKey="比較條件_支出" name={cExpName} stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />}
              </LineChart>
            ) : (
              <PieChart>
                <Pie data={yearlySummaryData} cx={isComparing ? "25%" : "50%"} cy="50%" innerRadius={60} outerRadius={120} paddingAngle={5} dataKey="value" labelLine={true} label={renderCustomizedLabel}>
                  {yearlySummaryData.map((entry, index) => <Cell key={`cell-${index}`} fill={filterTxType ? COLORS[index % COLORS.length] : (entry.name.includes('收入') ? '#10b981' : '#ef4444')} />)}
                </Pie>
                {isComparing && (
                  <Pie data={compSummaryData} cx="75%" cy="50%" innerRadius={60} outerRadius={120} paddingAngle={5} dataKey="value" labelLine={true} label={renderCustomizedLabel}>
                    {compSummaryData.map((entry, index) => <Cell key={`comp-cell-${index}`} fill={compTxType ? COLORS[(index + 5) % COLORS.length] : (entry.name.includes('收入') ? '#3b82f6' : '#f59e0b')} />)}
                  </Pie>
                )}
                <Tooltip formatter={(value, name) => [`$${value.toLocaleString()}`, name]} />
                <Legend wrapperStyle={{ paddingTop: '20px' }} formatter={formatYearlyLegend} />
              </PieChart>
            )}
          </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === 'assets' && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0, fontSize: '16px', color: '#333', textAlign: 'center' }}>財產佔比分析</h3>
          {dynamicAssetData.length === 0 ? (
            <div style={{ display: 'flex', height: '450px', justifyContent: 'center', alignItems: 'center', color: '#999' }}>尚無財產紀錄</div>
          ) : (
          <div style={{ width: '100%', minHeight: '450px' }}>
          <ResponsiveContainer width="100%" height={450}>
            <PieChart>
              <Pie 
                data={dynamicAssetData} 
                cx="50%" cy="50%" 
                innerRadius={60} outerRadius={120} 
                paddingAngle={5} 
                dataKey="value"
                labelLine={true}
                label={renderCustomizedLabel}
              >
                {dynamicAssetData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} formatter={formatAssetLegend} />
            </PieChart>
          </ResponsiveContainer>
          </div>
          )}
        </div>
      )}

      {/* 狀態明細與比較表 */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>狀態明細與比較表</h3>
          <select value={compareCondition} onChange={e => setCompareCondition(e.target.value)} style={selectStyle}>
            <option value="expense_ratio">消費比率</option>
            <option value="income_expense">收支比</option>
            <option value="payer_ratio">付款人比率</option>
          </select>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '10px 5px', color: '#666' }}>項目</th>
              <th style={{ padding: '10px 5px', color: '#666' }}>{isComparing ? '主條件金額' : '金額'}</th>
              <th style={{ padding: '10px 5px', color: '#666' }}>{isComparing ? '主條件比例' : '比例'}</th>
              {isComparing && (
                <>
                  <th style={{ padding: '10px 5px', color: '#8b5cf6' }}>比較金額</th>
                  <th style={{ padding: '10px 5px', color: '#8b5cf6' }}>比較比例</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {tableData.length === 0 ? (
              <tr>
                <td colSpan={isComparing ? 5 : 3} style={{ textAlign: 'center', padding: '20px', color: '#999' }}>尚無資料</td>
              </tr>
            ) : (
              tableData.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px 5px', color: '#333' }}>{row.name}</td>
                  <td style={{ padding: '10px 5px', color: row.name.includes('支出') ? '#ef4444' : '#333', fontWeight: 'bold' }}>${row.pAmt.toLocaleString()}</td>
                  <td style={{ padding: '10px 5px', color: '#666' }}>{row.pRat}</td>
                  {isComparing && (
                    <>
                      <td style={{ padding: '10px 5px', color: row.name.includes('支出') ? '#f59e0b' : '#3b82f6', fontWeight: 'bold' }}>{row.cAmt != null ? `$${row.cAmt.toLocaleString()}` : '-'}</td>
                      <td style={{ padding: '10px 5px', color: '#9ca3af' }}>{row.cRat || '-'}</td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}