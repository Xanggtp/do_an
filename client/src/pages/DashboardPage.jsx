import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, Calendar, Check, Clock3, Film, LoaderCircle, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Trash2, UploadCloud, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { DeleteClassModal } from '../components/DeleteClassModal.jsx';
import { DeleteSemesterModal } from '../components/DeleteSemesterModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import api from '../lib/api.js';

const thumbnails = [
  'linear-gradient(135deg, #1d2a27 0%, #4d685d 55%, #e9785f 55%, #e9785f 100%)',
  'linear-gradient(135deg, #253f3a 0%, #7b9a86 65%, #d9e3d1 65%)',
  'linear-gradient(135deg, #18211f 0%, #35433d 62%, #d6a65d 62%)'
];

function toDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toVideoCard(video, index, t) {
  const stageSummary = {
    UPLOADED: t('pending'),
    VALIDATING: 'ffprobe…',
    SEGMENTING: `${t('processing')} · ${video.progress || 0}%`,
    ANALYZING: `${t('processing')} · ${video.progress || 0}%`
  };
  const date = video.lectureDate || video.createdAt;
  return {
    ...video,
    title: video.filename.replace(/\.mp4$/i, ''),
    date,
    dateKey: toDateKey(date),
    summary: video.status === 'FAILED' ? (video.error || t('failed')) : (video.summary || stageSummary[video.stage] || ''),
    thumbnail: thumbnails[index % thumbnails.length]
  };
}

function formatDate(value, language) {
  return new Intl.DateTimeFormat(language === 'vi' ? 'vi-VN' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function formatDuration(seconds) {
  return seconds ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : 'Preparing';
}

function VideoCard({ video, language, t, onDelete, onRetry, isDeleting, isRetrying }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const statusLabels = { COMPLETED: t('completed'), PROCESSING: t('processing'), PENDING: t('pending'), FAILED: t('failed') };
  const isCompleted = video.status === 'COMPLETED';
  const isFailed = video.status === 'FAILED';

  const topContent = (
    <>
      <div className="observation-thumbnail" style={{ background: video.thumbnail }}>
        <span className="thumbnail-kicker"><Film size={13} /> {t('observation')}</span>
        <span className={`status-pill status-${video.status.toLowerCase()}`}><span /> {statusLabels[video.status]}</span>
        {isCompleted && <span className="thumbnail-play"><ArrowUpRight size={19} /></span>}
      </div>
      <div className="observation-card-main">
        <div className="observation-card-meta">
          <span className="observation-card-date"><Calendar size={12} /> {formatDate(video.date, language)}</span>
          <span>{formatDuration(video.duration)}</span>
        </div>
        <h3>{video.title}</h3>
        <p>{video.summary}</p>
      </div>
    </>
  );

  return (
    <article className={`observation-card${isCompleted ? ' is-clickable' : ''}${isFailed ? ' is-failed' : ''}`}>
      {isCompleted ? (
        <Link to={`/observation/${video.id}`} className="observation-card-link">
          {topContent}
        </Link>
      ) : (
        topContent
      )}
      <div className="observation-card-footer">
        {isCompleted ? (
          <Link to={`/observation/${video.id}`} className="card-open">
            {t('openAnalysis')} <ArrowUpRight size={14} />
          </Link>
        ) : (
          <span className={`card-status-label status-text-${video.status.toLowerCase()}`}>{statusLabels[video.status]}</span>
        )}
        <div className="observation-card-actions">
          {isFailed && !confirmingDelete && (
            <button
              type="button"
              className="obs-action-btn retry"
              onClick={() => onRetry(video)}
              disabled={isRetrying || isDeleting}
              title={t('retryProcessing')}
              aria-label={t('retryProcessing')}
            >
              {isRetrying ? <LoaderCircle size={13} className="spin" /> : <RotateCcw size={13} />}
              <span>{t('retryProcessing')}</span>
            </button>
          )}
          {confirmingDelete ? (
            <div className="obs-delete-confirm">
              <button
                type="button"
                className="obs-action-btn delete is-confirm"
                onClick={() => onDelete(video)}
                disabled={isDeleting}
              >
                {isDeleting ? <LoaderCircle size={13} className="spin" /> : <Trash2 size={13} />}
                <span>{t('confirmDeleteObservation')}</span>
              </button>
              <button
                type="button"
                className="obs-action-btn cancel"
                onClick={() => setConfirmingDelete(false)}
                disabled={isDeleting}
                aria-label={t('cancelEdit')}
                title={t('cancelEdit')}
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="obs-action-btn delete"
              onClick={() => setConfirmingDelete(true)}
              disabled={isDeleting || isRetrying}
              title={t('deleteObservation')}
              aria-label={t('deleteObservation')}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { language, t } = usePreferences();
  const [classes, setClasses] = useState([]);
  const [activeClassId, setActiveClassId] = useState('');
  const [loading, setLoading] = useState(true);
  const [classSearch, setClassSearch] = useState('');
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

    let list = selectedSemester ? classes.filter((item) => item.semester === selectedSemester) : classes;
    if (classSearch.trim()) {
      const q = classSearch.trim().toLowerCase();
      list = list.filter((item) =>
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.classCode && item.classCode.toLowerCase().includes(q)) ||
        (item.code && item.code.toLowerCase().includes(q)) ||
        (item.subject && item.subject.toLowerCase().includes(q))
      );
    }
    return list;
  }, [classes, selectedSemester, classSearch]);

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
  const activeClassKey = activeClass?.id || '';
  const [videos, setVideos] = useState([]);
  const [videoReloadTick, setVideoReloadTick] = useState(0);
  const [observationSearch, setObservationSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deletingVideoId, setDeletingVideoId] = useState('');
  const [retryingVideoId, setRetryingVideoId] = useState('');
  const [videoActionError, setVideoActionError] = useState('');

  useEffect(() => {
    setObservationSearch('');
    setDateFilter('');
    setStatusFilter('');
    setVideoActionError('');
  }, [activeClassKey]);

  useEffect(() => {
    if (!activeClassKey) {
      setVideos([]);
      return undefined;
    }
    let active = true;
    let timer;
    const load = () => {
      api(`/api/classes/${activeClassKey}/videos`)
        .then((data) => {
          if (!active) return;
          const list = Array.isArray(data.videos) ? data.videos : [];
          setVideos(list.map((video, index) => toVideoCard(video, index, t)));
          // Keep refreshing while something is still being processed
          if (list.some((video) => video.status === 'PROCESSING' || video.status === 'PENDING')) timer = setTimeout(load, 5000);
        })
        .catch(() => { if (active) setVideos([]); });
    };
    load();
    return () => { active = false; clearTimeout(timer); };
  }, [activeClassKey, language, videoReloadTick]); // t() is recreated every render; language covers label changes

  const filteredVideos = useMemo(() => {
    const q = observationSearch.trim().toLowerCase();
    return videos.filter((video) => {
      if (dateFilter && video.dateKey !== dateFilter) return false;
      if (statusFilter && video.status !== statusFilter) return false;
      if (q) {
        const hay = `${video.title} ${video.summary} ${formatDate(video.date, language)} ${video.dateKey}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [videos, observationSearch, dateFilter, statusFilter, language]);

  const hasObservationFilters = Boolean(observationSearch.trim() || dateFilter || statusFilter);

  const handleDeleteVideo = async (video) => {
    setDeletingVideoId(video.id);
    setVideoActionError('');
    try {
      await api(`/api/videos/${video.id}`, { method: 'DELETE' });
      setVideos((prev) => prev.filter((item) => item.id !== video.id));
    } catch (error) {
      setVideoActionError(error.message || 'Failed to delete observation.');
    } finally {
      setDeletingVideoId('');
    }
  };

  const handleRetryVideo = async (video) => {
    setRetryingVideoId(video.id);
    setVideoActionError('');
    try {
      await api(`/api/videos/${video.id}/reprocess`, { method: 'POST' });
      setVideoReloadTick((tick) => tick + 1);
    } catch (error) {
      setVideoActionError(error.message || 'Failed to retry processing.');
    } finally {
      setRetryingVideoId('');
    }
  };

  const firstName = user?.name?.split(' ')[0] || '';

  return (
    <Layout>
      <div className="page-wrap observation-dashboard">
        <header className="workspace-header">
          <div>
            <p className="eyebrow"><span className="eyebrow-pulse" /> {t('classroomStudio')}</p>
            <h1>{t('goodMorning')} {firstName}.</h1>
            <p className="page-subtitle">{t('dashboardSubtitle')}</p>
          </div>
          {activeClass && (
            <Link
              to={`/upload?classId=${activeClass.id}`}
              state={{ classId: activeClass.id, classItem: activeClass }}
              className="primary-button"
            >
              <UploadCloud size={16} /> {t('newObservation')}
            </Link>
          )}
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
            <div className="class-search-box">
              <Search size={14} className="class-search-icon" aria-hidden="true" />
              <input
                type="text"
                className="class-search-input"
                placeholder={t('searchClasses')}
                value={classSearch}
                onChange={(event) => setClassSearch(event.target.value)}
                aria-label={t('searchClasses')}
              />
              {classSearch && (
                <button
                  type="button"
                  className="class-search-clear"
                  onClick={() => setClassSearch('')}
                  title={t('clearSearch')}
                  aria-label={t('clearSearch')}
                >
                  <X size={13} />
                </button>
              )}
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
                  {classSearch.trim() ? t('noMatchingClasses') : (classes.length ? t('noClassesInSemester') : t('noClassesFound'))}
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
                  {videos.length > 0 && (
                    <span className="video-count">
                      {hasObservationFilters
                        ? `${filteredVideos.length} / ${videos.length} ${videos.length === 1 ? t('video') : t('videos')}`
                        : `${videos.length} ${videos.length === 1 ? t('video') : t('videos')}`}
                    </span>
                  )}
                </div>
                {videos.length > 0 && (
                  <div className="observation-filter-bar">
                    <label className="search-field observation-search-field">
                      <Search size={14} aria-hidden="true" />
                      <span className="sr-only">{t('searchObservations')}</span>
                      <input
                        type="text"
                        value={observationSearch}
                        onChange={(event) => setObservationSearch(event.target.value)}
                        placeholder={t('searchObservations')}
                      />
                      {observationSearch && (
                        <button
                          type="button"
                          className="filter-clear-icon"
                          onClick={() => setObservationSearch('')}
                          aria-label={t('clearSearch')}
                          title={t('clearSearch')}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </label>
                    <label className="observation-date-filter" title={t('filterByDate')}>
                      <Calendar size={14} aria-hidden="true" />
                      <span className="sr-only">{t('filterByDate')}</span>
                      <input
                        type="date"
                        value={dateFilter}
                        onChange={(event) => setDateFilter(event.target.value)}
                        aria-label={t('filterByDate')}
                      />
                      {dateFilter && (
                        <button
                          type="button"
                          className="filter-clear-icon"
                          onClick={() => setDateFilter('')}
                          aria-label={t('clearFilters')}
                          title={t('clearFilters')}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </label>
                    <select
                      className="observation-status-filter"
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value)}
                      aria-label={t('allStatuses')}
                    >
                      <option value="">{t('allStatuses')}</option>
                      <option value="COMPLETED">{t('completed')}</option>
                      <option value="PROCESSING">{t('processing')}</option>
                      <option value="FAILED">{t('failed')}</option>
                    </select>
                  </div>
                )}
                {videoActionError && <div className="form-alert" style={{ marginBottom: 16 }}>{videoActionError}</div>}
                {filteredVideos.length ? (
                  <div className="observation-grid">
                    {filteredVideos.map((video) => (
                      <VideoCard
                        key={video.id}
                        video={video}
                        language={language}
                        t={t}
                        onDelete={handleDeleteVideo}
                        onRetry={handleRetryVideo}
                        isDeleting={deletingVideoId === video.id}
                        isRetrying={retryingVideoId === video.id}
                      />
                    ))}
                  </div>
                ) : videos.length ? (
                  <div className="empty-state">
                    <Film size={23} />
                    <h3>{t('noMatchingObservations')}</h3>
                    <p>{t('tryAnotherSearch')}</p>
                    <button
                      type="button"
                      className="outline-button"
                      style={{ marginTop: '16px', minHeight: '36px', height: '36px', padding: '0 15px', fontSize: '0.74rem' }}
                      onClick={() => {
                        setObservationSearch('');
                        setDateFilter('');
                        setStatusFilter('');
                      }}
                    >
                      {t('clearFilters')}
                    </button>
                  </div>
                ) : (
                  <div className="empty-state">
                    <Film size={23} />
                    <h3>{t('noObservationsYet') || t('noMatchingObservations')}</h3>
                    <p>{t('uploadRecordingPrompt') || t('tryAnotherSearch')}</p>
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
                <h3>{classSearch.trim() ? t('noMatchingClasses') : t('noClassesFound')}</h3>
                <p>{classSearch.trim() ? t('tryAnotherClassSearch') : t('classesAppear')}</p>
                {classSearch.trim() ? (
                  <button
                    type="button"
                    className="outline-button"
                    style={{ marginTop: '16px', minHeight: '36px', height: '36px', padding: '0 15px', fontSize: '0.74rem' }}
                    onClick={() => setClassSearch('')}
                  >
                    {t('clearSearch')}
                  </button>
                ) : (
                  <Link
                    to="/classes"
                    className="primary-button"
                    style={{ marginTop: '16px', minHeight: '36px', height: '36px', padding: '0 15px', fontSize: '0.74rem' }}
                  >
                    <Plus size={15} /> {t('addClass')}
                  </Link>
                )}
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
