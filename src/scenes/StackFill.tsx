import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SceneFrame, type SceneBase, useMirrorX } from '../components/SceneFrame';
import { palette, accent, radius, stroke, type, AccentName } from '../theme';
import { enter } from '../anim/timing';
import { makeBeats } from '../anim/beats';

/**
 * "Everything that fits inside the boundary" — the bounded-region archetype.
 *
 * A *solid* container, because the whole argument of these clips is that the region is
 * concrete and finite (STYLE-GUIDE §3: solid = a real boundary things cross). Items
 * land inside it one at a time as the narration names them, so the viewer watches the
 * space fill rather than being shown a full list and asked to read it.
 *
 * The region label is set rotated 90° along the container's long axis — the signature
 * move from §2 for tall narrow regions. It labels the *region*, not the contents.
 */

export type StackProps = SceneBase & {
  items: string[];
  /** Rotated region label running down the side of the container. */
  regionLabel: string;
  accent?: AccentName;
};

/**
 * The box lands on band.stageFloor (1330) rather than 1370, and is offset right of centre
 * so the rotated label has a column of its own.
 */
const BOX = { x: 580, y: 995, w: 820, h: 670 };
const ROW_GAP = 16;
const INNER = 578; // vertical space rows may occupy inside the box

/** Row pitch adapts so the box always looks filled — 3 tall rows or 5 short ones. */
const rowHeight = (n: number) => Math.max(96, Math.min(128, INNER / n - ROW_GAP));

export const StackFill: React.FC<StackProps> = (props) => {
  const { items, regionLabel, accent: tint = 'cyan' } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const b = makeBeats(props.narrationFrames, {
    pace: props.variant?.pace,
    open: 0.08,
    buildFrom: 0.22,
    buildTo: 0.7,
    verdict: 0.85,
  });
  const itemAt = (i: number) => b.build(i, items.length);

  const boxAnim = enter({ frame, fps, at: b.open, from: 'up' });
  const top = BOX.y - BOX.h / 2;

  const h = rowHeight(items.length);
  const groupH = items.length * h + (items.length - 1) * ROW_GAP;
  const firstRowY = BOX.y - groupH / 2;

  return (
    <SceneFrame
      scene={props}
      tint={tint}
      recedeAt={b.open}
      verdictAt={b.verdict}
      defaultCamera="push"
    >
      <Region
        label={regionLabel}
        tint={tint}
        top={top}
        anim={boxAnim}
      />
      {items.map((label, i) => (
        <Row
          key={label}
          label={label}
          at={itemAt(i)}
          y={firstRowY + i * (h + ROW_GAP)}
          h={h}
          tint={tint}
          from={props.variant?.entrance ?? 'left'}
        />
      ))}
    </SceneFrame>
  );
};

/** The boundary itself, plus its rotated label. Mirrors as a pair. */
const Region: React.FC<{
  label: string;
  tint: AccentName;
  top: number;
  anim: React.CSSProperties;
}> = ({ label, tint, top, anim }) => {
  const mx = useMirrorX();
  const boxLeft = mx(BOX.x - BOX.w / 2 + BOX.w / 2) - BOX.w / 2;
  const labelCentre = mx(BOX.x - BOX.w / 2 - 78 + 20);

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: boxLeft,
          top,
          width: BOX.w,
          height: BOX.h,
          border: `${stroke.hairline}px solid ${accent[tint]}`,
          borderRadius: radius.lg,
          background: palette.surface,
          ...anim,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: labelCentre - 20,
          top,
          height: BOX.h,
          display: 'flex',
          alignItems: 'center',
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
    </>
  );
};

/** One thing occupying the region. Slides in as it is named. */
const Row: React.FC<{
  label: string;
  at: number;
  y: number;
  h: number;
  tint: AccentName;
  from: 'up' | 'down' | 'left' | 'right';
}> = ({ label, at, y, h, tint, from }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mx = useMirrorX();
  const anim = enter({ frame, fps, at, from, distance: 24 });
  const w = BOX.w - 72;
  const centre = mx(BOX.x);

  return (
    <div
      style={{
        position: 'absolute',
        left: centre - w / 2,
        top: y,
        width: w,
        height: h,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '0 28px',
        // Darker than the container, so items read as sitting *inside* it.
        background: palette.bg,
        border: `${stroke.hairline}px solid ${palette.border}`,
        borderRadius: radius.md,
        ...anim,
      }}
    >
      <span
        style={{
          flex: 'none',
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: accent[tint],
        }}
      />
      <span style={{ color: palette.ink, fontSize: type.body, fontWeight: 500, lineHeight: 1.2 }}>
        {label}
      </span>
    </div>
  );
};
