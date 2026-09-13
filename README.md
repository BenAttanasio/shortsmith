# Shortsmith

Generates vertical short-form video at 1080x1920 for YouTube Shorts and Instagram
Reels. Scenes are React components rendered with Remotion, narration comes from
Google Gemini TTS, and there's no timeline and no editor UI. You write a line,
render, and watch the animation re-time itself around it.

Claude Code is the interface. See [CLAUDE.md](CLAUDE.md).

## Quick start

```bash
npm install
cp .env.example .env          # add your Google AI Studio key
node scripts/tts.mjs --text "One prompt, many agents." --out public/audio/clip.wav
npx remotion render src/index.ts Dispatch5s out/dispatch-5s.mp4
```

`npm run studio` opens Remotion Studio if you'd rather scrub through a
composition while you build it.

## The audio is the clock

This is the constraint everything else follows from. Composition length comes
from the real narration duration, and every scene beat is a fraction of that
duration rather than a fixed frame count.

So rewriting a line re-times the whole animation automatically. Adding four words
to a sentence stretches the beats around it, and nothing drifts out of sync,
because no timing is written down anywhere as a number of frames.

Editing a video normally means the audio and the animation are two tracks you
keep dragging back into alignment. Here there's one track and the visuals are
derived from it.

## The style guide

[research/STYLE-GUIDE.md](research/STYLE-GUIDE.md) is the spec: the palette, the
container and arrow grammar, the progressive-build animation model, and the
scripting patterns.

The colours in it were sampled programmatically from 28 evenly-spaced frames of
a reference video rather than eyeballed, which is how it caught the thing that
matters most about the look: the background is a warm, faintly green-shifted
charcoal at `#242623`, covering 67.5% of the frame. Pure `#1a1a1a` reads as cheap
next to it, and that subtle hue cast is the single most identifiable part of the
style.

Structural ideas are borrowed from 3Blue1Brown: build a diagram progressively
while the narration explains it, and draw arrows rather than fading them in, so
the viewer's eye follows the construction.

`src/theme.ts` is the machine-readable version. Where the two disagree, the code
is what renders and the document is the bug.

## Scenes

Each scene archetype in `src/scenes/` is a shape an explanation can take:

`ChainFlow`, `DispatchFanout`, `GatherMerge`, `CycleLoop`, `LayerStack`,
`NestedScope`, `QuadrantMatrix`, `StackFill`, `ContrastPair`, `CodeAnnotate`.

They're composed from primitives in `src/components/`: `Node`, `Arrow`,
`OrthoArrow`, `ArcArrow`, `Brace`, `CodeCard`, `Caption`, `Hook`, `Stage`,
`SceneFrame`.

Dashed borders mean something different from solid ones, and the style guide says
which is which. Keeping that distinction consistent is what makes a series of
these read as one channel instead of ten separate videos.

## Commands

| Command | What it does |
|---|---|
| `npm run studio` | Remotion Studio |
| `npm run voice` | Gemini TTS, also importable from `scripts/tts.mjs` |
| `npm run build` | Build reels from the content definitions |
| `npm run render` | Render reels to `out/` |
| `npm run lint` | Check reels against the style rules |
| `npm run lint:strict` | The same checks, failing on warnings |
| `npm run typecheck` | `tsc --noEmit` |

## Layout

```
src/
  theme.ts            palette, type scale, the machine-readable style guide
  anim/               beats, timing, captions
  components/         nodes, arrows, braces, code cards, captions, frames
  scenes/             the scene archetypes and their registry
  Root.tsx, index.ts  composition registration
scripts/
  tts.mjs             Gemini TTS wrapper
  build-reels.mjs, render-reels.mjs, lint-reels.mjs
research/
  STYLE-GUIDE.md      the distilled spec
  RUNPOD.md           notes on rendering off your own machine
```

Set `CHANNEL_NAME` to put your own brand mark in the corner.

## Limitations

- Windows and macOS with a Chromium install, since Remotion renders through
  headless Chromium.
- Gemini TTS only. Swapping in another provider means rewriting `scripts/tts.mjs`
  to produce the same WAV output.
- Rendering is slow on a laptop. `research/RUNPOD.md` covers pushing renders to a
  GPU box.
- The scene archetypes are for explanatory diagrams. There's nothing here for
  footage, talking heads, or b-roll.

## License

MIT. See [LICENSE](LICENSE).

More at [benattanasio.com/lab](https://benattanasio.com/lab).
