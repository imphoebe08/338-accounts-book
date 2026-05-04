import { useState } from 'react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from './config';

export default function Transactions() {
  const [type, setType] = useState('expense'); // 'expense' (支出) 或 'income' (收入)
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0], // 預設為今天 (YYYY-MM-DD)
    item: '',
    amount: '',
    category: EXPENSE_CATEGORIES[0],
    payer: ''
  });

  // 切換 支出/收入
  const handleTypeChange = (newType) => {
    setType(newType);
    // 切換時，將分類重置為該類別的第一個選項
    setFormData((prev) => ({
      ...prev,
      category: newType === 'expense' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]
    }));
  };

  // 處理表單輸入
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // 提交表單
  const handleSubmit = (e) => {
    e.preventDefault();
    // 這裡我們先用 alert 測試，下一步會替換成存入 Firebase 的程式碼
    alert('準備存入資料庫：\n' + JSON.stringify({ type, ...formData }, null, 2));
    
    // 提交後清空表單（保留日期與付款人方便連續記帳）
    setFormData((prev) => ({
      ...prev,
      item: '',
      amount: '',
      category: type === 'expense' ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]
    }));
  };

  // 根據當前選擇的 type 決定要顯示哪一組分類
  const currentCategories = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>新增收支</h2>
      </div>

      <div className="card">
        <div style={{ display: 'flex', marginBottom: '20px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #10b981' }}>
          <button 
            style={{ flex: 1, padding: '10px', background: type === 'expense' ? '#10b981' : 'white', color: type === 'expense' ? 'white' : '#10b981', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
            onClick={() => handleTypeChange('expense')}
          >
            支出
          </button>
          <button 
            style={{ flex: 1, padding: '10px', background: type === 'income' ? '#10b981' : 'white', color: type === 'income' ? 'white' : '#10b981', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
            onClick={() => handleTypeChange('income')}
          >
            收入
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <InputGroup label="日期" name="date" type="date" value={formData.date} onChange={handleChange} required />
          <InputGroup label="項目" name="item" type="text" placeholder="例如：午餐、車資" value={formData.item} onChange={handleChange} required />
          <InputGroup label="金額" name="amount" type="number" placeholder="0" min="0" value={formData.amount} onChange={handleChange} required />
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '14px', color: '#666', fontWeight: 'bold' }}>分類</label>
            <select name="category" value={formData.category} onChange={handleChange} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '16px', backgroundColor: 'white' }}>
              {currentCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>

          <InputGroup label="付款人" name="payer" type="text" placeholder="例如：自己、Bobo" value={formData.payer} onChange={handleChange} required />

          <button type="submit" style={{ marginTop: '10px', padding: '14px', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>
            新增紀錄
          </button>
        </form>
      </div>
    </div>
  );
}

// 建立一個共用的 Input 元件讓程式碼更乾淨
function InputGroup({ label, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label style={{ fontSize: '14px', color: '#666', fontWeight: 'bold' }}>{label}</label>
      <input style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '16px' }} {...props} />
    </div>
  );
}