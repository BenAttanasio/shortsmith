#!/usr/bin/env node
/**
 * Speech timing extraction — where the voice actually is inside a narration WAV.
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 * `layoutWords()` used to spread the caption across the whole composition, frame 0 to the
 * end, and distribute words by character length. Both halves of that are wrong:
 *
 *   1. **Gemini leaves leading silence.** Measured across the eighteen reels: 0.12 to
 *      0.33 seconds, median 0.24. At 30fps that is seven frames, so the very first word
 *      lit up seven frames before the voice said it, and every word after inherited the
 *      offset. This is the "captions highlight ahead of the voice" bug.
 *   2. **The speech does not fill the file.** `ContextEngineering` talks for 17.9s of a
 *      23.0s clip. Spreading the caption over 23.0s makes it drift progressively *behind*
 *      in the back half, so the error changes sign partway through and neither end lines up.
 *
 * Character-length weighting is also only a rough proxy for how long a word takes to say,
 * and the error compounds across a 70-word script. It cannot be fixed by weighting alone
 * because the real variance is in the *pauses*, not the words.
 *
 * So: detect where the voice is, and anchor each sentence to a real pause rather than to
 * an arithmetic guess. Within a sentence the old weighting is fine, because a sentence is
 * short enough that a few percent of drift is invisible.
 *
 * Gemini TTS returns no forced-alignment data, so silence detection is the best signal
 * available without adding a speech-recognition dependency.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Silence floor. The mastered narration has a noise floor around -80 dB, so -45 dB is far
 * enough above it to be a real gap and far enough below speech to not clip a soft
 * consonant. `d` is the shortest gap worth reporting: 100ms is roughly the shortest pause
 * a speaker puts between sentences, and anything briefer is a stop consonant.
 */
const NOISE_DB = -45;
const MIN_GAP = 0.10;

/**
 * Returns `{ start, end, pauses }` in seconds.
 *
 * `start`/`end` bound the actual voice. `pauses` are the midpoints of internal gaps,
 * longest first — these are the candidate sentence boundaries.
 */
export const detectSpeech = async (wavPath) => {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-i', wavPath,
    '-af', `silencedetect=noise=${NOISE_DB}dB:d=${MIN_GAP}`, '-f', 'null', '-'])
    .catch((e) => ({ stderr: e.stderr ?? '' }));

  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration', '-of', 'csv=p=0', wavPath]);
  const duration = Number(stdout.trim());

  // silencedetect emits start/end pairs in order. A trailing silence has no end.
  const starts = [...stderr.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));

  const gaps = starts.map((s, i) => ({ start: s, end: ends[i] ?? duration }))
    .filter((g) => Number.isFinite(g.start) && g.end > g.start);

  // Leading silence is a gap that begins at (or within a frame of) zero.
  const lead = gaps.find((g) => g.start <= 0.05);
  const start = lead ? lead.end : 0;

  // Trailing silence is a gap that runs to the end of the file.
  const tail = gaps.find((g) => g.end >= duration - 0.02 && g.start > start);
  const end = tail ? tail.start : duration;

  const pauses = gaps
    .filter((g) => g.start > start && g.end < end)
    .map((g) => ({ at: (g.start + g.end) / 2, len: g.end - g.start }))
    .sort((a, b) => b.len - a.len);

  return {
    start: Number(start.toFixed(4)),
    end: Number(end.toFixed(4)),
    duration: Number(duration.toFixed(4)),
    pauses: pauses.map((p) => ({ at: Number(p.at.toFixed(4)), len: Number(p.len.toFixed(4)) })),
  };
};
