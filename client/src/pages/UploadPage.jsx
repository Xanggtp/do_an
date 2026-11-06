import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  AudioLines,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  FileVideo,
  Info,
  LoaderCircle,
  Presentation,
  ShieldCheck,
  Sparkles,
  Star,
  UploadCloud,
  X
} from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { usePreferences } from '../context/PreferencesContext.jsx';
import api from '../lib/api.js';
import { createUploadedObservation } from '../lib/mockObservations.js';

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024;

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPage() {
  const { t, language } = usePreferences();
  const isVi = language === 'vi';
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const targetClassId = searchParams.get('classId') || location.state?.classId || '';
  const initialClass = location.state?.classItem || null;

  const inputRefs = useRef({});
  const timerRef = useRef(null);
  const [files, setFiles] = useState({});
  const [classes, setClasses] = useState(initialClass ? [initialClass] : []);
  const [selectedClassId, setSelectedClassId] = useState(targetClassId || initialClass?.id || '');
  const [loadingClasses, setLoadingClasses] = useState(!initialClass);
  const [stage, setStage] = useState('select'); // 'select' | 'uploading' | 'checking' | 'review'
  const [progress, setProgress] = useState(0);
  const [checkingStep, setCheckingStep] = useState(1);
  const [error, setError] = useState('');
  const [aiReviewData, setAiReviewData] = useState(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  useEffect(() => {
    let active = true;
    api('/api/classes')
      .then((data) => {
        if (!active) return;
        const list = Array.isArray(data.classes) ? data.classes : [];
        setClasses(list);
        if (targetClassId && list.some((item) => item.id === targetClassId)) {
          setSelectedClassId(targetClassId);
        } else if (initialClass?.id && list.some((item) => item.id === initialClass.id)) {
          setSelectedClassId(initialClass.id);
        } else if (!targetClassId && list.length && !selectedClassId) {
          setSelectedClassId(list[0].id);
        }
      })
      .catch(() => {
        if (!active) return;
        setClasses([]);
      })
      .finally(() => {
        if (active) setLoadingClasses(false);
      });
    return () => { active = false; };
  }, [targetClassId, initialClass]);

  const assignedClass = useMemo(() => {
    return (
      classes.find((item) => item.id === selectedClassId) ||
      initialClass ||
      (classes.length ? classes[0] : null)
    );
  }, [classes, selectedClassId, initialClass]);

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
    if (!assignedClass) return setError(t('selectClass'));
    setError('');
    setStage('uploading');
    setProgress(10);

    // Stage 1: Uploading progress
    timerRef.current = setInterval(() => {
      setProgress((value) => {
        if (value >= 100) {
          clearInterval(timerRef.current);
          startCheckingProcess();
          return 100;
        }
        return value + 15;
      });
    }, 150);
  };

  const startCheckingProcess = () => {
    setStage('checking');
    setCheckingStep(1);

    // Step 1: ffprobe check -> Step 2: 120s Segmentation -> Step 3: AI Review Agent
    setTimeout(() => {
      setCheckingStep(2);
      setTimeout(() => {
        setCheckingStep(3);
        setTimeout(() => {
          finalizeReview();
        }, 900);
      }, 900);
    }, 900);
  };

  const finalizeReview = () => {
    const videoName = files.video?.name.replace(/\.mp4$/i, '') || 'Tiết học';
    const className = assignedClass?.name || 'Lớp học';
    const subject = assignedClass?.subject || 'Bài giảng đại học';

    const review = {
      status: 'success',
      chunk_id: 'segment_001',
      quality_scores: {
        audio_quality: 5,
        video_quality: 5,
        content_clarity: 4,
        processing_confidence: 5
      },
      content_review: {
        main_topic: `Khởi động tiết học & Đặt vấn đề bài học: ${videoName} (${subject})`,
        summary: `Giảng viên mở đầu bài giảng bằng việc tóm lược kiến thức buổi trước, đặt câu hỏi gợi mở định hướng bài học mới và phân công hoạt động thảo luận nhóm cho sinh viên.`,
        key_points: [
          'Giảng viên kích hoạt kiến thức nền tảng và nhận thức ban đầu của sinh viên qua câu hỏi gợi mở.',
          'Xác định rõ ràng mục tiêu đầu ra và các tiêu chí trọng tâm của tiết học.',
          'Tổ chức lớp học theo mô hình thảo luận nhóm nhỏ tương tác (Small group work).'
        ],
        important_visuals: [
          'Slide trình chiếu tiêu đề bài học và câu hỏi thảo luận trung tâm.',
          'Sơ đồ phân loại khái niệm và công thức minh họa trên bảng phụ.'
        ],
        continuity_notes: 'Phân đoạn mở đầu bài học (00:00 - 02:00). Nội dung dẫn nhập mạch lạc, chuẩn bị kết nối trực tiếp vào phần trình bày nội dung trọng tâm ở phân đoạn 2.'
      },
      issues_detected: [],
      recommendation: 'continue',
      error_message: null
    };

    setAiReviewData(review);
    setStage('review');
  };

  const handleConfirmAndProceed = () => {
    const selectedClass = assignedClass;
    const observation = createUploadedObservation(files.video, selectedClass?.id || selectedClassId, {
      slides: files.slides,
      lessonPlan: files.lessonPlan,
      audio: files.audio,
      className: selectedClass?.name || 'Observation',
      classCode: selectedClass?.classCode || '',
      subject: selectedClass?.subject || '',
      semester: selectedClass?.semester || '',
      aiReview: aiReviewData
    });

    navigate(`/observation/${observation.id}`, { state: { observation } });
  };

  const stageLabels = { select: '01', uploading: '02', checking: '03', review: '04' };
  const stageTitles = {
    select: t('chooseRecording'),
    uploading: t('uploadingVideo'),
    checking: isVi ? 'Kiểm tra tệp & Phân đoạn bài giảng' : 'Integrity Check & 120s Segmentation',
    review: isVi ? 'Đánh giá chất lượng & Xem trước phân tích AI' : 'AI Video Quality Review & Preview'
  };

  return (
    <Layout>
      <div className="page-wrap upload-page">
        <Link to="/dashboard" className="back-link upload-back">
          <ArrowLeft size={15} /> {t('backToWorkspace')}
        </Link>
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

          {/* STAGE 1: SELECT FILES */}
          {stage === 'select' && (
            <>
              <div className="upload-blocks">
                {uploadTypes.map(({ id, title, dropLabel, formats, accept, icon: Icon }) => {
                  const file = files[id];
                  return (
                    <section className="upload-block" key={id}>
                      <div className="upload-block-heading">
                        <div>
                          <h3>{title}</h3>
                          <p>{formats}</p>
                        </div>
                        <Icon size={19} />
                      </div>
                      <button
                        className="drop-zone"
                        onClick={() => inputRefs.current[id]?.click()}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          selectFile(id, event.dataTransfer.files?.[0]);
                        }}
                      >
                        <span className="drop-zone-icon"><UploadCloud size={21} /></span>
                        <strong>{dropLabel}</strong>
                        <span>{t('browseComputer')}</span>
                      </button>
                      <input
                        ref={(element) => { inputRefs.current[id] = element; }}
                        className="sr-only"
                        type="file"
                        accept={accept}
                        onChange={(event) => selectFile(id, event.target.files?.[0])}
                      />
                      {file && (
                        <div className="selected-file">
                          <span className="file-icon"><Icon size={17} /></span>
                          <span>
                            <strong>{file.name}</strong>
                            <small>{formatBytes(file.size)}</small>
                          </span>
                          <button
                            onClick={() => setFiles((current) => ({ ...current, [id]: null }))}
                            aria-label={t('removeSelectedFile')}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>

              <div className="upload-options">
                <div className="upload-class-select-wrap">
                  <label className="field-label">{t('assignedClass')}</label>
                  {assignedClass ? (
                    <div className="assigned-class-box">
                      <span className={`class-color-dot ${assignedClass.accent || 'sage'}`} />
                      <div className="assigned-class-box-info">
                        <strong>{assignedClass.name}</strong>
                        <small>
                          {assignedClass.classCode ? `${assignedClass.classCode} · ` : ''}
                          {assignedClass.subject}
                          {assignedClass.semester ? ` [${assignedClass.semester}]` : ''}
                        </small>
                      </div>
                    </div>
                  ) : loadingClasses ? (
                    <div className="input" style={{ opacity: 0.6 }}>Loading class...</div>
                  ) : (
                    <div className="upload-classes-empty">
                      <p>{t('noClassesFound')} <Link to="/dashboard">{t('workspace')}</Link></p>
                    </div>
                  )}
                </div>
              </div>

              {error && <p className="form-alert">{error}</p>}
              <button className="primary-button upload-action" onClick={startUpload}>
                <UploadCloud size={17} /> {t('startUpload')}
              </button>
            </>
          )}

          {/* STAGE 2: UPLOADING */}
          {stage === 'uploading' && (
            <div className="upload-progress-view">
              <div className="progress-file">
                <span className="file-icon"><FileVideo size={18} /></span>
                <span>
                  <strong>{files.video?.name}</strong>
                  <small>{formatBytes(files.video?.size)} · {t('secureLocalTransfer')}</small>
                </span>
              </div>
              <div className="progress-track">
                <span style={{ width: `${progress}%` }} />
              </div>
              <div className="progress-label">
                <span>{t('uploading')}</span>
                <strong>{progress}%</strong>
              </div>
            </div>
          )}

          {/* STAGE 3: CHECKING & SEGMENTATION */}
          {stage === 'checking' && (
            <div className="check-pipeline-view">
              <div className="progress-file">
                <span className="file-icon"><FileVideo size={18} /></span>
                <span>
                  <strong>{files.video?.name}</strong>
                  <small>{formatBytes(files.video?.size)} · {isVi ? 'Đang xác minh & phân đoạn' : 'Validating & segmenting'}</small>
                </span>
              </div>

              <div className="check-pipeline-steps">
                {/* Step 1: ffprobe check */}
                <div className={`check-step-item ${checkingStep > 1 ? 'is-done' : 'is-active'}`}>
                  <div className="check-step-icon">
                    {checkingStep > 1 ? <CheckCircle2 size={16} /> : <LoaderCircle size={16} className="spin" />}
                  </div>
                  <div className="check-step-content">
                    <strong>{isVi ? 'Kiểm tra tính toàn vẹn (ffprobe)' : 'Media Integrity Check (ffprobe)'}</strong>
                    <p>
                      {checkingStep > 1
                        ? (isVi ? 'Tệp MP4 hợp lệ, luồng âm thanh & hình ảnh đồng bộ không lỗi.' : 'Valid MP4 stream, duration verified, no media corruption.')
                        : (isVi ? 'Đang đọc luồng dữ liệu, codec và tính toàn vẹn tệp...' : 'Reading audio/video streams, codec and duration...')}
                    </p>
                  </div>
                </div>

                {/* Step 2: 120s Segmentation */}
                <div className={`check-step-item ${checkingStep > 2 ? 'is-done' : checkingStep === 2 ? 'is-active' : ''}`}>
                  <div className="check-step-icon">
                    {checkingStep > 2 ? <CheckCircle2 size={16} /> : checkingStep === 2 ? <LoaderCircle size={16} className="spin" /> : <Clock3 size={16} />}
                  </div>
                  <div className="check-step-content">
                    <strong>{isVi ? 'Phân đoạn 2 phút không nén lại (-c copy)' : '2-Minute Lossless Segmentation (-c copy)'}</strong>
                    <p>
                      {checkingStep > 2
                        ? (isVi ? 'Đã phân tách video thành các phân đoạn 120 giây tuần tự (segment_001.mp4, segment_002.mp4...).' : 'Video successfully sliced into 120-second sequential chunks.')
                        : checkingStep === 2
                        ? (isVi ? 'Đang cắt lát video thành các phân đoạn 120 giây bảo toàn 100% chất lượng gốc...' : 'Slicing video into 120s segments with stream copy...')
                        : (isVi ? 'Chờ kiểm tra xong tính toàn vẹn tệp.' : 'Waiting for integrity check completion.')}
                    </p>
                  </div>
                </div>

                {/* Step 3: AI Video Review Agent */}
                <div className={`check-step-item ${checkingStep === 3 ? 'is-active' : ''}`}>
                  <div className="check-step-icon">
                    <LoaderCircle size={16} className="spin" />
                  </div>
                  <div className="check-step-content">
                    <strong>{isVi ? 'Khởi tạo tác tử AI Review (segment_001)' : 'AI Video Review Agent (segment_001)'}</strong>
                    <p>
                      {isVi ? 'Đang trích xuất chủ đề, chấm điểm chất lượng và phân tích tính liên tục...' : 'Analyzing media quality scores, continuity notes and pedagogical key points...'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STAGE 4: AI QUALITY REVIEW & PREVIEW */}
          {stage === 'review' && aiReviewData && (
            <div className="review-panel-wrap">
              {/* Badge row */}
              <div className="review-header-badge-row">
                <span className="review-badge badge-info">
                  <Clock3 size={13} /> {aiReviewData.chunk_id} (00:00 - 02:00)
                </span>
                <span className="review-badge badge-success">
                  <CheckCircle2 size={13} /> {isVi ? 'Trạng thái: Thành công' : 'Status: Success'}
                </span>
                <span className="review-badge badge-recommend">
                  <ShieldCheck size={13} /> {isVi ? 'Khuyến nghị: Tiếp tục' : 'Recommendation: Continue'}
                </span>
              </div>

              {/* Quality Scores */}
              <div>
                <label className="field-label">
                  <Sparkles size={14} style={{ display: 'inline', marginRight: 4 }} />
                  {isVi ? 'Thang điểm chất lượng kỹ thuật (1 - 5)' : 'Media Quality Scores (1 - 5)'}
                </label>
                <div className="quality-scores-grid">
                  <div className="score-box">
                    <span className="score-box-title">{isVi ? 'Âm thanh' : 'Audio Quality'}</span>
                    <div className="score-box-val">
                      {aiReviewData.quality_scores.audio_quality}<small>/5</small>
                    </div>
                    <div className="score-stars">
                      {[...Array(aiReviewData.quality_scores.audio_quality)].map((_, i) => (
                        <Star key={i} size={11} fill="currentColor" />
                      ))}
                    </div>
                  </div>

                  <div className="score-box">
                    <span className="score-box-title">{isVi ? 'Hình ảnh / Slide' : 'Video Quality'}</span>
                    <div className="score-box-val">
                      {aiReviewData.quality_scores.video_quality}<small>/5</small>
                    </div>
                    <div className="score-stars">
                      {[...Array(aiReviewData.quality_scores.video_quality)].map((_, i) => (
                        <Star key={i} size={11} fill="currentColor" />
                      ))}
                    </div>
                  </div>

                  <div className="score-box">
                    <span className="score-box-title">{isVi ? 'Độ rõ nội dung' : 'Content Clarity'}</span>
                    <div className="score-box-val">
                      {aiReviewData.quality_scores.content_clarity}<small>/5</small>
                    </div>
                    <div className="score-stars">
                      {[...Array(aiReviewData.quality_scores.content_clarity)].map((_, i) => (
                        <Star key={i} size={11} fill="currentColor" />
                      ))}
                    </div>
                  </div>

                  <div className="score-box">
                    <span className="score-box-title">{isVi ? 'Độ tin cậy xử lý' : 'AI Confidence'}</span>
                    <div className="score-box-val">
                      {aiReviewData.quality_scores.processing_confidence}<small>/5</small>
                    </div>
                    <div className="score-stars">
                      {[...Array(aiReviewData.quality_scores.processing_confidence)].map((_, i) => (
                        <Star key={i} size={11} fill="currentColor" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Content Review in Vietnamese */}
              <div className="content-review-card">
                <div className="content-field-row">
                  <span className="content-field-label">
                    <Sparkles size={13} /> {isVi ? 'Chủ đề chính bài học' : 'Main Lesson Topic'}
                  </span>
                  <p className="content-field-text">
                    <strong>{aiReviewData.content_review.main_topic}</strong>
                  </p>
                </div>

                <div className="content-field-row">
                  <span className="content-field-label">
                    <Info size={13} /> {isVi ? 'Tóm tắt phân đoạn (2 phút đầu)' : 'Segment Summary (First 2 mins)'}
                  </span>
                  <p className="content-field-text">{aiReviewData.content_review.summary}</p>
                </div>

                <div className="content-field-row">
                  <span className="content-field-label">
                    <CheckCircle2 size={13} /> {isVi ? 'Ý chính & Điểm nhấn sư phạm' : 'Key Pedagogical Points'}
                  </span>
                  <ul className="content-review-bullets">
                    {aiReviewData.content_review.key_points.map((pt, idx) => (
                      <li key={idx}>{pt}</li>
                    ))}
                  </ul>
                </div>

                <div className="content-field-row">
                  <span className="content-field-label">
                    <Presentation size={13} /> {isVi ? 'Điểm nhấn hình ảnh / Slide' : 'Important Visuals & Slides'}
                  </span>
                  <ul className="content-review-bullets">
                    {aiReviewData.content_review.important_visuals.map((vis, idx) => (
                      <li key={idx}>{vis}</li>
                    ))}
                  </ul>
                </div>

                <div className="content-field-row">
                  <span className="content-field-label">
                    <Clock3 size={13} /> {isVi ? 'Tính liên tục của bài giảng' : 'Continuity Notes'}
                  </span>
                  <p className="content-field-text">{aiReviewData.content_review.continuity_notes}</p>
                </div>
              </div>

              {/* Issues detected */}
              <div className="issues-box">
                <CheckCircle2 size={16} />
                <span>
                  {isVi
                    ? 'Không phát hiện lỗi chất lượng (Đạt tiêu chuẩn: âm thanh rõ ràng, không mờ slide, đầy đủ nội dung)'
                    : 'No media issues detected (Passes all checks: clear audio, sharp slides, full content)'}
                </span>
              </div>

              {/* Actions */}
              <div className="review-actions-row">
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => {
                    setStage('select');
                    setAiReviewData(null);
                  }}
                >
                  {isVi ? 'Chọn lại tệp khác' : 'Change File'}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleConfirmAndProceed}
                >
                  <ChevronRight size={17} /> {isVi ? 'Xác nhận & Đi tới bài quan sát' : 'Confirm & Proceed to Observation'}
                </button>
              </div>
            </div>
          )}
        </section>

        <p className="upload-footnote">{t('localDemo')}</p>
      </div>
    </Layout>
  );
}
