#!/bin/sh

# Debian updates must be installed outside Electron's main process. Running
# dpkg/pkexec synchronously there makes Ubuntu report the application as frozen
# while the privilege prompt or package transaction is active.
set -u

parent_pid="${1:-}"
deb_path="${2:-}"
app_path="${3:-}"

case "$parent_pid" in
  ''|*[!0-9]*) exit 64 ;;
esac

if [ -z "$deb_path" ] || [ -z "$app_path" ]; then
  exit 64
fi

# The application must exit before dpkg replaces its files. The helper itself
# is detached, so the user sees no "not responding" dialog during this wait.
while kill -0 "$parent_pid" 2>/dev/null; do
  sleep 0.2
done

run_privileged() {
  if command -v pkexec >/dev/null 2>&1; then
    pkexec "$@"
  else
    sudo "$@"
  fi
}

install_status=0
run_privileged /usr/bin/dpkg --install "$deb_path" || install_status=$?

# Match electron-updater's Debian fallback for packages whose dependencies
# need repairing after dpkg has unpacked the update.
if [ "$install_status" -ne 0 ]; then
  install_status=0
  run_privileged /usr/bin/apt-get install -f -y || install_status=$?
fi

if [ "$install_status" -ne 0 ]; then
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "AIVPlayer" "更新安装失败，请重新打开应用检查更新。" >/dev/null 2>&1 || true
  fi
  nohup "$app_path" >/dev/null 2>&1 </dev/null &
  exit "$install_status"
fi

nohup "$app_path" >/dev/null 2>&1 </dev/null &
