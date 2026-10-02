import { prisma } from '../config/prisma.js';

export async function extractAudio(video) {
  // Replace this boundary with fluent-ffmpeg when the production media pipeline is enabled.
  return { source: video.fileUrl, durationSeconds: 900 };
}

export async function transcribeAudio(audio) {
  // Replace this stub with OpenAI Whisper multipart transcription and timestamp segments.
  return { text: 'Students compare two solution strategies while the teacher probes their reasoning.', segments: [{ start: 42, end: 58, text: 'Can you explain why this method works?' }] };
}

export async function analyzeInstruction({ transcript }) {
  // Replace this deterministic response with a GPT-4o structured-output request or LangChain chain.
  return {
    feedback: [
      { timestamp: 48, category: 'STRENGTH', rubricDimension: 'Danielson 3b', title: 'Probing questions extend student thinking', description: transcript.text },
      { timestamp: 126, category: 'GROWTH_OPPORTUNITY', rubricDimension: 'Danielson 3c', title: 'Increase student-to-student talk', description: 'Invite students to respond directly to one another before synthesizing the ideas.' },
      { timestamp: 284, category: 'STRENGTH', rubricDimension: 'Danielson 3d', title: 'Checks for understanding are timely', description: 'The quick comparison gives you evidence before moving to independent practice.' },
      { timestamp: 431, category: 'GROWTH_OPPORTUNITY', rubricDimension: 'Danielson 2b', title: 'Make the discussion norms visible', description: 'Re-state the listening norm before the next whole-group share.' }
    ],
    copusTimeline: [
      { timestamp: 0, code: 'T-L', actor: 'teacher', label: 'Lecturing' },
      { timestamp: 48, code: 'T-Ask', actor: 'teacher', label: 'Asking questions' },
      { timestamp: 126, code: 'SG', actor: 'students', label: 'Small group work' },
      { timestamp: 284, code: 'T-CG', actor: 'teacher', label: 'Whole group discussion' },
      { timestamp: 431, code: 'Ind', actor: 'students', label: 'Individual work' }
    ],
    bloomsDistribution: { Remember: 2, Understand: 5, Apply: 7, Analyze: 4, Evaluate: 2, Create: 1 }
  };
}

export async function processVideo(videoId) {
  await prisma.video.update({ where: { id: videoId }, data: { status: 'PROCESSING', error: null } });
  try {
    const video = await prisma.video.findUniqueOrThrow({ where: { id: videoId } });
    const audio = await extractAudio(video);
    const transcript = await transcribeAudio(audio);
    const analysis = await analyzeInstruction({ transcript, metadata: video });
    await prisma.$transaction([
      prisma.feedback.deleteMany({ where: { videoId } }),
      prisma.analytics.deleteMany({ where: { videoId } }),
      prisma.feedback.createMany({ data: analysis.feedback.map((item) => ({ ...item, videoId })) }),
      prisma.analytics.create({ data: { videoId, copusTimeline: analysis.copusTimeline, bloomsDistribution: analysis.bloomsDistribution } }),
      prisma.video.update({ where: { id: videoId }, data: { status: 'COMPLETED', duration: audio.durationSeconds, processedAt: new Date(), error: null } })
    ]);
  } catch (error) {
    await prisma.video.update({ where: { id: videoId }, data: { status: 'FAILED', error: error.message.slice(0, 500) } }).catch(() => {});
    throw error;
  }
}