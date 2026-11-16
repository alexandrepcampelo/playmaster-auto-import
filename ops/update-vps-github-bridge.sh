#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Execute como root: sudo bash" >&2
  exit 1
fi

BRIDGE_COMMIT="7cfdb46fd551d7b72b6dd30d3ef677b7833f4ea5"
BRIDGE_URL="https://raw.githubusercontent.com/alexandrepcampelo/playmaster-auto-import/${BRIDGE_COMMIT}/ops/playmaster-github-bridge"
TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

curl -fsSL "$BRIDGE_URL" -o "$TMP_FILE"
bash -n "$TMP_FILE"
install -o root -g root -m 755 "$TMP_FILE" /usr/local/sbin/playmaster-github-bridge
echo "Atualização instalada. Nenhum serviço foi reiniciado e nenhum dado foi alterado."
