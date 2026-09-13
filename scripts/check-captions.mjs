#!/usr/bin/env node
/**
 * Caption alignment check.
 *
 * The caption drift bug survived eighteen renders because nothing could see it: the
 * timing math lived inside a React component, and the only way to inspect the result was
 * to render a video and eyeball a frame.
 *
 * So the math moved to `src/anim/captions.ts` (no JSX, node can strip the types) and this
 * asserts it against the real WAVs:
 *
 *   1. The first word must start when the voice starts, not at frame 0.
 *   2. The last word must end when the voice stops, not when the file does.
 *   3. Where a real pause exists near a predicted sentence boundary, the boundary must
 *      snap to it. Stated conditionally on purpose: Gemini often runs two sentences
 *      together with no measurable gap, and falling back to the proportional estimate
 *      there is correct rather than a defect.
 *
 * **Only meaningful when the WAV was built from the current script.** Run it after
 * `build-reels.mjs`, not before — checking new narration text against audio synthesized
 * from an older draft compares two different sentence structures and fails for reasons
 * that have nothing to do with the alignment code.
 *
 * Usage:
 *   node scripts/check-captions.mjs            # every reel with a WAV
 *   node scripts/check-captions.mjs Tokens
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { detectSpeech } from './speech.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const FPS = 30;

// Node strips the types; the module is deliberately JSX-free so this works.
const { layoutWords, sentenceRanges } = await import(
  pathToFileURL(path.join(ROOT, 'src/anim/captions.ts')).href
);

const { reels } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/reels.json'), 'utf8'));
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const targets = only.length ? reels.filter((r) => only.includes(r.id)) : reels;

/** Tolerances, in frames. One frame is 33ms. */
const EDGE_TOL = 2;
const BOUNDARY_TOL = 6;

let failures = 0;
let checked = 0;

console.log('');
for (const reel of targets) {
  const wav = path.join(ROOT, 'public/audio/reels', `${reel.id}.wav`);
  if (!fs.existsSync(wav)) {
    console.log(`  skip  ${reel.id.padEnd(20)} no WAV`);
    continue;
  }
  checked++;

  const speech = await detectSpeech(wav);
  const totalFrames = Math.round(speech.duration * FPS);
  const words = layoutWords(reel.narration, 0, totalFrames, speech, FPS);

  const problems = [];

  // 1 + 2: edges.
  const wantStart = Math.round(speech.start * FPS);
  const wantEnd = Math.round(speech.end * FPS);
  if (Math.abs(words[0].from - wantStart) > EDGE_TOL) {
    problems.push(`first word at f${words[0].from}, voice starts f${wantStart}`);
  }
  if (Math.abs(words[words.length - 1].to - wantEnd) > EDGE_TOL) {
    problems.push(`last word ends f${words[words.length - 1].to}, voice stops f${wantEnd}`);
  }

  // 3: when a pause was available, did the boundary snap to it?
  //
  // The contract is *not* "every sentence boundary lands in silence" — Gemini often runs
  // two sentences together with no measurable gap, and in that case the proportional
  // fallback is the correct behaviour rather than a defect. What must hold is the
  // conditional: if a real pause exists near where the words predict a boundary, the
  // boundary is placed on that pause instead of on the prediction.
  const raw = reel.narration.split(/\s+/).filter(Boolean);
  const ranges = sentenceRanges(raw);
  const near = (f) => {
    const t = f / FPS;
    return speech.pauses.find((p) => Math.abs(p.at - t) <= p.len / 2 + BOUNDARY_TOL / FPS);
  };
  let available = 0;
  let missed = 0;
  for (let i = 0; i < ranges.length - 1; i++) {
    const placed = words[ranges[i][1] - 1].to;
    // Was there a pause within the tolerance window the algorithm searches?
    const window = (wantEnd - wantStart) * 0.12;
    const reachable = speech.pauses.filter((p) => Math.abs(p.at * FPS - placed) <= window);
    if (!reachable.length) continue;
    available++;
    if (!near(placed)) missed++;
  }
  if (available && missed / available > 0.34) {
    problems.push(`${missed}/${available} boundaries ignored an available pause`);
  }

  const lead = words[0].from - wantStart;
  if (problems.length) {
    failures++;
    console.log(`  FAIL  ${reel.id.padEnd(20)} ${problems.join('; ')}`);
  } else {
    console.log(
      `  ok    ${reel.id.padEnd(20)} lead ${String(lead).padStart(3)}f  ` +
      `${ranges.length} sentences, ${missed}/${available} pauses missed  ` +
      `(voice ${speech.start.toFixed(2)}-${speech.end.toFixed(2)}s of ${speech.duration.toFixed(2)}s)`,
    );
  }
}

console.log(`\n${checked - failures}/${checked} aligned`);
process.exit(failures ? 1 : 0);
