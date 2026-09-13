import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { palette, accent, type, canvas, band, springs, focus, stroke, AccentName } from '../theme';
import { enter } from '../anim/timing';

/**
 * The tension statement.
 *
 * This is the one place the channel deliberately departs from ByteByteGo's calm
 * topic-announcement open (STYLE-GUIDE §7): a Short has no thumbnail and no title to
 * pre-qualify the viewer, so the frame has to state the tension before the thumb moves.
 *
 * It recedes rather than leaving — once the build starts it drops to 0.4 and scales back,
 * so it stops competing with the captions saying the same words a second later, without
 * anything disappearing.
 *
 * Three treatments, chosen per-reel. They exist because the first 1.5 seconds is the most
 * repeated frame across the whole channel, so it is the highest-value thing to vary.
 */

export type HookTreatment = 'center' | 'left' | 'kicker';

export const Hook: React.FC<{
  text: string;
  at: number;
  recedeAt: number;
  treatment?: HookTreatment;
  /** Eyebrow line for the `kicker` treatment — normally the reel's title. */
  kicker?: string;
  /** Rule colour for the `left` treatment. */
  tint?: AccentName;
}> = ({ text, at, recedeAt, treatment = 'center', kicker, tint = 'mint' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const anim = enter({ frame, fps, at, from: 'up', distance: 20 });

  // Long ease, no overshoot — this is a focus change, not an entrance.
  const recede = spring({ frame: frame - recedeAt, fps, config: springs.camera });
  const opacity = interpolate(recede, [0, 1], [1, focus.dimmed]);
  const scale = interpolate(recede, [0, 1], [1, 0.88]);

  const glyph: React.CSSProperties = {
    color: palette.ink,
    fontSize: type.hook,
    fontWeight: 600,
    letterSpacing: '-0.02em',
    lineHeight: 1.15,
    // Required for \n in the hook string to break.
    whiteSpace: 'pre-line',
  };

  const wrapper: React.CSSProperties = {
    position: 'absolute',
    top: band.hookTop,
    opacity: anim.opacity * opacity,
    transform: `${anim.transform} scale(${scale})`,
  };

  if (treatment === 'left') {
    return (
      <div
        style={{
          ...wrapper,
          left: 90,
          right: 200,
          textAlign: 'left',
          transformOrigin: '0% 0%',
        }}
      >
        {/* A rule rather than a bullet: it reads as a pull-quote, and it is the only
            place in the frame where the accent touches the hook. */}
        <div
          style={{
            position: 'absolute',
            left: -26,
            top: 6,
            bottom: 6,
            width: stroke.bold,
            borderRadius: stroke.bold,
            background: accent[tint],
          }}
        />
        <span style={glyph}>{text}</span>
      </div>
    );
  }

  if (treatment === 'kicker') {
    return (
      <div style={{ ...wrapper, left: 80, right: 80, textAlign: 'center', top: band.hookTop - 20 }}>
        {kicker ? (
          <div
            style={{
              color: palette.inkMute,
              fontSize: type.arrowLabel,
              fontWeight: 500,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 18,
            }}
          >
            {kicker}
          </div>
        ) : null}
        <span style={glyph}>{text}</span>
      </div>
    );
  }

  return (
    <div style={{ ...wrapper, left: 80, right: 80, textAlign: 'center' }}>
      <span style={glyph}>{text}</span>
    </div>
  );
};

/** Kept for callers that only need the zone, e.g. dev guides. */
export const hookZone = { top: band.hookTop, bottom: canvas.hookBottom } as const;
