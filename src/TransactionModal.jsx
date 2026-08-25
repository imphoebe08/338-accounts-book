import { useState, useEffect } from 'react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, EXPENSE_SHORTCUTS, INCOME_SHORTCUTS, PAYERS } from './config';
import { collection, addDoc, doc, updateDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { getOccurrenceId } from './recurring';

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
  const [category, setCategory] = useState(editData?.category || '');
  const [payer, setPayer] = useState(editData?.payer || '');
  const [errors, setErrors] = useState([]);
  const [repeatMonthly, setRepeatMonthly] = useState(false);

  // 平滑關閉動畫狀態
  const [isClosing, setIsClosing] = useState(false);
  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 250); // 等待滑出動畫完成後再真正卸載元件
  };

  // 拖曳下滑關閉邏輯
  const [dragY, setDragY] = useState(0);
  const [startY, setStartY] = useState(0);
  const handleTouchStart = (e) => {
    let target = e.target;
    let shouldIgnoreDrag = false;
    // 檢查點擊位置是否在一個已經有捲動進度的區塊內，避免把拖曳和捲動衝突
    while (target && target !== e.currentTarget) {
      if (target.scrollHeight > target.clientHeight && target.scrollTop > 0) {
        shouldIgnoreDrag = true;
        break;
      }
      target = target.parentNode;
    }
    setStartY(shouldIgnoreDrag ? null : e.touches[0].clientY);
  };
  const handleTouchMove = (e) => {
    if (startY === null) return;
    const currentY = e.touches[0].clientY;
    if (currentY > startY) setDragY(currentY - startY);
  };
  const handleTouchEnd = () => {
    if (dragY > 100) {
      handleClose();
    } else {
      setDragY(0);
    }
  };

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
    // 必填欄位檢測
    const newErrors = [];
    if (!item.trim()) newErrors.push('item');
    if (!payer) newErrors.push('payer');
    if (!category) newErrors.push('category');

    if (newErrors.length > 0) {
      setErrors(newErrors);
      setTimeout(() => setErrors([]), 800); // 800ms 後移除紅框，以便下次還能觸發動畫
      return;
    }

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
          item: item,
          category,
          payer,
          amount: finalAmount,
          date: date,
        });
      } else if (repeatMonthly) {
        const recurringRef = doc(collection(db, 'recurringTransactions'));
        const transactionData = {
          type,
          item,
          category,
          payer,
          amount: finalAmount,
          date,
          recurringId: recurringRef.id,
          isRecurringOccurrence: true,
        };
        const batch = writeBatch(db);
        batch.set(recurringRef, {
          type,
          item,
          category,
          payer,
          amount: finalAmount,
          startDate: date,
          dayOfMonth: Number(date.slice(8, 10)),
          active: true,
          createdAt: new Date().toISOString(),
        });
        batch.set(doc(db, 'transactions', getOccurrenceId(recurringRef.id, date)), transactionData);
        await batch.commit();
      } else {
        await addDoc(collection(db, 'transactions'), {
          type,
          item: item,
          category,
          payer,
          amount: finalAmount,
          date: date,
        });
      }
      handleClose();
    } catch (error) {
      console.error("寫入失敗:", error);
      alert('發生錯誤，請稍後再試！');
    }
  };

  return (
    <div className={`modal-overlay ${isClosing ? 'closing' : ''}`} onClick={handleClose}>
      <div 
        className="bottom-sheet" 
        onClick={(e) => e.stopPropagation()}
        style={{ transform: isClosing ? 'translateY(100%)' : (dragY > 0 ? `translateY(${dragY}px)` : ''), transition: isClosing ? 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)' : (dragY > 0 ? 'none' : 'transform 0.2s ease') }}
        onTouchStart={handleTouchStart} 
        onTouchMove={handleTouchMove} 
        onTouchEnd={handleTouchEnd}
      >
        <div onClick={handleClose} title="點擊收起" style={{ width: '100%', padding: '12px 0', background: '#F8F6F0', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '40px', height: '5px', background: '#D5B77A', borderRadius: '4px', opacity: 0.5 }}></div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #ddd' }}>
          <button className={`tab-btn ${type === 'expense' ? 'active' : ''}`} onClick={() => { setType('expense'); setCategory(''); setPayer(''); setAmount('0'); setItem(''); }}>支出</button>
          <button className={`tab-btn ${type === 'income' ? 'active' : ''}`} onClick={() => { setType('income'); setCategory(''); setPayer(''); setAmount('0'); setItem(''); }}>收入</button>
        </div>
        
        {/* 將表單內容區塊加上 flex: 1 與 overflowY: auto，確保視窗不過高時仍可向下捲動 */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', background: '#fff', flex: 1, overflowY: 'auto' }}>
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
                className={errors.includes('item') ? 'error-shake' : ''}
                style={{ flex: 1, padding: '12px', fontSize: '16px', border: '1px solid #EAE3D2', borderRadius: '20px', boxSizing: 'border-box', color: '#5C5446', background: '#F8F6F0', outline: 'none' }}
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
            <div className={errors.includes('payer') ? 'error-shake' : ''} style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '5px', padding: '2px', borderRadius: '24px' }}>
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
            <div className={`category-grid ${errors.includes('category') ? 'error-shake' : ''}`} style={{ padding: '4px', maxHeight: '150px', borderRadius: '16px' }}>
              {categories.map(cat => (
                <button key={cat} className={`cat-btn ${category === cat ? 'active' : ''}`} onClick={() => setCategory(cat)}>{cat}</button>
              ))}
            </div>
          </div>

          {!editData && (
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', background: '#F8F6F0', border: '1px solid #EAE3D2', borderRadius: '16px', cursor: 'pointer' }}>
              <div>
                <div style={{ fontSize: '14px', color: '#5C5446', fontWeight: 'bold' }}>每月自動重複</div>
                <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>每月同一天自動新增；月底不足天數時使用該月最後一天</div>
              </div>
              <input type="checkbox" checked={repeatMonthly} onChange={(event) => setRepeatMonthly(event.target.checked)} style={{ width: '20px', height: '20px', accentColor: '#D5B77A', flexShrink: 0 }} />
            </label>
          )}
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
