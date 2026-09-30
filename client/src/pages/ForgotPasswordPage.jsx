import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, LoaderCircle } from 'lucide-react';
import { AuthLayout } from '../components/AuthLayout.jsx';
import { FormField } from '../components/FormField.jsx';
import api from '../lib/api.js';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState(''); const [question, setQuestion] = useState(''); const [answer, setAnswer] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const findQuestion = async (event) => { event.preventDefault(); setError(''); setBusy(true); try { const data = await api('/api/auth/forgot-password/question', { method: 'POST', body: JSON.stringify({ email }) }); setQuestion(data.securityQuestion); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } };
  const reset = async (event) => { event.preventDefault(); setError(''); setBusy(true); try { await api('/api/auth/forgot-password/reset', { method: 'POST', body: JSON.stringify({ email, securityAnswer: answer, newPassword: password }) }); setDone(true); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } };
  return <AuthLayout eyebrow="Account recovery" title={done ? 'You are back on track.' : 'Reset your password.'}>
    {done ? <div className="success-state">
        <div className="success-icon"><Check size={22} />
        </div><p>Your password has been updated securely.</p>
        <Link to="/login" className="primary-button">Return to sign in <ArrowRight size={18} />
        </Link></div> : !question ? <><p className="auth-intro">Answer your private security question to create a new password.</p><form className="form-stack" onSubmit={findQuestion}><FormField label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />{error && <div className="form-alert">{error}</div>}<button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : 'Find my question'} {!busy && <ArrowRight size={18} />}</button></form></> : <><button className="back-link inline-back" onClick={() => { setQuestion(''); setError(''); }}><ArrowLeft size={16} /> Use a different email</button><form className="form-stack" onSubmit={reset}><div className="question-card"><span>Security question</span><strong>{question}</strong></div><FormField label="Your answer" value={answer} onChange={(event) => setAnswer(event.target.value)} required /><FormField label="New password" type="password" hint="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} required />{error && <div className="form-alert">{error}</div>}<button className="primary-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : 'Reset password'} {!busy && <ArrowRight size={18} />}</button></form></>}
    {!done && <div className="auth-footer"><Link to="/login"><ArrowLeft size={14} /> Back to sign in</Link></div>}
  </AuthLayout>;
}
