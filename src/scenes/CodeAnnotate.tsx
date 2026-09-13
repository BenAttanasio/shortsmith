import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { Chip } from '../components/Node';
import { CodeCard, codeCardHeight } from '../components/CodeCard';
import { Arrow } from '../components/Arrow';
import { SceneFrame, type SceneBase, useMirrorX } from '../components/SceneFrame';
import { palette, type, band, fonts, AccentName } from '../theme';
import { enter } from '../anim/timing';
import { makeBeats } from '../anim/beats';

/**
 * "Here is the literal artifact, and here is the one line that matters."
 *
 * The visual form of STYLE-GUIDE §7's "ground every abstraction in one concrete
 * instance" — and the most visually distinct frame in the library, because the card is
 * *darker* than the page while every other archetype floats a lighter surface above it.
 *
 * Subjects: the shape of a system prompt, a tool definition, a request body showing
 * `temperature`, a .env, a curl. Anything where the argument is "you have seen this text
 * a hundred times and never looked at line 4."
 */

export type CodeAnnotateProps = SceneBase & {
  /** 3–9 lines. Width is enforced by the linter, not wrapped at runtime. */
  code: string[];
  /** Index of the line the clip is about. */
  focus: number;
  /** What the callout chip says about that line. */
  callout: string;
  /** Optional gutter label above the card, e.g. a filename or a JSON path. */
  filename?: string;
  accent?: AccentName;
};

const CARD = { x: 540, w: 920, top: 620 };

export const CodeAnnotate: React.FC<CodeAnnotateProps> = (props) => {
  const { code, focus, callout, filename, accent: tint = 'cyan' } = props;
  const mx = useMirrorX();

  const b = makeBeats(props.narrationFrames, {
    pace: props.variant?.pace,
    open: 0.1,
    buildFrom: 0.18,
    buildTo: 0.62,
    accent: 0.78,
    verdict: 0.88,
  });

  const lines = code.map((text, i) => ({ text, at: b.build(i, code.length) }));
  const focusAt = b.t(0.7);
  const arrowAt = b.t(0.74);

  const cardH = codeCardHeight(code.length);
  const cardBottom = CARD.top + cardH;
  // The focused line's centre, in canvas coords.
  const focusY = CARD.top + 36 + focus * 50 + 25;

  // The callout is pinned rather than following the card, so its position doesn't jump
  // around as the line count changes. The arrow's vertical leg absorbs the difference.
  const calloutY = Math.max(cardBottom + 90, band.stageFloor - 60);
  const cardEdge = mx(CARD.x + CARD.w / 2);
  const calloutX = mx(800);

  return (
    <SceneFrame
      scene={props}
      tint={tint}
      recedeAt={b.open}
      verdictAt={b.verdict}
      // `hold`, not a push: here the diagram IS text, and mono at 34px softens visibly
      // under even a 4% scale. This archetype is why the camera had to become a knob.
      defaultCamera="hold"
    >
      {filename ? (
        <Filename text={filename} at={b.t(0.06)} x={mx(CARD.x - CARD.w / 2)} y={CARD.top - 54} />
      ) : null}

      <CodeCard
        x={mx(CARD.x)}
        y={CARD.top}
        w={CARD.w}
        lines={lines}
        at={b.open}
        focusIndex={focus}
        focusAt={focusAt}
        tint={tint}
      />

      {/* Off the card's edge, down, and into the chip. */}
      <Arrow
        from={[cardEdge - 10, focusY]}
        to={[calloutX, calloutY - 34]}
        at={arrowAt}
        duration={12}
        inset={6}
        tint={tint}
      />

      <Chip x={calloutX} y={calloutY} at={b.accent} tint={tint}>
        {callout}
      </Chip>
    </SceneFrame>
  );
};

/** A quiet label above the card — says what you are looking at without narrating it. */
const Filename: React.FC<{ text: string; at: number; x: number; y: number }> = ({
  text,
  at,
  x,
  y,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = enter({ frame, fps, at, from: 'up', distance: 8 });
  return (
    <div style={{ position: 'absolute', left: x, top: y, ...anim }}>
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: type.arrowLabel,
          color: palette.inkFaint,
          letterSpacing: '0.02em',
        }}
      >
        {text}
      </span>
    </div>
  );
};
