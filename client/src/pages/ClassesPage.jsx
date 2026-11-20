import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Calendar, Check, ChevronLeft, ChevronRight, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { DeleteClassModal } from '../components/DeleteClassModal.jsx';
import { DeleteSemesterModal } from '../components/DeleteSemesterModal.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import api from '../lib/api.js';

const initialForm = { name: '', classCode: '', subject: '' };
const ALL_SEMESTERS = '__all__';
const CLASSES_PER_PAGE = 6; // 3 rows x 2 columns

export function ClassesPage() {
  const { t } = usePreferences();
  const [searchParams] = useSearchParams();
  const paramSemester = searchParams.get('semester');
  const paramEditId = searchParams.get('editId');

  const editPanelRef = useRef(null);
  const [addForm, setAddForm] = useState(initialForm);
  const [editForm, setEditForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [classes, setClasses] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [addSemester, setAddSemester] = useState('');
  const [editSemester, setEditSemester] = useState('');
  const [listSemester, setListSemester] = useState('');
  const [newSemester, setNewSemester] = useState('');
  const [semesterState, setSemesterState] = useState({ busy: false, message: '', error: '' });
  const [addState, setAddState] = useState({ busy: false, message: '', error: '' });
  const [editState, setEditState] = useState({ busy: false, message: '', error: '' });
  const [listState, setListState] = useState({ busy: false, message: '', error: '' });
  const [page, setPage] = useState(1);
  const [classToDelete, setClassToDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [semesterToDelete, setSemesterToDelete] = useState(null);
  const [deleteSemesterBusy, setDeleteSemesterBusy] = useState(false);
  const [deleteSemesterError, setDeleteSemesterError] = useState('');

  const updateAddField = (event) => setAddForm({ ...addForm, [event.target.name]: event.target.value });
  const updateEditField = (event) => setEditForm({ ...editForm, [event.target.name]: event.target.value });

  useEffect(() => {
    let active = true;
    api('/api/semesters')
      .then((data) => {
        if (!active) return;
        setSemesters(data.semesters);
        const preferred = (paramSemester && data.semesters.some((item) => item.code === paramSemester))
          ? paramSemester
          : (data.semesters[0]?.code || '');
        setAddSemester((current) => current && data.semesters.some((item) => item.code === current) ? current : preferred);
        setListSemester((current) => current && (current === ALL_SEMESTERS || data.semesters.some((item) => item.code === current))
          ? current
          : preferred);
      })
      .catch((error) => {
        if (active) setSemesterState({ busy: false, message: '', error: error.message });
      });
    return () => { active = false; };
  }, [paramSemester]);

  useEffect(() => {
    if (!listSemester) {
      setClasses([]);
      setPage(1);
      return undefined;
    }
    let active = true;
    setPage(1);
    setListState((current) => ({ ...current, busy: true, error: '' }));
    const query = listSemester === ALL_SEMESTERS ? '' : `?semester=${encodeURIComponent(listSemester)}`;
    api(`/api/classes${query}`)
      .then((data) => {
        if (active) {
          setClasses(data.classes);
          if (paramEditId) {
            const editIndex = data.classes.findIndex((c) => c.id === paramEditId);
            const itemToEdit = editIndex >= 0 ? data.classes[editIndex] : null;
            if (itemToEdit) {
              setEditingId(itemToEdit.id);
              setEditSemester(itemToEdit.semester || '');
              setEditForm({
                name: itemToEdit.name,
                classCode: itemToEdit.classCode || '',
                subject: itemToEdit.subject
              });
              setPage(Math.floor(editIndex / CLASSES_PER_PAGE) + 1);
            }
          }
        }
      })
      .catch((error) => {
        if (active) setListState({ busy: false, message: '', error: error.message });
      })
      .finally(() => {
        if (active) setListState((current) => ({ ...current, busy: false }));
      });
    return () => { active = false; };
  }, [listSemester, paramEditId]);

  const addSemesterHandler = async (event) => {
    event.preventDefault();
    setSemesterState({ busy: true, message: '', error: '' });
    try {
      const data = await api('/api/semesters', { method: 'POST', body: JSON.stringify({ code: newSemester.trim() }) });
      setSemesters((items) => [...items, data.semester]);
      setAddSemester(data.semester.code);
      setListSemester(data.semester.code);
      setNewSemester('');
      setSemesterState({ busy: false, message: t('semesterCreated'), error: '' });
    } catch (error) {
      setSemesterState({ busy: false, message: '', error: error.message });
    }
  };

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditSemester(item.semester || '');
    setEditForm({
      name: item.name,
      classCode: item.classCode || '',
      subject: item.subject
    });
    setEditState({ busy: false, error: '', message: '' });
    editPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditSemester('');
    setEditForm(initialForm);
    setEditState({ busy: false, error: '', message: '' });
  };

  const handleAddClass = async (event) => {
    event.preventDefault();
    setAddState({ busy: true, message: '', error: '' });
    try {
      const data = await api('/api/classes', {
        method: 'POST',
        body: JSON.stringify({ ...addForm, semester: addSemester })
      });
      if (listSemester === ALL_SEMESTERS || listSemester === addSemester) {
        setClasses((items) => [...items, data.class]);
      }
      setAddForm(initialForm);
      setAddState({ busy: false, message: t('classAdded'), error: '' });
    } catch (error) {
      setAddState({ busy: false, message: '', error: error.message });
    }
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    if (!editingId) return;
    setEditState({ busy: true, message: '', error: '' });
    try {
      const data = await api(`/api/classes/${editingId}`, {
        method: 'PUT',
        body: JSON.stringify({ ...editForm, semester: editSemester })
      });
      setClasses((items) => {
        if (listSemester !== ALL_SEMESTERS && data.class.semester !== listSemester) {
          return items.filter((cls) => cls.id !== editingId);
        }
        return items.map((cls) => cls.id === editingId ? data.class : cls);
      });
      setEditingId(null);
      setEditSemester('');
      setEditForm(initialForm);
      setEditState({ busy: false, message: t('classUpdated'), error: '' });
    } catch (error) {
      setEditState({ busy: false, message: '', error: error.message });
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
        setEditSemester('');
        setEditForm(initialForm);
      }
      setClassToDelete(null);
      setListState({ busy: false, message: t('classDeleted'), error: '' });
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
        if (addSemester === semObj.code) {
          setAddSemester(next[0]?.code || '');
        }
        if (listSemester === semObj.code) setListSemester(next[0]?.code || '');
        return next;
      });
      if (editSemester === semObj.code) {
        setEditingId(null);
        setEditSemester('');
        setEditForm(initialForm);
      }
      if (listSemester === semObj.code) {
        setClasses([]);
      }
      setSemesterToDelete(null);
      setSemesterState({ busy: false, message: t('semesterDeleted'), error: '' });
    } catch (error) {
      setDeleteSemesterError(error.message || 'Failed to delete semester.');
    } finally {
      setDeleteSemesterBusy(false);
    }
  };

  const editingItem = classes.find((c) => c.id === editingId);
  const currentSemesterObj = semesters.find((s) => s.code === addSemester)
    || (addSemester ? { code: addSemester } : null);
  const totalPages = Math.max(1, Math.ceil(classes.length / CLASSES_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const paginatedClasses = classes.slice(
    (currentPage - 1) * CLASSES_PER_PAGE,
    currentPage * CLASSES_PER_PAGE
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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
          <div className="semester-panel-row">
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
            <form className="semester-create-form" onSubmit={addSemesterHandler}>
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
              <button className="outline-button" type="submit" disabled={semesterState.busy}>
                <Plus size={15} /> {t('createSemester')}
              </button>
            </form>
          </div>
          {semesterState.error && <div className="form-alert semester-feedback">{semesterState.error}</div>}
          {semesterState.message && <div className="success-message semester-feedback"><Check size={15} /> {semesterState.message}</div>}
        </section>

        <section className="classes-form-panel class-form-panel">
          <div className="classes-section-head">
            <div className="settings-icon">
              <Plus size={18} />
            </div>
            <div>
              <p className="eyebrow">02</p>
              <h2>{t('addClass')}</h2>
              <p>{t('addClassCopy')}</p>
            </div>
          </div>
          <div className="selected-semester-card">
            <span className="field-label">{t('academicSemester')}</span>
            <div className="semester-select-row">
              <select
                className="input"
                value={addSemester}
                onChange={(event) => setAddSemester(event.target.value)}
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
          <form className="form-stack" onSubmit={handleAddClass}>
            <label className="field">
              <span className="field-label">{t('classNameLabel')}</span>
              <input
                className="input"
                name="name"
                value={addForm.name}
                onChange={updateAddField}
                placeholder={t('classNamePlaceholder')}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">{t('classId')}</span>
              <input
                className="input"
                name="classCode"
                value={addForm.classCode}
                onChange={updateAddField}
                placeholder={t('classIdPlaceholder')}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">{t('subject')}</span>
              <input
                className="input"
                name="subject"
                value={addForm.subject}
                onChange={updateAddField}
                placeholder={t('subjectPlaceholder')}
                required
              />
            </label>
            {addState.error && <div className="form-alert">{addState.error}</div>}
            {addState.message && <div className="success-message"><Check size={15} /> {addState.message}</div>}
            <div className="class-form-actions">
              <button className="primary-button compact-button" disabled={addState.busy || !addSemester}>
                {addState.busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <><Plus size={17} /> {t('addClass')}</>
                )}
              </button>
            </div>
          </form>
        </section>

        <section
          ref={editPanelRef}
          className={`classes-form-panel edit-class-panel${editingId ? ' is-active' : ''}`}
        >
          <div className="classes-section-head">
            <div className="settings-icon">
              <Pencil size={18} />
            </div>
            <div>
              <p className="eyebrow">03</p>
              <h2>{t('editClass')}</h2>
              <p>{editingId ? `${t('editingClass')}: ${editingItem?.name || editForm.name}` : t('editClassCopy')}</p>
            </div>
          </div>
          {editingId ? (
            <>
              <div className="selected-semester-card">
                <span className="field-label">{t('academicSemester')}</span>
                <select
                  className="input"
                  value={editSemester}
                  onChange={(event) => setEditSemester(event.target.value)}
                  disabled={!semesters.length}
                >
                  <option value="" disabled>{t('selectSemester')}</option>
                  {semesters.map((item) => <option key={item.id} value={item.code}>{item.code}</option>)}
                </select>
              </div>
              <form className="form-stack" onSubmit={handleSaveEdit}>
                <label className="field">
                  <span className="field-label">{t('classNameLabel')}</span>
                  <input
                    className="input"
                    name="name"
                    value={editForm.name}
                    onChange={updateEditField}
                    placeholder={t('classNamePlaceholder')}
                    required
                  />
                </label>
                <label className="field">
                  <span className="field-label">{t('classId')}</span>
                  <input
                    className="input"
                    name="classCode"
                    value={editForm.classCode}
                    onChange={updateEditField}
                    placeholder={t('classIdPlaceholder')}
                    required
                  />
                </label>
                <label className="field">
                  <span className="field-label">{t('subject')}</span>
                  <input
                    className="input"
                    name="subject"
                    value={editForm.subject}
                    onChange={updateEditField}
                    placeholder={t('subjectPlaceholder')}
                    required
                  />
                </label>
                {editState.error && <div className="form-alert">{editState.error}</div>}
                {editState.message && <div className="success-message"><Check size={15} /> {editState.message}</div>}
                <div className="class-form-actions">
                  <button className="primary-button compact-button" disabled={editState.busy || !editSemester}>
                    {editState.busy ? (
                      <LoaderCircle className="spin" size={18} />
                    ) : (
                      <><Check size={17} /> {t('saveChanges')}</>
                    )}
                  </button>
                  <button
                    type="button"
                    className="outline-button compact-button"
                    onClick={handleCancelEdit}
                    disabled={editState.busy}
                  >
                    <X size={15} /> {t('cancelEdit')}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="edit-class-idle">
              {editState.message && (
                <div className="success-message">
                  <Check size={15} /> {editState.message}
                </div>
              )}
              <div className="classes-empty">
                <span className="edit-idle-icon"><Pencil size={20} /></span>
                <p>{t('selectClassToEdit')}</p>
              </div>
            </div>
          )}
        </section>

        <section className="classes-list-panel">
          <div className="classes-list-header">
            <div className="classes-section-head">
              <div className="settings-icon">
                <BookOpen size={18} />
              </div>
              <div>
                <p className="eyebrow">04</p>
                <h2>{t('yourClasses')}</h2>
                <p>
                  {listSemester === ALL_SEMESTERS ? t('allSemesters') : listSemester}
                  {' · '}
                  {classes.length ? `${classes.length} ${t('added')}` : t('startingPoint')}
                </p>
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
          </div>
          {listState.error && <div className="form-alert" style={{ marginTop: 14 }}>{listState.error}</div>}
          {listState.message && <div className="success-message" style={{ marginTop: 14 }}><Check size={15} /> {listState.message}</div>}
          {classes.length ? (
            <>
              <div className="created-class-list">
                {paginatedClasses.map((item) => (
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
              {totalPages > 1 && (
                <nav className="classes-pagination" aria-label="Classes pagination">
                  <span className="classes-pagination-info">
                    {t('pageOf', { page: currentPage, total: totalPages })}
                  </span>
                  <div className="classes-pagination-controls">
                    <button
                      type="button"
                      className="pagination-btn"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      aria-label={t('previousPage')}
                    >
                      <ChevronLeft size={15} /> {t('previousPage')}
                    </button>
                    <div className="pagination-numbers">
                      {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                        <button
                          key={pageNumber}
                          type="button"
                          className={`pagination-num${pageNumber === currentPage ? ' is-active' : ''}`}
                          onClick={() => setPage(pageNumber)}
                          aria-current={pageNumber === currentPage ? 'page' : undefined}
                        >
                          {pageNumber}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="pagination-btn"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      aria-label={t('nextPage')}
                    >
                      {t('nextPage')} <ChevronRight size={15} />
                    </button>
                  </div>
                </nav>
              )}
            </>
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
      classesCount={semesterToDelete ? (semesterToDelete.code === listSemester ? classes.length : 0) : 0}
      classesList={semesterToDelete && semesterToDelete.code === listSemester ? classes : []}
      onClose={() => {
        if (!deleteSemesterBusy) setSemesterToDelete(null);
      }}
      onConfirm={handleConfirmDeleteSemester}
      isBusy={deleteSemesterBusy}
      error={deleteSemesterError}
    />
  </Layout>;
}
