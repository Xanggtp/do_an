import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Clapperboard, LayoutDashboard, LogOut, Plus, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { UserProfileWidget } from './UserProfileWidget.jsx';

export function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link to="/dashboard" className="brand-mark"><span className="brand-dot" /><span>northstar</span></Link>
        {user && <UserProfileWidget user={user} />}
        <nav className="app-nav" aria-label="Primary navigation">
          <Link to="/dashboard" className="app-nav-link"><LayoutDashboard size={16} /> Workspace</Link>
          <Link to="/classes" className="app-nav-link"><BookOpen size={16} /> Manage classes</Link>
          <Link to="/upload" className="app-nav-link"><Plus size={16} /> New observation</Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="quiet-note"><Sparkles size={17} /><span>Make space for what matters.</span></div>
          <button className="sidebar-logout" onClick={handleLogout}><LogOut size={17} /> Log out</button>
        </div>
      </aside>
      <main className="app-main">
        <div className="mobile-brand"><Link to="/dashboard" className="brand-mark"><span className="brand-dot" /><span>northstar</span></Link><Link to="/upload" className="mobile-upload-link" aria-label="Upload observation"><Clapperboard size={18} /></Link></div>
        {children}
      </main>
    </div>
  );
}
