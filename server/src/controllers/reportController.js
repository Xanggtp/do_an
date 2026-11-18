import { prisma } from '../config/prisma.js';

const BLOOM_LEVELS = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
const HIGHER_ORDER = ['Analyze', 'Evaluate', 'Create'];

const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const share = (part, total) => (total > 0 ? round((part / total) * 100) : null);

/** "Danielson 3b" / "3B" / "danielson 3b" -> "3b" */
function danielsonKey(value) {
  const match = String(value || '').match(/([1-4])\s*([a-f])/i);
  return match ? `${match[1]}${match[2].toLowerCase()}` : 'other';
}

/** Seconds spent in each COPUS code: each entry lasts until the next one (or the end of the video). */
function copusSeconds(timeline, duration) {
  const totals = {};
  const items = [...(Array.isArray(timeline) ? timeline : [])]
    .filter((item) => item?.code && Number.isFinite(Number(item.timestamp)))
    .sort((a, b) => a.timestamp - b.timestamp);
  items.forEach((item, i) => {
    const end = i + 1 < items.length ? Number(items[i + 1].timestamp) : Number(duration) || Number(item.timestamp);
    const seconds = Math.max(0, end - Number(item.timestamp));
    if (!totals[item.code]) totals[item.code] = { seconds: 0, label: item.label || item.code, actor: item.actor };
    totals[item.code].seconds += seconds;
  });
  return totals;
}

function bloomTotals(distribution) {
  return Object.fromEntries(BLOOM_LEVELS.map((level) => [level, Math.max(0, Number(distribution?.[level]) || 0)]));
}

/**
 * GET /api/reports/overview?semesterId=
 * Aggregates every analyzed lesson of the signed-in teacher across classes.
 */
export async function getReportsOverview(request, response) {
  const teacher = await prisma.teacher.findUnique({ where: { userId: request.user.id } });
  if (!teacher) throw Object.assign(new Error('Teacher profile not found.'), { statusCode: 404 });

  const semesterId = typeof request.query.semesterId === 'string' && /^[a-f0-9]{24}$/i.test(request.query.semesterId)
    ? request.query.semesterId
    : null;

  const [semesters, classes] = await Promise.all([
    prisma.semester.findMany({ where: { teacherId: teacher.id }, orderBy: { createdAt: 'asc' }, select: { id: true, code: true } }),
    prisma.class.findMany({
      where: { teacherId: teacher.id, ...(semesterId ? { semesterId } : {}) },
      orderBy: { createdAt: 'asc' },
      include: {
        videos: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true, filename: true, status: true, duration: true, createdAt: true,
            analytics: { select: { copusTimeline: true, bloomsDistribution: true } },
            feedback: { select: { category: true, rubricDimension: true } }
          }
        }
      }
    })
  ]);

  const totals = { classes: classes.length, lessons: 0, analyzedLessons: 0, processingLessons: 0, failedLessons: 0, analyzedSeconds: 0, strengths: 0, growth: 0, questions: 0, higherOrderQuestions: 0 };
  const danielson = {};
  const bloom = Object.fromEntries(BLOOM_LEVELS.map((level) => [level, 0]));
  const copus = {};
  const trend = [];

  const perClass = classes.map((cls) => {
    const row = { id: cls.id, name: cls.name, classCode: cls.classCode, subject: cls.subject, semester: cls.semester, lessons: cls.videos.length, analyzedLessons: 0, analyzedMinutes: 0, strengths: 0, growth: 0, questions: 0, higherOrderQuestions: 0, lastLessonAt: null };

    for (const video of cls.videos) {
      totals.lessons += 1;
      row.lastLessonAt = video.createdAt;
      if (video.status === 'FAILED') totals.failedLessons += 1;
      if (video.status === 'PENDING' || video.status === 'PROCESSING') totals.processingLessons += 1;
      if (video.status !== 'COMPLETED') continue;

      totals.analyzedLessons += 1;
      row.analyzedLessons += 1;
      const seconds = Number(video.duration) || 0;
      totals.analyzedSeconds += seconds;
      row.analyzedMinutes += seconds / 60;

      const strengths = video.feedback.filter((item) => item.category === 'STRENGTH').length;
      const growth = video.feedback.length - strengths;
      row.strengths += strengths;
      row.growth += growth;
      for (const item of video.feedback) {
        const key = danielsonKey(item.rubricDimension);
        danielson[key] ||= { component: key, strengths: 0, growth: 0 };
        danielson[key][item.category === 'STRENGTH' ? 'strengths' : 'growth'] += 1;
      }

      const lessonBloom = bloomTotals(video.analytics?.bloomsDistribution);
      const lessonQuestions = BLOOM_LEVELS.reduce((sum, level) => sum + lessonBloom[level], 0);
      const lessonHigher = HIGHER_ORDER.reduce((sum, level) => sum + lessonBloom[level], 0);
      for (const level of BLOOM_LEVELS) bloom[level] += lessonBloom[level];
      row.questions += lessonQuestions;
      row.higherOrderQuestions += lessonHigher;

      for (const [code, value] of Object.entries(copusSeconds(video.analytics?.copusTimeline, video.duration))) {
        copus[code] ||= { code, label: value.label, actor: value.actor, seconds: 0 };
        copus[code].seconds += value.seconds;
      }

      trend.push({
        videoId: video.id,
        date: video.createdAt,
        classId: cls.id,
        className: cls.name,
        filename: video.filename,
        strengths,
        growth,
        strengthShare: share(strengths, strengths + growth),
        higherOrderShare: share(lessonHigher, lessonQuestions)
      });
    }

    totals.strengths += row.strengths;
    totals.growth += row.growth;
    totals.questions += row.questions;
    totals.higherOrderQuestions += row.higherOrderQuestions;
    return {
      ...row,
      analyzedMinutes: round(row.analyzedMinutes),
      strengthShare: share(row.strengths, row.strengths + row.growth),
      higherOrderShare: share(row.higherOrderQuestions, row.questions)
    };
  });

  const copusTotal = Object.values(copus).reduce((sum, item) => sum + item.seconds, 0);
  response.json({
    semesters,
    semesterId,
    totals: {
      ...totals,
      analyzedHours: round(totals.analyzedSeconds / 3600),
      strengthShare: share(totals.strengths, totals.strengths + totals.growth),
      higherOrderShare: share(totals.higherOrderQuestions, totals.questions)
    },
    danielson: Object.values(danielson).sort((a, b) => a.component.localeCompare(b.component)),
    bloom: BLOOM_LEVELS.map((level) => ({ level, count: bloom[level] })),
    copus: Object.values(copus)
      .map((item) => ({ ...item, minutes: round(item.seconds / 60), share: share(item.seconds, copusTotal) }))
      .sort((a, b) => b.seconds - a.seconds),
    trend: trend.sort((a, b) => new Date(a.date) - new Date(b.date)),
    classes: perClass
  });
}
