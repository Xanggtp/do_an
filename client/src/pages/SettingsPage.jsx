import { useState } from 'react';
import { ArrowLeft, Check, LoaderCircle, LockKeyhole, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { FormField, TextareaField } from '../components/FormField.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export function SettingsPage() {
  const { user, updateProfile, changePassword } = useAuth();
  const [profile, setProfile] = useState({ name: user.name, bio: user.bio || '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [profileState, setProfileState] = useState({ busy: false, message: '', error: '' });
  const [passwordState, setPasswordState] = useState({ busy: false, message: '', error: '' });
  const saveProfile = async (event) => { event.preventDefault(); setProfileState({ busy: true, message: '', error: '' }); try { await updateProfile(profile); setProfileState({ busy: false, message: 'Profile saved.', error: '' }); } catch (error) { setProfileState({ busy: false, message: '', error: error.message }); } };
  const savePassword = async (event) => { event.preventDefault(); if (passwords.newPassword !== passwords.confirmPassword) return setPasswordState({ busy: false, message: '', error: 'Passwords do not match.' }); setPasswordState({ busy: true, message: '', error: '' }); try { const data = await changePassword({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword }); setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' }); setPasswordState({ busy: false, message: data.message, error: '' }); } catch (error) { setPasswordState({ busy: false, message: '', error: error.message }); } };
  return <Layout><div className="page-wrap settings-page"><Link to="/dashboard" className="back-link settings-back"><ArrowLeft size={16} /> Back to dashboard</Link><header className="settings-header"><p className="eyebrow">Account settings</p><h1>Make it yours.</h1><p className="page-subtitle">A few details that make this space feel more like home.</p></header><div className="settings-grid"><section className="settings-section"><div className="settings-section-head"><div className="settings-icon"><UserRound size={18} /></div><div><h2>Personal information</h2><p>These details appear on your profile.</p></div></div><form className="form-stack" onSubmit={saveProfile}><FormField label="Name" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} required /><TextareaField label="Bio" hint={`${profile.bio.length}/280 characters`} rows="4" value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} /><FormStatus state={profileState} /><button className="primary-button compact-button" disabled={profileState.busy}>{profileState.busy ? <LoaderCircle className="spin" size={18} /> : 'Save changes'}{!profileState.busy && <Check size={17} />}</button></form></section><section className="settings-section"><div className="settings-section-head"><div className="settings-icon"><LockKeyhole size={18} /></div><div><h2>Change password</h2><p>Use a password you do not use elsewhere.</p></div></div><form className="form-stack" onSubmit={savePassword}><FormField label="Current password" type="password" autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords({ ...passwords, currentPassword: event.target.value })} required /><FormField label="New password" type="password" hint="At least 8 characters" autoComplete="new-password" value={passwords.newPassword} onChange={(event) => setPasswords({ ...passwords, newPassword: event.target.value })} required /><FormField label="Confirm new password" type="password" autoComplete="new-password" value={passwords.confirmPassword} onChange={(event) => setPasswords({ ...passwords, confirmPassword: event.target.value })} required /><FormStatus state={passwordState} /><button className="primary-button compact-button" disabled={passwordState.busy}>{passwordState.busy ? <LoaderCircle className="spin" size={18} /> : 'Update password'}{!passwordState.busy && <Check size={17} />}</button></form></section></div></div></Layout>;
}

function FormStatus({ state }) {
  if (state.error) return <div className="form-alert">{state.error}</div>;
  if (state.message) return <div className="success-message"><Check size={15} /> {state.message}</div>;
  return null;
}
