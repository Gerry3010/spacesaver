#!/usr/bin/env bash
# One-time host setup for spacesaver.geraldhofbauer.net (run with sudo).
# Prereq: the container is already up (docker compose -f deploy/docker-compose.yml up -d --build)
# DNS: *.geraldhofbauer.net wildcard already points at this server.
set -euo pipefail

DOMAIN="spacesaver.geraldhofbauer.net"
PORT=8123
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $EUID -ne 0 ]]; then
  echo "run me with sudo" >&2
  exit 1
fi

if ! curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/"; then
  echo "container not answering on 127.0.0.1:${PORT} — start it first:" >&2
  echo "  docker compose -f deploy/docker-compose.yml up -d --build" >&2
  exit 1
fi

cp "${SCRIPT_DIR}/nginx-site.conf" "/etc/nginx/sites-available/${DOMAIN}"
ln -sf "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}"

nginx -t
systemctl reload nginx

certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m geraldhofbauer9@gmail.com

echo "done: https://${DOMAIN}"
