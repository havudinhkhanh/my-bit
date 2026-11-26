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

## 26/11/2026 – rà soát độc lập `xmom14` (research/lab_diag.py) & bản bền `xmomr`
Sửa lỗi máy chấm: phí kéo tỉ trọng mỗi ngày trước đây tính thiếu (`lab.pnl`, xmom14 −1,8%/năm). Không có nhìn trước.
Kết luận về `xmom14`: không phải lỗi mã, nhưng con số +64%/năm phần lớn là may – đổi danh mục thứ khác cho 12 tháng −42% … +66% (thứ Hai +167%); 5 mã = 65% lời; bỏ 20 ngày tốt nhất còn −1%;
funding của các coin bị ép giá chiếm 40% lời; từ 2026 rổ "40 mã lớn" có ~9 hợp đồng cổ phiếu / hàng hoá (nay quá nửa). Kỳ vọng hợp lý 1× vốn: +10–20%/năm, sụt 25–45%.
Bản chia 7 phần + chỉ coin + nghịch biến động (chẩn đoán): Sharpe 1,38, +44%/năm, sụt 23%; kiểm lùi 07/2021 → 06/2023: Sharpe 0,95 – nhưng lookback 14 ngày là đỉnh lẻ (7: 0,49 · 28: 0,59).
→ Thêm `xmomr` ĐĂNG KÝ TRƯỚC, không dò: chỉ coin · điểm = trung bình thứ hạng 7/14/28 ngày · 7 phần theo thứ · nghịch biến động · tối đa 5%/mã.
Đổi luật trạng thái: trượt cổng kiểm lịch sử thì chuyển "loại" kể cả đang theo dõi; đã loại vẫn chấm lại mỗi lượt, qua lại cổng thì quay về theo dõi (tính lại từ đầu).
Việc còn để ngỏ: mặt nạ "chỉ coin" chuẩn từ exchangeInfo; chấm từ 2021 (LAB_START=2021-01); thêm cổng độ bền (7 phần, kẹp ±30%, trễ 1 ngày, tỉ trọng 5 mã lớn nhất) – chờ Jason quyết.
