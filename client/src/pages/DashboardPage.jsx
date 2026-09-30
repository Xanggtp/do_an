import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, CheckCircle2, CircleDashed, Settings2 } from 'lucide-react';
import { Layout } from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export function DashboardPage() {
  const { user } = useAuth();
  const firstName = user.name.split(' ')[0];
  return <Layout><div className="page-wrap dashboard-page">
    <header className="page-header">
        <div><p className="eyebrow">Monday, September 28, 2026</p>
        <h1>Good morning, {firstName}.</h1><p className="page-subtitle">A little clarity goes a long way. Here is your space to begin.</p></div><Link className="outline-button" to="/settings"><Settings2 size={17} /> Settings</Link></header>
    <section className="focus-banner"><div><p className="eyebrow light-eyebrow">Your north star</p><h2>Keep the important things close.</h2><p>Use this quiet space to focus on what deserves your attention today.</p></div><div className="focus-mark"><CircleDashed size={48} strokeWidth={1.2} /></div></section>
    <div className="dashboard-grid"><section className="content-section"><div className="section-heading"><div><p className="eyebrow">Today</p><h2>Your rhythm</h2></div><span className="date-chip"><CalendarDays size={15} /> Sept 28</span></div><div className="rhythm-list"><div className="rhythm-row"><div className="rhythm-icon done"><CheckCircle2 size={18} /></div><div><strong>Arrive with intention</strong><p>Take a breath before the day takes one for you.</p></div><span className="status-done">Complete</span></div><div className="rhythm-row"><div className="rhythm-icon"><CircleDashed size={18} /></div><div><strong>Choose one meaningful thing</strong><p>Small progress is still progress.</p></div><span className="status-open">Open</span></div></div></section><aside className="next-card"><p className="eyebrow">Your account</p><h3>Keep your details current.</h3><p>Update your name or add a short bio so your profile feels like yours.</p><Link to="/settings" className="text-link">Open settings <ArrowUpRight size={15} /></Link></aside></div>
  </div></Layout>;
}
