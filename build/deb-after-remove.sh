#!/bin/sh
set -eu

APP_INSTALL_DIR="/opt/AIVPlayer"
CLI_PATH="/usr/bin/aivcli"
EXPECTED_TARGET="$APP_INSTALL_DIR/aivcli"

if [ -L "$CLI_PATH" ] && [ "$(readlink "$CLI_PATH")" = "$EXPECTED_TARGET" ]; then
  rm -f "$CLI_PATH"
fi
