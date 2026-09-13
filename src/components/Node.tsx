import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { palette, radius, stroke, type, accent, AccentName } from '../theme';
import { enter } from '../anim/timing';

/**
 * The container grammar from STYLE-GUIDE §3.
 *
 *   variant="solid"  → a concrete, bounded system. Things cross this boundary.
 *   variant="dashed" → a conceptual grouping. "These are the same kind of thing."
 *
 * The distinction is load-bearing; don't pick by taste.
 */
export const Node: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  /** Frame this node is narrated on. */
  at: number;
  variant?: 'solid' | 'dashed';
  label?: string;
  /** Rotate the label 90° along the long axis — for tall, narrow regions. */
  labelVertical?: boolean;
  labelPosition?: 'inside-bottom' | 'below' | 'inside-top';
  tint?: AccentName;
  opacity?: number;
  /** Entrance direction. Per-reel variation; defaults to the house 'up'. */
  from?: 'up' | 'down' | 'left' | 'right';
  children?: React.ReactNode;
}> = ({
  x,
  y,
  w,
  h,
  at,
  variant = 'solid',
  label,
  labelVertical = false,
  labelPosition = 'inside-bottom',
  tint,
  opacity = 1,
  from = 'up',
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = enter({ frame, fps, at, from });
  const borderColor = tint ? accent[tint] : palette.border;

  const labelEl = label ? (
    <span
      style={{
        color: palette.ink,
        fontSize: type.label,
        fontWeight: 500,
        whiteSpace: 'pre-line',
        textAlign: 'center',
        lineHeight: 1.25,
        ...(labelVertical
          ? { writingMode: 'vertical-rl', textOrientation: 'mixed' }
          : {}),
      }}
    >
      {label}
    </span>
  ) : null;

  return (
    <div
      style={{
        position: 'absolute',
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        ...anim,
        opacity: anim.opacity * opacity,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: palette.surface,
          border: `${stroke.hairline}px ${variant === 'dashed' ? 'dashed' : 'solid'} ${borderColor}`,
          borderRadius: radius.lg,
        }}
      />

      {/* Content sits centred; labels are placed relative to the box. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </div>

      {/* A vertical label rides the container's long axis at its inner left edge — it
          labels the *region*, not the contents (§2). It must not sit in the centre: for a
          nested container that puts it directly under whatever is drawn inside, where it
          is invisible. */}
      {labelVertical && label ? (
        <div
          style={{
            position: 'absolute',
            left: 18,
            top: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {labelEl}
        </div>
      ) : null}

      {!labelVertical && label ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            ...(labelPosition === 'below'
              ? { top: h + 16 }
              : labelPosition === 'inside-top'
                ? { top: 20 }
                : { bottom: 20 }),
          }}
        >
          {labelEl}
        </div>
      ) : null}
    </div>
  );
};

/**
 * The filled highlight chip — cyan fill, dark text (see frame f_017,
 * "Condition-action rules"). Use for the one thing the narration is naming right now.
 */
export const Chip: React.FC<{
  x: number;
  y: number;
  at: number;
  tint?: AccentName;
  children: React.ReactNode;
}> = ({ x, y, at, tint = 'cyan', children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = enter({ frame, fps, at, from: 'up', distance: 8 });
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) ${anim.transform}`,
        opacity: anim.opacity,
        background: accent[tint],
        color: palette.bg,
        fontSize: type.arrowLabel,
        fontWeight: 600,
        padding: '10px 20px',
        borderRadius: radius.sm,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </div>
  );
};
