#!/bin/bash
# Block T deploy, revision 2 (2026-09-15): installs Caddy natively on the
# VPS relay (not Docker — this box is a thin, single-purpose relay, native
# is simpler here) and points it at the frp-tunneled port from the home
# server. This is the ONLY place TLS is actually terminated now — Let's
# Encrypt succeeds here because this VPS has a real, directly reachable
# public IP (unlike the CGNAT'd home server).
set -euo pipefail

DOMAIN="$1"
if [ -z "$DOMAIN" ]; then
  echo "Usage: $0 <domain, e.g. worksklad.ru>" >&2
  exit 1
fi

echo "=== Caddy official apt repo ==="
apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update -qq
apt-get install -y -qq caddy

echo "=== Caddyfile ==="
cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN}, www.${DOMAIN} {
	reverse_proxy 127.0.0.1:8080

	header {
		X-Content-Type-Options "nosniff"
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
	}

	encode zstd gzip
}
EOF

systemctl reload caddy || systemctl restart caddy
systemctl enable caddy

echo "=== Done ==="
systemctl is-active caddy
caddy validate --config /etc/caddy/Caddyfile
