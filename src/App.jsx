import { useState, useEffect, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth'
import './layout.css'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from './firebase'
import TransactionModal from './TransactionModal'
import AssetModal from './AssetModal'

// 啟用路由懶加載 (Lazy Loading)，加速網頁首次載入速度
const Overview = lazy(() => import('./Overview'));
const Analysis = lazy(() => import('./Analysis'));
const Assets = lazy(() => import('./Assets'));
const Settings = lazy(() => import('./Settings'));

function Layout({ children, user }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const location = useLocation();

  const handleLogout = () => {
    const auth = getAuth();
    signOut(auth);
    closeMenu();
  };

  const navItems = [
    { path: '/', label: '收支總覽', icon: '📝' },
    { path: '/analysis', label: '財況分析', icon: '📊' },
    { path: '/assets', label: '資產', icon: '💰' },
    { path: '/settings', label: '設定', icon: '⚙️' },
  ];

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <div className="app-container">
      {/* 頂部導覽列 */}
      <header className="top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button className="hamburger-btn" onClick={() => setIsMenuOpen(true)}>☰</button>
          <img src="/338-acount-book_app_cover.PNG" alt="Logo" style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'cover' }} />
          <h1 style={{ fontSize: '18px', margin: 0 }}>簡單記帳</h1>
        </div>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#5C5446' }}>{user.displayName}</span>
            {user.photoURL ? (
              <img src={user.photoURL} alt="avatar" style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #EAE3D2' }} />
            ) : (
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#D5B77A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                {user.displayName?.[0] || 'U'}
              </div>
            )}
          </div>
        )}
      </header>

      {/* 側邊欄遮罩 */}
      {isMenuOpen && <div className="overlay" onClick={closeMenu}></div>}

      {/* 側邊收折選單 */}
      <nav className={`side-menu ${isMenuOpen ? 'open' : ''}`}>
        <div className="side-menu-header">Menu</div>
        <div style={{ flex: 1, paddingTop: '10px' }}>
          {navItems.map((item) => (
            <Link 
              key={item.path} 
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={closeMenu}
            >
              <span className="nav-icon" style={{ fontSize: '20px' }}>{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </div>
        <button onClick={handleLogout} style={{ margin: '20px', padding: '14px', background: '#F9F5F5', color: '#ef4444', border: 'none', borderRadius: '24px', fontWeight: 'bold', cursor: 'pointer', fontSize: '16px' }}>登出</button>
      </nav>

      {/* 主要內容區 */}
      <main className="content-area">
        <Suspense fallback={<div style={{ display: 'flex', height: '50vh', justifyContent: 'center', alignItems: 'center', color: '#D5B77A', fontWeight: 'bold' }}>畫面載入中...</div>}>
          {children}
        </Suspense>
      </main>

      {/* 右下角新增按鈕 (FAB) */}
      <button className="fab" onClick={() => setIsAddModalOpen(true)}>+</button>

      {/* 依據當前頁面決定彈出的視窗 (Bottom Sheet Modal) */}
      {isAddModalOpen && location.pathname === '/assets' 
        ? <AssetModal onClose={() => setIsAddModalOpen(false)} /> 
        : isAddModalOpen && <TransactionModal onClose={() => setIsAddModalOpen(false)} />
      }
    </div>
  );
}

function App() {
  const [user, setUser] = useState(undefined);
  const [transactions, setTransactions] = useState([]);
  const [assets, setAssets] = useState([]);

  useEffect(() => {
    const auth = getAuth();
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // 全域只監聽一次 Firebase，避免切換頁面時重複讀取造成 Quota 爆掉
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setAssets([]);
      return;
    }
    const qTx = query(collection(db, "transactions"), orderBy("date", "desc"));
    const unsubTx = onSnapshot(qTx, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubAssets = onSnapshot(collection(db, "assets"), (snapshot) => {
      setAssets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => {
      unsubTx();
      unsubAssets();
    };
  }, [user]);

  const handleLogin = () => {
    const auth = getAuth();
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(err => alert('登入失敗: ' + err.message));
  };

  if (user === undefined) {
    return <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', color: '#D5B77A', fontSize: '18px', fontWeight: 'bold' }}>載入中...</div>;
  }

  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', background: '#F8F6F0' }}>
        <div className="card" style={{ padding: '50px 40px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '20px', width: '80%', maxWidth: '350px' }}>
          <img src="/338-acount-book_app_cover.PNG" alt="App Logo" style={{ width: '100px', height: '100px', margin: '0 auto', borderRadius: '24px', objectFit: 'cover', boxShadow: '0 4px 12px rgba(213, 183, 122, 0.2)' }} />
          <h1 style={{ margin: 0, color: '#C2A363', fontSize: '28px' }}>簡單記帳</h1>
          <p style={{ margin: 0, color: '#999', fontSize: '15px' }}>與伴侶一起共享莫蘭迪記帳生活</p>
          <button onClick={handleLogin} style={{ padding: '16px 28px', marginTop: '20px', background: '#D5B77A', color: '#fff', border: 'none', borderRadius: '28px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 6px 16px rgba(213, 183, 122, 0.4)' }}>
            使用 Google 登入
          </button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Layout user={user}>
        <Routes>
          <Route path="/" element={<Overview transactions={transactions} />} />
          <Route path="/analysis" element={<Analysis transactions={transactions} assets={assets} />} />
          <Route path="/assets" element={<Assets assets={assets} />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App
