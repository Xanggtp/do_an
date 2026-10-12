import { useState } from 'react';
import { ArrowLeft, BookOpen, Check, LoaderCircle, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import api from '../lib/api.js';

const initialForm = { name: '', subject: '', gradeLevel: '' };

export function ClassesPage() {
  const { t } = usePreferences();
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
      setState({ busy: false, message: t('classAdded'), error: '' });
    } catch (error) {
      setState({ busy: false, message: '', error: error.message });
    }
  };

  return <Layout>
    <div className="page-wrap classes-page">
      <Link to="/dashboard" className="back-link classes-back"><ArrowLeft size={16} /> {t('backToWorkspace')}</Link>
      <header className="classes-header">
        <div><p className="eyebrow">{t('classroomSetup')}</p><h1>{t('shapeWorkspace')}</h1><p className="page-subtitle">{t('classesIntro')}</p></div>
        <div className="classes-orbit"><BookOpen size={29} /></div>
      </header>
      <div className="classes-layout">
        <section className="classes-form-panel">
          <div className="classes-section-head"><div className="settings-icon"><Plus size={18} /></div><div><h2>{t('addClass')}</h2><p>{t('addClassCopy')}</p></div></div>
          <form className="form-stack" onSubmit={addClass}>
            <label className="field"><span className="field-label">{t('className')}</span><input className="input" name="name" value={form.name} onChange={updateField} placeholder={t('classNamePlaceholder')} required /></label>
            <label className="field"><span className="field-label">{t('subject')}</span><input className="input" name="subject" value={form.subject} onChange={updateField} placeholder={t('subjectPlaceholder')} required /></label>
            <label className="field"><span className="field-label">{t('gradeLevel')}</span><input className="input" name="gradeLevel" value={form.gradeLevel} onChange={updateField} placeholder={t('gradePlaceholder')} required /></label>
            {state.error && <div className="form-alert">{state.error}</div>}
            {state.message && <div className="success-message"><Check size={15} /> {state.message}</div>}
            <button className="primary-button compact-button" disabled={state.busy}>{state.busy ? <LoaderCircle className="spin" size={18} /> : <><Plus size={17} /> {t('addClass')}</>}</button>
          </form>
        </section>
        <section className="classes-list-panel">
          <div className="classes-section-head"><div><p className="eyebrow">{t('yourClasses')}</p><h2>{classes.length ? `${classes.length} ${t('added')}` : t('startingPoint')}</h2></div></div>
          {classes.length ? <div className="created-class-list">{classes.map((item) => <article className="created-class" key={item.id}><span className="class-color-dot sage" /><div><strong>{item.name}</strong><p>{item.subject} · {item.gradeLevel}</p></div><Check size={16} /></article>)}</div> : <div className="classes-empty"><BookOpen size={22} /><p>{t('classesAppear')}</p></div>}
        </section>
      </div>
    </div>
  </Layout>;
}
