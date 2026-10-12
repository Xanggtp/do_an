import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout.jsx';
import { FormField } from '../components/FormField.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';

export function LoginPage() {
  const { user, login } = useAuth();
  const { t } = usePreferences();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = async (event) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { await login(form); navigate(location.state?.from || '/dashboard', { replace: true }); }
    catch (loginError) { setError(loginError.message); }
    finally { setBusy(false); }
  };

  return <AuthLayout eyebrow={t('welcomeBack')} title={t('makeTodayCount')}
    footer={<>{t('newHere')} <Link to="/register">{t('createAccount')} <ArrowRight size={14} /></Link></>}>
    <p className="auth-intro">{t('signInIntro')}</p>
    <form className="form-stack" onSubmit={submit}>
      <FormField label={t('emailAddress')} name="email" type="email" autoComplete="email" value={form.email} onChange={update} required />
      <FormField label={t('password')} name="password" type="password" autoComplete="current-password" value={form.password} onChange={update} required />
      {error && <div className="form-alert">{error}</div>}
      <button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : t('signIn')} {!busy && <ArrowRight size={18} />}</button>
    </form>
    <Link to="/forgot-password" className="text-link centered-link">{t('forgotPassword')}</Link>
  </AuthLayout>;
}
