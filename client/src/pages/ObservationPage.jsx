import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BarChart3, ChevronRight, CircleAlert, Clock3, LineChart as LineChartIcon, Pause, Play, RotateCcw, Volume2 } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Layout } from '../components/Layout.jsx';
import { getVideo, mockAnalytics, mockFeedback } from '../lib/mockObservations.js';

function formatTime(value) {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatDate(value) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }

function NoteCard({ note, active, onSelect, noteRef }) {
  const isStrength = note.category === 'STRENGTH';
  return <button ref={noteRef} className={`feedback-note ${active ? 'is-active' : ''} ${isStrength ? 'note-strength' : 'note-growth'}`} onClick={() => onSelect(note.timestamp)}><div className="feedback-note-top"><span className="feedback-category"><span /> {isStrength ? 'Strength' : 'Opportunity for growth'}</span><span className="feedback-time"><Clock3 size={13} /> {formatTime(note.timestamp)}</span></div><div className="feedback-note-heading"><h3>{note.title}</h3><ChevronRight size={16} /></div><p>{note.description}</p><div className="feedback-note-tags"><span>{note.rubricDimension}</span><span>{note.bloom}</span><span>{note.copus}</span></div></button>;
}

function VideoPlayer({ video, currentTime, duration, isPlaying, onToggle, onSeek, onTimeUpdate, onLoadedMetadata }) {
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

  return <div className="player-shell"><div className="player-frame"><video ref={videoRef} src={video.source} onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)} onLoadedMetadata={(event) => onLoadedMetadata(event.currentTarget.duration)} onEnded={() => onToggle(false)} preload="metadata" /><div className="player-overlay"><span className="player-live-label">Observation recording</span><span className="player-frame-duration">{formatTime(currentTime)} / {formatTime(timelineDuration)}</span></div><button className="player-center-control" onClick={() => onToggle(!isPlaying)} aria-label={isPlaying ? 'Pause video' : 'Play video'}>{isPlaying ? <Pause size={24} /> : <Play size={24} fill="currentColor" />}</button></div><div className="player-controls"><button className="player-control-button" onClick={() => onToggle(!isPlaying)} aria-label={isPlaying ? 'Pause video' : 'Play video'}>{isPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}</button><button className="player-control-button" onClick={() => onSeek(0)} aria-label="Restart video"><RotateCcw size={15} /></button><div className="timeline-wrap"><div className="timeline" onClick={seekFromPointer} role="slider" aria-label="Video timeline" aria-valuemin="0" aria-valuemax={timelineDuration} aria-valuenow={currentTime} tabIndex="0"><span className="timeline-progress" style={{ width: `${progress}%` }} />{mockFeedback.map((note) => <button key={note.id} className={`timeline-marker ${note.category === 'STRENGTH' ? 'marker-strength' : 'marker-growth'}`} style={{ left: `${(note.timestamp / timelineDuration) * 100}%` }} onClick={(event) => { event.stopPropagation(); onSeek(note.timestamp); }} aria-label={`Jump to feedback at ${formatTime(note.timestamp)}`} />)}</div></div><Volume2 size={16} className="player-volume" /></div></div>;
}

export function ObservationPage() {
  const { videoId } = useParams();
  const location = useLocation();
  const seededVideo = getVideo(videoId);
  const video = location.state?.observation || seededVideo;
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(video.duration || 1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTime, setSelectedTime] = useState(null);
  const noteRefs = useRef({});
  const activeNote = useMemo(() => [...mockFeedback].reverse().find((note) => currentTime >= note.timestamp && currentTime < note.timestamp + 18), [currentTime]);

  useEffect(() => {
    if (activeNote) noteRefs.current[activeNote.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeNote]);

  const seek = (timestamp) => { setCurrentTime(timestamp); setSelectedTime(timestamp); };
  const selectNote = (timestamp) => seek(timestamp);
  const bloomData = Object.entries(mockAnalytics.bloomsDistribution).map(([level, count]) => ({ level, count }));
  const copusData = mockAnalytics.copusTimeline.map((event) => ({ ...event, minute: Math.round(event.timestamp / 60 * 10) / 10 }));

  return <Layout><div className="page-wrap observation-page"><Link to="/dashboard" className="back-link observation-back"><ArrowLeft size={15} /> Back to workspace</Link><header className="observation-header"><div><p className="eyebrow"><span className="eyebrow-pulse" /> Completed observation</p><h1>{video.title}</h1><div className="observation-submeta"><span>{formatDate(video.date)}</span><span>·</span><span>{formatTime(duration)} lesson</span><span className="analysis-ready"><span /> Analysis ready</span></div></div><button className="outline-button" onClick={() => window.print()}><BarChart3 size={16} /> Export view</button></header><div className="analysis-layout"><main className="analysis-main"><VideoPlayer video={video} currentTime={currentTime} duration={duration} isPlaying={isPlaying} onToggle={setIsPlaying} onSeek={seek} onTimeUpdate={setCurrentTime} onLoadedMetadata={setDuration} /><div className="player-key"><span><i className="key-dot key-strength" /> Strength</span><span><i className="key-dot key-growth" /> Opportunity for growth</span><span className="key-copy">Select a marker to jump to a moment</span></div><section className="charts-section"><div className="section-heading"><div><p className="eyebrow">Pattern scan</p><h2>What happened in the lesson</h2></div><span className="chart-period">AI-coded moments</span></div><div className="chart-grid"><article className="chart-card"><div className="chart-card-heading"><div><span className="chart-icon"><BarChart3 size={16} /></span><h3>Bloom's taxonomy</h3></div><span>19 prompts</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={bloomData} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e2e4da" /><XAxis dataKey="level" tick={{ fontSize: 10, fill: '#87928c' }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: '#87928c' }} axisLine={false} tickLine={false} allowDecimals={false} /><Tooltip cursor={{ fill: '#f0f1e9' }} contentStyle={{ border: '1px solid #dce0d7', borderRadius: 4, fontSize: 12 }} /><Bar dataKey="count" radius={[3, 3, 0, 0]}>{bloomData.map((entry, index) => <Cell key={entry.level} fill={index > 3 ? '#e9785f' : '#7b9a86'} />)}</Bar></BarChart></ResponsiveContainer></div></article><article className="chart-card"><div className="chart-card-heading"><div><span className="chart-icon"><LineChartIcon size={16} /></span><h3>COPUS activity</h3></div><span>by lesson minute</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={copusData} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="#e2e4da" /><XAxis dataKey="minute" unit="m" tick={{ fontSize: 10, fill: '#87928c' }} axisLine={false} tickLine={false} /><YAxis dataKey="code" type="category" width={45} tick={{ fontSize: 10, fill: '#87928c' }} axisLine={false} tickLine={false} /><Tooltip labelFormatter={(value) => `${value} min`} formatter={(value, name, item) => [item.payload.label, 'Activity']} contentStyle={{ border: '1px solid #dce0d7', borderRadius: 4, fontSize: 12 }} /><Line type="stepAfter" dataKey="code" stroke="#e9785f" strokeWidth={2.5} dot={{ r: 4, fill: '#e9785f', stroke: '#fbfaf6', strokeWidth: 2 }} /></LineChart></ResponsiveContainer></div></article></div></section></main><aside className="feedback-panel"><div className="feedback-panel-header"><div><p className="eyebrow">Synchronized feed</p><h2>Coach's notes</h2></div><span>{mockFeedback.length} notes</span></div><div className="feedback-scroll"><div className="feedback-group"><div className="feedback-group-label"><span className="group-rule strength-rule" /><span>Strengths</span><strong>{mockFeedback.filter((note) => note.category === 'STRENGTH').length}</strong></div>{mockFeedback.filter((note) => note.category === 'STRENGTH').map((note) => <NoteCard key={note.id} note={note} active={activeNote?.id === note.id || selectedTime === note.timestamp} onSelect={selectNote} noteRef={(element) => { noteRefs.current[note.id] = element; }} />)}</div><div className="feedback-group"><div className="feedback-group-label"><span className="group-rule growth-rule" /><span>Opportunities for growth</span><strong>{mockFeedback.filter((note) => note.category !== 'STRENGTH').length}</strong></div>{mockFeedback.filter((note) => note.category !== 'STRENGTH').map((note) => <NoteCard key={note.id} note={note} active={activeNote?.id === note.id || selectedTime === note.timestamp} onSelect={selectNote} noteRef={(element) => { noteRefs.current[note.id] = element; }} />)}</div></div><div className="feedback-panel-footer"><CircleAlert size={15} /><span>AI notes are a starting point for your reflection, not a final evaluation.</span></div></aside></div></div></Layout>;
}