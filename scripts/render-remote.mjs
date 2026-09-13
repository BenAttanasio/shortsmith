#!/usr/bin/env node
/**
 * Render every reel on a throwaway RunPod CPU pod, pull the results back, and
 * destroy the pod.
 *
 * Same interface as `render-reels.mjs` on purpose — `--dry`, single-reel targeting
 * and the verification-frame pull all behave identically, so the only thing that
 * changes is which machine does the work.
 *
 *   node scripts/render-remote.mjs            # all reels
 *   node scripts/render-remote.mjs Tokens     # just one
 *   node scripts/render-remote.mjs --dry      # create, provision, sync, terminate — no encode
 *   node scripts/render-remote.mjs --keep     # leave the pod up (debugging only)
 *   node scripts/render-remote.mjs --no-lint  # skip the pre-flight content check
 *   node scripts/render-remote.mjs --reap     # kill orphaned pods and exit
 *
 * ---------------------------------------------------------------------------
 * Why CPU and not GPU
 * ---------------------------------------------------------------------------
 * Measured 2026-08-23 on this repo, same reel, same concurrency:
 *
 *   CPU pod, 8 vCPU, cpu5g-8-32, $0.368/hr ............  91s
 *   GPU pod, 16 vCPU + RTX 4090, $0.74/hr ............. 114s
 *   GPU pod, chrome-for-testing + --gl=angle-egl ...... 152s
 *
 * The GPU is not merely unhelpful here, it is a net loss: the flags that let Chromium
 * reach it force chrome-for-testing, which Remotion documents as the slower flavor
 * for CPU-bound work. These compositions are CPU-bound. Local benchmarking said the
 * same thing from the other direction — concurrency stops paying at 8 and tops out at
 * 1.65x, which is the signature of a serial bottleneck (the H.264 encode), not of a
 * rasterisation one.
 *
 * ---------------------------------------------------------------------------
 * The one thing this script must never do
 * ---------------------------------------------------------------------------
 * Leave a pod running. Every exit path — success, render failure, SSH timeout,
 * Ctrl-C, unhandled rejection — routes through the same terminate. A forgotten pod
 * is the only unrecoverable mistake available here: $0.368/hr is $268/year.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { lintFromDisk } from './lint-reels.mjs';
import { deployCpuPod, waitForSsh, terminate, inventory } from './runpod.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out/reels');
const CHECK = path.join(ROOT, 'out/check');

/** Where the volume lives. Region-locked: a pod can only mount one in its own region. */
const DATACENTER = 'EUR-IS-1';
const VOLUME_ID = 'xapxpxkv3r';
/** 8 vCPU is the measured knee; 16 bought 6% locally and is not worth 2x the rate. */
const INSTANCE = 'cpu5g-8-32';
/**
 * Pin concurrency to the pod's real vCPU count. Never let Remotion auto-detect: on a
 * GPU pod the container reports the *host's* 64 cores and oversubscribes wildly, and
 * on this 8-vCPU pod a render at --concurrency=16 does not merely slow down, it dies.
 */
const CONCURRENCY = 8;
/** Hard ceiling on the whole run. Trips the same teardown as any other failure. */
const MAX_RUN_MS = 90 * 60 * 1000;

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const keep = args.includes('--keep');
const reapOnly = args.includes('--reap');
const only = args.filter((a) => !a.startsWith('-'));

const { reels } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/reels.json'), 'utf8'));
const targets = only.length ? reels.filter((r) => only.includes(r.id)) : reels;

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const log = (msg) => console.log(`[${stamp()}] ${msg}`);

/**
 * Run a local binary and resolve with its stdout as a Buffer.
 *
 * Buffer, not string: the repo is shipped by piping `tar czf -` straight into a
 * remote `tar xzf -`, and concatenating that onto a JS string mangles it into
 * invalid UTF-8. Callers that want text call `.toString()`.
 */
const sh = (cmd, argv, opts = {}) =>
  new Promise((resolve, reject) => {
    const { stdin, ...spawnOpts } = opts;
    const child = spawn(cmd, argv, { cwd: ROOT, ...spawnOpts });
    const out = [];
    const err = [];
    child.stdout?.on('data', (d) => out.push(d));
    child.stderr?.on('data', (d) => err.push(d));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(new Error(`${cmd} exited ${code}: ${Buffer.concat(err.length ? err : out).toString().slice(0, 500)}`)),
    );
    if (stdin) child.stdin.end(stdin);
  });

const SSH_OPTS = ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=30', '-o', 'ServerAliveInterval=30'];
const ssh = (conn, command) => sh('ssh', [...SSH_OPTS, '-p', String(conn.port), `root@${conn.host}`, command]);

// ---------------------------------------------------------------------------

// Lint before spending anything. A layout overflow costs nothing to catch here and
// a full pod lifecycle to catch on the other side.
if (!args.includes('--no-lint')) {
  const { findings, errors } = await lintFromDisk();
  for (const f of findings) {
    console[f.level === 'error' ? 'error' : 'warn'](
      `[${stamp()}] ${f.level === 'error' ? 'ERROR' : 'warn '} ${f.code.padEnd(20)} ${String(f.id).padEnd(20)} ${f.msg}`,
    );
  }
  if (errors) {
    console.error(`[${stamp()}] lint-reels found ${errors} error(s). No pod created. (--no-lint overrides.)`);
    process.exit(1);
  }
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(CHECK, { recursive: true });

let podId = null;
let teardownPromise = null;

/**
 * Idempotent teardown. Registered against every exit path there is, because the
 * failure that matters is not a failed render — it is a pod that outlives the script.
 *
 * Memoises the in-flight *promise*, not a "done" boolean. An earlier version set a
 * flag before awaiting the API call, which meant a signal handler and the finally
 * block raced: whichever arrived first flipped the flag, and if its own request was
 * then cut short by process exit, the second caller returned immediately believing
 * the work was done. That leaked a live pod on Ctrl-C — caught only by testing the
 * kill path rather than trusting it. Now both callers await the same promise, and it
 * only settles once RunPod has actually accepted the delete.
 */
const teardown = (reason) => {
  if (!podId) return Promise.resolve();
  if (keep) {
    log(`--keep set; pod ${podId} LEFT RUNNING (${reason}). Terminate it yourself.`);
    return Promise.resolve();
  }
  if (teardownPromise) return teardownPromise;

  teardownPromise = (async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        await terminate(podId);
        log(`pod ${podId} terminated (${reason})`);
        return;
      } catch (err) {
        if (attempt === 4) {
          // Loud, because a leaked pod bills until someone notices.
          console.error(`[${stamp()}] !! FAILED TO TERMINATE POD ${podId} after 4 tries: ${err.message}`);
          console.error(`[${stamp()}] !! KILL IT MANUALLY: https://console.runpod.io/pods`);
          return;
        }
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  })();
  return teardownPromise;
};

// Signals must not call process.exit() until teardown has actually settled — exiting
// mid-request is what leaked the pod the first time.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, async () => {
    log(`${sig} received — tearing down before exit`);
    await teardown(sig);
    process.exit(130);
  });
}
process.on('unhandledRejection', async (err) => {
  console.error(`[${stamp()}] unhandled rejection: ${err}`);
  await teardown('unhandledRejection');
  process.exit(1);
});

const watchdog = setTimeout(async () => {
  console.error(`[${stamp()}] run exceeded ${MAX_RUN_MS / 60000} min — tearing down`);
  await teardown('timeout');
  process.exit(1);
}, MAX_RUN_MS);
watchdog.unref();

const results = [];
const t0 = Date.now();

try {
  // Reap anything a previous run left behind, before creating more.
  //
  // The in-process teardown below cannot be the only defence. On Windows an external
  // kill goes through TerminateProcess, which delivers no catchable signal — the
  // handlers never run and the pod survives the script. Same for a crash, a closed
  // laptop, or a power cut. So every run starts by killing orphans it recognises by
  // name, which bounds the damage of any leak to the gap between two runs rather
  // than to whenever someone next opens the console.
  const before = await inventory();
  const orphans = before.pods.filter((p) => /^shortsmith-\d+$/.test(p.name));
  for (const o of orphans) {
    log(`reaping orphaned pod ${o.id} (${o.name}, $${o.costPerHr}/hr)`);
    try { await terminate(o.id); } catch (err) { console.error(`[${stamp()}] could not reap ${o.id}: ${err.message}`); }
  }
  const foreign = before.pods.filter((p) => !orphans.includes(p));
  if (foreign.length) {
    log(`note: ${foreign.length} other pod(s) running and left alone: ${foreign.map((p) => p.name).join(', ')}`);
  }
  if (reapOnly) {
    log(`reaped ${orphans.length} pod(s); --reap only, nothing created`);
    process.exit(0);
  }

  log(`creating ${INSTANCE} in ${DATACENTER}`);
  const pod = await deployCpuPod({
    instanceId: INSTANCE,
    name: `shortsmith-${Date.now()}`,
    dataCenterId: DATACENTER,
    networkVolumeId: VOLUME_ID,
  });
  podId = pod.id;
  log(`pod ${podId} · ${pod.vcpuCount} vCPU · ${pod.memoryInGb} GB · $${pod.costPerHr}/hr`);

  const conn = await waitForSsh(podId, { onTick: (n) => n % 4 === 0 && log(`  waiting for ssh (${n * 5}s)`) });
  log(`ssh ready at ${conn.host}:${conn.port}`);

  // Ship the parts that change. node_modules and the browser are already on the
  // volume; sending them again would dominate the run.
  log('syncing sources');
  const tar = await sh('tar', ['czf', '-', '--exclude=node_modules', '--exclude=out', '--exclude=.git',
    '--exclude=public/audio/voice-lab', 'package.json', 'package-lock.json', 'tsconfig.json',
    'remotion.config.ts', 'src', 'content', 'public', 'scripts']);
  // --no-same-owner: the archive carries Windows uids the Linux side cannot apply,
  // and without it tar exits non-zero on an otherwise clean extract.
  await sh('ssh', [...SSH_OPTS, '-p', String(conn.port), `root@${conn.host}`,
    'mkdir -p /workspace/shortsmith && tar xzf - --no-same-owner -C /workspace/shortsmith'],
    { stdin: tar });

  log('provisioning');
  const provisionLog = await ssh(conn, 'bash /workspace/shortsmith/scripts/pod-provision.sh');
  for (const line of provisionLog.toString().trim().split('\n').filter(Boolean)) log(`  ${line}`);

  if (dry) {
    await ssh(conn, 'export PATH=/workspace/node/bin:$PATH; cd /workspace/shortsmith && npx remotion compositions src/index.ts --log=error >/dev/null');
    log(`dry  ${targets.length} reel(s) resolve; nothing encoded`);
  } else {
    for (const reel of targets) {
      const t = Date.now();
      try {
        await ssh(conn,
          `export PATH=/workspace/node/bin:$PATH; cd /workspace/shortsmith && ` +
          `mkdir -p out/reels out/check && ` +
          `npx remotion render src/index.ts ${reel.id} out/reels/${reel.id}.mp4 ` +
          `--concurrency=${CONCURRENCY} --log=error`);

        // Pull the render back BEFORE anything else can fail. The mp4 is the thing
        // that cost 90 seconds of pod time; verification frames are cheap to redo
        // locally and must never be able to strand it on a machine about to die.
        await sh('scp', [...SSH_OPTS, '-P', String(conn.port),
          `root@${conn.host}:/workspace/shortsmith/out/reels/${reel.id}.mp4`, OUT]);

        // Same three frames as the local path — after the hook lands, mid-build, and
        // once the verdict is up. awk does the arithmetic because the image ships no
        // `bc`, and a missing frame must not fail an otherwise good reel.
        try {
          await ssh(conn,
            `cd /workspace/shortsmith && D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 out/reels/${reel.id}.mp4) && ` +
            `for p in a:0.15 b:0.5 c:0.85; do T=\${p%%:*}; F=\${p##*:}; ` +
            `S=$(awk -v d="$D" -v f="$F" 'BEGIN{printf "%.2f", d*f}'); ` +
            `ffmpeg -y -v error -ss $S -i out/reels/${reel.id}.mp4 -frames:v 1 ` +
            `-vf scale=540:-1 out/check/${reel.id}_$T.jpg; done`);
          await sh('scp', [...SSH_OPTS, '-P', String(conn.port),
            `root@${conn.host}:/workspace/shortsmith/out/check/${reel.id}_*.jpg`, CHECK]);
        } catch (frameErr) {
          console.warn(`[${stamp()}] warn ${reel.id}: frames not pulled — ${String(frameErr.message).slice(0, 160)}`);
        }

        const mb = fs.statSync(path.join(OUT, `${reel.id}.mp4`)).size / 1024 / 1024;
        const secs = (Date.now() - t) / 1000;
        results.push({ id: reel.id, ok: true });
        log(`ok   ${reel.id.padEnd(20)} ${mb.toFixed(1)}MB  (${secs.toFixed(0)}s)`);
      } catch (err) {
        results.push({ id: reel.id, ok: false });
        console.error(`[${stamp()}] FAIL ${reel.id}: ${String(err.message).slice(0, 400)}`);
      }
    }
  }
} catch (err) {
  console.error(`[${stamp()}] run failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await teardown('done');
  clearTimeout(watchdog);
}

const ok = results.filter((r) => r.ok).length;
const mins = (Date.now() - t0) / 60000;
if (!dry) {
  // Rate is fixed at create time; wall-clock is the only variable, so this is exact
  // enough to notice a run that went wrong before the bill does.
  log(`${ok}/${results.length} rendered → out/reels/, frames → out/check/`);
  log(`pod alive ${mins.toFixed(1)} min ≈ $${(mins / 60 * 0.368).toFixed(2)}`);
}

const after = await inventory();
log(`account now: ${after.pods.length} pod(s), $${after.currentSpendPerHr}/hr`);
if (after.pods.length) console.error(`[${stamp()}] !! pods still running — check https://console.runpod.io/pods`);

if (!dry && ok < results.length) process.exitCode = 1;
