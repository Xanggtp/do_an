import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout.jsx';
import { FormField } from '../components/FormField.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';

export function RegisterPage() {
  const { user, register } = useAuth();
  const { t } = usePreferences();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', securityQuestion: 'What was the name of your first school?', securityAnswer: '' });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/dashboard" replace />;
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (form.password !== form.confirmPassword) return setError(t('passwordsDoNotMatch'));
    setBusy(true);
    try { await register(form); navigate('/dashboard', { replace: true }); }
    catch (registerError) { setError(registerError.message); }
    finally { setBusy(false); }
  };
  return <AuthLayout eyebrow={t('startFresh')} title={t('buildNorthStar')}
    footer={<>{t('alreadyHaveAccount')} <Link to="/login">{t('signIn')} <ArrowRight size={14} /></Link></>}>
    <p className="auth-intro">{t('registerIntro')}</p>
    <form className="form-stack" onSubmit={submit}>
      <div className="form-grid"><FormField label={t('yourName')} name="name" autoComplete="name" value={form.name} onChange={update} required /><FormField label={t('emailAddress')} name="email" type="email" autoComplete="email" value={form.email} onChange={update} required /></div>
      <div className="form-grid"><FormField label={t('password')} name="password" type="password" autoComplete="new-password" hint={t('atLeastEight')} value={form.password} onChange={update} required /><FormField label={t('confirmPassword')} name="confirmPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={update} required /></div>
      <div className="security-box"><p className="security-title">{t('recoveryKey')}</p><p className="security-copy">{t('recoveryCopy')}</p><label className="field"><span className="field-label">{t('securityQuestion')}</span><select className="input" name="securityQuestion" value={form.securityQuestion} onChange={update}><option>{t('firstSchool')}</option><option>{t('bornCity')}</option><option>{t('childhoodNickname')}</option></select></label><FormField label={t('yourAnswer')} name="securityAnswer" value={form.securityAnswer} onChange={update} required /></div>
      {error && <div className="form-alert">{error}</div>}
      <button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : t('createAccountAction')} {!busy && <ArrowRight size={18} />}</button>
    </form>
  </AuthLayout>;
}
