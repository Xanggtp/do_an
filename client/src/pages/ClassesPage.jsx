import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Check, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import api from '../lib/api.js';

const initialForm = { name: '', classCode: '', subject: '' };

export function ClassesPage() {
  const { t } = usePreferences();
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [classes, setClasses] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [semester, setSemester] = useState('');
  const [newSemester, setNewSemester] = useState('');
  const [state, setState] = useState({ busy: false, message: '', error: '' });

  const updateField = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  useEffect(() => {
    let active = true;
    api('/api/semesters')
      .then((data) => {
        if (!active) return;
        setSemesters(data.semesters);
        setSemester((current) => current && data.semesters.some((item) => item.code === current) ? current : (data.semesters[0]?.code || ''));
      })
      .catch((error) => {
        if (active) setState({ busy: false, message: '', error: error.message });
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!semester) {
      setClasses([]);
      return undefined;
    }
    let active = true;
    setState((current) => ({ ...current, busy: true, error: '' }));
    api(`/api/classes?semester=${encodeURIComponent(semester)}`)
      .then((data) => {
        if (active) setClasses(data.classes);
      })
      .catch((error) => {
        if (active) setState({ busy: false, message: '', error: error.message });
      })
      .finally(() => {
        if (active) setState((current) => ({ ...current, busy: false }));
      });
    return () => { active = false; };
  }, [semester]);

  const addSemester = async (event) => {
    event.preventDefault();
    setState({ busy: true, message: '', error: '' });
    try {
      const data = await api('/api/semesters', { method: 'POST', body: JSON.stringify({ code: newSemester.trim() }) });
      setSemesters((items) => [...items, data.semester]);
      setSemester(data.semester.code);
      setNewSemester('');
      setState({ busy: false, message: t('semesterCreated'), error: '' });
    } catch (error) {
      setState({ busy: false, message: '', error: error.message });
    }
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      classCode: item.classCode || '',
      subject: item.subject
    });
    setState((current) => ({ ...current, error: '', message: '' }));
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(initialForm);
    setState((current) => ({ ...current, error: '', message: '' }));
  };

  const saveClass = async (event) => {
    event.preventDefault();
    setState({ busy: true, message: '', error: '' });
    try {
      if (editingId) {
        const data = await api(`/api/classes/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify({ ...form, semester })
        });
        setClasses((items) => items.map((cls) => cls.id === editingId ? data.class : cls));
        setEditingId(null);
        setForm(initialForm);
        setState({ busy: false, message: t('classUpdated'), error: '' });
      } else {
        const data = await api('/api/classes', {
          method: 'POST',
          body: JSON.stringify({ ...form, semester })
        });
        setClasses((items) => [...items, data.class]);
        setForm(initialForm);
        setState({ busy: false, message: t('classAdded'), error: '' });
      }
    } catch (error) {
      setState({ busy: false, message: '', error: error.message });
    }
  };

  const handleDeleteClass = async (item) => {
    const confirmed = window.confirm(t('confirmDeleteClass'));
    if (!confirmed) return;
    setState({ busy: true, message: '', error: '' });
    try {
      await api(`/api/classes/${item.id}`, { method: 'DELETE' });
      setClasses((items) => items.filter((cls) => cls.id !== item.id));
      if (editingId === item.id) {
        setEditingId(null);
        setForm(initialForm);
      }
      setState({ busy: false, message: t('classDeleted'), error: '' });
    } catch (error) {
      setState({ busy: false, message: '', error: error.message });
    }
  };

  const editingItem = classes.find((c) => c.id === editingId);

  return <Layout>
    <div className="page-wrap classes-page">
      <Link to="/dashboard" className="back-link classes-back"><ArrowLeft size={16} /> {t('backToWorkspace')}</Link>
      <header className="classes-header">
        <div>
          <p className="eyebrow">{t('classroomSetup')}</p>
          <h1>{t('shapeWorkspace')}</h1>
          <p className="page-subtitle">{t('classesIntro')}</p>
        </div>
        <div className="classes-orbit"><BookOpen size={29} /></div>
      </header>
      <div className="classes-layout">
        <section className="classes-form-panel">
          <div className="classes-section-head">
            <div className="settings-icon">
              {editingId ? <Pencil size={18} /> : <Plus size={18} />}
            </div>
            <div>
              <h2>{editingId ? t('editClass') : t('addClass')}</h2>
              <p>{editingId ? `${t('editingClass')}: ${editingItem?.name || ''}` : t('addClassCopy')}</p>
            </div>
          </div>
          <label className="field semester-field">
            <span className="field-label">{t('academicSemester')}</span>
            <select
              className="input"
              value={semester}
              onChange={(event) => {
                setSemester(event.target.value);
                if (editingId) handleCancelEdit();
              }}
              disabled={!semesters.length}
            >
              <option value="" disabled>{t('selectSemester')}</option>
              {semesters.map((item) => <option key={item.id} value={item.code}>{item.code}</option>)}
            </select>
            <span className="field-hint">{t('semesterHint')}</span>
          </label>
          <form className="semester-create-form" onSubmit={addSemester}>
            <label className="field">
              <span className="field-label">{t('createSemester')}</span>
              <input
                className="input"
                value={newSemester}
                onChange={(event) => setNewSemester(event.target.value)}
                placeholder={t('semesterPlaceholder')}
                pattern="\d{4}\.[123]"
                required
              />
            </label>
            <button className="outline-button" type="submit" disabled={state.busy}>
              <Plus size={15} /> {t('createSemester')}
            </button>
          </form>
          <form className="form-stack" onSubmit={saveClass}>
            <label className="field">
              <span className="field-label">{t('classNameLabel')}</span>
              <input
                className="input"
                name="name"
                value={form.name}
                onChange={updateField}
                placeholder={t('classNamePlaceholder')}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">{t('classId')}</span>
              <input
                className="input"
                name="classCode"
                value={form.classCode}
                onChange={updateField}
                placeholder={t('classIdPlaceholder')}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">{t('subject')}</span>
              <input
                className="input"
                name="subject"
                value={form.subject}
                onChange={updateField}
                placeholder={t('subjectPlaceholder')}
                required
              />
            </label>
            {state.error && <div className="form-alert">{state.error}</div>}
            {state.message && <div className="success-message"><Check size={15} /> {state.message}</div>}
            <div className="class-form-actions">
              <button className="primary-button compact-button" disabled={state.busy || !semester}>
                {state.busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : editingId ? (
                  <><Check size={17} /> {t('saveChanges')}</>
                ) : (
                  <><Plus size={17} /> {t('addClass')}</>
                )}
              </button>
              {editingId && (
                <button
                  type="button"
                  className="outline-button compact-button"
                  onClick={handleCancelEdit}
                  disabled={state.busy}
                >
                  <X size={15} /> {t('cancelEdit')}
                </button>
              )}
            </div>
          </form>
        </section>
        <section className="classes-list-panel">
          <div className="classes-section-head">
            <div>
              <p className="eyebrow">{t('yourClasses')}{semester ? ` · ${semester}` : ''}</p>
              <h2>{classes.length ? `${classes.length} ${t('added')}` : t('startingPoint')}</h2>
            </div>
          </div>
          {classes.length ? (
            <div className="created-class-list">
              {classes.map((item) => (
                <article
                  className={`created-class ${editingId === item.id ? 'is-editing' : ''}`}
                  key={item.id}
                >
                  <span className="class-color-dot sage" />
                  <div className="created-class-info">
                    <strong>{item.name}</strong>
                    <p>{item.classCode ? `${item.classCode} · ${item.subject}` : item.subject}</p>
                  </div>
                  <div className="created-class-actions">
                    <button
                      type="button"
                      className="class-action-btn edit"
                      onClick={() => handleStartEdit(item)}
                      title={t('editClass')}
                      aria-label={t('editClass')}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="class-action-btn delete"
                      onClick={() => handleDeleteClass(item)}
                      title={t('deleteClass')}
                      aria-label={t('deleteClass')}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="classes-empty">
              <BookOpen size={22} />
              <p>{t('classesAppear')}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  </Layout>;
}
