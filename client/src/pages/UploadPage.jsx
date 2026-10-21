import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, AudioLines, CheckCircle2, FileText, FileVideo, LoaderCircle, Presentation, UploadCloud, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import api from '../lib/api.js';
import { createUploadedObservation, mockClasses } from '../lib/mockObservations.js';

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPage() {
  const { t } = usePreferences();
  const navigate = useNavigate();
  const inputRefs = useRef({});
  const timerRef = useRef(null);
  const [files, setFiles] = useState({});
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [stage, setStage] = useState('select');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => () => clearInterval(timerRef.current), []);

  useEffect(() => {
    let active = true;
    api('/api/classes')
      .then((data) => {
        if (!active) return;
        const list = Array.isArray(data.classes) && data.classes.length ? data.classes : mockClasses;
        setClasses(list);
        if (list.length) setSelectedClassId(list[0].id);
      })
      .catch(() => {
        if (!active) return;
        setClasses(mockClasses);
        if (mockClasses.length) setSelectedClassId(mockClasses[0].id);
      })
      .finally(() => {
        if (active) setLoadingClasses(false);
      });
    return () => { active = false; };
  }, []);

  const uploadTypes = [
    { id: 'video', title: t('videoFiles'), dropLabel: t('dropVideo'), formats: t('videoFormats'), accept: 'video/mp4,.mp4', icon: FileVideo },
    { id: 'slides', title: t('slidesFiles'), dropLabel: t('dropSlides'), formats: t('slidesFormats'), accept: '.ppt,.pptx,.pdf', icon: Presentation },
    { id: 'lessonPlan', title: t('lessonPlanFiles'), dropLabel: t('dropLessonPlan'), formats: t('lessonPlanFormats'), accept: '.doc,.docx,.pdf,.txt', icon: FileText },
    { id: 'audio', title: t('audioFiles'), dropLabel: t('dropAudio'), formats: t('audioFormats'), accept: 'audio/mpeg,audio/wav,audio/mp4,.mp3,.wav,.m4a', icon: AudioLines }
  ];

  const selectFile = (type, candidate) => {
    setError('');
    if (!candidate) return;
    const extension = candidate.name.toLowerCase().split('.').pop();
    const allowedExtensions = {
      video: ['mp4'],
      slides: ['ppt', 'pptx', 'pdf'],
      lessonPlan: ['doc', 'docx', 'pdf', 'txt'],
      audio: ['mp3', 'wav', 'm4a']
    };
    if (!allowedExtensions[type].includes(extension)) return setError(t('invalidFileType'));
    if (candidate.size > MAX_FILE_SIZE) return setError(t('uploadLimit'));
    setFiles((current) => ({ ...current, [type]: candidate }));
    setStage('select');
  };

  const startUpload = () => {
    if (!files.video) return setError(t('selectVideo'));
    if (!selectedClassId && classes.length) return setError(t('selectClass'));
    setStage('uploading');
    setProgress(7);
    timerRef.current = setInterval(() => setProgress((value) => {
      if (value >= 92) {
        clearInterval(timerRef.current);
        setStage('processing');
        return 92;
      }
      return value + 9;
    }), 180);
  };

  useEffect(() => {
    if (stage !== 'processing' || !files.video) return undefined;
    const timeout = setTimeout(() => {
      const selectedClass = classes.find((item) => item.id === selectedClassId);
      const observation = createUploadedObservation(files.video, selectedClassId, {
        slides: files.slides,
        lessonPlan: files.lessonPlan,
        audio: files.audio,
        className: selectedClass?.name || 'Observation',
        classCode: selectedClass?.classCode || '',
        subject: selectedClass?.subject || '',
        semester: selectedClass?.semester || ''
      });
      navigate(`/observation/${observation.id}`, { state: { observation } });
    }, 1100);
    return () => clearTimeout(timeout);
  }, [stage, files.video, selectedClassId, classes, navigate]);

  const stageLabels = { select: '01', uploading: '02', processing: '03' };
  const stageTitles = { select: t('chooseRecording'), uploading: t('uploadingVideo'), processing: t('preparingAnalysis') };

  return <Layout>
    <div className="page-wrap upload-page">
      <Link to="/dashboard" className="back-link upload-back"><ArrowLeft size={15} /> {t('backToWorkspace')}</Link>
      <div className="upload-heading">
        <div>
          <p className="eyebrow">{t('newObservation')}</p>
          <h1>{t('bringClassroomIntoFocus')}</h1>
          <p className="page-subtitle">{t('uploadIntro')}</p>
        </div>
        <div className="upload-orbit"><UploadCloud size={30} /></div>
      </div>
      <section className="upload-panel">
        <div className="upload-panel-heading">
          <div>
            <p className="eyebrow">{t('step')} {stageLabels[stage]}</p>
            <h2>{stageTitles[stage]}</h2>
          </div>
          <span className="upload-format">{t('supportedMaterials')}</span>
        </div>
        {stage === 'select' && <>
          <div className="upload-blocks">
            {uploadTypes.map(({ id, title, dropLabel, formats, accept, icon: Icon }) => {
              const file = files[id];
              return <section className="upload-block" key={id}>
                <div className="upload-block-heading"><div><h3>{title}</h3><p>{formats}</p></div><Icon size={19} /></div>
                <button className="drop-zone" onClick={() => inputRefs.current[id]?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectFile(id, event.dataTransfer.files?.[0]); }}><span className="drop-zone-icon"><UploadCloud size={21} /></span><strong>{dropLabel}</strong><span>{t('browseComputer')}</span></button>
                <input ref={(element) => { inputRefs.current[id] = element; }} className="sr-only" type="file" accept={accept} onChange={(event) => selectFile(id, event.target.files?.[0])} />
                {file && <div className="selected-file"><span className="file-icon"><Icon size={17} /></span><span><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span><button onClick={() => setFiles((current) => ({ ...current, [id]: null }))} aria-label={t('removeSelectedFile')}><X size={16} /></button></div>}
              </section>;
            })}
          </div>
          <div className="upload-options">
            <div className="upload-class-select-wrap">
              <label className="field-label" htmlFor="upload-class">{t('assignClass')}</label>
              {classes.length ? (
                <select
                  id="upload-class"
                  className="input"
                  value={selectedClassId}
                  onChange={(event) => setSelectedClassId(event.target.value)}
                >
                  {classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} {item.classCode ? `(${item.classCode})` : ''} · {item.subject} {item.semester ? `[${item.semester}]` : ''}
                    </option>
                  ))}
                </select>
              ) : loadingClasses ? (
                <div className="input" style={{ opacity: 0.6 }}>Loading classes...</div>
              ) : (
                <div className="upload-classes-empty">
                  <p>{t('noClassesFound')} <Link to="/classes">{t('manageClasses')}</Link></p>
                </div>
              )}
            </div>
          </div>
          {error && <p className="form-alert">{error}</p>}
          <button className="primary-button upload-action" onClick={startUpload}><UploadCloud size={17} /> {t('startUpload')}</button>
        </>}
        {stage === 'uploading' && <div className="upload-progress-view"><div className="progress-file"><span className="file-icon"><FileVideo size={18} /></span><span><strong>{files.video.name}</strong><small>{formatBytes(files.video.size)} · {t('secureLocalTransfer')}</small></span></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="progress-label"><span>{t('uploading')}</span><strong>{progress}%</strong></div></div>}
        {stage === 'processing' && <div className="processing-view"><div className="processing-icon"><LoaderCircle size={28} className="spin" /></div><h3>{t('readingLesson')}</h3><p>{t('preparingTimeline')}</p><div className="processing-steps"><span className="done"><CheckCircle2 size={15} /> {t('fileReceived')}</span><span><LoaderCircle size={15} className="spin" /> {t('preparingAnalysisStep')}</span></div></div>}
      </section>
      <p className="upload-footnote">{t('localDemo')}</p>
    </div>
  </Layout>;
}
