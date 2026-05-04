import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export default function Assets() {
  const [stocks, setStocks] = useState([]);
  const [demandList, setDemandList] = useState([]);
  const [fixedList, setFixedList] = useState([]);
  const [isFetching, setIsFetching] = useState(false);

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
        // 改用 allorigins 的 /get 端點，由伺服器代理解壓縮並以字串包裝，避免二進位亂碼解析錯誤
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
        
        try {
          const res = await fetch(proxyUrl);
          const wrapper = await res.json();
          
          if (wrapper.contents) {
            const data = JSON.parse(wrapper.contents);
            const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
            const today = new Date().toISOString().split('T')[0];
            if (price) {
              await updateDoc(doc(db, 'assets', stock.id), { refPrice: price, updatedAt: today });
              successCount++;
            }
          }
        } catch (err) {
          console.error(`抓取 ${symbol} 失敗:`, err);
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

  const handleEditStock = (id) => {
    alert('觸發編輯功能 (未來可串聯表單)，您欲編輯的 ID：' + id);
  };

  const handleDeleteDemand = async (id) => {
    if (window.confirm('確定要刪除這筆活期存款嗎？')) {
      await deleteDoc(doc(db, 'assets', id));
    }
  };

  const handleEditDemand = (id) => {
    alert('觸發編輯功能 (未來可串聯表單)，您欲編輯的 ID：' + id);
  };

  const handleDeleteFixed = async (id) => {
    if (window.confirm('確定要刪除這筆定期存款嗎？')) {
      await deleteDoc(doc(db, 'assets', id));
    }
  };

  const handleEditFixed = (id) => {
    alert('觸發編輯功能 (未來可串聯表單)，您欲編輯的 ID：' + id);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>財產清單</h2>
      </div>

      <Section title="📈 股票清單" action={<button onClick={handleFetchPrices} disabled={isFetching} style={{ padding: '6px 12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>{isFetching ? '抓取中...' : '更新今日收盤價'}</button>}>
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
                <button style={{ padding: '4px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }} onClick={() => handleEditStock(stock.id)}>編輯</button>
                <button style={{ padding: '4px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }} onClick={() => handleDeleteStock(stock.id)}>刪除</button>
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
                <button style={{ padding: '4px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }} onClick={() => handleEditDemand(dep.id)}>編輯</button>
                <button style={{ padding: '4px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }} onClick={() => handleDeleteDemand(dep.id)}>刪除</button>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="🔒 定期定額存款清單">
        <div className="card-grid">
          {fixedList.map(dep => (
            <div className="card" key={dep.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <strong>{dep.item} {dep.fixedType && <span style={{ color: '#8b5cf6', fontSize: '13px', marginLeft: '4px' }}>[{dep.fixedType}]</span>}</strong>
                <span style={{ color: '#666', fontSize: '14px' }}>{dep.holder || dep.depositor} ({dep.bank})</span>
              </div>
              <Row label="現有存款" value={`$${dep.amount.toLocaleString()}`} color="#10b981" isBold />
              <div className="card-actions">
                <button style={{ padding: '4px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }} onClick={() => handleEditFixed(dep.id)}>編輯</button>
                <button style={{ padding: '4px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }} onClick={() => handleDeleteFixed(dep.id)}>刪除</button>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// 共用排版元件
function Section({ title, action, children }) {
  return (
    <div style={{ marginBottom: '30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, color: '#333' }}>{title}</h3>
        {action}
      </div>
      {children}
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