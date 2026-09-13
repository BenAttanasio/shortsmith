#!/usr/bin/env node
/**
 * Script review page — copy only, no video.
 *
 * Separate from `review-page.mjs` on purpose. That page reviews *rendered clips* and goes
 * stale the moment a script changes; this one reviews the writing **before** anything is
 * synthesized or rendered, which is the point at which changes are still free. Rewriting a
 * line here costs nothing. Rewriting it after a build costs a Gemini take, a re-render, and
 * every verification frame already approved.
 *
 * Everything on the page is derived from `content/reels.json`, so it is always current
 * with what the next build would produce.
 *
 * Usage:
 *   node scripts/script-review.mjs
 *   node scripts/script-review.mjs --open
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lintFromDisk } from './lint-reels.mjs';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out/review');

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/reels.json'), 'utf8'));
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/archetypes.json'), 'utf8'));
const manifest = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'content/.audio-manifest.json'), 'utf8')); }
  catch { return { entries: {} }; }
})();

const { findings } = await lintFromDisk({ audio: false });
const byId = {};
for (const f of findings) (byId[f.id] ??= []).push(f);

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;

/** The pace the build loop aims for, so the estimate matches what will be synthesized. */
const AIM_WPM = 157;

const ACCENT = { mint: '#3DD9A4', cyan: '#22D3EE', violet: '#7750BA', amber: '#F0B429', rose: '#F2555A' };
const accentOf = (r) => r.accent ?? r.left?.accent ?? r.right?.accent ?? r.sourceAccent ?? 'mint';

/** Split narration into sentences so long paragraphs stay scannable. */
const sentences = (s) => String(s).split(/(?<=[.?!])\s+/).filter(Boolean);

/**
 * Has the script changed since the WAV was built?
 *
 * Compared directly against the manifest hash rather than read off a lint finding: the
 * lint run above has audio rules disabled (they need ffprobe on every WAV), so
 * `W-AUDIO-STALE` never fires here and the banner would silently never appear. This is the
 * one signal on the page that must not be wrong — it is what tells you the rendered clips
 * are showing different words to the ones you are reading.
 */
const isStale = (r) => {
  const e = manifest.entries?.[r.id];
  if (!e) return true;
  return e.sha !== crypto.createHash('sha1').update(r.narration, 'utf8').digest('hex');
};

const card = (r, i) => {
  const col = ACCENT[accentOf(r)] ?? ACCENT.mint;
  const n = words(r.narration);
  const secs = (n / AIM_WPM) * 60;
  const over = n > spec.narration.bandHi;
  const notes = (byId[r.id] ?? []).filter((f) => !/RUN-|COVERAGE|CAMERA|COMBO|ACCENT-OVER/.test(f.code));

  return `
<article class="card" id="${esc(r.id)}" style="--accent:${col}">
  <header>
    <span class="slot">${i + 1}</span>
    <div class="titles">
      <h2>${esc(r.publishTitle ?? '— no upload title —')}</h2>
      <p class="sub">${esc(r.id)} · <span class="tag">${esc(r.scene)}</span> · on-screen title “${esc(r.title)}”</p>
    </div>
  </header>

  <div class="hook">${esc(r.hook)}</div>

  <div class="narration">
    ${sentences(r.narration).map((s) => `<p>${esc(s)}</p>`).join('\n    ')}
  </div>

  <p class="verdict">${esc(r.verdict)}</p>

  <footer>
    <span class="chip${over ? ' warn' : ''}">${n} words${over ? ` · over ${spec.narration.bandHi}` : ''}</span>
    <span class="chip">~${secs.toFixed(0)}s at ${AIM_WPM} wpm</span>
    ${notes.map((f) => `<span class="chip note">${esc(f.code)}</span>`).join('')}
  </footer>
</article>`;
};

const totalWords = data.reels.reduce((a, r) => a + words(r.narration), 0);
const stale = data.reels.filter(isStale).length;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(data.channel)} — script review</title>
<style>
  :root { --bg:#242623; --surface:#31332F; --border:#4C4E4B; --ink:#FDFFFC; --mute:#A8AAA6; color-scheme:dark; }
  * { box-sizing:border-box; }
  body {
    margin:0; background:var(--bg); color:var(--ink);
    font:400 17px/1.6 'Poppins', system-ui, -apple-system, 'Segoe UI', sans-serif;
    padding:48px 24px 120px;
  }
  .page { max-width:820px; margin:0 auto; }
  h1 { font-size:32px; font-weight:500; margin:0 0 8px; letter-spacing:-0.01em; }
  .lede { color:var(--mute); margin:0 0 6px; }
  .stats { color:var(--mute); font-size:14px; margin:14px 0 0; }
  .stats b { color:var(--ink); font-weight:500; }
  .banner {
    margin:22px 0 0; padding:12px 16px; border-radius:12px;
    border:1px solid #F0B429; color:#F0B429; font-size:14px;
  }

  .card {
    background:var(--surface); border:1px solid var(--border); border-radius:18px;
    padding:26px 28px; margin:26px 0;
  }
  .card header { display:flex; gap:14px; align-items:flex-start; margin-bottom:18px; }
  .slot {
    width:30px; height:30px; flex:none; border-radius:50%; background:var(--accent);
    color:#1A1C19; display:grid; place-items:center; font-size:14px; font-weight:600; margin-top:2px;
  }
  .titles { flex:1 1 auto; }
  h2 { font-size:21px; font-weight:500; margin:0; line-height:1.3; }
  .sub { margin:4px 0 0; color:var(--mute); font-size:13px;
         font-family:'JetBrains Mono', ui-monospace, monospace; }
  .tag { color:var(--accent); }

  .hook {
    white-space:pre-line; font-size:27px; font-weight:500; line-height:1.25;
    padding:16px 0 18px; margin-bottom:6px;
    border-top:1px solid var(--border); border-bottom:1px solid var(--border);
  }

  /* One paragraph per sentence: the unit the voice pauses on, and the unit a caption
     boundary anchors to. Reading it this way makes a clumsy sentence obvious. */
  .narration { margin:18px 0; }
  .narration p { margin:0 0 10px; }

  .verdict {
    margin:18px 0 0; color:var(--accent); font-size:19px; font-weight:500;
    white-space:pre-line;
  }

  footer { display:flex; flex-wrap:wrap; gap:7px; margin-top:20px; }
  .chip {
    font-size:12px; color:var(--mute); background:rgba(255,255,255,.05);
    border:1px solid var(--border); border-radius:999px; padding:3px 11px;
    font-family:'JetBrains Mono', ui-monospace, monospace;
  }
  .chip.warn { color:#F0B429; border-color:#F0B429; }
  .chip.note { color:#F2555A; border-color:#F2555A; }

  .toc { columns:2; gap:24px; margin:20px 0 0; padding:0; list-style:none; }
  .toc a { color:var(--mute); text-decoration:none; font-size:14px; line-height:2; }
  .toc a:hover { color:var(--ink); }

  @media (max-width:640px) { body { padding:24px 14px 80px; } .toc { columns:1; } }
</style>
</head>
<body>
<div class="page">

<header>
  <h1>${esc(data.channel)} — scripts</h1>
  <p class="lede">${esc(data.premise)}</p>
  <p class="stats">
    <b>${data.reels.length}</b> reels in publish order ·
    <b>${totalWords}</b> words total ·
    <b>~${Math.round((totalWords / AIM_WPM) * 60)}s</b> of narration at ${AIM_WPM} wpm
  </p>
  ${stale ? `<p class="banner">
    <b>Not built yet.</b> ${stale} of ${data.reels.length} reels have a script that differs from the
    audio on disk, so <code>out/reels/*.mp4</code> still shows the previous words. Nothing has been
    synthesized or rendered — approve the copy first.
  </p>` : ''}
  <ol class="toc">
    ${data.reels.map((r, i) => `<li><a href="#${esc(r.id)}">${i + 1}. ${esc(r.publishTitle ?? r.id)}</a></li>`).join('\n    ')}
  </ol>
</header>

${data.reels.map(card).join('\n')}

</div>
</body>
</html>
`;

fs.mkdirSync(OUT, { recursive: true });
const dest = path.join(OUT, 'scripts.html');
fs.writeFileSync(dest, html);

console.log(`✓ script review → ${dest}`);
console.log(`  ${data.reels.length} reels, ${totalWords} words, ~${Math.round((totalWords / AIM_WPM) * 60)}s of narration`);

if (process.argv.includes('--open')) {
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', dest]]
    : process.platform === 'darwin' ? ['open', [dest]]
    : ['xdg-open', [dest]];
  run(...opener).catch(() => {});
}
