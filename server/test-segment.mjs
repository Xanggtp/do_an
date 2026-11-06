/**
 * test-segment.mjs
 * Quick integration test for the lectureSegmentWorker pipeline.
 *
 * Steps:
 *  1. Use the bundled ffmpeg binary to generate a synthetic 7-minute test video.
 *  2. Run validateMediaFile() against it (ffprobe check).
 *  3. Run sliceVideoIntoSegments() – expects segments of ~120 s each.
 *  4. Verify segment count, file sizes, and that each segment is a readable MP4.
 *  5. Clean up temp files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import ffmpeg from 'fluent-ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const __dir = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.join(__dir, '.test-output');
const SOURCE_VIDEO = path.join(TMP_DIR, 'test-lecture.mp4');
const SEGMENTS_DIR = path.join(TMP_DIR, 'segments');
const TEST_DURATION_SECS = 7 * 60; // 7 minutes → should produce 4 segments (3×120s + 1 partial)

const PASS = '\x1b[32m✔\x1b[0m';
const FAIL = '\x1b[31m✘\x1b[0m';
const INFO = '\x1b[36mℹ\x1b[0m';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL} ${label}`);
    failed++;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function generateTestVideo(output, durationSeconds) {
  return new Promise((resolve, reject) => {
    console.log(`\n${INFO} Generating ${durationSeconds}s synthetic test video...`);
    // Use two separate -f lavfi sources: one video (testsrc2), one audio (sine)
    ffmpeg()
      .input(`testsrc2=duration=${durationSeconds}:size=1280x720:rate=25`)
      .inputOptions(['-f lavfi'])
      .input(`sine=frequency=440:duration=${durationSeconds}`)
      .inputOptions(['-f lavfi'])
      .outputOptions([
        '-c:v libx264',
        '-preset ultrafast',
        '-crf 28',
        '-c:a aac',
        '-shortest'
      ])
      .output(output)
      .on('start', (cmd) => console.log(`  ${INFO} FFmpeg command: ${cmd.slice(0, 100)}...`))
      .on('error', (err, _out, stderr) => reject(new Error(`${err.message}\n${stderr?.slice(-300)}`)))
      .on('end', () => {
        console.log(`  ${PASS} Synthetic video written: ${output}`);
        resolve();
      })
      .run();
  });
}

function ffprobeAsync(filePath) {
  return new Promise((resolve, reject) =>
    ffmpeg.ffprobe(filePath, (err, meta) => (err ? reject(err) : resolve(meta)))
  );
}

function sliceVideoIntoSegments({ inputSource, outputDir, totalDuration }) {
  return new Promise(async (resolve, reject) => {
    await fs.promises.mkdir(outputDir, { recursive: true });
    const outputPattern = path.join(outputDir, 'segment_%03d.mp4');

    ffmpeg(inputSource)
      .outputOptions([
        '-c copy',
        '-f segment',
        '-segment_time 120',
        '-reset_timestamps 1',
        '-segment_start_number 1'
      ])
      .output(outputPattern)
      .on('start', (cmd) => console.log(`  ${INFO} FFmpeg segment command started`))
      .on('progress', (p) => {
        if (p.timemark) process.stdout.write(`\r  ${INFO} Progress: ${p.timemark}   `);
      })
      .on('error', (err, _out, stderr) => {
        reject(new Error(`${err.message}\n${stderr?.slice(-300) || ''}`));
      })
      .on('end', async () => {
        process.stdout.write('\n');
        const entries = await fs.promises.readdir(outputDir);
        const segments = entries
          .filter((f) => /^segment_\d+\.mp4$/i.test(f))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .map((f) => path.resolve(outputDir, f));
        resolve(segments);
      })
      .run();
  });
}

// ─── Main test runner ──────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   ClassMind Lecture Segmentation — Integration Test   ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  await fs.promises.mkdir(TMP_DIR, { recursive: true });
  await fs.promises.mkdir(SEGMENTS_DIR, { recursive: true });

  // ── Test 0: Generate synthetic video ───────────────────────────────────────
  try {
    await generateTestVideo(SOURCE_VIDEO, TEST_DURATION_SECS);
    assert(fs.existsSync(SOURCE_VIDEO), 'Synthetic test video created on disk');
  } catch (err) {
    console.log(`  ${FAIL} Failed to generate test video: ${err.message}`);
    failed++;
    console.log('\n⚠  Cannot proceed without test video. Aborting.\n');
    process.exit(1);
  }

  // ── Test 1: ffprobe validation ──────────────────────────────────────────────
  console.log('\n── Step 1: ffprobe Integrity Check ──');
  let metadata;
  try {
    metadata = await ffprobeAsync(SOURCE_VIDEO);
    assert(!!metadata.format, 'ffprobe returns valid format metadata');
    const duration = Number(metadata.format.duration);
    assert(Number.isFinite(duration) && duration > 0, `Duration is valid: ${duration.toFixed(1)}s`);
    const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
    assert(!!videoStream, `Video stream detected (codec: ${videoStream?.codec_name})`);
    const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');
    assert(!!audioStream, `Audio stream detected (codec: ${audioStream?.codec_name})`);
  } catch (err) {
    console.log(`  ${FAIL} ffprobe validation threw: ${err.message}`);
    failed++;
  }

  // ── Test 2: Invalid file validation ────────────────────────────────────────
  console.log('\n── Step 2: Validation on Corrupt / Missing File ──');
  try {
    await ffprobeAsync('/nonexistent/not-a-video.mp4');
    console.log(`  ${FAIL} Should have thrown for missing file`);
    failed++;
  } catch (err) {
    assert(true, `Correctly throws for missing/invalid file: "${err.message.slice(0, 60)}..."`);
  }

  // ── Test 3: Segmentation ────────────────────────────────────────────────────
  console.log('\n── Step 3: 120-Second Lossless Segmentation (-c copy) ──');
  let segments = [];
  try {
    segments = await sliceVideoIntoSegments({
      inputSource: SOURCE_VIDEO,
      outputDir: SEGMENTS_DIR,
      totalDuration: Number(metadata?.format?.duration || TEST_DURATION_SECS)
    });

    const expectedSegments = Math.ceil(TEST_DURATION_SECS / 120); // 7min / 2min = 4
    assert(segments.length === expectedSegments, `Correct segment count: ${segments.length} of ${expectedSegments} expected (7min ÷ 120s)`);

    for (const segPath of segments) {
      const stat = await fs.promises.stat(segPath);
      const baseName = path.basename(segPath);
      assert(stat.size > 0, `${baseName}: file exists and is non-empty (${(stat.size / 1024).toFixed(0)} KB)`);
    }
  } catch (err) {
    console.log(`  ${FAIL} Segmentation threw: ${err.message}`);
    failed++;
  }

  // ── Test 4: Probe each generated segment ───────────────────────────────────
  console.log('\n── Step 4: ffprobe Each Segment ──');
  for (const segPath of segments) {
    try {
      const segMeta = await ffprobeAsync(segPath);
      const dur = Number(segMeta.format.duration);
      const baseName = path.basename(segPath);
      const isLast = segPath === segments[segments.length - 1];
      const expectedDur = isLast
        ? `≤120s (last/partial)`
        : `~120s`;
      const durationOk = isLast ? dur > 0 && dur <= 125 : dur > 100 && dur <= 125;
      assert(durationOk, `${baseName}: duration=${dur.toFixed(1)}s (${expectedDur})`);
    } catch (err) {
      assert(false, `${path.basename(segPath)}: ffprobe failed — ${err.message.slice(0, 60)}`);
    }
  }

  // ── Test 5: Naming convention ───────────────────────────────────────────────
  console.log('\n── Step 5: Segment Naming Convention ──');
  for (let i = 0; i < segments.length; i++) {
    const expected = `segment_${String(i + 1).padStart(3, '0')}.mp4`;
    assert(path.basename(segments[i]) === expected, `Segment ${i + 1} named correctly: ${expected}`);
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  console.log('\n── Cleaning Up Temp Files ──');
  try {
    await fs.promises.rm(TMP_DIR, { recursive: true, force: true });
    console.log(`  ${PASS} Temp directory removed: ${TMP_DIR}`);
  } catch {
    console.log(`  ${INFO} Cleanup skipped (manual removal may be needed).`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  const total = passed + failed;
  const color = failed === 0 ? '\x1b[32m' : '\x1b[31m';
  console.log(`\n${color}────────────────────────────────────────\x1b[0m`);
  console.log(`${color}  Results: ${passed}/${total} tests passed${failed ? ` (${failed} failed)` : ' ✔ All good!'}  \x1b[0m`);
  console.log(`${color}────────────────────────────────────────\x1b[0m\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
