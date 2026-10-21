# MyBit – phân tích crypto spot & futures

Trang web riêng (đăng nhập) phân tích ~500 coin: top vốn hoá, mọi cặp USDT trên Binance spot và mọi coin có hợp đồng tương lai.
**Chỉ phân tích & cảnh báo – không kết nối tài khoản sàn, không đặt lệnh.**

## Có gì
- **Định giá thực tế**: phí / doanh thu / phần về người giữ token (DefiLlama) → P/F, P/S, P/HR; so với nhóm cùng ngành;
  "giá hiện tại cần dòng tiền tăng bao nhiêu %/năm"; áp lực cung (lưu hành/FDV, lịch mở khoá 30/90/365 ngày, lạm phát cung thực tế).
  Coin không có dòng tiền → nhãn *Đầu cơ*. Blockchain L1 → so P/F với các chuỗi khác.
- **Chu kỳ Bitcoin**: MVRV, giá vốn toàn mạng, Mayer multiple, mô hình luỹ thừa; bảng lợi nhuận lịch sử theo vùng MVRV & Sợ hãi/Tham lam.
- **Futures**: funding (quy về 8h), OI, basis gộp Bitget/OKX/Gate/Hyperliquid + OI/long-short Binance (kho lưu trữ, trễ 1 ngày);
  tín hiệu đám đông, cơ hội carry (mua spot + bán perp).
- **3 kiểu chơi**: theo xu hướng khung ngày (kiểm chứng toàn lịch sử, có phí + funding), lướt 4h/1h, phòng hộ spot (beta, funding).
- **Danh mục** spot + futures: lãi/lỗ, giá thanh lý ước tính, funding/ngày, độ phơi nhiễm ròng; cảnh báo vào chuông/đẩy/email.
- **Công cụ**: khối lượng lệnh theo % rủi ro, giá thanh lý, phòng hộ, R:R sau phí.

## Chạy
Tự chạy mỗi 4 giờ trên GitHub Actions (`.github/workflows/update.yml`) rồi đăng lên Cloudflare Pages (project `my-bit`).
Cần GitHub secrets: `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `OWNER_EMAIL`; tuỳ chọn `GH_DISPATCH_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

Trên máy: `python run.py all` (tải + phân tích), `python run.py serve` (xem ở http://localhost:8000). Thông số trong `config.yaml`.
