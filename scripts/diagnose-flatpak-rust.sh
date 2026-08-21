#!/usr/bin/env bash
# Flatpak rust-stable extension 安装失败诊断脚本。
# 用法: bash scripts/diagnose-flatpak-rust.sh <arch>
# 在 GitHub Actions runner 上执行，借助 flatpak/ostree 自身解析索引，
# 输出该 ref 对应的 commit checksum，并测试各对象在 CDN 上的 HTTP 状态。

set -u
ARCH="${1:-x86_64}"
REF="runtime/org.freedesktop.Sdk.Extension.rust-stable/${ARCH}/25.08"
BASE="https://dl.flathub.org/repo"

echo "== 诊断 rust-stable ref: ${REF} (arch=${ARCH}) =="

# 1. 基础路径状态
echo "summary.idx: $(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${BASE}/summary.idx")"
echo "config:      $(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${BASE}/config")"
echo "refs/heads:  $(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${BASE}/refs/heads/${REF}")"

# 2. 用 flatpak 列出该 ref 的 commit（如果 remote 已配置）
if command -v flatpak >/dev/null 2>&1; then
  echo "== flatpak remote-info =="
  flatpak remote-info --user flathub "org.freedesktop.Sdk.Extension.rust-stable/${ARCH}/25.08" 2>&1 | head -20 || true
  echo "== flatpak ls-remote =="
  flatpak ls-remote --user flathub "org.freedesktop.Sdk.Extension.rust-stable/*" 2>&1 | head -10 || true
fi

# 3. 解析 summary.idx: 提取 x86_64 对应的 summary checksum
echo "== summary.idx 解析 =="
curl -s --max-time 60 "${BASE}/summary.idx" -o /tmp/summary-idx.bin || true
python3 - "${ARCH}" << 'PYEOF'
import sys
arch = sys.argv[1]
data = open('/tmp/summary-idx.bin','rb').read()
print("idx size:", len(data))
# ostree indexed summary 格式: 每个条目 = arch(NUL结束) + checksum(32 bytes)
i = 0
found = None
while i < len(data):
    end = data.find(b"\x00", i)
    if end == -1 or end - i > 64:
        break
    name = data[i:end].decode("utf-8", "replace")
    csum = data[end+1:end+33].hex()
    if name == arch:
        found = csum
        print(f"MATCH {name}: {csum}")
        break
    i = end + 33
if not found:
    print("未找到架构", arch, "，idx 前 200 字节:", data[:200].hex())
    sys.exit(0)
# 下载 summary 文件并查找 ref
import gzip, urllib.request
url = f"https://dl.flathub.org/repo/summaries/{found}.gz"
print("summary URL:", url)
try:
    req = urllib.request.Request(url, headers={"User-Agent": "flatpak/1.15.0"})
    raw = urllib.request.urlopen(req, timeout=60).read()
    data2 = gzip.decompress(raw)
    print("summary decompressed size:", len(data2))
    target = b"runtime/org.freedesktop.Sdk.Extension.rust-stable/x86_64/25.08"
    pos = data2.find(target)
    print("ref 在 summary 中:", "找到" if pos != -1 else "未找到!")
    if pos != -1:
        print("ref 后字节:", data2[pos+len(target):pos+len(target)+64].hex())
except Exception as e:
    print("summary 下载/解析失败:", e)
PYEOF

# 4. 测试已知 checksum 的对象（从 refs/heads 获取）
CSUM=$(curl -s --max-time 30 "${BASE}/refs/heads/${REF}" | head -c 64)
if [[ "$CSUM" =~ ^[0-9a-f]{64}$ ]]; then
  echo "== refs/heads checksum: ${CSUM} =="
  for sfx in .commit .dirtree .dirmeta; do
    url="${BASE}/objects/${CSUM:0:2}/${CSUM:2}${sfx}"
    echo "object ${sfx}: $(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${url}")"
  done
  echo "delta superblock: $(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${BASE}/deltas/${CSUM}.superblock")"
else
  echo "refs/heads 未返回合法 checksum"
fi
