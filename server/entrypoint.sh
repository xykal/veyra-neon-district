#!/bin/sh
set -eu
# Cloud volumes may mount as root-owned. Initialize once, then drop privileges.
if [ "$(id -u)" = 0 ]; then
  mkdir -p "${DATA_DIR:-/app/data}"
  chown node:node "${DATA_DIR:-/app/data}"
  for file in "${DATA_DIR:-/app/data}/profiles.json" "${DATA_DIR:-/app/data}/profiles.json.tmp"; do
    if [ -f "$file" ]; then chown node:node "$file"; fi
  done
  exec su-exec node "$@"
fi
exec "$@"
