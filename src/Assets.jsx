import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import AssetModal from './AssetModal';

export default function Assets() {
  const [stocks, setStocks] = useState([]);
  const [demandList, setDemandList] = useState([]);
  const [fixedList, setFixedList] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);

  // 真實從 Firebase 取回所有財產
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'assets'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setStocks(data.filter(d => d.type === 'stock'));
      setDemandList(data.filter(d => d.type === 'demand'));
      setFixedList(data.filter(d => d.type === 'fixed'));
    });
    return () => unsub();
  }, []);

  // 真實串接 Yahoo Finance API 更新收盤價
  const handleFetchPrices = async () => {
    setIsFetching(true);
    try {
      let successCount = 0;
      await Promise.all(stocks.map(async (stock) => {
        const match = stock.item.match(/\d{4}/); // 自動提取四位數股票代號
        if (!match) return;
        
        const symbol = match[0];
        const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TW?interval=1d`;
        
        let price = null;
        
        try {
          // 嘗試來源一: corsproxy.io (不帶多餘 wrapper，較穩定)
          const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
          const data = await res.json();
          price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        } catch (e) {
          // 嘗試來源二: allorigins raw 端點備援
          try {
            const res2 = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`);
            const data2 = await res2.json();
            price = data2?.chart?.result?.[0]?.meta?.regularMarketPrice;
          } catch (err2) {
            console.error(`抓取 ${symbol} 失敗:`, err2);
          }
        }

        if (price) {
          const today = new Date().toISOString().split('T')[0];
          await updateDoc(doc(db, 'assets', stock.id), { refPrice: price, updatedAt: today });
          successCount++;
        }
      }));
      alert(`股價更新完成！(成功更新 ${successCount} 筆)\n（註：若仍有失敗項目，可能是 Proxy 不穩定）`);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>財產清單</h2>
      </div>

      <Section title="📈 股票清單" action={<button onClick={handleFetchPrices} disabled={isFetching} style={{ padding: '8px 16px', background: '#D5B77A', color: '#fff', border: 'none', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 12px rgba(213, 183, 122, 0.3)' }}>{isFetching ? '抓取中...' : '更新今日收盤價'}</button>}>
        <div className="card-grid">
          {stocks.map(stock => (
            <div className="card" key={stock.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '10px' }}>
                <strong style={{ fontSize: '18px' }}>{stock.item}</strong>
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
              {stock.updatedAt && <div className="card-date" style={{ marginTop: '8px' }}>最後編輯日期：{stock.updatedAt}</div>}
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
  const [isOpen, setIsOpen] = useState(false);

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