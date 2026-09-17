#!/bin/bash
# Block T deploy, revision 2 (2026-09-15): sets up a cheap VPS (real public
# IP, no CGNAT) as a pure relay for the home server sitting behind CGNAT.
# frps (frp server) accepts an outbound-initiated tunnel from the home
# server's frpc, exposing the home Caddy's port 80 as a local port here;
# this VPS's own Caddy terminates public TLS (Let's Encrypt succeeds here
# because THIS box has a real, reachable public IP) and reverse-proxies to
# that local tunneled port. Run this once, as root, on a fresh VPS.
set -euo pipefail

FRP_VERSION="0.71.0"
FRP_TOKEN="$1"   # shared secret between frps (here) and frpc (home) — passed in, never hardcoded
if [ -z "$FRP_TOKEN" ]; then
  echo "Usage: $0 <frp-shared-token>" >&2
  exit 1
fi

echo "=== swap (small VPS, no swap by default) ==="
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "=== apt update/upgrade ==="
apt-get update -qq
apt-get install -y -qq ufw fail2ban unattended-upgrades curl

echo "=== ufw firewall ==="
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP (Caddy - redirects to HTTPS)'
ufw allow 443/tcp comment 'HTTPS (Caddy)'
ufw allow 7000/tcp comment 'frp control connection (home frpc -> this frps)'
ufw --force enable

echo "=== fail2ban ==="
systemctl enable --now fail2ban

echo "=== unattended-upgrades ==="
dpkg-reconfigure -f noninteractive unattended-upgrades
systemctl enable --now unattended-upgrades

echo "=== ssh hardening ==="
printf 'PasswordAuthentication no\nPermitRootLogin prohibit-password\nKbdInteractiveAuthentication no\n' > /etc/ssh/sshd_config.d/99-hardening.conf
sshd -t
systemctl restart ssh

echo "=== frps ==="
mkdir -p /opt/frp
cd /opt/frp
curl -fsSL "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_${FRP_VERSION}_linux_amd64.tar.gz" -o frp.tar.gz
tar -xzf frp.tar.gz --strip-components=1
rm frp.tar.gz

cat > /opt/frp/frps.toml <<EOF
bindPort = 7000
auth.method = "token"
auth.token = "${FRP_TOKEN}"
EOF

cat > /etc/systemd/system/frps.service <<'EOF'
[Unit]
Description=frp server
After=network.target

[Service]
Type=simple
ExecStart=/opt/frp/frps -c /opt/frp/frps.toml
Restart=on-failure
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now frps

echo "=== Done ==="
ufw status
systemctl is-active frps fail2ban unattended-upgrades
