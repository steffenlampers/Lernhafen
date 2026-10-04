#!/bin/sh
# Stellt sicher, dass /data (Ordner auf dem NAS) beschreibbar ist, und startet die App ohne Root-Rechte.
set -e
mkdir -p "${DATA_DIR:-/data}/scans"
chown -R node:node "${DATA_DIR:-/data}" 2>/dev/null || true
if [ "${PORT:-8088}" -lt 1024 ]; then
  echo "Hinweis: Port ${PORT} < 1024 – Prozess läuft als root."
  exec "$@"
fi
exec su-exec node "$@"
