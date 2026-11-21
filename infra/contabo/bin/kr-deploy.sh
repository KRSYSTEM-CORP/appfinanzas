#!/bin/bash
# Despliega KR POS (rama main de GitHub) en el servidor propio. Uso: ./kr-deploy.sh [--migrar]
# Requiere: llave ~/.ssh/kr_servidor y el repo en "01 KR POS/app".
set -euo pipefail
APP="/Users/ar/Desktop/KR SYSTEM/01 KR POS/app"; SRV=kr@62.146.179.214; K=~/.ssh/kr_servidor
cd "$APP"; git fetch -q origin main; C=$(git rev-parse --short origin/main)
echo "Desplegando $C"; git archive origin/main | gzip > /tmp/kr-src.tgz
scp -q -i $K /tmp/kr-src.tgz $SRV:/tmp/src.tgz
ssh -i $K $SRV "set -e; cp /opt/kr/src/Dockerfile /tmp/Dockerfile.srv; rm -rf /opt/kr/src.new && mkdir /opt/kr/src.new && tar xzf /tmp/src.tgz -C /opt/kr/src.new 2>/dev/null; cp /tmp/Dockerfile.srv /opt/kr/src.new/Dockerfile; rm -rf /opt/kr/src.old; mv /opt/kr/src /opt/kr/src.old; mv /opt/kr/src.new /opt/kr/src; rm /tmp/src.tgz /tmp/Dockerfile.srv"
ssh -i $K $SRV "bash /opt/kr/b.sh && cd /opt/kr && sg docker -c 'docker tag kr-pos:latest kr-pos:$C'"
if [ "${1:-}" = "--migrar" ]; then ssh -i $K $SRV "cd /opt/kr/src && sg docker -c 'docker build --target migrate -t kr-pos-migrate:latest . -q' && cd /opt/kr && sg docker -c 'docker compose --profile tools run --rm migrate' && sudo /usr/local/bin/kr-grants"; fi
ssh -i $K $SRV "cd /opt/kr && sg docker -c 'docker compose up -d --force-recreate app' && sleep 8 && curl -fsS http://127.0.0.1:3000/api/health && echo ' <- listo'"
echo "Si algo falla: ssh ... 'cd /opt/kr && TAG=<commit anterior> docker compose up -d app'"
