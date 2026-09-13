import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { accent, canvas, springs, stroke, type, AccentName } from '../theme';

/**
 * A brace spanning a group, with an optional label.
 *
 * Says "these N things are one thing" without drawing a container around them — which
 * matters because in STYLE-GUIDE §3 a container is a *claim* (solid = a real boundary,
 * dashed = a category). A brace groups without asserting either.
 *
 * Draws progressively like an arrow rather than fading, so it belongs to the same family
 * of motion as everything else on the stage. The end ticks land once the span is drawn.
 */
export const Brace: React.FC<{
  at: number;
  /** Which way the end ticks point — i.e. which side the braced group is on. */
  orientation?: 'under' | 'over' | 'left' | 'right';
  /** Start and end of the span: x for horizontal braces, y for vertical ones. */
  from: number;
  to: number;
  /** Cross-axis position: the y a horizontal brace sits on, the x a vertical one sits on. */
  pos: number;
  label?: string;
  tint?: AccentName;
  /** Length of the end ticks. */
  tick?: number;
}> = ({ at, orientation = 'under', from, to, pos, label, tint = 'mint', tick = 12 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - at, fps, config: springs.enter });
  if (p <= 0.001) return null;

  const horizontal = orientation === 'under' || orientation === 'over';
  // Ticks point back toward the group being braced.
  const tickDir = orientation === 'under' || orientation === 'right' ? -1 : 1;
  const span = to - from;
  const drawn = from + span * p;
  const done = p > 0.98;

  const path = horizontal
    ? `M ${from} ${pos + tick * tickDir} L ${from} ${pos} L ${drawn} ${pos}` +
      (done ? ` L ${to} ${pos + tick * tickDir}` : '')
    : `M ${pos + tick * tickDir} ${from} L ${pos} ${from} L ${pos} ${drawn}` +
      (done ? ` L ${pos + tick * tickDir} ${to}` : '');

  const labelOpacity = interpolate(p, [0.6, 1], [0, 1], { extrapolateLeft: 'clamp' });
  const mid = (from + to) / 2;

  return (
    <>
      <svg width={canvas.width} height={canvas.height} style={{ position: 'absolute', inset: 0 }}>
        <path
          d={path}
          stroke={accent[tint]}
          strokeWidth={stroke.hairline}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {label ? (
        <div
          style={{
            position: 'absolute',
            ...(horizontal
              ? {
                  left: 0,
                  right: 0,
                  top: orientation === 'under' ? pos + 22 : pos - 22 - type.label,
                  textAlign: 'center',
                }
              : {
                  // Vertical braces set their label along the axis, per §2.
                  left: orientation === 'left' ? pos - 46 : pos + 22,
                  top: mid,
                  transform: 'translateY(-50%)',
                }),
            opacity: labelOpacity,
          }}
        >
          <span
            style={{
              color: accent[tint],
              fontSize: type.label,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              ...(horizontal
                ? {}
                : {
                    display: 'inline-block',
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                    transform: orientation === 'left' ? 'rotate(180deg)' : undefined,
                  }),
            }}
          >
            {label}
          </span>
        </div>
      ) : null}
    </>
  );
};
