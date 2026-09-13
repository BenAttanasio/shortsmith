/**
 * Design tokens.
 *
 * The colour values live in `themes.ts` and are selected by `activeTheme`; everything
 * else — geometry, type scale, springs — is theme-independent and defined here.
 *
 * See research/BRAND.md for the palette and its provenance, and research/STYLE-GUIDE.md
 * for the grammar the tokens serve.
 */

import { themes, activeTheme, type AccentTokens } from './themes';

export { themes, activeTheme } from './themes';
export type { ThemeName } from './themes';

/** The active theme's surfaces and inks. */
export const palette = themes[activeTheme].palette;

/** Accents are a spice, not a sauce. Two per frame, maximum. */
export const accent = themes[activeTheme].accent;

/** True when the active theme is a light ground. */
export const isLightTheme: boolean = themes[activeTheme].light;

/** Semantic roles, stable across themes — see the note at the top of themes.ts. */
export type AccentName = keyof AccentTokens;

/** 1080×1920 vertical. Zone boundaries from STYLE-GUIDE §8. */
export const canvas = {
  width: 1080,
  height: 1920,
  fps: 30,
  safeTop: 180,
  hookTop: 180,
  hookBottom: 520,
  stageTop: 520,
  stageBottom: 1500,
  captionTop: 1500,
  captionBottom: 1700,
  safeBottom: 1700,
} as const;

/** Stage centre — the anchor point for diagram layout. */
export const stageCenter = {
  x: canvas.width / 2,
  y: (canvas.stageTop + canvas.stageBottom) / 2,
} as const;

/**
 * The vertical budget every archetype is designed against.
 *
 * `stageFloor` is deliberately well above `canvas.stageBottom`: the camera scales the
 * stage about y≈1056, so a nominal 1500 renders at 1518 by the end of the clip. Diagrams
 * that "just fit" at rest do not fit in motion.
 *
 * `verdictBottom` is a **bottom** anchor — the verdict grows upward from it. That, plus
 * living outside the camera layer, is what makes a two-line verdict structurally unable
 * to reach the captions. It used to be computed per-scene from the last element's y,
 * inside the camera, which is how NoMemory ended up rendering its verdict on top of its
 * captions.
 */
export const band = {
  hookTop: 220,
  /** Diagrams start here — 40px of air below canvas.stageTop. */
  diagramTop: 560,
  /** Lowest y a diagram may occupy. */
  stageFloor: 1330,
  /** Baseline the verdict sits on. 68px of air above a two-line caption. */
  verdictBottom: 1462,
  verdictMaxLines: 2,
} as const;

/**
 * Camera vocabulary. One of these per clip, chosen per-reel — the move is a variety lever,
 * not a house default. STYLE-GUIDE §6.5: the camera moves instead of cutting.
 */
export const cameraSpec = {
  push: { from: 1, to: 1.045 },
  settle: { from: 1.06, to: 1 },
  drift: { scale: 1.03, dx: -22, dy: -26 },
  /**
   * Deliberately gentle. A frame-part push scales about an *off-centre* origin, so
   * whatever sits on the far side of that origin travels outward fastest — at 1.10 with
   * the origin on a left-hand quadrant, the right-hand column of a matrix left the frame
   * entirely. 1.06 still reads as "the camera moved to look at this" without cropping
   * the thing being compared against.
   */
  framePart: { scale: 1.06 },
} as const;

/**
 * Type scale. Minimum readable body on a phone is ~44px at 1080 wide;
 * arrow labels bottom out around 32.
 */
export const type = {
  display: 84,
  hook: 76,
  title: 40,
  heading: 56,
  body: 46,
  label: 38,
  arrowLabel: 32,
  caption: 54,
  code: 34,
} as const;

export const radius = {
  sm: 10,
  md: 18,
  lg: 26,
  pill: 999,
} as const;

export const stroke = {
  hairline: 2,
  line: 2.5,
  bold: 4,
} as const;

/** Entrances are short and springy. See STYLE-GUIDE §6. */
export const springs = {
  /** Default element entrance: ~350ms, slight overshoot. */
  enter: { mass: 0.6, damping: 14, stiffness: 120 },
  /** Snappier, for small things like arrowheads and chips. */
  pop: { mass: 0.4, damping: 12, stiffness: 200 },
  /** Long ease for camera moves — 800ms+, no overshoot. */
  camera: { mass: 1.2, damping: 30, stiffness: 60 },
} as const;

/** Elements that lose focus dim rather than disappear. */
export const focus = {
  active: 1,
  dimmed: 0.4,
} as const;

/** The channel these clips publish under. Shown top-right on every frame. */
export const channel = process.env.CHANNEL_NAME ?? 'Your Channel';

export const fonts = {
  display: '"Poppins", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;
