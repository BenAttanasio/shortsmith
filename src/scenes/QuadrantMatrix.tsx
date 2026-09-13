import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { Chip } from '../components/Node';
import { SceneFrame, type SceneBase, useMirrorX } from '../components/SceneFrame';
import { palette, accent, radius, stroke, type, canvas, springs, AccentName } from '../theme';
import { enter, dimAfter } from '../anim/timing';
import { makeBeats } from '../anim/beats';

/**
 * "Two axes, four cases — here's which one you're in."
 *
 * The natural escalation of `contrast`: contrast is one-dimensional, this is two. Pairing
 * them across a week gives a week of reels genuinely different shapes, while staying in one
 * visual language.
 *
 * Use sparingly. Four text blocks at 38px is the most reading of any archetype here, and
 * it is the one most likely to fail the "muted playback still communicates" check — the
 * linter budgets it to twice per rolling ten for that reason.
 */

export type QuadrantMatrixProps = SceneBase & {
  columns: [string, string];
  /** Set rotated on the left strip — the §2 move. */
  rows: [string, string];
  /** Row-major: [top-left, top-right, bottom-left, bottom-right]. */
  cells: [string, string, string, string];
  /** 0-3, the recommended cell. */
  pick: number;
  pickLabel?: string;
  /**
   * The order cells appear in, as cell indices. Defaults to reading order.
   *
   * Exists because STYLE-GUIDE §6.1 requires elements to enter on the narrated word, and a
   * matrix is the one archetype where the script rarely walks the grid in reading order:
   * it usually saves the recommended quadrant for last, since that is the payoff. With a
   * fixed reading-order reveal, `WhenToUse` put "draft, then check" on screen roughly ten
   * seconds before the voice mentioned it.
   */
  revealOrder?: number[];
  accent?: AccentName;
};

/** Inset from the canvas edges so a frame-part push has somewhere to travel. */
const GRID = { left: 220, right: 1000, top: 740, bottom: 1300, gap: 24 };
const COL_W = (GRID.right - GRID.left - GRID.gap) / 2;
const ROW_H = (GRID.bottom - GRID.top - GRID.gap) / 2;
const MID_X = (GRID.left + GRID.right) / 2;
const MID_Y = (GRID.top + GRID.bottom) / 2;

const colCentre = (c: number) => GRID.left + COL_W / 2 + c * (COL_W + GRID.gap);
const rowCentre = (r: number) => GRID.top + ROW_H / 2 + r * (ROW_H + GRID.gap);

export const QuadrantMatrix: React.FC<QuadrantMatrixProps> = (props) => {
  const {
    columns, rows, cells, pick, pickLabel = 'start here',
    revealOrder = [0, 1, 2, 3], accent: tint = 'mint',
  } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mx = useMirrorX();

  const b = makeBeats(props.narrationFrames, {
    pace: props.variant?.pace,
    open: 0.1,
    buildFrom: 0.26,
    buildTo: 0.68,
    accent: 0.78,
    verdict: 0.84,
  });
  const headerAt = b.t(0.16);
  const dimAt = b.t(0.76);

  const pickCol = pick % 2;
  const pickRow = Math.floor(pick / 2);

  return (
    <SceneFrame
      scene={props}
      tint={tint}
      recedeAt={b.open}
      verdictAt={b.verdict}
      // The archetype frame-part was invented for: push in on the answer.
      defaultCamera="frame-part"
      focus={{
        x: mx(colCentre(pickCol)),
        y: rowCentre(pickRow),
        at: dimAt,
        until: b.t(0.94),
      }}
    >
      {/* Rules draw outward from the intersection — same motion family as ContrastPair's
          divider, so the grid doesn't read as a new grammar. */}
      <GutterRules at={b.open} />

      {columns.map((label, c) => (
        <ColumnHeader key={label} label={label} at={headerAt} x={mx(colCentre(c))} />
      ))}
      {rows.map((label, r) => (
        <RowLabel key={label} label={label} at={headerAt} y={rowCentre(r)} x={mx(GRID.left - 60)} />
      ))}

      {cells.map((text, i) => {
        const isPick = i === pick;
        return (
          <Cell
            key={`${i}-${text}`}
            text={text}
            at={b.build(Math.max(0, revealOrder.indexOf(i)), 4)}
            x={mx(colCentre(i % 2))}
            y={rowCentre(Math.floor(i / 2))}
            tint={tint}
            isPick={isPick}
            opacity={isPick ? 1 : dimAfter({ frame, fps, at: dimAt, active: frame < dimAt })}
          />
        );
      })}

      <Chip
        x={mx(colCentre(pickCol) + COL_W / 2 - 96)}
        y={rowCentre(pickRow) + ROW_H / 2 - 40}
        at={b.accent}
        tint={tint}
      >
        {pickLabel}
      </Chip>
    </SceneFrame>
  );
};

const Cell: React.FC<{
  text: string;
  at: number;
  x: number;
  y: number;
  tint: AccentName;
  isPick: boolean;
  opacity: number;
}> = ({ text, at, x, y, tint, isPick, opacity }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = enter({ frame, fps, at, from: 'up', distance: 16 });
  return (
    <div
      style={{
        position: 'absolute',
        left: x - COL_W / 2,
        top: y - ROW_H / 2,
        width: COL_W,
        height: ROW_H,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 24px',
        background: palette.surface,
        border: `${stroke.hairline}px solid ${isPick ? accent[tint] : palette.border}`,
        borderRadius: radius.lg,
        ...anim,
        opacity: (anim.opacity as number) * opacity,
      }}
    >
      <span
        style={{
          color: palette.ink,
          fontSize: type.label,
          fontWeight: isPick ? 600 : 500,
          lineHeight: 1.25,
        }}
      >
        {text}
      </span>
    </div>
  );
};

const ColumnHeader: React.FC<{ label: string; at: number; x: number }> = ({ label, at, x }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = enter({ frame, fps, at, from: 'up', distance: 10 });
  return (
    <div
      style={{
        position: 'absolute',
        left: x - COL_W / 2,
        top: GRID.top - 56,
        width: COL_W,
        textAlign: 'center',
        color: palette.inkMute,
        fontSize: type.arrowLabel,
        fontWeight: 500,
        letterSpacing: '0.04em',
        ...anim,
      }}
    >
      {label}
    </div>
  );
};

const RowLabel: React.FC<{ label: string; at: number; y: number; x: number }> = ({
  label,
  at,
  y,
  x,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = enter({ frame, fps, at, from: 'left', distance: 10 });
  return (
    <div
      style={{
        position: 'absolute',
        left: x - 30,
        top: y - ROW_H / 2,
        width: 60,
        height: ROW_H,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...anim,
      }}
    >
      <span
        style={{
          color: palette.inkMute,
          fontSize: type.arrowLabel,
          fontWeight: 500,
          letterSpacing: '0.04em',
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          transform: 'rotate(180deg)',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  );
};

/** The two axis lines, drawing outward from the centre. */
const GutterRules: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - at, fps, config: springs.enter });
  if (p <= 0.001) return null;

  const vHalf = ((GRID.bottom - GRID.top) / 2 + 20) * p;
  const hHalf = ((GRID.right - GRID.left) / 2 + 20) * p;
  const o = interpolate(p, [0, 1], [0, 0.9]);

  return (
    <svg
      width={canvas.width}
      height={canvas.height}
      style={{ position: 'absolute', inset: 0, opacity: o }}
    >
      <line
        x1={MID_X}
        y1={MID_Y - vHalf}
        x2={MID_X}
        y2={MID_Y + vHalf}
        stroke={palette.border}
        strokeWidth={stroke.hairline}
        strokeLinecap="round"
      />
      <line
        x1={MID_X - hHalf}
        y1={MID_Y}
        x2={MID_X + hHalf}
        y2={MID_Y}
        stroke={palette.border}
        strokeWidth={stroke.hairline}
        strokeLinecap="round"
      />
    </svg>
  );
};
