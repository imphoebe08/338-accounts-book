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

  const categories = type === 'expense' ? configData.expenseCats : configData.incomeCats;
  const shortcuts = type === 'expense' ? configData.expenseShorts : configData.incomeShorts;
  const availablePayers = configData.payers || PAYERS;
  const [category, setCategory] = useState(editData?.category || EXPENSE_CATEGORIES[0]);
  const [payer, setPayer] = useState(editData?.payer || availablePayers[0] || '');

  // 處理計算機按鍵點擊
  const handleKeyClick = (key) => {
    if (key === '⌫') {
      setAmount(amount.length > 1 ? amount.slice(0, -1) : '0');
    } else if (key === 'C') {
      setAmount('0');
    } else if (key === '今天') {
      // 未來可擴充為日期選擇器
    } else if (key === '完成') {
      handleSubmit();
    } else {
      setAmount(amount === '0' && key !== '+' && key !== '-' ? key : amount + key);
    }
  };

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
        });
      } else {
        await addDoc(collection(db, 'transactions'), {
          type,
          item: item || category,
          category,
          payer,
          amount: finalAmount,
          date: new Date().toISOString().split('T')[0], // 新增時預設使用今天日期
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
            <input 
              type="text" 
              placeholder="請輸入項目名稱 (例如: 午餐)" 
              value={item}
              onChange={(e) => setItem(e.target.value)}
              style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid #EAE3D2', borderRadius: '20px', marginBottom: '10px', boxSizing: 'border-box', color: '#5C5446', background: '#F8F6F0' }}
            />
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