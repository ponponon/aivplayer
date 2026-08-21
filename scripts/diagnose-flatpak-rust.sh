#!/usr/bin/env bash
# Flatpak rust-stable extension 安装失败诊断脚本。
# 用法: bash scripts/diagnose-flatpak-rust.sh <arch>
# 在 GitHub Actions runner 上执行。
#
# 已知根因（2026-08-21）:
#   Flathub 端 org.freedesktop.Sdk.Extension.rust-stable 1.98.0 发布不完整：
#   refs/heads 的 binding commit 存在（200），但其内嵌的真实 commit 对象
#   在 CDN 上缺失（404），导致 flatpak pull 失败。此为 Flathub 上游问题，
#   非本仓库代码问题，等 Flathub 重新上传对象后自动恢复。

set -u
ARCH="${1:-x86_64}"
REF="runtime/org.freedesktop.Sdk.Extension.rust-stable/${ARCH}/25.08"
BASE="https://dl.flathub.org/repo"

echo "== 诊断 rust-stable ref: ${REF} (arch=${ARCH}) =="

# 1. 基础路径状态
echo "summary.idx: $(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${BASE}/summary.idx")"
echo "refs/heads:  $(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${BASE}/refs/heads/${REF}")"

# 2. 从 refs/heads 获取 binding commit checksum
CSUM=$(curl -s --max-time 30 "${BASE}/refs/heads/${REF}" | head -c 64)
if [[ ! "$CSUM" =~ ^[0-9a-f]{64}$ ]]; then
  echo "refs/heads 未返回合法 checksum（Flathub 端 ref 缺失）"
  exit 0
fi
echo "binding commit: ${CSUM}"
echo "binding commit 对象: $(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${BASE}/objects/${CSUM:0:2}/${CSUM:2}.commit")"

# 3. 下载 binding commit，解析内嵌的真实 commit checksum（xa.from_commit）
curl -s --max-time 30 "${BASE}/objects/${CSUM:0:2}/${CSUM:2}.commit" -o /tmp/binding.commit || true
REAL=$(python3 - "${ARCH}" << 'PYEOF'
import re
import sys
data = open('/tmp/binding.commit', 'rb').read()
m = re.search(rb'xa\.from_commit\x00\x00([0-9a-f]{64})', data)
if m:
    print(m.group(1).decode())
else:
    print('')
PYEOF
)

if [[ "$REAL" =~ ^[0-9a-f]{64}$ ]]; then
  echo "真实 commit: ${REAL}"
  echo "真实 commit 对象: $(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${BASE}/objects/${REAL:0:2}/${REAL:2}.commit")"
  echo "真实 dirtree:     $(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${BASE}/objects/${REAL:0:2}/${REAL:2}.dirtree")"
  echo "真实 dirmeta:     $(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${BASE}/objects/${REAL:0:2}/${REAL:2}.dirmeta")"
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${BASE}/objects/${REAL:0:2}/${REAL:2}.commit")" = "404" ]; then
    echo ""
    echo ">>> 结论: binding commit 存在但真实内容对象 404 —— Flathub 上游发布不完整，"
    echo ">>> 等待 Flathub 重新上传后自动恢复（本 workflow 已带重试，无需改代码）。"
  fi
else
  echo "binding commit 中未找到 xa.from_commit（对象可能已损坏）"
fi
