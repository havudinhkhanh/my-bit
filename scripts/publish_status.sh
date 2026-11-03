#!/usr/bin/env bash
# Đẩy báo cáo chạy (log, tóm tắt, dữ liệu chẩn đoán) để Claude đọc khi cần sửa lỗi.
#   Có secret STATUS_SSH_KEY → đẩy vào repo RIÊNG TƯ havudinhkhanh/bot-status, nhánh "my-bit" (chỉ chủ repo đọc được, không lộ thông tin cá nhân).
#   Hoặc STATUS_TOKEN (token GitHub sẵn có, nếu có quyền với bot-status) → như trên.
#   Chưa có → nhánh `status` của chính repo này (công khai) như trước.
# Nhánh luôn chỉ có 1 commit (ghi đè) để repo không phình to.
# Dùng: bash scripts/publish_status.sh <thư-mục-con> <file-hoặc-thư-mục> ...
#       bash scripts/publish_status.sh --get <đường-dẫn-trong-nhánh> <file-ra>     (đọc lại 1 file đã đẩy, vd keep/fwd_log.parquet)
set -uo pipefail
tmp="$(mktemp -d)"
REMOTE=origin; BR=status
if [ -n "${STATUS_SSH_KEY:-}" ]; then
  printf '%s\n' "$STATUS_SSH_KEY" > "$tmp/k" && chmod 600 "$tmp/k"
  export GIT_SSH_COMMAND="ssh -i $tmp/k -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$tmp/kh"
  REMOTE="git@github.com:havudinhkhanh/bot-status.git"; BR="my-bit"
fi
# chưa có khoá riêng: thử token GitHub sẵn có của repo (GH_DISPATCH_TOKEN) – có quyền ghi bot-status thì dùng, không thì giữ nhánh status cũ
if [ "$REMOTE" = origin ] && [ -n "${STATUS_TOKEN:-}" ]; then
  U="https://x-access-token:${STATUS_TOKEN}@github.com/havudinhkhanh/bot-status.git"
  if git ls-remote "$U" >/dev/null 2>&1; then REMOTE="$U"; BR="my-bit"; fi
fi
if [ "${1:-}" = "--get" ]; then
  git fetch -q --depth 1 "$REMOTE" "$BR" 2>/dev/null && git show "FETCH_HEAD:$2" > "$3"; rc=$?; rm -rf "$tmp"; exit $rc
fi
sub="$1"; shift
export GIT_INDEX_FILE="$tmp/index"
mkdir -p "$tmp/tree"
if git ls-remote --exit-code --heads "$REMOTE" "$BR" >/dev/null 2>&1; then
  git fetch -q --depth 1 "$REMOTE" "$BR" && git --work-tree="$tmp/tree" checkout FETCH_HEAD -- . 2>/dev/null || true
fi
rm -rf "$tmp/tree/$sub"; mkdir -p "$tmp/tree/$sub"
for f in "$@"; do
  if [ -d "$f" ]; then mkdir -p "$tmp/tree/$sub/$(basename "$f")" && cp -r "$f"/. "$tmp/tree/$sub/$(basename "$f")/";
  elif [ -f "$f" ]; then cp "$f" "$tmp/tree/$sub/"; fi
done
date -u +"%Y-%m-%dT%H:%M:%SZ run ${GITHUB_RUN_ID:-local}" > "$tmp/tree/$sub/last_run.txt"
rm -f "$GIT_INDEX_FILE"
git --work-tree="$tmp/tree" add -A . && tree=$(git write-tree) && \
  commit=$(GIT_AUTHOR_NAME=my-bit-bot GIT_AUTHOR_EMAIL=my-bit-bot@users.noreply.github.com \
           GIT_COMMITTER_NAME=my-bit-bot GIT_COMMITTER_EMAIL=my-bit-bot@users.noreply.github.com \
           git commit-tree "$tree" -m "status ${GITHUB_RUN_ID:-}") && \
  git push -q -f "$REMOTE" "$commit:refs/heads/$BR" || echo "Không đẩy được báo cáo lên $BR"
rm -rf "$tmp"
