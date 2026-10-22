#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f deploy.env ]; then
  echo "缺少 deploy.env，请先填写服务器 IP、账号和密码。"
  exit 1
fi

# shellcheck disable=SC1091
source deploy.env
export SSHPASS

ECS_HOST="${ECS_HOST:-}"
ECS_USER="${ECS_USER:-root}"
ECS_PORT="${ECS_PORT:-22}"
APP_DIR="${APP_DIR:-/opt/game-life}"

if [ -z "$ECS_HOST" ]; then
  echo "deploy.env 里缺少 ECS_HOST"
  exit 1
fi

if [ -z "${SSHPASS:-}" ]; then
  echo "deploy.env 里缺少 SSHPASS"
  exit 1
fi

SSH_TARGET="${ECS_USER}@${ECS_HOST}"
PASS_SSH="$(pwd)/deploy/ssh-pass.exp"
PASS_SCP="$(pwd)/deploy/scp-pass.exp"
chmod +x "$PASS_SSH" "$PASS_SCP"

echo "构建前端..."
corepack pnpm --filter @game-life/web build

echo "打包服务端..."
corepack pnpm --filter @game-life/server bundle

for artifact in apps/web/dist/index.html apps/server/dist-server/index.mjs; do
  if [ ! -f "$artifact" ]; then
    echo "构建产物缺失：$artifact"
    exit 1
  fi
done

BUNDLE="$(mktemp -t game-life-deploy.XXXXXX).tgz"
trap 'rm -f "$BUNDLE"' EXIT

echo "打包项目..."
tar -czf "$BUNDLE" \
  --exclude node_modules \
  --exclude .git \
  --exclude .DS_Store \
  --exclude deploy.env \
  --exclude '*.log' \
  --exclude apps/server/data \
  --exclude apps/server/dist \
  .

echo "上传到 ${SSH_TARGET}..."
expect "$PASS_SCP" -- -P "$ECS_PORT" \
  -o StrictHostKeyChecking=accept-new \
  -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no \
  "$BUNDLE" "${SSH_TARGET}:/tmp/game-life-deploy.tgz"

echo "上传远端部署脚本..."
expect "$PASS_SCP" -- -P "$ECS_PORT" \
  -o StrictHostKeyChecking=accept-new \
  -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no \
  deploy/remote-deploy.sh "${SSH_TARGET}:/tmp/game-life-remote-deploy.sh"

echo "远端执行部署..."
expect "$PASS_SSH" -- -p "$ECS_PORT" \
  -o StrictHostKeyChecking=accept-new \
  -o PreferredAuthentications=password \
  -o PubkeyAuthentication=no \
  "$SSH_TARGET" "APP_DIR=$APP_DIR bash /tmp/game-life-remote-deploy.sh"

echo ""
echo "部署完成。访问："
echo "  http://dodomogu.com/game-life/"
