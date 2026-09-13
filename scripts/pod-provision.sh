#!/usr/bin/env bash
# Make a cold pod render-ready. Idempotent — runs on every boot, does nothing it
# has already done.
#
# The split that matters: anything under /workspace is the network volume and
# survives termination; anything apt-installed lands on container disk and is gone
# with the pod. So Node, node_modules and the Chromium download live on the volume
# (~2 min to build once, ~0s thereafter) while the shared libraries Chromium links
# against must be reinstalled on every single boot (~10s).
set -euo pipefail

WS=/workspace
NODE_VER=22.11.0
mkdir -p "$WS" "$WS/logs"

# The log server comes first, before anything that can fail. From outside, a dead
# boot and a slow boot are identical — both refuse every port — and this is the only
# thing that tells them apart. Read it at
#   https://<POD_ID>-8189.proxy.runpod.net/boot-stage.log
# where 502 means nothing is listening yet and 404 means the container is alive.
if ! pgrep -f "http.server 8189" >/dev/null 2>&1; then
  nohup python3 -m http.server 8189 --directory "$WS" >/dev/null 2>&1 &
  sleep 1
fi
: > "$WS/boot-stage.log"
stage() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$WS/boot-stage.log"; }
stage "stage: booted"

# ---------------------------------------------------------------- node
if [ ! -x "$WS/node/bin/node" ]; then
  stage "stage: installing node $NODE_VER"
  mkdir -p "$WS/node"
  # --no-same-owner is mandatory. /workspace is MooseFS and rejects chown outright;
  # without it tar unpacks correctly but still exits non-zero, and `set -e` then
  # kills the script on what is actually a successful extract.
  curl -fsSL "https://nodejs.org/dist/v$NODE_VER/node-v$NODE_VER-linux-x64.tar.xz" \
    | tar -xJ --no-same-owner -C "$WS/node" --strip-components=1
fi
export PATH="$WS/node/bin:$PATH"
stage "stage: node $(node -v)"

# ---------------------------------------------------------------- chromium libs
# Container disk, therefore gone on every new pod. Cheap enough to just redo.
export DEBIAN_FRONTEND=noninteractive
if ! dpkg -s libnss3 >/dev/null 2>&1; then
  stage "stage: installing chromium libs"
  apt-get update -qq >/dev/null 2>&1
  apt-get install -y -qq libnss3 libdbus-1-3 libatk1.0-0 libasound2 libxrandr2 \
    libxkbcommon-dev libxfixes3 libxcomposite1 libxdamage1 libgbm-dev \
    libatk-bridge2.0-0 libcups2 libxshmfence1 libglu1-mesa fonts-liberation >/dev/null 2>&1
fi
stage "stage: chromium libs ok"

# ---------------------------------------------------------------- deps
cd "$WS/shortsmith"
# npm ci wipes and rebuilds node_modules, which on a network volume is minutes, not
# seconds. Only pay that when the lockfile has actually moved.
LOCK_HASH=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ ! -d node_modules ] || [ "$(cat .lock-hash 2>/dev/null || true)" != "$LOCK_HASH" ]; then
  stage "stage: npm ci (lockfile changed)"
  npm ci --no-audit --no-fund >/dev/null 2>&1
  echo "$LOCK_HASH" > .lock-hash
else
  stage "stage: node_modules current"
fi

# Remotion caches the headless shell inside node_modules/.remotion, which is on the
# volume — so this is a no-op after the first pod. Left in because it is the one
# download that would otherwise happen mid-render.
npx remotion browser ensure >/dev/null 2>&1 || true
stage "stage: browser ok"

stage "stage: ready"
