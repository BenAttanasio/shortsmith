import React from 'react';
import { Composition, staticFile, AbsoluteFill, Audio } from 'remotion';
import { getAudioDurationInSeconds } from '@remotion/media-utils';
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { entryFor, type RawReel } from './scenes/registry';
import { canvas } from './theme';
import reelData from '../content/reels.json';
import audioManifest from '../content/.audio-manifest.json';

loadPoppins();
loadMono();

/**
 * A clip is always driven by its narration: the audio's real duration sets the
 * composition length, and the scene's beats are fractions of that. Change the
 * script, and the animation re-times itself.
 *
 * The reel list is generated from content/reels.json so the scripts that
 * scripts/build-reels.mjs synthesizes and the clips rendered here can never drift
 * apart — one file is the source of truth for both. Adding a reel to that file
 * registers a composition; only a new scene *type* needs a code change, and that goes
 * in scenes/registry.ts.
 */

/** Tail padding so the last motion can settle after the voice stops. */
const TAIL_FRAMES = 10;

/**
 * Props are erased to a bag here on purpose: the registry resolves the concrete scene and
 * its prop type at the point of construction, so Root doesn't need — and can't have — a
 * single static type covering all ten archetypes. `scripts/lint-reels.mjs` and the
 * registry's `req()` are what actually validate the shape.
 */
type PropBag = Record<string, unknown>;

const withAudio = (Scene: React.FC<never>, src: string): React.FC<PropBag> =>
  function WithAudio(props: PropBag) {
    const Component = Scene as unknown as React.FC<PropBag>;
    return (
      <AbsoluteFill>
        <Component {...props} />
        <Audio src={staticFile(src)} />
      </AbsoluteFill>
    );
  };

/**
 * Speech timing per reel, measured from the mastered WAV by `scripts/build-reels.mjs`.
 *
 * Captions need to know where the voice actually starts and stops, not just how long the
 * file is: Gemini leaves 0.12-0.33s of leading silence, and the speech frequently ends
 * well before the file does. Without this the caption highlight runs ahead of the voice at
 * the top of the clip and behind it at the bottom.
 */
const speechFor = (id: string) =>
  (audioManifest.entries as Record<string, { speech?: unknown }>)[id]?.speech;

/**
 * Read the real audio length and hand the scene its narration length in frames.
 * Remotion requires calculateMetadata to return the full prop shape, not a partial, so
 * this spreads the incoming props rather than replacing them.
 *
 * This is the clock. Nothing else may set narrationFrames.
 */
const calculateFromAudio =
  (src: string, id: string) =>
  async ({ props }: { props: PropBag }) => {
    const seconds = await getAudioDurationInSeconds(staticFile(src));
    const narrationFrames = Math.round(seconds * canvas.fps);
    return {
      durationInFrames: narrationFrames + TAIL_FRAMES,
      props: { ...props, narrationFrames, speech: speechFor(id) },
    };
  };

const base = {
  width: canvas.width,
  height: canvas.height,
  fps: canvas.fps,
  // Real value comes from calculateMetadata; this is only the pre-resolution placeholder.
  durationInFrames: 600,
};

export const RemotionRoot: React.FC = () => (
  <>
    {(reelData.reels as unknown as RawReel[]).map((reel) => {
      const entry = entryFor(reel);
      const src = `audio/reels/${reel.id}.wav`;
      return (
        <Composition
          key={reel.id}
          id={reel.id}
          component={withAudio(entry.component, src)}
          {...base}
          defaultProps={entry.build(reel)}
          calculateMetadata={calculateFromAudio(src, reel.id)}
        />
      );
    })}
  </>
);
