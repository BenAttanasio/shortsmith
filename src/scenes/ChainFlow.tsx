import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { Node } from '../components/Node';
import { Arrow } from '../components/Arrow';
import { SceneFrame, type SceneBase } from '../components/SceneFrame';
import { palette, type, AccentName } from '../theme';
import { dimAfter } from '../anim/timing';
import { makeBeats } from '../anim/beats';

/**
 * "A becomes B becomes C" — the sequence archetype.
 *
 * A left-to-right pipeline becomes top-to-bottom in 9:16 (STYLE-GUIDE §8). Used for the
 * clips whose whole point is that a process people imagine as one opaque step is
 * actually three legible ones — the mechanism *is* the argument, so if the diagram were
 * removed the narration would lose its evidence.
 *
 * Each step dims as the next arrives; nothing leaves the frame. The final step is the
 * only solid, tinted one: the sequence has a terminus and that terminus is the point.
 */

export type ChainProps = SceneBase & {
  steps: string[];
  accent?: AccentName;
};

/**
 * Geometry is a function of step count rather than three fixed constants.
 *
 * The old fixed values (h170, first 680, gap 300) put a fourth step at y1580 — bottom
 * edge 1665, well past the caption zone. Rather than capping the archetype at three, each
 * count gets a layout that lands the last box on band.stageFloor (1330). The gap always
 * leaves room for a drawn arrow with its origin dot: at four steps that is 212 − 140 = 72px.
 */
const LAYOUT: Record<number, { h: number; first: number; gap: number }> = {
  2: { h: 200, first: 760, gap: 380 },
  3: { h: 170, first: 660, gap: 280 },
  4: { h: 140, first: 620, gap: 212 },
};

export const ChainFlow: React.FC<ChainProps> = (props) => {
  const { steps, accent: tint = 'cyan' } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const n = steps.length;
  const L = LAYOUT[n] ?? LAYOUT[3];
  const ys = steps.map((_, i) => L.first + i * L.gap);

  // Build starts at 12%: the first box is on screen while the hook is still readable,
  // so the stage is never empty.
  const b = makeBeats(props.narrationFrames, {
    pace: props.variant?.pace,
    buildFrom: 0.12,
    buildTo: 0.72,
    verdict: 0.84,
  });
  const stepAt = (i: number) => b.build(i, n);
  const from = props.variant?.entrance ?? 'up';

  return (
    <SceneFrame
      scene={props}
      tint={tint}
      recedeAt={stepAt(0)}
      verdictAt={b.verdict}
      defaultCamera="drift-up"
    >
      {steps.map((label, i) => {
        const next = i < n - 1 ? stepAt(i + 1) : Infinity;
        const opacity = dimAfter({ frame, fps, at: next, active: frame < next });
        const last = i === n - 1;
        return (
          <React.Fragment key={label}>
            {i > 0 ? (
              <Arrow
                from={[540, ys[i - 1] + L.h / 2]}
                to={[540, ys[i] - L.h / 2]}
                at={stepAt(i) - 6}
                duration={10}
                inset={6}
                tint={tint}
              />
            ) : null}
            <Node
              x={540}
              y={ys[i]}
              w={760}
              h={L.h}
              at={stepAt(i)}
              variant={last ? 'solid' : 'dashed'}
              tint={last ? tint : undefined}
              opacity={opacity}
              from={from}
            >
              <span
                style={{
                  color: palette.ink,
                  fontSize: type.body,
                  fontWeight: 500,
                  textAlign: 'center',
                  lineHeight: 1.2,
                  padding: '0 32px',
                }}
              >
                {label}
              </span>
            </Node>
          </React.Fragment>
        );
      })}
    </SceneFrame>
  );
};
