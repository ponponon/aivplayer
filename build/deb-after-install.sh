#!/bin/sh
set -eu

# 设置 chrome-sandbox SUID 权限（Electron 应用必需）
CHROME_SANDBOX="/opt/aivplayer/chrome-sandbox"
if [ -f "$CHROME_SANDBOX" ]; then
  chown root:root "$CHROME_SANDBOX"
  chmod 4755 "$CHROME_SANDBOX"
fi

# 创建 aivcli 符号链接
APP_CLI="/opt/aivplayer/aivcli"
CLI_PATH="/usr/bin/aivcli"

if [ ! -x "$APP_CLI" ]; then
  exit 0
fi

if [ -e "$CLI_PATH" ] && [ ! -L "$CLI_PATH" ]; then
  exit 0
fi

rm -f "$CLI_PATH"
ln -s "$APP_CLI" "$CLI_PATH"
