import { useState, useEffect } from 'react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, EXPENSE_SHORTCUTS, INCOME_SHORTCUTS, PAYERS } from './config';
import { collection, addDoc, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

export default function TransactionModal({ onClose, editData }) {
  // 新增狀態保存來自 Firebase 的使用者設定
  const [configData, setConfigData] = useState({
    expenseCats: EXPENSE_CATEGORIES,
    incomeCats: INCOME_CATEGORIES,
    expenseShorts: EXPENSE_SHORTCUTS,
    incomeShorts: INCOME_SHORTCUTS,
    payers: PAYERS
  });

  // 即時監聽設定，確保選單和 Settings.jsx 同步
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'user_prefs'), (docSnap) => {
      if (docSnap.exists()) {
        setConfigData(prev => ({ ...prev, ...docSnap.data() }));
      }
    });
    return () => unsub();
  }, []);

  const [type, setType] = useState(editData?.type || 'expense');
  const [amount, setAmount] = useState(editData ? String(editData.amount) : '0');
  const [item, setItem] = useState(editData?.item || '');
  const [date, setDate] = useState(editData?.date || new Date().toISOString().split('T')[0]);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const categories = type === 'expense' ? configData.expenseCats : configData.incomeCats;
  const shortcuts = type === 'expense' ? configData.expenseShorts : configData.incomeShorts;
  const availablePayers = configData.payers || PAYERS;
  const [category, setCategory] = useState(editData?.category || EXPENSE_CATEGORIES[0]);
  const [payer, setPayer] = useState(editData?.payer || availablePayers[0] || '');

  useEffect(() => {
    setCalendarMonth(new Date(date));
  }, [date]);

  // 處理計算機按鍵點擊
  const handleKeyClick = (key) => {
    if (key === '⌫') {
      setAmount(amount.length > 1 ? amount.slice(0, -1) : '0');
    } else if (key === 'C') {
      setAmount('0');
    } else if (key === '今天') {
      setDate(new Date().toISOString().split('T')[0]);
    } else if (key === '完成') {
      handleSubmit();
    } else {
      setAmount(amount === '0' && key !== '+' && key !== '-' ? key : amount + key);
    }
  };

  // 處理日期左右切換 (使用 UTC 避免時區跨日問題)
  const handlePrevDay = () => {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() - 1);
    setDate(d.toISOString().split('T')[0]);
    setCalendarMonth(new Date(d));
  };
  const handleNextDay = () => {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + 1);
    setDate(d.toISOString().split('T')[0]);
    setCalendarMonth(new Date(d));
  };
  const handlePrevMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
  const handleNextMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));

  const keys = ['7', '8', '9', '今天', '4', '5', '6', '+', '1', '2', '3', '-', 'C', '0', '⌫', '完成'];

  const handleSubmit = async () => {
    let finalAmount = 0;
    try {
      // 使用 Function 取代 eval，提升安全性與解析效能
      finalAmount = new Function('return ' + amount)();
    } catch (e) {
      alert('計算錯誤，請檢查輸入內容');
      return;
    }

    if (!finalAmount || isNaN(Number(finalAmount))) {
      alert('請輸入有效金額');
      return;
    }

    try {
      // 寫入 Firebase 資料庫
      if (editData) {
        await updateDoc(doc(db, 'transactions', editData.id), {
          type,
          item: item || category,
          category,
          payer,
          amount: finalAmount,
          date: date,
        });
      } else {
        await addDoc(collection(db, 'transactions'), {
          type,
          item: item || category,
          category,
          payer,
          amount: finalAmount,
          date: date,
        });
      }
      onClose();
    } catch (error) {
      console.error("寫入失敗:", error);
      alert('發生錯誤，請稍後再試！');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', borderBottom: '1px solid #ddd' }}>
          <button className={`tab-btn ${type === 'expense' ? 'active' : ''}`} style={{ borderTopLeftRadius: '24px' }} onClick={() => { setType('expense'); setCategory(configData.expenseCats[0] || ''); setAmount('0'); setItem(''); }}>支出</button>
          <button className={`tab-btn ${type === 'income' ? 'active' : ''}`} style={{ borderTopRightRadius: '24px' }} onClick={() => { setType('income'); setCategory(configData.incomeCats[0] || ''); setAmount('0'); setItem(''); }}>收入</button>
        </div>
        
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', background: '#fff' }}>
          {/* 金額顯示 */}
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '2px solid #D5B77A', paddingBottom: '5px' }}>
            <span style={{ fontSize: '24px', fontWeight: 'bold', color: type === 'expense' ? '#ef4444' : '#10b981', marginRight: '10px' }}>$</span>
            <div style={{ fontSize: '32px', fontWeight: 'bold', width: '100%', textAlign: 'right', outline: 'none', color: type === 'expense' ? '#ef4444' : '#10b981', background: 'transparent', overflow: 'hidden' }}>
              {amount}
            </div>
          </div>

          {/* 項目與快捷 */}
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', background: '#F8F6F0', borderRadius: '20px', border: '1px solid #EAE3D2', overflow: 'visible', position: 'relative' }}>
                <button onClick={handlePrevDay} style={{ background: 'transparent', border: 'none', padding: '12px 15px', color: '#D5B77A', fontSize: '14px', cursor: 'pointer', fontWeight: 'bold' }}>◀</button>
                <div 
                  onClick={() => setShowCalendar(!showCalendar)}
                  style={{ flex: 1, padding: '12px 0', fontSize: '15px', color: '#5C5446', textAlign: 'center', fontWeight: '500', cursor: 'pointer' }}
                >
                  {date}
                </div>
                <button onClick={handleNextDay} style={{ background: 'transparent', border: 'none', padding: '12px 15px', color: '#D5B77A', fontSize: '14px', cursor: 'pointer', fontWeight: 'bold' }}>▶</button>
                
                {/* 客製化白色 iOS 風格日曆 */}
                {showCalendar && (
                  <div style={{ position: 'absolute', top: '110%', left: '50%', transform: 'translateX(-50%)', width: '280px', background: '#fff', borderRadius: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100, padding: '16px', border: '1px solid #EAE3D2' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <button onClick={handlePrevMonth} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#5C5446', padding: '5px' }}>◀</button>
                      <div style={{ fontWeight: 'bold', color: '#333' }}>{calendarMonth.getFullYear()}年 {calendarMonth.getMonth() + 1}月</div>
                      <button onClick={handleNextMonth} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: '#5C5446', padding: '5px' }}>▶</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '8px' }}>
                      {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d} style={{ fontSize: '12px', color: '#999' }}>{d}</div>)}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                      {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay() }).map((_, i) => <div key={`empty-${i}`} />)}
                      {Array.from({ length: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate() }).map((_, i) => {
                        const yyyy = calendarMonth.getFullYear();
                        const mm = String(calendarMonth.getMonth() + 1).padStart(2, '0');
                        const dd = String(i + 1).padStart(2, '0');
                        const dateStr = `${yyyy}-${mm}-${dd}`;
                        const isSelected = dateStr === date;
                        const isToday = dateStr === new Date().toISOString().split('T')[0];
                        return (
                          <div key={i} onClick={() => { setDate(dateStr); setShowCalendar(false); }} style={{ padding: '8px 0', textAlign: 'center', cursor: 'pointer', background: isSelected ? '#D5B77A' : 'transparent', color: isSelected ? '#fff' : (isToday ? '#D5B77A' : '#333'), borderRadius: '50%', fontWeight: isSelected || isToday ? 'bold' : 'normal', fontSize: '14px' }}>{i + 1}</div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <input 
                type="text" 
                placeholder="請輸入項目名稱" 
                value={item}
                onChange={(e) => setItem(e.target.value)}
                style={{ flex: 1, padding: '12px', fontSize: '16px', border: '1px solid #EAE3D2', borderRadius: '20px', boxSizing: 'border-box', color: '#5C5446', background: '#F8F6F0' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '5px' }}>
              {shortcuts.map(s => (
                <button 
                  key={s} 
                  onClick={() => setItem(s)}
                  style={{ whiteSpace: 'nowrap', padding: '8px 16px', background: item === s ? '#D5B77A' : '#EAE3D2', color: item === s ? '#fff' : '#5C5446', border: 'none', borderRadius: '24px', fontSize: '14px', cursor: 'pointer' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* 付款人 */}
          <div>
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px', fontWeight: 'bold' }}>付款人</div>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '5px' }}>
              {availablePayers.map(p => (
                <button 
                  key={p} 
                  onClick={() => setPayer(p)}
                  style={{ whiteSpace: 'nowrap', padding: '8px 16px', background: payer === p ? '#D5B77A' : '#EAE3D2', color: payer === p ? '#fff' : '#5C5446', border: 'none', borderRadius: '24px', fontSize: '14px', cursor: 'pointer' }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* 分類 */}
          <div>
            <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px', fontWeight: 'bold' }}>分類</div>
            <div className="category-grid" style={{ padding: 0, maxHeight: '150px' }}>
              {categories.map(cat => (
                <button key={cat} className={`cat-btn ${category === cat ? 'active' : ''}`} onClick={() => setCategory(cat)}>{cat}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="keypad">
          {keys.map(k => (
            <button key={k} className={`keypad-btn ${k === '完成' ? 'submit' : ''}`} onClick={() => handleKeyClick(k)}>{k}</button>
          ))}
        </div>
      </div>
    </div>
  );
}