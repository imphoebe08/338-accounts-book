import { useState, useEffect, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { db } from './firebase';
import TransactionModal from './TransactionModal';

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

export default function Overview() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [transactions, setTransactions] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [editingTx, setEditingTx] = useState(null);
  const [viewMode, setViewMode] = useState('month'); // 'month' 或 'year'
  const [showLegend, setShowLegend] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  useEffect(() => {
    setPickerYear(currentDate.getFullYear());
  }, [currentDate]);

  const handlePrev = () => {
    if (viewMode === 'year') {
      setCurrentDate(new Date(currentDate.getFullYear() - 1, 1, 1));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    }
    setSelectedCategory(null);
  };

  const handleNext = () => {
    if (viewMode === 'year') {
      setCurrentDate(new Date(currentDate.getFullYear() + 1, 1, 1));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    }
    setSelectedCategory(null);
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  // 監聽 Firebase 資料庫變化
  useEffect(() => {
    // 建立查詢：依據日期由新到舊排序
    const q = query(collection(db, "transactions"), orderBy("date", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(data);
    });

    return () => unsubscribe();
  }, []);

  // 刪除紀錄
  const handleDelete = async (id) => {
    if (window.confirm('確定要刪除這筆紀錄嗎？')) {
      await deleteDoc(doc(db, "transactions", id));
    }
  };

  // 依據選擇的年月過濾資料
  const filteredTransactions = useMemo(() => transactions.filter(tx => {
    const txDate = new Date(tx.date);
    if (viewMode === 'year') {
      return txDate.getFullYear() === year;
    }
    return txDate.getFullYear() === year && txDate.getMonth() + 1 === month;
  }), [transactions, viewMode, year, month]);

  const { totalIncome, totalExpense } = useMemo(() => ({
    totalIncome: filteredTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
    totalExpense: filteredTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
  }), [filteredTransactions]);

  // 動態計算當月支出的圓餅圖資料
  const pieData = useMemo(() => {
    const grouped = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((acc, tx) => {
        if (!acc[tx.category]) acc[tx.category] = { value: 0, items: new Set() };
        acc[tx.category].value += tx.amount;
        if (tx.item) acc[tx.category].items.add(tx.item);
        return acc;
      }, {});
      
    return Object.entries(grouped)
      .map(([name, data]) => ({ name, value: data.value, items: Array.from(data.items) }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTransactions]); // 依金額由大到小排序

  // 根據點擊的圓餅圖色塊篩選顯示的項目
  const displayedTransactions = selectedCategory 
    ? filteredTransactions.filter(t => t.category === selectedCategory && t.type === 'expense') 
    : filteredTransactions;

  // 計算圓餅圖總計，用於圖例顯示比例
  const totalPieValue = pieData.reduce((sum, item) => sum + item.value, 0);
  const renderLegendText = (value, entry) => {
    const percentage = totalPieValue > 0 ? ((entry.payload.value / totalPieValue) * 100).toFixed(1) : 0;
    return <span style={{ fontSize: '12px', color: '#333' }}>{`${value} (${percentage}%)`}</span>; // 💡 在這裡調整 12px 大小
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      
      {/* 頁籤切換 */}
      <div style={{ display: 'flex', borderBottom: '1px solid #ddd', marginBottom: '20px' }}>
        <button className={`tab-btn ${viewMode === 'month' ? 'active' : ''}`} onClick={() => { setViewMode('month'); setCurrentDate(new Date()); setSelectedCategory(null); }}>本月</button>
        <button className={`tab-btn ${viewMode === 'year' ? 'active' : ''}`} onClick={() => { setViewMode('year'); setCurrentDate(new Date()); setSelectedCategory(null); }}>本年度</button>
      </div>

      {/* 年月選擇器 */}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
        <button onClick={handlePrev} style={{ padding: '10px 20px', background: '#fff', color: '#5C5446', border: 'none', borderRadius: '24px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>◀</button>
        
        <div 
          onClick={() => viewMode === 'month' && setShowDatePicker(!showDatePicker)}
          style={{ fontSize: '20px', fontWeight: 'bold', color: '#333', cursor: viewMode === 'month' ? 'pointer' : 'default', padding: '8px 16px', background: 'transparent', borderRadius: '12px', minWidth: '120px', textAlign: 'center' }}
        >
          {viewMode === 'month' ? `${year} 年 ${month} 月` : `${year} 年`}
        </div>
        
        <button onClick={handleNext} style={{ padding: '10px 20px', background: '#fff', color: '#5C5446', border: 'none', borderRadius: '24px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>▶</button>

        {/* 白色 iOS 風格年月選擇器 */}
        {showDatePicker && viewMode === 'month' && (
          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', width: '280px', background: '#fff', borderRadius: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100, padding: '16px', border: '1px solid #EAE3D2', marginTop: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <button onClick={() => setPickerYear(pickerYear - 1)} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#5C5446', padding: '5px' }}>◀</button>
              <div style={{ fontWeight: 'bold', color: '#333', fontSize: '16px' }}>{pickerYear} 年</div>
              <button onClick={() => setPickerYear(pickerYear + 1)} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#5C5446', padding: '5px' }}>▶</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              {Array.from({ length: 12 }).map((_, i) => {
                const isSelected = pickerYear === year && (i + 1) === month;
                return (
                  <div 
                    key={i} 
                    onClick={() => { 
                      setCurrentDate(new Date(pickerYear, i, 1)); 
                      setSelectedCategory(null);
                      setShowDatePicker(false); 
                    }} 
                    style={{ padding: '12px 0', textAlign: 'center', cursor: 'pointer', background: isSelected ? '#D5B77A' : '#F8F6F0', color: isSelected ? '#fff' : '#5C5446', borderRadius: '12px', fontWeight: isSelected ? 'bold' : 'normal', fontSize: '14px' }}
                  >
                    {i + 1}月
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 本月收支摘要 */}
      <div className="card" style={{ marginBottom: '20px', padding: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '10px' }}>
          <span style={{ color: '#666', fontSize: '15px' }}>{viewMode === 'month' ? '本月' : '本年'}收入</span>
          <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#10b981' }}>${totalIncome.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '10px' }}>
          <span style={{ color: '#666', fontSize: '15px' }}>{viewMode === 'month' ? '本月' : '本年'}支出</span>
          <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#ef4444' }}>${totalExpense.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#666', fontSize: '15px', fontWeight: 'bold' }}>結餘</span>
          <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>${(totalIncome - totalExpense).toLocaleString()}</span>
        </div>
      </div>

      {/* 動態圓餅圖 */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0, fontSize: '16px', color: '#333', textAlign: 'center' }}>{viewMode === 'month' ? '本月' : '本年'}支出佔比</h3>
        {pieData.length === 0 ? (
          <div style={{ display: 'flex', height: '300px', justifyContent: 'center', alignItems: 'center', color: '#999' }}>{viewMode === 'month' ? '本月' : '本年'}尚無支出紀錄</div>
        ) : (
          <>
            <div style={{ position: 'relative', width: '100%', height: '320px' }}>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: '12px', color: '#999' }}>結餘</div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>${(totalIncome - totalExpense).toLocaleString()}</div>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={pieData} 
                    cx="50%" cy="50%" 
                    innerRadius={60} outerRadius={90} 
                    paddingAngle={5} 
                    dataKey="value"
                    labelLine={true}
                    onClick={(entry) => setSelectedCategory(selectedCategory === entry.name ? null : entry.name)}
                    style={{ cursor: 'pointer' }}
                    label={renderCustomizedLabel}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} opacity={selectedCategory === null || selectedCategory === entry.name ? 1 : 0.3} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            {/* 收縮與展開的類別選單 */}
            <div style={{ marginTop: '10px' }}>
              <button 
                onClick={() => setShowLegend(!showLegend)} 
                style={{ width: '100%', padding: '10px', background: '#F8F6F0', color: '#D5B77A', border: '1px solid #EAE3D2', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
              >
                {showLegend ? '隱藏類別詳細資訊 ▲' : '展開類別詳細資訊 ▼'}
              </button>
              
              {showLegend && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginTop: '15px' }}>
                  {pieData.map((entry, index) => {
                    const percentage = totalPieValue > 0 ? ((entry.value / totalPieValue) * 100).toFixed(1) : 0;
                    return (
                      <div 
                        key={index} 
                        onClick={() => setSelectedCategory(selectedCategory === entry.name ? null : entry.name)}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', padding: '8px', background: selectedCategory === entry.name ? '#fef3c7' : '#fff', border: '1px solid #eee', borderRadius: '8px', cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: COLORS[index % COLORS.length] }}></div>
                          <span style={{ color: '#333' }}>{entry.name}</span>
                        </div>
                        <div style={{ color: '#666', fontWeight: '500' }}>{percentage}%</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>{viewMode === 'month' ? '本月' : '本年'}收支紀錄 {selectedCategory && <span style={{ color: '#D5B77A' }}>(篩選: {selectedCategory})</span>}</h3>
        </div>
        {displayedTransactions.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '20px 0' }}>{selectedCategory ? `此分類${viewMode === 'month' ? '本月' : '本年'}尚無紀錄` : `這${viewMode === 'month' ? '個月' : '一年'}目前沒有紀錄喔！`}</div>
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {displayedTransactions.map((tx) => (
            <div key={tx.id} className="swipe-item">
              
              {/* 主要內容 (佔滿 100% 寬度) */}
              <div className="swipe-content">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '16px', fontWeight: '500', color: '#333' }}>{tx.item}</span>
                  <span style={{ fontSize: '12px', color: '#888' }}>{tx.date} • {tx.category}{tx.payer ? ` • ${tx.payer}` : ''}</span>
                </div>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: tx.type === 'expense' ? '#ef4444' : '#10b981' }}>
                  {tx.type === 'expense' ? '-' : '+'}${tx.amount.toLocaleString()}
                </div>
              </div>

              {/* 左滑出現的隱藏操作按鈕 */}
              <div className="swipe-actions">
                <button className="action-btn edit-btn" onClick={() => setEditingTx(tx)} title="編輯">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                </button>
                <button className="action-btn delete-btn" onClick={() => handleDelete(tx.id)} title="刪除">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>

      {/* 編輯彈出視窗 */}
      {editingTx && <TransactionModal editData={editingTx} onClose={() => setEditingTx(null)} />}
    </div>
  );
}