#!/usr/bin/env bash
set -euo pipefail

# Run once as root on the VPS to enable the narrowly scoped test deploy action.
REF="feature/catalog-folder-hierarchy"
RAW="https://raw.githubusercontent.com/alexandrepcampelo/playmaster-auto-import/${REF}/ops"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Execute este comando como root (sudo)." >&2
  exit 1
fi
id pmbridge >/dev/null 2>&1 || { echo "Usuário pmbridge não encontrado; nada foi alterado." >&2; exit 1; }

curl -fsSL "${RAW}/playmaster-github-bridge" -o "$TMP_DIR/playmaster-github-bridge"
curl -fsSL "${RAW}/playmaster-test-autoimport-deploy" -o "$TMP_DIR/playmaster-test-autoimport-deploy"
bash -n "$TMP_DIR/playmaster-github-bridge"
bash -n "$TMP_DIR/playmaster-test-autoimport-deploy"

install -o root -g root -m 755 "$TMP_DIR/playmaster-github-bridge" /usr/local/sbin/playmaster-github-bridge
install -o root -g root -m 755 "$TMP_DIR/playmaster-test-autoimport-deploy" /usr/local/sbin/playmaster-test-autoimport-deploy

cat > "$TMP_DIR/playmaster-github-bridge.sudoers" <<'SUDOERS'
pmbridge ALL=(root) NOPASSWD: /usr/bin/docker ps *, /usr/sbin/nginx -t, /usr/bin/cat /etc/nginx/sites-enabled/test-autoimport, /usr/local/sbin/playmaster-test-autoimport-https, /usr/local/sbin/playmaster-test-autoimport-deploy *
SUDOERS

visudo -cf "$TMP_DIR/playmaster-github-bridge.sudoers"
install -o root -g root -m 440 "$TMP_DIR/playmaster-github-bridge.sudoers" /etc/sudoers.d/playmaster-github-bridge
visudo -cf /etc/sudoers.d/playmaster-github-bridge

echo "TEST_DEPLOY_BRIDGE_READY"
echo "SCOPE: /opt/playmaster-auto-import-test only"
echo "PRESERVED: .env, docker-compose.test.yml, data/, storage/"
echo "PRODUCTION: no files, containers, or data changed"
