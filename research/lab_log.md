# Nhật ký phòng thử nghiệm phương pháp

Mỗi lượt tìm (4 ngày/lần) ghi 1 mục: đã tìm ở đâu, thêm ứng viên nào, bỏ ý tưởng nào & vì sao. Kết quả chấm nằm ở `site/lab.json`.

## 26/11/2026 – lượt đầu (dựng máy)
Tìm: arXiv (2510.14435 "Cryptocurrency as an Investable Asset Class", 2602.11708 "AdaptiveTrend", 2212.06888 "Fundamentals of Perpetual Futures"), Quantpedia (mùa vụ trong ngày của BTC), "Catching Crypto Trends" (Zarattini, Pagani, Barbon), Keyrock (16.000 lần mở khoá token).
Thêm 6 ứng viên: `trend6h` (AdaptiveTrend rút gọn, chỉ Long – không có vốn hoá nên xếp theo khối lượng, bỏ chân Short coin nhỏ), `dcens` (9 kênh Donchian, cỡ lệnh theo biến động), `xmom14` (động lượng chéo 2 tuần – bài 2510.14435: +2,1%/tuần gộp sau 2020 trên spot), `xcarry` (funding thấp mua / cao bán), `xrev1` (đảo chiều 1 ngày), `seas2123` (BTC 21–23h UTC).
Bỏ / chưa làm: biến động thấp, beta, khối lượng, động lượng 12–24 tuần (bài 2510.14435: không có ý nghĩa sau 2020); chênh giá giữa các sàn (không thực thi được); bán trước mở khoá token & đánh ngược tỉ lệ Long/Short → QUEUE (thiếu dữ liệu).

## 26/11/2026 – bổ sung: hiệu ứng theo LỊCH (Jason: "lệnh nên đánh trong tuần / cuối tuần cũng nên nghiên cứu")
Thêm 3 ứng viên: `wkend` (chỉ giữ thứ Bảy + Chủ nhật), `wkday` (chỉ thứ Hai → thứ Sáu), `dowwf` (mỗi tháng chọn lại thứ tốt / thứ xấu từ 365 ngày trước, không biết trước).
Bắt râu sập theo lịch (`research/hook_calendar.py` → `hook_calendar.md`, 4.442 lệnh mô hình 01/2025 → 11/2026): cuối tuần so với trong tuần KHÔNG khác (chênh +11 bps, p = 0,86);
theo khung giờ VN: 12–18h tốt nhất (+190 bps, cả 2025 lẫn 2026; chênh +103 so với phần còn lại, p = 0,06), 0–6h yếu nhất (+32; p = 0,09), 18–24h yếu trong 90 ngày gần nhất (−11) – chưa đủ chắc để thành luật, cần kiểm bằng dữ liệu khớp lệnh thật.
