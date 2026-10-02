const demoSource = 'https://storage.googleapis.com/coverr-main/mp4/Mt_Baker.mp4';

export const mockTeacher = {
  id: 'teacher-ava-rodriguez',
  name: 'Ava Rodriguez',
  role: 'Instructional coach'
};

export const mockClasses = [
  {
    id: 'class-algebra-1',
    name: 'Algebra 1',
    subject: 'Mathematics',
    gradeLevel: 'Grade 9',
    accent: 'coral'
  },
  {
    id: 'class-ap-physics',
    name: 'AP Physics',
    subject: 'Science',
    gradeLevel: 'Grade 12',
    accent: 'sage'
  },
  {
    id: 'class-geometry',
    name: 'Geometry',
    subject: 'Mathematics',
    gradeLevel: 'Grade 10',
    accent: 'ochre'
  }
];

export const mockVideos = [
  {
    id: 'class-observation-001',
    classId: 'class-algebra-1',
    title: 'Quadratic functions: multiple representations',
    date: '2026-09-28T09:15:00.000Z',
    duration: 612,
    status: 'COMPLETED',
    source: demoSource,
    summary: 'A discussion-rich lesson with strong checks for understanding.',
    thumbnail: 'linear-gradient(135deg, #1d2a27 0%, #4d685d 55%, #e9785f 55%, #e9785f 100%)'
  },
  {
    id: 'class-observation-002',
    classId: 'class-algebra-1',
    title: 'Exit ticket debrief',
    date: '2026-09-25T10:00:00.000Z',
    duration: 438,
    status: 'PROCESSING',
    source: demoSource,
    summary: 'AI analysis is mapping questioning patterns and student talk.',
    thumbnail: 'linear-gradient(135deg, #253f3a 0%, #7b9a86 65%, #d9e3d1 65%)'
  },
  {
    id: 'class-observation-003',
    classId: 'class-ap-physics',
    title: 'Momentum lab launch',
    date: '2026-09-23T13:30:00.000Z',
    duration: 705,
    status: 'COMPLETED',
    source: demoSource,
    summary: 'Students move from prediction to evidence through lab stations.',
    thumbnail: 'linear-gradient(135deg, #18211f 0%, #35433d 62%, #d6a65d 62%)'
  },
  {
    id: 'class-observation-004',
    classId: 'class-ap-physics',
    title: 'Vector review and retrieval',
    date: '2026-09-19T13:30:00.000Z',
    duration: 521,
    status: 'PENDING',
    source: demoSource,
    summary: 'Queued for processing.',
    thumbnail: 'linear-gradient(135deg, #d9e3d1 0%, #7b9a86 60%, #1d2a27 60%)'
  },
  {
    id: 'class-observation-005',
    classId: 'class-geometry',
    title: 'Proof workshop',
    date: '2026-09-16T08:30:00.000Z',
    duration: 648,
    status: 'COMPLETED',
    source: demoSource,
    summary: 'Peer critique helps students make the logic of proof visible.',
    thumbnail: 'linear-gradient(135deg, #4d685d 0%, #d9e3d1 58%, #e9785f 58%)'
  }
];

export const mockFeedback = [
  {
    id: 'feedback-001',
    timestamp: 48,
    category: 'STRENGTH',
    rubricDimension: 'Danielson 3b',
    title: 'Probing questions extend student thinking',
    description: 'You ask students to connect the graph to the equation instead of accepting a quick answer.',
    bloom: 'Analyze',
    copus: 'T-Ask',
    color: 'sage'
  },
  {
    id: 'feedback-002',
    timestamp: 126,
    category: 'GROWTH_OPPORTUNITY',
    rubricDimension: 'Danielson 3c',
    title: 'Increase student-to-student talk',
    description: 'Invite students to respond directly to one another before synthesizing the ideas for the group.',
    bloom: 'Evaluate',
    copus: 'SG',
    color: 'coral'
  },
  {
    id: 'feedback-003',
    timestamp: 284,
    category: 'STRENGTH',
    rubricDimension: 'Danielson 3d',
    title: 'Checks for understanding are timely',
    description: 'The quick comparison gives you evidence before moving students into independent practice.',
    bloom: 'Apply',
    copus: 'T-CG',
    color: 'sage'
  },
  {
    id: 'feedback-004',
    timestamp: 431,
    category: 'GROWTH_OPPORTUNITY',
    rubricDimension: 'Danielson 2b',
    title: 'Make the discussion norms visible',
    description: 'Restate the listening norm before the next whole-group share so every voice has a clear entry point.',
    bloom: 'Understand',
    copus: 'Ind',
    color: 'coral'
  },
  {
    id: 'feedback-005',
    timestamp: 548,
    category: 'STRENGTH',
    rubricDimension: 'Danielson 3a',
    title: 'Language makes the target concrete',
    description: 'Your closing prompt returns students to the language of representations and gives the lesson a clear arc.',
    bloom: 'Create',
    copus: 'T-L',
    color: 'sage'
  }
];

export const mockAnalytics = {
  bloomsDistribution: { Remember: 2, Understand: 5, Apply: 7, Analyze: 4, Evaluate: 2, Create: 1 },
  copusTimeline: [
    { timestamp: 0, code: 'T-L', actor: 'Teacher', label: 'Mini-lesson' },
    { timestamp: 48, code: 'T-Ask', actor: 'Teacher', label: 'Questioning' },
    { timestamp: 126, code: 'SG', actor: 'Students', label: 'Small group work' },
    { timestamp: 284, code: 'T-CG', actor: 'Teacher', label: 'Whole group' },
    { timestamp: 431, code: 'Ind', actor: 'Students', label: 'Independent work' },
    { timestamp: 548, code: 'T-L', actor: 'Teacher', label: 'Synthesis' }
  ]
};

export function getVideo(videoId) {
  return mockVideos.find((video) => video.id === videoId) || mockVideos[0];
}

export function getClassVideos(classId) {
  return mockVideos.filter((video) => video.classId === classId);
}

export function createUploadedObservation(file, classId = 'class-algebra-1') {
  return {
    id: `local-${Date.now()}`,
    classId,
    title: file.name.replace(/\.mp4$/i, ''),
    date: new Date().toISOString(),
    duration: 0,
    status: 'PROCESSING',
    source: URL.createObjectURL(file),
    summary: 'Your local observation is being prepared for analysis.',
    thumbnail: 'linear-gradient(135deg, #1d2a27, #7b9a86)'
  };
}