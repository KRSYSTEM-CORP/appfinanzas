#!/bin/bash
# Reemplaza los cron de Vercel. Uso: kr-cron.sh /api/cron/bcv-rate
set -euo pipefail
ENV_FILE=/opt/kr/app.env
SECRET=$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2-)
[ -n "$SECRET" ] || { echo "Falta CRON_SECRET en $ENV_FILE" >&2; exit 1; }
curl -fsS -m 120 -H "Authorization: Bearer $SECRET" "http://127.0.0.1:3000$1"
echo
