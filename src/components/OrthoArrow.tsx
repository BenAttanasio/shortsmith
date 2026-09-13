import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { getLength } from '@remotion/paths';
import { palette, stroke, type, canvas, springs, accent, AccentName } from '../theme';
import { drawEase } from '../anim/timing';

/**
 * A right-angled arrow.
 *
 * STYLE-GUIDE §4: "Orthogonal (right-angle) routing inside containers; straight diagonals
 * between them." Straight `Arrow` covers the second half; this is the first, and it was
 * unimplemented until now.
 *
 * Use it when the arrow has to get *around* something — out of a card, past a ring, into
 * a chip that isn't on the same axis. A diagonal across a container reads as cutting
 * through it; an orthogonal route reads as leaving by the edge.
 */

export type Route = 'h-v' | 'v-h' | 'h-v-h' | 'v-h-v';

/** Build the corner points for a route. */
const cornersFor = (
  route: Route,
  [ax, ay]: [number, number],
  [bx, by]: [number, number],
): [number, number][] => {
  switch (route) {
    case 'h-v':
      return [[bx, ay]];
    case 'v-h':
      return [[ax, by]];
    case 'h-v-h': {
      const midX = (ax + bx) / 2;
      return [
        [midX, ay],
        [midX, by],
      ];
    }
    case 'v-h-v':
    default: {
      const midY = (ay + by) / 2;
      return [
        [ax, midY],
        [bx, midY],
      ];
    }
  }
};

/** Rounded corner via quadratic curve, shortened along both legs by `r`. */
const buildPath = (pts: [number, number][], r: number) => {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];

    const inLen = Math.hypot(cx - px, cy - py) || 1;
    const outLen = Math.hypot(nx - cx, ny - cy) || 1;
    const ri = Math.min(r, inLen / 2, outLen / 2);

    const ix = cx - ((cx - px) / inLen) * ri;
    const iy = cy - ((cy - py) / inLen) * ri;
    const ox = cx + ((nx - cx) / outLen) * ri;
    const oy = cy + ((ny - cy) / outLen) * ri;

    d += ` L ${ix} ${iy} Q ${cx} ${cy} ${ox} ${oy}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
};

export const OrthoArrow: React.FC<{
  from: [number, number];
  to: [number, number];
  at: number;
  route?: Route;
  duration?: number;
  label?: string;
  tint?: AccentName;
  opacity?: number;
  /** Pull the endpoints back so the line clears node borders. */
  inset?: number;
  /** Corner radius. */
  radius?: number;
}> = ({
  from,
  to,
  at,
  route = 'h-v',
  duration = 13,
  label,
  tint,
  opacity = 1,
  inset = 8,
  radius = 22,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const color = tint ? accent[tint] : palette.ink;

  const corners = cornersFor(route, from, to);

  // The final leg decides the head's direction, so trim along that axis only.
  const lastCorner = corners[corners.length - 1] ?? from;
  const fdx = to[0] - lastCorner[0];
  const fdy = to[1] - lastCorner[1];
  const fLen = Math.hypot(fdx, fdy) || 1;
  const fux = fdx / fLen;
  const fuy = fdy / fLen;
  const headRoom = 18;
  const end: [number, number] = [
    to[0] - fux * (inset + headRoom),
    to[1] - fuy * (inset + headRoom),
  ];

  // Same for the first leg and the origin dot.
  const firstCorner = corners[0] ?? to;
  const sdx = firstCorner[0] - from[0];
  const sdy = firstCorner[1] - from[1];
  const sLen = Math.hypot(sdx, sdy) || 1;
  const start: [number, number] = [
    from[0] + (sdx / sLen) * inset,
    from[1] + (sdy / sLen) * inset,
  ];

  const pts: [number, number][] = [start, ...corners, end];
  const d = buildPath(pts, radius);
  const len = getLength(d) || 1;

  const p = drawEase(frame, at, duration);
  const headP = spring({ frame: frame - (at + duration - 2), fps, config: springs.pop });
  const headAngle = (Math.atan2(fuy, fux) * 180) / Math.PI;

  // Label rides the longest leg, offset perpendicular to it.
  const legs = pts.slice(0, -1).map((pt, i) => ({
    a: pt,
    b: pts[i + 1],
    len: Math.hypot(pts[i + 1][0] - pt[0], pts[i + 1][1] - pt[1]),
  }));
  const longest = legs.reduce((m, l) => (l.len > m.len ? l : m), legs[0]);
  const lmx = (longest.a[0] + longest.b[0]) / 2;
  const lmy = (longest.a[1] + longest.b[1]) / 2;
  const lAngle = (Math.atan2(longest.b[1] - longest.a[1], longest.b[0] - longest.a[0]) * 180) / Math.PI;
  const labelAngle = lAngle > 90 || lAngle < -90 ? lAngle + 180 : lAngle;
  const perp = 26;
  const lux = (longest.b[0] - longest.a[0]) / (longest.len || 1);
  const luy = (longest.b[1] - longest.a[1]) / (longest.len || 1);

  return (
    <svg
      width={canvas.width}
      height={canvas.height}
      style={{ position: 'absolute', inset: 0, overflow: 'visible', opacity }}
    >
      <circle
        cx={start[0]}
        cy={start[1]}
        r={stroke.line * 1.8}
        fill={color}
        opacity={interpolate(p, [0, 0.12], [0, 1], { extrapolateRight: 'clamp' })}
      />

      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={stroke.line}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - p)}
      />

      <g
        transform={`translate(${to[0] - fux * inset} ${to[1] - fuy * inset}) rotate(${headAngle}) scale(${Math.max(0, headP)})`}
        opacity={Math.min(1, headP * 2)}
      >
        <path d="M 0 0 L -16.5 -8.25 L -12.65 0 L -16.5 8.25 Z" fill={color} />
      </g>

      {label ? (
        <g
          transform={`translate(${lmx - luy * perp} ${lmy + lux * perp}) rotate(${labelAngle})`}
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
