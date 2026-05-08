import { useState, useEffect } from 'react';
import { doc, onSnapshot, collection, addDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { STOCKS, BANKS, PAYERS } from './config';

const DEMAND_SHORTCUTS = ['薪轉戶', '一般活存', '數位帳戶', '證券交割戶'];
const FIXED_SHORTCUTS = ['一般定存', '優利定存', '專案定存', '外幣定存'];

export default function AssetModal({ onClose, editData }) {
  const [assetType, setAssetType] = useState(editData?.type || 'stock'); // 'stock', 'demand', 'fixed'
  const [formData, setFormData] = useState({
    item: editData?.item || '', 
    shares: editData?.shares !== undefined ? String(editData.shares) : '', 
    cost: editData?.cost !== undefined ? String(editData.cost) : '', 
    bank: editData?.bank || '', 
    holder: editData?.holder || '', 
    amount: editData?.amount !== undefined ? String(editData.amount) : '', 
    fixedType: editData?.fixedType || '整存整付', 
    interestRate: editData?.interestRate !== undefined ? String(editData.interestRate) : '', 
    startDate: editData?.startDate || '', 
    endDate: editData?.endDate || '',
    durationMonths: editData?.durationMonths !== undefined ? String(editData.durationMonths) : '',
    renewalCount: editData?.renewalCount !== undefined ? String(editData.renewalCount) : ''
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
  const [errors, setErrors] = useState([]);

  // 平滑關閉動畫狀態
  const [isClosing, setIsClosing] = useState(false);
  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 250);
  };

  // 拖曳下滑關閉邏輯
  const [dragY, setDragY] = useState(0);
  const [startY, setStartY] = useState(0);
  const handleTouchStart = (e) => {
    let target = e.target;
    let shouldIgnoreDrag = false;
    // 若點擊的是輸入框、按鈕等互動元素，直接忽略下拉手勢，確保原生 UI (如日曆) 正常觸發
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) {
      shouldIgnoreDrag = true;
    } else {
      while (target && target !== e.currentTarget) {
        if (target.scrollHeight > target.clientHeight && target.scrollTop > 0) {
          shouldIgnoreDrag = true;
          break;
        }
        target = target.parentNode;
      }
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    const newErrors = [];
    if (!formData.item.trim()) newErrors.push('item');
    if (!formData.bank.trim()) newErrors.push('bank');
    
    if (newErrors.length > 0) {
      setErrors(newErrors);
      setTimeout(() => setErrors([]), 800);
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
        if (editData && editData.refPrice !== undefined) {
          baseData.refPrice = editData.refPrice; // 編輯時保留原有的參考價
        } else {
          baseData.refPrice = baseData.cost; // 股票剛新增時參考價為預設成本
        }
      } else {
        baseData.amount = Number(formData.amount) || 0;
        if (assetType === 'fixed') {
          baseData.fixedType = formData.fixedType || '整存整付';
          baseData.interestRate = Number(formData.interestRate) || 0;
          baseData.startDate = formData.startDate || '';
          baseData.endDate = formData.endDate || '';
          baseData.durationMonths = Number(formData.durationMonths) || 0;
          baseData.renewalCount = Number(formData.renewalCount) || 0;
        }
      }
      if (editData) {
        await updateDoc(doc(db, 'assets', editData.id), baseData);
      } else {
        await addDoc(collection(db, 'assets'), baseData);
      }
      handleClose();
    } catch (err) {
      console.error('新增資產失敗:', err);
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
          <button className={`tab-btn ${assetType === 'stock' ? 'active' : ''}`} onClick={() => setAssetType('stock')}>股票</button>
          <button className={`tab-btn ${assetType === 'demand' ? 'active' : ''}`} onClick={() => setAssetType('demand')}>活期存款</button>
          <button className={`tab-btn ${assetType === 'fixed' ? 'active' : ''}`} onClick={() => setAssetType('fixed')}>定期存款</button>
        </div>
        
        {/* 將表單內容區塊加上 flex: 1 與 overflowY: auto，確保視窗不過高時仍可向下捲動 */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', background: '#fff', flex: 1, overflowY: 'auto' }}>
          <input type="text" name="item" placeholder="項目名稱 (例如: 台積電、薪轉戶)" value={formData.item} onChange={handleChange} className={errors.includes('item') ? 'error-shake' : ''} style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid #EAE3D2', borderRadius: '20px', boxSizing: 'border-box', color: '#5C5446', background: '#F8F6F0', outline: 'none' }} />
          {assetType === 'stock' && availableStocks.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '5px' }}>
              {availableStocks.map(s => (
                <button key={s} onClick={() => setFormData(prev => ({...prev, item: s}))} style={{ whiteSpace: 'nowrap', padding: '8px 16px', background: formData.item === s ? '#D5B77A' : '#EAE3D2', color: formData.item === s ? '#fff' : '#5C5446', border: 'none', borderRadius: '24px', fontSize: '14px', cursor: 'pointer' }}>{s}</button>
              ))}
            </div>
          )}
          {assetType === 'demand' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '5px' }}>
              {DEMAND_SHORTCUTS.map(s => (
                <button key={s} onClick={() => setFormData(prev => ({...prev, item: s}))} style={{ padding: '8px 16px', background: formData.item === s ? '#D5B77A' : '#EAE3D2', color: formData.item === s ? '#fff' : '#5C5446', border: 'none', borderRadius: '24px', fontSize: '14px', cursor: 'pointer' }}>{s}</button>
              ))}
            </div>
          )}
          {assetType === 'fixed' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '5px' }}>
              {FIXED_SHORTCUTS.map(s => (
                <button key={s} onClick={() => setFormData(prev => ({...prev, item: s}))} style={{ padding: '8px 16px', background: formData.item === s ? '#D5B77A' : '#EAE3D2', color: formData.item === s ? '#fff' : '#5C5446', border: 'none', borderRadius: '24px', fontSize: '14px', cursor: 'pointer' }}>{s}</button>
              ))}
            </div>
          )}

          <input type="text" name="bank" placeholder="銀行 / 券商" value={formData.bank} onChange={handleChange} className={errors.includes('bank') ? 'error-shake' : ''} style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid #EAE3D2', borderRadius: '20px', boxSizing: 'border-box', color: '#5C5446', background: '#F8F6F0', outline: 'none' }} />
          {availableBanks.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '5px' }}>
              {availableBanks.map(b => (
                <button key={b} onClick={() => setFormData(prev => ({...prev, bank: b}))} style={{ whiteSpace: 'nowrap', padding: '8px 16px', background: formData.bank === b ? '#D5B77A' : '#EAE3D2', color: formData.bank === b ? '#fff' : '#5C5446', border: 'none', borderRadius: '24px', fontSize: '14px', cursor: 'pointer' }}>{b}</button>
              ))}
            </div>
          )}
          
          <input type="text" name="holder" placeholder="持有人 / 存款人" value={formData.holder} onChange={handleChange} style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid #EAE3D2', borderRadius: '20px', boxSizing: 'border-box', color: '#5C5446', background: '#F8F6F0' }} />
          {availablePayers.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '5px' }}>
              {availablePayers.map(p => (
                <button key={p} onClick={() => setFormData(prev => ({...prev, holder: p}))} style={{ whiteSpace: 'nowrap', padding: '8px 16px', background: formData.holder === p ? '#D5B77A' : '#EAE3D2', color: formData.holder === p ? '#fff' : '#5C5446', border: 'none', borderRadius: '24px', fontSize: '14px', cursor: 'pointer' }}>{p}</button>
              ))}
            </div>
          )}
          
          {assetType === 'stock' ? (
            <>
              <input type="number" name="shares" placeholder="持有股數" value={formData.shares} onChange={handleChange} style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid #EAE3D2', borderRadius: '20px', boxSizing: 'border-box', color: '#5C5446', background: '#F8F6F0' }} />
              <input type="number" name="cost" placeholder="持有均價" value={formData.cost} onChange={handleChange} style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid #EAE3D2', borderRadius: '20px', boxSizing: 'border-box', color: '#5C5446', background: '#F8F6F0' }} />
            </>
          ) : (
            <>
              {assetType === 'fixed' && (
                <>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '5px' }}>
                  <button onClick={() => setFormData(prev => ({...prev, fixedType: '整存整付'}))} style={{ flex: 1, padding: '12px', background: formData.fixedType === '整存整付' ? '#D5B77A' : '#EAE3D2', color: formData.fixedType === '整存整付' ? '#fff' : '#5C5446', border: 'none', borderRadius: '16px', fontSize: '15px', cursor: 'pointer' }}>整存整付</button>
                  <button onClick={() => setFormData(prev => ({...prev, fixedType: '零存整付'}))} style={{ flex: 1, padding: '12px', background: formData.fixedType === '零存整付' ? '#D5B77A' : '#EAE3D2', color: formData.fixedType === '零存整付' ? '#fff' : '#5C5446', border: 'none', borderRadius: '16px', fontSize: '15px', cursor: 'pointer' }}>零存整付</button>
                </div>
                <input type="number" name="amount" placeholder={formData.fixedType === '零存整付' ? '每月存款金額' : '單筆存款金額'} value={formData.amount} onChange={handleChange} style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid #EAE3D2', borderRadius: '20px', boxSizing: 'border-box', color: '#5C5446', background: '#F8F6F0' }} />
                <input type="number" name="interestRate" placeholder="年利率 (%) (例如: 1.5)" value={formData.interestRate} onChange={handleChange} style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid #EAE3D2', borderRadius: '20px', boxSizing: 'border-box', color: '#5C5446', background: '#F8F6F0' }} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="date" name="startDate" placeholder="開始日期" value={formData.startDate} onChange={handleChange} style={{ flex: 1, padding: '12px', fontSize: '16px', border: '1px solid #EAE3D2', borderRadius: '20px', boxSizing: 'border-box', color: '#5C5446', background: '#F8F6F0' }} />
                  <input type="date" name="endDate" placeholder="到期日 (點擊選擇)" value={formData.endDate} onChange={handleChange} style={{ flex: 1, padding: '12px', fontSize: '16px', border: '1px solid #EAE3D2', borderRadius: '20px', boxSizing: 'border-box', color: '#5C5446', background: '#F8F6F0' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="number" name="durationMonths" placeholder="為期 (個月)" value={formData.durationMonths} onChange={handleChange} style={{ flex: 1, padding: '12px', fontSize: '16px', border: '1px solid #EAE3D2', borderRadius: '20px', boxSizing: 'border-box', color: '#5C5446', background: '#F8F6F0' }} />
                  <input type="number" name="renewalCount" placeholder="續存次數" value={formData.renewalCount} onChange={handleChange} style={{ flex: 1, padding: '12px', fontSize: '16px', border: '1px solid #EAE3D2', borderRadius: '20px', boxSizing: 'border-box', color: '#5C5446', background: '#F8F6F0' }} />
                </div>
                </>
              )}
              {assetType === 'demand' && (
                <input type="number" name="amount" placeholder="現有存款金額" value={formData.amount} onChange={handleChange} style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid #EAE3D2', borderRadius: '20px', boxSizing: 'border-box', color: '#5C5446', background: '#F8F6F0' }} />
              )}
            </>
          )}
          
          <button onClick={handleSubmit} style={{ width: '100%', padding: '14px', background: '#D5B77A', color: '#fff', border: 'none', borderRadius: '24px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px', boxShadow: '0 4px 12px rgba(213, 183, 122, 0.3)' }}>完成</button>
        </div>
      </div>
    </div>
  );
}