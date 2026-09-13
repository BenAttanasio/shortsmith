#!/usr/bin/env node
/**
 * Local narration master — the "broadcast" chain, chosen 2026-08-23 from the six
 * candidates in `scripts/master-lab.mjs`.
 *
 * ---------------------------------------------------------------------------
 * Why this replaced Auphonic
 * ---------------------------------------------------------------------------
 * Auphonic's Adaptive Leveler is built for a human at a microphone drifting off-axis.
 * Gemini TTS has no drift to correct, so on this material the leveler only spent crest
 * factor. Measured on the shipped `Tokens.wav`: crest 13.2 dB -> 11.5 dB, flat factor
 * 0 -> 9.26, and **144 samples welded flat against the ceiling** where the raw take had
 * two. Every one of the eighteen shipped reels was flat-topped that way, 8 to 144 samples
 * each. That flat-topping is what "it clips in a way that's obviously AI" was.
 *
 * With the leveler switched off, what Auphonic still did was loudness normalization and
 * true-peak limiting — which is a two-pass `loudnorm`, locally, in about a second, for
 * free. It could not do the tonal work at all. So it went.
 *
 * Dropping it also deletes the join/split batching in `build-reels.mjs`, which existed
 * solely to dodge Auphonic's 3-minute-minimum billing. Clips are mastered one at a time
 * now because there is no longer a per-production cost to amortize.
 *
 * ---------------------------------------------------------------------------
 * The two defects this fixes, and the one it can't
 * ---------------------------------------------------------------------------
 *   FIXED  Gemini ships inter-sample-clipped audio. `Tokens-raw.wav` reads -1.0 dBFS
 *          sample peak but **+0.8 dBFS true peak** — the waveform passes above full scale
 *          between samples, and every lossy encoder downstream makes that audible. Four
 *          of eighteen raw takes were at or over 0 dBTP.
 *   FIXED  Clip-to-clip level. The shipped batch spanned -17.4 to -12.5 LUFS, a 4.9 LU
 *          jump between consecutive videos.
 *   NOT    Loudness range. Every take measures ~2.6 LU against 5-12 for human speech.
 *          No compressor can add dynamics that were never performed — that lives in the
 *          TTS style directive in `build-reels.mjs`, not here.
 *
 * Usage:
 *   node scripts/master.mjs --in out/reel-audio/Tokens-raw.wav --out public/audio/reels/Tokens.wav
 *
 * Also importable:  import { master, measure } from './master.mjs'
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const run = promisify(execFile);

/** Video-side rate. Also gives the nonlinear stages room above the source's 12 kHz wall. */
export const RATE = 48000;

/** -14 LUFS is what YouTube and Instagram normalize toward, so nothing is turned down. */
export const TARGET_LUFS = -14;

/**
 * -1.5 dBTP, not -1.0. The extra half-decibel is headroom for the lossy encode the
 * platforms apply after upload, which can push true peak back up by a few tenths.
 */
export const TARGET_TP = -1.5;

export class MasterError extends Error {}

// ---------------------------------------------------------------------------
// The chain
// ---------------------------------------------------------------------------

const RESAMPLE = `aresample=${RATE}:resampler=soxr:precision=28`;

/** Kills the tiny DC offset Gemini leaves (~0.0004) and anything below speech. */
const DCBLOCK = 'highpass=f=70:poles=2';

const DEESS = 'deesser=i=0.4:m=0.5:f=0.2:s=o';

/**
 * The 24 kHz source stops dead at ~11.5 kHz, and that hard edge is a recognisable
 * signature of synthetic speech. Rolling the top octave down from 10.5 kHz puts the cliff
 * inside an existing slope so there is no edge left to notice.
 *
 * The rolloff has to start *below* where the content stops or it does nothing — a first
 * attempt at 13 kHz was inaudible for exactly that reason.
 *
 * The alternative was an exciter synthesizing harmonics above the wall. Rejected: the
 * spectrogram showed it produces transient sparkle, not sustained air, because it cannot
 * invent a continuous top end from a source that has none.
 */
const WARM = 'treble=g=-3:f=8000:width_type=q:w=0.5,lowpass=f=10500:poles=2';

/**
 * 2:1 at -18 dB. The 15 ms attack is deliberate — it lets consonant transients through,
 * and a fast attack is precisely what makes a compressed voice read as "processed."
 * Roughly a third the aggression of the Auphonic leveler this replaced.
 */
const COMP = 'acompressor=threshold=-18dB:ratio=2:attack=15:release=180:knee=6:makeup=1.5';

/**
 * Sample-peak safety net. It should never engage — loudnorm's true-peak target sits
 * 0.6 dB below this ceiling. `level=false` matters: alimiter otherwise auto-normalizes
 * back up to full scale, undoing the loudness pass.
 */
const LIMIT = 'alimiter=limit=0.9:attack=5:release=50:level=false:latency=true';

/**
 * Force float internally so no intermediate stage can clip before the limiter has its say.
 *
 * Verified bit-identical to omitting it — ffmpeg already negotiates float between these
 * filters, so this changes nothing today and the shipped output is exactly the chain that
 * was auditioned. It is here to keep that true if a future stage is added that pushes
 * past full scale mid-chain.
 */
const FLOAT = 'aformat=sample_fmts=fltp';

const PRE = [FLOAT, RESAMPLE, DCBLOCK, DEESS, WARM, COMP];
const POST = [LIMIT];

/**
 * A note on what this chain does *not* control: crest factor, and therefore how loud a
 * given take can get.
 *
 * `acompressor` defaults to RMS detection, so it responds to sustained level and largely
 * ignores transients. That is why it sounds restrained rather than processed, and it is
 * the reason this chain was picked by ear over the alternatives. The cost is that it
 * cannot flatten an unusually peaky take: a take arriving with ~18 dB of crest still has
 * ~15 dB afterwards, and at a -1.5 dBTP ceiling that caps it around -16 LUFS rather than
 * the -14 target.
 *
 * Two fixes were tried and rejected. Normalizing level before the compressor so its
 * threshold means the same thing on every take changed the output by 0.0 dB — with RMS
 * detection the compressor was never the binding constraint. Peak detection, or hard
 * limiting before the loudness pass, would fix it by reintroducing exactly the
 * flat-topping this whole chain exists to remove.
 *
 * So the batch is allowed to vary slightly and `build-reels.mjs` reports the spread
 * instead. The real remedy for an outlier is to re-synthesize that take — raw crest
 * across a normal batch sits at 13-15 dB, and 18 is a bad roll, not a property of the
 * voice.
 */

// ---------------------------------------------------------------------------

/** Exact sample count at the output rate. 48000 is an integer multiple of Gemini's 24000. */
const sampleCount = async (file) => {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=duration', '-of', 'csv=p=0', file]);
  const secs = Number(stdout.trim());
  if (!Number.isFinite(secs)) throw new MasterError(`ffprobe could not read a duration from ${file}`);
  return Math.round(secs * RATE);
};

/**
 * Two-pass EBU R128 with `linear=true`.
 *
 * The two passes are the whole point. Single-pass loudnorm is a *dynamic* normalizer and
 * reshapes the envelope as it goes. Measuring first and then applying the single offset it
 * asks for is a static gain — the only way to set level without altering the performance.
 */
const loudnormFilter = async (input, pre, targetLufs, targetTp) => {
  const probe = [...pre, `loudnorm=I=${targetLufs}:TP=${targetTp}:LRA=11:print_format=json`].join(',');
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-i', input, '-af', probe, '-f', 'null', '-'])
    .catch((e) => ({ stderr: e.stderr ?? '' }));
  const open = stderr.lastIndexOf('{');
  const close = stderr.lastIndexOf('}');
  if (open === -1 || close === -1) {
    throw new MasterError(`loudnorm measurement pass produced no JSON for ${path.basename(input)}`);
  }
  const m = JSON.parse(stderr.slice(open, close + 1));
  return `loudnorm=I=${targetLufs}:TP=${targetTp}:LRA=11:linear=true`
    + `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}`
    + `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:print_format=summary`;
};

/** Integrated loudness, true peak, crest factor, flat-topping, rate and duration. */
export const measure = async (file) => {
  const { stderr } = await run('ffmpeg',
    ['-hide_banner', '-i', file, '-af', 'ebur128=peak=true,astats', '-f', 'null', '-'])
    .catch((e) => ({ stderr: e.stderr ?? '' }));
  const grab = (re) => {
    const m = stderr.match(re);
    return m ? Number(m[1]) : null;
  };
  const peak = grab(/Peak level dB:\s*(-?[\d.]+)/);
  const rms = grab(/RMS level dB:\s*(-?[\d.]+)/);
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration:stream=sample_rate', '-of', 'default=nw=1:nk=1', file]);
  const parts = stdout.trim().split('\n').map(Number);
  return {
    lufs: grab(/Integrated loudness:[\s\S]*?I:\s*(-?[\d.]+) LUFS/),
    truePeak: grab(/True peak:[\s\S]*?Peak:\s*(-?[\d.]+) dBFS/),
    lra: grab(/Loudness range:[\s\S]*?LRA:\s*(-?[\d.]+) LU/),
    crest: peak !== null && rms !== null ? peak - rms : null,
    pinned: grab(/Abs Peak count:\s*([\d.]+)/),
    sampleRate: parts[0],
    seconds: parts[1],
  };
};

/**
 * Master one narration WAV. Returns `{ outputPath, before, after }` measurements.
 *
 * Output length is guaranteed identical to the input to the sample. This is not a nicety:
 * `calculateMetadata` derives composition length from the narration, and every scene beat
 * is a fraction of it, so a chain that changed length would silently re-time the animation
 * and invalidate every verification frame already approved.
 */
export const master = async (inputPath, outputPath, {
  targetLufs = TARGET_LUFS,
  targetTp = TARGET_TP,
  onStatus,
} = {}) => {
  if (!fs.existsSync(inputPath)) throw new MasterError(`No such input file: ${inputPath}`);

  onStatus?.('measuring');
  const before = await measure(inputPath);
  const samples = await sampleCount(inputPath);
  const ln = await loudnormFilter(inputPath, PRE, targetLufs, targetTp);

  // Order after loudnorm is load-bearing. loudnorm upsamples to 192 kHz internally for
  // true-peak detection and *emits* at 192 kHz, so the resample back has to be explicit —
  // otherwise atrim counts its samples in 192 kHz units and cuts the clip to a quarter
  // length. (It did exactly that, once.)
  const af = [...PRE, ln, RESAMPLE, ...POST, `atrim=end_sample=${samples}`].join(',');

  onStatus?.('rendering');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await run('ffmpeg', ['-y', '-v', 'error', '-i', inputPath, '-af', af,
    '-ar', String(RATE), '-c:a', 'pcm_s16le', outputPath]);

  const after = await measure(outputPath);

  // Belt and braces on the thing that would be silent and expensive to discover later.
  const drift = Math.abs(after.seconds - before.seconds);
  if (drift > 0.002) {
    throw new MasterError(
      `${path.basename(outputPath)} drifted ${drift.toFixed(4)}s during mastering — `
      + 'every t(fraction) beat in the scene would move. Refusing to write a re-timed clip.',
    );
  }
  if (after.truePeak !== null && after.truePeak > -0.5) {
    throw new MasterError(
      `${path.basename(outputPath)} came out at ${after.truePeak.toFixed(1)} dBTP, above the `
      + `${targetTp} dBTP target — the limiter is not holding. Do not ship this.`,
    );
  }

  return { outputPath, before, after };
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const argv = process.argv.slice(2);
  const get = (flag, dflt) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : dflt;
  };
  const input = get('--in');
  const output = get('--out');
  if (!input || !output) {
    console.error('Usage: node scripts/master.mjs --in <wav> --out <wav> [--lufs -14] [--tp -1.5]');
    process.exit(1);
  }

  try {
    const { before, after } = await master(input, output, {
      targetLufs: Number(get('--lufs', TARGET_LUFS)),
      targetTp: Number(get('--tp', TARGET_TP)),
      onStatus: (s) => process.stdout.write(`  ${s}\r`),
    });
    const fmt = (m) => `${m.lufs?.toFixed(1)} LUFS  ${m.truePeak?.toFixed(1)} dBTP  `
      + `crest ${m.crest?.toFixed(1)} dB  pinned ${m.pinned}`;
    console.log(`  in   ${fmt(before)}`);
    console.log(`  out  ${fmt(after)}`);
    console.log(`✓ ${output}`);
  } catch (e) {
    console.error(`master: ${e.message}`);
    process.exit(1);
  }
}
