import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileVideo, LoaderCircle, UploadCloud, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import { createUploadedObservation, mockClasses } from '../lib/mockObservations.js';

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPage() {
  const { t } = usePreferences();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const [file, setFile] = useState(null);
  const [classId, setClassId] = useState(mockClasses[0].id);
  const [stage, setStage] = useState('select');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => () => clearInterval(timerRef.current), []);

  const selectFile = (candidate) => {
    setError('');
    if (!candidate) return;
    const isMp4 = candidate.type === 'video/mp4' || candidate.name.toLowerCase().endsWith('.mp4');
    if (!isMp4) return setError(t('chooseMp4'));
    if (candidate.size > MAX_FILE_SIZE) return setError(t('uploadLimit'));
    setFile(candidate);
    setStage('select');
  };

  const startUpload = () => {
    if (!file) return setError(t('selectVideo'));
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
    if (stage !== 'processing' || !file) return undefined;
    const timeout = setTimeout(() => {
      const observation = createUploadedObservation(file, classId);
      navigate(`/observation/${observation.id}`, { state: { observation } });
    }, 1100);
    return () => clearTimeout(timeout);
  }, [stage, file, classId, navigate]);

  const stageLabels = { select: '01', uploading: '02', processing: '03' };
  const stageTitles = { select: t('chooseRecording'), uploading: t('uploadingVideo'), processing: t('preparingAnalysis') };

  return <Layout>
    <div className="page-wrap upload-page">
      <Link to="/dashboard" className="back-link upload-back"><ArrowLeft size={15} /> {t('backToWorkspace')}</Link>
      <div className="upload-heading">
        <div><p className="eyebrow">{t('newObservation')}</p><h1>{t('bringClassroomIntoFocus')}</h1><p className="page-subtitle">{t('uploadIntro')}</p></div>
        <div className="upload-orbit"><UploadCloud size={30} /></div>
      </div>
      <section className="upload-panel">
        <div className="upload-panel-heading"><div><p className="eyebrow">{t('step')} {stageLabels[stage]}</p><h2>{stageTitles[stage]}</h2></div><span className="upload-format">{t('mp4Limit')}</span></div>
        {stage === 'select' && <>
          <button className="drop-zone" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files?.[0]); }}><span className="drop-zone-icon"><UploadCloud size={23} /></span><strong>{t('dropVideo')}</strong><span>{t('browseComputer')}</span><small>{t('mp4Best')}</small></button>
          <input ref={inputRef} className="sr-only" type="file" accept="video/mp4,.mp4" onChange={(event) => selectFile(event.target.files?.[0])} />
          {file && <div className="selected-file"><span className="file-icon"><FileVideo size={17} /></span><span><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span><button onClick={() => setFile(null)} aria-label={t('removeSelectedFile')}><X size={16} /></button></div>}
          <div className="upload-options"><label className="field-label" htmlFor="upload-class">{t('assignClass')}</label><select id="upload-class" className="input" value={classId} onChange={(event) => setClassId(event.target.value)}>{mockClasses.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.gradeLevel}</option>)}</select></div>
          {error && <p className="form-alert">{error}</p>}
          <button className="primary-button upload-action" onClick={startUpload}><UploadCloud size={17} /> {t('startUpload')}</button>
        </>}
        {stage === 'uploading' && <div className="upload-progress-view"><div className="progress-file"><span className="file-icon"><FileVideo size={18} /></span><span><strong>{file.name}</strong><small>{formatBytes(file.size)} · {t('secureLocalTransfer')}</small></span></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="progress-label"><span>{t('uploading')}</span><strong>{progress}%</strong></div></div>}
        {stage === 'processing' && <div className="processing-view"><div className="processing-icon"><LoaderCircle size={28} className="spin" /></div><h3>{t('readingLesson')}</h3><p>{t('preparingTimeline')}</p><div className="processing-steps"><span className="done"><CheckCircle2 size={15} /> {t('fileReceived')}</span><span><LoaderCircle size={15} className="spin" /> {t('preparingAnalysisStep')}</span></div></div>}
      </section>
      <p className="upload-footnote">{t('localDemo')}</p>
    </div>
  </Layout>;
}
