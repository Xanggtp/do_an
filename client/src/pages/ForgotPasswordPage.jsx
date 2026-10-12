import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout.jsx';
import { FormField } from '../components/FormField.jsx';
import api from '../lib/api.js';
import { usePreferences } from '../context/PreferencesContext.jsx';

export function ForgotPasswordPage() {
  const { t } = usePreferences();
  const [email, setEmail] = useState(''); const [question, setQuestion] = useState(''); const [answer, setAnswer] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const findQuestion = async (event) => { event.preventDefault(); setError(''); setBusy(true); try { const data = await api('/api/auth/forgot-password/question', { method: 'POST', body: JSON.stringify({ email }) }); setQuestion(data.securityQuestion); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } };
  const reset = async (event) => { event.preventDefault(); setError(''); setBusy(true); try { await api('/api/auth/forgot-password/reset', { method: 'POST', body: JSON.stringify({ email, securityAnswer: answer, newPassword: password }) }); setDone(true); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } };
  return <AuthLayout eyebrow={t('accountRecovery')} title={done ? t('backOnTrack') : t('resetPassword')}>
    {done ? <div className="success-state"><div className="success-icon"><Check size={22} /></div><p>{t('passwordUpdated')}</p><Link to="/login" className="primary-button">{t('returnToSignIn')} <ArrowRight size={18} /></Link></div>
      : !question ? <><p className="auth-intro">{t('recoveryIntro')}</p><form className="form-stack" onSubmit={findQuestion}><FormField label={t('emailAddress')} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />{error && <div className="form-alert">{error}</div>}<button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : t('findMyQuestion')} {!busy && <ArrowRight size={18} />}</button></form></>
      : <><button className="back-link inline-back" onClick={() => { setQuestion(''); setError(''); }}><ArrowLeft size={16} /> {t('differentEmail')}</button><form className="form-stack" onSubmit={reset}><div className="question-card"><span>{t('securityQuestion')}</span><strong>{question}</strong></div><FormField label={t('yourAnswer')} value={answer} onChange={(event) => setAnswer(event.target.value)} required /><FormField label={t('password')} type="password" hint={t('atLeastEight')} value={password} onChange={(event) => setPassword(event.target.value)} required />{error && <div className="form-alert">{error}</div>}<button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : t('resetPasswordAction')} {!busy && <ArrowRight size={18} />}</button></form></>}
    {!done && <div className="auth-footer"><Link to="/login"><ArrowLeft size={14} /> {t('backToSignIn')}</Link></div>}
  </AuthLayout>;
}
