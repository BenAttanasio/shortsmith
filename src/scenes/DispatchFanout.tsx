import React from 'react';
import { Node } from '../components/Node';
import { Arrow } from '../components/Arrow';
import { Brace } from '../components/Brace';
import { SceneFrame, type SceneBase } from '../components/SceneFrame';
import { Icon, type IconName } from '../components/icons';
import { palette, type, AccentName } from '../theme';
import { makeBeats } from '../anim/beats';

/**
 * "One thing talks to N things" — the radial/fan-out layout from STYLE-GUIDE §8.
 *
 * The f_014 hub topology is the layout that survives a 9:16 crop best, so it's the
 * default for one-to-many. Rotated 90° here: source on top, workers below, because
 * vertical reads top-to-bottom.
 *
 * Two accents, and only two: the source and its brace share one, the workers share the
 * other. The workers are deliberately all the *same* colour — "these are the same kind of
 * thing" — rather than a rainbow (§1, frame f_021).
 */

export type DispatchProps = SceneBase & {
  source: { label: string; icon?: IconName };
  workers: { label: string; icon?: IconName }[];
  /** Rides a brace under the workers — the payload of the clip. */
  braceLabel?: string;
  /** The workers' colour. */
  accent?: AccentName;
  /** The source and brace colour. The caption borrows this one. */
  sourceAccent?: AccentName;
};

const SRC = { x: 540, y: 668, w: 380, h: 190 };
const WORKER_Y = 1090;

/** Wider boxes and looser spacing for small counts; four has to be tighter to fit 1080. */
const workerBox = (n: number) => (n <= 3 ? { w: 236, h: 214 } : { w: 210, h: 200 });
const spacingFor = (n: number) => (n <= 2 ? 340 : n === 3 ? 306 : 248);

export const DispatchFanout: React.FC<DispatchProps> = (props) => {
  const {
    source,
    workers,
    braceLabel,
    accent: workerTint = 'violet',
    sourceAccent = 'mint',
  } = props;

  const n = workers.length;
  const box = workerBox(n);
  const gap = spacingFor(n);
  const xs = workers.map((_, i) => (n === 1 ? 540 : 540 + (i - (n - 1) / 2) * gap));

  const b = makeBeats(props.narrationFrames, {
    pace: props.variant?.pace,
    open: 0.08,
    buildFrom: 0.46,
    buildTo: 0.66,
    accent: 0.78,
    verdict: 0.86,
  });
  const fanAt = b.t(0.34);
  const from = props.variant?.entrance ?? 'up';

  return (
    <SceneFrame
      scene={props}
      tint={sourceAccent}
      recedeAt={fanAt}
      verdictAt={b.verdict}
      defaultCamera="push"
    >
      {/* The single incoming task. */}
      <Node
        x={SRC.x}
        y={SRC.y}
        w={SRC.w}
        h={SRC.h}
        at={b.open}
        variant="solid"
        from={from}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          {source.icon ? <Icon name={source.icon} size={68} tint={sourceAccent} /> : null}
          <span style={{ color: palette.ink, fontSize: type.label, fontWeight: 500 }}>
            {source.label}
          </span>
        </div>
      </Node>

      {/* Each arrow draws, staggered, with its own origin dot. */}
      {xs.map((x, i) => (
        <Arrow
          key={`arrow-${i}`}
          from={[SRC.x, SRC.y + SRC.h / 2]}
          to={[x, WORKER_Y - box.h / 2]}
          at={fanAt + i * 3}
          duration={12}
          inset={8}
        />
      ))}

      {workers.map((w, i) => (
        <Node
          key={`${w.label}-${i}`}
          x={xs[i]}
          y={WORKER_Y}
          w={box.w}
          h={box.h}
          at={b.build(i, n)}
          variant="dashed"
          tint={workerTint}
          from={from}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            {w.icon ? <Icon name={w.icon} size={58} tint={workerTint} /> : null}
            <span
              style={{
                color: palette.ink,
                fontSize: type.arrowLabel,
                fontWeight: 500,
                textAlign: 'center',
                lineHeight: 1.2,
              }}
            >
              {w.label}
            </span>
          </div>
        </Node>
      ))}

      {braceLabel ? (
        <Brace
          at={b.accent}
          orientation="under"
          from={Math.min(...xs) - box.w / 2}
          to={Math.max(...xs) + box.w / 2}
          pos={WORKER_Y + box.h / 2 + 46}
          label={braceLabel}
          tint={sourceAccent}
        />
      ) : null}
    </SceneFrame>
  );
};
