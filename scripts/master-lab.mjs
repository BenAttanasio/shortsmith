#!/usr/bin/env node
/**
 * Mastering lab — renders one narration take through every candidate chain so a human
 * can A/B them in a real audio player and pick the house chain.
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 * Measured on `out/reel-audio/Tokens-raw.wav`, the Gemini take that ships today:
 *
 *   raw       -14.1 LUFS   true peak **+0.8 dBFS**   LRA 2.6 LU   crest 13.2 dB
 *   mastered  -12.6 LUFS   true peak  -0.6 dBFS      LRA 2.7 LU   crest 11.5 dB
 *                                                    flat factor 0 -> 9.3
 *                                                    peak count  2 -> 144
 *
 * Three separate defects, and none of them is "Auphonic is bad at its job":
 *
 *   1. **Gemini delivers already-clipped audio.** Sample peak is -1.0 dBFS but *true*
 *      peak is +0.8 dBFS — the waveform passes between samples. Four of eighteen takes
 *      are at or over 0 dBTP raw. Anything downstream is mastering a broken input.
 *   2. **Auphonic's adaptive leveler makes it worse here.** It is the right tool for a
 *      human at a microphone drifting off-axis. On TTS there is no drift to correct, so
 *      all it does is spend crest factor: 144 samples pinned flat against the ceiling
 *      where the raw had 2. That flat-topping is the audible "clipping."
 *   3. **The source is 24 kHz.** Everything above 12 kHz does not exist. Upsampling to
 *      44.1 cannot invent it. A brick wall at 12 kHz is the single most recognisable
 *      signature of synthetic speech, and no amount of EQ fixes it — only harmonic
 *      synthesis (an exciter) puts content up there.
 *
 * LRA 2.6 LU (human speech runs 5-12) is a fourth defect, but it is **not fixable in
 * post** — it is authored into `build-reels.mjs`'s style directive, which explicitly
 * asks for "no salesy lilt, no rising inflection at line ends." That belongs in the
 * prompt, not in a compressor.
 *
 * ---------------------------------------------------------------------------
 * Usage
 * ---------------------------------------------------------------------------
 *   node scripts/master-lab.mjs                      # Tokens, every chain
 *   node scripts/master-lab.mjs --clip AgentLoop     # a different take
 *   node scripts/master-lab.mjs --only A B C         # a subset
 *   node scripts/master-lab.mjs --no-auphonic        # skip chain E (spends credits)
 *
 * Output: out/master-lab/<clip>/ — flat WAVs plus MEASUREMENTS.md. Deliberately not an
 * HTML page: browser audio elements resample and re-encode, which is exactly the kind of
 * damage this test is trying to hear.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const RAWDIR = path.join(ROOT, 'out/reel-audio');
const SHIPPED = path.join(ROOT, 'public/audio/reels');

// 48 kHz because that is the video-side rate, and because every nonlinear stage below
// (exciter, limiter) needs headroom above the source's 12 kHz wall to put anything.
const RATE = 48000;

// -----------------------------------------------------------------------------
// The chains
// -----------------------------------------------------------------------------
//
// Written as an escalating ladder on purpose: each one is the previous plus one named
// intervention, so when a listener says "D is too much" the thing to remove is nameable.
// `pre` runs before the loudness pass, `post` after it. Loudness normalization is always
// two-pass linear — a single static gain, so it cannot alter dynamics or invent pumping.

const RESAMPLE = `aresample=${RATE}:resampler=soxr:precision=28`;
const DCBLOCK = 'highpass=f=70:poles=2';

// De-ess before exciting, never after: the exciter's whole job is to manufacture energy
// in the band sibilance already owns.
const DEESS = (i) => `deesser=i=${i}:m=0.5:f=0.2:s=o`;

// The 12 kHz-wall fix: synthesize harmonics from the top of the existing band upward.
//
// Tuned down hard from the first attempt. At amount=1.6/drive=6 the spectrogram showed
// the exciter writing *transient spikes* all the way to 24 kHz rather than continuous air
// — it distorts the >8 kHz band, and in this source that band is almost entirely
// sibilance and plosive transients, so the harmonics land as clicks. Gentle drive plus a
// hard ceiling gives a continuous sheen in 11.5-15 kHz instead of ticks.
const EXCITE = (amount, drive) =>
  `aexciter=level_in=1:level_out=1:amount=${amount}:drive=${drive}:blend=0:freq=9000:ceil=15000,`
  + 'lowpass=f=15500:poles=2,lowpass=f=15500:poles=2';

// Slow-ish attack (15 ms) deliberately lets consonant transients through — a fast attack
// is what makes a compressed voice read as "processed."
const COMP = 'acompressor=threshold=-18dB:ratio=2:attack=15:release=180:knee=6:makeup=1.5';

// Sample-peak safety net only. It should never engage; loudnorm's TP target is 0.5 dB
// below it. `level=false` matters — alimiter auto-normalizes to full scale otherwise.
const LIMIT = 'alimiter=limit=0.9:attack=5:release=50:level=false:latency=true';

// The other way to treat the 12 kHz wall, and probably the better one: stop fighting it.
//
// A cliff is conspicuous because it is a cliff. Rolling the top octave down gently from
// 9 kHz means there is no longer an abrupt edge to notice — the ear reads the result as a
// warm, close-mic'd voice rather than as band-limited codec output. Costs nothing, adds no
// artifacts, and unlike the exciter it does not depend on there being anything up there.
// The rolloff has to start *below* where the content stops, or it does nothing. A first
// attempt with a 13 kHz lowpass was inaudible for exactly that reason — the source already
// ends at 11.5 kHz. Rolling from 10.5 kHz means the cliff sits inside an existing slope.
const WARM = 'treble=g=-3:f=8000:width_type=q:w=0.5,lowpass=f=10500:poles=2';

const CHAINS = {
  A: {
    name: 'transparent',
    blurb: 'Fix only what is objectively broken: resample properly, and set level with a '
      + 'single static gain that respects true peak. No compression, no EQ, no leveler. '
      + 'The raw crest factor survives intact. This is the honest baseline — if it already '
      + 'sounds fine, everything below is decoration.',
    fixes: ['inter-sample clipping', 'level'],
    pre: [RESAMPLE, DCBLOCK],
    post: [],
    lufs: -14,
    tp: -1.5,
  },
  B: {
    name: 'warm',
    blurb: 'A, plus de-essing and a gentle rolloff of the top octave so the 11.5 kHz cliff '
      + 'stops reading as a cliff. Nothing is synthesized. The voice gets darker and closer '
      + 'and stops sounding like something that came out of a codec.',
    fixes: ['inter-sample clipping', 'level', 'the audible 11.5 kHz cliff', 'sibilance'],
    pre: [RESAMPLE, DCBLOCK, DEESS(0.4), WARM],
    post: [],
    lufs: -14,
    tp: -1.5,
  },
  C: {
    name: 'air',
    blurb: 'A, plus de-essing and a harmonic exciter writing new content from 9 kHz up to a '
      + 'hard 15.5 kHz ceiling — the opposite bet from B. **Be sceptical of this one.** The '
      + 'spectrogram shows it produces transient sparkle, not sustained air: it cannot '
      + 'invent a continuous top end from a source that has none, so between consonants the '
      + 'band above 11.5 kHz is still empty. Included because it is a genuinely different '
      + 'flavour and some ears prefer it, not because it is the principled answer.',
    fixes: ['inter-sample clipping', 'level', 'sibilance', 'partial top-end fill'],
    pre: [RESAMPLE, DCBLOCK, DEESS(0.4), EXCITE(1.1, 3), 'treble=g=1.5:f=9000:width_type=q:w=0.7'],
    post: [],
    lufs: -14,
    tp: -1.5,
  },
  D: {
    name: 'broadcast',
    blurb: "B, plus restrained dynamics — 2:1 at -18 dB with a 15 ms attack, and a limiter "
      + 'held in reserve. The conventional podcast-voice polish, but at a fraction of the '
      + "aggression of what Auphonic's leveler is doing today.",
    fixes: ['inter-sample clipping', 'level', 'the audible 11.5 kHz cliff', 'sibilance', 'consistency'],
    pre: [RESAMPLE, DCBLOCK, DEESS(0.4), WARM, COMP],
    post: [LIMIT],
    lufs: -14,
    tp: -1.5,
  },
  E: {
    name: 'room',
    blurb: 'D, plus a space. A small low-mid lift around 220 Hz for chest, and three early '
      + 'reflections at 17/29/41 ms mixed about 26 dB down. Targets the last tell: a voice '
      + 'with no room around it has never existed anywhere. Subtle by design — if you can '
      + 'hear it as reverb, it is too much and the decays come down.',
    fixes: ['inter-sample clipping', 'level', 'the audible 11.5 kHz cliff', 'sibilance', 'consistency', 'anechoic void'],
    pre: [
      RESAMPLE,
      DCBLOCK,
      DEESS(0.4),
      WARM,
      'equalizer=f=220:width_type=q:w=1.0:g=1.5',
      COMP,
      'aecho=1:1:17|29|41:0.05|0.035|0.02',
    ],
    post: [LIMIT],
    lufs: -14,
    tp: -1.5,
  },
  // Not a candidate — a reference, to settle the "are we using Auphonic?" question with a
  // measurement instead of an opinion. Auphonic given its best shot on this material: 3 dB
  // of headroom padded in first so it is not handed a clipped input, and the adaptive
  // leveler (the thing causing the flat-topping) switched off. With the leveler off, what
  // remains is loudness normalization and true-peak limiting — which is chain A, except it
  // costs 0.05 credit-hours, a network round trip, and cannot do B/C/D/E's tonal work.
  Z: {
    name: 'reference-auphonic-no-leveler',
    blurb: 'Auphonic with the leveler off and a padded input. Not a candidate — this is here '
      + 'to show what the service contributes once the harmful setting is disabled, which is '
      + 'the same thing chain A does locally and for free.',
    fixes: ['inter-sample clipping', 'level'],
    auphonic: { targetLufs: -14, maxPeak: -1.5, leveler: false, padDb: -3 },
  },
};

// -----------------------------------------------------------------------------
// Measurement
// -----------------------------------------------------------------------------

/** Integrated loudness, true peak, LRA, crest factor, flat-topping and duration. */
const measure = async (file) => {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-i', file, '-af', 'ebur128=peak=true,astats', '-f', 'null', '-'])
    .catch((e) => ({ stderr: e.stderr ?? '' }));
  const grab = (re) => {
    const m = stderr.match(re);
    return m ? Number(m[1]) : null;
  };
  const peakDb = grab(/Peak level dB:\s*(-?[\d.]+)/);
  const rmsDb = grab(/RMS level dB:\s*(-?[\d.]+)/);
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries',
    'format=duration:stream=sample_rate', '-of', 'default=nw=1:nk=1', file]);
  const [rate, dur] = stdout.trim().split('\n');
  return {
    lufs: grab(/Integrated loudness:[\s\S]*?I:\s*(-?[\d.]+) LUFS/),
    tp: grab(/True peak:[\s\S]*?Peak:\s*(-?[\d.]+) dBFS/),
    lra: grab(/Loudness range:[\s\S]*?LRA:\s*(-?[\d.]+) LU/),
    crest: peakDb !== null && rmsDb !== null ? peakDb - rmsDb : null,
    flat: grab(/Flat factor:\s*([\d.]+)/),
    pinned: grab(/Abs Peak count:\s*([\d.]+)/),
    rate: Number(rate),
    seconds: Number(dur),
  };
};

/**
 * Two-pass EBU R128 with `linear=true`.
 *
 * Two passes matter: single-pass loudnorm is a *dynamic* normalizer and will reshape the
 * envelope. Measuring first and then applying the offset it asks for is a static gain,
 * which is the only way to change level without changing the performance.
 */
const loudnormTwoPass = async (input, chainPre, lufs, tp) => {
  const measurePass = [...chainPre, `loudnorm=I=${lufs}:TP=${tp}:LRA=11:print_format=json`].join(',');
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-i', input, '-af', measurePass, '-f', 'null', '-'])
    .catch((e) => ({ stderr: e.stderr ?? '' }));
  const json = stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1);
  const m = JSON.parse(json);
  return `loudnorm=I=${lufs}:TP=${tp}:LRA=11:linear=true:measured_I=${m.input_i}`
    + `:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}`
    + `:offset=${m.target_offset}:print_format=summary`;
};

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const clip = flag('--clip', 'Tokens');
const onlyKeys = (() => {
  const i = argv.indexOf('--only');
  if (i === -1) return null;
  const k = argv.slice(i + 1).filter((a) => !a.startsWith('-'));
  return k.length ? new Set(k.map((s) => s.toUpperCase())) : null;
})();
const noAuphonic = argv.includes('--no-auphonic');

const raw = path.join(RAWDIR, `${clip}-raw.wav`);
const shipped = path.join(SHIPPED, `${clip}.wav`);
if (!fs.existsSync(raw)) {
  console.error(`No raw take at ${path.relative(ROOT, raw)}. Available:`);
  for (const f of fs.readdirSync(RAWDIR).filter((f) => f.endsWith('-raw.wav'))) {
    console.error(`  ${f.replace('-raw.wav', '')}`);
  }
  process.exit(1);
}

// Exact output sample count, so every chain lands on the same length as the source
// regardless of what it does internally. 48000 is an integer multiple of Gemini's 24000,
// so this is exact rather than rounded.
const srcSamples = await (async () => {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=duration', '-of', 'csv=p=0', raw]);
  return Math.round(Number(stdout.trim()) * RATE);
})();

const OUTDIR = path.join(ROOT, 'out/master-lab', clip);
// Only a full run clears the folder. `--only` is for re-rendering one chain after a tweak,
// and wiping the others would mean re-spending Auphonic credits to get chain E back.
if (!onlyKeys) fs.rmSync(OUTDIR, { recursive: true, force: true });
fs.mkdirSync(OUTDIR, { recursive: true });

const results = [];

// References first, so the folder sorts with the two things you are judging against on top.
const refRaw = path.join(OUTDIR, '00-reference-RAW-gemini.wav');
fs.copyFileSync(raw, refRaw);
results.push({ key: '—', name: 'RAW (untouched Gemini)', file: path.basename(refRaw), m: await measure(refRaw) });

if (fs.existsSync(shipped)) {
  const refNow = path.join(OUTDIR, '01-reference-SHIPPING-TODAY.wav');
  fs.copyFileSync(shipped, refNow);
  // Label deliberately generic: this row is whatever is in public/audio/reels right now.
  // It was Auphonic-with-leveler-40 when this script was written; since 2026-08-23 it is
  // the local broadcast chain (master.mjs), i.e. chain D. Hardcoding the old name made the
  // table assert a provenance that had stopped being true.
  results.push({ key: '—', name: 'what ships today', file: path.basename(refNow), m: await measure(refNow) });
}

console.log(`\nmaster-lab — ${clip}\n`);

for (const [key, chain] of Object.entries(CHAINS)) {
  if (onlyKeys && !onlyKeys.has(key)) continue;
  const out = path.join(OUTDIR, `${key}-${chain.name}.wav`);

  if (chain.auphonic) {
    if (noAuphonic) { console.log(`  ${key} ${chain.name.padEnd(22)} skipped (--no-auphonic)`); continue; }
    const { master, checkCredits } = await import('./auphonic.mjs');
    const { loadEnv } = await import('./tts.mjs');
    const apiKey = loadEnv().AUPHONIC_API_KEY;
    const before = await checkCredits(apiKey);

    // Pad first. Handing a limiter an input that is already over is how you get the
    // flat-topping this whole exercise is about.
    const padded = path.join(OUTDIR, `.${key}-padded.wav`);
    await run('ffmpeg', ['-y', '-v', 'error', '-i', raw,
      '-af', `volume=${chain.auphonic.padDb}dB,${RESAMPLE}`, '-c:a', 'pcm_s16le', padded]);

    process.stdout.write(`  ${key} ${chain.name.padEnd(22)} `);
    await master(padded, out, {
      apiKey,
      title: `shortsmith master-lab ${clip} ${key}`,
      targetLufs: chain.auphonic.targetLufs,
      maxPeak: chain.auphonic.maxPeak,
      leveler: chain.auphonic.leveler,
      denoise: false,
      onStatus: (s) => process.stdout.write(`${s} `),
    });
    fs.rmSync(padded, { force: true });
    const after = await checkCredits(apiKey);
    console.log(`\n     spent ${(before - after).toFixed(3)} credit-hours`);
  } else {
    const ln = await loudnormTwoPass(raw, chain.pre, chain.lufs, chain.tp);
    // Two things happen after loudnorm, in this order, and the order is load-bearing:
    //
    //   1. Resample back down. `loudnorm` upsamples to 192 kHz internally for true-peak
    //      detection and *emits* at 192 kHz. Leaving that to the `-ar` output option uses
    //      the default resampler, and makes any sample-counting filter downstream count
    //      in 192 kHz units.
    //   2. Trim to an exact sample count. `aecho` flushes its reverb tail past the end of
    //      the input — 41 ms on chain D, one and a bit frames. Composition length and every
    //      t(fraction) beat derive from narration duration, so drift re-times the animation.
    const af = [...chain.pre, ln, RESAMPLE, ...chain.post, `atrim=end_sample=${srcSamples}`].join(',');
    await run('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af', af,
      '-ar', String(RATE), '-c:a', 'pcm_s16le', out]);
    console.log(`  ${key} ${chain.name.padEnd(22)} ok`);
  }

}

// Measure whatever is on disk, not just what this run rendered — otherwise a `--only`
// re-render would write a MEASUREMENTS.md that silently omits the other chains.
for (const [key, chain] of Object.entries(CHAINS)) {
  const out = path.join(OUTDIR, `${key}-${chain.name}.wav`);
  if (!fs.existsSync(out)) continue;
  results.push({ key, name: chain.name, file: path.basename(out), m: await measure(out), chain });
}

// -----------------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------------

// Spectrograms, because the 12 kHz wall is the one defect you can *see* instantly and
// argue about for an hour by ear. A flat black band above 11.5 kHz across the whole clip
// is what synthetic speech looks like.
const SPECDIR = path.join(OUTDIR, 'spectrograms');
fs.mkdirSync(SPECDIR, { recursive: true });
for (const r of results) {
  await run('ffmpeg', ['-y', '-v', 'error', '-i', path.join(OUTDIR, r.file), '-lavfi',
    `aresample=${RATE},showspectrumpic=s=1200x480:mode=combined:legend=1:scale=log:stop=24000`,
    path.join(SPECDIR, r.file.replace(/\.wav$/, '.png'))]);
}

const srcSeconds = results[0].m.seconds;
const n = (v, d = 1) => (v === null || v === undefined ? '—' : v.toFixed(d));

const table = [
  '| # | chain | I (LUFS) | true peak | LRA | crest | flat | pinned | rate | length |',
  '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ...results.map((r) => {
    const drift = Math.abs(r.m.seconds - srcSeconds);
    const len = `${r.m.seconds.toFixed(3)}s${drift > 0.002 ? ` **+${drift.toFixed(3)}**` : ''}`;
    return `| ${r.key} | ${r.name} | ${n(r.m.lufs)} | ${n(r.m.tp)} | ${n(r.m.lra)} | `
      + `${n(r.m.crest)} dB | ${n(r.m.flat, 2)} | ${n(r.m.pinned, 0)} | ${(r.m.rate / 1000).toFixed(1)}k | ${len} |`;
  }),
].join('\n');

const legend = `
## Reading the table

- **true peak** — must be below 0. Above 0 means the waveform clips between samples, which
  every lossy encoder on every platform then makes audible. The raw take is **+0.8**.
- **LRA** — loudness range. Human speech runs 5–12 LU. Everything here is ~2.6 because the
  TTS style directive asks for flat delivery. **No mastering chain can fix this** — it is a
  prompt change, tracked separately.
- **crest** — peak-to-RMS. Higher is more dynamic. Losing crest is what "over-compressed"
  measures as.
- **flat** / **pinned** — how many samples are welded to the ceiling. Raw is 2. Today's
  shipping master is **144**. That is the sound being complained about.
- **length** — must not drift. Composition length and every \`t(fraction)\` beat are derived
  from the narration duration, so a chain that changes length re-times the animation.
`;

const chainDocs = results
  .filter((r) => r.chain)
  .map((r) => {
    const ff = r.chain.auphonic
      ? `Auphonic: leveler ${r.chain.auphonic.leveler ? 'on' : 'off'}, `
        + `${r.chain.auphonic.targetLufs} LUFS, ${r.chain.auphonic.maxPeak} dBTP, `
        + `${r.chain.auphonic.padDb} dB pad on input`
      : [...r.chain.pre, 'loudnorm (2-pass, linear)', ...r.chain.post].join('\n  → ');
    return `### ${r.key} — ${r.chain.name}\n\n${r.chain.blurb}\n\n`
      + `Addresses: ${r.chain.fixes.join(', ')}\n\n\`\`\`\n  ${ff}\n\`\`\`\n`;
  })
  .join('\n');

fs.writeFileSync(
  path.join(OUTDIR, 'MEASUREMENTS.md'),
  `# Mastering lab — ${clip}\n\n`
  + `Play these in a real audio player (foobar, VLC, Audacity, or drag into a DAW).\n`
  + `Do **not** judge them through a browser \`<audio>\` element — it resamples.\n\n`
  + `Listen for, in order: (1) does it still crunch on the loud consonants, (2) does the\n`
  + `top end sound like a real recording or like it stops dead, (3) does the voice sit in\n`
  + `a space or in a vacuum, (4) has anything been over-processed into a radio ad.\n\n`
  + `${table}\n${legend}\n---\n\n${chainDocs}`,
  'utf8',
);

console.log(`\n${table}\n`);
console.log(`✓ ${path.relative(ROOT, OUTDIR)}/  (${results.length} files + MEASUREMENTS.md)`);
