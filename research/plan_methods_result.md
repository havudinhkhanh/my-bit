# Kiểm chứng gộp – cách đánh mới ở trang Lên kế hoạch (11/2026)

Dữ liệu: nến ngày của 452 coin trong `site/data/c` (10/2022 → 11/2026), đã trừ phí 0,2% khứ hồi. Chạy: `node research/plan_methods_pool.js site/data/c pool`.

| Cách đánh | Chiều | Lệnh | Chạm MT1 | TB / lệnh |
|---|---|---|---|---|
| SMC dài hạn (tín hiệu nến tuần, khớp & thoát trên nến ngày) | Long | 1.180 | 26,7% | −0,007R |
| | Short | 1.307 | 34,8% | −0,067R |
| Kỹ thuật (EMA 20/50/200 · RSI · MACD, ngày) | Long | 1.270 | 16,1% | −0,111R |
| | Short | 3.795 | 17,9% | 0,000R |

Tách 2 nửa (mốc 01/10/2024): mọi biến thể tốt ở nửa đầu đều mất hết hoặc đổi dấu ở nửa sau.
- SMC Long +0,29R → −0,14R; SMC Short −0,46R → +0,01R: chủ yếu là đặt cược theo chiều thị trường.
- Đã thử: vùng OTE / nửa rẻ, fractal 3 nến, đệm cắt lỗ 0,5 ATR, giữ 13 tuần, MT1 = 2R, lọc BTC trên/dưới SMA200, lọc thanh khoản ≥ 2 triệu USD/ngày, thân OB, nến phá mạnh; Kỹ thuật: MT1 1R / 2R, thoát EMA20 / không thoát, RSI 40, MT1 ≥ đỉnh/đáy 20 phiên, độ dốc EMA50, chốt 1 phần ở 1R.
- Kỹ thuật Long âm ở mọi biến thể và cả 2 nửa. Kỹ thuật Short ở coin thanh khoản ≥ 2 triệu USD: +0,21R → +0,04R (không có ý nghĩa thống kê, dựa vào vài coin).

Kết luận: giữ tham số mặc định (không tối ưu thêm cho khỏi khớp quá khứ), trang hiển thị cả hai cách là "chưa chứng minh được lợi thế", số của từng coin được co về số gộp (như thêm 8 lệnh trung bình), cảnh báo riêng Kỹ thuật Long và coin thanh khoản thấp.
Sửa lỗi kiểm chứng: SMC trước đây xử lý khớp lệnh + MT1 trong cùng 1 nến tuần (lạc quan) → nay mô phỏng trên nến ngày; lệnh còn mở cuối dữ liệu tính theo giá đóng cuối.
