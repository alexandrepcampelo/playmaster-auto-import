#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Execute como root: sudo bash" >&2
  exit 1
fi

BRIDGE_COMMIT="6a77017ecc0c8925653051e151b3d8f0460f4749"
BRIDGE_URL="https://raw.githubusercontent.com/alexandrepcampelo/playmaster-auto-import/${BRIDGE_COMMIT}/ops/playmaster-github-bridge"
HELPER_URL="https://raw.githubusercontent.com/alexandrepcampelo/playmaster-auto-import/${BRIDGE_COMMIT}/ops/playmaster-test-autoimport-https"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsSL "$BRIDGE_URL" -o "$TMP_DIR/playmaster-github-bridge"
curl -fsSL "$HELPER_URL" -o "$TMP_DIR/playmaster-test-autoimport-https"
bash -n "$TMP_DIR/playmaster-github-bridge"
bash -n "$TMP_DIR/playmaster-test-autoimport-https"
install -o root -g root -m 755 "$TMP_DIR/playmaster-github-bridge" /usr/local/sbin/playmaster-github-bridge
install -o root -g root -m 755 "$TMP_DIR/playmaster-test-autoimport-https" /usr/local/sbin/playmaster-test-autoimport-https

cat > "$TMP_DIR/sudoers" <<'EOF'
pmbridge ALL=(root) NOPASSWD: /usr/bin/docker ps *, /usr/sbin/nginx -t, /usr/bin/cat /etc/nginx/sites-enabled/test-autoimport, /usr/local/sbin/playmaster-test-autoimport-https
EOF
visudo -cf "$TMP_DIR/sudoers"
install -o root -g root -m 440 "$TMP_DIR/sudoers" /etc/sudoers.d/playmaster-github-bridge
visudo -cf /etc/sudoers.d/playmaster-github-bridge

echo "Atualização instalada. A ponte pode ativar HTTPS somente para test-autoimport.apcgestor.com.br."
echo "Nenhum serviço foi reiniciado e nenhum dado de produção foi alterado."
