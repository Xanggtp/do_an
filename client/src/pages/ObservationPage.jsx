import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, AudioLines, BarChart3, ChevronRight, CircleAlert, Clock3, FileText, Layers, LineChart as LineChartIcon, LoaderCircle, Pause, Play, Presentation, RotateCcw, Volume2 } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Layout } from '../components/Layout.jsx';
import api from '../lib/api.js';
import { getVideo, mockAnalytics, mockFeedback } from '../lib/mockObservations.js';

const objectIdPattern = /^[0-9a-f]{24}$/i;
const emptyAnalytics = { bloomsDistribution: {}, copusTimeline: [] };

/** Loads a real observation from the API; ids that are not ObjectIds fall back to the demo data. */
function useObservation(videoId, materials) {
  const isDemo = !objectIdPattern.test(videoId || '');
  const [state, setState] = useState({ loading: !isDemo, data: null, pending: null, error: '' });

  useEffect(() => {
    if (isDemo) return undefined;
    let active = true;
    let timer;
    const load = () => {
      api(`/api/videos/${videoId}/observation`)
        .then((data) => {
          if (!active) return;
          if (!data.video) {
            // 202: still processing
            setState({ loading: false, data: null, pending: data, error: '' });
            timer = setTimeout(load, 3000);
          } else {
            setState({ loading: false, data, pending: null, error: '' });
          }
        })
        .catch((error) => {
          if (!active) return;
          const message = error.status === 422 ? (error.data?.error || 'Processing failed.') : error.message;
          setState({ loading: false, data: null, pending: null, error: message });
        });
    };
    load();
    return () => { active = false; clearTimeout(timer); };
  }, [videoId, isDemo]);

  if (isDemo) {
    return { loading: false, video: getVideo(videoId), feedback: mockFeedback, analytics: mockAnalytics, segments: [] };
  }
  if (!state.data) return { ...state, video: null, feedback: [], analytics: emptyAnalytics, segments: [] };

  const { video, feedback, analytics, segments } = state.data;
  return {
    loading: false,
    video: {
      id: video.id,
      title: video.filename.replace(/\.mp4$/i, ''),
      date: video.lectureDate || video.createdAt,
      duration: video.duration,
      source: `/api/videos/${video.id}/media`,
      className: video.class?.name,
      subject: video.class?.subject,
      materials
    },
    feedback: feedback || [],
    analytics: analytics || emptyAnalytics,
    segments: segments || []
  };
}

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function NoteCard({ note, active, onSelect, noteRef }) {
  const isStrength = note.category === 'STRENGTH';
  return (
    <button
      ref={noteRef}
      className={`feedback-note ${active ? 'is-active' : ''} ${isStrength ? 'note-strength' : 'note-growth'}`}
      onClick={() => onSelect(note.timestamp)}
    >
      <div className="feedback-note-top">
        <span className="feedback-category"><span /> {isStrength ? 'Strength' : 'Opportunity for growth'}</span>
        <span className="feedback-time"><Clock3 size={13} /> {formatTime(note.timestamp)}</span>
      </div>
      <div className="feedback-note-heading">
        <h3>{note.title}</h3>
        <ChevronRight size={16} />
      </div>
      <p>{note.description}</p>
      <div className="feedback-note-tags">
        {[note.rubricDimension, note.bloom, note.copus].filter(Boolean).map((tag) => <span key={tag}>{tag}</span>)}
      </div>
    </button>
  );
}

function VideoPlayer({ video, feedback, currentTime, duration, isPlaying, onToggle, onSeek, onTimeUpdate, onLoadedMetadata }) {
  const videoRef = useRef(null);
  const timelineDuration = duration || video.duration || 1;
  const progress = Math.min(100, (currentTime / timelineDuration) * 100);

  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.play().catch(() => {});
    else videoRef.current.pause();
  }, [isPlaying]);

  useEffect(() => {
    if (!videoRef.current || !Number.isFinite(currentTime)) return;
    if (Math.abs(videoRef.current.currentTime - currentTime) > 0.75) videoRef.current.currentTime = currentTime;
  }, [currentTime]);

  const seekFromPointer = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    onSeek(((event.clientX - bounds.left) / bounds.width) * timelineDuration);
  };

  return (
    <div className="player-shell">
      <div className="player-frame">
        <video
          ref={videoRef}
          src={video.source}
          onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => onLoadedMetadata(event.currentTarget.duration)}
          onEnded={() => onToggle(false)}
          preload="metadata"
        />
        <div className="player-overlay">
          <span className="player-live-label">Observation recording</span>
          <span className="player-frame-duration">{formatTime(currentTime)} / {formatTime(timelineDuration)}</span>
        </div>
        <button
          className="player-center-control"
          onClick={() => onToggle(!isPlaying)}
          aria-label={isPlaying ? 'Pause video' : 'Play video'}
        >
          {isPlaying ? <Pause size={24} /> : <Play size={24} fill="currentColor" />}
        </button>
      </div>
      <div className="player-controls">
        <button className="player-control-button" onClick={() => onToggle(!isPlaying)} aria-label={isPlaying ? 'Pause video' : 'Play video'}>
          {isPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}
        </button>
        <button className="player-control-button" onClick={() => onSeek(0)} aria-label="Restart video">
          <RotateCcw size={15} />
        </button>
        <div className="timeline-wrap">
          <div className="timeline" onClick={seekFromPointer} role="slider" aria-label="Video timeline" aria-valuemin="0" aria-valuemax={timelineDuration} aria-valuenow={currentTime} tabIndex="0">
            <span className="timeline-progress" style={{ width: `${progress}%` }} />
            {feedback.map((note) => (
              <button
                key={note.id}
                className={`timeline-marker ${note.category === 'STRENGTH' ? 'marker-strength' : 'marker-growth'}`}
                style={{ left: `${(note.timestamp / timelineDuration) * 100}%` }}
                onClick={(event) => { event.stopPropagation(); onSeek(note.timestamp); }}
                aria-label={`Jump to feedback at ${formatTime(note.timestamp)}`}
              />
            ))}
          </div>
        </div>
        <Volume2 size={16} className="player-volume" />
      </div>
    </div>
  );
}

export function ObservationPage() {
  const { videoId } = useParams();
  const location = useLocation();
  const observation = useObservation(videoId, location.state?.materials);
  const { video, feedback, analytics, segments } = observation;
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTime, setSelectedTime] = useState(null);
  const noteRefs = useRef({});
  const activeNote = useMemo(() => [...feedback].reverse().find((note) => currentTime >= note.timestamp && currentTime < note.timestamp + 18), [currentTime, feedback]);

  useEffect(() => {
    if (video?.duration) setDuration(video.duration);
  }, [video?.duration]);

  useEffect(() => {
    if (activeNote) noteRefs.current[activeNote.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeNote]);

  if (!video) {
    const pending = observation.pending;
    return (
      <Layout>
        <div className="page-wrap observation-page">
          <Link to="/dashboard" className="back-link observation-back">
            <ArrowLeft size={15} /> Back to workspace
          </Link>
          <section className="observation-status-card">
            {observation.error ? <CircleAlert size={22} /> : <LoaderCircle size={22} className="spin" />}
            <div>
              <h2>{observation.error ? 'Observation unavailable' : observation.loading ? 'Loading observation…' : 'Analysis in progress'}</h2>
              <p>
                {observation.error
                  ? observation.error
                  : pending
                  ? `Stage: ${pending.stage || pending.status} · ${pending.progress ?? 0}%. This page refreshes automatically.`
                  : ''}
              </p>
              {pending && (
                <div className="progress-track"><span style={{ width: `${pending.progress ?? 0}%` }} /></div>
              )}
            </div>
          </section>
        </div>
      </Layout>
    );
  }

  const seek = (timestamp) => { setCurrentTime(timestamp); setSelectedTime(timestamp); };
  const selectNote = (timestamp) => seek(timestamp);
  const bloomData = Object.entries(analytics.bloomsDistribution || {}).map(([level, count]) => ({ level, count }));
  const bloomTotal = bloomData.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
  const copusData = (analytics.copusTimeline || []).map((event) => ({ ...event, minute: Math.round(event.timestamp / 60 * 10) / 10 }));
  const strengths = feedback.filter((note) => note.category === 'STRENGTH');
  const growth = feedback.filter((note) => note.category !== 'STRENGTH');

  const hasMaterials = video.materials && (video.materials.slides || video.materials.lessonPlan || video.materials.audio);

  return (
    <Layout>
      <div className="page-wrap observation-page">
        <Link to="/dashboard" className="back-link observation-back">
          <ArrowLeft size={15} /> Back to workspace
        </Link>
        <header className="observation-header">
          <div>
            <p className="eyebrow"><span className="eyebrow-pulse" /> Completed observation</p>
            <h1>{video.title}</h1>
            <div className="observation-submeta">
              {video.className && <span><strong>{video.className}</strong>{video.subject ? ` · ${video.subject}` : ''}</span>}
              {video.className && <span>·</span>}
              <span>{formatDate(video.date)}</span>
              <span>·</span>
              <span>{formatTime(duration)} lesson</span>
              <span className="analysis-ready"><span /> Analysis ready</span>
            </div>
            {hasMaterials && (
              <div className="observation-materials-bar">
                <span className="materials-label">Attached materials:</span>
                {video.materials.slides && <span className="material-badge"><Presentation size={13} /> {video.materials.slides.name}</span>}
                {video.materials.lessonPlan && <span className="material-badge"><FileText size={13} /> {video.materials.lessonPlan.name}</span>}
                {video.materials.audio && <span className="material-badge"><AudioLines size={13} /> {video.materials.audio.name}</span>}
              </div>
            )}
          </div>
          <button className="outline-button" onClick={() => window.print()}>
            <BarChart3 size={16} /> Export view
          </button>
        </header>
        <div className="analysis-layout">
          <main className="analysis-main">
            <VideoPlayer
              video={video}
              feedback={feedback}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              onToggle={setIsPlaying}
              onSeek={seek}
              onTimeUpdate={setCurrentTime}
              onLoadedMetadata={setDuration}
            />
            <div className="player-key">
              <span><i className="key-dot key-strength" /> Strength</span>
              <span><i className="key-dot key-growth" /> Opportunity for growth</span>
              <span className="key-copy">Select a marker to jump to a moment</span>
            </div>
            <section className="charts-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Pattern scan</p>
                  <h2>What happened in the lesson</h2>
                </div>
                <span className="chart-period">AI-coded moments</span>
              </div>
              <div className="chart-grid">
                <article className="chart-card">
                  <div className="chart-card-heading">
                    <div>
                      <span className="chart-icon"><BarChart3 size={16} /></span>
                      <h3>Bloom's taxonomy</h3>
                    </div>
                    <span>{bloomTotal} prompts</span>
                  </div>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={bloomData} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="#e2e4da" />
                        <XAxis dataKey="level" tick={{ fontSize: 10, fill: '#87928c' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#87928c' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip cursor={{ fill: '#f0f1e9' }} contentStyle={{ border: '1px solid #dce0d7', borderRadius: 4, fontSize: 12 }} />
                        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                          {bloomData.map((entry, index) => <Cell key={entry.level} fill={index > 3 ? '#e9785f' : '#7b9a86'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </article>
                <article className="chart-card">
                  <div className="chart-card-heading">
                    <div>
                      <span className="chart-icon"><LineChartIcon size={16} /></span>
                      <h3>COPUS activity</h3>
                    </div>
                    <span>by lesson minute</span>
                  </div>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={copusData} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="#e2e4da" />
                        <XAxis dataKey="minute" unit="m" tick={{ fontSize: 10, fill: '#87928c' }} axisLine={false} tickLine={false} />
                        <YAxis dataKey="code" type="category" width={45} tick={{ fontSize: 10, fill: '#87928c' }} axisLine={false} tickLine={false} />
                        <Tooltip labelFormatter={(value) => `${value} min`} formatter={(value, name, item) => [item.payload.label, 'Activity']} contentStyle={{ border: '1px solid #dce0d7', borderRadius: 4, fontSize: 12 }} />
                        <Line type="stepAfter" dataKey="code" stroke="#e9785f" strokeWidth={2.5} dot={{ r: 4, fill: '#e9785f', stroke: '#fbfaf6', strokeWidth: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              </div>
            </section>
            {segments.length > 0 && (
              <section className="charts-section">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Segment reviews</p>
                    <h2>Lesson, two minutes at a time</h2>
                  </div>
                  <span className="chart-period">{segments.length} segments</span>
                </div>
                <div className="segment-review-list">
                  {segments.map((segment) => (
                    <button key={segment.index} className="segment-review-item" onClick={() => seek(segment.startSec)}>
                      <span className="segment-review-time"><Layers size={13} /> {formatTime(segment.startSec)} – {formatTime(segment.endSec)}</span>
                      <strong>{segment.review?.content_review?.main_topic || `Segment ${segment.index}`}</strong>
                      <p>{segment.review?.content_review?.summary || ''}</p>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </main>
          <aside className="feedback-panel">
            <div className="feedback-panel-header">
              <div>
                <p className="eyebrow">Synchronized feed</p>
                <h2>Coach's notes</h2>
              </div>
              <span>{feedback.length} notes</span>
            </div>
            <div className="feedback-scroll">
              <div className="feedback-group">
                <div className="feedback-group-label">
                  <span className="group-rule strength-rule" />
                  <span>Strengths</span>
                  <strong>{strengths.length}</strong>
                </div>
                {strengths.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    active={activeNote?.id === note.id || selectedTime === note.timestamp}
                    onSelect={selectNote}
                    noteRef={(element) => { noteRefs.current[note.id] = element; }}
                  />
                ))}
              </div>
              <div className="feedback-group">
                <div className="feedback-group-label">
                  <span className="group-rule growth-rule" />
                  <span>Opportunities for growth</span>
                  <strong>{growth.length}</strong>
                </div>
                {growth.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    active={activeNote?.id === note.id || selectedTime === note.timestamp}
                    onSelect={selectNote}
                    noteRef={(element) => { noteRefs.current[note.id] = element; }}
                  />
                ))}
              </div>
            </div>
            <div className="feedback-panel-footer">
              <CircleAlert size={15} />
              <span>AI notes are a starting point for your reflection, not a final evaluation.</span>
            </div>
          </aside>
        </div>
      </div>
    </Layout>
  );
}
