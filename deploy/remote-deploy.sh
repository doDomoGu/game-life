#!/usr/bin/env bash
set -euo pipefail

# 目标服务器只有 1 核 / 458MB 内存，也没有 pnpm，无法在远端构建或安装依赖。
# 因此前端 dist 与服务端单文件 bundle 都在本地构建好随包上传，远端只解包、保留数据并重启。
APP_DIR="${APP_DIR:-/opt/game-life}"
NEW_DIR="${APP_DIR}.new"
OLD_DIR="${APP_DIR}.old"

rm -rf "$NEW_DIR"
mkdir -p "$NEW_DIR"
tar -xzf /tmp/game-life-deploy.tgz -C "$NEW_DIR"
rm -f /tmp/game-life-deploy.tgz

# 用户与对局数据落盘在 apps/server/data，升级时保留
if [ -d "$APP_DIR/apps/server/data" ]; then
  mkdir -p "$NEW_DIR/apps/server/data"
  cp -a "$APP_DIR/apps/server/data/." "$NEW_DIR/apps/server/data/"
fi

rm -rf "$OLD_DIR"
if [ -d "$APP_DIR" ]; then
  mv "$APP_DIR" "$OLD_DIR"
fi
mv "$NEW_DIR" "$APP_DIR"

mkdir -p "$APP_DIR/apps/server/data"

# JWT_SECRET 只在首次部署时生成，后续保留
if [ ! -f /etc/game-life.env ]; then
  umask 077
  printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 32)" > /etc/game-life.env
fi

cp "$APP_DIR/deploy/game-life.service" /etc/systemd/system/game-life.service

mkdir -p /etc/nginx/conf.d/dodomogu.d
cp "$APP_DIR/deploy/game-life.conf" /etc/nginx/conf.d/dodomogu.d/game-life.conf

systemctl daemon-reload
systemctl enable game-life.service >/dev/null
systemctl restart game-life.service

nginx -t
nginx -s reload

sleep 2
systemctl --no-pager --full status game-life.service | grep -E '●|Active:'
curl -fsS http://127.0.0.1:3012/api/health
echo
echo "健康检查通过：http://dodomogu.com/game-life/"
