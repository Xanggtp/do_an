import { useMemo, useState } from 'react';
import { ArrowUpRight, Check, ChevronRight, Clock3, Film, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getClassVideos, mockClasses, mockTeacher } from '../lib/mockObservations.js';

const statusLabels = { COMPLETED: 'Completed', PROCESSING: 'Processing', PENDING: 'Pending' };

function formatDate(value) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
function formatDuration(seconds) { return seconds ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : 'Preparing'; }

function VideoCard({ video }) {
  const card = <article className="observation-card">
    <div className="observation-thumbnail" style={{ background: video.thumbnail }}><span className="thumbnail-kicker"><Film size={13} /> Observation</span><span className={`status-pill status-${video.status.toLowerCase()}`}><span /> {statusLabels[video.status]}</span>{video.status === 'COMPLETED' && <span className="thumbnail-play"><ArrowUpRight size={19} /></span>}</div>
    <div className="observation-card-body"><div className="observation-card-meta"><span>{formatDate(video.date)}</span><span>{formatDuration(video.duration)}</span></div><h3>{video.title}</h3><p>{video.summary}</p><div className="observation-card-footer"><span className="card-status-label">{statusLabels[video.status]}</span>{video.status === 'COMPLETED' && <span className="card-open">Open analysis <ArrowUpRight size={14} /></span>}</div></div>
  </article>;
  return video.status === 'COMPLETED' ? <Link to={`/observation/${video.id}`} className="observation-card-link">{card}</Link> : card;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [activeClassId, setActiveClassId] = useState(mockClasses[0].id);
  const [query, setQuery] = useState('');
  const activeClass = mockClasses.find((item) => item.id === activeClassId) || mockClasses[0];
  const videos = useMemo(() => getClassVideos(activeClassId).filter((video) => video.title.toLowerCase().includes(query.toLowerCase())), [activeClassId, query]);
  const firstName = user?.name?.split(' ')[0] || mockTeacher.name.split(' ')[0];

  return <Layout><div className="page-wrap observation-dashboard"><header className="workspace-header"><div><p className="eyebrow"><span className="eyebrow-pulse" /> Classroom observation studio</p><h1>Good morning, {firstName}.</h1><p className="page-subtitle">A clear view of what is happening in your classrooms, one observation at a time.</p></div><Link className="primary-button" to="/upload"><Plus size={17} /> Upload observation</Link></header><div className="workspace-layout"><aside className="class-rail"><div className="class-rail-heading"><div><p className="eyebrow">Your classes</p><strong>{mockClasses.length} active classes</strong></div><button className="icon-button-light" aria-label="Filter classes"><SlidersHorizontal size={15} /></button></div><div className="class-list">{mockClasses.map((item) => <button key={item.id} className={`class-list-item ${item.id === activeClassId ? 'is-active' : ''}`} onClick={() => setActiveClassId(item.id)}><span className={`class-color-dot ${item.accent}`} /><span className="class-list-copy"><strong>{item.name}</strong><small>{item.subject} · {item.gradeLevel}</small></span>{item.id === activeClassId && <Check size={15} />}</button>)}</div><div className="class-rail-note"><Clock3 size={16} /><span>AI notes appear here after each observation finishes processing.</span></div></aside><section className="observation-library"><div className="library-heading"><div><p className="eyebrow">Selected class</p><h2>{activeClass.name}</h2><p>{activeClass.subject} · {activeClass.gradeLevel}</p></div><div className="library-tools"><label className="search-field"><Search size={15} /><span className="sr-only">Search observations</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search observations" /></label><span className="video-count">{videos.length} {videos.length === 1 ? 'video' : 'videos'}</span></div></div>{videos.length ? <div className="observation-grid">{videos.map((video) => <VideoCard key={video.id} video={video} />)}</div> : <div className="empty-state"><Film size={23} /><h3>No matching observations</h3><p>Try another search or upload a new classroom recording.</p></div>}<Link to="/upload" className="dashboard-upload-link"><span className="upload-link-icon"><Plus size={17} /></span><span><strong>Add another observation</strong><small>Upload an MP4 for {activeClass.name}</small></span><ChevronRight size={17} /></Link></section></div></div></Layout>;
}
