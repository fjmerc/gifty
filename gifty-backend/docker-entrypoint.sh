#!/bin/sh
set -e
DATA_DIR="${DATA_DIR:-/app/data}"

# Docker creates missing bind-mount dirs as root, and fresh named volumes can
# end up with root-owned subdirs. Create the layout, hand anything not owned
# by node over to it (cheap when already correct), then drop privileges.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/backups"
  find "$DATA_DIR" \! -user node -exec chown node:node {} +
  exec su-exec node "$@"
fi
exec "$@"
