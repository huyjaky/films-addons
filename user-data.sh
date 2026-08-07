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
