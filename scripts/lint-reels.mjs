#!/usr/bin/env node
/**
 * Reel content linter.
 *
 * Validates content/reels.json against content/archetypes.json before anything expensive
 * happens. Two jobs:
 *
 *   1. Schema — catch a typo before it burns Gemini quota or Auphonic credits, and before
 *      Remotion throws it inside a render worker where the stack is useless.
 *   2. Layout — catch text that will overflow its container or collide with the caption
 *      zone. This is not hypothetical: NoMemory's verdict currently wraps to two lines and
 *      lands on top of the captions (see out/check/NoMemory_c.jpg).
 *
 * Text width is estimated with a per-character advance table rather than a character
 * count, because a flat count is wrong in both directions — it passes
 * "MMMM WWWW MMMM" and fails "Low to extract. High to explore."
 *
 * Exit codes are distinct on purpose so a caller can tell bad content from a broken tool:
 *   0  clean (warnings may still have printed)
 *   1  at least one error, or any warning under --strict
 *   2  the linter itself could not run
 *
 * Usage:
 *   node scripts/lint-reels.mjs
 *   node scripts/lint-reels.mjs --strict     # warnings become failures
 *   node scripts/lint-reels.mjs --no-audio   # skip rules that need the rendered WAVs
 *   node scripts/lint-reels.mjs --json
 *
 * Also importable:  import { lintReels } from './lint-reels.mjs'
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');

const sha1 = (s) => crypto.createHash('sha1').update(s, 'utf8').digest('hex');

/** Slack on estimated text widths — see the note at the E-TEXT-WIDTH check. */
const WIDTH_TOLERANCE = 1.03;

// ---------------------------------------------------------------------------
// Text metrics
// ---------------------------------------------------------------------------

/**
 * Advance widths in em for Poppins, the display face. Geometric sans: round lowercase
 * sits near 0.56em, the i/l/t family is much narrower, and m/w much wider. Approximate,
 * but the error is a few percent — far inside the margins these rules police, and vastly
 * better than counting characters.
 */
const ADVANCE = (() => {
  const t = {};
  const set = (chars, w) => { for (const c of chars) t[c] = w; };
  set('abcdeghnopqsuvxyz', 0.56);
  set('0123456789', 0.58);
  set('fkr', 0.38);
  set('ijlt', 0.30);
  set("I.,;:'!|`", 0.30);
  set('mw', 0.87);
  set('ABCDEFGHJKLNOPQRSTUVXYZ', 0.68);
  set('MW', 0.95);
  set('()[]{}-–—/\\', 0.35);
  set(' ', 0.26);
  set('·≈', 0.40);
  return t;
})();

/** Width of a single line in px at `size`. */
export const textWidth = (s, size) => {
  let em = 0;
  for (const ch of String(s)) em += ADVANCE[ch] ?? 0.56;
  return em * size;
};

/**
 * Greedy word wrap, mirroring what the browser does with flex-wrap on whole words.
 * Honours explicit \n. Returns the resulting line count.
 */
export const wrapLines = (text, maxWidth, size) => {
  let lines = 0;
  for (const para of String(text).split('\n')) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { lines += 1; continue; }
    let cur = '';
    lines += 1;
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && textWidth(next, size) > maxWidth) { lines += 1; cur = w; }
      else cur = next;
    }
  }
  return lines;
};

/** Token-set Jaccard, for near-duplicate copy. */
const jaccard = (a, b) => {
  const norm = (s) => new Set(
    String(s).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean),
  );
  const A = norm(a), B = norm(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit++;
  return hit / (A.size + B.size - hit);
};

const normalizeText = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const wordCount = (s) => String(s).trim().split(/\s+/).filter(Boolean).length;

// ---------------------------------------------------------------------------
// Prose rules
// ---------------------------------------------------------------------------
//
// These exist because the first eighteen reels shipped with two failures a layout linter
// cannot see, and both are the kind that make a channel read as machine-generated:
//
//   1. **Phrasing tells.** "It's not just X, it's Y", "what actually separates them",
//      "the real work". Emphasis adverbs doing the job an argument should do.
//   2. **Vagueness.** Hooks like "A desk. Not a brain." or "Four chunks. That's all."
//      read as profound and communicate nothing. A viewer meets these cold in a feed,
//      with no thumbnail, no title and no idea the channel is about generative AI.
//
// Both are also what makes a run of reels read as the same video reposted: the tells live
// in the copy, and a human notices them long before any metric does.

/**
 * Phrasings that read as machine-written. Each is a regex plus the reason, because a bare
 * "don't say this" list gets cargo-culted and then argued with.
 *
 * Deliberately NOT banned: plain negation used for genuine contrast ("it is not the model
 * breaking"). Defining a new idea as a delta from what the viewer already believes is the
 * single highest-leverage move in STYLE-GUIDE §7. What is banned is the *escalation* form,
 * where the negation exists only to set up a more dramatic restatement of the same thing.
 */
const PHRASE_TELLS = [
  [/\bnot just\b[^.?!]{0,60}\bit'?s\b/i,
    '"not just X, it\'s Y" — the escalation cliche. State the claim once.'],
  [/\bit'?s not (?:about|that)\b[^.?!]{0,40}\bit'?s\b/i,
    '"it\'s not about X, it\'s Y" — same escalation cliche in another costume.'],
  [/\bwhat actually\b/i,
    '"what actually…" — the adverb is carrying an argument the sentence should make.'],
  [/\b(?:actually|really|truly) (?:separates|matters|does|works|means|happens)\b/i,
    'emphasis adverb propping up a weak verb. Cut the adverb; if the claim goes limp, the claim was the problem.'],
  [/\bthe real (?:work|question|answer|difference|problem|win)\b/i,
    '"the real X" — implies the viewer has been told something fake. Just say what it is.'],
  [/\bisn'?t (?:just|only|merely)\b/i,
    '"isn\'t just/only" — same escalation, contracted.'],
  [/\blet'?s be clear\b|\bhere'?s the thing\b|\bthe truth is\b/i,
    'throat-clearing. Delete it and start at the next word.'],
  [/\bgame.?chang(?:er|ing)\b|\bunlock(?:s|ing)? the (?:power|potential)\b/i,
    'marketing filler.'],
  [/\bdive (?:in|into)\b|\blet'?s explore\b/i,
    'tour-guide filler. A 20-second reel has no time to announce itself.'],
  [/[—–]/,
    'em/en dash. Nothing in BRAND.md or the style guide asks for these; they crept in and '
    + 'they are one of the loudest machine-written tells. Use a comma, a colon, or a full stop.'],
];

/**
 * Asyndeton: a list of three or more items with no conjunction before the last.
 *
 * "It files the ticket, updates the record, sends the email." This is the clipped
 * copywriting rhythm banned in STYLE-GUIDE §7c. It reads as someone performing concision
 * rather than explaining something, and it is the single most recognisable trait of the
 * first eighteen scripts. The fix is always the same: add the conjunction, and usually a
 * subject too.
 *
 * Detecting this by counting commas does not work — it cannot tell a list from a
 * subordinate clause, and flagged "Your AI chatbot, whether that is ChatGPT or Claude,
 * does not remember..." which is fine. So the pattern is specifically **three or more
 * short parallel items** (each at most four words) separated by commas, with no
 * conjunction anywhere in the run. Long clauses break the run, which is what makes
 * ordinary sentences pass.
 */
const ASYNDETON = /(?:[\w'’-]+(?:\s+[\w'’-]+){0,3},\s+){2,}[\w'’-]+(?:\s+[\w'’-]+){0,3}[.;:!?]/g;

const asyndeticSentences = (text) =>
  [...String(text).matchAll(ASYNDETON)]
    .map((m) => m[0])
    .filter((s) => !/\b(?:and|or|nor|but|so)\b/i.test(s));

/**
 * A hook or verdict is "unanchored" when it contains no concrete noun a cold viewer can
 * latch onto — no product name, no named concept, nothing from the reel's own diagram.
 *
 * This is the "A desk. Not a brain." rule. That hook is two abstract nouns and a negation;
 * nothing in it says what the video is about. The check is deliberately loose — it asks
 * only that *something* nameable appears — because tightening it further starts rejecting
 * good writing.
 */
const CONCRETE = /\b(?:AI|ChatGPT|Claude|GPT|LLM|model|models|chatbot|agent|prompt|prompts|token|tokens|context|window|embedding|embeddings|retrieval|retriever|fine-?tun\w*|training|inference|temperature|PDF|document|documents|file|files|calendar|inbox|email|data|search|tool|tools|system|API|weights|transcript|memory|chat|test|task|apps?|software|laptop|server\w*|plan|wiki|study|source|citation|GPUs?)\b/i;

/** Bare pronouns as the subject of a hook — "It never remembered", "It can't press send". */
const OPENS_WITH_BARE_PRONOUN = /^\s*(?:it|they|this|that|these|those)\b/i;

/**
 * Upload-title rules, from measured performance on another channel (2026-08-23).
 *
 * The shape that works is **thing + job**: a noun you could photograph, doing something,
 * ideally with the viewer in the frame. "How an AI books a meeting for you" is the target.
 * These rules encode the three failure modes that reliably underperform.
 *
 * Warnings rather than errors — each has legitimate exceptions, and the point is to make
 * an author justify the choice rather than to forbid it.
 */
const TITLE_RULES = [
  [/\b(?:no longer|stopped|don'?t|doesn'?t|didn'?t|never|quit|trap|wasted|isn'?t|won'?t|can'?t)\b/i,
    'absence word. Title what the thing *does*, not what it fails to do.'],
  [/^(?:build|run|save|stop|use|connect|make|get|try|start)\b/i,
    'command opener. Leads with an instruction instead of a subject; make the thing the subject.'],
  [/^(?:context|workflow|leverage|systems?|retrieval|temperature|prompting|the loop|the stack)\b/i,
    'abstract concept as the subject. Open on something concrete doing a job.'],
];

/** Resolve "left.sub" / "steps[]" against a reel. */
const pluck = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

/**
 * @param {object} data      parsed content/reels.json
 * @param {object} spec      parsed content/archetypes.json
 * @param {object} [opts]    { audio: false } to skip WAV-dependent rules
 * @returns {Promise<{findings: Array, errors: number, warnings: number, ok: boolean}>}
 */
export async function lintReels(data, spec, opts = {}) {
  const findings = [];
  const add = (level, code, slot, id, msg) => findings.push({ level, code, slot, id, msg });
  const err = (...a) => add('error', ...a);
  const warn = (...a) => add('warn', ...a);

  const reels = Array.isArray(data?.reels) ? data.reels : [];
  if (!reels.length) {
    add('error', 'E-EMPTY', -1, '-', 'reels.json contains no reels');
    return { findings, errors: 1, warnings: 0, ok: false };
  }

  const {
    type, band, hook: hookSpec, verdict: vSpec, narration: nSpec,
    scenes, accents, variant: variantSpec,
  } = spec;
  const audioDir = opts.audioDir ?? path.join(ROOT, 'public/audio/reels');
  const wantAudio = opts.audio !== false;

  // Written by build-reels.mjs. Absent on a fresh clone, which is fine — the staleness
  // rule simply has nothing to compare against.
  let manifest = { entries: {} };
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/.audio-manifest.json'), 'utf8'));
  } catch { /* no manifest yet */ }

  const seenIds = new Set();

  for (let i = 0; i < reels.length; i++) {
    const r = reels[i];
    const id = r?.id ?? `#${i}`;

    // ---- identity -------------------------------------------------------
    if (!r?.id) { err('E-ID-MISSING', i, id, 'reel has no "id"'); continue; }
    if (!/^[A-Za-z][A-Za-z0-9]{2,31}$/.test(r.id)) {
      err('E-ID-CHARS', i, id,
        'id must be 3-32 alphanumerics starting with a letter — it is both a Remotion ' +
        'composition id and a WAV filename');
    }
    if (seenIds.has(r.id)) err('E-ID-DUP', i, id, `duplicate id "${r.id}"`);
    seenIds.add(r.id);

    // ---- scene ----------------------------------------------------------
    const sc = scenes[r.scene];
    if (!sc) {
      err('E-SCHEMA-SCENE', i, id,
        `unknown scene "${r.scene}" — known: ${Object.keys(scenes).join(', ')}`);
      continue; // every later rule is scene-relative
    }

    for (const key of sc.required) {
      const v = pluck(r, key);
      if (v === undefined || v === null || (Array.isArray(v) && !v.length)) {
        err('E-SCHEMA-MISSING', i, id, `scene "${r.scene}" requires "${key}"`);
      }
    }

    for (const [key, [lo, hi]] of Object.entries(sc.counts ?? {})) {
      const v = pluck(r, key);
      if (!Array.isArray(v)) continue;
      if (v.length < lo || v.length > hi) {
        err('E-COUNT', i, id,
          `"${key}" has ${v.length} entries; ${r.scene} supports ${lo}-${hi}` +
          (sc.note ? ` — ${sc.note}` : ''));
      }
    }

    // `focus` / `pick` must point at a real element, or the scene renders a highlight on
    // nothing and the clip quietly loses its point.
    for (const [key, arrayKey] of Object.entries(sc.indexInto ?? {})) {
      const idx = pluck(r, key);
      const arr = pluck(r, arrayKey);
      if (idx === undefined) continue;
      if (!Number.isInteger(idx)) {
        err('E-INDEX', i, id, `"${key}" must be an integer index into "${arrayKey}"`);
      } else if (Array.isArray(arr) && (idx < 0 || idx >= arr.length)) {
        err('E-INDEX', i, id,
          `"${key}" is ${idx} but "${arrayKey}" has ${arr.length} entries (valid 0-${arr.length - 1})`);
      }
    }

    // Mono has a flat advance, so this is exact rather than estimated.
    for (const [key, maxChars] of Object.entries(sc.monoWidth ?? {})) {
      const arr = pluck(r, key.replace('[]', ''));
      if (!Array.isArray(arr)) continue;
      for (const line of arr) {
        if (typeof line === 'string' && line.length > maxChars) {
          err('E-CODE-WIDTH', i, id,
            `code line is ${line.length} chars; the card fits ${maxChars} at ${type.code ?? 34}px mono — "${line}"`);
        }
      }
    }

    // Scene-specific enums, e.g. nest's `direction`.
    for (const [key, allowed] of Object.entries(sc.enum ?? {})) {
      const v = pluck(r, key);
      if (v !== undefined && !allowed.includes(v)) {
        err('E-SCHEMA-ENUM', i, id, `"${key}" is "${v}"; allowed: ${allowed.join(', ')}`);
      }
    }

    for (const key of sc.accentAt ?? []) {
      const v = pluck(r, key);
      if (v === undefined) continue;
      if (!accents.includes(v)) {
        err('E-SCHEMA-ACCENT', i, id,
          `"${key}" is "${v}"; known accents: ${accents.join(', ')}`);
      }
    }

    // ---- variant ---------------------------------------------------------
    if (r.variant !== undefined) {
      if (typeof r.variant !== 'object' || Array.isArray(r.variant)) {
        err('E-SCHEMA-VARIANT', i, id, '"variant" must be an object');
      } else {
        const known = new Set([...Object.keys(variantSpec), 'mirror', 'captionTint']);
        for (const [k, val] of Object.entries(r.variant)) {
          if (!known.has(k)) {
            err('E-SCHEMA-VARIANT', i, id,
              `unknown variant key "${k}" — known: ${[...known].join(', ')}`);
            continue;
          }
          if (k === 'mirror') {
            if (typeof val !== 'boolean') {
              err('E-SCHEMA-VARIANT', i, id, 'variant.mirror must be true or false');
            } else if (val && sc.mirror === false) {
              warn('W-MIRROR-NOOP', i, id,
                `variant.mirror has no effect on "${r.scene}" — the layout is symmetric`);
            }
          } else if (k === 'captionTint') {
            if (!accents.includes(val)) {
              err('E-SCHEMA-VARIANT', i, id,
                `variant.captionTint is "${val}"; known accents: ${accents.join(', ')}`);
            }
          } else if (!variantSpec[k].includes(val)) {
            err('E-SCHEMA-VARIANT', i, id,
              `variant.${k} is "${val}"; allowed: ${variantSpec[k].join(', ')}`);
          }
        }
      }
    }

    // ---- hook -----------------------------------------------------------
    if (!r.hook) {
      err('E-HOOK-MISSING', i, id, 'no hook — the first 1.5s decides everything');
    } else {
      const declared = r.hook.split('\n');
      if (declared.length < hookSpec.minLines) {
        err('E-HOOK-LINES', i, id,
          'hook is one line; the archetype wants a deliberate break (use \\n)');
      }
      const lines = wrapLines(r.hook, hookSpec.width, type.hook);
      if (lines > hookSpec.maxLines) {
        err('E-HOOK-LINES', i, id,
          `hook wraps to ${lines} lines at ${type.hook}px; max ${hookSpec.maxLines}`);
      }
      for (const line of declared) {
        const w = textWidth(line, type.hook);
        if (w > hookSpec.width) {
          err('E-HOOK-WIDTH', i, id,
            `hook line "${line}" is ~${Math.round(w)}px wide; max ${hookSpec.width}`);
        }
      }
    }

    // ---- verdict ---------------------------------------------------------
    // Since SceneFrame anchors the verdict to band.verdictBottom outside the camera
    // layer, it can no longer be pushed into the captions by a zoom. The only remaining
    // failure is wrapping past the two lines the band has room for.
    if (!r.verdict) {
      err('E-VERDICT-MISSING', i, id, 'no verdict — the line the viewer repeats to a colleague');
    } else {
      const declared = r.verdict.split('\n').length;
      const lines = wrapLines(r.verdict, vSpec.width, type.body);
      if (declared > vSpec.maxLines) {
        err('E-VERDICT-LINES', i, id,
          `verdict declares ${declared} lines; the band holds ${vSpec.maxLines}`);
      } else if (lines > vSpec.maxLines) {
        const budget = band.verdictBottom - band.stageFloor;
        err('E-VERDICT-LINES', i, id,
          `verdict wraps to ${lines} lines at ${type.body}px across ${vSpec.width}px; ` +
          `the ${budget}px band between stageFloor and verdictBottom holds ${vSpec.maxLines}`);
      }
    }

    // ---- per-scene text widths ------------------------------------------
    // Keys are "prop", "prop[]" (array of strings) or "prop[].field" (array of objects).
    // Each value is { max, size } — the font size is declared, never inferred from the
    // key name. Inferring it was wrong in both directions: a `callout` renders in a Chip
    // at 32px but was measured at 46, and `workers[].label` renders at 32 but was
    // measured at 56, so real overflows passed and safe text failed.
    for (const [key, rule] of Object.entries(sc.text ?? {})) {
      const maxW = rule.max;
      const size = rule.size;
      const [basePath, fieldPath] = key.split('[]');
      const isArray = key.includes('[]');
      const field = fieldPath?.replace(/^\./, '') || null;

      const val = pluck(r, basePath);
      let strings = [];
      if (!isArray) {
        if (typeof val === 'string') strings = [val];
      } else if (Array.isArray(val)) {
        strings = val
          .map((entry) => (field ? entry?.[field] : entry))
          .filter((s) => typeof s === 'string');
      }

      for (const s of strings) {
        const w = textWidth(s, size);
        // The advance table is an approximation, so a hard threshold at exactly the limit
        // produces noise — a 1px "overflow" is measurement error, not a defect. Real
        // overflows run well past this. Mono is exact and checked separately.
        if (w > maxW * WIDTH_TOLERANCE) {
          err('E-TEXT-WIDTH', i, id,
            `${key} "${s}" is ~${Math.round(w)}px at ${size}px; container allows ${maxW}px`);
        } else if (w > maxW) {
          warn('W-TEXT-TIGHT', i, id,
            `${key} "${s}" is ~${Math.round(w)}px against a ${maxW}px container — within estimator error, but check the frame`);
        }
      }
    }

    // ---- narration -------------------------------------------------------
    if (!r.narration) {
      err('E-NARRATION-MISSING', i, id, 'no narration — the audio is the clock');
    } else {
      const n = wordCount(r.narration);
      if (n < nSpec.hardMin) err('E-NARRATION-SHORT', i, id, `${n} words; minimum ${nSpec.hardMin}`);
      else if (n > nSpec.hardMax) err('E-NARRATION-LONG', i, id, `${n} words; maximum ${nSpec.hardMax}`);
      else if (n < nSpec.bandLo || n > nSpec.bandHi) {
        warn('W-NARRATION-BAND', i, id,
          `${n} words; the shipped corpus sits at ${nSpec.bandLo}-${nSpec.bandHi}`);
      }

      // The cold-open rule. A viewer meets this reel mid-scroll with no thumbnail, no
      // title read, and no idea the channel is about generative AI. The first sentence
      // has to name the subject in words they already own.
      const first = String(r.narration).split(/(?<=[.?!])\s+/)[0] ?? '';
      if (OPENS_WITH_BARE_PRONOUN.test(first)) {
        err('E-COLD-OPEN', i, id,
          `narration opens on a bare pronoun — "${first.slice(0, 48)}…". A cold viewer has ` +
          'no referent for it. Name the thing.');
      } else if (!CONCRETE.test(first)) {
        err('E-COLD-OPEN', i, id,
          `first sentence names nothing concrete — "${first.slice(0, 60)}…". Say "an AI model", ` +
          '"an AI chatbot like ChatGPT", or whatever the reel is literally about.');
      }
    }

    // ---- prose: phrasing tells and vagueness -------------------------------
    for (const field of ['hook', 'verdict', 'narration', 'title', 'publishTitle']) {
      const text = r[field];
      if (typeof text !== 'string') continue;
      for (const [re, why] of PHRASE_TELLS) {
        const m = text.match(re);
        if (m) err('E-PHRASE-TELL', i, id, `${field}: "${m[0]}" -- ${why}`);
      }
    }

    // The verdict is allowed to be clipped; that is its job, and BRAND.md §5 defines it as
    // "a line the viewer can repeat out loud to a colleague". Narration is not.
    for (const s of asyndeticSentences(r.narration ?? '')) {
      warn('W-ASYNDETON', i, id,
        `narration list has no conjunction: "${s.trim()}" -- add "and"/"or" before the last ` +
        'item. STYLE-GUIDE §7c: explain, do not perform concision.');
    }

    // ---- publish title -----------------------------------------------------
    //
    // Distinct from `title`, which is the on-screen anchor in the top bar and is
    // deliberately terse. This is the string that gets typed into the upload box, and it
    // is the only text a viewer sees before the video plays anywhere it appears outside
    // the Shorts feed (search, the channel grid, a shared link).
    if (!r.publishTitle) {
      err('E-PUBTITLE-MISSING', i, id,
        'no publishTitle — the upload needs a title that works with no video attached');
    } else {
      const len = r.publishTitle.length;
      if (len > 100) {
        err('E-PUBTITLE-LONG', i, id, `publishTitle is ${len} chars; YouTube hard-caps at 100`);
      } else if (len > 60) {
        warn('W-PUBTITLE-LONG', i, id,
          `publishTitle is ${len} chars; mobile truncates around 40-60, so the payload should sit early`);
      }
      if (!CONCRETE.test(r.publishTitle)) {
        err('E-PUBTITLE-VAGUE', i, id,
          `publishTitle names nothing concrete — "${r.publishTitle}". It has to work as a ` +
          'search result, with no thumbnail and no video.');
      }
      for (const [re, why] of TITLE_RULES) {
        const m = r.publishTitle.match(re);
        if (m) warn('W-PUBTITLE-SHAPE', i, id, `publishTitle "${m[0]}" -- ${why}`);
      }
    }

    // The hook is the most-repeated frame on the channel and the only thing a scroller
    // reads before deciding. It must be *about* something nameable.
    if (typeof r.hook === 'string') {
      if (OPENS_WITH_BARE_PRONOUN.test(r.hook)) {
        err('E-HOOK-VAGUE', i, id,
          `hook opens on a bare pronoun — "${r.hook.replace(/\n/g, ' / ')}". The viewer has ` +
          'not seen anything yet, so there is no antecedent.');
      } else if (!CONCRETE.test(r.hook)) {
        err('E-HOOK-VAGUE', i, id,
          `hook names nothing concrete — "${r.hook.replace(/\n/g, ' / ')}". This is the ` +
          '"A desk. Not a brain." failure: it reads as profound and says nothing.');
      }
    }

    // The open-loop rule: the hook poses something, the verdict closes it.
    //
    // Two checks, because they fail differently.
    //
    // (a) Does the hook open anything at all? A question mark is the obvious form, but a
    //     tension statement works just as well — "An AI model cannot click a button."
    //     poses "then how does it act?" without a question mark. So negations, contrast
    //     markers and universal claims all count. This heuristic cannot judge whether a
    //     loop was *genuinely* opened; it only catches the bare label, which is the
    //     common failure ("The context window", "Tokens, not words").
    if (typeof r.hook === 'string') {
      const opensLoop = /\?/.test(r.hook)
        || /^\s*(?:why|how|what|when|where|who|which|does|do|is|are|can|should|will|did)\b/i.test(r.hook)
        || /\b(?:not|cannot|never|no|n't)\b/i.test(r.hook)
        || /\b(?:or|versus|vs|but|again|same|every|two|three|then what)\b/i.test(r.hook);
      if (!opensLoop) {
        warn('W-HOOK-NO-LOOP', i, id,
          `hook reads as a label, not a question — "${r.hook.replace(/\n/g, ' / ')}". ` +
          'A scroller needs a gap to want closed.');
      }
    }

    // (b) Does the verdict actually answer, or just echo? A verdict that restates the
    //     hook in different words closes nothing, and the viewer leaves with what they
    //     already had eight seconds ago.
    if (typeof r.hook === 'string' && typeof r.verdict === 'string') {
      const overlap = jaccard(r.hook, r.verdict);
      if (overlap >= 0.5) {
        warn('W-LOOP-ECHO', i, id,
          `verdict is ${Math.round(overlap * 100)}% the same words as the hook — ` +
          `"${r.hook.replace(/\n/g, ' / ')}" vs "${r.verdict.replace(/\n/g, ' / ')}". ` +
          'It should answer the hook, not repeat it.');
      }
    }

    // ---- audio -----------------------------------------------------------
    if (wantAudio) {
      const wav = path.join(audioDir, `${r.id}.wav`);
      if (!fs.existsSync(wav)) {
        warn('W-AUDIO-MISSING', i, id, `no narration at ${path.relative(ROOT, wav)} — run build-reels`);
      } else {
        // The narration length IS the composition length, so a script edited after its
        // WAV was built means every t(fraction) beat has moved and every verification
        // frame you approved is stale.
        const entry = manifest.entries?.[r.id];
        if (entry && r.narration && entry.sha !== sha1(r.narration)) {
          warn('W-AUDIO-STALE', i, id,
            'narration has changed since the WAV was built — beats and duration are stale. ' +
            `Run: node scripts/build-reels.mjs --only ${r.id}`);
        }
        // ffprobe, not wavDuration(): Auphonic returns 44.1kHz and the default-sample-rate
        // path reads a mastered file ~1.8x short.
        let secs = null;
        try {
          const { stdout } = await run('ffprobe',
            ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]);
          secs = Number(stdout.trim());
        } catch (e) {
          const msg = String(e?.code === 'ENOENT' ? 'ffprobe is not on PATH' : e.message);
          throw Object.assign(new Error(msg), { toolFailure: true });
        }
        if (Number.isFinite(secs) && secs > nSpec.maxSeconds) {
          err('E-AUDIO-LONG', i, id, `narration is ${secs.toFixed(1)}s; Shorts cap is ${nSpec.maxSeconds}s`);
        }
      }
    }
  }

  // ---- cross-reel: variety over publish slots ----------------------------
  //
  // This is the mechanical half of the anti-repetition defence: consecutive reels must not
  // feel interchangeable to someone reading a channel's recent uploads in a row. Array
  // order in reels.json IS publish order, so adjacency here is adjacency on the channel.
  if (opts.variety !== false) {
    const slots = reels
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => (r.status ?? 'queued') !== 'draft');

    const cameraOf = (r) => r.variant?.camera ?? scenes[r.scene]?.defaultCamera ?? 'push';
    const accentOf = (r) => r.accent ?? r.left?.accent ?? r.right?.accent ?? '-';
    const comboOf = (r) =>
      `${r.scene}|${accentOf(r)}|${cameraOf(r)}|${r.variant?.mirror ? 'm' : ''}`;

    for (let k = 1; k < slots.length; k++) {
      const cur = slots[k].r;
      const prev = slots[k - 1].r;

      if (comboOf(cur) === comboOf(prev)) {
        err('E-RUN-COMBO', slots[k].idx, cur.id,
          `identical (scene, accent, camera, mirror) to ${prev.id} in the previous slot — ` +
          'these two will read as the same video. Change the archetype or give one a variant.');
      } else if (cur.scene === prev.scene) {
        if (k >= 2 && slots[k - 2].r.scene === cur.scene) {
          err('E-RUN-SCENE', slots[k].idx, cur.id,
            `third "${cur.scene}" in a row (${slots[k - 2].r.id}, ${prev.id}, ${cur.id})`);
        } else {
          warn('W-RUN-SCENE', slots[k].idx, cur.id,
            `same archetype as ${prev.id} — fine occasionally, but vary the camera or hook`);
        }
      }
    }

    // Rolling windows.
    const windowed = (size, fn) => {
      for (let s = 0; s + size <= slots.length; s++) fn(slots.slice(s, s + size), s);
    };

    windowed(10, (w, s) => {
      const counts = {};
      for (const { r } of w) counts[accentOf(r)] = (counts[accentOf(r)] ?? 0) + 1;
      for (const [a, c] of Object.entries(counts)) {
        if (a !== '-' && c > 3) {
          warn('W-ACCENT-OVERUSE', slots[s].idx, w[0].r.id,
            `accent "${a}" carries ${c} of 10 reels from slot ${s} — the channel starts to read as one colour`);
        }
      }
      const distinctScenes = new Set(w.map(({ r }) => r.scene)).size;
      if (distinctScenes < 5) {
        warn('W-SCENE-COVERAGE', slots[s].idx, w[0].r.id,
          `only ${distinctScenes} distinct archetypes across 10 reels from slot ${s}; aim for 5+`);
      }
      const matrixCount = w.filter(({ r }) => r.scene === 'matrix').length;
      if (matrixCount > 2) {
        warn('W-MATRIX-BUDGET', slots[s].idx, w[0].r.id,
          `matrix used ${matrixCount}x in 10 reels from slot ${s} — it is the heaviest to read, budget 2`);
      }
    });

    windowed(6, (w, s) => {
      const distinct = new Set(w.map(({ r }) => cameraOf(r))).size;
      if (distinct < 3) {
        warn('W-CAMERA-MONO', slots[s].idx, w[0].r.id,
          `only ${distinct} distinct camera moves across 6 reels from slot ${s}; aim for 3+`);
      }
    });

    windowed(5, (w, s) => {
      const seen = new Map();
      for (const { r } of w) {
        const c = comboOf(r);
        if (seen.has(c)) {
          warn('W-COMBO-WINDOW', slots[s].idx, r.id,
            `same (scene, accent, camera) as ${seen.get(c)} within 5 slots`);
        }
        seen.set(c, r.id);
      }
    });

    for (const { r, idx } of slots) {
      if (!r.variant) {
        warn('W-NO-VARIANT', idx, r.id,
          'no variant block — it will render with the archetype default, like every other reel of this type');
      }
    }
  }

  // ---- cross-reel: near-duplicate copy -----------------------------------
  // Read the last twenty videos side by side, the way someone scrolling the channel does.
  // Two reels that open with the same words read as one video posted twice.
  const pairs = [
    ['hook', 'HOOK', 0.6],
    ['verdict', 'VERDICT', 0.7],
    ['title', 'TITLE', 0.7],
  ];
  for (let a = 0; a < reels.length; a++) {
    for (let b = a + 1; b < reels.length; b++) {
      for (const [field, tag, threshold] of pairs) {
        const x = reels[a]?.[field], y = reels[b]?.[field];
        if (!x || !y) continue;
        if (normalizeText(x) === normalizeText(y)) {
          add('error', `E-${tag}-DUP`, b, reels[b].id,
            `${field} is identical to ${reels[a].id}`);
        } else if (jaccard(x, y) >= threshold) {
          warn(`W-${tag}-NEAR`, b, reels[b].id,
            `${field} is ${Math.round(jaccard(x, y) * 100)}% the same words as ${reels[a].id}`);
        }
      }
    }
  }

  const errors = findings.filter((f) => f.level === 'error').length;
  const warnings = findings.length - errors;
  return { findings, errors, warnings, ok: errors === 0 };
}

/** Read both JSON files and lint. Throws with `.toolFailure` if the inputs are unusable. */
export async function lintFromDisk(opts = {}) {
  const read = (rel) => {
    const p = path.join(ROOT, rel);
    let raw;
    try { raw = fs.readFileSync(p, 'utf8'); }
    catch { throw Object.assign(new Error(`cannot read ${rel}`), { toolFailure: true }); }
    try { return JSON.parse(raw); }
    catch (e) { throw Object.assign(new Error(`${rel} is not valid JSON: ${e.message}`), { toolFailure: true }); }
  };
  return lintReels(read('content/reels.json'), read('content/archetypes.json'), opts);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const argv = process.argv.slice(2);
  const strict = argv.includes('--strict');
  const asJson = argv.includes('--json');
  const audio = !argv.includes('--no-audio');

  let result;
  try {
    result = await lintFromDisk({ audio });
  } catch (e) {
    if (asJson) console.log(JSON.stringify({ ok: false, toolFailure: true, message: e.message }));
    else {
      console.error(`lint-reels: ${e.message}`);
      if (/ffprobe/.test(e.message)) console.error('  (install ffmpeg, or re-run with --no-audio)');
    }
    process.exit(2);
  }

  if (asJson) {
    console.log(JSON.stringify({
      ok: result.ok && (!strict || result.warnings === 0),
      errors: result.errors,
      warnings: result.warnings,
      findings: result.findings,
    }, null, 2));
  } else {
    const order = { error: 0, warn: 1 };
    const sorted = [...result.findings].sort(
      (a, b) => order[a.level] - order[b.level] || a.slot - b.slot,
    );
    for (const f of sorted) {
      const tag = f.level === 'error' ? 'ERROR' : 'warn ';
      const line = `${tag} ${String(f.code).padEnd(20)} ${String(f.id).padEnd(20)} ${f.msg}`;
      if (f.level === 'error') console.error(line); else console.warn(line);
    }
    const n = result.findings.length;
    if (!n) console.log('lint-reels: clean');
    else console.log(`\nlint-reels: ${result.errors} error(s), ${result.warnings} warning(s)`);
  }

  process.exit(result.errors > 0 || (strict && result.warnings > 0) ? 1 : 0);
}
