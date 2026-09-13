# RunPod — connecting, and what it cost us to learn

Originally written 2026-08-23, carried over from an earlier project that burned
**five pods in one day** on SSH alone. Revised the same day after Shortsmith actually
provisioned and measured a render pipeline on it. Every rule below is either a pod that
died or a number that was measured.

**Current state:** one network volume, `xapxpxkv3r` / `shortsmith-render`, 50 GB, in
**EUR-IS-1**. No pods. Standing cost $0.005/hr (~$3.65/month). Pods are created per
render and destroyed after — see §4.

---

## 0. What shape of machine this actually needs

**Measured, not assumed.** Same reel (`Tokens`, 590 frames), same concurrency:

| machine | rate | one 20s reel |
|---|---|---|
| Local Ryzen 9 5950X, c=4, quiet | — | **76s** |
| RunPod CPU pod, 8 vCPU (`cpu5g-8-32`) | $0.368/hr | **91s** |
| RunPod GPU pod, 16 vCPU + RTX 4090 | $0.74/hr | 114s |
| …same pod, `chrome-for-testing --gl=angle-egl` | $0.74/hr | 152s |
| …same pod, `chrome-for-testing`, no GL flag | $0.74/hr | 156s |

**Buy a CPU pod. The GPU is not merely useless here — it is a net loss.**

Remotion documents `blur()`, `drop-shadow()`, gradients and `transform` as
GPU-accelerated, and Shortsmith uses all of them, so a GPU *looks* justified on paper.
It isn't. Reaching the GPU requires `--chrome-mode=chrome-for-testing`, and Remotion's
own docs say headless-shell is the faster flavor for CPU-bound rendering. These
compositions are CPU-bound, so the swap costs more than the GPU returns. Note the third
and fourth rows are within 3% of each other: the slowdown is chrome-for-testing itself,
not the GL backend.

The local concurrency curve says the same thing from the other side:

| concurrency | 2 | 4 | 8 | 16 | 24 |
|---|---|---|---|---|---|
| time | 140s | 103s | **93s** | 87s | 85s |
| speedup | 1.00× | 1.36× | 1.51× | 1.61× | 1.65× |

It plateaus at 8 and never exceeds 1.65×, which means ~40% of a render is serial work
no core count can touch — the H.264 encode at CRF 18. **8 vCPU is the buy.** 16 costs
double and returns 6%.

**A pod is slower than the desktop.** 91s vs 76s. Offloading buys back the local
machine; it does not buy speed. That is the correct trade only if the machine is worth
more than the wall-clock.

---

## 1. Credentials and the two APIs

`RUNPOD_API_KEY` lives in `.env` (gitignored; documented in `.env.example`). RunPod has
**two** APIs and both are current — you need both, and which one owns what is not
documented in any single place:

| task | API |
|---|---|
| list pods, volumes, spend | GraphQL — `https://api.runpod.io/graphql?api_key=KEY` |
| **read a pod's SSH host + port** | **GraphQL only** — see below |
| create a **CPU** pod | GraphQL — `deployCpuPod` |
| create a **GPU** pod | REST — `POST https://rest.runpod.io/v1/pods` |
| terminate a pod | REST — `DELETE /v1/pods/{id}` |
| create/delete a network volume | REST — `/v1/networkvolumes` |

All of this is wrapped in [`scripts/runpod.mjs`](../scripts/runpod.mjs). Use that rather
than rediscovering it.

**`GET /v1/pods/{id}` never returns a `runtime` block.** Poll it for an SSH port and you
will wait forever on a pod that booted in twenty seconds — indistinguishable from a pod
that will never boot. Read ports from GraphQL:

```graphql
query { pod(input:{podId:"..."}) { runtime { uptimeInSeconds ports { ip privatePort publicPort } } } }
```

**The REST pod-create endpoint silently ignores fields it does not recognise.** Passing
`cpuFlavorIds` to `POST /v1/pods` does not error — it returns a **GPU pod at GPU
prices**. Four were created and destroyed this way in ninety seconds. If you want a CPU
pod, use the GraphQL `deployCpuPod` mutation, which validates properly.

List everything you own (the first thing to run, always):

```powershell
$body = @{ query = 'query { myself { currentSpendPerHr pods { id name desiredStatus costPerHr } networkVolumes { id name size dataCenterId } } }' } | ConvertTo-Json
Invoke-RestMethod -Uri "https://api.runpod.io/graphql?api_key=$KEY" -Method Post -ContentType "application/json" -Body $body
```

---

## 2. The rule that cost five pods

**A `dockerStartCmd` REPLACES the image entrypoint.** On `runpod/base` and
`runpod/pytorch` images that entrypoint is the thing that installs your `PUBLIC_KEY`
into `authorized_keys` and starts `sshd`. Override it and **SSH silently ceases to
exist** — the pod looks healthy, the web terminal works, and nothing you do to your SSH
config will ever help.

If you set a custom start command it must do the entrypoint's whole job itself. Four
parts, each of which killed a pod:

| requirement | what happens without it |
|---|---|
| `PUBLIC_KEY` passed in `env` | sshd runs and rejects every key |
| `ssh-keygen -A` | **sshd exits instantly and silently** — the image ships no host keys |
| `22/tcp` listed in `ports` | daemon runs, nothing can reach it |
| the command ends in `sleep infinity` | the command returns, container exits, pod terminates |

The host-key one is the killer. The first pod's log, once it was finally readable:
`ssh-keygen: generating new host keys: RSA DSA ECDSA ED25519` — they had never existed,
so every prior `sshd` died before printing anything at all.

**The simplest fix is to not set `dockerStartCmd`.** Use the image's own entrypoint, let
it start sshd, and do your setup over SSH afterwards. That is what Shortsmith does, and
SSH comes up in **8–25 seconds**.

---

## 3. Make a failed boot readable BEFORE it can fail

A dead boot and a slow boot are *indistinguishable* from outside — both present as
connection refused on every port.

Make the very first action of any boot script a log server:

```bash
python3 -m http.server 8189 --directory /workspace &
echo "stage: booted" >> /workspace/boot-stage.log
```

Then append a stage marker before each step that can fail. Read it with no shell at all:

```
https://<POD_ID>-8189.proxy.runpod.net/boot-stage.log
```

**Proxy status codes tell you which failure you have:**

- `502` — nothing is listening on that port yet. Still booting, or dead.
- `404` — the HTTP server is up but the path doesn't exist. **The container is alive.**

`scripts/pod-provision.sh` does this as its first action.

---

## 4. Lifecycle — create and terminate, never stop and start

**Never *stop* a pod.** Stopping releases the GPU/CPU back to the pool. On restart the
host may have none free, `POST /pods/{id}/start` returns *"There are not enough free GPUs
on the host machine"*, and the pod becomes permanently unstartable.

The earlier version of this doc concluded "so leave it running." **That was wrong for
this workload** — it is a $120–270/year answer to a 15-hour/month problem. The right
move is the third option:

> **Create a fresh pod per run and terminate it after.** A `create` draws from the whole
> pool rather than needing one specific host to have held capacity, so the dead-pod
> failure mode simply never arises.

This is only viable because the expensive state lives on the network volume. Cold start
to render-ready is **~35 seconds** (8–25s to SSH, ~13s to reinstall container-disk libs).

**What survives termination:** everything on the network volume (`/workspace`) — Node,
`node_modules`, the Chromium download, assets.
**What does not:** anything installed to container disk (`apt-get install`) and every
running process. `pod-provision.sh` is idempotent and re-run every boot for exactly this
reason.

**A network volume bills even with no pod attached** — $0.07/GB/month, so 50 GB is
~$3.65/month. If you tear down the pipeline, decide about the volume in the same breath.

**`df` lies about the volume.** It reports the backing MooseFS cluster (1.8 P), not your
quota. Use `du -sh /workspace`.

**RunPod reassigns the forwarded SSH port on every create.** Re-read both host and port
from the API each time. A saved connection string breaks silently and looks like a
network problem.

---

## 5. Gotchas found while building this

- **MooseFS rejects `chown`.** Any `tar -x` onto `/workspace` needs `--no-same-owner`.
  Without it tar unpacks correctly but still **exits non-zero**, and under `set -e` that
  kills the script on what was actually a successful extract. This bit both the Node
  install and the repo sync.
- **A GPU pod's container reports the *host's* CPU count.** `nproc` returned 64 on a pod
  allocated 21 vCPU. Remotion's auto-concurrency reads that and oversubscribes badly.
  **Always pass `--concurrency` explicitly.** CPU pods report correctly.
- **Oversubscribing concurrency does not degrade, it fails.** `--concurrency=16` on an
  8-vCPU pod died outright rather than running slowly.
- **`NVIDIA_DRIVER_CAPABILITIES` must be set at pod-create time**, not over SSH. The
  default (`compute,utility`) omits `graphics`, so `/usr/share/vulkan/icd.d/` has no
  `nvidia_icd.json`, ANGLE silently falls back to llvmpipe, and your "GPU" render is
  software rasterisation. Setting it in the shell afterwards does nothing — the NVIDIA
  container runtime reads it when it builds the container. (Moot now that we use CPU
  pods, but it is why the first GPU benchmark was meaningless.)
- **Even with `graphics` enabled there is still no Vulkan ICD** — only the EGL vendor
  (`10_nvidia.json`). So `--gl=vulkan` cannot work on RunPod; `--gl=angle-egl` is the
  only GPU path, and it is slower than not using the GPU. See §0.
- **Community cloud had zero stock** in every datacenter, storage-capable or not, when
  swept on 2026-08-23. The advertised community prices (RTX A5000 at $0.16/hr) were for
  capacity that did not exist. Everything real was secure cloud. **Do not plan a budget
  off the published community rates without checking `lowestPrice` per datacenter first.**
- **No RTX A5000 anywhere** with network-volume support, despite it being the obvious
  price/VRAM pick on the pricing page.
- **`currentSpendPerHr` lags about a minute behind reality.** Straight after a
  terminate it still reports the dead pod's rate. **Trust the `pods` array, not the
  spend figure** — checking the wrong one will have you hunting a pod that no longer
  exists.
- **On Windows an external `kill` cannot be caught.** Git Bash's `kill` (and anything
  else going through `TerminateProcess`) delivers no signal Node can handle, so
  in-process teardown never runs and the pod survives. A real Ctrl-C in the console
  *is* catchable, but crashes, hard kills and power cuts are not. This is why
  `render-remote.mjs` reaps orphaned `shortsmith-*` pods at startup instead of relying
  on its own exit handlers. Run `node scripts/render-remote.mjs --reap` to sweep
  manually.
- **The `runpod/base` image ships no `bc`.** Do shell arithmetic with `awk`.
- **Node ≥20 on Windows cannot spawn a `.cmd` shim without `shell: true`** — it throws
  `spawn EINVAL`. Spawn `ssh`/`scp`/`tar` (real .exe) directly; that is why
  `render-reels.mjs` also points at `@remotion/cli/remotion-cli.js` rather than `npx`.

---

## 6. CPU pod reference

`deployCpuPod` takes an `instanceId` of the form `<flavor>-<vCPU>-<RAM>`; anything else
is rejected with a message naming the format. Flavor is generation (`cpu3`/`cpu5`) plus
RAM multiplier (`c`=2, `g`=4, `m`=8 GB per vCPU).

Measured 2026-08-23 by deploying and immediately terminating each:

| instanceId | $/hr | vCPU | RAM | placed in |
|---|---|---|---|---|
| `cpu3c-8-16` | 0.240 | 8 | 16 | US |
| `cpu5c-8-16` | 0.280 | 8 | 16 | RO |
| **`cpu5g-8-32`** | **0.368** | **8** | **32** | **IS** |
| `cpu3c-16-32` | 0.480 | 16 | 32 | US |
| `cpu5c-16-32` | 0.560 | 16 | 32 | IS |
| `cpu5g-16-64` | 0.736 | 16 | 64 | IS |

`cpu5g-8-32` is what Shortsmith uses: the cheapest 8-vCPU flavor that actually *places*
in EUR-IS-1, where the volume is locked. The cheaper `cpu3c-8-16` lands in the US and
therefore cannot mount an Iceland volume — **a volume's region silently constrains which
CPU flavors you can ever buy.** Pick the region and the flavor together, once.

---

## 7. Provisioning checklist

1. `myself` query first — know what exists before creating anything.
2. Pick the datacenter **from where the volume already is**. It is region-locked and a
   pod can only mount one in its own region.
3. **CPU, not GPU** (§0). 8 vCPU. Use `deployCpuPod`, not REST.
4. Leave `dockerStartCmd` unset unless you have read §2 and accepted all four items.
5. Expose 22 and 8189.
6. Boot script: log server first, stage markers throughout, idempotent everywhere.
7. Verify over the 8189 log server before trying SSH. It tells you *which* problem you
   have.
8. Put anything you'd hate to re-download on the network volume.
9. **Terminate on every exit path**, including Ctrl-C and unhandled rejections.
   `render-remote.mjs` routes all of them through one teardown, and prints the account's
   pod count afterwards so a leak is visible immediately.

---

## 8. The meta-lesson

**Read the vendor's docs before rebuilding against a guess.** Five pods were destroyed
guessing at why SSH would not connect. One search against RunPod's own
[SSH documentation](https://docs.runpod.io/pods/configuration/use-ssh) contained the
entire answer.

**And measure before you buy.** The GPU recommendation in the first draft of this
document was argued from Remotion's feature list and was wrong in the direction that
costs money. Two benchmarks — twenty minutes and about forty cents — reversed it. Docs
tell you what is possible; only a measurement tells you what is true of *your* workload.
