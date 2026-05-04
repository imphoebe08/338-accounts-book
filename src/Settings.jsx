import { useState, useEffect } from 'react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, EXPENSE_SHORTCUTS, INCOME_SHORTCUTS, PAYERS, STOCKS, BANKS } from './config';
import { collection, addDoc, doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

export default function Settings() {
  const [expenseCats, setExpenseCats] = useState(EXPENSE_CATEGORIES);
  const [incomeCats, setIncomeCats] = useState(INCOME_CATEGORIES);
  const [expenseShorts, setExpenseShorts] = useState(EXPENSE_SHORTCUTS);
  const [incomeShorts, setIncomeShorts] = useState(INCOME_SHORTCUTS);
  const [payers, setPayers] = useState(PAYERS);
  const [stocks, setStocks] = useState(STOCKS);
  const [banks, setBanks] = useState(BANKS);

  // 載入 Firebase 設定資料
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'user_prefs'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.expenseCats) setExpenseCats(data.expenseCats);
        if (data.incomeCats) setIncomeCats(data.incomeCats);
        if (data.expenseShorts) setExpenseShorts(data.expenseShorts);
        if (data.incomeShorts) setIncomeShorts(data.incomeShorts);
        if (data.payers) setPayers(data.payers);
        if (data.stocks) setStocks(data.stocks);
        if (data.banks) setBanks(data.banks);
      } else {
        // 如果是全新狀態，自動推入預設檔
        setDoc(doc(db, 'settings', 'user_prefs'), {
          expenseCats: EXPENSE_CATEGORIES, incomeCats: INCOME_CATEGORIES,
          expenseShorts: EXPENSE_SHORTCUTS, incomeShorts: INCOME_SHORTCUTS,
          payers: PAYERS, stocks: STOCKS, banks: BANKS
        });
      }
    });
    return () => unsub();
  }, []);

  // 更新資料回 Firebase
  const updateSetting = async (key, newList) => {
    await setDoc(doc(db, 'settings', 'user_prefs'), { [key]: newList }, { merge: true });
  };

  // 處理 Notion CSV 匯入邏輯
  const handleFileUpload = (e, fileType) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      // 1. 移除檔案開頭的 BOM 與 Windows 的 \r 換行符號
      const content = evt.target.result.replace(/^\uFEFF/, '').replace(/\r/g, '');
      const lines = content.split('\n').filter(line => line.trim() !== '');
      if (lines.length < 2) {
        alert('檔案格式錯誤或無資料！');
        return;
      }

      // 2. 實作穩健的 CSV 單行解析器（處理雙引號與欄位內的逗號）
      const parseCsvLine = (text) => {
        let ret = [], col = '', inQuote = false;
        for (let i = 0; i < text.length; i++) {
          let char = text[i];
          if (inQuote) {
            if (char === '"') {
              if (text[i + 1] === '"') { col += '"'; i++; } // 處理跳脫的雙引號
              else inQuote = false;
            } else col += char;
          } else {
            if (char === '"') inQuote = true;
            else if (char === ',') { ret.push(col.trim()); col = ''; }
            else col += char;
          }
        }
        ret.push(col.trim());
        return ret;
      };

      // 解析標題與內容
      const headers = parseCsvLine(lines[0]);
      const data = lines.slice(1).map(line => {
        const values = parseCsvLine(line);
        const rowObj = headers.reduce((acc, curr, index) => ({ ...acc, [curr]: values[index] }), {});
        
        const rawAmount = rowObj['金額'] ? String(rowObj['金額']).replace(/[^0-9.-]+/g, '') : '0';
        
        let rawDate = String(rowObj['日期'] || '').trim();
        let parsedDate = new Date().toISOString().split('T')[0]; // 預設為今天

        if (rawDate) {
          // 1. 嘗試擷取 YYYY/MM/DD, YYYY-MM-DD 或 YYYY年MM月DD日
          const match = rawDate.match(/(\d{4})[^\d](\d{1,2})[^\d](\d{1,2})/);
          if (match) {
            parsedDate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
          } else {
            // 2. 退回使用 JS Date 解析 (相容英文格式或 Notion 日期區間)
            const d = new Date(rawDate.split(/[→>]/)[0].trim());
            if (!isNaN(d.getTime())) {
              // 避免 toISOString 的時區差問題，手動轉為 Local YYYY-MM-DD
              const yyyy = d.getFullYear();
              const mm = String(d.getMonth() + 1).padStart(2, '0');
              const dd = String(d.getDate()).padStart(2, '0');
              parsedDate = `${yyyy}-${mm}-${dd}`;
            }
          }
        }

        // ===== 增強版智慧收支判斷邏輯 =====
        const categoryStr = (rowObj['分類'] || '').trim();
        let isIncome = false;
        const typeStr = String(rowObj['類型'] || rowObj['收支'] || rowObj['Type'] || '');
        
        // 1. 若 CSV 有明確的類型欄位
        if (typeStr.includes('收') || typeStr.toLowerCase().includes('income')) {
          isIncome = true;
        } else if (typeStr.includes('支') || typeStr.toLowerCase().includes('expense')) {
          isIncome = false;
        } 
        // 2. 若金額帶有負號，通常代表支出
        else if (rawAmount.includes('-')) {
          isIncome = false;
        } 
        // 3. 根據分類或內容關鍵字聰明猜測
        else {
          const incomeKeywords = ['薪', '獎金', '利息', '收入', '中獎', '發票', '退款', '回饋', '股息'];
          isIncome = incomeCats.includes(categoryStr) || 
                     incomeKeywords.some(k => categoryStr.includes(k)) ||
                     incomeKeywords.some(k => String(rowObj['內容'] || '').includes(k));
        }

        const finalAmount = Math.abs(Number(rawAmount) || 0); // 存入 DB 一律轉正數

        return {
          item: rowObj['內容'] || '',
          payer: rowObj['付款人'] || '',
          category: categoryStr || '其他',
          date: parsedDate,
          amount: finalAmount,
        type: fileType // 強制使用上傳時指定的類型 (income 或 expense)
        };
      }).filter(item => item.item !== '' || item.amount !== 0); // 濾除無效空行

      // 1. 寫入本地端資料庫 (LocalStorage) 測試
      const existingData = JSON.parse(localStorage.getItem('local_transactions') || '[]');
      const updatedData = [...existingData, ...data];
      localStorage.setItem('local_transactions', JSON.stringify(updatedData));

      console.log('準備匯入的 CSV 資料:', data);
      
      // 2. 正式寫入 Firebase
      try {
        await Promise.all(data.map(item => addDoc(collection(db, "transactions"), item)));
        alert(`成功讀取 ${data.length} 筆資料，並已全部上傳至 Firebase 雲端！`);
      } catch (error) {
        console.error("Firebase 上傳失敗:", error);
      }

      e.target.value = ''; // 清空輸入框以便重複上傳
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '20px' }}>設定</h2>
      
      <CollapsibleCard title="支出設定" titleColor="#ef4444">
        <h4 style={{ color: '#333', fontSize: '15px' }}>分類管理</h4>
        <ManageList items={expenseCats} onUpdate={(list) => updateSetting('expenseCats', list)} label="支出分類" color="#ef4444" />
        
        <h4 style={{ color: '#333', fontSize: '15px' }}>快捷輸入管理</h4>
        <ManageList items={expenseShorts} onUpdate={(list) => updateSetting('expenseShorts', list)} label="支出快捷" color="#ef4444" />
      </CollapsibleCard>

      <CollapsibleCard title="收入設定" titleColor="#10b981">
        <h4 style={{ color: '#333', fontSize: '15px' }}>分類管理</h4>
        <ManageList items={incomeCats} onUpdate={(list) => updateSetting('incomeCats', list)} label="收入分類" color="#10b981" />

        <h4 style={{ color: '#333', fontSize: '15px' }}>快捷輸入管理</h4>
        <ManageList items={incomeShorts} onUpdate={(list) => updateSetting('incomeShorts', list)} label="收入快捷" color="#10b981" />
      </CollapsibleCard>

      <CollapsibleCard title="其他管理" titleColor="#3b82f6">
        <h4 style={{ color: '#333', fontSize: '15px' }}>付款/存款/持有人設定</h4>
        <ManageList items={payers} onUpdate={(list) => updateSetting('payers', list)} label="付款/存款/持有人" color="#3b82f6" />

        <h4 style={{ color: '#333', fontSize: '15px' }}>股票與代碼管理</h4>
        <ManageList items={stocks} onUpdate={(list) => updateSetting('stocks', list)} label="股票與代碼" color="#3b82f6" />

        <h4 style={{ color: '#333', fontSize: '15px' }}>銀行與券商管理</h4>
        <ManageList items={banks} onUpdate={(list) => updateSetting('banks', list)} label="銀行與券商" color="#3b82f6" />
      </CollapsibleCard>

      <CollapsibleCard title="資料匯入" titleColor="#8b5cf6">
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>支援 Notion CSV 匯入，請確保第一行欄位標題包含：「內容,付款人,分類,日期,金額」。請將收入與支出分開上傳：</p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#10b981' }}>匯入「收入」CSV</h4>
            <input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'income')} style={{ display: 'block', width: '100%', padding: '15px', border: '2px dashed #10b981', borderRadius: '20px', cursor: 'pointer', color: '#666', background: '#EAE3D2', boxSizing: 'border-box' }} />
          </div>
          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#ef4444' }}>匯入「支出」CSV</h4>
            <input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'expense')} style={{ display: 'block', width: '100%', padding: '15px', border: '2px dashed #ef4444', borderRadius: '20px', cursor: 'pointer', color: '#666', background: '#F8F6F0', boxSizing: 'border-box' }} />
          </div>
        </div>
      </CollapsibleCard>

    </div>
  );
}

// 收縮/展開卡片元件
function CollapsibleCard({ title, titleColor, children }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="card" style={{ marginBottom: '20px' }}>
      <h3 
        onClick={() => setIsOpen(!isOpen)}
        style={{ margin: 0, marginTop: 0, color: titleColor, borderBottom: isOpen ? '1px solid #eee' : 'none', paddingBottom: isOpen ? '10px' : '0', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
      >
        {title}
        <span style={{ fontSize: '14px', color: '#999' }}>{isOpen ? '▲' : '▼'}</span>
      </h3>
      {isOpen && <div style={{ marginTop: '15px' }}>{children}</div>}
    </div>
  );
}

// 共用的管理清單元件 (包含新增、編輯、刪除)
function ManageList({ items = [], onUpdate, label, color }) {
  const handleAdd = () => {
    const newItem = prompt(`請輸入新的${label}：`);
    if (newItem && newItem.trim()) {
      onUpdate([...items, newItem.trim()]);
    }
  };

  const handleEdit = (index) => {
    const newValue = prompt(`請編輯${label}：`, items[index]);
    if (newValue && newValue.trim() && newValue !== items[index]) {
      const newList = [...items];
      newList[index] = newValue.trim();
      onUpdate(newList);
    }
  };

  const handleDelete = (index) => {
    if (window.confirm(`確定要刪除「${items[index]}」嗎？`)) {
      onUpdate(items.filter((_, i) => i !== index));
    }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
      {items.map((item, index) => (
        <div key={`${item}-${index}`} style={{ display: 'flex', alignItems: 'center', background: '#F8F6F0', borderRadius: '24px', overflow: 'hidden', border: '1px solid #EAE3D2' }}>
          <span onClick={() => handleEdit(index)} style={{ padding: '8px 10px 8px 14px', fontSize: '14px', color: '#5C5446', cursor: 'pointer' }} title="點擊編輯">{item}</span>
          <button onClick={() => handleDelete(index)} style={{ padding: '8px 12px', background: 'transparent', border: 'none', color: '#999', cursor: 'pointer', fontSize: '14px' }} title="刪除">✕</button>
        </div>
      ))}
      <button onClick={handleAdd} style={{ padding: '8px 14px', background: '#fff', border: `1px dashed ${color}`, color: color, borderRadius: '24px', cursor: 'pointer', fontWeight: 'bold' }}>+ 新增{label}</button>
    </div>
  );
}