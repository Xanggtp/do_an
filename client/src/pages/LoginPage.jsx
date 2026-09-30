import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout.jsx';
import { FormField } from '../components/FormField.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export function LoginPage() {
  const { user, login } = useAuth();
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

  return <AuthLayout eyebrow="Welcome back" title="Make today count."
    footer={<>New here? <Link to="/register">Create an account <ArrowRight size={14} /></Link></>}>
    <p className="auth-intro">Sign in to pick up where you left off.</p>
    <form className="form-stack" onSubmit={submit}>
      <FormField label="Email address" name="email" type="email" autoComplete="email" value={form.email} onChange={update} required />
      <FormField label="Password" name="password" type="password" autoComplete="current-password" value={form.password} onChange={update} required />
      {error && <div className="form-alert">{error}</div>}
      <button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : 'Sign in'} {!busy && <ArrowRight size={18} />}</button>
    </form>
    <Link to="/forgot-password" className="text-link centered-link">Forgot your password?</Link>
  </AuthLayout>;
}
