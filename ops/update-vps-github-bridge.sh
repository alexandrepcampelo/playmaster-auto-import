#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Execute como root: sudo bash" >&2
  exit 1
fi

BRIDGE_COMMIT="e03dd7d40ba49b295ba0ecefa2e9694660d61f32"
BRIDGE_URL="https://raw.githubusercontent.com/alexandrepcampelo/playmaster-auto-import/${BRIDGE_COMMIT}/ops/playmaster-github-bridge"
TMP_FILE="$(mktemp)"
SUDOERS_TMP="$(mktemp)"
trap 'rm -f "$TMP_FILE" "$SUDOERS_TMP"' EXIT

curl -fsSL "$BRIDGE_URL" -o "$TMP_FILE"
bash -n "$TMP_FILE"
install -o root -g root -m 755 "$TMP_FILE" /usr/local/sbin/playmaster-github-bridge

cat > "$SUDOERS_TMP" <<'EOF'
pmbridge ALL=(root) NOPASSWD: /usr/bin/docker ps *, /usr/sbin/nginx -t, /usr/bin/cat /etc/nginx/sites-enabled/test-autoimport
EOF
visudo -cf "$SUDOERS_TMP"
install -o root -g root -m 440 "$SUDOERS_TMP" /etc/sudoers.d/playmaster-github-bridge
visudo -cf /etc/sudoers.d/playmaster-github-bridge

echo "Atualização instalada. A ponte pode ler somente o arquivo Nginx do domínio de teste para filtrar diretivas permitidas."
echo "Nenhum serviço foi reiniciado e nenhum dado de produção foi alterado."
