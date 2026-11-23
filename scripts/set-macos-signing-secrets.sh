#!/usr/bin/env bash
# 交互式写入 macOS 签名 / 公证所需的 5 个 GitHub Actions Secrets。
#
# 安全约定：所有敏感值只在本地内存和 chmod 600 的临时目录里流转，
# 不打印、不写入 shell history、不经过对话或提交记录。
#
# 用法：
#   scripts/set-macos-signing-secrets.sh --p12 /path/to/developer-id-application.p12
#   scripts/set-macos-signing-secrets.sh --p12 cert.p12 --repo ponponon/aivplayer
set -euo pipefail

usage() {
  cat <<'USAGE'
用法: scripts/set-macos-signing-secrets.sh --p12 <证书.p12> [--repo <owner/name>]

  --p12   从「钥匙串访问」导出的 Developer ID Application 证书（必须含私钥）
  --repo  GitHub 仓库，默认取当前目录所属仓库

脚本会依次写入:
  MACOS_CSC_LINK             .p12 的 base64
  MACOS_CSC_KEY_PASSWORD     .p12 的导出密码
  APPLE_ID                   新账号的 Apple ID 邮箱
  APPLE_APP_SPECIFIC_PASSWORD 该邮箱的 App 专用密码
  APPLE_TEAM_ID              从证书 OU 字段读出，可覆盖
USAGE
}

die() { printf '%s\n' "$1" >&2; exit 1; }

p12_path=""
repo=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --p12) p12_path="${2:-}"; shift 2 ;;
    --repo) repo="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数: $1（--help 查看用法）" ;;
  esac
done

[[ -n "$p12_path" ]] || { usage; die "缺少 --p12"; }
[[ -f "$p12_path" ]] || die "找不到证书文件: $p12_path"
command -v gh >/dev/null 2>&1 || die "需要 GitHub CLI（gh）"
command -v openssl >/dev/null 2>&1 || die "需要 openssl"
gh auth status >/dev/null 2>&1 || die "gh 未登录，先执行 gh auth login"

if [[ -z "$repo" ]]; then
  repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
fi
[[ -n "$repo" ]] || die "无法确定仓库，请用 --repo 指定"

workdir="$(mktemp -d)"
chmod 700 "$workdir"
trap 'rm -rf "$workdir"' EXIT

printf '目标仓库: %s\n' "$repo"

# 1. 先解开 .p12 校验类型并读出院证书里的 Team ID，避免凭据和证书不是同一个团队
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
[[ -n "$team_id" ]] || die "证书里读不到 OU（Team ID），请确认证书完整"

# Developer ID Application 证书的 CN 括号与 OU 必然一致；不一致说明这张证书
# 不属于该团队（常见于免费个人团队与付费团队混用），公证会报 not authorized。
cn_team="$(printf '%s\n' "$common_name" | sed -n 's/.*(\([A-Z0-9]\{10\}\))[[:space:]]*$/\1/p')"
if [[ -n "$cn_team" && "$cn_team" != "$team_id" ]]; then
  printf '警告: 证书 CN 括号是 %s，但 OU 是 %s，两者不一致。\n' "$cn_team" "$team_id" >&2
  printf '      以 Apple Developer 账号 Membership 页面显示的 Team ID 为准。\n' >&2
fi
printf '证书内 Team ID: %s\n' "$team_id"

# 2. 收集剩余三项
read -r -p '新账号的 Apple ID（邮箱）: ' apple_id
[[ -n "$apple_id" ]] || die "Apple ID 不能为空"

read -r -p "Team ID [${team_id}]: " input_team
if [[ -n "$input_team" ]]; then team_id="$input_team"; fi
[[ "$team_id" =~ ^[A-Z0-9]{10}$ ]] || die "Team ID 必须是 10 位大写字母或数字: $team_id"

read -r -s -p 'App 专用密码（xxxx-xxxx-xxxx-xxxx）: ' app_password
printf '\n'
[[ -n "$app_password" ]] || die "App 专用密码不能为空"

# 3. 写入 Secrets。值统一走 stdin，不落在命令行参数里（ps 可见）
base64 < "$p12_path" | tr -d '\n' > "$workdir/csc.b64"

gh secret set MACOS_CSC_LINK --repo "$repo" < "$workdir/csc.b64"
printf '%s' "$p12_password" | gh secret set MACOS_CSC_KEY_PASSWORD --repo "$repo"
printf '%s' "$apple_id" | gh secret set APPLE_ID --repo "$repo"
printf '%s' "$app_password" | gh secret set APPLE_APP_SPECIFIC_PASSWORD --repo "$repo"
printf '%s' "$team_id" | gh secret set APPLE_TEAM_ID --repo "$repo"

printf '\n已写入 5 个 Secrets：\n'
gh secret list --repo "$repo" | grep -E '^(MACOS_CSC_LINK|MACOS_CSC_KEY_PASSWORD|APPLE_ID|APPLE_APP_SPECIFIC_PASSWORD|APPLE_TEAM_ID)\b'

cat <<'NEXT'

下一步：先跑一次 verify_only 预演，确认 macOS 签名与公证都通过，再正式发布。
  gh workflow run release.yml -f tag=v0.6.13 -f verify_only=true
NEXT
