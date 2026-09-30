import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, LogOut, Sparkles } from 'lucide-react';
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
        <div className="sidebar-bottom">
          <div className="quiet-note"><Sparkles size={17} /><span>Make space for what matters.</span></div>
          <button className="sidebar-logout" onClick={handleLogout}><LogOut size={17} /> Log out</button>
        </div>
      </aside>
      <main className="app-main">
        <div className="mobile-brand"><Link to="/dashboard" className="brand-mark"><span className="brand-dot" /><span>northstar</span></Link><ArrowUpRight size={18} /></div>
        {children}
      </main>
    </div>
  );
}
