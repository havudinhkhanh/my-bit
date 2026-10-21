#!/usr/bin/env bash
# Đẩy báo cáo chạy (log, tóm tắt, dữ liệu kiểm tra) lên nhánh `status` để Claude đọc khi cần sửa lỗi.
# Nhánh luôn chỉ có 1 commit (ghi đè) để repo không phình to. Dùng quyền git sẵn có của repo.
# Dùng: bash scripts/publish_status.sh <thư-mục-con> <file-hoặc-thư-mục> ...
set -uo pipefail
sub="$1"; shift
tmp="$(mktemp -d)"
export GIT_INDEX_FILE="$tmp/index"
mkdir -p "$tmp/tree"
if git ls-remote --exit-code --heads origin status >/dev/null 2>&1; then
  git fetch -q --depth 1 origin status && git --work-tree="$tmp/tree" checkout FETCH_HEAD -- . 2>/dev/null || true
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
  git push -q -f origin "$commit:refs/heads/status" || echo "Không đẩy được báo cáo lên nhánh status"
