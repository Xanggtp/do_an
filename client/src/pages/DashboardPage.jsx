import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check, ChevronRight, Clock3, Film, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
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
  const [classes, setClasses] = useState(mockClasses);
  const [activeClassId, setActiveClassId] = useState(mockClasses[0].id);
  const [query, setQuery] = useState('');
  const [semesters, setSemesters] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
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
        if (Array.isArray(data.classes) && data.classes.length) {
          const accents = ['sage', 'coral', 'ochre'];
          const userClasses = data.classes.map((cls, idx) => ({
            ...cls,
            accent: accents[idx % accents.length]
          }));
          setClasses(userClasses);
          setActiveClassId((prev) => (userClasses.some((c) => c.id === prev) ? prev : userClasses[0].id));
        }
      })
      .catch(() => {});
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
    if (list.size === 0) {
      return ['2026.1', '2026.2'];
    }
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
          <Link className="primary-button" to="/upload"><Plus size={17} /> Upload observation</Link>
        </header>
        <div className="workspace-layout">
          <aside className="class-rail">
            <div className="class-rail-heading">
              <div>
                <p className="eyebrow">{t('yourClasses')}{selectedSemester ? ` · ${selectedSemester}` : ''}</p>
                <strong>{filteredClasses.length} {t('activeClasses')}</strong>
              </div>
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
                    {semesterOptions.map((sem) => (
                      <button
                        key={sem}
                        type="button"
                        role="option"
                        aria-selected={selectedSemester === sem}
                        className={`semester-menu-item${selectedSemester === sem ? ' is-selected' : ''}`}
                        onClick={() => handleSelectSemester(sem)}
                      >
                        <span>{sem}</span>
                        {selectedSemester === sem && <Check size={14} />}
                      </button>
                    ))}
                  </div>
                )}
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
                  {t('noClassesInSemester')}
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
                    <h2>{activeClass.name}</h2>
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
                  </div>
                )}
                <Link to="/upload" className="dashboard-upload-link">
                  <span className="upload-link-icon"><Plus size={17} /></span>
                  <span><strong>Add another observation</strong><small>Upload an MP4 for {activeClass.name}</small></span>
                  <ChevronRight size={17} />
                </Link>
              </>
            ) : (
              <div className="empty-state">
                <Film size={23} />
                <h3>{t('noClassesFound')}</h3>
                <p>{t('classesAppear')}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}
