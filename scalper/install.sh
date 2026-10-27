#!/usr/bin/env bash
# Cài bot lướt giây MyBit lên máy chủ Ubuntu/Debian mới (chạy bằng quyền root: sudo bash install.sh)
# Thay khoá mới (sau khi tạo lại khoá trên trang): sudo bash install.sh --key
# Cài khoá API Binance (Demo hoặc thật) cho Bắt râu sập: sudo bash install.sh --binance
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
ENVF=/opt/my-bit/scalper/.env; touch "$ENVF"; chmod 600 "$ENVF"
setenv() { local k="$1" v="$2"; grep -v "^$k=" "$ENVF" > "$ENVF.tmp" || true; echo "$k=$v" >> "$ENVF.tmp"; mv "$ENVF.tmp" "$ENVF"; chmod 600 "$ENVF"; }   # thay đúng 1 dòng, giữ các dòng khác
NEWKEY=0; BINANCE=0; for a in "$@"; do [ "$a" = "--key" ] && NEWKEY=1; [ "$a" = "--binance" ] && BINANCE=1; done
if [ "$NEWKEY" = 1 ] || ! grep -q '^MYBIT_SCALP_KEY=[0-9a-f]\{64\}' "$ENVF" 2>/dev/null; then
  echo "   Trên trang MyBit: Bot lướt giây → Thiết lập → Nơi chạy → Máy chủ riêng → Tạo khoá → Chép."
  read -r -p "   Dán dòng MYBIT_SCALP_KEY=... vào đây rồi Enter: " LINE < /dev/tty
  LINE="$(echo "$LINE" | tr -d '[:space:]')"; LINE="${LINE#MYBIT_SCALP_KEY=}"
  echo "$LINE" | grep -q '^[0-9a-f]\{64\}$' || { echo "   Khoá không đúng dạng (64 ký tự 0-9a-f)"; exit 1; }
  setenv MYBIT_SCALP_KEY "$LINE"
fi
# --binance: khoá API Binance cho phương pháp Bắt râu sập đặt lệnh thật (chỉ lưu trên máy này, quyền 600)
if [ "$BINANCE" = 1 ]; then
  echo
  echo "   KHOÁ API BINANCE (chỉ lưu trên máy chủ này – không gửi lên trang MyBit)"
  echo "   Tạo khoá RIÊNG cho bot: chỉ bật Futures (và Reading), TẮT rút tiền, giới hạn IP = $(curl -s --max-time 5 https://api.ipify.org || echo 'IP máy chủ này')"
  echo "   1) Binance Demo Trading – tiền ảo, giá thật (tạo khoá ở demo.binance.com → Quản lý API)  ← nên chạy cái này trước"
  echo "   2) Binance THẬT – tiền thật (binance.com → Quản lý API)"
  read -r -p "   Chọn 1 hoặc 2: " WHICH < /dev/tty
  case "$WHICH" in 1) P=BINANCE_DEMO;; 2) P=BINANCE_LIVE;; *) echo "   Chọn 1 hoặc 2"; exit 1;; esac
  read -r -p "   API Key: " AK < /dev/tty; AK="$(echo "$AK" | tr -d '[:space:]')"
  read -r -s -p "   Secret Key (không hiện khi gõ/dán): " SK < /dev/tty; echo; SK="$(echo "$SK" | tr -d '[:space:]')"
  echo "$AK" | grep -q '^[A-Za-z0-9]\{20,128\}$' && echo "$SK" | grep -q '^[A-Za-z0-9]\{20,128\}$' || { echo "   Khoá không đúng dạng"; exit 1; }
  setenv "${P}_KEY" "$AK"; setenv "${P}_SECRET" "$SK"; unset AK SK
  echo "   Đã lưu ${P}_KEY / ${P}_SECRET vào $ENVF. Bật trên trang: Bot lướt giây → Thiết lập → Tài khoản Binance thật."
fi
chown -R mybit:mybit /opt/my-bit/scalper/data "$ENVF" && chmod 600 "$ENVF"
echo "== 4/5 Kiểm tra kết nối Binance từ máy này"
for u in https://fapi.binance.com/fapi/v1/ping https://api.binance.com/api/v3/ping; do printf "   %s → " "$u"; curl -s -o /dev/null -w "%{http_code}\n" "$u" || echo lỗi; done
echo "== 5/5 Tạo dịch vụ tự chạy"
cp /opt/my-bit/scalper/mybit-scalper.service /etc/systemd/system/mybit-scalper.service
systemctl daemon-reload && systemctl enable -q mybit-scalper && systemctl restart mybit-scalper && sleep 8
systemctl --no-pager --lines=15 status mybit-scalper || true
echo
echo "Xong. Xem nhật ký trực tiếp: journalctl -u mybit-scalper -f    ·    Cập nhật bản mới: sudo bash /opt/my-bit/scalper/install.sh"
