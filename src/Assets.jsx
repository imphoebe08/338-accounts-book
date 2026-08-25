import { useState } from 'react';
import { doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import AssetModal from './AssetModal';

export default function Assets({ assets }) {
  const [sortOrder, setSortOrder] = useState('valueDesc'); // 'valueDesc', 'valueAsc', 'name'
  // 動態整理出所有持有人，並加入「全部」標籤
  const allHolders = ['全部', ...Array.from(new Set(assets.map(a => a.holder || a.depositor).filter(Boolean)))];
  const [selectedHolder, setSelectedHolder] = useState('全部');

  const filteredAssets = selectedHolder === '全部' ? assets : assets.filter(a => (a.holder || a.depositor) === selectedHolder);
  
  // 共用的定存本金計算邏輯
  const getFixedPrincipal = (dep) => {
    let principal = Number(dep.amount) || 0;
    let m = Number(dep.durationMonths) || 0;
    if (!m && dep.startDate && dep.endDate) {
      const s = new Date(dep.startDate);
      const e = new Date(dep.endDate);
      m = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
    }
    if (dep.fixedType === '零存整付' && m) {
      const renewals = Number(dep.renewalCount) || 0;
      principal = principal * (m * (1 + renewals));
    }
    return principal;
  };

  // 取得計算後價值的排序函式
  const sortAssets = (list, type) => {
    return [...list].sort((a, b) => {
      let valA = type === 'stock' ? (a.shares * (a.refPrice || a.cost)) : (type === 'demand' ? Number(a.amount) : getFixedPrincipal(a));
      let valB = type === 'stock' ? (b.shares * (b.refPrice || b.cost)) : (type === 'demand' ? Number(b.amount) : getFixedPrincipal(b));
      if (sortOrder === 'valueDesc') return valB - valA;
      if (sortOrder === 'valueAsc') return valA - valB;
      return a.item.localeCompare(b.item);
    });
  };

  const stocks = sortAssets(filteredAssets.filter(d => d.type === 'stock'), 'stock');
  const demandList = sortAssets(filteredAssets.filter(d => d.type === 'demand'), 'demand');
  const fixedList = sortAssets(filteredAssets.filter(d => d.type === 'fixed'), 'fixed');

  // 計算上方總計看板的數據
  const totalStockValue = stocks.reduce((sum, s) => sum + ((s.shares || 0) * (s.refPrice || s.cost || 0)), 0);
  const totalDemandValue = demandList.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const totalFixedValue = fixedList.reduce((sum, d) => sum + getFixedPrincipal(d), 0);
  const grandTotal = totalStockValue + totalDemandValue + totalFixedValue;

  const [isFetching, setIsFetching] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);

  // 僅使用臺灣證券交易所官方 MIS 公開資訊更新收盤價
  const handleFetchPrices = async () => {
    setIsFetching(true);
    try {
      const snapshotUrl = `${import.meta.env.BASE_URL}stock-prices.json?t=${Date.now()}`;
      const res = await fetch(snapshotUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`官方收盤價快照讀取失敗（HTTP ${res.status}）`);

      const data = await res.json();
      if (!data.prices || typeof data.prices !== 'object') {
        throw new Error('官方收盤價快照格式錯誤');
      }

      const priceResults = [];
      const failed = [];
      for (const stock of stocks) {
        const symbol = String(stock.symbol || '').trim().toUpperCase().replace(/\.(TW|TWO)$/, '');
        const quote = data.prices[symbol];
        if (quote?.price) {
          priceResults.push({ ...stock, symbol, ...quote });
        } else {
          failed.push(symbol || stock.item);
        }
      }

      await Promise.all(priceResults.map(result => updateDoc(doc(db, 'assets', result.id), {
        refPrice: result.price,
        updatedAt: result.date,
        quoteDate: result.date,
        quotePriceType: '最近公開收盤價'
      })));
      const failedMessage = failed.length ? `\n未取得：${failed.join('、')}` : '';
      alert(`收盤價更新完成！成功更新 ${priceResults.length} 筆資料。${failedMessage}`);
    } catch (e) {
      console.error(e);
      alert(`更新失敗: \n${e.message}`);
    } finally {
      setIsFetching(false);
    }
  };

  const handleDeleteStock = async (id) => {
    if (window.confirm('確定要刪除這筆股票嗎？')) {
      await deleteDoc(doc(db, 'assets', id));
    }
  };

  const handleDeleteDemand = async (id) => {
    if (window.confirm('確定要刪除這筆活期存款嗎？')) {
      await deleteDoc(doc(db, 'assets', id));
    }
  };

  const handleDeleteFixed = async (id) => {
    if (window.confirm('確定要刪除這筆定期存款嗎？')) {
      await deleteDoc(doc(db, 'assets', id));
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2 style={{ margin: 0 }}>財產清單</h2>
        <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ padding: '6px 12px', borderRadius: '16px', border: '1px solid #EAE3D2', color: '#5C5446', fontSize: '13px', background: '#fff', outline: 'none' }}>
          <option value="valueDesc">金額：高 ➔ 低</option>
          <option value="valueAsc">金額：低 ➔ 高</option>
          <option value="name">依名稱排序</option>
        </select>
      </div>

      {/* 持有人分頁標籤 */}
      {allHolders.length > 1 && (
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', marginBottom: '20px', paddingBottom: '5px' }}>
          {allHolders.map(h => (
            <button 
              key={h} 
              onClick={() => setSelectedHolder(h)}
              style={{ whiteSpace: 'nowrap', padding: '8px 16px', background: selectedHolder === h ? '#D5B77A' : '#EAE3D2', color: selectedHolder === h ? '#fff' : '#5C5446', border: 'none', borderRadius: '24px', fontSize: '14px', cursor: 'pointer', fontWeight: selectedHolder === h ? 'bold' : 'normal' }}
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {/* 總計看板 */}
      <div className="card" style={{ marginBottom: '30px', padding: '20px', background: 'linear-gradient(135deg, #F8F6F0 0%, #EAE3D2 100%)', border: '1px solid #D5B77A' }}>
        <div style={{ textAlign: 'center', marginBottom: '15px' }}>
          <div style={{ fontSize: '14px', color: '#7A6F5D' }}>{selectedHolder} 總資產</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#333' }}>${Math.round(grandTotal).toLocaleString()}</div>
        </div>
        <div className="asset-summary-grid" style={{ borderTop: '1px solid rgba(213, 183, 122, 0.3)', paddingTop: '15px' }}>
          <div className="asset-summary-item" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#7A6F5D' }}>股票市值</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#ef4444' }}>
              ${Math.round(totalStockValue).toLocaleString()}
              <span style={{ fontSize: '12px', color: '#999', marginLeft: '4px', fontWeight: 'normal' }}>({grandTotal > 0 ? ((totalStockValue / grandTotal) * 100).toFixed(1) : 0}%)</span>
            </div>
          </div>
          <div className="asset-summary-item" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#7A6F5D' }}>活期存款</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#10b981' }}>
              ${Math.round(totalDemandValue).toLocaleString()}
              <span style={{ fontSize: '12px', color: '#999', marginLeft: '4px', fontWeight: 'normal' }}>({grandTotal > 0 ? ((totalDemandValue / grandTotal) * 100).toFixed(1) : 0}%)</span>
            </div>
          </div>
          <div className="asset-summary-item" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: '#7A6F5D' }}>定期存款</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#3b82f6' }}>
              ${Math.round(totalFixedValue).toLocaleString()}
              <span style={{ fontSize: '12px', color: '#999', marginLeft: '4px', fontWeight: 'normal' }}>({grandTotal > 0 ? ((totalFixedValue / grandTotal) * 100).toFixed(1) : 0}%)</span>
            </div>
          </div>
        </div>
      </div>

      <Section title="📈 股票清單" action={<button onClick={handleFetchPrices} disabled={isFetching} style={{ padding: '8px 16px', background: '#D5B77A', color: '#fff', border: 'none', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(213, 183, 122, 0.3)' }}>{isFetching ? '抓取中...' : '更新今日收盤價'}</button>}>
        <div className="card-grid">
          {stocks.map(stock => (
            <div className="card" key={stock.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '10px' }}>
                <strong style={{ fontSize: '18px' }}>
                  {stock.item} {stock.symbol && <span style={{ fontSize: '14px', color: '#999', fontWeight: 'normal', marginLeft: '4px' }}>({stock.symbol})</span>}
                </strong>
                <span style={{ color: '#666', fontSize: '14px' }}>{stock.holder} ({stock.bank})</span>
              </div>
              <Row label="持有股數" value={stock.shares.toLocaleString()} />
              <Row label="持有成本" value={`$${stock.cost.toLocaleString()}`} />
              <Row label="參考現值" value={`$${stock.refPrice.toLocaleString()}`} color="#10b981" />
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #eee' }}>
                <Row label="目前市值" value={`$${(stock.shares * stock.refPrice).toLocaleString()}`} color="#ef4444" isBold />
              </div>
              <div className="card-actions">
                <button style={{ padding: '6px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '13px' }} onClick={() => setEditingAsset(stock)}>編輯</button>
                <button style={{ padding: '6px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '13px' }} onClick={() => handleDeleteStock(stock.id)}>刪除</button>
              </div>
              {stock.updatedAt && <div className="card-date" style={{ marginTop: '8px' }}>報價更新：{stock.updatedAt}{stock.quotePriceType ? `（${stock.quotePriceType}）` : ''}</div>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="🏦 活期存款清單">
        <div className="card-grid">
          {demandList.map(dep => (
            <div className="card" key={dep.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <strong>{dep.item}</strong>
                <span style={{ color: '#666', fontSize: '14px' }}>{dep.holder || dep.depositor} ({dep.bank})</span>
              </div>
              <Row label="現有存款" value={`$${dep.amount.toLocaleString()}`} color="#10b981" isBold />
              <div className="card-actions">
                <button style={{ padding: '6px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '13px' }} onClick={() => setEditingAsset(dep)}>編輯</button>
                <button style={{ padding: '6px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '13px' }} onClick={() => handleDeleteDemand(dep.id)}>刪除</button>
              </div>
              {dep.updatedAt && <div className="card-date" style={{ marginTop: '8px' }}>最後編輯日期：{dep.updatedAt}</div>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="🔒 定期定額存款清單">
        <div className="card-grid">
          {fixedList.map(dep => {
            let expectedInterest = 0;
            let totalPrincipal = Number(dep.amount) || 0;
            let endDateStr = dep.endDate || '';

            // 自動計算為期月數
            let m = Number(dep.durationMonths) || 0;
            if (!m && dep.startDate && dep.endDate) {
              const s = new Date(dep.startDate);
              const e = new Date(dep.endDate);
              m = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
            }

            if (dep.interestRate && m) {
              const r = Number(dep.interestRate) / 100;
              const renewals = Number(dep.renewalCount) || 0;
              const totalM = m * (1 + renewals); // 總期數

              if (dep.fixedType === '零存整付') {
                totalPrincipal = totalPrincipal * totalM;
                // 零存整付利息 = 每月本金 * 月利率 * (總期數 * (總期數 + 1) / 2)
                expectedInterest = Math.round((Number(dep.amount) || 0) * (r / 12) * ((totalM * (totalM + 1)) / 2));
              } else {
                expectedInterest = Math.round(totalPrincipal * r * (totalM / 12));
              }

              if (!endDateStr && dep.startDate) {
                const endDate = new Date(dep.startDate);
                endDate.setMonth(endDate.getMonth() + totalM);
                endDateStr = endDate.toISOString().split('T')[0];
              }
            }
            
            const termLabel = [
              m ? `${m} 個月` : '',
              dep.renewalCount ? `(續存 ${dep.renewalCount} 次)` : '',
              endDateStr ? `(至 ${endDateStr})` : ''
            ].filter(Boolean).join(' ');

            return (
            <div className="card" key={dep.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <strong>{dep.item} {dep.fixedType && <span style={{ color: '#8b5cf6', fontSize: '13px', marginLeft: '4px' }}>[{dep.fixedType}]</span>}</strong>
                <span style={{ color: '#666', fontSize: '14px' }}>{dep.holder || dep.depositor} ({dep.bank})</span>
              </div>
              
              <Row label={dep.fixedType === '零存整付' ? "每月存款" : "單筆存款"} value={`$${Number(dep.amount || 0).toLocaleString()}`} />
              {dep.interestRate ? <Row label="年利率" value={`${dep.interestRate}%`} /> : null}
              {termLabel ? <Row label="存續期間" value={termLabel} /> : null}

              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #eee' }}>
                <Row label="預估總本金" value={`$${totalPrincipal.toLocaleString()}`} />
                <Row label="預定到期利息" value={`+ $${expectedInterest.toLocaleString()}`} color="#f59e0b" />
                <Row label="預估到期總本息" value={`$${(totalPrincipal + expectedInterest).toLocaleString()}`} color="#10b981" isBold />
              </div>
              
              <div className="card-actions">
                <button style={{ padding: '6px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '13px' }} onClick={() => setEditingAsset(dep)}>編輯</button>
                <button style={{ padding: '6px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '13px' }} onClick={() => handleDeleteFixed(dep.id)}>刪除</button>
              </div>
              {dep.updatedAt && <div className="card-date" style={{ marginTop: '8px' }}>最後編輯日期：{dep.updatedAt}</div>}
            </div>
            );
          })}
        </div>
      </Section>

      {/* 編輯彈出視窗 */}
      {editingAsset && <AssetModal editData={editingAsset} onClose={() => setEditingAsset(null)} />}
    </div>
  );
}

// 共用排版元件
function Section({ title, action, children }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div style={{ marginBottom: '30px' }}>
      <div 
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', cursor: 'pointer', padding: '12px 15px', background: '#F8F6F0', borderRadius: '12px' }}
        onClick={(e) => { if (e.target.tagName !== 'BUTTON') setIsOpen(!isOpen); }}
      >
        <h3 style={{ margin: 0, color: '#333', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>{title} <span style={{ fontSize: '12px', color: '#999' }}>{isOpen ? '▲' : '▼'}</span></h3>
        {action && <div onClick={e => e.stopPropagation()}>{action}</div>}
      </div>
      {isOpen && children}
    </div>
  );
}

function Row({ label, value, color = '#111', isBold = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '14px' }}>
      <span style={{ color: '#666' }}>{label}</span>
      <span style={{ color, fontWeight: isBold ? 'bold' : 'normal' }}>{value}</span>
    </div>
  );
}
