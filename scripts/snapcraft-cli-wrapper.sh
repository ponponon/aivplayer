#!/usr/bin/env bash
set -euo pipefail

# electron-builder core24 writes the generated desktop entry to snap/gui, but
# its app.desktop metadata makes Snapcraft look for snap/meta/gui during prime.
# Duplicate the generated input into the path Snapcraft resolves before launch.
if [[ -f snap/snapcraft.yaml && -d snap/gui ]]; then
  shopt -s nullglob
  mkdir -p snap/meta/gui
  for desktop_file in snap/gui/*.desktop; do
    install -m 0644 "$desktop_file" "snap/meta/gui/${desktop_file##*/}"
  done
fi

exec /snap/bin/snapcraft "$@"
