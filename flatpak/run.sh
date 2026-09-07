#!/bin/sh
export AIVPLAYER_DISABLE_AUTO_UPDATE=1
exec zypak-wrapper /app/main/aivplayer "$@"
