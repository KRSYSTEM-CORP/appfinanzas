#!/bin/bash
# Endurecimiento de un servidor Ubuntu 24.04 NUEVO. Ejecutar como root, UNA vez.
#   ROLE=app|db  ADMIN_PUBKEY="ssh-ed25519 AAAA..."  [PRIVATE_CIDR=10.0.0.0/16]  bash harden.sh
# ROLE=app: abre 80/443 solo a Cloudflare. ROLE=db: abre 5432 solo a la red privada.
# Antes de cerrar el acceso por contraseña comprueba que el usuario "deploy" tiene una llave.
set -euo pipefail

ROLE="${ROLE:?Indica ROLE=app o ROLE=db}"
ADMIN_PUBKEY="${ADMIN_PUBKEY:?Indica ADMIN_PUBKEY con tu llave pública SSH}"
PRIVATE_CIDR="${PRIVATE_CIDR:-10.0.0.0/16}"
[ "$(id -u)" = 0 ] || { echo "Ejecuta como root"; exit 1; }
case "$ROLE" in app|db) ;; *) echo "ROLE debe ser app o db"; exit 1 ;; esac

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq ufw fail2ban unattended-upgrades curl ca-certificates gnupg

# 1) Usuario de despliegue con tu llave (antes de tocar SSH).
id deploy &>/dev/null || adduser --disabled-password --gecos "" deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
grep -qxF "$ADMIN_PUBKEY" /home/deploy/.ssh/authorized_keys 2>/dev/null || echo "$ADMIN_PUBKEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
[ -s /home/deploy/.ssh/authorized_keys ] || { echo "El usuario deploy no tiene llave; me detengo para no dejarte fuera."; exit 1; }

# 2) SSH: solo llave, sin root, solo el usuario deploy.
cat > /etc/ssh/sshd_config.d/99-kr.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 20
AllowUsers deploy
EOF
sshd -t
echo ">> Abre OTRA terminal y comprueba 'ssh deploy@este-servidor' ANTES de cerrar esta sesión."
systemctl reload ssh || systemctl reload sshd

# 3) Docker (repositorio oficial).
if ! command -v docker &>/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
usermod -aG docker deploy

# 4) Firewall.
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw limit 22/tcp comment 'ssh'
if [ "$ROLE" = app ]; then
  for ip in $(curl -fsS https://www.cloudflare.com/ips-v4) ; do ufw allow from "$ip" to any port 80,443 proto tcp comment 'cloudflare'; done
  for ip in $(curl -fsS https://www.cloudflare.com/ips-v6) ; do ufw allow from "$ip" to any port 80,443 proto tcp comment 'cloudflare'; done
else
  ufw allow from "$PRIVATE_CIDR" to any port 5432 proto tcp comment 'postgres red privada'
fi
ufw --force enable

# 5) Bloqueo automático de intentos y actualizaciones de seguridad automáticas.
cat > /etc/fail2ban/jail.d/kr.local <<'EOF'
[sshd]
enabled = true
maxretry = 4
findtime = 10m
bantime = 1h
EOF
systemctl enable --now fail2ban
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

# 6) Ajustes de red del núcleo.
cat > /etc/sysctl.d/99-kr.conf <<'EOF'
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
EOF
sysctl --system >/dev/null

echo "Listo (ROLE=$ROLE). Prueba el acceso por SSH con el usuario deploy y reinicia el servidor."
