import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, LayoutDashboard, LogOut, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import { PreferenceControls } from './PreferenceControls.jsx';
import { UserProfileWidget } from './UserProfileWidget.jsx';

export function Layout({ children }) {
  const { user, logout } = useAuth();
  const { t } = usePreferences();
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
          <Link to="/dashboard" className="app-nav-link"><LayoutDashboard size={16} /> {t('workspace')}</Link>
          <Link to="/classes" className="app-nav-link"><BookOpen size={16} /> {t('manageClasses')}</Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="quiet-note"><Sparkles size={17} /><span>Make space for what matters.</span></div>
          <button className="sidebar-logout" onClick={handleLogout}><LogOut size={17} /> {t('logOut')}</button>
        </div>
      </aside>
      <main className="app-main">
        <div className="main-toolbar"><PreferenceControls /></div>
        <div className="mobile-brand"><Link to="/dashboard" className="brand-mark"><span className="brand-dot" /><span>northstar</span></Link><div className="mobile-actions"><PreferenceControls compact /></div></div>
        {children}
      </main>
    </div>
  );
}
