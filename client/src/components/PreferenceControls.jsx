import { Languages, Moon, Sun } from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext.jsx';

export function PreferenceControls({ compact = false }) {
  const { language, theme, setLanguage, toggleTheme, t } = usePreferences();
  const nextTheme = theme === 'light' ? t('dark') : t('light');

  return <div className={`preference-controls${compact ? ' preference-controls-compact' : ''}`}>
    <div className="language-switch" role="group" aria-label={t('language')}>
      <Languages size={15} />
      <button type="button" className={language === 'vi' ? 'is-active' : ''} onClick={() => setLanguage('vi')} aria-pressed={language === 'vi'}>VI</button>
      <button type="button" className={language === 'en' ? 'is-active' : ''} onClick={() => setLanguage('en')} aria-pressed={language === 'en'}>EN</button>
    </div>
    <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={`${t('switchTo')} ${nextTheme}`} title={`${t('switchTo')} ${nextTheme}`}>
      {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
      {!compact && <span>{theme === 'light' ? t('dark') : t('light')}</span>}
    </button>
  </div>;
}
