/**
 * Caption word timing.
 *
 * Kept out of `Caption.tsx` deliberately: this is pure arithmetic with no JSX, so it can
 * be imported and asserted against real WAV measurements by `scripts/check-captions.mjs`.
 * The bug this module exists to fix was silent for eighteen renders because nothing could
 * test it.
 *
 * ---------------------------------------------------------------------------
 * The bug
 * ---------------------------------------------------------------------------
 * Captions used to be spread from frame 0 to the end of the composition, weighted by word
 * length. Both ends of that range are wrong:
 *
 *   - Gemini leaves **0.12 to 0.33 seconds of leading silence** (median 0.24 across the
 *     eighteen reels). At 30fps the first word lit up seven frames before the voice said
 *     it, and every later word inherited the offset. This is what "highlighting future
 *     words too fast" was.
 *   - The speech often **ends well before the file does** — `ContextEngineering` talks for
 *     17.9s of a 23.0s clip. Spreading across the full 23.0s makes the caption fall
 *     progressively behind in the back half, so the error reverses sign mid-clip.
 *
 * Length weighting is also a weak proxy for spoken duration, and the error compounds over
 * a 70-word script. It cannot be repaired by better weights, because the real variance is
 * in the pauses between sentences rather than in the words themselves.
 */

export type Word = {
  text: string;
  /** Start frame. */
  from: number;
  /** End frame. */
  to: number;
};

/**
 * Where the voice actually is inside a narration WAV, in seconds.
 * Measured by `scripts/speech.mjs`, stored in `content/.audio-manifest.json`.
 */
export type Speech = {
  start: number;
  end: number;
  duration: number;
  /** Internal gaps, longest first. Candidate sentence boundaries. */
  pauses: { at: number; len: number }[];
};

/** How far a detected pause may sit from its predicted position before it is distrusted. */
const PAUSE_TOLERANCE = 0.12;

const weightOf = (w: string) => Math.max(2, w.replace(/[^\w]/g, '').length);

/** Spread words across [from, to) weighted by length, with extra weight for punctuation. */
const spread = (words: string[], from: number, to: number): Word[] => {
  const weights = words.map((w) => weightOf(w) + (/[.,;:!?]$/.test(w) ? 3 : 0));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let cursor = from;
  return words.map((w, i) => {
    const span = ((to - from) * weights[i]) / total;
    const start = cursor;
    cursor += span;
    return { text: w, from: Math.round(start), to: Math.round(cursor) };
  });
};

/** Split words into sentences, as [startIndex, endIndex) pairs. */
export const sentenceRanges = (words: string[]): [number, number][] => {
  const bounds: number[] = [];
  words.forEach((w, i) => {
    if (/[.?!]["')\]]?$/.test(w) && i < words.length - 1) bounds.push(i + 1);
  });
  const out: [number, number][] = [];
  let prev = 0;
  for (const b of [...bounds, words.length]) {
    if (b > prev) out.push([prev, b]);
    prev = b;
  }
  return out;
};

/**
 * Build word timings for a narration.
 *
 * Without `speech` this reproduces the old whole-clip spread. That path is **known to be
 * wrong** and exists only so a reel whose WAV predates speech analysis still renders;
 * rebuilding the reel fixes it.
 *
 * With `speech`, two corrections apply:
 *
 *   1. Words are laid out across the real speech span, which removes the leading offset
 *      and the end-of-clip stretch.
 *   2. Sentence boundaries are anchored to **detected pauses** rather than to arithmetic.
 *      This is what stops drift accumulating: pinning each boundary to a real gap keeps
 *      every sentence independently in sync, and inside a single sentence length weighting
 *      is accurate enough that the residual is invisible.
 *
 * A candidate pause is only trusted when it lands within `PAUSE_TOLERANCE` of where the
 * words predict the boundary should be. A speaker also breathes mid-sentence, and an
 * unusually long mid-sentence breath would otherwise yank a whole sentence out of sync.
 */
export const layoutWords = (
  text: string,
  from: number,
  to: number,
  speech?: Speech,
  fps = 30,
): Word[] => {
  const raw = text.split(/\s+/).filter(Boolean);
  if (!raw.length) return [];
  if (!speech) return spread(raw, from, to);

  const startF = Math.round(speech.start * fps);
  const endF = Math.min(Math.round(speech.end * fps), to);
  if (endF <= startF) return spread(raw, from, to);

  const sentences = sentenceRanges(raw);
  if (sentences.length < 2) return spread(raw, startF, endF);

  // Cumulative word weight, for predicting where each boundary falls.
  const cum: number[] = [];
  let acc = 0;
  for (const w of raw) {
    acc += weightOf(w);
    cum.push(acc);
  }
  const totalWeight = acc || 1;

  // Assign each boundary the nearest unused pause, independently.
  //
  // The first version took the (sentences - 1) *longest* pauses, sorted them by time, and
  // matched them to boundaries by index. That assumes the longest pauses are the sentence
  // gaps, and when it was wrong it was wrong for every boundary at once: a single long
  // mid-sentence breath shifted the whole assignment by one and desynced the rest of the
  // clip. Five of eighteen reels failed that way.
  //
  // Nearest-per-boundary has no such coupling. A boundary either finds a real gap near
  // where the words predict it, or falls back to the prediction on its own, without
  // disturbing its neighbours. `used` stops two boundaries claiming the same pause.
  const pool = speech.pauses.map((p) => Math.round(p.at * fps));
  const used = new Set<number>();
  const tolerance = (endF - startF) * PAUSE_TOLERANCE;

  const boundaries = sentences.slice(0, -1).map((s) => {
    const predicted = startF + ((endF - startF) * cum[s[1] - 1]) / totalWeight;
    let pick = -1;
    let closest = Infinity;
    pool.forEach((f, j) => {
      if (used.has(j)) return;
      const d = Math.abs(f - predicted);
      if (d < closest) { closest = d; pick = j; }
    });
    if (pick >= 0 && closest <= tolerance) {
      used.add(pick);
      return pool[pick];
    }
    return predicted;
  });

  // Must be strictly increasing, or a sentence gets zero or negative duration.
  for (let i = 1; i < boundaries.length; i++) {
    if (boundaries[i] <= boundaries[i - 1]) boundaries[i] = boundaries[i - 1] + 1;
  }

  const out: Word[] = [];
  sentences.forEach(([a, b], i) => {
    const s = i === 0 ? startF : boundaries[i - 1];
    const e = i === sentences.length - 1 ? endF : boundaries[i];
    out.push(...spread(raw.slice(a, b), s, Math.max(s + 1, e)));
  });
  return out;
};
