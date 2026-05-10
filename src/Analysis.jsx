import { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

const COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', 
  '#ec4899', '#14b8a6', '#f43f5e', '#0ea5e9', '#84cc16', 
  '#eab308', '#d946ef', '#6366f1', '#64748b', '#78716c',
  '#06b6d4', '#f97316', '#22c55e', '#a855f7', '#fb923c'
];

// 客製化圓餅圖標籤，讓文字換行並過濾極小數值避免重疊
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, value, name, payload }) => {
  if (!percent || percent < 0.05) return null; // 佔比小於 5% 則不顯示標籤
  
  const RADIAN = Math.PI / 180;
  // 將半徑設定在圓餅圖外圍，搭配 labelLine 指示線
  const radius = outerRadius * 1.2;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  // 根據標籤在左側或右側決定對齊方向
  const textAnchor = x > cx ? 'start' : 'end';

  return (
    <text x={x} y={y} fill="#5C5446" textAnchor={textAnchor} dominantBaseline="central" fontSize={12} fontWeight="bold" fontFamily="Microsoft JhengHei, sans-serif">
      <tspan x={x} dy="-0.5em">{name} {(percent * 100).toFixed(0)}%</tspan>
      <tspan x={x} dy="1.2em" fontSize={11} fill="#888">${value.toLocaleString()}</tspan>
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

export default function Analysis({ transactions, assets }) {
  const [tab, setTab] = useState('income_expense');
  const [chartType, setChartType] = useState('bar'); // 'bar', 'line', 'pie'

  // 共用主條件
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterMonth, setFilterMonth] = useState(''); // '' 表示全年
  const [filterCategory, setFilterCategory] = useState('');
  const [filterTxType, setFilterTxType] = useState(''); // 預設為所有收支
  const [filterPayer, setFilterPayer] = useState('');

  // 比較條件
  const [isComparing, setIsComparing] = useState(false);
  const [compYear, setCompYear] = useState(new Date().getFullYear() - 1);
  const [compMonth, setCompMonth] = useState(new Date().getMonth() + 1); // 有篩選主月份時才會出現
  const [compCategory, setCompCategory] = useState('');
  const [compTxType, setCompTxType] = useState(''); // 預設為所有收支
  const [compPayer, setCompPayer] = useState('');

  // 財產持有人篩選條件
  const [assetFilterHolder, setAssetFilterHolder] = useState('');
  const allAssetHolders = useMemo(() => Array.from(new Set(assets.map(a => a.holder || a.depositor).filter(Boolean))), [assets]);

  const [showLegend, setShowLegend] = useState(false);
  // 表格呈現條件
  const [compareCondition, setCompareCondition] = useState('expense_ratio'); // 'expense_ratio', 'income_expense'

  // 重置篩選器
  const handleResetFilters = () => {
    setFilterYear(new Date().getFullYear());
    setFilterMonth('');
    setFilterTxType('');
    setFilterCategory('');
    setFilterPayer('');
    setIsComparing(false);
    setCompYear(new Date().getFullYear() - 1);
    setCompMonth(new Date().getMonth() + 1);
    setCompTxType('');
    setCompCategory('');
    setCompPayer('');
  };

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

  // 使用 useMemo 快取過濾後的結果，避免每次切換 tab 都重新 filter
  const primaryTx = useMemo(() => getFilteredTx(transactions, filterYear, filterMonth, filterCategory, filterTxType, filterPayer), [transactions, filterYear, filterMonth, filterCategory, filterTxType, filterPayer]);
  const compTx = useMemo(() => isComparing ? getFilteredTx(transactions, compYear, filterMonth ? compMonth : '', compCategory, compTxType, compPayer) : [], [isComparing, transactions, compYear, compMonth, filterMonth, compCategory, compTxType, compPayer]);

  // 組合圖表時間軸資料 (Timeline Data)
  const timelineData = useMemo(() => {
    if (!filterMonth) {
      return Array.from({length: 12}, (_, i) => {
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
      const daysInPrimary = new Date(filterYear, filterMonth, 0).getDate();
      const daysInComp = isComparing ? new Date(compYear, compMonth || filterMonth, 0).getDate() : daysInPrimary;
      const maxDays = Math.max(daysInPrimary, daysInComp);
    
      return Array.from({length: maxDays}, (_, i) => {
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
  }, [filterMonth, filterYear, primaryTx, isComparing, compYear, compMonth, compTx]);

  // 供圓餅圖使用 (Yearly/Monthly Summary)
  const { yearlySummaryData, compSummaryData } = useMemo(() => {
    let yData = [];
    const yMap = {};
    primaryTx.forEach(t => {
      const cat = t.category || '未分類';
      if (!yMap[cat]) yMap[cat] = { value: 0, items: new Set() };
      yMap[cat].value += t.amount;
      if (t.item) yMap[cat].items.add(t.item);
    });
    yData = Object.entries(yMap).map(([name, data]) => ({ name, value: data.value, items: Array.from(data.items) })).filter(d => d.value > 0).sort((a,b) => b.value - a.value);

    let cData = [];
    if (isComparing) {
      const cMap = {};
      compTx.forEach(t => {
        const cat = t.category || '未分類';
        if (!cMap[cat]) cMap[cat] = { value: 0, items: new Set() };
        cMap[cat].value += t.amount;
        if (t.item) cMap[cat].items.add(t.item);
      });
      cData = Object.entries(cMap).map(([name, data]) => ({ name: name + '(比較)', value: data.value, items: Array.from(data.items) })).filter(d => d.value > 0).sort((a,b) => b.value - a.value);
    }
    return { yearlySummaryData: yData, compSummaryData: cData };
  }, [primaryTx, isComparing, compTx]);

  // 動態計算財產佔比
  const dynamicAssetData = useMemo(() => {
    const assetDataMap = { 
      '股票': { value: 0, items: new Set() }, 
      '活期存款': { value: 0, items: new Set() }, 
      '定期存款': { value: 0, items: new Set() } 
    };
    const filteredAssetsForChart = assetFilterHolder ? assets.filter(a => (a.holder || a.depositor) === assetFilterHolder) : assets;
    filteredAssetsForChart.forEach(asset => {
      if (asset.type === 'stock') {
        assetDataMap['股票'].value += (Number(asset.shares) * Number(asset.cost)) || 0;
        if (asset.item) assetDataMap['股票'].items.add(asset.item);
      } else if (asset.type === 'demand') {
        assetDataMap['活期存款'].value += Number(asset.amount) || 0;
        if (asset.item) assetDataMap['活期存款'].items.add(asset.item);
      } else if (asset.type === 'fixed') {
        let principal = Number(asset.amount) || 0;
        if (asset.fixedType === '零存整付' && asset.durationMonths) {
          principal = principal * Number(asset.durationMonths);
        }
        assetDataMap['定期存款'].value += principal;
        if (asset.item) assetDataMap['定期存款'].items.add(asset.item);
      }
    });
    return Object.entries(assetDataMap).filter(([_, data]) => data.value > 0).map(([name, data]) => ({ name, value: data.value, items: Array.from(data.items) }));
  }, [assets, assetFilterHolder]);

  // 計算圖例比例 (分開處理主條件與比較條件)
  const totalPrimary = yearlySummaryData.reduce((sum, d) => sum + d.value, 0);
  const totalComp = compSummaryData.reduce((sum, d) => sum + d.value, 0);
  const formatYearlyLegend = (value, entry) => {
    const total = value.includes('比較') ? totalComp : totalPrimary;
    const percentage = total > 0 ? ((entry.payload.value / total) * 100).toFixed(1) : 0;
    return <span style={{ fontSize: '12px', color: '#333' }}>{`${value} (${percentage}%)`}</span>; // 💡 在這裡調整 12px 大小
  };

  const totalAssets = dynamicAssetData.reduce((sum, d) => sum + d.value, 0);
  const formatAssetLegend = (value, entry) => {
    const percentage = totalAssets > 0 ? ((entry.payload.value / totalAssets) * 100).toFixed(1) : 0;
    return <span style={{ fontSize: '12px', color: '#333' }}>{`${value} (${percentage}%)`}</span>; // 💡 在這裡調整 12px 大小
  };

  // 處理狀態明細比較表資料
  const tableData = useMemo(() => {
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
      return Array.from(allCatNames).map(name => {
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
      
      return [
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
      return Array.from(allPayerNames).map(name => {
        const pAmt = pData.map[name] || 0;
        const pRat = pData.totalExp > 0 ? ((pAmt / pData.totalExp) * 100).toFixed(1) + '%' : '0%';
        const cAmt = cData ? (cData.map[name] || 0) : null;
        const cRat = cData ? (cData.totalExp > 0 ? ((cAmt / cData.totalExp) * 100).toFixed(1) + '%' : '0%') : null;
        return { name, pAmt, pRat, cAmt, cRat };
      }).sort((a, b) => b.pAmt - a.pAmt);
    }
    return [];
  }, [compareCondition, primaryTx, isComparing, compTx]);

  const selectStyle = { padding: '8px 12px', borderRadius: '16px', border: '1px solid #EAE3D2', color: '#5C5446', fontSize: '14px', background: '#fff', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' };

  // 為圖表產生相對應名稱
  const primaryTitle = generateTitle(filterYear, filterMonth, filterTxType, filterCategory, filterPayer);
  const compTitle = isComparing ? generateTitle(compYear, filterMonth ? compMonth : '', compTxType, compCategory, compPayer) : '';
  const pIncName = filterTxType ? primaryTitle : `${primaryTitle} - 收入`;
  const pExpName = filterTxType ? primaryTitle : `${primaryTitle} - 支出`;
  const cIncName = compTxType ? compTitle : `${compTitle} - 收入`;
  const cExpName = compTxType ? compTitle : `${compTitle} - 支出`;

  // 財產明細資料
  const assetTableData = useMemo(() => dynamicAssetData.map(d => ({
      name: d.name,
      amount: d.value,
      ratio: totalAssets > 0 ? ((d.value / totalAssets) * 100).toFixed(1) + '%' : '0%'
    })).sort((a, b) => b.amount - a.amount), [dynamicAssetData, totalAssets]);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: '#333' }}>總覽分析</h2>
      </div>

      {/* 共用統一篩選器 */}
      {tab === 'income_expense' && (
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
            
            <button onClick={handleResetFilters} style={{ padding: '8px 16px', background: '#F8F6F0', color: '#7A6F5D', border: 'none', borderRadius: '16px', cursor: 'pointer', fontSize: '14px' }}>清空</button>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button 
                onClick={() => {
                  setIsComparing(true);
                  setCompYear(filterYear - 1);
                  setCompMonth(filterMonth || new Date().getMonth() + 1);
                  setCompTxType(filterTxType);
                  setCompCategory(filterCategory);
                  setCompPayer(filterPayer);
                }} 
                style={{ padding: '8px 16px', background: '#f3e8ff', color: '#8b5cf6', border: '1px solid #d8b4fe', borderRadius: '16px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
              >
                📊 比較去年同期
              </button>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontWeight: 'bold', color: isComparing ? '#8b5cf6' : '#666' }}>
                <input type="checkbox" checked={isComparing} onChange={e => setIsComparing(e.target.checked)} />
                啟用比較
              </label>
            </div>
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
      )}
      
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
              <button onClick={() => setChartType('bar')} style={{ padding: '6px 14px', background: chartType === 'bar' ? '#D5B77A' : '#EAE3D2', color: chartType === 'bar' ? '#fff' : '#7A6F5D', border: 'none', borderRadius: '16px', cursor: 'pointer', fontSize: '12px' }}>柱狀圖</button>
              <button onClick={() => setChartType('line')} style={{ padding: '6px 14px', background: chartType === 'line' ? '#D5B77A' : '#EAE3D2', color: chartType === 'line' ? '#fff' : '#7A6F5D', border: 'none', borderRadius: '16px', cursor: 'pointer', fontSize: '12px' }}>折線圖</button>
              <button onClick={() => setChartType('pie')} style={{ padding: '6px 14px', background: chartType === 'pie' ? '#D5B77A' : '#EAE3D2', color: chartType === 'pie' ? '#fff' : '#7A6F5D', border: 'none', borderRadius: '16px', cursor: 'pointer', fontSize: '12px' }}>圓餅圖</button>
            </div>
          </div>
          
          <div style={{ width: '100%', minHeight: chartType === 'pie' ? 'auto' : '450px' }}>
            {chartType === 'bar' ? (
              <ResponsiveContainer width="100%" height={450}>
                <BarChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip cursor={{fill: '#f4f4f4'}} formatter={(value, name) => [`$${value.toLocaleString()}`, name.replace('_', '-')]} />
                  <Legend />
                  {(!filterTxType || filterTxType === 'income') && <Bar dataKey="主條件_收入" name={pIncName} fill="#10b981" radius={[8, 8, 0, 0]} />}
                  {(!filterTxType || filterTxType === 'expense') && <Bar dataKey="主條件_支出" name={pExpName} fill="#ef4444" radius={[8, 8, 0, 0]} />}
                  {isComparing && (!compTxType || compTxType === 'income') && <Bar dataKey="比較條件_收入" name={cIncName} fill="#3b82f6" radius={[8, 8, 0, 0]} />}
                  {isComparing && (!compTxType || compTxType === 'expense') && <Bar dataKey="比較條件_支出" name={cExpName} fill="#f59e0b" radius={[8, 8, 0, 0]} />}
                </BarChart>
              </ResponsiveContainer>
            ) : chartType === 'line' ? (
              <ResponsiveContainer width="100%" height={450}>
                <LineChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value, name) => [`$${value.toLocaleString()}`, name.replace('_', '-')]} />
                  <Legend />
                  {(!filterTxType || filterTxType === 'income') && <Line type="monotone" dataKey="主條件_收入" name={pIncName} stroke="#10b981" strokeWidth={4} dot={{ r: 5 }} activeDot={{ r: 7 }} />}
                  {(!filterTxType || filterTxType === 'expense') && <Line type="monotone" dataKey="主條件_支出" name={pExpName} stroke="#ef4444" strokeWidth={4} dot={{ r: 5 }} activeDot={{ r: 7 }} />}
                  {isComparing && (!compTxType || compTxType === 'income') && <Line type="monotone" strokeDasharray="5 5" dataKey="比較條件_收入" name={cIncName} stroke="#3b82f6" strokeWidth={4} dot={{ r: 5 }} activeDot={{ r: 7 }} />}
                  {isComparing && (!compTxType || compTxType === 'expense') && <Line type="monotone" strokeDasharray="5 5" dataKey="比較條件_支出" name={cExpName} stroke="#f59e0b" strokeWidth={4} dot={{ r: 5 }} activeDot={{ r: 7 }} />}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: isComparing ? 'column' : 'row', gap: '20px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, position: 'relative', height: '320px', minWidth: '280px' }}>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                      <div style={{ fontSize: '12px', color: '#999' }}>主條件</div>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>${totalPrimary.toLocaleString()}</div>
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={yearlySummaryData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" labelLine={true} label={renderCustomizedLabel}>
                          {yearlySummaryData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(value, name) => [`$${value.toLocaleString()}`, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {isComparing && (
                    <div style={{ flex: 1, position: 'relative', height: '320px', minWidth: '280px' }}>
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                        <div style={{ fontSize: '12px', color: '#999' }}>比較條件</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>${totalComp.toLocaleString()}</div>
                      </div>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={compSummaryData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" labelLine={true} label={renderCustomizedLabel}>
                            {compSummaryData.map((entry, index) => <Cell key={`comp-cell-${index}`} fill={COLORS[(index + 5) % COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(value, name) => [`$${value.toLocaleString()}`, name.replace('(比較)', '')]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
                {/* 把展開和隱藏資訊獨立成一個 Div */}
                <div style={{ marginTop: '10px' }}>
                  <button onClick={() => setShowLegend(!showLegend)} style={{ width: '100%', padding: '10px', background: '#F8F6F0', color: '#D5B77A', border: '1px solid #EAE3D2', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
                    {showLegend ? '隱藏詳細資訊 ▲' : '展開詳細資訊 ▼'}
                  </button>
                  {showLegend && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '15px' }}>
                      {yearlySummaryData.map((entry, index) => {
                        const percentage = totalPrimary > 0 ? ((entry.value / totalPrimary) * 100).toFixed(1) : 0;
                        const color = COLORS[index % COLORS.length];
                        return (
                          <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', padding: '8px', background: '#fff', border: '1px solid #eee', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', borderRadius: '50%', background: color }}></div><span style={{ color: '#333' }}>{entry.name}</span></div>
                            <div style={{ color: '#666', fontWeight: '500' }}>{percentage}%</div>
                          </div>
                        );
                      })}
                      {isComparing && compSummaryData.map((entry, index) => {
                        const percentage = totalComp > 0 ? ((entry.value / totalComp) * 100).toFixed(1) : 0;
                        const color = COLORS[(index + 5) % COLORS.length];
                        return (
                          <div key={`comp-${index}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', padding: '8px', background: '#fff', border: '1px dashed #eee', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', borderRadius: '50%', background: color }}></div><span style={{ color: '#333' }}>{entry.name}</span></div>
                            <div style={{ color: '#666', fontWeight: '500' }}>{percentage}%</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'assets' && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>財產佔比分析</h3>
            <select value={assetFilterHolder} onChange={e => setAssetFilterHolder(e.target.value)} style={selectStyle}>
              <option value="">所有持有人</option>
              {allAssetHolders.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          {dynamicAssetData.length === 0 ? (
            <div style={{ display: 'flex', height: '450px', justifyContent: 'center', alignItems: 'center', color: '#999' }}>尚無財產紀錄</div>
          ) : (
          <div style={{ width: '100%', minHeight: '550px' }}>
          <ResponsiveContainer width="100%" height={550}>
            <PieChart>
              <Pie 
                data={dynamicAssetData} 
                cx="50%" cy="45%" 
                innerRadius={80} outerRadius={120} 
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
          <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>{tab === 'income_expense' ? '狀態明細與比較表' : '財產明細'}</h3>
          {tab === 'income_expense' && (
            <select value={compareCondition} onChange={e => setCompareCondition(e.target.value)} style={selectStyle}>
              <option value="expense_ratio">消費比率</option>
              <option value="income_expense">收支比</option>
              <option value="payer_ratio">付款人比率</option>
            </select>
          )}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd' }}>
              <th style={{ padding: '10px 5px', color: '#666' }}>項目</th>
              <th style={{ padding: '10px 5px', color: '#666' }}>{tab === 'income_expense' && isComparing ? '主條件金額' : '金額'}</th>
              <th style={{ padding: '10px 5px', color: '#666' }}>{tab === 'income_expense' && isComparing ? '主條件比例' : '比例'}</th>
              {tab === 'income_expense' && isComparing && (
                <>
                  <th style={{ padding: '10px 5px', color: '#8b5cf6' }}>比較金額</th>
                  <th style={{ padding: '10px 5px', color: '#8b5cf6' }}>比較比例</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {tab === 'income_expense' ? (
              tableData.length === 0 ? (
                <tr>
                  <td colSpan={isComparing ? 5 : 3} style={{ textAlign: 'center', padding: '20px', color: '#999' }}>尚無資料</td>
                </tr>
              ) : (
                tableData.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px 5px', color: '#333' }}>{row.name}</td>
                    <td style={{ padding: '10px 5px', color: row.name.includes('支出') ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>${row.pAmt.toLocaleString()}</td>
                    <td style={{ padding: '10px 5px', color: '#666' }}>{row.pRat}</td>
                    {isComparing && (
                      <>
                        <td style={{ padding: '10px 5px', color: row.name.includes('支出') ? '#f59e0b' : '#3b82f6', fontWeight: 'bold' }}>{row.cAmt != null ? `$${row.cAmt.toLocaleString()}` : '-'}</td>
                        <td style={{ padding: '10px 5px', color: '#9ca3af' }}>{row.cRat || '-'}</td>
                      </>
                    )}
                  </tr>
                ))
              )
            ) : (
              assetTableData.length === 0 ? (
                <tr>
                  <td colSpan="3" style={{ textAlign: 'center', padding: '20px', color: '#999' }}>尚無資料</td>
                </tr>
              ) : (
                assetTableData.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px 5px', color: '#333' }}>{row.name}</td>
                    <td style={{ padding: '10px 5px', color: '#10b981', fontWeight: 'bold' }}>${row.amount.toLocaleString()}</td>
                    <td style={{ padding: '10px 5px', color: '#666' }}>{row.ratio}</td>
                  </tr>
                ))
              )
            )}
          </tbody>
          {/* 總計列 */}
          <tfoot>
            {tab === 'income_expense' && compareCondition !== 'income_expense' && tableData.length > 0 && (
              <tr style={{ borderTop: '2px solid #ddd', background: '#F8F6F0', fontWeight: 'bold' }}>
                <td style={{ padding: '10px 5px', color: '#333' }}>總計</td>
                <td style={{ padding: '10px 5px', color: '#333' }}>${tableData.reduce((sum, row) => sum + (row.pAmt || 0), 0).toLocaleString()}</td>
                <td style={{ padding: '10px 5px', color: '#666' }}>100%</td>
                {isComparing && (
                  <>
                    <td style={{ padding: '10px 5px', color: '#333' }}>${tableData.reduce((sum, row) => sum + (row.cAmt || 0), 0).toLocaleString()}</td>
                    <td style={{ padding: '10px 5px', color: '#666' }}>100%</td>
                  </>
                )}
              </tr>
            )}
            {tab === 'assets' && assetTableData.length > 0 && (
              <tr style={{ borderTop: '2px solid #ddd', background: '#F8F6F0', fontWeight: 'bold' }}>
                <td style={{ padding: '10px 5px', color: '#333' }}>總計</td>
                <td style={{ padding: '10px 5px', color: '#10b981' }}>${assetTableData.reduce((sum, row) => sum + (row.amount || 0), 0).toLocaleString()}</td>
                <td style={{ padding: '10px 5px', color: '#666' }}>100%</td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    </div>
  );
}