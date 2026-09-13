import React from 'react';
import { useCurrentFrame } from 'remotion';
import { palette, type, canvas, accent, AccentName } from '../theme';
import { layoutWords, type Word, type Speech } from '../anim/captions';

// Re-exported so scenes keep importing caption concerns from one place.
export { layoutWords };
export type { Word, Speech };


/**
 * Word-synced captions. The majority of Shorts/Reels playback starts muted, so
 * these are not optional decoration — they carry the narration.
 *
 * Highlighting is per-word (not per-sentence block): the active word goes full
 * `ink` while its neighbours sit at `inkMute`, which reads as a moving cursor
 * rather than a flashing card.
 */
export const Caption: React.FC<{
  words: Word[];
  /**
   * Words visible at once. Five is the ceiling that still fits two lines at
   * `type.caption` across the 920px of usable width — seven wraps to three lines,
   * which overflows the 200px caption zone and pushes text below y=1700 where the
   * platform's own UI covers it.
   */
  window?: number;
  tint?: AccentName;
  y?: number;
}> = ({ words, window: win = 5, tint = 'mint', y }) => {
  const frame = useCurrentFrame();

  const activeIdx = words.findIndex((w) => frame >= w.from && frame < w.to);
  // Between words, hold the most recent one so the caption doesn't flicker.
  const idx =
    activeIdx >= 0
      ? activeIdx
      : Math.max(0, words.filter((w) => w.to <= frame).length - 1);

  if (words.length === 0 || frame < words[0].from) return null;

  // Slide the window in fixed steps so text doesn't jitter on every word.
  const page = Math.floor(idx / win);
  const slice = words.slice(page * win, page * win + win);

  return (
    <div
      style={{
        position: 'absolute',
        left: 80,
        right: 80,
        top: y ?? canvas.captionTop,
        height: canvas.captionBottom - canvas.captionTop,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: '0 14px',
        textAlign: 'center',
        // Belt and braces: if a freak run of long words still wants a third line,
        // clip it rather than let it bleed into the safe-bottom zone.
        overflow: 'hidden',
      }}
    >
      {slice.map((w, i) => {
        const globalIdx = page * win + i;
        const isActive = globalIdx === idx;
        const isPast = globalIdx < idx;
        return (
          <span
            key={`${w.text}-${globalIdx}`}
            style={{
              fontSize: type.caption,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              lineHeight: 1.3,
              color: isActive ? accent[tint] : isPast ? palette.ink : palette.inkFaint,
              transform: isActive ? 'translateY(-2px)' : 'none',
              transition: 'none',
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};
