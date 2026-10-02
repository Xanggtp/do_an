# ClassMind Classroom Observation Platform

Full-stack classroom observation application with React, Express, Prisma/MongoDB, local or S3 video storage, and BullMQ-based processing.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- A MongoDB database, such as MongoDB Atlas
- Redis 6 or newer when using `WORKER_MODE=queue`

## Setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` to your MongoDB connection string and `JWT_SECRET` to a long random value.
3. Install dependencies:

```bash
npm run install:all
```

4. Generate Prisma and apply the development migration:

```bash
npm run prisma:generate --prefix server
npm run prisma:migrate --prefix server -- --name init
```

The default local setup uses `UPLOAD_PROVIDER=local` and `WORKER_MODE=stub`. It does not require Redis, S3, FFmpeg, or an OpenAI key.

## Run locally

Start the API and Vite frontend together:

```bash
npm run dev
```

The frontend runs at `http://localhost:5173` and the API runs at `http://localhost:5000`.

For BullMQ processing, run Redis and use two server processes:

```bash
WORKER_MODE=queue npm run dev --prefix server
WORKER_MODE=queue npm run worker --prefix server
```

## API

Classroom routes require the existing `account_dashboard_token` HttpOnly cookie:

- `GET /api/teachers/:teacherId/dashboard`
- `POST /api/classes`
- `POST /api/videos/upload` with multipart field `video` and `classId`
- `POST /api/videos` upload alias
- `GET /api/videos/:videoId/status`
- `GET /api/videos/:videoId/observation`
- `GET /api/videos/:videoId/media`

Uploads are created as `PENDING`, dispatched as `PROCESSING`, and finish as `COMPLETED` or `FAILED`. The current worker contains deterministic Whisper/LLM stubs that persist timestamped Danielson feedback, COPUS activity, and Bloom distribution data.

## Production processing

Set `WORKER_MODE=queue`, configure `REDIS_URL`, and run the worker separately. Replace the stub boundaries in `server/src/workers/aiProcessor.js` with FFmpeg extraction, OpenAI Whisper transcription, and GPT-4o structured analysis. Use private S3 storage with short-lived signed URLs for production media.

## Authentication and security

Authentication uses bcrypt password/security-answer hashes and a seven-day JWT in an HttpOnly cookie. Password hashes are never returned. Before production use, rotate exposed database credentials, replace the development JWT secret, deploy behind HTTPS, add rate limiting and CSRF protection, and configure a private S3 bucket.
