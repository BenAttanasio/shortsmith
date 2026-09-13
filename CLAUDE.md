# Shortsmith

Generates vertical shorts (1080×1920) for YouTube Shorts / Instagram Reels in a
ByteByteGo-derived visual language, with Google Gemini TTS narration.

**Claude Code is the UI.** There is no front end and none is wanted. Drive everything
from this file.

---

## The one rule

**Read `research/STYLE-GUIDE.md` before writing a scene or a script.** It is not
background reading — it is the spec. The container/arrow grammar carries meaning, and the
animation rules are what separate this from a slide deck. Deviating is fine when there's a
reason; deviating by accident is not.

Two companions, both binding:

- **`research/BRAND.md`** — the palette, the accent semantics, and why colour never
  rotates. Read before touching `src/themes.ts`.
- **`research/PLATFORM-POLICY.md`** — what YouTube, Instagram and TikTok actually document,
  quoted with sources, and which decisions each one supports. Read before changing cadence
  or anything about how clips are published. **It has a re-check date** — the
  YouTube section renamed twice in thirteen months.

Not binding, but read it before you touch cloud rendering:

- **`research/RUNPOD.md`** — how to provision and connect to a RunPod pod, and the four
  failure modes that each cost a rebuild. Handed over from another project that destroyed
  five pods learning them. There is no pod right now; the account is empty. It also
  argues that a GPU pod is the wrong shape for Remotion, which is Chromium-and-CPU bound.

---

## Pipeline

```
script (text)  →  scripts/tts.mjs  →  raw .wav
                                          ↓
                            scripts/master.mjs  (local broadcast chain)
                                          ↓
                                  public/audio/*.wav
                                          ↓
                                   calculateMetadata reads the real
                                   audio duration and sets both the
                                   composition length and the beats
                                          ↓
                          src/scenes/*.tsx  →  remotion render  →  out/*.mp4
```

The audio is the clock. Scene beats are expressed as **fractions of the narration**
(`t(0.34)`), never as hardcoded frames, so rewriting a line re-times the animation
automatically. Never hardcode a beat in frames.

---

## Commands

Generate a voiceover and report its duration and words-per-minute:

```bash
node scripts/tts.mjs --text "One prompt, many agents." --out public/audio/clip.wav --voice Charon
```

Master a narration WAV through the house chain — -14 LUFS integrated, -1.5 dBTP, and
sample-exact in length:

```bash
node scripts/master.mjs --in out/vo.wav --out public/audio/clip.wav
```

Compare mastering chains on one take, when the voice needs re-tuning. Writes a folder of
flat WAVs plus spectrograms and a measurement sheet — **never an HTML page**, because
browser audio players resample and destroy the thing you are trying to judge:

```bash
node scripts/master-lab.mjs --clip Tokens       # every candidate chain
node scripts/master-lab.mjs --only B            # re-render one after a tweak
```

Build narration for `content/reels.json` — synthesizes each reel and masters it locally.
**Incremental**: only reels whose narration hash differs from
`content/.audio-manifest.json` are rebuilt.

```bash
node scripts/build-reels.mjs                    # only what changed
node scripts/build-reels.mjs --only Tokens      # one reel
node scripts/build-reels.mjs --force            # everything (rarely what you want)
node scripts/build-reels.mjs --no-master        # synth only, raw takes copied through
```

**Never use `--force` casually.** Gemini TTS is nondeterministic and the pace loop keeps
the closest of up to four takes, so a rebuild changes every reel's duration by tenths of a
second — which moves every `t(fraction)` beat and invalidates every verification frame you
have already approved.

Check every reel against the layout ceilings, the schema and the prose rules. Runs
automatically before `build-reels` and `render-reels`; run it directly while authoring:

```bash
node scripts/lint-reels.mjs            # --strict fails on warnings, --json for tooling
```

Review the writing **before** spending a Gemini take on it. Copy only, no video:

```bash
node scripts/script-review.mjs --open  # → out/review/scripts.html
```

Verify the two things that are invisible in a still frame — that captions track the voice,
and that elements appear when the script names them:

```bash
node scripts/check-captions.mjs        # run AFTER build-reels, not before
node scripts/check-beats.mjs           # reporting only, no pass/fail
```

Exit codes are distinct: **0** clean, **1** bad content, **2** the linter itself broke
(unparseable JSON, no `ffprobe`). Both pipeline scripts accept `--no-lint` to bypass.

Render every reel and pull verification frames:

```bash
node scripts/render-reels.mjs          # add --dry to exercise the path without encoding
```

Render on a throwaway RunPod CPU pod instead, so the desktop stays free. Same
interface — `--dry`, single-reel targeting and the frame pull all behave identically:

```bash
node scripts/render-remote.mjs         # all reels, on a pod, then destroy it
node scripts/render-remote.mjs Tokens  # just one
node scripts/render-remote.mjs --keep  # leave the pod up (debugging only)
node scripts/render-remote.mjs --reap  # kill orphaned pods and exit
```

It creates the pod, syncs, renders, pulls `out/reels/` + `out/check/` back, and
terminates — on **every** exit path including Ctrl-C. ~35s of overhead per run, about
$0.01 a reel. It is *slower* than rendering locally (91s vs 76s); what it buys is the
machine, not time. Read `research/RUNPOD.md` before changing anything about it.

Build a single HTML page that plays every reel in publish order, for reviewing the
channel the way a human reviewer actually sees it — one clip after another:

```bash
node scripts/review-page.mjs --new 8 --open    # --new N tags the last N as this batch
```

Writes `out/review/index.html`, which references `../reels/*.mp4` relatively — nothing is
copied or re-encoded, so the page goes stale the moment you re-render. Re-run it.

Render a single composition directly (the id is the reel's `id` in `reels.json`):

```bash
npx remotion render src/index.ts Tokens out/reels/Tokens.mp4
```

Open the visual editor (useful for scrubbing a build, not required):

```bash
npx remotion studio
```

Typecheck after editing scenes:

```bash
npx tsc --noEmit
```

Extract frames to actually look at the output — **always do this before claiming a
render looks right**:

```bash
ffmpeg -y -i out/dispatch-5s.mp4 -vf "select='eq(n\,12)+eq(n\,60)+eq(n\,152)',scale=540:-1" -vsync 0 out/check/c_%d.jpg
```

---

## Layout zones (1080×1920)

Defined in `src/theme.ts` as `canvas`. Turn on `guides` in a composition's props to
render them as overlays.

| Zone | Y | Contents |
|---|---|---|
| Safe top | 0–180 | Title + brand. Platform chrome overlaps here. |
| Hook | 180–520 | Tension statement, big type, 2–4 words per line |
| **Stage** | 520–1500 | The diagram. This is the video. |
| Caption | 1500–1700 | Word-synced subtitles |
| Safe bottom | 1700–1920 | Empty. IG/YT UI lives here. |

---

## Files

| Path | What |
|---|---|
| `src/themes.ts` | Named colour token sets. `activeTheme` picks one; `paper` is the light variant |
| `src/theme.ts` | Re-exports the active theme + type scale, springs, zone geometry, `band`, `cameraSpec` |
| `src/anim/timing.ts` | `enter()`, `dimAfter()`, `drawEase()` — all entrances route through here |
| `src/anim/beats.ts` | `makeBeats()` — every beat as a fraction of the narration |
| `src/components/SceneFrame.tsx` | **The shared shell.** Camera moves, hook treatment, the bottom-anchored verdict, mirror context |
| `src/components/Stage.tsx` | Background, glow blob, title bar, safe-area guides |
| `src/components/Node.tsx` | Container grammar (`solid` = system, `dashed` = grouping) + `Chip` |
| `src/components/Arrow.tsx` | Drawing arrows, origin dots, rotated labels |
| `src/components/Caption.tsx` | Word-synced captions + `layoutWords()` |
| `src/components/icons/` | Line-art SVG set |
| `src/components/Brace.tsx` | Groups N things without asserting a container around them |
| `src/components/ArcArrow.tsx` | An arrow riding an ellipse — the edge of a cycle |
| `src/components/OrthoArrow.tsx` | Right-angle routing, for getting *around* things (§4) |
| `src/components/CodeCard.tsx` | The sunken mono card — the one surface below the page |
| `src/scenes/registry.ts` | **Scene dispatch.** Add a new archetype here, not in `Root.tsx` |
| `src/Root.tsx` | Maps `reels.json` through the registry; owns `calculateMetadata` |
| `src/scenes/ContrastPair.tsx` | `contrast` — "A vs B", define against what's known |
| `src/scenes/ChainFlow.tsx` | `chain` — "A → B → C", 2–4 steps |
| `src/scenes/StackFill.tsx` | `fill` — a bounded region filling, 3–5 items |
| `src/scenes/DispatchFanout.tsx` | `fanout` — one thing talks to N things, 2–4 |
| `src/scenes/LayerStack.tsx` | `layers` — "your problem lives in tier k", 3–5 |
| `src/scenes/CycleLoop.tsx` | `loop` — "you think it's a line; it's a loop", 3–4 |
| `src/scenes/CodeAnnotate.tsx` | `code` — the literal artifact and the line that matters |
| `src/scenes/NestedScope.tsx` | `nest` — "X inside Y inside Z", 2–3 rings |
| `src/scenes/QuadrantMatrix.tsx` | `matrix` — two axes, four cases. Use sparingly |
| `src/scenes/GatherMerge.tsx` | `gather` — N things collapse into one, 2–4 |
| `src/components/Hook.tsx` | The tension statement; recedes once the build starts |
| `content/reels.json` | **Reel source of truth** — scripts, hooks, `publishTitle`, scene + props. Array order *is* publish order |
| `content/archetypes.json` | **Layout ceilings.** Required props, count ranges, stage floors, the variant vocabulary |
| `scripts/tts.mjs` | Gemini TTS → WAV (also importable as a module) |
| `scripts/master.mjs` | **The house mastering chain.** Local ffmpeg, replaced Auphonic |
| `scripts/master-lab.mjs` | Renders one take through every candidate chain, for A/B by ear |
| `scripts/auphonic.mjs` | Auphonic API client. **Unused** — kept for the day there's a real mic |
| `scripts/lint-reels.mjs` | Schema, layout **and prose** guardrail (also importable as `lintReels()`) |
| `scripts/speech.mjs` | Finds where the voice actually is inside a WAV — captions depend on it |
| `scripts/check-captions.mjs` | Asserts caption timing against the real audio. Run after a build |
| `scripts/check-beats.mjs` | Reports elements that appear far from where the script names them |
| `scripts/script-review.mjs` | Copy-only review page, for approving writing before anything is built |
| `src/anim/captions.ts` | Caption word timing. JSX-free so it can be tested |
| `scripts/build-reels.mjs` | Synthesizes every reel, masters the batch, splits it back |
| `scripts/render-reels.mjs` | Renders every reel + pulls verification frames |
| `scripts/render-remote.mjs` | Same, on a throwaway RunPod CPU pod. Terminates on every exit path |
| `scripts/review-page.mjs` | Builds `out/review/index.html` — every reel, in publish order, playable |
| `scripts/runpod.mjs` | RunPod API helpers — which of the two APIs owns what |
| `scripts/pod-provision.sh` | Makes a cold pod render-ready. Idempotent, runs every boot |
| `research/STYLE-GUIDE.md` | **The spec.** |
| `research/BRAND.md` | Palette, accent semantics, voice, why colour never rotates |
| `research/PLATFORM-POLICY.md` | What the platforms document, quoted. **Has a re-check date** |
| `research/bytebytego/` | Source video, frames, transcript |

---

## Adding a clip

1. Write the narration. Read it aloud — target **150–165 wpm**. Use the sentence
   patterns in STYLE-GUIDE §7: define by contrast against what the viewer knows, ask a
   question and answer it immediately, and give every abstraction a concrete instance
   within one sentence.
2. **Clear the clarity bar in STYLE-GUIDE §7b.** This is where the first eighteen reels
   failed, so it is not optional:
   - The **first sentence names the subject** in words a stranger already owns — "an AI
     chatbot like ChatGPT", "an AI model". Never a bare pronoun; the viewer arrived
     mid-scroll and has no antecedent for "it".
   - The **hook opens a loop and the verdict closes it.** A literal question, or a tension
     statement that implies one. Never a bare label — "A desk. Not a brain." is the
     canonical failure: profound-sounding, and about nothing.
   - **No banned phrasing** — "it's not just X, it's Y", "what actually separates them",
     "the real work". The full table is in §7b and the linter errors on all of it.
3. Write a **`publishTitle`** as well as a `title`. They do different jobs: `title` is the
   terse on-screen anchor, `publishTitle` is what goes in the upload box and has to work
   as a search result with no video attached. Mobile truncates around 40–60 chars.
4. Add the reel to `content/reels.json`. Adding it there registers a composition
   automatically — no `Root.tsx` edit unless it's a new scene *type*.
5. Give it a `variant` so it doesn't look like the reel before it (below).
6. `node scripts/lint-reels.mjs` — catches overflow, schema errors and the prose rules
   above before anything costs money or time.
7. `node scripts/build-reels.mjs` to synthesize, then render, extract frames, **look at
   them**, and iterate.

### Smoke-testing a new archetype without spending TTS

A new scene has no narration, and synthesizing one costs Gemini quota just to find out a
box is 40px too low. Borrow an existing WAV instead:

```bash
cp public/audio/reels/Tokens.wav public/audio/reels/TestThing.wav
# add a "TestThing" reel to reels.json using the new scene, then:
node scripts/render-reels.mjs TestThing
# look at out/check/TestThing_*.jpg, then delete the reel, the wav and the outputs
```

Captions won't match the visuals — that's fine, you're checking layout. **Delete the test
reel afterwards**, or it ships as real content.

### The variant vocabulary

Structural variety is what keeps a run of reels from reading as the same video twice.
Colour is not where variety belongs; this is.

```json
"variant": { "camera": "settle", "hook": "left", "entrance": "down", "pace": "front" }
```

| Knob | Values | Changes |
|---|---|---|
| `camera` | `push` · `settle` · `drift-up` · `drift-left` · `hold` · `frame-part` | the clip's whole motion signature |
| `hook` | `center` · `left` · `kicker` | the first 1.5s — the most-repeated frame on the channel |
| `entrance` | `up` · `down` · `left` · `right` | every element's arrival direction |
| `mirror` | boolean | flips asymmetric archetypes (`fill`); the linter warns when it's a no-op |
| `captionTint` | any accent name | the frame's dominant colour, without touching the diagram |
| `pace` | `even` · `front` · `back` | whether the build front-loads or lands late |

All of it is **deterministic and authored** — no RNG, no clock, no hashing the id. Two
renders of the same reel are comparable, which is what makes the verification frames worth
looking at.

The linter enforces adjacency: two consecutive reels sharing
`(scene, accent, camera, mirror)` is an **error**, three of the same archetype in a row is
an error, and it warns on accent overuse, camera monotony and thin archetype coverage
across rolling windows. Array order in `reels.json` **is** publish order, so adjacency in
the file is adjacency on the channel.

Note on accents: the "≤2 per frame" rule is already structural rather than a convention —
each scene derives its caption tint from its own accent, so no scene can reach three. A
named accent-pair vocabulary was considered and skipped; it would have added naming sugar
without adding a guarantee.

---

## Publishing

Full sourcing in `research/PLATFORM-POLICY.md`. The rules, and why each one exists:

**Cadence: 1×/day maximum on YouTube.** Posting faster does not make a short-form channel
grow faster; it just starves each clip of the window it needs to find an audience.

**Made for kids: off.** Verify on every upload. It is the one documented switch that
removes a video from personalized recommendations, notifications *and* the Shorts feed
entirely, and it is the most common real cause of "my Shorts get zero views."

**Never personify the narrator** as a named human expert. These reels explain a thing;
they are not presenter-led, and inventing a presenter would only get in the way.

**Monthly:** check Instagram Settings → Account → Account Status, and TikTok Studio →
Account check. They are the only authoritative recommendation-eligibility signals; every
third-party "shadowban checker" is guessing.

**Open decision:** TikTok's Creator Rewards requires videos **over 1 minute**. At ~20s
these reels can never monetize there. Fine if TikTok is a reach/funnel play — a real fork
if not.

---

## Voices

**`Enceladus` (breathy, soft) is the channel voice. Use it for every clip.** The only
exception is when Ben explicitly asks for "the second voice" or "the female voice" —
that means **`Kore`** (firm, even). Never pick a different voice on your own; both
defaults are already set in `scripts/tts.mjs`.

Run `node scripts/tts.mjs` with no args for the full list. Measured comparisons for all
twelve live in `public/audio/voice-lab/` (`<voice>-raw.wav` vs `<voice>.wav`, plus
`report.json`).

The pace directive in `synthesize()`'s default `style` is what pulls Gemini off its
natural pace — but measured on a fixed line it currently *overshoots*: Enceladus lands
at **~174 wpm** against the 150–165 target, and most voices run 165–180. If a line comes
back too fast, loosen that directive; too slow, tighten it. Either way fix it in the
directive, never by time-stretching in post — that audibly degrades the audio.

---

## Gotchas

- **The camera makes the bottom edge lower than it looks.** Scenes scale the stage about
  `transformOrigin: 50% 55%` (y≈1056), so a nominal y=1500 renders at ~1518. This is why
  `band.stageFloor` is 1330 and not 1500 — a diagram that "just fits" at rest does not fit
  in motion.
- **The verdict is bottom-anchored and lives *outside* the camera layer.** It grows upward
  from `band.verdictBottom`. Do not move it back inside a scene: it used to be computed
  per-scene from the last element's y, inside the camera, which is exactly how `NoMemory`
  ended up rendering its verdict on top of its captions.
- **Never leave the stage empty at the open.** Structure lands at ~10% of the narration.
  It used to land at 22–26%, which meant the first five seconds of every clip were nothing
  but hook type and captions — bad for retention, and the exact frame shape Instagram's
  "majority text" and TikTok's "only text overlays" rules describe.
- **Gemini TTS returns headerless PCM** (signed 16-bit LE, 24 kHz). `pcmToWav()` adds
  the RIFF header. Don't feed the raw base64 to ffmpeg.
- **Audio must live in `public/`** for `staticFile()` to resolve it. `out/` is for
  renders only.
- **Soft shapes need `filter: blur()`, not a `radial-gradient`.** A gradient's last
  colour stop reads as a hard arc against flat dark. This was a real bug, not a
  hypothetical.
- **`whiteSpace: 'pre-line'`** is required for `\n` in hook text to break.
- **The render stage moves the loudness you mastered to.** Mastering buys clip-to-clip
  consistency, not a delivery guarantee — if an exact integrated target ever matters,
  measure the **mp4**, not the WAV, and do the final pass after rendering. Note that the
  old claim here ("5.8 LU spread → 2.1") did not survive measurement: the Auphonic-era
  files actually shipped at -17.4 to -12.5 LUFS, a 4.9 LU spread. `build-reels.mjs` now
  measures the spread across each batch and warns above 2 LU rather than asserting it.
- **Gemini ships inter-sample-clipped audio.** Raw takes read a safe-looking -1.0 dBFS
  sample peak while measuring **+0.8 dBTP** — the waveform passes above full scale
  *between* samples, and the platform's lossy encode makes that audible. Four of eighteen
  takes were over 0 dBTP. Never judge a take by sample peak; measure true peak with
  `ebur128=peak=true`.
- **Auphonic's Adaptive Leveler was the "it sounds like AI" bug.** It is built for a human
  drifting off-mic; TTS has no drift, so it only spent crest factor — 13.2 dB → 11.5 dB,
  and 8 to 144 samples per reel welded flat against the ceiling. Replaced by
  `scripts/master.mjs`, which is local, free, and instant. `auphonic.mjs` still works and
  is worth returning to the day there is a real microphone in the pipeline.
- **`loudnorm` emits at 192 kHz.** It upsamples internally for true-peak detection and
  does not resample back, so any sample-counting filter after it counts in 192 kHz units.
  `master.mjs` cut a clip to a quarter of its length exactly once this way. Always put an
  explicit `aresample` between `loudnorm` and anything downstream.
- **Compare audio in a real player, never a browser.** HTML `<audio>` resamples and
  re-encodes, which destroys the differences an A/B is trying to expose. `master-lab.mjs`
  therefore writes a folder of flat WAVs and refuses to build a review page. (Video review
  pages are fine — that is `review-page.mjs`.)
- **Node ≥20 on Windows cannot spawn a `.cmd` shim without `shell: true`** — it throws
  `spawn EINVAL`. `render-reels.mjs` therefore spawns `node` on
  `@remotion/cli/remotion-cli.js` directly rather than going through `npx`.
- **Gemini's delivered pace varies by script, not just by directive.** Comma-heavy list
  sentences drag; short declaratives rush. `build-reels.mjs` asks, measures, and
  re-asks until the take lands in the 150–165 band rather than trusting one directive.
- **The adjectives in the style directive outrank the number.** A directive asking for a
  "brisk, efficient pace of about 150 words per minute", with a base style that said to
  "throw the connecting words away", produced ten of eighteen takes out of band and one at
  195 wpm. The requested number was being drowned out. Every word in `BASE_STYLE` and
  `styleFor` now pulls toward unhurried, and the number carries the instruction. One reel
  (`WhenToUse`) still lands ~171 wpm across repeated takes; some scripts just run fast.
- **Gemini can return HTTP 200 with no audio.** `finishReason: "OTHER"`, a token count,
  and no parts. It is transient and clears on retry, so `tts.mjs` treats it exactly like a
  503 rather than letting a 200 mask a failure. Separately, a plain 500 killed a full
  18-reel rebuild eleven takes in — both are retried with backoff now.
- **`build-reels.mjs` commits per reel, not per batch.** It used to synthesize everything,
  then master everything, then write the manifest. A crash anywhere in that meant every
  completed take was lost, because the manifest is what makes a reel skippable. Now each
  reel is synthesized, mastered and committed before the next one starts, so a failure
  costs one take and re-running resumes.
- **Same voice does not mean same sound.** Every reel uses Enceladus, but Gemini is
  nondeterministic and takes differ audibly in brightness: spectral centroid measured
  2434–3394 Hz across one batch, a 39% spread. The take loop now scores timbre alongside
  pace, targeting the measured median of 2885 Hz. Pace outranks timbre by a wide margin —
  weighing them evenly let a 191 wpm take win on tone.
- **Captions must be anchored to detected speech, never spread across the clip.** Gemini
  leaves 0.12–0.43s of leading silence, so laying captions from frame 0 lit every word
  ~7 frames before the voice; and speech often ends well before the file does, which
  reverses the error in the back half. `scripts/speech.mjs` measures the real speech span
  and the internal pauses, `build-reels.mjs` stores them in the manifest, and
  `layoutWords()` anchors each sentence to the nearest real pause. Verify with
  `node scripts/check-captions.mjs` **after** a build — running it against audio made from
  an older draft compares two different sentence structures and fails meaninglessly.
- **Mastered WAVs are 48 kHz, not the 24 kHz Gemini produced.** `wavDuration()`'s default
  sample rate will therefore read a mastered file 2× short — pass the real rate, or use
  `ffprobe`. `calculateMetadata` is unaffected: Remotion's `getAudioDurationInSeconds`
  parses the real header.
- **The narration's length is the composition's length.** Every beat is a fraction of it,
  so any audio step that changes duration silently re-times the animation and invalidates
  every verification frame already approved. `master()` measures before and after and
  throws rather than writing a clip that drifted more than 2 ms.
- **Gemini's delivery is flat unless the directive asks otherwise.** Takes measured LRA
  2.6 LU against 5–12 for human speech, because the old style directive only said what to
  avoid ("no salesy lilt"), and the safe reading of that is monotone. No compressor can
  add dynamics that were never performed — fix it in `BASE_STYLE`, not in mastering.
- **Remotion's concurrency stops paying at 8.** Measured on the 5950X: 2→140s, 4→103s,
  8→93s, 16→87s, 24→85s. The ceiling is 1.65×, so ~40% of a render is serial — the
  CRF 18 encode. Never size a machine (or a pod) as though cores scale linearly.
- **The GPU does nothing for these renders — it makes them slower.** Reaching it needs
  `chrome-for-testing`, which Remotion documents as the slower flavor for CPU-bound
  work, and that loss exceeds anything the GPU returns. 91s on an 8-vCPU CPU pod vs
  114s on a 4090. Full numbers in `research/RUNPOD.md` §0.
- **Always pass `--concurrency` explicitly on a pod.** A GPU pod's container reports the
  *host's* core count (64 on a 21-vCPU pod), and oversubscribing doesn't degrade
  gracefully — the render dies.
- `.env` holds `GOOGLE_API_KEY`, `AUPHONIC_API_KEY` and `RUNPOD_API_KEY`, and is
  gitignored. `.env.example` documents them.

---

## Verification checklist

`node scripts/lint-reels.mjs` covers the mechanical half. Before calling a render done,
pull frames and confirm the rest by eye:

- [ ] Background is `palette.bg`, glow blob soft with no visible edge
- [ ] At most 2 accent colours in frame
- [ ] Arrows have origin dots; diagonal labels rotate
- [ ] Nothing cuts — elements enter, dim, and persist
- [ ] Nothing critical above y=180 or below y=1700
- [ ] **The `_a` frame (15%) is not blank** — structure should already be on screen
- [ ] **Would a stranger who has never heard of this channel follow it?** Read the
      narration cold. Every noun explained, nothing assumed, no unresolved pronouns
- [ ] Clear air between the verdict and the captions
- [ ] Captions present and tracking the voice
- [ ] **Muted playback still communicates the idea** — this is also the Instagram
      "majority text" and TikTok "only text overlays" defence, not just a taste rule
