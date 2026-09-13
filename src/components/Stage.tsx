import React from 'react';
import { AbsoluteFill } from 'remotion';
import { palette, accent, canvas, type, fonts, channel } from '../theme';

/**
 * The persistent frame: background, glow blob, title bar, and (in dev) safe-area guides.
 * The title is an anchor, not a headline — it never animates after the first frame.
 */
export const Stage: React.FC<{
  title?: string;
  brand?: string;
  guides?: boolean;
  children: React.ReactNode;
}> = ({ title, brand = channel, guides = false, children }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: palette.bg, fontFamily: fonts.display }}>
      <GlowBlob />

      {/* The brand mark is unconditional — it is on every frame the channel ships. The
          title is optional because the `kicker` hook treatment moves it into an eyebrow
          above the hook, and rendering it in both places put the same words on screen
          twice. */}
      <div
        style={{
          position: 'absolute',
          top: 96,
          left: 64,
          right: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            color: palette.ink,
            fontSize: type.title,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            opacity: 0.92,
          }}
        >
          {title ?? ''}
        </span>
        <span
          style={{
            color: palette.inkMute,
            fontSize: type.arrowLabel,
            fontWeight: 500,
            letterSpacing: '0.02em',
          }}
        >
          {brand}
        </span>
      </div>

      {children}

      {guides ? <SafeAreaGuides /> : null}
    </AbsoluteFill>
  );
};

/**
 * ByteByteGo's signature soft shape, bottom-right, ~4% lighter than base.
 * Repositioned toward bottom-center-right and scaled up for the 9:16 frame.
 */
const GlowBlob: React.FC = () => (
  <AbsoluteFill style={{ overflow: 'hidden' }}>
    {/* A hard-edged gradient stop reads as a visible arc on flat dark, so the
        falloff comes from a large blur on a solid shape instead. */}
    <div
      style={{
        position: 'absolute',
        right: -420,
        bottom: -560,
        width: 1700,
        height: 1700,
        borderRadius: '50%',
        background: palette.bgGlow,
        filter: 'blur(180px)',
      }}
    />
  </AbsoluteFill>
);

const SafeAreaGuides: React.FC = () => {
  // Dev overlay only, but it still reads from the theme — a hardcoded hex here goes
  // invisible the moment the palette moves toward that colour.
  const line = (y: number, label: string) => (
    <div key={label} style={{ position: 'absolute', top: y, left: 0, right: 0 }}>
      <div style={{ height: 1, background: accent.rose, opacity: 0.4 }} />
      <span style={{ color: accent.rose, opacity: 0.6, fontSize: 20, paddingLeft: 8 }}>{label}</span>
    </div>
  );
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {line(canvas.safeTop, 'safe top 180')}
      {line(canvas.stageTop, 'stage 520')}
      {line(canvas.stageBottom, 'stage end 1500')}
      {line(canvas.safeBottom, 'safe bottom 1700')}
    </AbsoluteFill>
  );
};
