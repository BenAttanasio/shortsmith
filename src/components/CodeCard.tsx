import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { palette, accent, fonts, type, radius, stroke, springs, focus, AccentName } from '../theme';
import { enter } from '../anim/timing';

/**
 * A card of literal text — a prompt, a tool definition, a request body.
 *
 * The one surface in the system that sits *below* the page: `surfaceSunken` is darker
 * than `bg`, where every other container is lighter. STYLE-GUIDE §2: "code recedes into
 * the page; diagrams sit on top of it." That inversion is why this reads as a different
 * kind of object rather than another box.
 *
 * Lines enter individually on their own beat — but as a spring, not a typewriter. A
 * character-by-character reveal fights §6's "entrances are short and springy" and makes
 * the viewer wait on a machine rather than on the narration.
 */

/** round(type.code 34 × 1.45). Exported so scenes can size the card before rendering it. */
export const CODE_LINE_H = 50;
export const CODE_PAD = 36;
export const codeCardHeight = (lines: number) => CODE_PAD * 2 + lines * CODE_LINE_H;

/** Mono is a flat 0.6em advance, so a character count is an exact width. */
export const CODE_CHAR_W = type.code * 0.6;
export const codeMaxChars = (cardWidth: number) =>
  Math.floor((cardWidth - CODE_PAD * 2) / CODE_CHAR_W);

export const CodeCard: React.FC<{
  x: number;
  /** The card's TOP, not its centre — it grows downward as lines are added. */
  y: number;
  w: number;
  lines: { text: string; at: number }[];
  /** Frame the card itself draws in. */
  at: number;
  /** Index of the line the clip is about. Others dim; this one stays ink and gets a rule. */
  focusIndex?: number;
  focusAt?: number;
  tint?: AccentName;
}> = ({ x, y, w, lines, at, focusIndex, focusAt, tint = 'cyan' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardAnim = enter({ frame, fps, at, from: 'up', distance: 16 });
  const h = codeCardHeight(lines.length);

  // Once the focus line is called out, everything else recedes to inkMute.
  const focusP =
    focusIndex === undefined || focusAt === undefined
      ? 0
      : spring({ frame: frame - focusAt, fps, config: springs.camera });

  return (
    <div
      style={{
        position: 'absolute',
        left: x - w / 2,
        top: y,
        width: w,
        height: h,
        background: palette.surfaceSunken,
        border: `${stroke.hairline}px solid ${palette.border}`,
        borderRadius: radius.md,
        // No shadow — §5. The card recedes by being darker, not by floating.
        ...cardAnim,
      }}
    >
      {lines.map((line, i) => {
        const isFocus = i === focusIndex;
        return (
          <CodeLine
            key={`${i}-${line.text}`}
            text={line.text}
            at={line.at}
            top={CODE_PAD + i * CODE_LINE_H}
            isFocus={isFocus}
            focusP={focusP}
            tint={tint}
          />
        );
      })}
    </div>
  );
};

const CodeLine: React.FC<{
  text: string;
  at: number;
  top: number;
  isFocus: boolean;
  focusP: number;
  tint: AccentName;
}> = ({ text, at, top, isFocus, focusP, tint }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = enter({ frame, fps, at, from: 'left', distance: 10 });

  const color = isFocus
    ? palette.ink
    : interpolate(focusP, [0, 1], [1, 0]) > 0.5
      ? palette.ink
      : palette.inkMute;

  return (
    <div
      style={{
        position: 'absolute',
        left: CODE_PAD,
        right: CODE_PAD,
        top,
        height: CODE_LINE_H,
        display: 'flex',
        alignItems: 'center',
        ...anim,
        opacity: (anim.opacity as number) * (isFocus ? 1 : interpolate(focusP, [0, 1], [1, focus.dimmed + 0.35])),
      }}
    >
      {/* Gutter rule marks the line the callout points at. */}
      {isFocus ? (
        <div
          style={{
            position: 'absolute',
            left: -CODE_PAD + 12,
            top: 8,
            bottom: 8,
            width: stroke.bold,
            borderRadius: stroke.bold,
            background: accent[tint],
            opacity: focusP,
          }}
        />
      ) : null}
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: type.code,
          color,
          // Preserves leading indentation, which is half the point of showing code.
          whiteSpace: 'pre',
          letterSpacing: 0,
        }}
      >
        {text}
      </span>
    </div>
  );
};
