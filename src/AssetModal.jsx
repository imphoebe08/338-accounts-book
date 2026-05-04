import { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import { STOCKS, BANKS, PAYERS } from './config';

export default function AssetModal({ onClose }) {
  const [assetType, setAssetType] = useState('stock'); // 'stock', 'demand', 'fixed'
  const [formData, setFormData] = useState({
    item: '', shares: '', cost: '', bank: '', holder: '', amount: '', fixedType: '整存整付'
  });

  const [configData, setConfigData] = useState({
    stocks: STOCKS || [],
    banks: BANKS || [],
    payers: PAYERS || []
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'user_prefs'), (docSnap) => {
      if (docSnap.exists()) {
        setConfigData(prev => ({ ...prev, ...docSnap.data() }));
      }
    });
    return () => unsub();
  }, []);

  const availableStocks = configData.stocks || STOCKS || [];
  const availableBanks = configData.banks || BANKS || [];
  const availablePayers = configData.payers || PAYERS || [];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.item || !formData.bank) {
      alert('請填寫必填欄位 (項目名稱與銀行)');
      return;
    }
    try {
      const baseData = {
        type: assetType,
        item: formData.item,
        bank: formData.bank,
        holder: formData.holder, // 通用持有人/付款人欄位
        updatedAt: new Date().toISOString().split('T')[0],
      };
      if (assetType === 'stock') {
        baseData.shares = Number(formData.shares) || 0;
        baseData.cost = Number(formData.cost) || 0;
        baseData.refPrice = baseData.cost; // 股票剛新增時參考價為預設成本
      } else {
        baseData.amount = Number(formData.amount) || 0;
        if (assetType === 'fixed') {
          baseData.fixedType = formData.fixedType || '整存整付';
        }
      }
      await addDoc(collection(db, 'assets'), baseData);
      onClose();
    } catch (err) {
      console.error('新增資產失敗:', err);
      alert('發生錯誤，請稍後再試！');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', borderBottom: '1px solid #ddd' }}>
          <button className={`tab-btn ${assetType === 'stock' ? 'active' : ''}`} onClick={() => { setAssetType('stock'); setFormData({item: '', shares: '', cost: '', bank: '', holder: '', amount: '', fixedType: '整存整付'}); }}>股票</button>
          <button className={`tab-btn ${assetType === 'demand' ? 'active' : ''}`} onClick={() => { setAssetType('demand'); setFormData({item: '', shares: '', cost: '', bank: '', holder: '', amount: '', fixedType: '整存整付'}); }}>活期存款</button>
          <button className={`tab-btn ${assetType === 'fixed' ? 'active' : ''}`} onClick={() => { setAssetType('fixed'); setFormData({item: '', shares: '', cost: '', bank: '', holder: '', amount: '', fixedType: '整存整付'}); }}>定期存款</button>
        </div>
        
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', background: '#fff' }}>
          <input type="text" name="item" placeholder="項目名稱 (例如: 台積電、薪轉戶)" value={formData.item} onChange={handleChange} style={{ width: '100%', padding: '10px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box', color: '#333', background: '#fff' }} />
          {assetType === 'stock' && availableStocks.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '5px' }}>
              {availableStocks.map(s => (
                <button key={s} onClick={() => setFormData(prev => ({...prev, item: s}))} style={{ whiteSpace: 'nowrap', padding: '6px 12px', background: formData.item === s ? '#10b981' : '#f0f2f5', color: formData.item === s ? '#fff' : '#333', border: 'none', borderRadius: '20px', fontSize: '14px', cursor: 'pointer' }}>{s}</button>
              ))}
            </div>
          )}

          <input type="text" name="bank" placeholder="銀行 / 券商" value={formData.bank} onChange={handleChange} style={{ width: '100%', padding: '10px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box', color: '#333', background: '#fff' }} />
          {availableBanks.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '5px' }}>
              {availableBanks.map(b => (
                <button key={b} onClick={() => setFormData(prev => ({...prev, bank: b}))} style={{ whiteSpace: 'nowrap', padding: '6px 12px', background: formData.bank === b ? '#10b981' : '#f0f2f5', color: formData.bank === b ? '#fff' : '#333', border: 'none', borderRadius: '20px', fontSize: '14px', cursor: 'pointer' }}>{b}</button>
              ))}
            </div>
          )}
          
          <input type="text" name="holder" placeholder="持有人 / 存款人" value={formData.holder} onChange={handleChange} style={{ width: '100%', padding: '10px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box', color: '#333', background: '#fff' }} />
          {availablePayers.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '5px' }}>
              {availablePayers.map(p => (
                <button key={p} onClick={() => setFormData(prev => ({...prev, holder: p}))} style={{ whiteSpace: 'nowrap', padding: '6px 12px', background: formData.holder === p ? '#10b981' : '#f0f2f5', color: formData.holder === p ? '#fff' : '#333', border: 'none', borderRadius: '20px', fontSize: '14px', cursor: 'pointer' }}>{p}</button>
              ))}
            </div>
          )}
          
          {assetType === 'stock' ? (
            <>
              <input type="number" name="shares" placeholder="持有股數" value={formData.shares} onChange={handleChange} style={{ width: '100%', padding: '10px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box', color: '#333', background: '#fff' }} />
              <input type="number" name="cost" placeholder="持有均價" value={formData.cost} onChange={handleChange} style={{ width: '100%', padding: '10px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box', color: '#333', background: '#fff' }} />
            </>
          ) : (
            <>
              {assetType === 'fixed' && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '5px' }}>
                  <button onClick={() => setFormData(prev => ({...prev, fixedType: '整存整付'}))} style={{ flex: 1, padding: '10px', background: formData.fixedType === '整存整付' ? '#10b981' : '#f0f2f5', color: formData.fixedType === '整存整付' ? '#fff' : '#333', border: 'none', borderRadius: '8px', fontSize: '15px', cursor: 'pointer' }}>整存整付</button>
                  <button onClick={() => setFormData(prev => ({...prev, fixedType: '零存整付'}))} style={{ flex: 1, padding: '10px', background: formData.fixedType === '零存整付' ? '#10b981' : '#f0f2f5', color: formData.fixedType === '零存整付' ? '#fff' : '#333', border: 'none', borderRadius: '8px', fontSize: '15px', cursor: 'pointer' }}>零存整付</button>
                </div>
              )}
              <input type="number" name="amount" placeholder="現有存款金額" value={formData.amount} onChange={handleChange} style={{ width: '100%', padding: '10px', fontSize: '16px', border: '1px solid #ddd', borderRadius: '8px', boxSizing: 'border-box', color: '#333', background: '#fff' }} />
            </>
          )}
          
          <button onClick={handleSubmit} style={{ width: '100%', padding: '14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>完成</button>
        </div>
      </div>
    </div>
  );
}