#!/bin/sh
set -eu

CLI_PATH="/usr/bin/aivcli"
EXPECTED_TARGET="/opt/aivplayer/aivcli"

if [ -L "$CLI_PATH" ] && [ "$(readlink "$CLI_PATH")" = "$EXPECTED_TARGET" ]; then
  rm -f "$CLI_PATH"
fi
