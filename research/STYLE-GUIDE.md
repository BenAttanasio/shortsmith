# The Shortsmith Style Guide

Distilled from ByteByteGo's *"AI Agent Overview"* (`eHEHE2fpnWQ`, 5:31, 1920×1080@25fps,
725 words of narration) with structural borrowings from 3Blue1Brown. Colors below are
sampled programmatically from 28 evenly-spaced frames, not eyeballed.

---

## 1. The palette

ByteByteGo's background is **not** neutral gray and **not** black. It is a warm,
faintly green-shifted charcoal. That subtle hue cast is the single most identifiable
part of the look, and pure `#1a1a1a` reads as cheap next to it.

| Token | Hex | Coverage | Role |
|---|---|---|---|
| `bg` | `#242623` | 67.5% | Base canvas |
| `bgGlow` | `#282A27` | 12.0% | Soft off-center blob, bottom-right |
| `surface` | `#393B38` | 4.7% | Container / card fill |
| `border` | `#4C4E4B` | 0.3% | Container stroke, dashed or solid |
| `ink` | `#FDFFFC` | 0.5% | Text, arrows, line-art. Warm white, never `#fff` |
| `inkMute` | `#A8AAA6` | — | Secondary labels, arrow captions |

Accents appear **sparingly** — one or two per scene, never more:

| Token | Hex | Used for |
|---|---|---|
| `mint` | `#3DD9A4` | Primary accent: humans, "good path", code brackets |
| `cyan` | `#22D3EE` | Data, storage, highlight chips |
| `violet` | `#7750BA` | Agents, multiplicity, swarms |
| `amber` | `#F0B429` | Attention, checklists, warnings |
| `rose` | `#F2555A` | Failure, cost, the thing being fixed |

**Rule:** the frame is ~90% background and ink. Accent is a spice, not a sauce.
When frame `f_021` needed to show eight agents at once it made them *all* violet —
one color carrying "these are the same kind of thing" — rather than a rainbow.

### The glow blob
Bottom-right, a very large soft shape ~4% lighter than the base, roughly a
quarter-circle bleeding off both edges. It keeps a flat dark frame from reading as
dead space. At 1080×1920 vertical, move it to bottom-center-right and scale it up.

---

## 2. Typography

- **Display / UI:** geometric sans with generous apertures — **Poppins** is the closest
  free match to their face. Titles sit at ~500 weight, never bold.
- **Code / data:** **JetBrains Mono**, rendered inside a near-black `#151714` card that
  is *darker* than the page background. Code recedes into the page; diagrams sit on top of it.
- **Title bar:** persistent top-left, same string for the entire video, `inkMute`-to-`ink`.
  It is an anchor, not a headline — it never animates after the first frame.
- **Arrow labels:** small (~40% of body size), `inkMute`, and **rotated to follow the arrow
  angle** when the arrow is diagonal. This is a signature move (see `f_014`:
  "orchestrate", "execute", "interact", "call API" all ride their arrows).
- **Vertical text** for tall narrow containers — "Environment" and "Agents" are set
  rotated 90° along the container's long axis (`f_002`, `f_017`). Saves horizontal
  space and reads as a *label for the region* rather than a title for the content.

---

## 3. The container grammar

Two border treatments carry two different meanings, consistently:

- **Solid 1px border** = a concrete, bounded system. A process, a service, a real
  boundary things cross. ("Agents", "Environment")
- **Dashed border** = a conceptual grouping. "These belong to the same category."
  ("Multi Agent Systems", the tool clusters in `f_014`)

Both use `surface` fill on `bg`, radius ~16–24px at 1080p. Nesting is common and
meaningful: a solid box containing dashed boxes containing icons.

---

## 4. The arrow grammar

Arrows are the actual content of a ByteByteGo frame. Their vocabulary:

- 1.5–2px `ink` stroke, **solid triangular arrowhead**, small filled **dot at the origin**.
  The origin dot is subtle and does a lot of work — it disambiguates direction before
  your eye reaches the head.
- **One head** = flow in one direction. **Two heads** = a conversation/exchange (`f_009`,
  `f_011`).
- Labels ride the line, mid-span, rotated to match.
- Orthogonal (right-angle) routing inside containers; straight diagonals between them.

---

## 5. Iconography

Line-art, ~2px stroke, mostly `ink` with a single accent color per icon. Never filled
illustrations, never gradients, never drop shadows. The recurring cast:

- **The robot** — white, rounded, antenna, two dot eyes. Represents "the agent."
  Reused at three scales: mascot (corner of a container), actor (in a flow), token (in a swarm).
- **The person** — mint, seated at a laptop, three-quarter view.
- **Cylinder stack** = database. **Grid** = table. **Clipboard + check** = results.
  **Cube cluster** = context/embeddings. **`</>`** = code execution.
- **Real third-party logos** (Slack, Stripe, MySQL, Oracle, YouTube) are dropped in at
  full color inside dashed containers. This is the *only* place saturated color appears,
  and it works because it's clearly "quoted material."

---

## 6. Animation: the progressive build

This is the most important structural finding, and it is what separates ByteByteGo
from a slide deck.

**A diagram is never cut to. It is assembled, and it persists.**

Frames `f_002` and `f_017` are the same diagram twelve minutes of narration apart.
`f_002` has Sensors → robot → Actuators and the Environment box. `f_017` has all of
that *plus* a thermometer on Sensors, plus a Model/State inner card, plus a
condition-action rule chip, plus the actions arrow. Nothing was removed. Nothing moved.
The narration added ideas and the diagram grew to match.

The implications for scripting:

1. **Elements enter on the narrated word, not on a fixed beat.** The thermometer appears
   as the voice says "temperature."
2. **Entrances are short and springy** — 300–450ms, mass ~0.6, damping ~14. Fade + a
   ~12px directional slide, or scale from 0.92. Never a slow crossfade.
3. **Arrows draw** rather than fade — stroke-dashoffset from full length to zero,
   ~350ms, ease-out. The head pops in at the end with a tiny overshoot.
4. **Existing elements dim rather than disappear** when focus moves — drop opacity to
   ~0.4 and let the new element sit at 1.0. 3Blue1Brown does the same thing.
5. **The camera moves instead of cutting.** Scale/translate the whole diagram to frame
   the sub-part under discussion, with a long ease (800ms+). Cuts are reserved for
   genuine topic changes.

---

## 7. Scripting: the ByteByteGo sentence

Measured pacing: **725 words / 331s = 131 wpm.** That is deliberately slow — roughly
2.2 words per second, with real pauses at section boundaries. For a 30–60s vertical
short, push to **150–165 wpm**; the format demands more density, but do not go past
~170 or the diagram cannot keep up with the words.

Observed structural moves, in order of how often they appear:

**Open by naming the thing, not by teasing it.**
> "today we're exploring AI agents"

No "you won't believe." No cold-open mystery. The title card and the first sentence
say the same thing. For a *short*, this needs one adjustment: replace the topic
announcement with a **tension statement** in the first 1.5 seconds, because a Short has
no thumbnail to pre-qualify the viewer. See §8.

**State the roadmap once.**
> "we'll break down what they are, how they work under the hood, and how we can leverage them"

**Transition with a question, then answer it immediately.**
> "so what exactly is an AI agent?" · "but what makes them fundamentally different from
> traditional software?"

The question is the section header. It is never rhetorical filler — the very next
clause answers it.

**Define by contrast against the thing the viewer already knows.**
> "while conventional programs follow predetermined execution paths, agents actively
> monitor their environment…"
> "unlike stateless API endpoints that process each request in isolation…"

This is the single highest-leverage sentence pattern in the whole transcript. The
viewer's existing mental model is the scaffold; the new idea is defined as a *delta*
from it.

**Then immediately name the paradigm.**
> "this represents a paradigm shift from imperative programming … to declarative goal setting"

Contrast first, label second. Never label first.

**Ground every abstraction in one concrete instance.** "IF temperature is too high THEN
turn on the fan." "Help me plan a trip with flights and hotels." The abstraction and its
instance are always adjacent, never separated by more than a sentence.

**Do not dumb down the nouns.** "Vector databases," "condition-action rules,"
"reinforcement techniques," "utility-based agents." The *syntax* is simple; the
*vocabulary* is not. This is what makes the channel feel like it respects you.

**Close by zooming out, then one CTA.**
> "AI agents represent a fundamental evolution in how we build software systems…"

---

## 7b. Clarity is the first constraint, not the last

The first eighteen reels shipped and read as vague. This section is what came out of that
review, and `scripts/lint-reels.mjs` enforces the mechanical parts of it — `E-COLD-OPEN`,
`E-HOOK-VAGUE`, `E-PHRASE-TELL`, `E-PUBTITLE-VAGUE`.

### Write for a viewer who arrived by accident

ByteByteGo's audience chose the video. Ours did not. A Short arrives mid-scroll, with no
thumbnail read, no channel context, and no knowledge that this channel is about generative
AI at all. **Everything is explained from zero, every time.**

The concrete consequence: **name the subject in the first sentence, in words the viewer
already owns.** "An AI chatbot like ChatGPT." "An AI model." Not "the model," not "it," and
never a bare pronoun — a pronoun in sentence one has no antecedent, because the viewer has
seen nothing yet.

> ✗ "Chat with your documents sounds like the model reads them."
> ✓ "You upload a PDF to an AI tool and ask a question, and it feels like the model read
>   your document. It didn't."

The second one costs eight words and is comprehensible to someone who has never heard the
phrase "chat with your documents."

### Every reel opens a loop and closes it

The hook poses something; the verdict answers it. That is the whole retention mechanic, and
it is the reason the verdict exists as a separate field.

A hook may be a literal question ("Does ChatGPT remember you?") or a tension statement that
implies one ("An AI model cannot click a button." → *then how does it act?*). What it may
**not** be is a label. A label gives the scroller nothing to want.

> ✗ "A desk. / Not a brain."  — two abstract nouns and a negation. About what?
> ✗ "Four chunks. / That's all."  — four chunks of *what*?
> ✓ "Does the AI read / your whole PDF?"

The failure mode these share is sounding profound while communicating nothing. It is easy
to write and it reads as machine-generated, because it is the shape a model produces when
it is optimizing for cadence over content.

### Banned phrasings

These read as AI-written to anyone who has spent time around AI-written text. The linter
errors on all of them.

| Banned | Why |
|---|---|
| "it's not just X, it's Y" | The escalation cliché. State the claim once. |
| "what actually separates them" | The adverb is carrying an argument the sentence should make. |
| "the real work" / "the real question" | Implies the viewer was told something fake. Just say what it is. |
| "isn't just" / "isn't only" | Same escalation, contracted. |
| "here's the thing" / "the truth is" | Throat-clearing. Start at the next word. |
| "let's dive in" / "let's explore" | A 20-second reel has no time to announce itself. |
| em dash / en dash | Never asked for by this guide. A loud machine-written tell. See §7c. |

**Not banned:** plain negation used for genuine contrast — *"it is not the model breaking"*
— which is §7's highest-leverage move. The ban is on the *escalation* form, where the
negation exists only to set up a more dramatic restatement of the same idea.

### 7c. Prose rhythm: explain, do not perform concision

The single loudest machine-written tell in the first eighteen scripts was not vocabulary.
It was **rhythm** — clipped parallel fragments strung together with commas, because that
shape reads as confident and costs no thought to produce.

> ✗ "It files the ticket, updates the record, sends the email."
> ✓ "It can file a ticket, update a record, or send an email."

> ✗ "Fine-tuning changes how the model behaves. Its tone, its format, its habits."
> ✓ "Fine-tuning changes how the model behaves, meaning its tone, its format, and its habits."

The rule: **a list of three or more gets a conjunction before the last item.** No
exceptions in narration. The linter errors as `W-ASYNDETON`.

More broadly, write the connective tissue instead of deleting it. "On one hand… on the
other hand." "…because…" "So…" "That means…" Sentences that state their own relationship
to the previous sentence are what makes an explanation followable at 157 wpm with no
rewind button. Nobody talks in fragments at a whiteboard.

**The verdict is exempt.** It is defined in BRAND.md §5 as a line the viewer can repeat out
loud to a colleague, so terseness there is the job.

#### No em dashes

Not in narration, hooks, verdicts, or titles. They were never in this guide — they crept
into eighteen scripts on their own, and they are one of the most recognisable signatures
of generated text. Use a comma, a colon, or a full stop. `E-PHRASE-TELL` errors on them.

#### Never leave a referent unresolved

Every "them", "this", "it" must have an antecedent the viewer already has. A cold scroller
does not.

> ✗ "Here is the line between them."  — between *what*?
> ✓ "Here is the line between an agent and an ordinary chatbot."

Same rule for invented vocabulary. A `nest` diagram draws rings, but "the free consumer app
is a different ring" means nothing to someone who has been watching for nine seconds. Say
the concept: "the free consumer version has different terms."

#### Be semantically precise, and know the subject

> ✗ "…which is why your bill never matches your word count."

Why would a bill ever match a word count? The sentence sounds like an explanation and is
not one. What is actually true, and useful, is the conversion:

> ✓ "…so you can estimate a bill by taking your word count and adding about a third."

If a claim cannot survive being asked "what exactly does that mean", it is decoration. The
channel is teaching people; a plausible-sounding sentence that falls apart under one
question is worse than saying nothing.

### Two titles, two jobs

- **`title`** — the persistent top-bar anchor. Terse, never animates, read at a glance.
- **`publishTitle`** — what gets typed into the upload box. It has to work as a search
  result with no thumbnail and no video attached, so it names the subject explicitly and
  front-loads the payload. Mobile truncates around 40–60 characters.

They are deliberately different strings. "The context window" is a fine anchor and a
useless search result; "What can ChatGPT see at once?" is the reverse.

#### The shape of a `publishTitle`

From measured performance data (2026-08-23). The target is **thing + job**: a noun you
could photograph, doing something, ideally with the viewer in the frame.

> ✓ "How an AI books a meeting for you"
> ✓ "Why ChatGPT forgets your last chat"
> ✓ "What an AI reads when you upload a PDF"

Three reliable underperformers, all warned on as `W-PUBTITLE-SHAPE`:

| Failure | Examples | Why |
|---|---|---|
| **Absence words** | no longer, stopped, don't, never, quit, trap, wasted | Titles what the thing fails to do instead of what it does. |
| **Command openers** | Build, Run, Save, Stop, Use, Connect | Leads with an instruction rather than a subject. |
| **Concepts as subject** | context, workflow, leverage, systems, retrieval | Nothing to picture. Open on something concrete. |

The three formats worth reaching for first:

1. My [thing] [does job] for me
2. How to [task] with [tool]
3. "[Claim]" — I tested it on [real thing]

Formats 1 and 3 are first-person and this channel never personifies its narrator
(BRAND.md §4). So take the *structure* rather than the pronoun: "How an AI books a meeting **for you**" keeps the
viewer in frame without inventing a presenter.

### What to take from 3Blue1Brown instead

- **One idea per visual.** Never two concepts on screen competing.
- **Earn the formalism.** Show the concrete case moving before you name the general rule.
- **The visual is the argument.** If the narration could be understood with the video
  muted off, the diagram isn't doing its job. Conversely if the diagram is decorative,
  cut it.
- **Silence is allowed.** Let a motion complete before the next sentence starts.

---

## 8. Adapting to 1080×1920 vertical

The source is 16:9 with the diagram occupying ~40% of frame and enormous margins.
That does not survive a crop. The vertical translation:

| Zone | Y range (of 1920) | Contents |
|---|---|---|
| Safe top | 0–180 | Title bar + logo. Nothing critical — platform chrome overlaps. |
| Hook | 180–520 | Big type, 2–4 words per line, the tension statement. |
| **Stage** | 520–1500 | The diagram. This is the whole video. |
| Caption | 1500–1700 | Word-synced subtitles, 2 lines max. |
| Safe bottom | 1700–1920 | Empty. IG/YT put UI here. |

Consequences:

- **Diagrams stack vertically.** A left-to-right flow becomes top-to-bottom. The
  `f_014` radial hub layout survives a crop better than anything else and should be
  the default for "one thing talks to N things."
- **Type gets much bigger.** Minimum readable body on a phone is ~44px at 1080 wide.
  Arrow labels bottom out around 32px.
- **Max 4 nodes on screen at once.** The source routinely shows 6–8; vertical cannot.
- **Captions are mandatory.** The majority of Shorts/Reels playback starts muted.
  Word-level highlighting, not sentence-level blocks.
- **The first 1.5 seconds decide everything.** There is no thumbnail and no title to
  pre-qualify — the frame must state the tension before the viewer's thumb moves.
  This is the one place we deliberately depart from ByteByteGo's calm open.

---

## 9. The archetype library

Ten layouts, each doing a rhetorical job the others can't. This exists so variety lives in
structure rather than in colour — ten reels in a row should not read as one reel posted ten
times.

Pick by **what the sentence is doing**, never by what looks fresh.

| Scene | The sentence it draws | Counts |
|---|---|---|
| `contrast` | "A, versus B" — define against what the viewer knows | 2 sides |
| `chain` | "A becomes B becomes C" — a process has legible steps | 2–4 |
| `fill` | "Everything inside this boundary, and nothing else" | 3–5 |
| `fanout` | "One thing talks to N things, in parallel" | 2–4 |
| `layers` | "Your problem lives in tier *k* of a stack you call one thing" | 3–5 |
| `loop` | "You think it's a line; it's a loop" | 3–4 |
| `code` | "Here's the literal artifact, and the one line that matters" | 3–9 |
| `nest` | "X inside Y inside Z — and it never leaves the outer ring" | 2–3 |
| `matrix` | "Two axes, four cases — here's which one you're in" | 4 cells |
| `gather` | "N things collapse into one, and the collapsing is the decision" | 2–4 |

Ceilings, required props and text widths live in `content/archetypes.json`, which
`scripts/lint-reels.mjs` enforces. **Do not hand-tune a layout past them** — they are
derived from the geometry, not from taste.

### The oppositions are the point

- `chain` asserts a **terminus**; `loop` asserts there isn't one. Same subject, opposite
  claim.
- `fanout` **distributes**; `gather` **collapses**. Fanout's interesting moment is the
  split, gather's is the middle tier that decides what survives.
- `contrast` is one-dimensional; `matrix` is two. Matrix is the escalation, not the
  default — it carries the most reading of anything here and is the most likely to fail
  the muted-playback check.
- `nest`'s `direction` field inverts its own argument: `'in'` narrows and dims, `'out'`
  widens and holds, and the camera follows. One field, two different videos.

### The geometry contract

Every archetype is designed against `band` in `src/theme.ts`:

- **`diagramTop` 560** — structure starts here.
- **`stageFloor` 1330** — the lowest a diagram may go. Well above `stageBottom` (1500)
  because the camera scales the stage about y≈1056, so a nominal 1500 renders at ~1518.
  A diagram that fits at rest does not fit in motion.
- **`verdictBottom` 1462** — the verdict is *bottom-anchored* and rendered **outside** the
  camera layer, so it grows upward into the diagram's air and can never be pushed into
  the captions.

**Structure must be on screen by ~10% of the narration.** Leaving the stage empty until
22–26% meant the opening five seconds of every clip were pure text — bad for retention,
and the exact frame shape Instagram's "majority text" and TikTok's "only text overlays"
rules describe.

### Camera

Six moves, chosen per-reel (`variant.camera`), not a house default:

`push` · `settle` · `drift-up` · `drift-left` · `hold` · `frame-part`

`hold` exists because `code` renders mono at 34px, where even a 4% scale visibly softens
the glyphs — when the diagram *is* text, the camera must not move. `frame-part` pushes in
on a focus point and back out; it is §6.5's "the camera frames the sub-part under
discussion", and it is deliberately gentle (1.06) because it scales about an off-centre
origin and will fling the opposite corner out of frame.

---

## 10. Checklist before rendering

- [ ] Background is `#242623`, not black, and the glow blob is present
- [ ] At most 2 accent colors in the frame
- [ ] Every arrow has an origin dot and a rotated label if diagonal
- [ ] Nothing cuts — elements enter, dim, and persist
- [ ] Every entrance lands on its narrated word
- [ ] Nothing critical above y=180 or below y=1700
- [ ] Captions present and word-synced
- [ ] Read the script aloud: is it 150–165 wpm?
- [ ] Every abstraction has a concrete instance within one sentence
- [ ] Muted playback still communicates the idea
- [ ] **The first sentence names the subject** — "an AI chatbot like ChatGPT", not "it"
- [ ] **The hook opens a loop the verdict closes** — and neither is a bare label
- [ ] **No banned phrasing** (§7b) — the linter errors, but read it aloud anyway
- [ ] **`publishTitle` works with no video attached** — it is a search result, not a caption
