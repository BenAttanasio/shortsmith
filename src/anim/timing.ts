import { interpolate, spring, Easing } from 'remotion';
import { springs, focus } from '../theme';

/**
 * Animation helpers. Every entrance in this system routes through here so that
 * timing stays consistent across scenes — the "progressive build" from
 * STYLE-GUIDE §6 only reads as intentional if every element moves the same way.
 */

type EnterOpts = {
  frame: number;
  fps: number;
  /** Frame the element is narrated on. Entrances land on the word, not a fixed beat. */
  at: number;
  config?: { mass: number; damping: number; stiffness: number };
};

/** 0 → 1 spring progress, clamped before `at`. */
export const enterProgress = ({ frame, fps, at, config = springs.enter }: EnterOpts) =>
  spring({ frame: frame - at, fps, config, durationInFrames: undefined });

/**
 * Standard entrance: fade + directional slide + slight scale.
 * Returns a style object ready to spread onto a wrapper.
 */
export const enter = (
  opts: EnterOpts & { from?: 'up' | 'down' | 'left' | 'right' | 'none'; distance?: number },
) => {
  const p = enterProgress(opts);
  const d = opts.distance ?? 14;
  const dir = opts.from ?? 'up';
  const off = (1 - p) * d;
  const translate =
    dir === 'up' ? `translateY(${off}px)`
    : dir === 'down' ? `translateY(${-off}px)`
    : dir === 'left' ? `translateX(${off}px)`
    : dir === 'right' ? `translateX(${-off}px)`
    : '';
  return {
    opacity: Math.min(1, p * 1.2),
    transform: `${translate} scale(${interpolate(p, [0, 1], [0.94, 1])})`.trim(),
  };
};

/**
 * Focus state. Elements dim to 0.4 when attention moves elsewhere rather than
 * leaving the frame — nothing ever disappears mid-diagram.
 */
export const dimAfter = ({
  frame,
  fps,
  at,
  active,
}: {
  frame: number;
  fps: number;
  /** Frame at which focus moves away. */
  at: number;
  /** Whether this element is the current focus. */
  active: boolean;
}) => {
  if (active) return focus.active;
  const p = spring({ frame: frame - at, fps, config: springs.camera });
  return interpolate(p, [0, 1], [focus.active, focus.dimmed]);
};

/** Long, no-overshoot ease for camera moves. */
export const cameraEase = (frame: number, fps: number, at: number) =>
  spring({ frame: frame - at, fps, config: springs.camera });

/** Linear-ish ease-out for stroke drawing. */
export const drawEase = (frame: number, at: number, durationInFrames: number) =>
  interpolate(frame, [at, at + durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
