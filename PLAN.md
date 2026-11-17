# Kế hoạch nâng cấp ClassMind — 17/11/2026

> Đây là bản để đọc và duyệt **trước khi làm**. Chưa có thay đổi mã nguồn nào ngoài việc pull code mới.

---

## 0. Tình trạng Git

| Mục | Kết quả |
|---|---|
| Remote | `origin` → github.com/Xanggtp/do_an |
| Trước khi pull | `main` ở `5c68bb7` (commit bilingual UI của bạn), **chậm hơn 8 commit** |
| Đã pull | fast-forward lên `95e021e` — không có conflict, local không có commit chưa push |
| Nhánh `origin/fix/dashboard` | Đã được merge hết vào `main` (không còn commit riêng) → có thể xoá nhánh |
| Còn lại trong working tree | `bash.exe.stackdump` (file rác do Git Bash crash, chưa track) |

**8 commit mới (Xanggtp, 14/10 → 06/11):**

| Commit | Nội dung |
|---|---|
| `fa45f76` | Cập nhật Prisma schema (thêm model `Semester`, `classCode`, `semesterId`) |
| `385cdb0` | Trang quản lý lớp: thêm / sửa lớp |
| `b67da55`, `373c53a`, `38e41df` | Sửa dashboard (3 lần) |
| `e17fd36` | Thêm thanh tìm kiếm |
| `0991fd6` | Đổi UI trang quản lý lớp, modal xoá lớp / xoá học kỳ |
| `95e021e` | Worker cắt video 120s (`lectureSegmentWorker.js`), UI Upload 4 bước (check/review), script test `test-segment.mjs` |

Tổng: 18 file, +4610 / −192 dòng.

---

## 1. Đánh giá nhanh: phần nào thật, phần nào giả lập

| Chức năng | Backend | Frontend | Trạng thái |
|---|---|---|---|
| Đăng ký / đăng nhập / quên mật khẩu | ✅ thật | ✅ gọi API | Chạy được |
| Học kỳ & lớp (CRUD) | ✅ thật | ✅ gọi API (`ClassesPage`) | Chạy được |
| Dashboard | ✅ có endpoint | ⚠️ trộn API + `mockClasses`, `mockTeacher` | Nửa thật nửa giả |
| **Upload video** | ✅ có `POST /api/videos/upload` | ❌ **không gọi API** — thanh tiến trình là `setInterval`, 3 bước check là `setTimeout(900ms)`, kết quả AI review là object **viết cứng** | Giả lập hoàn toàn |
| **Trang Observation** | ✅ có `GET /videos/:id/observation` | ❌ chỉ đọc `mockObservations.js` | Giả lập |
| Phân tích AI (Danielson/COPUS/Bloom) | ❌ `aiProcessor.js` trả dữ liệu cứng, `duration` luôn = 900 | — | Stub |
| Cắt video 120s | ⚠️ Worker viết tốt, có test, nhưng **không có chỗ nào đẩy job vào queue** `lecture-segmentation` | — | Chưa nối vào luồng |
| Slides / giáo án / audio đính kèm | ❌ backend không nhận | UI cho chọn file | Chỉ có UI |

**Kết luận:** giao diện đã khá đầy đủ, nhưng luồng lõi của đề tài (upload → xử lý → AI → xem kết quả) **chưa nối end‑to‑end**. Đây nên là ưu tiên số 1.

---

## 2. Lỗi & rủi ro cần sửa (ưu tiên cao)

### 2.1 Luồng xử lý video
1. **`lectureSegmentWorker.js` không dùng ffmpeg đi kèm.** Chỉ `test-segment.mjs` gọi `ffmpeg.setFfmpegPath(ffmpegInstaller.path)`; worker thật chỉ đọc `FFMPEG_PATH` từ env → trên máy không cài ffmpeg sẽ lỗi, trái với README ("no manual install needed").
2. Worker cắt video kết nối Redis bằng `REDIS_HOST/REDIS_PORT`, trong khi phần còn lại dùng `REDIS_URL` (`config.redisUrl`) → cấu hình lệch nhau.
3. Worker nhận `filePath`, nhưng DB lưu `fileUrl` là **object key** (tương đối với `UPLOAD_DIRECTORY`, hoặc key S3) → cần hàm resolve key → đường dẫn / signed URL.
4. Kết quả segment chỉ là mảng path trả về từ job, **không lưu DB**, không dọn khi xoá video/lớp → rò rỉ dung lượng ổ đĩa.
5. `persistUpload` với S3 dùng `fs.readFile` → đọc **cả file 2 GB vào RAM**. Cần stream (`@aws-sdk/lib-storage` `Upload`). Với local nên `fs.rename` thay vì copy + xoá.

### 2.2 Dữ liệu / Prisma
6. `Class` vừa có `semester` (chuỗi) vừa có `semesterId` (quan hệ) → dữ liệu kép, dễ lệch khi đổi tên học kỳ.
7. `syncLegacySemesters` chạy **mỗi lần** `GET /api/semesters`, có vòng `for` với `updateMany` → nhiều truy vấn thừa. Nên chạy một lần dạng migration script rồi bỏ.
8. `deleteClass` / `deleteSemester`: không dùng transaction, nuốt lỗi bằng `.catch(() => {})`, code trùng lặp (logic parse object key lặp ở 3 chỗ). Xoá giữa chừng có thể để lại dữ liệu mồ côi.
9. README hướng dẫn `prisma migrate dev` — **MongoDB không hỗ trợ migrate**, phải dùng `prisma db push`.

### 2.3 Bảo mật
10. Không giới hạn tần suất (rate limit) cho `/login`, `/forgot-password/*` → có thể dò câu trả lời bảo mật / mật khẩu.
11. `forgot-password/question` trả 404 khi email không tồn tại → lộ email nào đã đăng ký.
12. Đổi / reset mật khẩu không vô hiệu hoá các JWT cũ (token sống 7 ngày). Gợi ý: thêm `tokenVersion` vào `User`.
13. Thiếu `helmet` (security headers).
14. `.gitignore` chưa có `uploads/`, `server/.test-output/`, `*.stackdump` → nguy cơ commit nhầm video.

### 2.4 Frontend
15. `lib/api.js` luôn ép `Content-Type: application/json` → **sẽ hỏng khi gửi `FormData`** lúc nối upload thật. Upload cần dùng `XMLHttpRequest` (hoặc axios) để có tiến trình thật.
16. Logic xoá lớp / học kỳ bị **copy y hệt** giữa `DashboardPage` và `ClassesPage`.
17. Chuỗi song ngữ viết thẳng trong component dạng `isVi ? '...' : '...'` (UploadPage) song song với hệ thống `t()` trong `PreferencesContext` (426 dòng) → nên gom về file `locales/vi.json`, `locales/en.json`.
18. `styles.css` 1130 dòng một file trong khi đã cài Tailwind → nên tách theo component hoặc chuyển dần sang Tailwind.

### 2.5 Vệ sinh dự án
19. Không có test tự động (chỉ `test-segment.mjs` chạy tay, chưa có trong `npm scripts`), không lint, không CI.
20. Tên package vẫn là `account-dashboard`; dependency vòng `"account-dashboard": "file:.."` trong client/server là thừa.
21. Xoá `bash.exe.stackdump`, xoá nhánh remote `fix/dashboard` đã merge.

---

## 3. Lộ trình đề xuất

### Giai đoạn 1 — Nối luồng end‑to‑end (ưu tiên cao nhất, ~1–1.5 tuần)
- [ ] Sửa `api.js` hỗ trợ `FormData`; tạo hàm `uploadWithProgress()` dùng XHR.
- [ ] `UploadPage` gọi `POST /api/videos/upload` thật, tiến trình thật.
- [ ] Gộp pipeline: sau upload → job 1 *validate + segment* → job 2 *phân tích AI* (BullMQ `FlowProducer` hoặc chain), dùng chung `REDIS_URL` và ffmpeg đi kèm.
- [ ] Mở rộng schema:
  - `Video`: `progress`, `stage` (`UPLOADED / VALIDATING / SEGMENTING / ANALYZING / COMPLETED / FAILED`), `resolution`, `videoCodec`, `sizeBytes`.
  - Model mới `VideoSegment { videoId, index, startSec, endSec, storageKey, review Json? }`.
- [ ] `duration` lấy từ ffprobe thật thay vì 900.
- [ ] Endpoint trạng thái + frontend polling (hoặc SSE) để hiển thị 3 bước check/review **thật**.
- [ ] `ObservationPage` đọc `GET /api/videos/:id/observation`; giữ mock làm fallback khi `WORKER_MODE=stub`.
- [ ] Dashboard bỏ `mockClasses` / `mockTeacher`, dùng `GET /teachers/:id/dashboard`.
- [ ] Xoá video/lớp/học kỳ dọn luôn segment trên ổ đĩa/S3.

### Giai đoạn 2 — AI thật (~1–2 tuần)
- [ ] Tách audio bằng ffmpeg → chuyển giọng nói thành văn bản có timestamp (Whisper hoặc tương đương; cân nhắc model hỗ trợ tiếng Việt tốt).
- [ ] Mỗi segment 120s: trích vài keyframe + transcript đoạn đó → gửi LLM đa phương thức với **structured output** (JSON schema) theo đúng format `aiReviewData` mà UI đang dùng.
- [ ] Tổng hợp toàn bài: feedback Danielson (có timestamp), dòng thời gian COPUS, phân bố Bloom.
- [ ] Đưa slides / giáo án vào ngữ cảnh prompt (so sánh "kế hoạch vs thực tế giảng dạy").
- [ ] Xử lý chi phí & lỗi: retry, timeout, giới hạn số segment, cache kết quả, biến env cho API key + model.
- [ ] Lưu `promptVersion` / `modelName` cùng kết quả để tái lập được khi viết báo cáo nghiên cứu.

### Giai đoạn 3 — Sửa lỗi, bảo mật, chất lượng code (làm xen kẽ, ~3–5 ngày)
- [ ] Mục 2.2 → 2.5 ở trên (transaction khi xoá, bỏ trường `semester` kép, rate limit, helmet, `tokenVersion`, `.gitignore`, README `db push`).
- [ ] Gom service dùng chung: `resolveObjectKey()`, `deleteVideoCascade()`, hook `useClassActions()` ở client.
- [ ] i18n: chuyển chuỗi sang file JSON.
- [ ] Test: Vitest + Supertest cho API (auth, class, upload), chuyển `test-segment.mjs` thành test thật; ESLint + Prettier; GitHub Actions chạy test mỗi PR.
- [ ] `docker-compose.yml` (MongoDB + Redis + server + worker) để thành viên nhóm chạy giống nhau.

### Giai đoạn 4 — Tính năng mới (chọn theo thời gian còn lại)
| Tính năng | Giá trị cho đề tài | Độ khó |
|---|---|---|
| Giảng viên ghi chú / phản hồi lại từng nhận xét AI (đồng ý / không đồng ý) | Thu dữ liệu đánh giá độ chính xác AI cho báo cáo | Thấp |
| Xuất báo cáo PDF cho một tiết học | Demo bảo vệ đồ án ấn tượng | Trung bình |
| Thống kê xu hướng qua nhiều tiết / cả học kỳ (biểu đồ tiến bộ theo tiêu chí Danielson) | Cao | Trung bình |
| Vai trò **Tổ trưởng / Người dự giờ**: xem & bình luận video của giảng viên khác | Đúng nghiệp vụ dự giờ thực tế | Trung bình–Cao |
| Tìm kiếm theo nội dung lời giảng (full‑text trên transcript) | Trung bình | Trung bình |
| Thông báo khi xử lý xong (email / in‑app) | Thấp | Thấp |
| Phụ đề song ngữ trên video player từ transcript | Trung bình | Thấp |
| So sánh 2 tiết học cạnh nhau | Trung bình | Trung bình |

---

## 4. Thứ tự làm đề xuất

1. Dọn dẹp nhỏ (5 phút): `.gitignore`, xoá stackdump, sửa README `db push`.
2. Giai đoạn 1 — vì đây là chỗ hệ thống đang "giả", ảnh hưởng mọi thứ phía sau.
3. Giai đoạn 3 phần bảo mật + transaction (làm song song khi đụng vào controller).
4. Giai đoạn 2 — AI thật.
5. Giai đoạn 4 — chọn 2–3 tính năng.

---

## 5. Quyết định đã chốt (17/11/2026)

| Câu hỏi | Lựa chọn | Ảnh hưởng tới kế hoạch |
|---|---|---|
| Nhà cung cấp AI | **Google Gemini** | Gemini nhận trực tiếp video/audio → **không cần Whisper riêng**: mỗi segment 120s gửi thẳng file video (qua Gemini File API) và yêu cầu trả JSON theo schema (transcript có timestamp + review + Danielson/COPUS/Bloom). Thêm env `GEMINI_API_KEY`, `GEMINI_MODEL`. Sửa README bỏ GPT-4o. |
| Lưu trữ | **Cả local và S3** | Giữ `UPLOAD_PROVIDER`. Bắt buộc sửa upload S3 sang stream (`@aws-sdk/lib-storage`). Segment cũng đi qua lớp `storage.js` (không ghi cứng `./uploads/segments`). |
| Redis | **Docker** | Thêm `docker-compose.yml` chạy Redis (và tuỳ chọn MongoDB **replica set** — Prisma + MongoDB cần replica set cho transaction; nhóm hiện dùng Atlas nên Mongo local chỉ là tuỳ chọn). |
| Bắt đầu từ | **Dọn dẹp + Giai đoạn 1** | Xem checklist chi tiết ở mục 6. |

---

## 6. Checklist chi tiết lượt làm đầu tiên

Làm trên nhánh mới `feat/e2e-pipeline`, mỗi bước một commit nhỏ để dễ review / tránh conflict với Xanggtp.

**Bước 0 — Dọn dẹp**
- [x] `.gitignore`: thêm `uploads/`, `server/uploads/`, `server/.test-output/`, `*.stackdump`; xoá `bash.exe.stackdump`.
- [x] README: `prisma migrate dev` → `prisma db push`; cập nhật phần AI sang Gemini.
- [x] `.env.example`: bỏ username Atlas thật, thêm `GEMINI_API_KEY`, `GEMINI_MODEL`, `SEGMENT_SECONDS=120`.
- [x] `docker-compose.yml` (Redis; Mongo replica set dạng profile tuỳ chọn) + script `npm run services:up`. ⚠️ Máy hiện tại chưa bật ảo hoá nên Docker chưa chạy được.

**Bước 1 — Backend pipeline**
- [x] `config/ffmpeg.js`: dùng ffmpeg/ffprobe đi kèm (`@ffmpeg-installer`), cho phép ghi đè bằng `FFMPEG_PATH`.
- [x] Prisma: `Video` thêm `stage`, `progress`, `sizeBytes`, `resolution`, `videoCodec`; model mới `VideoSegment`. Chạy `prisma db push`.
- [x] `storage.js`: hàm `resolveLocalPath(key)` (tải tạm từ S3 nếu cần), upload S3 dạng stream, `removePrefix()` để xoá segment.
- [x] Gộp `lectureSegmentWorker` vào pipeline chung: `validate → segment → analyze` cập nhật `stage/progress` vào DB; dùng `config.redisUrl`.
- [x] `aiProcessor.js`: interface `analyzeSegment()` / `summarizeLecture()`; bản Gemini thật + bản stub (khi `WORKER_MODE=stub` hoặc chưa có key).
- [x] `GET /videos/:id/status` trả `stage`, `progress`, danh sách segment + review.
- [x] Service `deleteVideoCascade()` dùng chung cho xoá lớp / học kỳ (có dọn segment).

**Bước 2 — Frontend**
- [x] `api.js` hỗ trợ `FormData`; `uploadWithProgress()` dùng XHR.
- [x] `UploadPage`: upload thật → polling `/status` → 3 bước check hiển thị theo `stage` thật → review card dùng dữ liệu segment_001 thật.
- [x] `ObservationPage`: đọc API thật, giữ mock làm fallback.
- [x] `DashboardPage`: bỏ `mockClasses` / `mockTeacher`.

**Bước 3 — Kiểm tra**
- [x] `npm run test:segment --prefix server` (19/19 đạt).
- [x] Test end‑to‑end qua API ở chế độ `inline` + stub AI (22/22 đạt: upload → ffprobe → 3 đoạn → review → observation → xử lý lại → xoá lớp dọn sạch file; file hỏng → FAILED, server không sập).
- [ ] Chưa test: chế độ `queue` (cần Redis/Docker), gọi Gemini thật (cần `GEMINI_API_KEY`), lưu trữ S3, giao diện trên trình duyệt.

**Cần bạn chuẩn bị:** `GEMINI_API_KEY` (Google AI Studio) điền vào file `.env` — chỉ cần khi tới phần gọi AI thật; trước đó dùng stub.
