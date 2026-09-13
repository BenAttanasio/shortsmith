import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { Node } from '../components/Node';
import { Arrow } from '../components/Arrow';
import { Brace } from '../components/Brace';
import { SceneFrame, type SceneBase } from '../components/SceneFrame';
import { Icon, type IconName } from '../components/icons';
import { palette, type, AccentName } from '../theme';
import { dimAfter } from '../anim/timing';
import { makeBeats } from '../anim/beats';

/**
 * "N different things get collapsed into one answer, and the collapsing is where the
 * quality is decided."
 *
 * The reduce half that `fanout` never pays off. Not a mirrored fanout: this is three
 * tiers, and the argument lives in the *middle* one, which fanout does not have. The
 * whole point of these clips is that the interesting decision is the merge — which four
 * chunks, ranked how — not the retrieval.
 *
 * Subjects: RAG, ensembling, log aggregation, "the model doesn't search, it merges."
 */

export type GatherMergeProps = SceneBase & {
  /** 2–4 inputs across the top. */
  sources: { label: string; icon?: IconName }[];
  /** The tier that does the collapsing — where the argument lives. */
  collector: { label: string; icon?: IconName; note?: string };
  result: { label: string; icon?: IconName };
  /** Rides a brace under the sources, e.g. "ranked by distance". */
  edgeLabel?: string;
  /** Rides the collector → result arrow, e.g. "picks the top 4". */
  mergeLabel?: string;
  accent?: AccentName;
  /** The collector and result colour. The caption borrows this one. */
  resultAccent?: AccentName;
};

const SOURCE_Y = 630;
const COLLECTOR = { x: 540, y: 1010, w: 520, h: 190 };
const RESULT = { x: 540, y: 1255, w: 420, h: 140 };

/**
 * Vertical budget of the band between the sources and the collector.
 *
 * The brace and its label own the top of it and the arrows own the bottom — they must not
 * share. Starting the arrows at the source boxes' edge (the obvious thing) drew every one
 * of them straight through the brace line and its label.
 */
const BRACE_DROP = 30; // below the source boxes
const BRACE_LABEL_ROOM = 74; // line + label, before arrows may start

const sourceBox = (n: number) => (n <= 3 ? { w: 236, h: 168 } : { w: 210, h: 160 });
const spacingFor = (n: number) => (n <= 2 ? 340 : n === 3 ? 290 : 248);

export const GatherMerge: React.FC<GatherMergeProps> = (props) => {
  const {
    sources,
    collector,
    result,
    edgeLabel,
    mergeLabel,
    accent: tint = 'cyan',
    resultAccent = 'mint',
  } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const n = sources.length;
  const box = sourceBox(n);
  const gap = spacingFor(n);
  const xs = sources.map((_, i) => (n === 1 ? 540 : 540 + (i - (n - 1) / 2) * gap));

  const b = makeBeats(props.narrationFrames, {
    pace: props.variant?.pace,
    open: 0.1,
    buildFrom: 0.14,
    buildTo: 0.4,
    accent: 0.7,
    verdict: 0.88,
  });
  const braceAt = b.t(0.44);
  const collectorAt = b.t(0.56);
  const mergeAt = b.accent;
  const resultAt = b.t(0.76);
  const from = props.variant?.entrance ?? 'up';

  // Sources recede once the collector has them — attention moves to the merge.
  const sourceOpacity = dimAfter({ frame, fps, at: mergeAt, active: frame < mergeAt });

  const sourceBottom = SOURCE_Y + box.h / 2;
  const bracePos = sourceBottom + BRACE_DROP;
  // Arrows begin below the brace and its label, never through them.
  const arrowStartY = edgeLabel ? bracePos + BRACE_LABEL_ROOM : sourceBottom;

  return (
    <SceneFrame
      scene={props}
      tint={resultAccent}
      recedeAt={b.build(0, n)}
      verdictAt={b.verdict}
      defaultCamera="drift-up"
    >
      {sources.map((s, i) => (
        <React.Fragment key={`${s.label}-${i}`}>
          <Node
            x={xs[i]}
            y={SOURCE_Y}
            w={box.w}
            h={box.h}
            at={b.build(i, n)}
            variant="dashed"
            tint={tint}
            opacity={sourceOpacity}
            from={from}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              {s.icon ? <Icon name={s.icon} size={48} tint={tint} /> : null}
              <span
                style={{
                  color: palette.ink,
                  fontSize: type.arrowLabel,
                  fontWeight: 500,
                  textAlign: 'center',
                  lineHeight: 1.2,
                  padding: '0 12px',
                }}
              >
                {s.label}
              </span>
            </div>
          </Node>

          {/* Straight diagonals between containers, per §4. */}
          <Arrow
            from={[xs[i] * 0.85 + COLLECTOR.x * 0.15, arrowStartY]}
            to={[COLLECTOR.x + (xs[i] - COLLECTOR.x) * 0.22, COLLECTOR.y - COLLECTOR.h / 2]}
            at={b.build(i, n) + 8}
            duration={11}
            inset={8}
            opacity={sourceOpacity}
          />
        </React.Fragment>
      ))}

      {/* One labelled group rather than N copies of the same word on N arrows.
          'under' — the brace sits below the sources, so its ticks point up at them. */}
      {edgeLabel ? (
        <Brace
          at={braceAt}
          orientation="under"
          from={Math.min(...xs) - box.w / 2}
          to={Math.max(...xs) + box.w / 2}
          pos={bracePos}
          label={edgeLabel}
          tint={tint}
          tick={10}
        />
      ) : null}

      <Node
        x={COLLECTOR.x}
        y={COLLECTOR.y}
        w={COLLECTOR.w}
        h={COLLECTOR.h}
        at={collectorAt}
        variant="solid"
        tint={resultAccent}
        from={from}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {collector.icon ? <Icon name={collector.icon} size={52} tint={resultAccent} /> : null}
          <span style={{ color: palette.ink, fontSize: type.body, fontWeight: 600, lineHeight: 1.15 }}>
            {collector.label}
          </span>
          {collector.note ? (
            <span style={{ color: palette.inkMute, fontSize: type.arrowLabel, lineHeight: 1.2 }}>
              {collector.note}
            </span>
          ) : null}
        </div>
      </Node>

      {/* The first real use of Arrow's label prop — vertical, so it resolves upright. */}
      <Arrow
        from={[COLLECTOR.x, COLLECTOR.y + COLLECTOR.h / 2]}
        to={[RESULT.x, RESULT.y - RESULT.h / 2]}
        at={mergeAt}
        duration={11}
        inset={6}
        label={mergeLabel}
        tint={resultAccent}
      />

      <Node
        x={RESULT.x}
        y={RESULT.y}
        w={RESULT.w}
        h={RESULT.h}
        at={resultAt}
        variant="solid"
        tint={resultAccent}
        from={from}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {result.icon ? <Icon name={result.icon} size={44} tint={resultAccent} /> : null}
          <span style={{ color: palette.ink, fontSize: type.body, fontWeight: 600 }}>
            {result.label}
          </span>
        </div>
      </Node>
    </SceneFrame>
  );
};
