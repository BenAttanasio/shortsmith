import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { getLength } from '@remotion/paths';
import { palette, stroke, type, canvas, springs, accent, AccentName } from '../theme';
import { drawEase } from '../anim/timing';

/**
 * An arrow that rides an ellipse — the edge of a cycle.
 *
 * Same grammar as `Arrow` (§4): draws rather than fades, origin dot, solid triangular
 * head, label upright and riding the line. The difference is that every one of those has
 * to be computed from the arc's tangent rather than from a straight line's angle.
 *
 * The label flip is not optional. Without it, the tangent at the bottom of a ring points
 * left and every label there renders upside-down.
 */

const DEG = Math.PI / 180;

/** Point on the ellipse at angle t (degrees). */
const pointAt = (cx: number, cy: number, rx: number, ry: number, t: number): [number, number] => [
  cx + rx * Math.cos(t * DEG),
  cy + ry * Math.sin(t * DEG),
];

/** Tangent direction at angle t, in degrees, following increasing t. */
const tangentAt = (rx: number, ry: number, t: number, sweep: 1 | 0) => {
  const dx = -rx * Math.sin(t * DEG);
  const dy = ry * Math.cos(t * DEG);
  const a = (Math.atan2(dy, dx) * 180) / Math.PI;
  return sweep === 1 ? a : a + 180;
};

export const ArcArrow: React.FC<{
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Start and end angles in degrees, 0 = east, increasing clockwise on screen. */
  fromAngle: number;
  toAngle: number;
  at: number;
  duration?: number;
  label?: string;
  tint?: AccentName;
  opacity?: number;
  /** Emphasis — the closing edge of a loop is the moment the clip exists for. */
  bold?: boolean;
  /** How far outside the ring the label sits. */
  labelOffset?: number;
}> = ({
  cx,
  cy,
  rx,
  ry,
  fromAngle,
  toAngle,
  at,
  duration = 12,
  label,
  tint,
  opacity = 1,
  bold = false,
  labelOffset = 52,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const color = tint ? accent[tint] : palette.ink;

  // Always travel the short way round, in the direction of increasing angle.
  let sweepDeg = toAngle - fromAngle;
  while (sweepDeg <= -180) sweepDeg += 360;
  while (sweepDeg > 180) sweepDeg -= 360;
  const sweep: 1 | 0 = sweepDeg >= 0 ? 1 : 0;
  const largeArc = Math.abs(sweepDeg) > 180 ? 1 : 0;

  const [x1, y1] = pointAt(cx, cy, rx, ry, fromAngle);
  const [x2, y2] = pointAt(cx, cy, rx, ry, toAngle);
  const d = `M ${x1} ${y1} A ${rx} ${ry} 0 ${largeArc} ${sweep} ${x2} ${y2}`;

  const len = getLength(d) || 1;
  const p = drawEase(frame, at, duration);
  const headP = spring({ frame: frame - (at + duration - 2), fps, config: springs.pop });

  const headAngle = tangentAt(rx, ry, toAngle, sweep);
  const midAngle = fromAngle + sweepDeg / 2;
  const [mx, my] = pointAt(cx, cy, rx, ry, midAngle);

  // Push the label outward, away from the ring's centre. 52 rather than 34 because at the
  // smaller offset a 4-node ring puts every diagonal label on top of a node box — the
  // labels sit in the gaps between nodes, and those gaps are outside the ring, not on it.
  const outX = mx - cx;
  const outY = my - cy;
  const outLen = Math.hypot(outX, outY) || 1;
  const lx = mx + (outX / outLen) * labelOffset;
  const ly = my + (outY / outLen) * labelOffset;

  const rawLabelAngle = tangentAt(rx, ry, midAngle, sweep);
  const labelAngle =
    rawLabelAngle > 90 || rawLabelAngle < -90 ? rawLabelAngle + 180 : rawLabelAngle;

  return (
    <svg
      width={canvas.width}
      height={canvas.height}
      style={{ position: 'absolute', inset: 0, overflow: 'visible', opacity }}
    >
      <circle
        cx={x1}
        cy={y1}
        r={stroke.line * 1.8}
        fill={color}
        opacity={interpolate(p, [0, 0.12], [0, 1], { extrapolateRight: 'clamp' })}
      />

      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={bold ? stroke.bold : stroke.line}
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - p)}
      />

      <g
        transform={`translate(${x2} ${y2}) rotate(${headAngle}) scale(${Math.max(0, headP)})`}
        opacity={Math.min(1, headP * 2)}
      >
        <path d="M 0 0 L -16.5 -8.25 L -12.65 0 L -16.5 8.25 Z" fill={color} />
      </g>

      {label ? (
        <g
          transform={`translate(${lx} ${ly}) rotate(${labelAngle})`}
          opacity={interpolate(p, [0.5, 1], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })}
        >
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            fill={palette.inkMute}
            fontSize={type.arrowLabel}
            fontWeight={500}
            fontFamily="Poppins, sans-serif"
          >
            {label}
          </text>
        </g>
      ) : null}
    </svg>
  );
};
