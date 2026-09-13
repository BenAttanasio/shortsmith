import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { palette, stroke, type, canvas, springs, accent, AccentName } from '../theme';
import { drawEase } from '../anim/timing';

/**
 * The arrow grammar from STYLE-GUIDE §4.
 *
 * Arrows *draw* (stroke-dashoffset), they never fade. The origin dot disambiguates
 * direction before the eye reaches the head. Diagonal labels rotate to ride the line —
 * this is the single most identifiable ByteByteGo move.
 */
export const Arrow: React.FC<{
  from: [number, number];
  to: [number, number];
  /** Frame the arrow is narrated on. */
  at: number;
  /** Frames the stroke takes to draw. ~350ms at 30fps ≈ 10. */
  duration?: number;
  label?: string;
  bidirectional?: boolean;
  tint?: AccentName;
  opacity?: number;
  /** Pull the line short of its endpoints so it doesn't collide with node borders. */
  inset?: number;
}> = ({
  from,
  to,
  at,
  duration = 11,
  label,
  bidirectional = false,
  tint,
  opacity = 1,
  inset = 10,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const color = tint ? accent[tint] : palette.ink;

  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  // Trim both ends so the head sits clear of whatever it points at.
  const headRoom = 18;
  const x1 = from[0] + ux * inset;
  const y1 = from[1] + uy * inset;
  const x2 = to[0] - ux * (inset + headRoom);
  const y2 = to[1] - uy * (inset + headRoom);
  const drawLen = Math.hypot(x2 - x1, y2 - y1) || 1;

  const p = drawEase(frame, at, duration);
  // The head pops in with a tiny overshoot once the stroke lands.
  const headP = spring({ frame: frame - (at + duration - 2), fps, config: springs.pop });
  const tailP = bidirectional
    ? spring({ frame: frame - (at + duration - 2), fps, config: springs.pop })
    : 0;

  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

  // §4 says labels rotate to follow *diagonal* arrows. A near-vertical arrow is the case
  // that rule doesn't cover: rotating to 90° (or the flipped 270°) renders the label as a
  // column of characters running down the stroke, which is unreadable. So vertical arrows
  // keep a horizontal label and offset it sideways instead.
  const nearVertical = Math.abs(Math.abs(angleDeg) - 90) < 25;
  const labelAngle = nearVertical
    ? 0
    : angleDeg > 90 || angleDeg < -90
      ? angleDeg + 180
      : angleDeg;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  // Offset perpendicular to the line so the label never sits on the stroke. Vertical
  // arrows need more room, because the label extends horizontally from its midpoint.
  const perpDist = nearVertical ? 20 + textApproxHalfWidth(label) : 26;
  const perpX = -uy * perpDist;
  const perpY = ux * perpDist;

  return (
    <svg
      width={canvas.width}
      height={canvas.height}
      style={{ position: 'absolute', inset: 0, overflow: 'visible', opacity }}
    >
      {/* origin dot */}
      <circle
        cx={x1}
        cy={y1}
        r={stroke.line * 1.8}
        fill={color}
        opacity={interpolate(p, [0, 0.12], [0, 1], { extrapolateRight: 'clamp' })}
      />

      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={stroke.line}
        strokeLinecap="round"
        strokeDasharray={drawLen}
        strokeDashoffset={drawLen * (1 - p)}
      />

      <ArrowHead x={to[0] - ux * inset} y={to[1] - uy * inset} angle={angleDeg} p={headP} color={color} />
      {bidirectional ? (
        <ArrowHead x={from[0] + ux * inset} y={from[1] + uy * inset} angle={angleDeg + 180} p={tailP} color={color} />
      ) : null}

      {label ? (
        <g
          transform={`translate(${midX + perpX} ${midY + perpY}) rotate(${labelAngle})`}
          opacity={interpolate(p, [0.5, 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
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

/**
 * Rough half-width of a label at `type.arrowLabel`, used only to push a vertical arrow's
 * label clear of its own stroke. Poppins averages ~0.52em across mixed-case text; being a
 * few pixels out just changes the gap, never the legibility.
 */
const textApproxHalfWidth = (s?: string) =>
  s ? (s.length * type.arrowLabel * 0.52) / 2 : 0;

const ArrowHead: React.FC<{
  x: number;
  y: number;
  angle: number;
  p: number;
  color: string;
}> = ({ x, y, angle, p, color }) => {
  const s = 11;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${Math.max(0, p)})`} opacity={Math.min(1, p * 2)}>
      <path d={`M 0 0 L ${-s * 1.5} ${-s * 0.75} L ${-s * 1.15} 0 L ${-s * 1.5} ${s * 0.75} Z`} fill={color} />
    </g>
  );
};
