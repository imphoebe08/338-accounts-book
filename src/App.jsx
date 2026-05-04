import { useState } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import './layout.css'
import Overview from './Overview'
import Analysis from './Analysis'
import Assets from './Assets'
import Settings from './Settings'
import TransactionModal from './TransactionModal'
import AssetModal from './AssetModal'

function Layout({ children }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { path: '/', label: '本月收支', icon: '📝' },
    { path: '/analysis', label: '總覽', icon: '📊' },
    { path: '/assets', label: '資產', icon: '💰' },
    { path: '/settings', label: '設定', icon: '⚙️' },
  ];

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <div className="app-container">
      {/* 頂部導覽列 */}
      <header className="top-bar">
        <button className="hamburger-btn" onClick={() => setIsMenuOpen(true)}>☰</button>
        <h1 style={{ fontSize: '18px', margin: 0 }}>簡單記帳</h1>
      </header>

      {/* 側邊欄遮罩 */}
      {isMenuOpen && <div className="overlay" onClick={closeMenu}></div>}

      {/* 側邊收折選單 */}
      <nav className={`side-menu ${isMenuOpen ? 'open' : ''}`}>
        <div className="side-menu-header">Menu</div>
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
      </nav>

      {/* 主要內容區 */}
      <main className="content-area">
        {children}
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
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App
