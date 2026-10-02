import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileVideo, LoaderCircle, UploadCloud, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { createUploadedObservation, mockClasses } from '../lib/mockObservations.js';

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPage() {
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
    if (!isMp4) return setError('Choose an MP4 video file to continue.');
    if (candidate.size > MAX_FILE_SIZE) return setError('This file is larger than the 2 GB upload limit.');
    setFile(candidate);
    setStage('select');
  };

  const startUpload = () => {
    if (!file) return setError('Select a video before starting the upload.');
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

  return <Layout><div className="page-wrap upload-page">
    <Link to="/dashboard" className="back-link upload-back"><ArrowLeft size={15} /> Back to workspace</Link>
    <div className="upload-heading"><div><p className="eyebrow">New observation</p><h1>Bring the classroom<br />into focus.</h1><p className="page-subtitle">Upload a recording and we will prepare a synchronized feedback view for you.</p></div><div className="upload-orbit"><UploadCloud size={30} /></div></div>
    <section className="upload-panel"><div className="upload-panel-heading"><div><p className="eyebrow">Step {stage === 'select' ? '01' : stage === 'uploading' ? '02' : '03'}</p><h2>{stage === 'select' ? 'Choose a recording' : stage === 'uploading' ? 'Uploading your video' : 'Preparing the analysis'}</h2></div><span className="upload-format">MP4 · up to 2 GB</span></div>
      {stage === 'select' && <><button className="drop-zone" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectFile(event.dataTransfer.files?.[0]); }}><span className="drop-zone-icon"><UploadCloud size={23} /></span><strong>Drop your video here</strong><span>or browse from your computer</span><small>MP4 files are best for analysis</small></button><input ref={inputRef} className="sr-only" type="file" accept="video/mp4,.mp4" onChange={(event) => selectFile(event.target.files?.[0])} />{file && <div className="selected-file"><span className="file-icon"><FileVideo size={17} /></span><span><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span><button onClick={() => setFile(null)} aria-label="Remove selected file"><X size={16} /></button></div>}<div className="upload-options"><label className="field-label" htmlFor="upload-class">Assign to class</label><select id="upload-class" className="input" value={classId} onChange={(event) => setClassId(event.target.value)}>{mockClasses.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.gradeLevel}</option>)}</select></div>{error && <p className="form-alert">{error}</p>}<button className="primary-button upload-action" onClick={startUpload}><UploadCloud size={17} /> Start upload</button></>}
      {stage === 'uploading' && <div className="upload-progress-view"><div className="progress-file"><span className="file-icon"><FileVideo size={18} /></span><span><strong>{file.name}</strong><small>{formatBytes(file.size)} · secure local transfer</small></span></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="progress-label"><span>Uploading</span><strong>{progress}%</strong></div></div>}
      {stage === 'processing' && <div className="processing-view"><div className="processing-icon"><LoaderCircle size={28} className="spin" /></div><h3>Reading the shape of the lesson</h3><p>We are preparing the observation timeline and feedback workspace.</p><div className="processing-steps"><span className="done"><CheckCircle2 size={15} /> File received</span><span><LoaderCircle size={15} className="spin" /> Preparing analysis</span></div></div>}
    </section>
    <p className="upload-footnote">Local demo mode keeps this upload in your browser session. Connect the video API to persist recordings for your team.</p>
  </div></Layout>;
}