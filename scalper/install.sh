#!/usr/bin/env bash
# Cài bot lướt giây MyBit lên máy chủ Ubuntu/Debian mới (chạy bằng quyền root: sudo bash install.sh)
# Thay khoá mới (sau khi tạo lại khoá trên trang): sudo bash install.sh --key
# Làm gì: cài Node.js 22 (nếu thiếu) + git, tải mã MyBit về /opt/my-bit, hỏi khoá, tạo dịch vụ tự chạy lại khi máy khởi động / lỗi.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Hãy chạy bằng: sudo bash install.sh"; exit 1; }
echo "== 1/5 Cài Node.js 22 và git"
apt-get update -qq && apt-get install -y -qq git curl ca-certificates >/dev/null
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null && apt-get install -y -qq nodejs >/dev/null
fi
echo "   node $(node --version)"
if ! swapon --show | grep -q .; then     # bộ nhớ dự phòng 1 GB: máy 1 GB RAM không bị hệ điều hành tắt chương trình khi dữ liệu dồn về
  echo "   tạo bộ nhớ dự phòng (swap) 1 GB"
  if [ ! -f /swapfile ]; then fallocate -l 1G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=1024 status=none; chmod 600 /swapfile; mkswap /swapfile >/dev/null; fi
  swapon /swapfile || true
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo "== 2/5 Tải mã MyBit về /opt/my-bit"
if [ -d /opt/my-bit/.git ]; then git -C /opt/my-bit pull -q --ff-only; else git clone -q --depth 1 https://github.com/havudinhkhanh/my-bit.git /opt/my-bit; fi
id mybit >/dev/null 2>&1 || useradd --system --home /opt/my-bit --shell /usr/sbin/nologin mybit
mkdir -p /opt/my-bit/scalper/data
echo "== 3/5 Khoá máy chủ riêng"
NEWKEY=0; for a in "$@"; do [ "$a" = "--key" ] && NEWKEY=1; done     # --key: hỏi lại khoá (khi đã tạo khoá mới trên trang)
if [ "$NEWKEY" = 1 ] || ! grep -q '^MYBIT_SCALP_KEY=[0-9a-f]\{64\}' /opt/my-bit/scalper/.env 2>/dev/null; then
  echo "   Trên trang MyBit: Bot lướt giây → Thiết lập → Nơi chạy → Máy chủ riêng → Tạo khoá → Chép."
  read -r -p "   Dán dòng MYBIT_SCALP_KEY=... vào đây rồi Enter: " LINE < /dev/tty
  LINE="$(echo "$LINE" | tr -d '[:space:]')"; case "$LINE" in MYBIT_SCALP_KEY=*) ;; *) LINE="MYBIT_SCALP_KEY=$LINE";; esac
  echo "$LINE" | grep -q '^MYBIT_SCALP_KEY=[0-9a-f]\{64\}$' || { echo "   Khoá không đúng dạng (64 ký tự 0-9a-f)"; exit 1; }
  umask 077; echo "$LINE" > /opt/my-bit/scalper/.env
fi
chown -R mybit:mybit /opt/my-bit/scalper/data /opt/my-bit/scalper/.env && chmod 600 /opt/my-bit/scalper/.env
echo "== 4/5 Kiểm tra kết nối Binance từ máy này"
for u in https://fapi.binance.com/fapi/v1/ping https://api.binance.com/api/v3/ping; do printf "   %s → " "$u"; curl -s -o /dev/null -w "%{http_code}\n" "$u" || echo lỗi; done
echo "== 5/5 Tạo dịch vụ tự chạy"
cp /opt/my-bit/scalper/mybit-scalper.service /etc/systemd/system/mybit-scalper.service
systemctl daemon-reload && systemctl enable -q mybit-scalper && systemctl restart mybit-scalper && sleep 8
systemctl --no-pager --lines=15 status mybit-scalper || true
echo
echo "Xong. Xem nhật ký trực tiếp: journalctl -u mybit-scalper -f    ·    Cập nhật bản mới: sudo bash /opt/my-bit/scalper/install.sh"
