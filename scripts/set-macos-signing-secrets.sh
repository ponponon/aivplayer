#!/usr/bin/env bash
# 交互式写入 macOS 签名 / 公证所需的 5 个 GitHub Actions Secrets。
#
# 签名用 Developer ID Application 证书（.p12），公证用 App Store Connect API Key（.p8）。
# 不再需要 Apple ID + App 专用密码：API Key 不绑定个人账号，可单独吊销，
# 也不会因为改 Apple ID 密码而失效。
#
# 安全约定：所有敏感值只在本地内存和 chmod 700 的临时目录里流转，
# 不打印、不写入 shell history、不经过对话或提交记录。
#
# 用法：
#   scripts/set-macos-signing-secrets.sh \
#     --p12 ~/Desktop/DeveloperID.p12 \
#     --p8  ~/Downloads/AuthKey_ABC123DEFG.p8
set -euo pipefail

usage() {
  cat <<'USAGE'
用法: scripts/set-macos-signing-secrets.sh --p12 <证书.p12> --p8 <AuthKey_XXXX.p8> [--repo <owner/name>]

  --p12      从「钥匙串访问」导出的 Developer ID Application 证书（必须含私钥）
  --p8       App Store Connect → Integrations 生成的 API Key（.p8，只能下载一次）
  --repo     GitHub 仓库，默认取当前目录所属仓库
  --key-id   覆盖从文件名推断的 Key ID
  --issuer   覆盖交互输入的 Issuer ID

脚本会依次写入:
  MACOS_CSC_LINK       .p12 的 base64
  MACOS_CSC_KEY_PASSWORD .p12 的导出密码
  APPLE_API_KEY        .p8 正文
  APPLE_API_KEY_ID     Key ID（10 位）
  APPLE_API_ISSUER     Issuer ID（UUID 形式）
USAGE
}

die() { printf '%s\n' "$1" >&2; exit 1; }

p12_path=""
p8_path=""
repo=""
key_id=""
issuer=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --p12) p12_path="${2:-}"; shift 2 ;;
    --p8) p8_path="${2:-}"; shift 2 ;;
    --repo) repo="${2:-}"; shift 2 ;;
    --key-id) key_id="${2:-}"; shift 2 ;;
    --issuer) issuer="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数: $1（--help 查看用法）" ;;
  esac
done

[[ -n "$p12_path" ]] || { usage; die "缺少 --p12"; }
[[ -n "$p8_path" ]] || { usage; die "缺少 --p8"; }
[[ -f "$p12_path" ]] || die "找不到证书文件: $p12_path"
[[ -f "$p8_path" ]] || die "找不到 API Key 文件: $p8_path"
command -v gh >/dev/null 2>&1 || die "需要 GitHub CLI（gh）"
command -v openssl >/dev/null 2>&1 || die "需要 openssl"
gh auth status >/dev/null 2>&1 || die "gh 未登录，先执行 gh auth login"

if [[ -z "$repo" ]]; then
  repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
fi
[[ -n "$repo" ]] || die "无法确定仓库，请用 --repo 指定"

# .p8 是一份未加密的 PKCS#8 私钥；能解析说明文件没下错
openssl pkey -in "$p8_path" -noout 2>/dev/null || die ".p8 不是有效的私钥文件: $p8_path"

workdir="$(mktemp -d)"
chmod 700 "$workdir"
trap 'rm -rf "$workdir"' EXIT

printf '目标仓库: %s\n' "$repo"

# 1. 解开 .p12，确认是可分发的 Developer ID Application 证书
read -r -s -p '.p12 导出密码（导出时必须带上私钥）: ' p12_password
printf '\n'
[[ -n "$p12_password" ]] || die ".p12 导出密码不能为空"

cert_pem="$workdir/cert.pem"
if ! openssl pkcs12 -in "$p12_path" -passin "pass:$p12_password" -clcerts -nokeys -out "$cert_pem" 2>/dev/null; then
  die "无法用该密码解开 .p12（密码错误，或文件不含证书）"
fi

subject="$(openssl x509 -in "$cert_pem" -noout -subject -nameopt multiline)"
common_name="$(printf '%s\n' "$subject" | awk -F'= ' '/commonName/{print $2; exit}')"
team_id="$(printf '%s\n' "$subject" | awk -F'= ' '/organizationalUnitName/{print $2; exit}' | tr -d ' ')"

case "$common_name" in
  "Developer ID Application: "*) ;;
  "Apple Development: "*)
    die "这是 Apple Development 证书，不能用于分发。请换 Developer ID Application 证书。" ;;
  *)
    die "证书类型不是 Developer ID Application: $common_name" ;;
esac

printf '证书: %s\n' "$common_name"
printf '证书团队: %s（公证不再需要 Team ID，这里只供核对是否与 API Key 同团队）\n' "${team_id:-未知}"

# 2. Key ID 优先取文件名里的 AuthKey_<ID>.p8，其次由用户输入
if [[ -z "$key_id" ]]; then
  key_id="$(basename "$p8_path" | sed -n 's/^AuthKey_\([A-Z0-9]\{10\}\)\.p8$/\1/p')"
fi
if [[ -z "$key_id" ]]; then
  read -r -p 'API Key ID（Integrations 页面显示的 10 位）: ' key_id
fi
[[ "$key_id" =~ ^[A-Z0-9]{10}$ ]] || die "Key ID 必须是 10 位大写字母或数字: $key_id"

if [[ -z "$issuer" ]]; then
  read -r -p 'Issuer ID（Integrations 页面顶部的 UUID）: ' issuer
fi
[[ "$issuer" =~ ^[0-9a-fA-F-]{36}$ ]] || die "Issuer ID 应是 36 位 UUID: $issuer"

# 3. 写入 Secrets。值统一走 stdin，不落在命令行参数里（ps 可见）
base64 < "$p12_path" | tr -d '\n' > "$workdir/csc.b64"

gh secret set MACOS_CSC_LINK --repo "$repo" < "$workdir/csc.b64"
printf '%s' "$p12_password" | gh secret set MACOS_CSC_KEY_PASSWORD --repo "$repo"
gh secret set APPLE_API_KEY --repo "$repo" < "$p8_path"
printf '%s' "$key_id" | gh secret set APPLE_API_KEY_ID --repo "$repo"
printf '%s' "$issuer" | gh secret set APPLE_API_ISSUER --repo "$repo"

printf '\n已写入 5 个 Secrets：\n'
gh secret list --repo "$repo" | grep -E '^(MACOS_CSC_LINK|MACOS_CSC_KEY_PASSWORD|APPLE_API_KEY|APPLE_API_KEY_ID|APPLE_API_ISSUER)\b'

cat <<'NEXT'

Apple ID 那组已不再被工作流读取，新链路验证通过后可以清掉（旧的 App 专用密码仍然能调公证接口）：
  gh secret delete APPLE_ID
  gh secret delete APPLE_APP_SPECIFIC_PASSWORD
  gh secret delete APPLE_TEAM_ID

下一步：先跑一次 verify_only 预演，确认 macOS 签名与公证都通过，再正式发布。
  gh workflow run release.yml -f tag=v0.6.13 -f verify_only=true
NEXT
