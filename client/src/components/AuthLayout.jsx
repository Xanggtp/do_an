import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext.jsx';
import { PreferenceControls } from './PreferenceControls.jsx';

// Rings of the animated "galaxy" on the left panel; each dot is [angle, size px, tone].
const orbits = [
  { name: 'three', dots: [[35, 3, 'mint'], [160, 2, 'soft'], [250, 4, 'mint'], [320, 2, 'soft']] },
  { name: 'one', dots: [[10, 5, 'mint'], [95, 3, 'soft'], [170, 4, 'coral'], [235, 3, 'soft'], [290, 6, 'glow']] },
  { name: 'two', dots: [[45, 4, 'coral'], [140, 3, 'soft'], [215, 5, 'glow'], [330, 3, 'mint']] }
];

// Fixed positions (no Math.random) so the background is identical on every render.
const stars = [
  [8, 12, 2, 0], [22, 30, 1, 1.2], [35, 8, 2, 2.4], [48, 22, 1, .6], [63, 14, 2, 1.8], [78, 6, 1, 3], [90, 26, 2, .3],
  [14, 48, 1, 2.1], [29, 62, 2, .9], [55, 40, 1, 2.7], [70, 55, 2, 1.5], [86, 44, 1, .2], [94, 68, 2, 2.2],
  [6, 78, 2, 1.1], [40, 84, 1, 3.2], [60, 74, 2, .5], [75, 90, 1, 1.7], [18, 92, 2, 2.9], [50, 60, 1, 1.3]
].map(([x, y, s, d]) => ({ x, y, s, d }));

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
        <div className="art-stars" aria-hidden="true">
          {stars.map((star, i) => <span key={i} style={{ left: `${star.x}%`, top: `${star.y}%`, '--size': `${star.s}px`, '--delay': `${star.d}s` }} />)}
        </div>
        <div className="art-galaxy" aria-hidden="true">
          <div className="galaxy-arms" />
          <div className="galaxy-core" />
          {orbits.map((orbit) => (
            <div key={orbit.name} className={`art-orbit orbit-${orbit.name}`}>
              {orbit.dots.map(([angle, size, tone], i) => <span key={i} className={`orbit-dot dot-${tone}`} style={{ '--angle': `${angle}deg`, '--size': `${size}px` }} />)}
            </div>
          ))}
        </div>
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