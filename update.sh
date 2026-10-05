#!/bin/sh
# Lernhafen aktualisieren: neues Image laden und den Container neu starten. Die Daten im Ordner "data" bleiben unverändert.
# Aufruf per SSH im Ordner mit der Compose-Datei:   sh update.sh
# Andere Compose-Datei (eigene IP):      sh update.sh docker-compose.eigene-ip.yml
set -e
cd "$(dirname "$0")"
FILE="${1:-docker-compose.yml}"
[ -f "$FILE" ] || { echo "Compose-Datei $FILE nicht gefunden. Aufruf: sh update.sh [datei.yml]"; exit 1; }
if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi
echo "Lade neues Image …"
$DC -f "$FILE" pull
echo "Starte Container neu …"
$DC -f "$FILE" up -d
docker image prune -f >/dev/null 2>&1 || true
echo "Fertig. Die Version steht in der App unter „Mehr → Daten und Verbindungen“."
