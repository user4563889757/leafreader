#!/usr/bin/env bash
# Publish Leafreader to IPFS with a local Kubo node.
#
#   ./deploy/ipfs/publish.sh
#
# Requires: ipfs (Kubo) on PATH and a running daemon (`ipfs daemon`).
# Optional: IPFS_PIN_REMOTE=<service-name> to also pin through a configured
#           remote pinning service (ipfs pin remote service add ...).
#
# This prints a CID and IPNS address. Gateways such as dweb.link or eth.limo
# can serve the CID without any extra hosting bill.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

command -v ipfs >/dev/null 2>&1 || {
  echo "Kubo (ipfs) is required: https://docs.ipfs.tech/install/" >&2
  exit 1
}

if ! ipfs id >/dev/null 2>&1; then
  echo "The IPFS daemon is not running. Start it with: ipfs daemon" >&2
  exit 1
fi

STAGE="$(mktemp -d)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

echo "→ staging a clean copy"
if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude ".git" \
    --exclude "deploy" \
    --exclude "scripts" \
    --exclude "README.md" \
    --exclude "LICENSE" \
    --exclude ".nojekyll" \
    --exclude "__pycache__" \
    "$ROOT/" "$STAGE/"
else
  cp -a "$ROOT/." "$STAGE/"
  rm -rf "$STAGE/.git" "$STAGE/deploy" "$STAGE/scripts" \
    "$STAGE/README.md" "$STAGE/LICENSE" "$STAGE/.nojekyll" "$STAGE/__pycache__"
fi

echo "→ adding to IPFS"
CID="$(cd "$STAGE" && ipfs add -r -Q --cid-version 1 --pin .)"
echo "CID:  $CID"

if [ -n "${IPFS_PIN_REMOTE:-}" ]; then
  echo "→ pinning via remote service: $IPFS_PIN_REMOTE"
  ipfs pin remote add --service="$IPFS_PIN_REMOTE" --name="leafreader-$(date +%Y%m%d-%H%M%S)" "$CID"
fi

echo "→ publishing IPNS name (uses this node's key)"
IPNS="$(ipfs name publish --quieter "/ipfs/$CID")"
echo "IPNS: $IPNS"

cat <<EOF

Published.

  Gateway:  https://${CID}.ipfs.dweb.link/
  Local:    http://localhost:8080/ipfs/${CID}/

Public gateways and free pinning services have limits and can rate-limit or
block traffic. For a durable site, keep this node online or pin the CID with a
service you trust.

To give it a human name, set an ENS content hash to ipfs://${CID}
(see deploy/ipfs/README.md).
EOF
