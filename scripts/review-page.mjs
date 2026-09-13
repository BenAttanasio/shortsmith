#!/usr/bin/env node
/**
 * Static review page for the whole channel.
 *
 * Renders every reel in content/reels.json — in publish order, because array order *is*
 * publish order — into a single self-contained HTML file that plays the mp4s off disk.
 * This is the "read the channel back the way a reviewer will" step: YouTube's variety test
 * is a human scrolling recent uploads in a row (PLATFORM-POLICY §2.1), and the linter can
 * only check the mechanical half of that.
 *
 * The page is written to out/review/ and references ../reels/*.mp4 relatively, so the
 * whole out/ folder stays movable and nothing is copied or re-encoded.
 *
 * Durations come from ffprobe on the **mp4**, not the WAV, so what the page shows is the
 * delivered pace after rendering rather than the requested one.
 *
 * The page shows each reel's `publishTitle` — the string that gets typed into the upload
 * box — as prominently as the hook. It is distinct from `title`, which is the terse
 * on-screen anchor in the top bar, and it is the only text a viewer sees before the video
 * plays anywhere outside the Shorts feed: search, the channel grid, a shared link.
 *
 * Usage:
 *   node scripts/review-page.mjs
 *   node scripts/review-page.mjs --open        # and open it in the default browser
 *   node scripts/review-page.mjs --new 8       # tag the last N reels as the current batch
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out/review');
const REELS = path.join(ROOT, 'out/reels');

const argv = process.argv.slice(2);
const flagValue = (name, fallback) => {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  const v = Number(argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
};
const newCount = flagValue('--new', 0);

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/reels.json'), 'utf8'));
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/archetypes.json'), 'utf8'));

/** Straight from research/BRAND.md — the page is the product, so it uses the product's colours. */
const ACCENT = {
  mint: '#3DD9A4',
  cyan: '#22D3EE',
  violet: '#7750BA',
  amber: '#F0B429',
  rose: '#F2555A',
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;

const accentOf = (r) => r.accent ?? r.left?.accent ?? r.right?.accent ?? r.sourceAccent ?? 'mint';
const cameraOf = (r) => r.variant?.camera ?? spec.scenes[r.scene]?.defaultCamera ?? 'push';

const probe = async (file) => {
  try {
    const { stdout } = await run('ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    const n = Number(stdout.trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
};

const reels = [];
for (const [i, r] of data.reels.entries()) {
  const mp4 = path.join(REELS, `${r.id}.mp4`);
  const exists = fs.existsSync(mp4);
  const secs = exists ? await probe(mp4) : null;
  reels.push({
    ...r,
    slot: i + 1,
    exists,
    secs,
    wpm: secs ? Math.round(words(r.narration) / (secs / 60)) : null,
    isNew: newCount > 0 && i >= data.reels.length - newCount,
  });
}

const chip = (k, v) => (v == null ? '' : `<span class="chip"><b>${esc(k)}</b>${esc(v)}</span>`);

const card = (r) => {
  const col = ACCENT[accentOf(r)] ?? ACCENT.mint;
  const video = r.exists
    ? `<video src="../reels/${esc(r.id)}.mp4" controls preload="metadata" playsinline loop></video>`
    : `<div class="missing">not rendered yet<span>node scripts/render-reels.mjs ${esc(r.id)}</span></div>`;

  return `
<article class="card${r.isNew ? ' is-new' : ''}" style="--accent:${col}"
         data-scene="${esc(r.scene)}" data-new="${r.isNew ? '1' : '0'}">
  <div class="player">${video}</div>
  <div class="meta">
    <header>
      <span class="slot">${r.slot}</span>
      <h2>${esc(r.title)}</h2>
      ${r.isNew ? '<span class="tag new">new</span>' : ''}
      <span class="tag scene">${esc(r.scene)}</span>
    </header>

    <p class="id">${esc(r.id)}${r.secs ? ` · ${r.secs.toFixed(1)}s · ${r.wpm} wpm` : ''}</p>

    <div class="pubtitle">
      <span class="pubtitle-label">upload title</span>
      <p${r.publishTitle && r.publishTitle.length > 60 ? ' class="over"' : ''}>${esc(r.publishTitle ?? '— not set —')}</p>
      <span class="count">${(r.publishTitle ?? '').length} chars</span>
    </div>

    <div class="hook">${esc(r.hook)}</div>
    <p class="verdict">${esc(r.verdict)}</p>

    <div class="chips">
      ${chip('accent ', accentOf(r))}
      ${chip('camera ', cameraOf(r))}
      ${chip('hook ', r.variant?.hook)}
      ${chip('entrance ', r.variant?.entrance)}
      ${r.variant?.pace ? chip('pace ', r.variant.pace) : ''}
      ${r.variant?.mirror ? chip('mirror ', 'on') : ''}
    </div>

    <details>
      <summary>narration · ${words(r.narration)} words</summary>
      <p class="narration">${esc(r.narration)}</p>
    </details>
  </div>
</article>`;
};

const scenes = [...new Set(data.reels.map((r) => r.scene))].sort();
const rendered = reels.filter((r) => r.exists).length;
const totalSecs = reels.reduce((a, r) => a + (r.secs ?? 0), 0);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(data.channel)} — reel review</title>
<style>
  :root {
    --bg:#242623; --glow:#282A27; --surface:#31332F; --border:#4C4E4B;
    --ink:#FDFFFC; --mute:#A8AAA6;
    color-scheme: dark;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; background:var(--bg); color:var(--ink);
    font:400 16px/1.5 'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif;
    padding:48px 32px 96px;
  }
  body::before {
    content:''; position:fixed; inset:auto -20% -30% 30%; height:80vh;
    background:var(--glow); filter:blur(140px); border-radius:50%;
    z-index:-1; pointer-events:none;
  }
  header.page { max-width:1400px; margin:0 auto 40px; }
  h1 { font-size:34px; font-weight:500; margin:0 0 6px; letter-spacing:-0.01em; }
  .sub { color:var(--mute); margin:0 0 4px; max-width:70ch; }
  .stats { color:var(--mute); font-size:14px; margin-top:14px; }
  .stats b { color:var(--ink); font-weight:500; }

  .titles { margin-top:18px; }
  .titles summary { cursor:pointer; color:var(--mute); font-size:14px; }
  .titles ol { margin:12px 0 0; padding-left:28px; max-width:70ch; }
  .titles li { margin:0 0 6px; display:flex; gap:12px; align-items:baseline; }
  .titles li span { flex:1 1 auto; }
  .titles li em {
    font-style:normal; font-family:'JetBrains Mono', ui-monospace, monospace;
    font-size:11px; color:var(--mute);
  }

  .controls { display:flex; flex-wrap:wrap; gap:8px; margin:22px 0 0; }
  button {
    background:var(--surface); color:var(--ink); border:1px solid var(--border);
    border-radius:999px; padding:7px 15px; font:inherit; font-size:14px; cursor:pointer;
  }
  button:hover { border-color:var(--mute); }
  button[aria-pressed="true"] { background:var(--ink); color:var(--bg); border-color:var(--ink); }

  .grid {
    max-width:1400px; margin:0 auto;
    display:grid; grid-template-columns:repeat(auto-fill, minmax(330px,1fr)); gap:26px;
  }
  .card {
    background:var(--surface); border:1px solid var(--border); border-radius:20px;
    overflow:hidden; display:flex; flex-direction:column;
  }
  .card.is-new { border-color:var(--accent); }
  .player { background:#151714; aspect-ratio:9/16; }
  .player video { width:100%; height:100%; display:block; object-fit:contain; }
  .missing {
    width:100%; height:100%; display:flex; flex-direction:column; gap:8px;
    align-items:center; justify-content:center; color:var(--mute); font-size:14px;
  }
  .missing span { font-family:'JetBrains Mono', ui-monospace, monospace; font-size:12px; opacity:.7; }

  .meta { padding:18px 20px 20px; display:flex; flex-direction:column; gap:10px; }
  .meta header { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .slot {
    width:26px; height:26px; flex:none; border-radius:50%;
    background:var(--accent); color:#1A1C19;
    display:grid; place-items:center; font-size:13px; font-weight:600;
  }
  h2 { font-size:19px; font-weight:500; margin:0; flex:1 1 auto; }
  .tag {
    font-size:11px; letter-spacing:.06em; text-transform:uppercase;
    border:1px solid var(--border); border-radius:6px; padding:2px 7px; color:var(--mute);
  }
  .tag.new { border-color:var(--accent); color:var(--accent); }
  .id { margin:0; font-family:'JetBrains Mono', ui-monospace, monospace; font-size:12px; color:var(--mute); }

  /* The upload title is the only text a viewer sees before the video plays anywhere
     outside the Shorts feed, so the review page shows it as prominently as the hook. */
  .pubtitle {
    border:1px dashed var(--border); border-radius:12px; padding:10px 12px;
    display:flex; flex-direction:column; gap:3px;
  }
  .pubtitle-label {
    font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:var(--mute);
  }
  .pubtitle p { margin:0; font-size:16px; font-weight:500; line-height:1.3; }
  .pubtitle p.over { color:#F0B429; }
  .pubtitle .count { font-size:11px; color:var(--mute); font-family:'JetBrains Mono', ui-monospace, monospace; }

  .hook {
    white-space:pre-line; font-size:23px; font-weight:500; line-height:1.2;
    padding:12px 0 2px; border-top:1px solid var(--border);
  }
  .verdict { margin:0; color:var(--accent); font-size:15px; }

  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chip {
    font-size:12px; color:var(--ink); background:rgba(255,255,255,.05);
    border:1px solid var(--border); border-radius:999px; padding:3px 10px;
  }
  .chip b { color:var(--mute); font-weight:400; }

  details summary { cursor:pointer; color:var(--mute); font-size:13px; }
  .narration { color:var(--mute); font-size:14px; margin:8px 0 0; }

  @media (max-width:640px) { body { padding:28px 16px 64px; } }
</style>
</head>
<body>

<header class="page">
  <h1>${esc(data.channel)}</h1>
  <p class="sub">${esc(data.premise)}</p>
  <p class="stats">
    <b>${reels.length}</b> reels in publish order ·
    <b>${rendered}</b> rendered ·
    <b>${Math.round(totalSecs)}s</b> total ·
    <b>${scenes.length}</b> archetypes ·
    voice <b>${esc(data.voice)}</b>
  </p>
  <details class="titles">
    <summary>upload titles, in publish order</summary>
    <ol>
      ${reels.map((r) => `<li><span>${esc(r.publishTitle ?? '— not set —')}</span><em>${(r.publishTitle ?? '').length}</em></li>`).join('\n      ')}
    </ol>
  </details>

  <div class="controls">
    <button data-filter="all" aria-pressed="true">All</button>
    ${newCount ? '<button data-filter="new" aria-pressed="false">This batch</button>' : ''}
    ${scenes.map((s) => `<button data-filter="scene:${esc(s)}" aria-pressed="false">${esc(s)}</button>`).join('\n    ')}
  </div>
</header>

<main class="grid">
${reels.map(card).join('\n')}
</main>

<script>
  // Only ever one video playing — this page is for judging clips one at a time.
  const vids = [...document.querySelectorAll('video')];
  vids.forEach((v) => v.addEventListener('play', () => {
    vids.forEach((o) => { if (o !== v) o.pause(); });
  }));

  const buttons = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('.card')];
  buttons.forEach((b) => b.addEventListener('click', () => {
    buttons.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    const f = b.dataset.filter;
    cards.forEach((c) => {
      const show = f === 'all'
        || (f === 'new' && c.dataset.new === '1')
        || (f.startsWith('scene:') && c.dataset.scene === f.slice(6));
      c.style.display = show ? '' : 'none';
    });
  }));
</script>
</body>
</html>
`;

fs.mkdirSync(OUT, { recursive: true });
const dest = path.join(OUT, 'index.html');
fs.writeFileSync(dest, html);

console.log(`✓ review page → ${dest}`);
console.log(`  ${reels.length} reels, ${rendered} with a rendered mp4`);
const missing = reels.filter((r) => !r.exists).map((r) => r.id);
if (missing.length) console.log(`  not yet rendered: ${missing.join(', ')}`);

if (argv.includes('--open')) {
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', dest]]
    : process.platform === 'darwin' ? ['open', [dest]]
    : ['xdg-open', [dest]];
  run(...opener).catch(() => {});
}
