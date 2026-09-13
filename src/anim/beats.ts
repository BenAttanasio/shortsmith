/**
 * Beat scheduling.
 *
 * Every beat in this system is a **fraction of the narration**, resolved against
 * `narrationFrames` — which comes only from `calculateMetadata` reading the real WAV
 * duration. Rewriting a line therefore re-times the whole animation for free, and no
 * scene ever contains a frame constant. That invariant is the reason the repo works;
 * don't add a number here that isn't a fraction.
 *
 * The defaults changed in Aug 2026: `open` used to sit around 0.22-0.26, which left the
 * stage completely empty for the first quarter of every clip. On a 20s reel that is five
 * seconds of nothing but hook type and captions — bad for retention, and exactly the
 * frame shape Instagram's "majority text" and TikTok's "only text overlays" rules
 * describe. Structure now lands at 0.10.
 */

export type Pace = 'even' | 'front' | 'back';

export type Beats = {
  /** Fraction of the narration → absolute frame. */
  t: (fraction: number) => number;
  /** Immediately. Means "the frame is never blank", not a real beat. */
  hook: number;
  /** First structural element — the container, the axis, the boundary. */
  open: number;
  /** Element i of n, spread across the build window. */
  build: (i: number, n: number) => number;
  /** The emphasis moment: the pick, the closing edge, the dim-everything-else. */
  accent: number;
  verdict: number;
};

const DEFAULTS = {
  open: 0.1,
  buildFrom: 0.22,
  buildTo: 0.72,
  accent: 0.8,
  verdict: 0.86,
};

/** `pace` shifts the build window as fractions, never as frames. */
const PACE_SHIFT: Record<Pace, number> = { even: 0, front: -0.06, back: 0.06 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const makeBeats = (
  narrationFrames: number,
  opts: {
    pace?: Pace;
    open?: number;
    buildFrom?: number;
    buildTo?: number;
    accent?: number;
    verdict?: number;
  } = {},
): Beats => {
  const t = (fraction: number) => Math.round(narrationFrames * fraction);

  const shift = PACE_SHIFT[opts.pace ?? 'even'];
  const from = clamp((opts.buildFrom ?? DEFAULTS.buildFrom) + shift, 0.04, 0.8);
  const to = clamp((opts.buildTo ?? DEFAULTS.buildTo) + shift, from + 0.04, 0.84);

  return {
    t,
    hook: 2,
    open: t(opts.open ?? DEFAULTS.open),
    build: (i, n) => t(n <= 1 ? from : from + ((to - from) * i) / (n - 1)),
    accent: t(opts.accent ?? DEFAULTS.accent),
    verdict: t(opts.verdict ?? DEFAULTS.verdict),
  };
};
