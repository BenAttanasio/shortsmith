import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { Chip } from '../components/Node';
import { Brace } from '../components/Brace';
import { SceneFrame, type SceneBase, useMirrorX } from '../components/SceneFrame';
import { palette, accent, radius, stroke, type, band, AccentName } from '../theme';
import { enter, dimAfter } from '../anim/timing';
import { makeBeats } from '../anim/beats';

/**
 * "The thing you call one thing is N stacked tiers, and your problem lives in tier k."
 *
 * Distinct from `fill` in the way that matters: there is no container. The tiers *are*
 * the structure and they nearly touch, so the column reads as a cross-section rather than
 * as a list of things inside a box. A brace and a rotated axis label give the column a
 * direction — "closer to the metal" — which a list does not have.
 *
 * It is also the only archetype whose labels are left-aligned. That single choice makes
 * it unmistakable at a glance in a feed, which is the whole point of having ten of these.
 */

export type LayerStackProps = SceneBase & {
  /** 3–5, top to bottom. */
  layers: { label: string; note?: string }[];
  /** Index of the tier the clip is actually about. */
  focus: number;
  /** Rotated down the left strip, e.g. "abstraction". */
  axisLabel: string;
  /** Chip pinned to the focused tier, e.g. "you are here". */
  chip?: string;
  accent?: AccentName;
};

const COL = { x: 596, w: 820 };
const TIER_GAP = 10;

/** Every count lands the column's bottom edge exactly on band.stageFloor. */
const LAYOUT: Record<number, { h: number; top: number }> = {
  3: { h: 200, top: 710 },
  4: { h: 156, top: 676 },
  5: { h: 124, top: 670 },
};

export const LayerStack: React.FC<LayerStackProps> = (props) => {
  const { layers, focus, axisLabel, chip, accent: tint = 'cyan' } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mx = useMirrorX();

  const n = layers.length;
  const L = LAYOUT[n] ?? LAYOUT[4];
  const centreY = (i: number) => L.top + L.h / 2 + i * (L.h + TIER_GAP);

  const b = makeBeats(props.narrationFrames, {
    pace: props.variant?.pace,
    open: 0.1,
    buildFrom: 0.24,
    buildTo: 0.7,
    accent: 0.78,
    verdict: 0.86,
  });
  const focusAt = b.t(0.74);
  const from = props.variant?.entrance ?? 'left';

  const colLeft = mx(COL.x) - COL.w / 2;
  const bracePos = mx(COL.x - COL.w / 2 - 26);
  const axisX = mx(COL.x - COL.w / 2 - 96);

  return (
    <SceneFrame
      scene={props}
      tint={tint}
      recedeAt={b.open}
      verdictAt={b.verdict}
      // Starts tight and pulls back, so the stack reveals its full depth as it builds.
      defaultCamera="settle"
    >
      <AxisLabel text={axisLabel} at={b.open} x={axisX} top={L.top} height={n * L.h + (n - 1) * TIER_GAP} />

      <Brace
        at={b.open}
        orientation="left"
        from={L.top}
        to={band.stageFloor}
        pos={bracePos}
        tint={tint}
        tick={10}
      />

      {layers.map((layer, i) => (
        <Tier
          key={layer.label}
          layer={layer}
          at={b.build(i, n)}
          left={colLeft}
          top={centreY(i) - L.h / 2}
          h={L.h}
          tint={tint}
          isFocus={i === focus}
          // Non-focus tiers recede once the focused one is named.
          opacity={
            i === focus ? 1 : dimAfter({ frame, fps, at: focusAt, active: frame < focusAt })
          }
          from={from}
        />
      ))}

      {chip ? (
        <Chip x={mx(COL.x + COL.w / 2 - 130)} y={centreY(focus)} at={b.accent} tint={tint}>
          {chip}
        </Chip>
      ) : null}
    </SceneFrame>
  );
};

/** One tier of the cross-section. Left-aligned — the archetype's signature. */
const Tier: React.FC<{
  layer: { label: string; note?: string };
  at: number;
  left: number;
  top: number;
  h: number;
  tint: AccentName;
  isFocus: boolean;
  opacity: number;
  from: 'up' | 'down' | 'left' | 'right';
}> = ({ layer, at, left, top, h, tint, isFocus, opacity, from }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = enter({ frame, fps, at, from, distance: 20 });

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: COL.w,
        height: h,
        background: palette.surface,
        border: `${stroke.hairline}px solid ${isFocus ? accent[tint] : palette.border}`,
        borderRadius: radius.md,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 6,
        padding: '0 28px',
        ...anim,
        opacity: (anim.opacity as number) * opacity,
      }}
    >
      <span
        style={{
          color: palette.ink,
          fontSize: type.body,
          fontWeight: isFocus ? 600 : 500,
          lineHeight: 1.15,
        }}
      >
        {layer.label}
      </span>
      {/* The note only fits on the taller layouts. */}
      {layer.note && h >= 156 ? (
        <span style={{ color: palette.inkMute, fontSize: type.arrowLabel, lineHeight: 1.2 }}>
          {layer.note}
        </span>
      ) : null}
    </div>
  );
};

/** Names the axis, not the contents — the §2 move for tall narrow regions. */
const AxisLabel: React.FC<{ text: string; at: number; x: number; top: number; height: number }> = ({
  text,
  at,
  x,
  top,
  height,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = enter({ frame, fps, at, from: 'up' });
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top,
        height,
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
        {text}
      </span>
    </div>
  );
};
