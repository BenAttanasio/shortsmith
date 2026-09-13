#!/usr/bin/env node
/**
 * Narration batch builder.
 *
 * Synthesizes every reel in content/reels.json and masters each one through the local
 * broadcast chain in `scripts/master.mjs`.
 *
 * ---------------------------------------------------------------------------
 * This used to go through Auphonic. It doesn't any more.
 * ---------------------------------------------------------------------------
 * Auphonic's Adaptive Leveler was flat-topping every clip on the channel — 8 to 144
 * samples per reel welded against the ceiling, crest factor down 1.7 dB. It is the right
 * tool for a human drifting off-mic and the wrong one for TTS, which has no drift to
 * correct. Full measurements in `scripts/master.mjs` and `scripts/master-lab.mjs`.
 *
 * That also deleted the join/split batching that used to live here. Clips were joined
 * into one long track with silent gaps, mastered as a single production, and cut back
 * apart purely to dodge Auphonic's 3-minute-minimum billing. Local mastering has no
 * per-production cost, so each clip is now mastered on its own — which is simpler, has no
 * split-boundary drift to police, and means one reel's loud tail can never influence the
 * next reel's level.
 *
 * ---------------------------------------------------------------------------
 * Incremental by default
 * ---------------------------------------------------------------------------
 * This script used to re-synthesize every reel unconditionally. Because Gemini TTS is
 * nondeterministic and `synthInBand` keeps the closest of up to four takes, that meant
 * **adding one reel changed every other reel's duration by tenths of a second** — which
 * shifts every t(fraction) beat and silently invalidates every verification frame you
 * ever approved.
 *
 * So a reel is skipped when its narration hash matches the manifest and its WAV still
 * exists. Skipped reels are excluded from the join, so a one-reel batch costs the
 * Auphonic 3-minute minimum (~0.05 credit-hours) rather than re-mastering everything.
 * At a daily cadence, either accept that or accumulate a week and master weekly.
 *
 * Usage:
 *   node scripts/build-reels.mjs              # only reels whose script changed
 *   node scripts/build-reels.mjs --only Tokens Embeddings
 *   node scripts/build-reels.mjs --force      # re-synthesize everything
 *   node scripts/build-reels.mjs --no-master  # synth only, copy raw takes through
 *   node scripts/build-reels.mjs --no-lint    # skip the pre-flight content check
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { synthesize, wavDuration, loadEnv } from './tts.mjs';
import { master, measure } from './master.mjs';
import { detectSpeech } from './speech.mjs';
import { lintFromDisk } from './lint-reels.mjs';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/audio/reels');
const WORK = path.join(ROOT, 'out/reel-audio');
const MANIFEST = path.join(ROOT, 'content/.audio-manifest.json');

const env = loadEnv();
const { reels } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/reels.json'), 'utf8'));
const argv = process.argv.slice(2);
const skipMaster = argv.includes('--no-master');
const force = argv.includes('--force');
const onlyIds = (() => {
  const i = argv.indexOf('--only');
  if (i === -1) return null;
  const ids = argv.slice(i + 1).filter((a) => !a.startsWith('-'));
  return ids.length ? new Set(ids) : null;
})();

const sha = (s) => crypto.createHash('sha1').update(s, 'utf8').digest('hex');

const readManifest = () => {
  try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); }
  catch { return { entries: {} }; }
};
const manifest = readManifest();

// ---- 0. pre-flight ----
//
// Before the first Gemini call, not after: a schema typo that only surfaces at render
// time will have already burned TTS quota and a full Auphonic production. Audio rules are
// off here because the WAVs this run is about to produce are exactly what they check for.
if (!process.argv.includes('--no-lint')) {
  const { findings, errors } = await lintFromDisk({ audio: false });
  for (const f of findings) {
    console[f.level === 'error' ? 'error' : 'warn'](
      `  ${f.level === 'error' ? 'ERROR' : 'warn '} ${f.code.padEnd(20)} ${String(f.id).padEnd(20)} ${f.msg}`,
    );
  }
  if (errors) {
    console.error(`\nlint-reels found ${errors} error(s). Nothing synthesized. (--no-lint overrides.)`);
    process.exit(1);
  }
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });

// ---- 1. synthesize, closing the loop on pace ----
//
// Gemini's delivered pace varies a lot by *script*, not just by directive: comma-heavy
// list sentences ("months, thousands of GPUs, enormous cost") drag, while short
// declaratives rush. Asking for one fixed wpm therefore misses the 150-165 band on both
// ends. So we ask, measure, and correct — scaling the requested wpm by how far the
// delivered take landed from the aim, and keeping the closest attempt.
const BAND = { lo: 150, hi: 165, aim: 157 };

/**
 * The delivery directive.
 *
 * The previous version asked for "a calm, confident tone... no salesy lilt, no rising
 * inflection at line ends" and got exactly that: every take measured a loudness range of
 * ~2.6 LU, against 5-12 LU for human speech. Dead flat. No compressor can put dynamics
 * back that were never performed, so the fix has to be here rather than in mastering.
 *
 * What changed is the addition of a positive instruction. "Not salesy" told Gemini what to
 * avoid without telling it what to do, and the safe reading of that is monotone. Asking it
 * to lean on the load-bearing words and throw away the connecting ones is what produces
 * loudness range — while the explicit bans keep it away from announcer delivery.
 */
const BASE_STYLE =
  'Read like a systems explainer walking one person through a diagram at a whiteboard: ' +
  'calm and confident, but not flat. Lean on the words that carry the argument and let the ' +
  'connecting words sit back, so the emphasis genuinely moves from phrase to phrase. ' +
  'Let the pitch fall at the end of a statement. Clear consonants. ' +
  'No salesy lilt, no rising inflection at line ends, no announcer energy.';

/**
 * Nothing in here may read as an instruction to hurry.
 *
 * An earlier version asked for a "brisk, efficient pace" and for pauses "no longer than a
 * natural breath", on top of a BASE_STYLE that said to "throw the connecting words away".
 * Three separate speed cues, and Gemini obliged: ten of eighteen takes came back out of
 * band, topping out at 195 wpm against a 165 ceiling. The requested number was being
 * drowned out by the adjectives around it.
 *
 * So the adjectives now pull the other way and the number carries the instruction.
 */
const styleFor = (wpm) =>
  `${BASE_STYLE} Speak at about ${Math.round(wpm)} words per minute, unhurried. ` +
  'Take a clear breath at every full stop, and do not rush the ends of sentences.';

/**
 * Timbre target, in Hz of spectral centroid.
 *
 * Every reel uses the same voice (Enceladus, per BRAND.md §4), but Gemini is
 * nondeterministic and takes of the *same* voice differ audibly in brightness. Measured
 * across the eighteen raw takes: centroid ran 2434 to 3394 Hz, a 39% spread, median 2885.
 * That is why some clips sound thinner than others on the channel.
 *
 * The take loop used to optimize for pace alone and take whatever timbre came with it, so
 * this variance was never selected against. Now both count. 2885 is the measured median
 * rather than a chosen ideal: it is the centre of what this voice actually does, so it is
 * reachable without burning extra takes.
 */
const TIMBRE = { aim: 2885, tolerance: 260 };

/** Mean spectral centroid of a take, as a brightness proxy. */
const centroidOf = async (wavBuffer) => {
  const tmp = path.join(WORK, '_take.wav');
  fs.writeFileSync(tmp, wavBuffer);
  const { stdout } = await run('ffmpeg', ['-hide_banner', '-i', tmp, '-af',
    'aspectralstats=measure=centroid,ametadata=mode=print:key=lavfi.aspectralstats.1.centroid:file=-',
    '-f', 'null', '-']).catch(() => ({ stdout: '' }));
  const vals = [...stdout.matchAll(/centroid=([\d.]+)/g)].map((m) => Number(m[1]));
  fs.rmSync(tmp, { force: true });
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : TIMBRE.aim;
};

/**
 * Ask, measure, and re-ask until a take lands in the pace band *and* near the channel's
 * timbre, keeping the best-scoring attempt.
 *
 * Both axes are normalized by their own tolerance before being summed, so a take that is
 * 8 wpm fast trades evenly against one that is 260 Hz bright. Pace still drives the
 * re-ask, because it is the only one of the two the style directive can steer.
 */
const synthInBand = async (text) => {
  const words = text.split(/\s+/).length;
  let request = 160;
  let best = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const { wav, sampleRate } = await synthesize({
      text,
      apiKey: env.GOOGLE_API_KEY,
      style: styleFor(request),
      onRetry: ({ status, waitMs }) =>
        console.warn(`    Gemini ${status}, retrying in ${waitMs / 1000}s`),
    });
    const dur = wavDuration(wav, sampleRate);
    const wpm = words / (dur / 60);
    const centroid = await centroidOf(wav);
    const paceOk = wpm >= BAND.lo && wpm <= BAND.hi;
    const timbreOk = Math.abs(centroid - TIMBRE.aim) <= TIMBRE.tolerance;

    // Pace outranks timbre, and not by a little. A 195 wpm take is hard to follow, which
    // defeats the entire point of the channel; a slightly bright take is a texture note
    // nobody consciously registers. The +10 makes any in-band take beat any out-of-band
    // one outright, so timbre only ever breaks ties among takes that are already
    // comprehensible. Weighing them evenly is what let a 191 wpm take win on tone.
    const score =
      (paceOk ? 0 : 10) +
      Math.abs(wpm - BAND.aim) / ((BAND.hi - BAND.lo) / 2) +
      (0.5 * Math.abs(centroid - TIMBRE.aim)) / TIMBRE.tolerance;
    const take = { wav, dur, wpm, centroid, score, request, attempt };
    if (!best || score < best.score) best = take;

    if (paceOk && timbreOk) return best;

    // Delivered slower than asked -> ask for more. Clamped: past ~260 it starts slurring.
    request = Math.max(100, Math.min(260, request * (BAND.aim / wpm)));
  }
  return best;
};

/** A reel needs re-synthesis when its script changed, its WAV vanished, or you said so. */
const needsSynth = (reel) => {
  if (force) return true;
  if (onlyIds) return onlyIds.has(reel.id);
  const entry = manifest.entries[reel.id];
  if (!entry || entry.sha !== sha(reel.narration)) return true;
  return !fs.existsSync(path.join(OUT, `${reel.id}.wav`));
};

const todo = reels.filter(needsSynth);
const skipped = reels.filter((r) => !todo.includes(r));

if (skipped.length) {
  console.log(`  skipping ${skipped.length} unchanged: ${skipped.map((r) => r.id).join(', ')}`);
}
if (!todo.length) {
  console.log('\nNothing to build — every narration matches the manifest. (--force to rebuild.)');
  process.exit(0);
}

/**
 * Record what was built so the next run can skip it.
 *
 * `speech` is where the voice actually starts and stops inside the mastered WAV, plus the
 * internal pauses. The captions read it to line up with the delivery instead of assuming
 * the narration fills the file — see `scripts/speech.mjs` and `layoutWords()`. It is
 * measured from the *mastered* file, since that is what Remotion plays.
 */
const commitManifest = async (built) => {
  for (const c of built) {
    const wav = path.join(OUT, `${c.id}.wav`);
    const entry = { sha: sha(c.narration), seconds: Number(c.dur.toFixed(3)) };
    if (fs.existsSync(wav)) entry.speech = await detectSpeech(wav);
    manifest.entries[c.id] = entry;
  }
  fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
};

// ---- 2. synthesize, master and commit — one reel at a time ----
//
// One reel end to end before starting the next, rather than synthesizing all of them and
// then mastering all of them.
//
// This is not a style preference. Gemini returned a 500 eleven reels into a full rebuild,
// the process died before the mastering stage, and because the manifest is only written
// after a clip is mastered, **all eleven takes were lost** — the next run re-synthesized
// from scratch. Committing per reel means a crash costs one take, and re-running skips
// everything already finished.
const clips = [];
const failed = [];
console.log('');
for (const reel of todo) {
  try {
    const raw = path.join(WORK, `${reel.id}-raw.wav`);
    const take = await synthInBand(reel.narration);
    fs.writeFileSync(raw, take.wav);
    const c = { ...reel, raw, dur: take.dur, wpm: take.wpm };
    const inBand = take.wpm >= BAND.lo && take.wpm <= BAND.hi;

    if (skipMaster) {
      fs.copyFileSync(raw, path.join(OUT, `${reel.id}.wav`));
    } else {
      // `master()` refuses to write a clip whose length drifted or whose true peak came
      // out above target, so a bad master fails the build rather than shipping quietly.
      const { before, after } = await master(raw, path.join(OUT, `${reel.id}.wav`));
      const fixed = before.truePeak > -0.5 ? ` was ${before.truePeak.toFixed(1)}` : '';
      console.log(
        `  ${reel.id.padEnd(20)} ${take.dur.toFixed(1).padStart(5)}s  ` +
        `${Math.round(take.wpm)} wpm ${inBand ? 'ok ' : '(!)'}  ${Math.round(take.centroid)}Hz  ` +
        `[${take.attempt} take${take.attempt > 1 ? 's' : ''}]  ` +
        `${after.lufs.toFixed(1)} LUFS  ${after.truePeak.toFixed(1)} dBTP${fixed}`,
      );
    }

    clips.push(c);
    await commitManifest([c]); // durable immediately, so a later crash cannot undo it
  } catch (e) {
    failed.push({ id: reel.id, why: String(e.message ?? e).split('\n')[0].slice(0, 160) });
    console.error(`  FAIL ${reel.id.padEnd(20)} ${String(e.message ?? e).split('\n')[0].slice(0, 120)}`);
  }
}

if (skipMaster) {
  console.log('\n--no-master: copied raw narration into public/audio/reels/');
  console.log('  NOTE: raw Gemini takes run 4-5 LU apart and some are already clipped');
  console.log('  above 0 dBTP. These will not match the rest of the channel.');
  process.exit(failed.length ? 1 : 0);
}

if (!clips.length) {
  console.error('\nNothing was built.');
  process.exit(1);
}

// Clip-to-clip consistency was the reason the old pipeline mastered the batch as one
// production. Per-clip mastering has to earn that back, so it gets checked rather than
// assumed — the Auphonic era shipped a 4.9 LU spread while claiming 2.1.
//
// Measured across every reel on disk, not just the ones built this run. A one-reel
// incremental build that only compared against itself would always report 0.0 LU and
// never notice that the reel it just made is 3 LU off the rest of the channel.
const levels = [];
for (const r of reels) {
  const wav = path.join(OUT, `${r.id}.wav`);
  if (!fs.existsSync(wav)) continue;
  const { lufs } = await measure(wav);
  levels.push({ id: r.id, lufs });
}
const lo = Math.min(...levels.map((l) => l.lufs));
const hi = Math.max(...levels.map((l) => l.lufs));
console.log(`\n  loudness spread across this batch: ${(hi - lo).toFixed(1)} LU (${lo.toFixed(1)} to ${hi.toFixed(1)})`);
if (hi - lo > 2.0) {
  const quietest = levels.find((l) => l.lufs === lo);
  console.warn(
    `  warn  spread exceeds 2 LU — ${quietest.id} will sound noticeably quieter than the rest.\n` +
    '        Usually a take with unusually high crest that hit the true-peak ceiling before\n' +
    '        the loudness target. Re-synthesizing it often fixes it.',
  );
}

// Already committed per reel above; nothing to flush here.
console.log(`\n✓ ${clips.length} mastered narration(s) in public/audio/reels/`);
console.log(`  manifest → ${path.relative(ROOT, MANIFEST)}`);
if (clips.length) {
  console.log('  Re-render these reels — their durations changed, so every beat moved:');
  console.log(`    node scripts/render-reels.mjs ${clips.map((c) => c.id).join(' ')}`);
}
if (failed.length) {
  console.error(`\n${failed.length} reel(s) failed and were NOT committed:`);
  for (const f of failed) console.error(`  ${f.id.padEnd(20)} ${f.why}`);
  console.error('Re-run the same command — finished reels are skipped, only these retry.');
  process.exit(1);
}
