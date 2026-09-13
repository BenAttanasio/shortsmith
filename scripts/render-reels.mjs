#!/usr/bin/env node
/**
 * Render every reel in content/reels.json, then pull verification frames.
 *
 * Renders run sequentially: Remotion already parallelizes across cores inside a single
 * render, so running compositions concurrently just thrashes the CPU and makes each one
 * slower.
 *
 * After each render it extracts three frames — early, middle, late — because a clip that
 * encodes without error can still be visually wrong (an element off-zone, a beat landing
 * before its narrated word). Per CLAUDE.md, nothing counts as done until the frames have
 * actually been looked at.
 *
 * Usage:
 *   node scripts/render-reels.mjs            # all reels
 *   node scripts/render-reels.mjs Tokens     # just one
 *   node scripts/render-reels.mjs --dry      # exercise the whole path, render nothing
 *   node scripts/render-reels.mjs --no-lint  # skip the pre-flight content check
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lintFromDisk } from './lint-reels.mjs';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out/reels');
const CHECK = path.join(ROOT, 'out/check');

/**
 * Spawn the Remotion CLI's JS entry with this Node binary rather than going through
 * `npx`. Since Node 20.12 / 24, spawning a `.cmd` shim on Windows without `shell: true`
 * fails outright with EINVAL, and turning the shell on would drag command-line quoting
 * into the picture. Pointing at the .js directly sidesteps both.
 */
const REMOTION_CLI = path.join(ROOT, 'node_modules/@remotion/cli/remotion-cli.js');

const { reels } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/reels.json'), 'utf8'));
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const only = args.filter((a) => !a.startsWith('-'));
const targets = only.length ? reels.filter((r) => only.includes(r.id)) : reels;

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CHECK, { recursive: true });

/** Local time — the scheduled task's own log lines are local, so match them. */
const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
// Catch layout overflows before spending minutes encoding them. A clip that encodes
// cleanly can still put its verdict on top of the captions.
if (!args.includes('--no-lint')) {
  const { findings, errors } = await lintFromDisk();
  for (const f of findings) {
    console[f.level === 'error' ? 'error' : 'warn'](
      `[${stamp()}] ${f.level === 'error' ? 'ERROR' : 'warn '} ${f.code.padEnd(20)} ${String(f.id).padEnd(20)} ${f.msg}`,
    );
  }
  if (errors) {
    console.error(`[${stamp()}] lint-reels found ${errors} error(s). Nothing rendered. (--no-lint overrides.)`);
    process.exit(1);
  }
}

console.log(`[${stamp()}] rendering ${targets.length} reel(s)`);

const results = [];
for (const reel of targets) {
  const mp4 = path.join(OUT, `${reel.id}.mp4`);
  const t0 = Date.now();
  try {
    if (dry) {
      // Prove the CLI is reachable and the composition id resolves, without encoding.
      await run(process.execPath, [REMOTION_CLI, 'compositions', 'src/index.ts', '--log=error'], {
        cwd: ROOT,
        maxBuffer: 1 << 26,
      });
      console.log(`[${stamp()}] dry  ${reel.id.padEnd(20)} would render → ${path.relative(ROOT, mp4)}`);
      results.push({ id: reel.id, ok: true, dry: true });
      continue;
    }

    await run(
      process.execPath,
      [REMOTION_CLI, 'render', 'src/index.ts', reel.id, mp4, '--log=error'],
      { cwd: ROOT, maxBuffer: 1 << 26 },
    );

    // Frames at 15%, 50% and 85% of the clip — after the hook lands, mid-build, and
    // once the verdict line is up.
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries',
      'format=duration', '-of', 'csv=p=0', mp4]);
    const dur = Number(stdout.trim());
    for (const [tag, frac] of [['a', 0.15], ['b', 0.5], ['c', 0.85]]) {
      await run('ffmpeg', ['-y', '-v', 'error', '-ss', (dur * frac).toFixed(2), '-i', mp4,
        '-frames:v', '1', '-vf', 'scale=540:-1', path.join(CHECK, `${reel.id}_${tag}.jpg`)]);
    }

    const mb = fs.statSync(mp4).size / 1024 / 1024;
    const secs = (Date.now() - t0) / 1000;
    results.push({ id: reel.id, ok: true, dur, mb });
    console.log(`[${stamp()}] ok   ${reel.id.padEnd(20)} ${dur.toFixed(1)}s  ${mb.toFixed(1)}MB  (${secs.toFixed(0)}s)`);
  } catch (err) {
    results.push({ id: reel.id, ok: false, error: String(err.stderr || err.message).slice(0, 400) });
    console.error(`[${stamp()}] FAIL ${reel.id}: ${String(err.stderr || err.message).slice(0, 400)}`);
  }
}

const ok = results.filter((r) => r.ok).length;
console.log(`\n[${stamp()}] ${ok}/${results.length} rendered → out/reels/, frames → out/check/`);
if (ok < results.length) process.exitCode = 1;
