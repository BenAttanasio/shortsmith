#!/usr/bin/env node
/**
 * Build-beat vs narration alignment.
 *
 * STYLE-GUIDE §6.1: "Elements enter on the narrated word, not on a fixed beat." In
 * practice every archetype does the opposite — it spreads its elements evenly from
 * `buildFrom` to `buildTo` and hopes the script keeps up. Usually it roughly does, because
 * scripts are written to walk the diagram in order. When it doesn't, the result is an
 * element sitting on screen for ten seconds before the voice explains it, which is what
 * `WhenToUse` was doing with "draft, then check".
 *
 * This finds those cases by comparing, for each element:
 *
 *   - **when it appears**, from the archetype's beat spec, as a fraction of narration
 *   - **when it is named**, the first mention of its label in the narration, as a fraction
 *
 * A positive lead means the element is on screen before the voice gets to it. Small leads
 * are correct and deliberate: the diagram should be slightly ahead so the eye arrives
 * before the word does. Large ones mean the script and the build disagree about order.
 *
 * This is a *reporting* tool, not a pass/fail gate. Some elements have labels that never
 * appear verbatim in the narration, and that is fine. Read the output, fix the outliers.
 *
 * Usage:
 *   node scripts/check-beats.mjs
 *   node scripts/check-beats.mjs WhenToUse
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const { reels } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/reels.json'), 'utf8'));

/**
 * Beat windows per archetype, mirroring the `makeBeats` call in each scene file.
 * Duplicated here rather than imported because the scenes are TSX and this needs to run
 * in plain node. If a scene's window changes, change it here too.
 */
const WINDOWS = {
  contrast: { from: 0.22, to: 0.62, key: ['left.label', 'right.label'] },
  chain: { from: 0.24, to: 0.70, key: 'steps' },
  fill: { from: 0.26, to: 0.72, key: 'items' },
  fanout: { from: 0.26, to: 0.68, key: 'workers[].label' },
  layers: { from: 0.24, to: 0.70, key: 'layers[].label' },
  loop: { from: 0.26, to: 0.68, key: 'nodes[].label' },
  code: { from: 0.24, to: 0.70, key: 'code' },
  nest: { from: 0.26, to: 0.70, key: 'rings[].label' },
  matrix: { from: 0.26, to: 0.68, key: 'cells' },
  gather: { from: 0.26, to: 0.68, key: 'sources[].label' },
};

/** Pull the ordered element labels a scene builds. */
const elementsOf = (r) => {
  const spec = WINDOWS[r.scene];
  if (!spec) return [];
  const k = spec.key;
  if (Array.isArray(k)) {
    return k.map((dotted) => dotted.split('.').reduce((o, p) => o?.[p], r)).filter(Boolean);
  }
  if (k.includes('[]')) {
    const [base, field] = k.split('[].');
    return (r[base] ?? []).map((e) => e?.[field]).filter(Boolean);
  }
  return (r[k] ?? []).filter((s) => typeof s === 'string');
};

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['your', 'that', 'this', 'with', 'from', 'into', 'then', 'they', 'them', 'what', 'when']);

/**
 * Every point at which a label is spoken, as fractions of the narration.
 *
 * All of them, not just the first. Taking the first was wrong in a way that produced
 * mostly noise: `AgentVsChatbot` says "agent" in its opening sentence while setting up the
 * question, so the Agent container measured as 53% late when it is in fact placed
 * correctly against the sentence that actually describes it. What matters is whether the
 * voice is talking about the element *somewhere near* when it appears.
 */
const mentionFractions = (narration, label) => {
  const total = narration.split(/\s+/).length;
  const hay = norm(narration);
  const needle = norm(label);
  if (!needle) return [];

  // The full label, else its most distinctive content word. "draft, then check" rarely
  // appears verbatim; "draft" does.
  const candidates = [needle, ...needle.split(' ')
    .filter((w) => w.length > 3 && !STOP.has(w))
    .sort((a, b) => b.length - a.length)];

  for (const c of candidates) {
    const hits = [];
    let at = hay.indexOf(c);
    while (at !== -1) {
      hits.push(hay.slice(0, at).split(' ').filter(Boolean).length / total);
      at = hay.indexOf(c, at + 1);
    }
    if (hits.length) return hits;
  }
  return [];
};

/** Signed distance from `appears` to the nearest mention, or null if never spoken. */
const nearestLead = (narration, label, appears) => {
  const hits = mentionFractions(narration, label);
  if (!hits.length) return { lead: null, spoken: null };
  let best = hits[0];
  for (const h of hits) if (Math.abs(appears - h) < Math.abs(appears - best)) best = h;
  return { lead: best - appears, spoken: best };
};

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const targets = only.length ? reels.filter((r) => only.includes(r.id)) : reels;

/** Leads beyond this many percent of the narration are worth looking at. */
const LEAD_WARN = 0.18;

let flagged = 0;
console.log('\n  lead = (spoken - appears), as a fraction of the narration.');
console.log('  positive = element sits on screen before the voice names it.');
console.log('  negative = the voice names it before it appears.');
console.log('  a small positive lead is correct: the eye should arrive before the word.\n');

for (const r of targets) {
  const spec = WINDOWS[r.scene];
  if (!spec) continue;
  const els = elementsOf(r);
  if (els.length < 2) continue;

  const order = r.revealOrder ?? els.map((_, i) => i);
  const rows = [];
  els.forEach((label, i) => {
    const slot = Math.max(0, order.indexOf(i));
    const appears = spec.from + ((spec.to - spec.from) * slot) / Math.max(1, els.length - 1);
    const { lead, spoken } = nearestLead(r.narration, label, appears);
    rows.push({ label, appears, spoken, lead });
  });

  const bad = rows.filter((x) => x.lead !== null && Math.abs(x.lead) > LEAD_WARN);
  if (!bad.length) continue;
  flagged++;
  console.log(`  ${r.id}  (${r.scene})`);
  for (const x of rows) {
    const mark = x.lead !== null && Math.abs(x.lead) > LEAD_WARN ? (x.lead > 0 ? '  <== on screen early' : '  <== appears late') : '';
    const lead = x.lead === null ? '  n/a' : `${x.lead >= 0 ? '+' : ''}${(x.lead * 100).toFixed(0)}%`;
    console.log(
      `     ${String(x.label).slice(0, 28).padEnd(30)} appears ${(x.appears * 100).toFixed(0)}%` +
      `   spoken ${x.spoken === null ? ' -- ' : `${(x.spoken * 100).toFixed(0)}%`}` +
      `   lead ${lead.padStart(5)}${mark}`,
    );
  }
  console.log('');
}

console.log(flagged ? `${flagged} reel(s) with an element whose build order disagrees with the script.`
  : 'No element leads its narration by more than 18%.');
