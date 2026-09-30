import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout.jsx';
import { FormField } from '../components/FormField.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', securityQuestion: 'What was the name of your first school?', securityAnswer: '' });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/dashboard" replace />;
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.');
    setBusy(true);
    try { await register(form); navigate('/dashboard', { replace: true }); }
    catch (registerError) { setError(registerError.message); }
    finally { setBusy(false); }
  };
  return <AuthLayout eyebrow="Start fresh" title="Build your north star."
    footer={<>Already have an account? <Link to="/login">Sign in <ArrowRight size={14} /></Link></>}>
    <p className="auth-intro">A focused account for the things you want to move forward.</p>
    <form className="form-stack" onSubmit={submit}>
      <div className="form-grid"><FormField label="Your name" name="name" autoComplete="name" value={form.name} onChange={update} required /><FormField label="Email address" name="email" type="email" autoComplete="email" value={form.email} onChange={update} required /></div>
      <div className="form-grid"><FormField label="Password" name="password" type="password" autoComplete="new-password" hint="At least 8 characters" value={form.password} onChange={update} required /><FormField label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={update} required /></div>
      <div className="security-box"><p className="security-title">Your recovery key</p><p className="security-copy">This answer is stored securely and is never emailed. You will need it if you forget your password.</p><label className="field"><span className="field-label">Security question</span><select className="input" name="securityQuestion" value={form.securityQuestion} onChange={update}><option>What was the name of your first school?</option><option>What city were you born in?</option><option>What was your childhood nickname?</option></select></label><FormField label="Your answer" name="securityAnswer" value={form.securityAnswer} onChange={update} required /></div>
      {error && <div className="form-alert">{error}</div>}
      <button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : 'Create account'} {!busy && <ArrowRight size={18} />}</button>
    </form>
  </AuthLayout>;
}
