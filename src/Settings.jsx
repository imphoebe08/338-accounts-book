// 設定與資料管理頁面
import { useState, useEffect } from 'react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, EXPENSE_SHORTCUTS, INCOME_SHORTCUTS, PAYERS, STOCKS, BANKS } from './config';
import { collection, addDoc, doc, setDoc, onSnapshot, getDocs, query, orderBy, where, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export default function Settings() {
  const [expenseCats, setExpenseCats] = useState(EXPENSE_CATEGORIES);
  const [incomeCats, setIncomeCats] = useState(INCOME_CATEGORIES);
  const [expenseShorts, setExpenseShorts] = useState(EXPENSE_SHORTCUTS);
  const [incomeShorts, setIncomeShorts] = useState(INCOME_SHORTCUTS);
  const [payers, setPayers] = useState(PAYERS);
  const [stocks, setStocks] = useState(STOCKS);
  const [banks, setBanks] = useState(BANKS);

  // 匯出 CSV 用的日期範圍
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');

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

  // 處理分類更名與合併歷史紀錄
  const handleCategoryUpdate = async (key, newList, oldValue, newValue) => {
    await updateSetting(key, newList);
    
    if (oldValue && newValue && oldValue !== newValue) {
      if (window.confirm(`💡 偵測到分類名稱變更！\n\n是否要將所有歷史紀錄中的「${oldValue}」一併自動更改為「${newValue}」？\n(這能幫助您整合有 Emoji 與沒有 Emoji 的分類)`)) {
        try {
          const q = query(collection(db, "transactions"), where("category", "==", oldValue));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            const updates = [];
            snapshot.forEach(docSnap => {
              updates.push(updateDoc(doc(db, "transactions", docSnap.id), { category: newValue }));
            });
            await Promise.all(updates);
            alert(`✅ 成功統整！已將 ${updates.length} 筆歷史紀錄更新為「${newValue}」！`);
          }
        } catch (e) {
          console.error(e);
          alert("更新歷史紀錄失敗！");
        }
      }
    }
  };

  // 自動從歷史紀錄補齊缺少的設定
  const handleSyncFromHistory = async () => {
    try {
      const snapshot = await getDocs(collection(db, "transactions"));
      if (snapshot.empty) {
        alert('目前沒有歷史紀錄！');
        return;
      }

      const newExpCats = new Set(expenseCats);
      const newIncCats = new Set(incomeCats);
      const newPayerSet = new Set(payers);
      let updated = false;

      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        if (d.category && d.category !== '其他') {
          if (d.type === 'expense' && !newExpCats.has(d.category)) {
            newExpCats.add(d.category);
            updated = true;
          } else if (d.type === 'income' && !newIncCats.has(d.category)) {
            newIncCats.add(d.category);
            updated = true;
          }
        }
        if (d.payer && !newPayerSet.has(d.payer)) {
          newPayerSet.add(d.payer);
          updated = true;
        }
      });

      if (updated) {
        await setDoc(doc(db, 'settings', 'user_prefs'), {
          expenseCats: Array.from(newExpCats),
          incomeCats: Array.from(newIncCats),
          payers: Array.from(newPayerSet)
        }, { merge: true });
        alert('✅ 掃描完成！已為您自動補齊缺少的分類與付款人。\n您現在可以透過上方的管理清單重新命名或合併它們了！');
      } else {
        alert('目前設定已是最新，歷史紀錄中沒有缺少的分類或付款人！');
      }
    } catch (e) {
      console.error(e);
      alert('掃描失敗，請稍後再試！');
    }
  };

  // 下載 CSV 工具函式
  const downloadCSV = (csvContent, fileName) => {
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // 加上 \uFEFF BOM 避免 Excel 中文亂碼
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 處理匯出 CSV 邏輯
  const handleExportCSV = async (type) => {
    try {
      if (type === 'transactions') {
        const snapshot = await getDocs(query(collection(db, "transactions"), orderBy("date", "desc")));
        if (snapshot.empty) return alert('目前沒有收支紀錄可以匯出');

        let dataToExport = [];
        snapshot.forEach(doc => dataToExport.push(doc.data()));

        if (exportStartDate) dataToExport = dataToExport.filter(d => d.date >= exportStartDate);
        if (exportEndDate) dataToExport = dataToExport.filter(d => d.date <= exportEndDate);

        if (dataToExport.length === 0) return alert('在此日期區間內沒有收支紀錄可以匯出');

        let csv = '日期,類型,分類,項目內容,付款人,金額\n';
        dataToExport.forEach(d => {
          csv += `${d.date},${d.type === 'expense' ? '支出' : '收入'},${d.category},${d.item || ''},${d.payer || ''},${d.amount}\n`;
        });
        
        const rangeStr = (exportStartDate || exportEndDate) ? `_${exportStartDate || '起'}至${exportEndDate || '今'}` : '';
        downloadCSV(csv, `收支紀錄備份${rangeStr}.csv`);
      } else if (type === 'assets') {
        const snapshot = await getDocs(collection(db, "assets"));
        if (snapshot.empty) return alert('目前沒有財產清單可以匯出');
        let csv = '資產類型,項目名稱,銀行/券商,持有人,持有股數,單筆/現有金額/持有均價,預定利率,開始日,到期日,參考現值\n';
        snapshot.forEach(doc => {
          const d = doc.data();
          const t = d.type === 'stock' ? '股票' : (d.type === 'demand' ? '活期存款' : '定期存款');
          csv += `${t},${d.item},${d.bank},${d.holder || ''},${d.shares || ''},${d.cost || d.amount || ''},${d.interestRate || ''},${d.startDate || ''},${d.endDate || ''},${d.refPrice || ''}\n`;
        });
        downloadCSV(csv, `財產清單備份_${new Date().toISOString().split('T')[0]}.csv`);
      }
    } catch (e) {
      alert('匯出時發生錯誤！');
    }
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
        
        const rawAmountVal = rowObj['金額'] || rowObj['花費'] || rowObj['支出'] || rowObj['收入'] || '0';
        const rawAmount = String(rawAmountVal).replace(/[^0-9.-]+/g, '');
        
        let rawDate = String(rowObj['日期'] || rowObj['記帳日期'] || rowObj['消費日期'] || '').trim();
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
        // 處理第三方記帳軟體：將「主分類」作為實際分類，若「分類」為支出/收入則過濾掉
        let categoryStr = (rowObj['主分類'] || rowObj['子分類'] || rowObj['分類'] || '').trim();
        if (categoryStr === '支出' || categoryStr === '收入') categoryStr = '';

        // 舊分類自動轉換對應表 (包含全轉小寫比對與錯字相容)
        const categoryMapping = {
          '伙食': '飲食',
          '購物': '生活',
          '日用品': '生活',
          '數位': '數位訂閱',
          '變漂漂': '打扮',
          '治裝費': '打扮',
          '學貸': '貸款',
          '露營': '娛樂',
          '淘寶': '生活',
          '旅遊': '娛樂',
          'swift': '交通',
          'switft': '交通'
        };
        
        const lowerCat = categoryStr.toLowerCase();
        if (categoryMapping[lowerCat]) {
          categoryStr = categoryMapping[lowerCat];
        }

        let isIncome = false;
        const typeStr = String(rowObj['類型'] || rowObj['收支'] || rowObj['Type'] || rowObj['分類'] || '');
        
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
          item: rowObj['內容'] || rowObj['備註'] || rowObj['項目'] || rowObj['說明'] || '',
          payer: rowObj['付款人'] || '',
          category: categoryStr || '其他',
          date: parsedDate,
          amount: finalAmount,
          type: fileType === 'auto' ? (isIncome ? 'income' : 'expense') : fileType
        };
      }).filter(item => item.item !== '' || item.amount !== 0); // 濾除無效空行

      // 1. 寫入本地端資料庫 (LocalStorage) 測試
      const existingData = JSON.parse(localStorage.getItem('local_transactions') || '[]');
      const updatedData = [...existingData, ...data];
      localStorage.setItem('local_transactions', JSON.stringify(updatedData));

      console.log('準備匯入的 CSV 資料:', data);
      
      // 2. 正式寫入 Firebase
      try {
        // 自動把沒見過的新分類加進系統設定清單裡
        const newExpenseCats = new Set(expenseCats);
        const newIncomeCats = new Set(incomeCats);
        let settingsUpdated = false;

        data.forEach(item => {
          if (item.category && item.category !== '其他') {
            if (item.type === 'expense' && !newExpenseCats.has(item.category)) {
              newExpenseCats.add(item.category);
              settingsUpdated = true;
            } else if (item.type === 'income' && !newIncomeCats.has(item.category)) {
              newIncomeCats.add(item.category);
              settingsUpdated = true;
            }
          }
        });

        if (settingsUpdated) {
          updateSetting('expenseCats', Array.from(newExpenseCats));
          updateSetting('incomeCats', Array.from(newIncomeCats));
        }

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
        <ManageList items={expenseCats} onUpdate={(list, oldV, newV) => handleCategoryUpdate('expenseCats', list, oldV, newV)} label="支出分類" color="#ef4444" />
        
        <h4 style={{ color: '#333', fontSize: '15px' }}>快捷輸入管理</h4>
        <ManageList items={expenseShorts} onUpdate={(list) => updateSetting('expenseShorts', list)} label="支出快捷" color="#ef4444" />
      </CollapsibleCard>

      <CollapsibleCard title="收入設定" titleColor="#10b981">
        <h4 style={{ color: '#333', fontSize: '15px' }}>分類管理</h4>
        <ManageList items={incomeCats} onUpdate={(list, oldV, newV) => handleCategoryUpdate('incomeCats', list, oldV, newV)} label="收入分類" color="#10b981" />

        <h4 style={{ color: '#333', fontSize: '15px' }}>快捷輸入管理</h4>
        <ManageList items={incomeShorts} onUpdate={(list) => updateSetting('incomeShorts', list)} label="收入快捷" color="#10b981" />
      </CollapsibleCard>

      <CollapsibleCard title="其他管理" titleColor="#3b82f6">
        <div style={{ marginBottom: '25px', padding: '15px', background: '#F0F4FF', borderRadius: '16px', border: '1px solid #BFDBFE' }}>
          <div style={{ fontSize: '14px', color: '#3b82f6', fontWeight: 'bold', marginBottom: '8px' }}>自動同步歷史設定</div>
          <p style={{ fontSize: '12px', color: '#666', margin: '0 0 10px 0' }}>若有匯入舊資料導致分類未顯示，點擊下方按鈕將自動從紀錄中找出並加回清單。</p>
          <button onClick={handleSyncFromHistory} style={{ width: '100%', padding: '10px', background: '#fff', border: '1px dashed #3b82f6', color: '#3b82f6', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>
            🔄 掃描並補齊缺少的分類 / 付款人
          </button>
        </div>

        <h4 style={{ color: '#333', fontSize: '15px' }}>付款/存款/持有人設定</h4>
        <ManageList items={payers} onUpdate={(list) => updateSetting('payers', list)} label="付款/存款/持有人" color="#3b82f6" />

        <h4 style={{ color: '#333', fontSize: '15px' }}>股票與代碼管理</h4>
        <ManageStockList items={stocks} onUpdate={(list) => updateSetting('stocks', list)} />

        <h4 style={{ color: '#333', fontSize: '15px' }}>銀行與券商管理</h4>
        <ManageList items={banks} onUpdate={(list) => updateSetting('banks', list)} label="銀行與券商" color="#3b82f6" />
      </CollapsibleCard>

      <CollapsibleCard title="資料匯入" titleColor="#8b5cf6">
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>支援 Notion CSV 匯入，請確保第一行欄位標題包含：「內容,付款人,分類,日期,金額」。請將收入與支出分開上傳：</p>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>支援 Notion 與第三方記帳 APP 的 CSV 匯入。系統會自動辨識常見的欄位名稱 (如：主分類、記帳日期、備註) 並過濾不支援的欄位。</p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#3b82f6' }}>匯入「通用 / 第三方 APP」CSV</h4>
            <input type="file" accept=".csv" onChange={(e) => handleFileUpload(e, 'auto')} style={{ display: 'block', width: '100%', padding: '15px', border: '2px dashed #3b82f6', borderRadius: '20px', cursor: 'pointer', color: '#666', background: '#F0F4FF', boxSizing: 'border-box' }} />
          </div>
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

      <CollapsibleCard title="資料備份與匯出" titleColor="#f59e0b">
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>將雲端的資料匯出成 CSV 檔案，你可以將其作為本地備份，或是匯入至 Notion 表格中作進階管理與歸檔。</p>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#5C5446' }}>匯出期間 (選填):</span>
          <input type="date" value={exportStartDate} onChange={e => setExportStartDate(e.target.value)} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #EAE3D2', color: '#5C5446', outline: 'none' }} />
          <span style={{ color: '#999' }}>至</span>
          <input type="date" value={exportEndDate} onChange={e => setExportEndDate(e.target.value)} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #EAE3D2', color: '#5C5446', outline: 'none' }} />
        </div>

        <div style={{ display: 'flex', gap: '15px' }}>
          <button onClick={() => handleExportCSV('transactions')} style={{ flex: 1, padding: '12px', background: '#fff', border: '2px solid #f59e0b', color: '#f59e0b', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold' }}>📥 匯出收支紀錄</button>
          <button onClick={() => handleExportCSV('assets')} style={{ flex: 1, padding: '12px', background: '#fff', border: '2px solid #3b82f6', color: '#3b82f6', borderRadius: '16px', cursor: 'pointer', fontWeight: 'bold' }}>📥 匯出財產清單</button>
        </div>
      </CollapsibleCard>

    </div>
  );
}

// 專門用於股票管理的清單元件 (區分代碼與名稱)
function ManageStockList({ items = [], onUpdate }) {
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');

  const handleAdd = () => {
    if (newSymbol.trim() && newName.trim()) {
      onUpdate([...items, { symbol: newSymbol.trim(), name: newName.trim() }]);
      setNewSymbol('');
      setNewName('');
    } else {
      alert('請同時輸入股票代碼與名稱！');
    }
  };

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
        <input type="text" placeholder="代碼 (如: 2330)" value={newSymbol} onChange={e => setNewSymbol(e.target.value)} style={{ flex: 1, padding: '8px 12px', borderRadius: '12px', border: '1px solid #EAE3D2', outline: 'none' }} />
        <input type="text" placeholder="名稱 (如: 台積電)" value={newName} onChange={e => setNewName(e.target.value)} style={{ flex: 1.5, padding: '8px 12px', borderRadius: '12px', border: '1px solid #EAE3D2', outline: 'none' }} />
        <button onClick={handleAdd} style={{ padding: '8px 16px', background: '#fff', border: `1px dashed #3b82f6`, color: '#3b82f6', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>+ 新增</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        {items.map((item, index) => {
          const isObj = typeof item === 'object' && item !== null;
          const symbol = isObj ? item.symbol : (item.match(/\(([A-Za-z0-9.]+)\)/) || item.match(/\d{4,}/) || item.match(/[A-Za-z0-9.]+/) || [''])[0].replace(/[()]/g, '');
          const name = isObj ? item.name : item.replace(/\([A-Za-z0-9.]+\)/, '').replace(/[A-Za-z0-9.]+/g, '').trim();
          return (
            <div key={index} style={{ display: 'flex', alignItems: 'center', background: '#F8F6F0', borderRadius: '24px', overflow: 'hidden', border: '1px solid #EAE3D2' }}>
              <span style={{ padding: '8px 10px 8px 14px', fontSize: '14px', color: '#5C5446' }}>{symbol} {name}</span>
              <button onClick={() => { if (window.confirm('確定要刪除嗎？')) onUpdate(items.filter((_, i) => i !== index)); }} style={{ padding: '8px 12px', background: 'transparent', border: 'none', color: '#999', cursor: 'pointer', fontSize: '14px' }} title="刪除">✕</button>
            </div>
          );
        })}
      </div>
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