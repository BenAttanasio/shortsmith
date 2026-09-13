import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Stage } from './Stage';
import { Hook, type HookTreatment } from './Hook';
import { Caption, layoutWords, type Word, type Speech } from './Caption';
import { palette, type, canvas, band, cameraSpec, springs, AccentName } from '../theme';
import { enter } from '../anim/timing';
import type { Pace } from '../anim/beats';

/**
 * The shell every archetype renders inside.
 *
 * It owns **no stage geometry** — each archetype keeps its own coordinates, beats and
 * container grammar. What it owns is the three things that were previously duplicated
 * *by accident*: the verdict block (copy-pasted into three scenes with three different
 * y-computations), the camera transform (four copies with drifting values), and the
 * Stage/Hook/Caption boilerplate.
 *
 * Two of those become knobs rather than constants, so consolidating them increases
 * variety instead of reducing it: `camera` and `hook` are now per-reel choices.
 *
 * ---------------------------------------------------------------------------
 * The verdict fix
 * ---------------------------------------------------------------------------
 * The verdict is **bottom-anchored at band.verdictBottom and rendered outside the camera
 * layer**. Previously each scene computed it from its own last element and put it inside
 * the camera, so a two-line verdict on a tall diagram was pushed down into the caption
 * zone by the very zoom that was supposed to be decorative. No camera move can do that
 * now — scale, drift and frame-part all apply to `children` only.
 */

export type CameraMove =
  /** 1 → 1.045. The old house default. */
  | 'push'
  /** 1.06 → 1. Starts tight, pulls back — pairs with builds that add outward. */
  | 'settle'
  | 'drift-up'
  | 'drift-left'
  /** No transform. For archetypes where the diagram *is* text and scaling softens it. */
  | 'hold'
  /** Pushes in on a focus point, then returns. STYLE-GUIDE §6.5. */
  | 'frame-part';

export type EntranceDir = 'up' | 'down' | 'left' | 'right';

/**
 * Per-reel variation, authored in content/reels.json.
 *
 * Deterministic by construction — no RNG, no clock, no hashing of the id. Two renders of
 * the same reel are byte-comparable, which is what makes the verification frames in
 * out/check/ worth looking at.
 */
export type SceneVariant = {
  camera?: CameraMove;
  hook?: HookTreatment;
  entrance?: EntranceDir;
  /** Flips asymmetric archetypes. Ignored by symmetric ones; the linter warns. */
  mirror?: boolean;
  /** Overrides the caption tint. Still one of the frame's two accents. */
  captionTint?: AccentName;
  pace?: Pace;
};

/** Props every archetype shares. */
export type SceneBase = {
  title: string;
  hook: string;
  narration: string;
  /** From calculateMetadata, reading the real WAV. The clock. */
  narrationFrames: number;
  /**
   * Where the voice actually is inside that WAV. Supplied by calculateMetadata from
   * `content/.audio-manifest.json`; absent only for a reel built before speech analysis
   * existed, in which case captions fall back to spreading across the whole clip and will
   * run ahead of the voice. Rebuild the reel to fix that.
   */
  speech?: Speech;
  verdict?: string;
  guides?: boolean;
  variant?: SceneVariant;
};

/**
 * Mirroring is a coordinate signal, never a CSS transform: `scaleX(-1)` on the stage
 * would mirror every label with it. Asymmetric archetypes route their x through `mx()`.
 */
const MirrorContext = React.createContext(false);

export const useMirrorX = () => {
  const mirrored = React.useContext(MirrorContext);
  return React.useCallback((x: number) => (mirrored ? canvas.width - x : x), [mirrored]);
};

export const SceneFrame: React.FC<{
  scene: SceneBase;
  /** Caption tint the archetype derives from its own accent. */
  tint: AccentName;
  /** Frame the hook starts receding on — normally the scene's first build beat. */
  recedeAt: number;
  verdictAt: number;
  /** Only read when the camera is `frame-part`. Canvas coords, resolved frames. */
  focus?: { x: number; y: number; at: number; until: number };
  /** Default camera when the reel doesn't specify one. */
  defaultCamera?: CameraMove;
  children: React.ReactNode;
}> = ({ scene, tint, recedeAt, verdictAt, focus, defaultCamera = 'push', children }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const v = scene.variant ?? {};

  const words: Word[] = layoutWords(scene.narration, 0, scene.narrationFrames, scene.speech, fps);
  const captionTint = v.captionTint ?? tint;
  const camera = cameraTransform(v.camera ?? defaultCamera, frame, fps, durationInFrames, focus);

  // The `kicker` treatment *relocates* the title into an eyebrow above the hook, so the
  // title bar drops to brand-only. Rendering both put the same string on screen twice.
  const treatment = v.hook ?? 'center';
  const isKicker = treatment === 'kicker';

  return (
    <Stage title={isKicker ? undefined : scene.title} guides={scene.guides}>
      <Hook
        text={scene.hook}
        at={2}
        recedeAt={recedeAt}
        treatment={treatment}
        kicker={scene.title}
        tint={tint}
      />

      <AbsoluteFill style={camera}>
        <MirrorContext.Provider value={v.mirror ?? false}>{children}</MirrorContext.Provider>
      </AbsoluteFill>

      {/* Outside the camera layer. This is the whole fix. */}
      {scene.verdict ? <Verdict text={scene.verdict} at={verdictAt} /> : null}

      <Caption words={words} tint={captionTint} />

      {scene.guides ? <BandGuides /> : null}
    </Stage>
  );
};

/** Resolves a camera move to a style object. */
const cameraTransform = (
  move: CameraMove,
  frame: number,
  fps: number,
  durationInFrames: number,
  focus?: { x: number; y: number; at: number; until: number },
): React.CSSProperties => {
  const ramp = (from: number, to: number) =>
    interpolate(frame, [0, durationInFrames], [from, to], { extrapolateRight: 'clamp' });

  switch (move) {
    case 'hold':
      return {};

    case 'settle':
      return {
        transform: `scale(${ramp(cameraSpec.settle.from, cameraSpec.settle.to)})`,
        transformOrigin: '50% 55%',
      };

    case 'drift-up':
      return {
        transform: `scale(${cameraSpec.drift.scale}) translateY(${ramp(0, cameraSpec.drift.dy)}px)`,
        transformOrigin: '50% 55%',
      };

    case 'drift-left':
      return {
        transform: `scale(${cameraSpec.drift.scale}) translateX(${ramp(0, cameraSpec.drift.dx)}px)`,
        transformOrigin: '50% 55%',
      };

    case 'frame-part': {
      if (!focus) return { transform: `scale(${ramp(1, cameraSpec.push.to)})`, transformOrigin: '50% 55%' };
      // In on the focus point, hold, then back out. Long ease both ways — §6.5 reserves
      // cuts for genuine topic changes.
      const inP = spring({ frame: frame - focus.at, fps, config: springs.camera });
      const outP = spring({ frame: frame - focus.until, fps, config: springs.camera });
      const s = interpolate(inP - outP, [0, 1], [1, cameraSpec.framePart.scale]);
      return {
        transform: `scale(${s})`,
        transformOrigin: `${(focus.x / canvas.width) * 100}% ${(focus.y / canvas.height) * 100}%`,
      };
    }

    case 'push':
    default:
      return {
        transform: `scale(${ramp(cameraSpec.push.from, cameraSpec.push.to)})`,
        transformOrigin: '50% 55%',
      };
  }
};

/**
 * The closing line, in ink rather than an accent — it's a conclusion, not a category.
 *
 * Bottom-anchored: the text grows upward from `band.verdictBottom`, so a second line
 * pushes into the diagram's air rather than into the captions. `justifyContent: flex-end`
 * on a fixed-top box is what does it.
 */
const Verdict: React.FC<{ text: string; at: number }> = ({ text, at }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = enter({ frame, fps, at, from: 'up', distance: 12 });

  return (
    <div
      style={{
        position: 'absolute',
        left: 90,
        right: 90,
        top: band.stageFloor,
        height: band.verdictBottom - band.stageFloor,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        textAlign: 'center',
        ...anim,
      }}
    >
      <span
        style={{
          color: palette.ink,
          fontSize: type.body,
          fontWeight: 500,
          lineHeight: 1.25,
          whiteSpace: 'pre-line',
        }}
      >
        {text}
      </span>
    </div>
  );
};

/** Dev overlay for the band contract — the lines the archetypes are designed against. */
const BandGuides: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {(
      [
        [band.diagramTop, 'diagram top 560'],
        [band.stageFloor, 'stage floor 1330'],
        [band.verdictBottom, 'verdict baseline 1462'],
      ] as const
    ).map(([y, label]) => (
      <div key={label} style={{ position: 'absolute', top: y, left: 0, right: 0 }}>
        <div style={{ height: 1, background: palette.inkFaint, opacity: 0.5 }} />
        <span style={{ color: palette.inkFaint, fontSize: 20, paddingLeft: 8 }}>{label}</span>
      </div>
    ))}
  </AbsoluteFill>
);
