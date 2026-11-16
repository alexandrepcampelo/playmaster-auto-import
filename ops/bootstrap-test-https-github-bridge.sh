#!/usr/bin/env bash
set -euo pipefail

# One-time bootstrap, run from the VPS provider's web console as root.
# It updates only the restricted bridge and one fixed helper for the test domain.
BRIDGE_COMMIT="6a77017ecc0c8925653051e151b3d8f0460f4749"
RAW="https://raw.githubusercontent.com/alexandrepcampelo/playmaster-auto-import/${BRIDGE_COMMIT}/ops"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Abra o console web da VPS como root e execute novamente." >&2
  exit 1
fi

id pmbridge >/dev/null 2>&1 || { echo "Usuário pmbridge não encontrado; nenhuma alteração aplicada." >&2; exit 1; }

curl -fsSL "${RAW}/playmaster-github-bridge" -o "$TMP_DIR/playmaster-github-bridge"
curl -fsSL "${RAW}/playmaster-test-autoimport-https" -o "$TMP_DIR/playmaster-test-autoimport-https"
bash -n "$TMP_DIR/playmaster-github-bridge"
bash -n "$TMP_DIR/playmaster-test-autoimport-https"

install -o root -g root -m 755 "$TMP_DIR/playmaster-github-bridge" /usr/local/sbin/playmaster-github-bridge
install -o root -g root -m 755 "$TMP_DIR/playmaster-test-autoimport-https" /usr/local/sbin/playmaster-test-autoimport-https

cat > "$TMP_DIR/playmaster-github-bridge.sudoers" <<'SUDOERS'
pmbridge ALL=(root) NOPASSWD: /usr/bin/docker ps *, /usr/sbin/nginx -t, /usr/bin/cat /etc/nginx/sites-enabled/test-autoimport, /usr/local/sbin/playmaster-test-autoimport-https
SUDOERS

visudo -cf "$TMP_DIR/playmaster-github-bridge.sudoers"
install -o root -g root -m 440 "$TMP_DIR/playmaster-github-bridge.sudoers" /etc/sudoers.d/playmaster-github-bridge
visudo -cf /etc/sudoers.d/playmaster-github-bridge

echo "BOOTSTRAP_OK: ponte atualizada"
echo "SCOPE: somente ativação HTTPS de test-autoimport.apcgestor.com.br"
echo "KEYS: nenhuma chave SSH foi criada, substituída ou exibida"
echo "PRODUCTION: nenhum arquivo, container ou serviço de produção foi alterado"
echo "NGINX: nenhuma configuração foi aplicada e nenhum reload foi executado"
