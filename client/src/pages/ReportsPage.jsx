import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, BarChart3, BookOpen, Brain, Clock3, LineChart as LineChartIcon, LoaderCircle, Sparkles, Upload } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Layout } from '../components/Layout.jsx';
import api from '../lib/api.js';
import { usePreferences } from '../context/PreferencesContext.jsx';

// Two-series palette validated for colour-vision deficiency on the light (#fbfaf6) and dark (#1a2723) card surfaces.
const CHART_THEME = {
  light: { strength: '#3b6fb6', growth: '#e0684d', grid: '#e2e4da', tick: '#718079', cursor: 'rgba(29,42,39,.06)', surface: '#fbfaf6' },
  dark: { strength: '#5f93dc', growth: '#e0684d', grid: '#30423a', tick: '#9baea4', cursor: 'rgba(238,240,232,.06)', surface: '#1a2723' }
};

const DANIELSON = {
  '2a': { en: 'Respect & rapport', vi: 'Tôn trọng & gắn kết' },
  '2b': { en: 'Culture for learning', vi: 'Văn hoá học tập' },
  '2c': { en: 'Classroom procedures', vi: 'Quy trình lớp học' },
  '2d': { en: 'Student behavior', vi: 'Hành vi học sinh' },
  '2e': { en: 'Physical space', vi: 'Không gian lớp học' },
  '3a': { en: 'Communicating with students', vi: 'Giao tiếp với học sinh' },
  '3b': { en: 'Questioning & discussion', vi: 'Đặt câu hỏi & thảo luận' },
  '3c': { en: 'Engaging students', vi: 'Thu hút người học' },
  '3d': { en: 'Assessment in instruction', vi: 'Đánh giá trong giờ học' },
  '3e': { en: 'Flexibility & responsiveness', vi: 'Linh hoạt & phản hồi' }
};

const BLOOM_VI = { Remember: 'Nhớ', Understand: 'Hiểu', Apply: 'Vận dụng', Analyze: 'Phân tích', Evaluate: 'Đánh giá', Create: 'Sáng tạo' };

const formatPercent = (value) => (value === null || value === undefined ? '—' : `${Math.round(value)}%`);

export function ReportsPage() {
  const { t, language, theme } = usePreferences();
  const colors = CHART_THEME[theme === 'dark' ? 'dark' : 'light'];
  const isVi = language === 'vi';
  const [semesterId, setSemesterId] = useState('');
  const [report, setReport] = useState(null);
  const [state, setState] = useState({ loading: true, error: '' });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: '' });
    api(`/api/reports/overview${semesterId ? `?semesterId=${semesterId}` : ''}`)
      .then((data) => { if (!cancelled) { setReport(data); setState({ loading: false, error: '' }); } })
      .catch((error) => { if (!cancelled) setState({ loading: false, error: error.message }); });
    return () => { cancelled = true; };
  }, [semesterId]);

  const dateFormat = useMemo(() => new Intl.DateTimeFormat(isVi ? 'vi-VN' : 'en-GB', { day: '2-digit', month: '2-digit' }), [isVi]);

  const danielsonData = (report?.danielson || [])
    .filter((item) => DANIELSON[item.component])
    .map((item) => ({ ...item, name: `${item.component.toUpperCase()} · ${DANIELSON[item.component][isVi ? 'vi' : 'en']}` }));
  const bloomData = (report?.bloom || []).map((item) => ({ ...item, name: isVi ? BLOOM_VI[item.level] : item.level }));
  const copusData = (report?.copus || []).slice(0, 8).map((item) => ({ ...item, name: `${item.code} · ${item.label}` }));
  const trendData = (report?.trend || []).map((item, index) => ({ ...item, lesson: `#${index + 1}`, dateLabel: dateFormat.format(new Date(item.date)) }));
  const totals = report?.totals;
  const hasAnalyzed = Boolean(totals?.analyzedLessons);

  // Legend labels use the text colour; the dot beside them carries the series colour.
  const legendText = (value) => <span style={{ color: colors.tick }}>{value}</span>;
  const axis = { tick: { fontSize: 10, fill: colors.tick }, axisLine: false, tickLine: false };
  const tooltipProps = {
    cursor: { fill: colors.cursor },
    contentStyle: { background: colors.surface, border: `1px solid ${colors.grid}`, borderRadius: 6, fontSize: 12 },
    labelStyle: { fontWeight: 700, color: colors.tick },
    itemStyle: { color: colors.tick }
  };

  return (
    <Layout>
      <div className="page-wrap reports-page">
        <header className="page-header reports-header">
          <div>
            <p className="eyebrow"><BarChart3 size={14} /> {t('reportsEyebrow')}</p>
            <h1>{t('reportsTitle')}</h1>
            <p className="page-subtitle">{t('reportsSubtitle')}</p>
          </div>
          <label className="field reports-filter">
            <span className="field-label">{t('reportsSemester')}</span>
            <select className="input" value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
              <option value="">{t('reportsAllSemesters')}</option>
              {(report?.semesters || []).map((semester) => <option key={semester.id} value={semester.id}>{semester.code}</option>)}
            </select>
          </label>
        </header>

        {state.error && <div className="form-alert reports-alert">{state.error}</div>}
        {state.loading && !report && <div className="reports-loading"><LoaderCircle className="spin" size={20} /></div>}

        {totals && (
          <>
            <section className="reports-kpis" aria-label={t('reportsSummary')}>
              <Kpi icon={BookOpen} label={t('reportsClasses')} value={totals.classes} />
              <Kpi icon={Activity} label={t('reportsLessons')} value={totals.analyzedLessons} note={t('reportsLessonsNote', { total: totals.lessons, processing: totals.processingLessons, failed: totals.failedLessons })} />
              <Kpi icon={Clock3} label={t('reportsHours')} value={totals.analyzedHours} />
              <Kpi icon={Sparkles} label={t('reportsStrengthShare')} value={formatPercent(totals.strengthShare)} note={t('reportsFeedbackNote', { strengths: totals.strengths, growth: totals.growth })} />
              <Kpi icon={Brain} label={t('reportsHigherOrder')} value={formatPercent(totals.higherOrderShare)} note={t('reportsQuestionsNote', { count: totals.questions })} />
            </section>

            {!hasAnalyzed ? (
              <section className="reports-empty">
                <BarChart3 size={22} />
                <h2>{t('reportsEmptyTitle')}</h2>
                <p>{t('reportsEmptyCopy')}</p>
                <Link to="/upload" className="primary-button compact-button"><Upload size={16} /> {t('uploadObservation')}</Link>
              </section>
            ) : (
              <>
                <div className="reports-grid">
                  <ChartCard icon={BarChart3} title={t('reportsDanielsonTitle')} note={t('reportsDanielsonNote')} wide>
                    <div className="reports-chart" style={{ height: Math.max(220, danielsonData.length * 46 + 60) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={danielsonData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barGap={2} barCategoryGap="28%">
                          <CartesianGrid horizontal={false} stroke={colors.grid} />
                          <XAxis type="number" allowDecimals={false} {...axis} />
                          <YAxis type="category" dataKey="name" width={isVi ? 190 : 200} {...axis} />
                          <Tooltip {...tooltipProps} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} formatter={legendText} />
                          <Bar dataKey="strengths" name={t('reportsStrengths')} fill={colors.strength} radius={[0, 4, 4, 0]} maxBarSize={14} />
                          <Bar dataKey="growth" name={t('reportsGrowth')} fill={colors.growth} radius={[0, 4, 4, 0]} maxBarSize={14} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </ChartCard>

                  <ChartCard icon={Brain} title={t('reportsBloomTitle')} note={t('reportsBloomNote')}>
                    <div className="reports-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={bloomData} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke={colors.grid} />
                          <XAxis dataKey="name" {...axis} />
                          <YAxis allowDecimals={false} {...axis} />
                          <Tooltip {...tooltipProps} />
                          <Bar dataKey="count" name={t('reportsQuestions')} fill={colors.strength} radius={[4, 4, 0, 0]} maxBarSize={34} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </ChartCard>

                  <ChartCard icon={Activity} title={t('reportsCopusTitle')} note={t('reportsCopusNote')}>
                    <div className="reports-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={copusData} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
                          <CartesianGrid horizontal={false} stroke={colors.grid} />
                          <XAxis type="number" unit="%" domain={[0, 100]} {...axis} />
                          <YAxis type="category" dataKey="name" width={175} {...axis} />
                          <Tooltip {...tooltipProps} formatter={(value, name, item) => [`${value}% · ${item.payload.minutes} ${t('reportsMinutes')}`, t('reportsTimeShare')]} />
                          <Bar dataKey="share" name={t('reportsTimeShare')} fill={colors.strength} radius={[0, 4, 4, 0]} maxBarSize={14}
                            label={{ position: 'right', fontSize: 10, fill: colors.tick, formatter: (value) => `${Math.round(value)}%` }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </ChartCard>

                  <ChartCard icon={LineChartIcon} title={t('reportsTrendTitle')} note={t('reportsTrendNote')} wide>
                    <div className="reports-chart">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData} margin={{ top: 12, right: 16, left: -12, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke={colors.grid} />
                          <XAxis dataKey="lesson" {...axis} />
                          <YAxis unit="%" domain={[0, 100]} {...axis} />
                          <Tooltip {...tooltipProps} cursor={{ stroke: colors.tick, strokeDasharray: '3 3' }}
                            labelFormatter={(label, payload) => payload?.[0] ? `${label} · ${payload[0].payload.className} · ${payload[0].payload.dateLabel}` : label}
                            formatter={(value, name) => [value === null ? '—' : `${value}%`, name]} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} formatter={legendText} />
                          <Line type="monotone" dataKey="strengthShare" name={t('reportsStrengthShare')} stroke={colors.strength} strokeWidth={2} dot={{ r: 4, fill: colors.strength, stroke: colors.surface, strokeWidth: 2 }} connectNulls />
                          <Line type="monotone" dataKey="higherOrderShare" name={t('reportsHigherOrder')} stroke={colors.growth} strokeWidth={2} dot={{ r: 4, fill: colors.growth, stroke: colors.surface, strokeWidth: 2 }} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </ChartCard>
                </div>
              </>
            )}

            <section className="reports-table-card">
              <div className="chart-card-heading"><div><span className="chart-icon"><BookOpen size={16} /></span><h3>{t('reportsByClass')}</h3></div></div>
              {report.classes.length === 0 ? (
                <p className="reports-table-empty">{t('reportsNoClasses')} <Link to="/classes">{t('manageClasses')}</Link></p>
              ) : (
                <div className="reports-table-scroll">
                  <table className="reports-table">
                    <thead>
                      <tr>
                        <th>{t('reportsClass')}</th>
                        <th>{t('reportsSemester')}</th>
                        <th className="num">{t('reportsLessons')}</th>
                        <th className="num">{t('reportsMinutesAnalyzed')}</th>
                        <th className="num">{t('reportsStrengths')}</th>
                        <th className="num">{t('reportsGrowth')}</th>
                        <th className="num">{t('reportsStrengthShare')}</th>
                        <th className="num">{t('reportsHigherOrder')}</th>
                        <th>{t('reportsLastLesson')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.classes.map((row) => (
                        <tr key={row.id}>
                          <td><strong>{row.name}</strong><span>{[row.classCode, row.subject].filter(Boolean).join(' · ')}</span></td>
                          <td>{row.semester}</td>
                          <td className="num">{row.analyzedLessons}/{row.lessons}</td>
                          <td className="num">{row.analyzedMinutes}</td>
                          <td className="num">{row.strengths}</td>
                          <td className="num">{row.growth}</td>
                          <td className="num">{formatPercent(row.strengthShare)}</td>
                          <td className="num">{formatPercent(row.higherOrderShare)}</td>
                          <td>{row.lastLessonAt ? new Date(row.lastLessonAt).toLocaleDateString(isVi ? 'vi-VN' : 'en-GB') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}

function Kpi({ icon: Icon, label, value, note }) {
  return (
    <article className="reports-kpi">
      <span className="reports-kpi-label"><Icon size={14} /> {label}</span>
      <strong>{value}</strong>
      {note && <span className="reports-kpi-note">{note}</span>}
    </article>
  );
}

function ChartCard({ icon: Icon, title, note, wide, children }) {
  return (
    <article className={`chart-card reports-card${wide ? ' reports-card-wide' : ''}`}>
      <div className="chart-card-heading">
        <div><span className="chart-icon"><Icon size={16} /></span><h3>{title}</h3></div>
      </div>
      {note && <p className="reports-card-note">{note}</p>}
      {children}
    </article>
  );
}
