#!/bin/sh
set -eu

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
