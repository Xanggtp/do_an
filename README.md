# ClassMind Classroom Observation & Lecture Processing Platform

ClassMind is a full-stack automated classroom observation platform designed to help educators review, analyze, and gain actionable insights from lecture recordings. It pairs a modern React interface with an Express backend, MongoDB persistence via Prisma, and an asynchronous media processing pipeline powered by BullMQ, FFmpeg, and AI evaluation models.

---

## Key Features

- **Teacher Observation Dashboard**: Manage semesters, course sections, and lecture recordings with interactive feedback markers and analytics.
- **Automated Lecture Ingestion & Validation**: Verifies media integrity, stream codecs, and playback accessibility using `ffprobe`.
- **Fast Lossless Video Segmentation**: Slices lengthy lectures (40+ minutes) into 2-minute (120-second) MP4 chunks without re-encoding (`-c copy`) via `fluent-ffmpeg`.
- **AI-Powered Pedagogical Analysis**:
  - Pedagogical rubric alignment (Danielson Framework 2b, 3b, 3c, 3d).
  - COPUS (Classroom Observation Protocol for Undergraduate STEM) engagement timeline.
  - Bloom's Taxonomy cognitive distribution.
  - Per-segment quality and chunk continuity evaluation formatted for multi-modal LLM review (GPT-4o Vision).
- **Upload Page — Check & Review Workflow**: 4-step upload pipeline with live progress, ffprobe integrity check, 120s segmentation status, and an AI quality review card shown before entering the observation studio.
- **Flexible Storage**: Supports local filesystem storage or private Amazon S3 buckets with signed URLs.
- **Scalable Background Processing**: Queue-based asynchronous worker model powered by BullMQ and Redis.

---

## Lecture Processing Pipeline

```
Upload (MP4) → ffprobe Validation → 120s Lossless Segmentation → AI Chunk Review (GPT-4o Vision) → Pedagogical Analytics → Teacher Dashboard
```

---

## Requirements

- **Node.js**: 20.x or newer
- **npm**: 10.x or newer
- **Database**: MongoDB (Atlas or local instance)
- **Message Broker**: Redis 6.x or newer (required when `WORKER_MODE=queue`)
- **Media Engine**: FFmpeg and FFprobe — bundled automatically via `@ffmpeg-installer/ffmpeg` and `@ffprobe-installer/ffprobe` (no manual install needed)

---

## Setup & Installation

### 1. Configure Environment Variables

Copy `.env.example` to `.env` in the project root:

```bash
cp .env.example .env
```

Minimal required variables:

```env
PORT=5000
DATABASE_URL="mongodb+srv://<username>:<password>@cluster.mongodb.net/classmind"
JWT_SECRET="replace-with-a-long-random-secret"
CLIENT_ORIGIN=http://localhost:5173
NODE_ENV=development

# Storage: 'local' or 's3'
UPLOAD_PROVIDER=local
UPLOAD_DIRECTORY=./uploads
MAX_VIDEO_BYTES=2147483648

# Worker mode: 'stub', 'inline', or 'queue'
WORKER_MODE=stub
REDIS_URL=redis://127.0.0.1:6379

# Optional: Override bundled binaries with custom paths
# FFMPEG_PATH=/usr/local/bin/ffmpeg
# FFPROBE_PATH=/usr/local/bin/ffprobe

# Required only if UPLOAD_PROVIDER=s3
# S3_BUCKET=your-bucket-name
# S3_REGION=us-east-1
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
```

### 2. Install Dependencies

```bash
npm run install:all
```

This installs dependencies for the root, server, and client packages including the bundled FFmpeg/FFprobe binaries (`@ffmpeg-installer/ffmpeg`, `@ffprobe-installer/ffprobe`).

### 3. Initialize Prisma & Database

```bash
npm run prisma:generate --prefix server
npm run prisma:migrate --prefix server -- --name init
```

---

## Running the Application

### Local Development (Default Stub Mode — No Redis or FFmpeg Required)

```bash
npm run dev
```

Starts the Express API at `http://localhost:5000` and Vite frontend at `http://localhost:5173`.

### Production Queue Mode

1. **Start the API server**:
   ```bash
   WORKER_MODE=queue npm run dev --prefix server
   ```

2. **Start the primary video processing worker**:
   ```bash
   WORKER_MODE=queue npm run worker --prefix server
   ```

3. **Start the lecture segmentation worker** (120s chunking for GPT-4o Vision):
   ```bash
   npm run worker:segment --prefix server
   ```

---

## Project Structure

```
do_an/
├── client/                          # Vite + React frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── UploadPage.jsx       # 4-step upload: select → upload → check → AI review
│   │   │   ├── DashboardPage.jsx    # Class/semester management and observation library
│   │   │   └── ObservationPage.jsx  # Video player, Danielson timeline, COPUS & Bloom charts
│   │   ├── components/Layout.jsx
│   │   └── styles.css
│   └── vite.config.js
├── server/                          # Express REST API & BullMQ workers
│   ├── prisma/
│   │   └── schema.prisma            # MongoDB schemas: Teacher, Class, Video, Feedback, Analytics
│   ├── src/
│   │   ├── controllers/
│   │   │   └── videoController.js   # Upload, observation, streaming, class & semester CRUD
│   │   ├── queues/
│   │   │   └── videoQueue.js        # BullMQ queue definition
│   │   ├── storage/
│   │   │   └── storage.js           # Local & S3 storage drivers
│   │   └── workers/
│   │       ├── aiProcessor.js            # Deterministic Danielson/COPUS/Bloom stubs (replace with GPT-4o)
│   │       ├── videoWorker.js            # Primary BullMQ processing worker
│   │       └── lectureSegmentWorker.js   # ffprobe validation + 120s lossless segmentation
│   ├── test-segment.mjs             # Integration test for the segmentation pipeline
│   └── package.json
├── uploads/                         # Local media staging directory
├── .env.example
└── README.md
```

---

## REST API Reference

All classroom routes require the `account_dashboard_token` HttpOnly cookie set at login.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register a new instructor account |
| `POST` | `/api/auth/login` | Authenticate and issue JWT cookie |
| `GET` | `/api/teachers/:teacherId/dashboard` | Fetch classes, videos, metrics |
| `GET` | `/api/classes` | List all classes (optionally filter by `?semester=`) |
| `POST` | `/api/classes` | Create a new course section |
| `PUT` | `/api/classes/:id` | Update class details |
| `DELETE` | `/api/classes/:id` | Delete a class and its videos |
| `GET` | `/api/semesters` | List semesters |
| `POST` | `/api/semesters` | Create a semester |
| `DELETE` | `/api/semesters/:id` | Delete a semester and all its classes |
| `POST` | `/api/videos/upload` | Upload MP4 (`multipart/form-data`) with `classId` |
| `GET` | `/api/videos/:videoId/status` | Poll processing status (`PENDING` → `PROCESSING` → `COMPLETED` / `FAILED`) |
| `GET` | `/api/videos/:videoId/observation` | Retrieve timestamped feedback, COPUS timeline, Bloom distribution |
| `GET` | `/api/videos/:videoId/media` | Stream video or get signed S3 URL |

---

## Upload Page — 4-Step Pipeline

The upload page guides users through a fully visible pipeline before entering the observation studio:

| Step | Label | What Happens |
|------|-------|-------------|
| **01** | Choose Recording | Select MP4 video + optional slides, lesson plan, audio |
| **02** | Uploading | Real-time progress bar for file transfer |
| **03** | Check & Segment | Live status for `ffprobe` validation + 120s `-c copy` slicing |
| **04** | AI Review | Quality scores (1–5), content summary in Vietnamese, continuity notes, `Confirm & Proceed` |

---

## Segmentation Worker — Integration Test Results

Verified with `server/test-segment.mjs` on a **7-minute synthetic 1280×720 H.264+AAC** source:

| Test | Result |
|------|--------|
| Synthetic MP4 generated via `testsrc2` + `sine` lavfi sources | ✔ |
| `ffprobe` reads format metadata, duration (420.0s), `h264`, `aac` | ✔ |
| `ffprobe` throws correctly on missing/corrupted file | ✔ |
| `-c copy` segmentation produces exactly **4 segments** | ✔ |
| `segment_001–003`: each exactly **120.0s**, ~73 MB | ✔ |
| `segment_004`: **60.0s** (last/partial remainder) | ✔ |
| Naming convention: `segment_001.mp4` → `segment_004.mp4` | ✔ |
| All temp files cleaned up after test | ✔ |

**19/19 tests passed.**

Run the test yourself:

```bash
node server/test-segment.mjs
```

---

## AI Video Chunk Review JSON Contract

Each 2-minute segment is evaluated by the review agent and returns:

```json
{
  "status": "success",
  "chunk_id": "segment_001",
  "content_review": {
    "main_topic": "Khởi động tiết học & Đặt vấn đề bài học",
    "summary": "Giảng viên mở đầu bài giảng bằng việc tóm lược kiến thức buổi trước...",
    "key_points": [
      "Giảng viên kích hoạt kiến thức nền tảng qua câu hỏi gợi mở.",
      "Xác định rõ ràng mục tiêu đầu ra của tiết học."
    ],
    "important_visuals": [
      "Slide trình chiếu tiêu đề bài học và câu hỏi thảo luận.",
      "Sơ đồ phân loại khái niệm trên bảng phụ."
    ],
    "continuity_notes": "Phân đoạn mở đầu (00:00–02:00). Dẫn nhập mạch lạc vào phần trọng tâm phân đoạn 2."
  },
  "quality_scores": {
    "audio_quality": 5,
    "video_quality": 5,
    "content_clarity": 4,
    "processing_confidence": 5
  },
  "issues_detected": [],
  "recommendation": "continue",
  "error_message": null
}
```

---

## Security & Production Checklist

- Bcrypt hashing for passwords and security-answer recovery keys.
- 7-day HttpOnly JWT cookie — never exposed to JavaScript.
- MP4-only upload filter with MIME type and extension validation.
- Before deploying to production:
  - Rotate all credentials and JWT secret.
  - Deploy behind HTTPS with a reverse proxy (Nginx / Caddy).
  - Enable Redis persistence and configure a production Redis cluster.
  - Switch to private S3 storage with short-lived presigned URLs.
  - Add rate limiting, CSRF protection, and input sanitisation middleware.
