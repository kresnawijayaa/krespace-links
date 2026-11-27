#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if [[ ! -r .env ]]; then
  printf '%s\n' 'File .env belum tersedia atau tidak dapat dibaca.' >&2
  exit 1
fi

if [[ "$(git branch --show-current)" != main ]]; then
  printf '%s\n' 'Jalankan skrip dari branch main.' >&2
  exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  printf '%s\n' 'Ada perubahan lokal pada file yang dilacak Git. Periksa git status sebelum update.' >&2
  exit 1
fi

git pull --ff-only origin main
docker compose -p krespace-links up -d --build affiliate

for ((attempt = 1; attempt <= 15; attempt++)); do
  if docker exec caddy_server wget -q -O /dev/null http://krespace-links-app:3000/healthz; then
    printf 'KresPace sudah diperbarui ke %s dan bisa dijangkau Caddy.\n' "$(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 2
done

printf '%s\n' 'Health check gagal. Log aplikasi:' >&2
docker compose -p krespace-links logs --tail=60 affiliate >&2
exit 1
