import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Node } from '../components/Node';
import { SceneFrame, type SceneBase } from '../components/SceneFrame';
import { palette, accent, type, canvas, springs, stroke, AccentName } from '../theme';
import { dimAfter } from '../anim/timing';
import { makeBeats } from '../anim/beats';

/**
 * "A, versus B" — the contrast archetype.
 *
 * This is the visual form of the highest-leverage sentence pattern in the whole style
 * guide (§7): *define by contrast against the thing the viewer already knows*. The
 * viewer's existing mental model goes on top; the new idea is defined as a delta from
 * it underneath.
 *
 * Stacked rather than side-by-side because 1080 wide cannot carry two columns of
 * readable type — vertical reads top-to-bottom (§8).
 *
 * The top panel dims to 0.4 when the bottom one lands, so attention moves without
 * anything leaving the frame.
 */

export type ContrastSide = {
  label: string;
  sub: string;
  accent: AccentName;
};

export type ContrastProps = SceneBase & {
  left: ContrastSide;
  right: ContrastSide;
};

// Panels sit above band.stageFloor (1330); the verdict no longer competes for this space
// because SceneFrame anchors it to its own baseline outside the camera layer.
const PANEL = { w: 880, h: 280 };
const TOP_Y = 716;
const BOT_Y = 1100;

export const ContrastPair: React.FC<ContrastProps> = (props) => {
  const { left, right } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // The first panel lands at 12%, not 26%. At 26% the stage was empty for the opening
  // five seconds of every clip — the frame was pure text exactly when it most needed to
  // be a diagram.
  const b = makeBeats(props.narrationFrames, {
    pace: props.variant?.pace,
    buildFrom: 0.12,
    buildTo: 0.52,
    verdict: 0.84,
  });
  const topAt = b.build(0, 2);
  const botAt = b.build(1, 2);
  const dividerAt = botAt - 8; // a lead-in, not a beat — the rule draws just ahead of the panel

  // The first panel yields focus once the second one lands.
  const topOpacity = dimAfter({ frame, fps, at: botAt, active: frame < botAt });
  const from = props.variant?.entrance ?? 'up';

  return (
    <SceneFrame
      scene={props}
      // The frame already spends its two accents on the two sides of the contrast, so
      // the caption borrows the second rather than introducing a third.
      tint={right.accent}
      recedeAt={topAt}
      verdictAt={b.verdict}
      defaultCamera="push"
    >
      <Panel side={left} y={TOP_Y} at={topAt} opacity={topOpacity} from={from} />
      <Divider at={dividerAt} />
      <Panel side={right} y={BOT_Y} at={botAt} opacity={1} from={from} />
    </SceneFrame>
  );
};

/**
 * One side of the contrast. The accent tints only the border and the sub-label —
 * the primary label stays ink, so the two panels read as the same kind of object
 * rather than as two different colour-coded things.
 */
const Panel: React.FC<{
  side: ContrastSide;
  y: number;
  at: number;
  opacity: number;
  from: 'up' | 'down' | 'left' | 'right';
}> = ({ side, y, at, opacity, from }) => (
  <Node
    x={540}
    y={y}
    w={PANEL.w}
    h={PANEL.h}
    at={at}
    variant="solid"
    tint={side.accent}
    opacity={opacity}
    from={from}
  >
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      <span
        style={{
          color: palette.ink,
          fontSize: type.heading,
          fontWeight: 600,
          letterSpacing: '-0.02em',
        }}
      >
        {side.label}
      </span>
      <span
        style={{
          color: accent[side.accent],
          fontSize: type.label,
          fontWeight: 500,
          textAlign: 'center',
          lineHeight: 1.25,
        }}
      >
        {side.sub}
      </span>
    </div>
  </Node>
);

/**
 * A hairline rule between the two panels with "vs" sitting on it. Draws outward from
 * the centre rather than fading, so it reads as the same family of motion as an arrow.
 */
const Divider: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - at, fps, config: springs.enter });
  if (p <= 0.001) return null;

  const y = (TOP_Y + PANEL.h / 2 + BOT_Y - PANEL.h / 2) / 2;
  const half = (PANEL.w / 2) * p;

  return (
    <>
      <svg width={canvas.width} height={canvas.height} style={{ position: 'absolute', inset: 0 }}>
        <line
          x1={540 - half}
          y1={y}
          x2={540 + half}
          y2={y}
          stroke={palette.border}
          strokeWidth={stroke.hairline}
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: y,
          textAlign: 'center',
          transform: 'translateY(-50%)',
          opacity: interpolate(p, [0.5, 1], [0, 1], { extrapolateLeft: 'clamp' }),
        }}
      >
        <span
          style={{
            color: palette.inkMute,
            fontSize: type.arrowLabel,
            fontWeight: 500,
            background: palette.bg,
            padding: '0 24px',
          }}
        >
          vs
        </span>
      </div>
    </>
  );
};
