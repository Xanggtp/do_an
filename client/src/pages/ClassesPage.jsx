import { useState } from 'react';
import { ArrowLeft, BookOpen, Check, LoaderCircle, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import api from '../lib/api.js';

const initialForm = { name: '', subject: '', gradeLevel: '' };

export function ClassesPage() {
  const [form, setForm] = useState(initialForm);
  const [classes, setClasses] = useState([]);
  const [state, setState] = useState({ busy: false, message: '', error: '' });

  const updateField = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  const addClass = async (event) => {
    event.preventDefault();
    setState({ busy: true, message: '', error: '' });
    try {
      const data = await api('/api/classes', { method: 'POST', body: JSON.stringify(form) });
      setClasses((items) => [...items, data.class]);
      setForm(initialForm);
      setState({ busy: false, message: 'Class added to your workspace.', error: '' });
    } catch (error) {
      setState({ busy: false, message: '', error: error.message });
    }
  };

  return <Layout><div className="page-wrap classes-page">
    <Link to="/dashboard" className="back-link classes-back"><ArrowLeft size={16} /> Back to workspace</Link>
    <header className="classes-header">
      <div><p className="eyebrow">Classroom setup</p><h1>Shape your workspace.</h1><p className="page-subtitle">Add the subjects and classes you teach so every observation has a clear home.</p></div>
      <div className="classes-orbit"><BookOpen size={29} /></div>
    </header>
    <div className="classes-layout">
      <section className="classes-form-panel">
        <div className="classes-section-head"><div className="settings-icon"><Plus size={18} /></div><div><h2>Add a class</h2><p>Give each class a subject and grade level.</p></div></div>
        <form className="form-stack" onSubmit={addClass}>
          <label className="field"><span className="field-label">Class name</span><input className="input" name="name" value={form.name} onChange={updateField} placeholder="e.g. Algebra 1" required /></label>
          <label className="field"><span className="field-label">Subject</span><input className="input" name="subject" value={form.subject} onChange={updateField} placeholder="e.g. Mathematics" required /></label>
          <label className="field"><span className="field-label">Grade level</span><input className="input" name="gradeLevel" value={form.gradeLevel} onChange={updateField} placeholder="e.g. Grade 9" required /></label>
          {state.error && <div className="form-alert">{state.error}</div>}
          {state.message && <div className="success-message"><Check size={15} /> {state.message}</div>}
          <button className="primary-button compact-button" disabled={state.busy}>{state.busy ? <LoaderCircle className="spin" size={18} /> : <><Plus size={17} /> Add class</>}</button>
        </form>
      </section>
      <section className="classes-list-panel"><div className="classes-section-head"><div><p className="eyebrow">Your classes</p><h2>{classes.length ? `${classes.length} added` : 'A clear starting point'}</h2></div></div>{classes.length ? <div className="created-class-list">{classes.map((item) => <article className="created-class" key={item.id}><span className="class-color-dot sage" /><div><strong>{item.name}</strong><p>{item.subject} · {item.gradeLevel}</p></div><Check size={16} /></article>)}</div> : <div className="classes-empty"><BookOpen size={22} /><p>Classes you add will appear here.</p></div>}</section>
    </div>
  </div></Layout>;
}
