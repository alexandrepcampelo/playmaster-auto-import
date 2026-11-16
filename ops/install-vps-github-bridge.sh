#!/usr/bin/env bash
set -euo pipefail

# Run as root on the VPS. This creates a restricted SSH identity for GitHub Actions.
# It does not edit Nginx configuration, restart services, or modify application data.

BRIDGE_COMMIT="3c0f236dd5a079827e14108dc33551e6925fdc41"
BRIDGE_URL="https://raw.githubusercontent.com/alexandrepcampelo/playmaster-auto-import/${BRIDGE_COMMIT}/ops/playmaster-github-bridge"
USER_NAME="pmbridge"
HOME_DIR="/home/${USER_NAME}"
DOCKER_BIN="$(command -v docker)"
NGINX_BIN="$(command -v nginx)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Execute como root: sudo bash" >&2
  exit 1
fi

if [[ ! -x "$DOCKER_BIN" || ! -x "$NGINX_BIN" ]]; then
  echo "Docker ou Nginx não encontrado; nenhuma configuração foi aplicada." >&2
  exit 1
fi

if ! id "$USER_NAME" >/dev/null 2>&1; then
  useradd --create-home --home-dir "$HOME_DIR" --shell /bin/bash "$USER_NAME"
fi

install -d -o "$USER_NAME" -g "$USER_NAME" -m 700 "$HOME_DIR/.ssh"
install -d -o root -g root -m 755 /usr/local/sbin

curl -fsSL "$BRIDGE_URL" -o /usr/local/sbin/playmaster-github-bridge
chown root:root /usr/local/sbin/playmaster-github-bridge
chmod 755 /usr/local/sbin/playmaster-github-bridge

if [[ ! -s "$HOME_DIR/.ssh/id_ed25519" ]]; then
  sudo -u "$USER_NAME" ssh-keygen -q -t ed25519 -N "" -f "$HOME_DIR/.ssh/id_ed25519" -C "github-actions-playmaster-vps"
fi
chown "$USER_NAME:$USER_NAME" "$HOME_DIR/.ssh/id_ed25519" "$HOME_DIR/.ssh/id_ed25519.pub"
chmod 600 "$HOME_DIR/.ssh/id_ed25519"
chmod 644 "$HOME_DIR/.ssh/id_ed25519.pub"

PUBKEY="$(cat "$HOME_DIR/.ssh/id_ed25519.pub")"
AUTH_KEYS="$HOME_DIR/.ssh/authorized_keys"
touch "$AUTH_KEYS"
if ! grep -Fq "$PUBKEY" "$AUTH_KEYS"; then
  printf 'command="/usr/local/sbin/playmaster-github-bridge",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty %s\n' "$PUBKEY" >> "$AUTH_KEYS"
fi
chown "$USER_NAME:$USER_NAME" "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"

cat > /etc/sudoers.d/playmaster-github-bridge <<EOF
${USER_NAME} ALL=(root) NOPASSWD: ${DOCKER_BIN} ps *, ${NGINX_BIN} -t
EOF
chmod 440 /etc/sudoers.d/playmaster-github-bridge
visudo -cf /etc/sudoers.d/playmaster-github-bridge

if [[ ! -s /etc/ssh/ssh_host_ed25519_key.pub ]]; then
  echo "Chave pública do servidor SSH não encontrada." >&2
  exit 1
fi

echo
echo "=== CONFIGURAÇÃO CONCLUÍDA ==="
echo "Usuário SSH: ${USER_NAME}"
echo "Host SSH (use o IP público da VPS no secret VPS_HOST):"
echo "Chave privada para o secret VPS_SSH_KEY:"
cat "$HOME_DIR/.ssh/id_ed25519"
echo
echo "Chave de host para o secret VPS_KNOWN_HOSTS (substitua o IP se necessário):"
awk -v host="179.198.124.131" '{print host, $1, $2}' /etc/ssh/ssh_host_ed25519_key.pub
echo
echo "O script aceita somente: test-status, nginx-config-test e test-http-check."
echo "Nenhum serviço foi reiniciado e nenhum dado de produção foi alterado."
