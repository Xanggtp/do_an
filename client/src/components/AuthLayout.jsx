import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

export function AuthLayout({ eyebrow, title, children, footer }) {
  return (
    <div className="auth-shell">
      <div className="auth-art">
        <Link to="/login" className="brand-mark light-brand">
          <span className="brand-dot" />
          <span>northstar</span>
        </Link>
        <div className="art-copy">
          <p className="eyebrow light-eyebrow">
            <ShieldCheck size={15} /> Private by design
          </p>
          <h2>A calmer place to keep your plans moving.</h2>
          <p>Your account, your pace, your next right step.</p>
        </div>
        <div className="art-orbit orbit-one" />
        <div className="art-orbit orbit-two" />
      </div>
      <div className="auth-panel">
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