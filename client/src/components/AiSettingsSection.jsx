import { useEffect, useState } from 'react';
import { Check, ExternalLink, Eye, EyeOff, KeyRound, LoaderCircle, Sparkles, Trash2 } from 'lucide-react';
import api from '../lib/api.js';
import { usePreferences } from '../context/PreferencesContext.jsx';

const AI_STUDIO_URL = 'https://aistudio.google.com/apikey';

/** Settings card where a teacher saves their own Gemini API key and model. The key is never sent back. */
export function AiSettingsSection() {
  const { t } = usePreferences();
  const [settings, setSettings] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [state, setState] = useState({ busy: false, message: '', error: '' });

  const apply = (next) => { setSettings(next); setModel(next.model); };

  useEffect(() => {
    api('/api/user/ai-settings')
      .then((data) => apply(data.settings))
      .catch((error) => setState({ busy: false, message: '', error: error.message }));
  }, []);

  const save = async (event) => {
    event.preventDefault();
    const body = {};
    if (apiKey.trim()) body.apiKey = apiKey.trim();
    if (model && model !== settings.model) body.model = model;
    if (!Object.keys(body).length) return setState({ busy: false, message: '', error: t('aiNothingToSave') });

    setState({ busy: true, message: '', error: '' });
    try {
      const data = await api('/api/user/ai-settings', { method: 'PUT', body: JSON.stringify(body) });
      apply(data.settings);
      setApiKey('');
      setShowKey(false);
      setState({ busy: false, message: body.apiKey ? t('aiKeySaved') : t('aiModelSaved'), error: '' });
    } catch (error) {
      setState({ busy: false, message: '', error: error.message });
    }
  };

  const removeKey = async () => {
    if (!confirmRemove) return setConfirmRemove(true);
    setConfirmRemove(false);
    setState({ busy: true, message: '', error: '' });
    try {
      const data = await api('/api/user/ai-settings/key', { method: 'DELETE' });
      apply(data.settings);
      setState({ busy: false, message: t('aiKeyRemoved'), error: '' });
    } catch (error) {
      setState({ busy: false, message: '', error: error.message });
    }
  };

  const statusText = !settings ? '' : settings.activeProvider === 'user'
    ? t('aiStatusUser', { hint: settings.keyHint })
    : settings.activeProvider === 'server' ? t('aiStatusServer') : t('aiStatusStub');

  return (
    <section className="settings-section settings-section-wide">
      <div className="settings-section-head">
        <div className="settings-icon"><Sparkles size={18} /></div>
        <div><h2>{t('aiSettingsTitle')}</h2><p>{t('aiSettingsSubtitle')}</p></div>
      </div>

      {!settings && !state.error && <LoaderCircle className="spin" size={18} />}

      {settings && (
        <div className="ai-settings-layout">
          <form className="form-stack" onSubmit={save}>
            <div className={`ai-status ai-status-${settings.activeProvider}`}>
              <KeyRound size={15} /> <span>{statusText}</span>
            </div>

            <label className="field">
              <span className="field-label">{settings.hasPersonalKey ? t('aiReplaceKey') : t('aiApiKey')}</span>
              <div className="input-with-action">
                <input
                  className="input"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={settings.hasPersonalKey ? `••••••••${settings.keyHint}` : 'AIza...'}
                  autoComplete="off"
                  spellCheck="false"
                />
                <button type="button" className="input-action" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? t('aiHideKey') : t('aiShowKey')}>
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span className="field-hint">{t('aiKeyHint')}</span>
            </label>

            <label className="field">
              <span className="field-label">{t('aiModel')}</span>
              <select className="input" value={model} onChange={(event) => setModel(event.target.value)}>
                {settings.models.map((name) => <option key={name} value={name}>{name}{name === 'gemini-2.5-flash' ? ` (${t('aiRecommended')})` : ''}</option>)}
              </select>
              <span className="field-hint">{t('aiModelHint')}</span>
            </label>

            {state.error && <div className="form-alert">{state.error}</div>}
            {state.message && <div className="success-message"><Check size={15} /> {state.message}</div>}

            <div className="ai-settings-actions">
              <button className="primary-button compact-button" disabled={state.busy}>
                {state.busy ? <LoaderCircle className="spin" size={18} /> : t('aiSaveAndVerify')}
                {!state.busy && <Check size={17} />}
              </button>
              {settings.hasPersonalKey && (
                <button type="button" className="outline-button compact-button ai-remove-button" onClick={removeKey} onBlur={() => setConfirmRemove(false)} disabled={state.busy}>
                  <Trash2 size={15} /> {confirmRemove ? t('aiConfirmRemove') : t('aiRemoveKey')}
                </button>
              )}
            </div>
          </form>

          <aside className="ai-help">
            <p className="security-title">{t('aiHowToTitle')}</p>
            <ol>
              <li>{t('aiHowToStep1')} <a href={AI_STUDIO_URL} target="_blank" rel="noreferrer">Google AI Studio <ExternalLink size={12} /></a></li>
              <li>{t('aiHowToStep2')}</li>
              <li>{t('aiHowToStep3')}</li>
            </ol>
            <p className="ai-help-note">{t('aiPrivacyNote')}</p>
          </aside>
        </div>
      )}
      {!settings && state.error && <div className="form-alert">{state.error}</div>}
    </section>
  );
}
