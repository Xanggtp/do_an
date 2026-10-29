import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, Check, Clock3, Film, Pencil, Plus, Search, SlidersHorizontal, Trash2, UploadCloud } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { DeleteClassModal } from '../components/DeleteClassModal.jsx';
import { DeleteSemesterModal } from '../components/DeleteSemesterModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import api from '../lib/api.js';
import { getClassVideos, mockClasses, mockTeacher } from '../lib/mockObservations.js';

function formatDate(value, language) {
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function formatDuration(seconds) {
  return seconds ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : 'Preparing';
}

function VideoCard({ video, language, t }) {
  const statusLabels = { COMPLETED: t('completed'), PROCESSING: t('processing'), PENDING: t('pending') };
  const card = (
    <article className="observation-card">
      <div className="observation-thumbnail" style={{ background: video.thumbnail }}>
        <span className="thumbnail-kicker"><Film size={13} /> {t('observation')}</span>
        <span className={`status-pill status-${video.status.toLowerCase()}`}><span /> {statusLabels[video.status]}</span>
        {video.status === 'COMPLETED' && <span className="thumbnail-play"><ArrowUpRight size={19} /></span>}
      </div>
      <div className="observation-card-body">
        <div className="observation-card-meta"><span>{formatDate(video.date, language)}</span><span>{formatDuration(video.duration)}</span></div>
        <h3>{video.title}</h3>
        <p>{video.summary}</p>
        <div className="observation-card-footer">
          <span className="card-status-label">{statusLabels[video.status]}</span>
          {video.status === 'COMPLETED' && <span className="card-open">{t('openAnalysis')} <ArrowUpRight size={14} /></span>}
        </div>
      </div>
    </article>
  );

  return video.status === 'COMPLETED' ? <Link to={`/observation/${video.id}`} className="observation-card-link">{card}</Link> : card;
}

export function DashboardPage() {
  const { user } = useAuth();
  const { language, t } = usePreferences();
  const [classes, setClasses] = useState([]);
  const [activeClassId, setActiveClassId] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [semesters, setSemesters] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [classToDelete, setClassToDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [semesterToDelete, setSemesterToDelete] = useState(null);
  const [deleteSemesterBusy, setDeleteSemesterBusy] = useState(false);
  const [deleteSemesterError, setDeleteSemesterError] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    let active = true;
    api('/api/semesters')
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data.semesters)) {
          setSemesters(data.semesters);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    api('/api/classes')
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data.classes)) {
          const accents = ['sage', 'coral', 'ochre'];
          const userClasses = data.classes.map((cls, idx) => ({
            ...cls,
            accent: accents[idx % accents.length]
          }));
          setClasses(userClasses);
          setActiveClassId((prev) => (userClasses.some((c) => c.id === prev) ? prev : (userClasses[0]?.id || '')));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isDropdownOpen) return;
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen]);

  const semesterOptions = useMemo(() => {
    const list = new Set();
    semesters.forEach((item) => item.code && list.add(item.code));
    classes.forEach((item) => item.semester && list.add(item.semester));
    return Array.from(list).sort();
  }, [semesters, classes]);

  const filteredClasses = useMemo(() => {
    if (!selectedSemester) return classes;
    return classes.filter((item) => item.semester === selectedSemester);
  }, [classes, selectedSemester]);

  const handleSelectSemester = (sem) => {
    setSelectedSemester(sem);
    setIsDropdownOpen(false);
    const nextFiltered = sem ? classes.filter((item) => item.semester === sem) : classes;
    if (nextFiltered.length && !nextFiltered.some((item) => item.id === activeClassId)) {
      setActiveClassId(nextFiltered[0].id);
    }
  };

  const handleRequestDelete = (item) => {
    if (!item) return;
    setDeleteError('');
    setClassToDelete(item);
  };

  const handleConfirmDelete = async (item) => {
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await api(`/api/classes/${item.id}`, { method: 'DELETE' });
      setClasses((prev) => {
        const next = prev.filter((cls) => cls.id !== item.id);
        const nextFiltered = selectedSemester ? next.filter((cls) => cls.semester === selectedSemester) : next;
        setActiveClassId(nextFiltered[0]?.id || (next[0]?.id || ''));
        return next;
      });
      setClassToDelete(null);
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
      setSemesters((prev) => prev.filter((s) => s.id !== semObj.id && s.code !== semObj.code));
      setClasses((prev) => prev.filter((c) => c.semester !== semObj.code && c.semesterId !== semObj.id));
      if (selectedSemester === semObj.code) {
        setSelectedSemester('');
      }
      setSemesterToDelete(null);
    } catch (error) {
      setDeleteSemesterError(error.message || 'Failed to delete semester.');
    } finally {
      setDeleteSemesterBusy(false);
    }
  };

  const semesterClasses = semesterToDelete
    ? classes.filter((c) => c.semester === semesterToDelete.code || c.semesterId === semesterToDelete.id)
    : [];

  const activeClass = filteredClasses.find((item) => item.id === activeClassId) || filteredClasses[0] || null;
  const videos = useMemo(() => {
    if (!activeClass) return [];
    return getClassVideos(activeClass.id).filter((video) => video.title.toLowerCase().includes(query.toLowerCase()));
  }, [activeClass, query]);
  const firstName = user?.name?.split(' ')[0] || mockTeacher.name.split(' ')[0];

  return (
    <Layout>
      <div className="page-wrap observation-dashboard">
        <header className="workspace-header">
          <div>
            <p className="eyebrow"><span className="eyebrow-pulse" /> {t('classroomStudio')}</p>
            <h1>{t('goodMorning')} {firstName}.</h1>
            <p className="page-subtitle">{t('dashboardSubtitle')}</p>
          </div>
        </header>
        <div className="workspace-layout">
          <aside className="class-rail">
            <div className="class-rail-heading">
              <div>
                <p className="eyebrow">{t('yourClasses')}{selectedSemester ? ` · ${selectedSemester}` : ''}</p>
                <strong>{filteredClasses.length} {t('activeClasses')}</strong>
              </div>
              <div className="class-rail-tools">
                <Link
                  to={selectedSemester ? `/classes?semester=${encodeURIComponent(selectedSemester)}` : (activeClass?.semester ? `/classes?semester=${encodeURIComponent(activeClass.semester)}` : '/classes')}
                  className="icon-button-light"
                  title={t('manageClasses')}
                  aria-label={t('manageClasses')}
                >
                  <BookOpen size={15} />
                </Link>
                <div className="semester-filter-dropdown" ref={dropdownRef}>
                  <button
                    type="button"
                    className={`icon-button-light${selectedSemester ? ' is-active' : ''}`}
                    onClick={() => setIsDropdownOpen((prev) => !prev)}
                    aria-label={t('filterClasses')}
                    aria-expanded={isDropdownOpen}
                    aria-haspopup="listbox"
                    title={selectedSemester ? `${t('academicSemester')}: ${selectedSemester}` : t('filterClasses')}
                  >
                    <SlidersHorizontal size={15} />
                  </button>
                  <select
                    className="sr-only"
                    value={selectedSemester}
                    onChange={(event) => handleSelectSemester(event.target.value)}
                    aria-label={t('filterClasses')}
                  >
                    <option value="">{t('allSemesters')}</option>
                    {semesterOptions.map((sem) => (
                      <option key={sem} value={sem}>{sem}</option>
                    ))}
                  </select>
                  {isDropdownOpen && (
                    <div className="semester-menu" role="listbox" aria-label={t('filterClasses')}>
                      <div className="semester-menu-header">{t('academicSemester')}</div>
                      <button
                        type="button"
                        role="option"
                        aria-selected={!selectedSemester}
                        className={`semester-menu-item${!selectedSemester ? ' is-selected' : ''}`}
                        onClick={() => handleSelectSemester('')}
                      >
                        <span>{t('allSemesters')}</span>
                        {!selectedSemester && <Check size={14} />}
                      </button>
                      {semesterOptions.map((sem) => {
                        const semObj = semesters.find((s) => s.code === sem) || { code: sem, id: sem };
                        return (
                          <div key={sem} className="semester-menu-row">
                            <button
                              type="button"
                              role="option"
                              aria-selected={selectedSemester === sem}
                              className={`semester-menu-item${selectedSemester === sem ? ' is-selected' : ''}`}
                              onClick={() => handleSelectSemester(sem)}
                            >
                              <span>{sem}</span>
                              {selectedSemester === sem && <Check size={14} />}
                            </button>
                            <button
                              type="button"
                              className="semester-menu-delete-btn"
                              title={t('deleteSemester')}
                              aria-label={`${t('deleteSemester')} ${sem}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsDropdownOpen(false);
                                handleRequestDeleteSemester(semObj);
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="class-list">
              {filteredClasses.length ? (
                filteredClasses.map((item) => (
                  <button
                    key={item.id}
                    className={`class-list-item ${item.id === activeClass?.id ? 'is-active' : ''}`}
                    onClick={() => setActiveClassId(item.id)}
                  >
                    <span className={`class-color-dot ${item.accent || 'sage'}`} />
                    <span className="class-list-copy">
                      <strong>{item.name}</strong>
                      <small>{item.classCode ? `${item.classCode} · ${item.subject}` : item.subject}</small>
                    </span>
                    {item.id === activeClass?.id && <Check size={15} />}
                  </button>
                ))
              ) : (
                <div className="empty-class-list">
                  {classes.length ? t('noClassesInSemester') : t('noClassesFound')}
                </div>
              )}
            </div>
            <div className="class-rail-note"><Clock3 size={16} /><span>{t('aiNotes')}</span></div>
          </aside>
          <section className="observation-library">
            {activeClass ? (
              <>
                <div className="library-heading">
                  <div>
                    <p className="eyebrow">{t('selectedClass')}</p>
                    <div className="library-title-row">
                      <h2>{activeClass.name}</h2>
                      <div className="class-heading-actions">
                        <Link
                          to={`/classes?semester=${encodeURIComponent(activeClass.semester || '')}&editId=${activeClass.id}`}
                          className="class-action-btn edit"
                          title={t('editClass')}
                          aria-label={t('editClass')}
                        >
                          <Pencil size={15} />
                        </Link>
                        <button
                          type="button"
                          className="class-action-btn delete"
                          onClick={() => handleRequestDelete(activeClass)}
                          title={t('deleteClass')}
                          aria-label={t('deleteClass')}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                    <p>{activeClass.classCode ? `${activeClass.classCode} · ${activeClass.subject}` : activeClass.subject}</p>
                  </div>
                  <div className="library-tools">
                    <label className="search-field">
                      <Search size={15} />
                      <span className="sr-only">{t('searchObservations')}</span>
                      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchObservations')} />
                    </label>
                    <span className="video-count">{videos.length} {videos.length === 1 ? t('video') : t('videos')}</span>
                  </div>
                </div>
                {videos.length ? (
                  <div className="observation-grid">
                    {videos.map((video) => <VideoCard key={video.id} video={video} language={language} t={t} />)}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Film size={23} />
                    <h3>{t('noMatchingObservations')}</h3>
                    <p>{t('tryAnotherSearch')}</p>
                    <Link
                      to={`/upload?classId=${activeClass.id}`}
                      state={{ classId: activeClass.id, classItem: activeClass }}
                      className="primary-button"
                      style={{ marginTop: '16px', minHeight: '36px', height: '36px', padding: '0 15px', fontSize: '0.74rem' }}
                    >
                      <UploadCloud size={15} /> {t('uploadObservation')}
                    </Link>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">
                <Film size={23} />
                <h3>{t('noClassesFound')}</h3>
                <p>{t('classesAppear')}</p>
                <Link
                  to="/classes"
                  className="primary-button"
                  style={{ marginTop: '16px', minHeight: '36px', height: '36px', padding: '0 15px', fontSize: '0.74rem' }}
                >
                  <Plus size={15} /> {t('addClass')}
                </Link>
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
        classesCount={semesterClasses.length}
        classesList={semesterClasses}
        onClose={() => {
          if (!deleteSemesterBusy) setSemesterToDelete(null);
        }}
        onConfirm={handleConfirmDeleteSemester}
        isBusy={deleteSemesterBusy}
        error={deleteSemesterError}
      />
    </Layout>
  );
}
