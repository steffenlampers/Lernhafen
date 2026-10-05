#!/bin/sh
# Stellt sicher, dass /data (Ordner auf dem NAS) beschreibbar ist, und startet die App ohne Root-Rechte.
# Ports unter 1024 (z. B. 80 bei eigener IP) gehen ohne Root, wenn der Container mit
# "sysctls: net.ipv4.ip_unprivileged_port_start=0" gestartet wird (siehe docker-compose.eigene-ip.yml).
set -e
mkdir -p "${DATA_DIR:-/data}/scans"
chown -R node:node "${DATA_DIR:-/data}" 2>/dev/null || true
if [ "${PORT:-8088}" -lt 1024 ]; then
  first=$(cat /proc/sys/net/ipv4/ip_unprivileged_port_start 2>/dev/null || echo 1024)
  if [ "${PORT}" -ge "${first}" ]; then exec su-exec node "$@"; fi
  echo "Hinweis: Port ${PORT} liegt unter 1024 und der Container hat keine sysctl-Freigabe. Der Prozess läuft deshalb als root."
  exec "$@"
fi
exec su-exec node "$@"
