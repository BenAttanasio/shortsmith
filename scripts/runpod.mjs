#!/usr/bin/env node
/**
 * RunPod API helpers.
 *
 * RunPod has two APIs and you need both — GraphQL for reads and CPU-pod creation,
 * REST for deletion and network volumes. Which one owns what is not obvious and is
 * not documented in one place, so it is encoded here rather than rediscovered:
 *
 *   | task                          | API     |
 *   |-------------------------------|---------|
 *   | list pods / volumes / spend   | GraphQL |
 *   | read a pod's SSH host+port    | GraphQL — REST omits `runtime` entirely |
 *   | create a CPU pod              | GraphQL — `deployCpuPod` |
 *   | create a GPU pod              | REST    — POST /v1/pods |
 *   | terminate a pod               | REST    — DELETE /v1/pods/{id} |
 *   | create / delete a volume      | REST    — /v1/networkvolumes |
 *
 * The REST pod-create endpoint **silently ignores fields it does not recognise**.
 * Passing `cpuFlavorIds` to it does not error — it returns a GPU pod at GPU prices.
 * That is why CPU pods go through GraphQL here and not REST.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const readKey = () => {
  const env = process.env.RUNPOD_API_KEY;
  if (env) return env.trim();
  const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^RUNPOD_API_KEY=(.*)$/m);
  if (!m) throw new Error('RUNPOD_API_KEY not found in environment or .env');
  return m[1].trim().replace(/^["']|["']$/g, '');
};

export const KEY = readKey();

export const gql = async (query) => {
  const res = await fetch(`https://api.runpod.io/graphql?api_key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors).slice(0, 400)}`);
  return json.data;
};

export const rest = async (method, pathname, body) => {
  const res = await fetch(`https://rest.runpod.io/v1${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`REST ${method} ${pathname}: ${text.slice(0, 300)}`); }
  if (!res.ok) throw new Error(`REST ${method} ${pathname} → ${res.status}: ${text.slice(0, 300)}`);
  return json;
};

/** Everything we own. The first thing to run, always. */
export const inventory = () =>
  gql(`query { myself { currentSpendPerHr
    pods { id name desiredStatus costPerHr }
    networkVolumes { id name size dataCenterId } } }`).then((d) => d.myself);

export const publicKey = () =>
  fs.readFileSync(path.join(os.homedir(), '.ssh', 'id_ed25519.pub'), 'utf8').trim();

/**
 * Deploy a CPU pod.
 *
 * `instanceId` is `<flavor>-<vCPU>-<RAM>`; the API rejects anything else with a message
 * naming the format. Flavors: cpu3 or cpu5 (generation) then c/g/m (RAM multiplier
 * 2, 4 or 8 GB per vCPU).
 * Measured 2026-08-23, EUR-IS-1: cpu5g-8-32 is $0.368/hr and the cheapest 8-vCPU
 * flavor that actually *places* in Iceland — cpu5c-8-16 is cheaper but landed in
 * Romania, which cannot reach an Iceland-locked volume.
 */
export const deployCpuPod = async ({ instanceId, name, dataCenterId, networkVolumeId, containerDiskInGb = 30 }) => {
  const d = await gql(`mutation { deployCpuPod(input:{
    instanceId:${JSON.stringify(instanceId)},
    name:${JSON.stringify(name)},
    imageName:"runpod/base:1.1.0-ubuntu2204",
    cloudType: SECURE,
    dataCenterId:${JSON.stringify(dataCenterId)},
    networkVolumeId:${JSON.stringify(networkVolumeId)},
    volumeMountPath:"/workspace",
    containerDiskInGb: ${containerDiskInGb},
    ports:"22/tcp,8189/http",
    env:[{key:"PUBLIC_KEY", value:${JSON.stringify(publicKey())}}]
  }) { id costPerHr vcpuCount memoryInGb machine { location } } }`);
  return d.deployCpuPod;
};

export const terminate = (id) => rest('DELETE', `/pods/${id}`);

/**
 * Poll until the pod publishes an SSH endpoint.
 *
 * Read this from GraphQL, not REST — `GET /v1/pods/{id}` never returns a `runtime`
 * block, so polling it looks exactly like a pod that will not boot. And re-read host
 * *and* port after every create: RunPod reassigns the forwarded port each time, so a
 * cached connection string breaks silently and presents as a network fault.
 */
export const waitForSsh = async (podId, { timeoutMs = 300_000, intervalMs = 5_000, onTick } = {}) => {
  const deadline = Date.now() + timeoutMs;
  let tick = 0;
  while (Date.now() < deadline) {
    const d = await gql(`query { pod(input:{podId:${JSON.stringify(podId)}}) {
      desiredStatus runtime { uptimeInSeconds ports { ip privatePort publicPort } } } }`);
    const port = d.pod?.runtime?.ports?.find((p) => p.privatePort === 22);
    if (port?.ip && port?.publicPort) return { host: port.ip, port: port.publicPort };
    onTick?.(++tick, d.pod?.desiredStatus);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`pod ${podId} never published an SSH port within ${timeoutMs / 1000}s`);
};
