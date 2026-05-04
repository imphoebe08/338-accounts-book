import { useState, useEffect } from 'react';
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
const renderCustomizedLabel = ({ x, y, cx, percent, value, name }) => {
  if (percent < 0.02) return null; // 佔比小於 2% 則不顯示標籤
  return (
    <text x={x} y={y} fill="#333" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={12} fontWeight="bold" fontFamily="Microsoft JhengHei, sans-serif">
      <tspan x={x} dy="-0.5em">{name} {(percent * 100).toFixed(0)}%</tspan>
      <tspan x={x} dy="1.2em" fill="#666" fontSize={11} fontWeight="normal">${value.toLocaleString()}</tspan>
    </text>
  );
};

export default function Overview() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [transactions, setTransactions] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [editingTx, setEditingTx] = useState(null);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    setSelectedCategory(null);
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
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
  const filteredTransactions = transactions.filter(tx => {
    const txDate = new Date(tx.date);
    return txDate.getFullYear() === year && txDate.getMonth() + 1 === month;
  });
  const totalIncome = filteredTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = filteredTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

  // 動態計算當月支出的圓餅圖資料
  const pieData = Object.entries(
    filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((acc, tx) => {
        acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
        return acc;
      }, {})
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value); // 依金額由大到小排序

  // 根據點擊的圓餅圖色塊篩選顯示的項目
  const displayedTransactions = selectedCategory 
    ? filteredTransactions.filter(t => t.category === selectedCategory && t.type === 'expense') 
    : filteredTransactions;

  // 計算圓餅圖總計，用於圖例顯示比例
  const totalPieValue = pieData.reduce((sum, item) => sum + item.value, 0);
  const renderLegendText = (value, entry) => {
    const percentage = totalPieValue > 0 ? ((entry.payload.value / totalPieValue) * 100).toFixed(1) : 0;
    return `${value} (${percentage}%)`;
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      
      {/* 年月選擇器 */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
        <button onClick={handlePrevMonth} style={{ padding: '8px 16px', background: '#fff', color: '#333', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer' }}>◀</button>
        <input 
          type="month" 
          value={`${year}-${String(month).padStart(2, '0')}`}
          onClick={(e) => e.target.showPicker && e.target.showPicker()}
          onChange={(e) => {
            if (!e.target.value) return;
            setSelectedCategory(null);
            const [y, m] = e.target.value.split('-');
            setCurrentDate(new Date(y, m - 1, 1));
          }}
          style={{ border: 'none', fontSize: '20px', fontWeight: 'bold', color: '#333', background: 'transparent', textAlign: 'center', cursor: 'pointer', fontFamily: 'inherit' }}
        />
        <button onClick={handleNextMonth} style={{ padding: '8px 16px', background: '#fff', color: '#333', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer' }}>▶</button>
      </div>

      {/* 本月收支摘要 */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
        <div className="card" style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#666' }}>本月收入</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>${totalIncome.toLocaleString()}</div>
        </div>
        <div className="card" style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#666' }}>本月支出</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>${totalExpense.toLocaleString()}</div>
        </div>
        <div className="card" style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '14px', color: '#666' }}>結餘</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>${(totalIncome - totalExpense).toLocaleString()}</div>
        </div>
      </div>

      {/* 動態圓餅圖 */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h3 style={{ marginTop: 0, fontSize: '16px', color: '#333', textAlign: 'center' }}>本月支出佔比</h3>
        {pieData.length === 0 ? (
          <div style={{ display: 'flex', height: '450px', justifyContent: 'center', alignItems: 'center', color: '#999' }}>本月尚無支出紀錄</div>
        ) : (
          <div style={{ height: '450px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie 
                data={pieData} 
                cx="50%" cy="50%" 
                innerRadius={60} outerRadius={120} 
                paddingAngle={5} 
                dataKey="value"
                labelLine={true}
                label={renderCustomizedLabel}
                onClick={(entry) => setSelectedCategory(selectedCategory === entry.name ? null : entry.name)}
                style={{ cursor: 'pointer' }}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} opacity={selectedCategory === null || selectedCategory === entry.name ? 1 : 0.3} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `$${value.toLocaleString()}`} />
              <Legend wrapperStyle={{ paddingTop: '20px' }} formatter={renderLegendText} />
            </PieChart>
          </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>本月收支紀錄 {selectedCategory && <span style={{ color: '#10b981' }}>(篩選: {selectedCategory})</span>}</h3>
        </div>
        {displayedTransactions.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '20px 0' }}>{selectedCategory ? '此分類本月尚無紀錄' : '這個月目前沒有紀錄喔！'}</div>
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