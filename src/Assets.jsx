import { useState } from 'react';

// 模擬資料
const initialStocks = [
  { id: 1, item: '台積電 (2330)', shares: 1000, refPrice: 850, cost: 600, bank: '元大證券', holder: '自己', updatedAt: '2026-05-01' },
  { id: 2, item: '0050', shares: 500, refPrice: 150, cost: 130, bank: '富邦證券', holder: 'Bobo', updatedAt: '2026-05-01' },
];
const demandDeposits = [
  { id: 1, item: '薪轉戶', amount: 150000, bank: '中國信託', depositor: '自己' },
  { id: 2, item: '共同基金', amount: 80000, bank: '玉山銀行', depositor: 'Bobo' },
];
const fixedDeposits = [
  { id: 1, item: '美金定存', amount: 300000, bank: '國泰世華', depositor: '自己' },
];

export default function Assets() {
  const [stocks, setStocks] = useState(initialStocks);
  const [demandList, setDemandList] = useState(demandDeposits);
  const [fixedList, setFixedList] = useState(fixedDeposits);
  const [isFetching, setIsFetching] = useState(false);

  // 真實串接 Yahoo Finance API 更新收盤價
  const handleFetchPrices = async () => {
    setIsFetching(true);
    try {
      const updatedStocks = await Promise.all(stocks.map(async (stock) => {
        const match = stock.item.match(/\d{4}/); // 自動提取四位數股票代號
        if (!match) return stock;
        
        const symbol = match[0];
        // 使用 Yahoo Finance API 搭配 CORS proxy 取得台股報價
        const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TW?interval=1d`;
        // 改用 corsproxy.io，因為 allorigins 常常被 Yahoo 擋下導致 522 錯誤
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
        
        try {
          const res = await fetch(proxyUrl);
          const data = await res.json();
          const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
          const today = new Date().toISOString().split('T')[0];
          if (price) return { ...stock, refPrice: price, updatedAt: today };
        } catch (err) {
          console.error(`抓取 ${symbol} 失敗:`, err);
        }
        return stock;
      }));
      setStocks(updatedStocks);
      alert('股價更新完成！\n（註：若仍有失敗項目，可能是免費 Proxy 伺服器不穩定，未來佈署 Vercel 後可徹底解決）');
    } finally {
      setIsFetching(false);
    }
  };

  const handleDeleteStock = (id) => {
    if (window.confirm('確定要刪除這筆股票嗎？')) {
      setStocks(prev => prev.filter(stock => stock.id !== id));
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
                <strong>{dep.item}</strong>
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