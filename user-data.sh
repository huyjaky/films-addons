#!/bin/bash
set -euxo pipefail

REGION=ap-southeast-1
APP_DIR=/opt/aiostreams
ECR=266735814883.dkr.ecr.ap-southeast-1.amazonaws.com
COMPOSE_GZ=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

dnf install -y docker
systemctl enable --now docker

mkdir -p "$APP_DIR/data/postgres" "$APP_DIR/data/streamthru" "$APP_DIR/data/aiostreams"
aws ssm get-parameter --region "$REGION" --name /aiostreams/prod/env --with-decryption --query Parameter.Value --output text > "$APP_DIR/.env"
printf '%s' "$COMPOSE_GZ" | base64 -d | gzip -d > "$APP_DIR/docker-compose.yml"

sed -i \
  -e "s|image: phimapi-stremio-addon:latest|image: $ECR/phimapi-stremio-addon:latest|" \
  -e "s|image: torbox-cached-addon:latest|image: $ECR/torbox-cached-addon:latest|" \
  -e 's|/home/duckq1u/Documents/docker-volumes/aiostreams-volumes/postgres|/opt/aiostreams/data/postgres|' \
  -e 's|/home/duckq1u/Documents/docker-volumes/aiostreams-volumes/streamthru|/opt/aiostreams/data/streamthru|' \
  -e 's|/home/duckq1u/Documents/docker-volumes/aiostreams-volumes/aiostreams|/opt/aiostreams/data/aiostreams|' \
  "$APP_DIR/docker-compose.yml"

curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

cat > /etc/docker/daemon.json <<'JSON'
{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"3"}}
JSON
systemctl restart docker

fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR"
docker network inspect aiostreams_network >/dev/null 2>&1 || docker network create --subnet 172.32.50.0/24 aiostreams_network
cd "$APP_DIR"
/usr/local/bin/docker-compose up -d
