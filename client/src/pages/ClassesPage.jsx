import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Calendar, Check, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { DeleteClassModal } from '../components/DeleteClassModal.jsx';
import { DeleteSemesterModal } from '../components/DeleteSemesterModal.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import api from '../lib/api.js';

const initialForm = { name: '', classCode: '', subject: '' };
const ALL_SEMESTERS = '__all__';

export function ClassesPage() {
  const { t } = usePreferences();
  const [searchParams] = useSearchParams();
  const paramSemester = searchParams.get('semester');
  const paramEditId = searchParams.get('editId');

  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [classes, setClasses] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [classSemester, setClassSemester] = useState('');
  const [listSemester, setListSemester] = useState('');
  const [newSemester, setNewSemester] = useState('');
  const [state, setState] = useState({ busy: false, message: '', error: '' });
  const [classToDelete, setClassToDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [semesterToDelete, setSemesterToDelete] = useState(null);
  const [deleteSemesterBusy, setDeleteSemesterBusy] = useState(false);
  const [deleteSemesterError, setDeleteSemesterError] = useState('');

  const updateField = (event) => setForm({ ...form, [event.target.name]: event.target.value });

  useEffect(() => {
    let active = true;
    api('/api/semesters')
      .then((data) => {
        if (!active) return;
        setSemesters(data.semesters);
        const preferred = (paramSemester && data.semesters.some((item) => item.code === paramSemester))
          ? paramSemester
          : (data.semesters[0]?.code || '');
        setClassSemester((current) => current && data.semesters.some((item) => item.code === current) ? current : preferred);
        setListSemester((current) => current && (current === ALL_SEMESTERS || data.semesters.some((item) => item.code === current))
          ? current
          : preferred);
      })
      .catch((error) => {
        if (active) setState({ busy: false, message: '', error: error.message });
      });
    return () => { active = false; };
  }, [paramSemester]);

  useEffect(() => {
    if (!listSemester) {
      setClasses([]);
      return undefined;
    }
    let active = true;
    setState((current) => ({ ...current, busy: true, error: '' }));
    const query = listSemester === ALL_SEMESTERS ? '' : `?semester=${encodeURIComponent(listSemester)}`;
    api(`/api/classes${query}`)
      .then((data) => {
        if (active) {
          setClasses(data.classes);
          if (paramEditId) {
            const itemToEdit = data.classes.find((c) => c.id === paramEditId);
            if (itemToEdit) {
              setEditingId(itemToEdit.id);
              setForm({
                name: itemToEdit.name,
                classCode: itemToEdit.classCode || '',
                subject: itemToEdit.subject
              });
            }
          }
        }
      })
      .catch((error) => {
        if (active) setState({ busy: false, message: '', error: error.message });
      })
      .finally(() => {
        if (active) setState((current) => ({ ...current, busy: false }));
      });
    return () => { active = false; };
  }, [listSemester, paramEditId]);

  const addSemester = async (event) => {
    event.preventDefault();
    setState({ busy: true, message: '', error: '' });
    try {
      const data = await api('/api/semesters', { method: 'POST', body: JSON.stringify({ code: newSemester.trim() }) });
      setSemesters((items) => [...items, data.semester]);
      setClassSemester(data.semester.code);
      setListSemester(data.semester.code);
      setNewSemester('');
      setState({ busy: false, message: t('semesterCreated'), error: '' });
    } catch (error) {
      setState({ busy: false, message: '', error: error.message });
    }
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setClassSemester(item.semester || '');
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
          body: JSON.stringify({ ...form, semester: classSemester })
        });
        setClasses((items) => items.map((cls) => cls.id === editingId ? data.class : cls));
        setEditingId(null);
        setForm(initialForm);
        setState({ busy: false, message: t('classUpdated'), error: '' });
      } else {
        const data = await api('/api/classes', {
          method: 'POST',
          body: JSON.stringify({ ...form, semester: classSemester })
        });
        setClasses((items) => [...items, data.class]);
        setForm(initialForm);
        setState({ busy: false, message: t('classAdded'), error: '' });
      }
    } catch (error) {
      setState({ busy: false, message: '', error: error.message });
    }
  };

  const handleRequestDelete = (item) => {
    setDeleteError('');
    setClassToDelete(item);
  };

  const handleConfirmDelete = async (item) => {
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await api(`/api/classes/${item.id}`, { method: 'DELETE' });
      setClasses((items) => items.filter((cls) => cls.id !== item.id));
      if (editingId === item.id) {
        setEditingId(null);
        setForm(initialForm);
      }
      setClassToDelete(null);
      setState({ busy: false, message: t('classDeleted'), error: '' });
    } catch (error) {
      setDeleteError(error.message || 'Failed to delete class.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleRequestDeleteSemester = (semObj) => {
    if (!semObj) return;
    setDeleteSemesterError('');
    setSemesterToDelete(semObj);
  };

  const handleConfirmDeleteSemester = async (semObj) => {
    setDeleteSemesterBusy(true);
    setDeleteSemesterError('');
    try {
      await api(`/api/semesters/${semObj.id || semObj.code}`, { method: 'DELETE' });
      setSemesters((prev) => {
        const next = prev.filter((s) => s.id !== semObj.id && s.code !== semObj.code);
        if (classSemester === semObj.code) {
          setClassSemester(next[0]?.code || '');
        }
        if (listSemester === semObj.code) setListSemester(next[0]?.code || '');
        return next;
      });
      if (classSemester === semObj.code) {
        setClasses([]);
      }
      setSemesterToDelete(null);
      setState({ busy: false, message: t('semesterDeleted'), error: '' });
    } catch (error) {
      setDeleteSemesterError(error.message || 'Failed to delete semester.');
    } finally {
      setDeleteSemesterBusy(false);
    }
  };

  const editingItem = classes.find((c) => c.id === editingId);
  const currentSemesterObj = semesters.find((s) => s.code === classSemester)
    || (classSemester ? { code: classSemester } : null);

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
        <section className="classes-form-panel semester-panel">
          <div className="classes-section-head">
            <div className="settings-icon">
              <Calendar size={18} />
            </div>
            <div>
              <p className="eyebrow">01</p>
              <h2>{t('createSemester')}</h2>
              <p>{t('semesterHint')}</p>
            </div>
          </div>
          <form className="semester-create-form" onSubmit={addSemester}>
            <label className="field">
              <span className="field-label">{t('academicSemester')}</span>
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
        </section>
        <section className="classes-form-panel class-form-panel">
          <div className="classes-section-head">
            <div className="settings-icon">
              {editingId ? <Pencil size={18} /> : <Plus size={18} />}
            </div>
            <div>
              <p className="eyebrow">02</p>
              <h2>{editingId ? t('editClass') : t('addClass')}</h2>
              <p>{editingId ? `${t('editingClass')}: ${editingItem?.name || ''}` : t('addClassCopy')}</p>
            </div>
          </div>
          <div className="selected-semester-card">
            <span className="field-label">{t('academicSemester')}</span>
            <div className="semester-select-row">
              <select
                className="input"
                value={classSemester}
                onChange={(event) => {
                  setClassSemester(event.target.value);
                  if (editingId) handleCancelEdit();
                }}
                disabled={!semesters.length}
              >
                <option value="" disabled>{t('selectSemester')}</option>
                {semesters.map((item) => <option key={item.id} value={item.code}>{item.code}</option>)}
              </select>
              {currentSemesterObj && (
                <button
                  type="button"
                  className="class-action-btn delete semester-delete-btn"
                  onClick={() => handleRequestDeleteSemester(currentSemesterObj)}
                  title={t('deleteSemester')}
                  aria-label={t('deleteSemester')}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
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
              <button className="primary-button compact-button" disabled={state.busy || !classSemester}>
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
            <div className="settings-icon">
              <BookOpen size={18} />
            </div>
            <div>
              <p className="eyebrow">03</p>
              <h2>{t('yourClasses')}</h2>
              <p>{listSemester === ALL_SEMESTERS ? t('allSemesters') : listSemester}</p>
            </div>
          </div>
          <label className="field classes-filter">
            <span className="field-label">{t('academicSemester')}</span>
            <select
              className="input"
              value={listSemester}
              onChange={(event) => setListSemester(event.target.value)}
              disabled={!semesters.length}
            >
              <option value={ALL_SEMESTERS}>{t('allSemesters')}</option>
              {semesters.map((item) => <option key={item.id} value={item.code}>{item.code}</option>)}
            </select>
          </label>
          <div className="classes-list-summary">
            <h3>{classes.length ? `${classes.length} ${t('added')}` : t('startingPoint')}</h3>
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
                    <p>
                      {item.classCode ? `${item.classCode} · ${item.subject}` : item.subject}
                      {item.semester ? ` · ${item.semester}` : ''}
                    </p>
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
                      onClick={() => handleRequestDelete(item)}
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
    <DeleteClassModal
      isOpen={Boolean(classToDelete)}
      classItem={classToDelete}
      onClose={() => {
        if (!deleteBusy) setClassToDelete(null);
      }}
      onConfirm={handleConfirmDelete}
      isBusy={deleteBusy}
      error={deleteError}
    />
    <DeleteSemesterModal
      isOpen={Boolean(semesterToDelete)}
      semesterItem={semesterToDelete}
      classesCount={semesterToDelete ? (semesterToDelete.code === classSemester ? classes.length : 0) : 0}
      classesList={semesterToDelete && semesterToDelete.code === classSemester ? classes : []}
      onClose={() => {
        if (!deleteSemesterBusy) setSemesterToDelete(null);
      }}
      onConfirm={handleConfirmDeleteSemester}
      isBusy={deleteSemesterBusy}
      error={deleteSemesterError}
    />
  </Layout>;
}
