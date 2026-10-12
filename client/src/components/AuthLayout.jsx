import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext.jsx';
import { PreferenceControls } from './PreferenceControls.jsx';

export function AuthLayout({ eyebrow, title, children, footer }) {
  const { t } = usePreferences();
  return (
    <div className="auth-shell">
      <div className="auth-art">
        <Link to="/login" className="brand-mark light-brand">
          <span className="brand-dot" />
          <span>northstar</span>
        </Link>
        <div className="art-copy">
          <p className="eyebrow light-eyebrow">
            <ShieldCheck size={15} /> {t('privateByDesign')}
          </p>
          <h2>{t('authArtTitle')}</h2>
          <p>{t('authArtCopy')}</p>
        </div>
        <div className="art-orbit orbit-one" />
        <div className="art-orbit orbit-two" />
      </div>
      <div className="auth-panel">
        <PreferenceControls compact />
        <div className="auth-content">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {children}
          {footer && <div className="auth-footer">{footer}</div>}
        </div>
      </div>
    </div>
  );
}