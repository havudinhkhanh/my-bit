# 🪝 Bắt râu sập – kiểm chứng lại hằng tháng

Mỗi tháng chạy lại `round6.py` (cách thoát) và `round7.py` (bộ lọc) trên toàn bộ futures USDT Binance từ 01/2025,
rồi `r7_analyze.py` + `r7_port.py` (danh mục thật: tối đa 6 lần bắt râu cùng lúc, dừng ngày khi lỗ 3%, 5%/cú sốc).
Con số quyết định là **r7_port**. Quy tắc đổi: chỉ đề xuất khi phương án mới (trong r7_port) hơn hiện tại về TỔNG lợi nhuận,
KHÔNG kém hơn ở quá 1 nửa năm, và KHÔNG làm sụt tối đa tệ hơn. Bot chỉ được đổi khi Jason quyết định.

Ghi chú mô phỏng: lệnh chờ ở 1,5× / 2× độ lớn cú sốc (bot đang 1,25× / 1,5×); "vào ngay" (hk_mk) chưa có trong r7_port;
trong 1 nến giả định giá đi xấu trước rồi mới tốt (thận trọng).

---

## 2026-11-01 (dữ liệu 2025-01-02 → 2026-09-30, 637 ngày, 918 mã)

**Thiết lập đang chạy** (worker/scalp_core.js `SCALP_DEF`): hk_z 4 · hk_r 300 · hk_v 8 · hk_d1 1,25 · hk_d2 1,5 · hk_w 8 · hk_h 60 ·
hk_stop 35 · hk_max 6 · hk_f6 6 · hk_knife 10 · hk_r15 100 **chỉ áp cho Short** (hk_r15L false) · hk_fund 50 · hk_mk on (mk15 300, mkS 2).
Thoát: giữ cố định 60 phút, không có cắt lỗ đuổi. → so với dòng "Lọc 15 phút chỉ áp cho Short" của r7_port (không phải dòng "Hiện tại" của script, dòng đó lọc 15p cả 2 chiều).

Tháng đầu tiên ghi sổ – chưa có số tháng trước để so.

**Cú sốc / lệnh**: round7 43 987 cú sốc đạt chuẩn cơ bản; qua bộ lọc của bot 2 928 lệnh (không giới hạn danh mục).
round6: 1 817 cú sốc qua bộ lọc · 2 953 lệnh (2025H1 411 · 2025H2 945 · 2026H1 947 · 2026H2 650).

**Danh mục thật (r7_port), thoát giữ 60p – thiết lập đang chạy**

| | lệnh/ngày | TB bps | thắng | TỔNG | sụt tối đa | 2025H1 | 2025H2 | 2026H1 | 2026H2 |
|---|---|---|---|---|---|---|---|---|---|
| Đang chạy (15p chỉ Short) | 3,7 | +53,2 | 62,7% | **+34,9%** | **14,1%** | −5% | +19% | +7% | +11% |
| – chỉ Long | 1,8 | +63,5 | 60,9% | +18,9% | 8,9% | −1% | +1% | +10% | +8% |
| – chỉ Short | 1,9 | +46,1 | 64,4% | +14,4% | 7,0% | −4% | +18% | −2% | +3% |
| Không giới hạn 6 lệnh / dừng ngày (tham khảo, lọc 15p 2 chiều) | 4,6 | +172,9 | 71,4% | +247,9% | 29,3% | −4% | +37% | +38% | +93% |

**Cách thoát (round6, TB bps/lệnh, Δ so với giữ 60p theo nửa năm)**
- Giữ 60p (hiện tại): +170,8 bps · thắng 71,2% · 2025H1 −48 · 2025H2 +134 · 2026H1 +135 · 2026H2 +414 · L +263 / S +44.
- Tốt nhất: **đuổi – lời ≥ 150 bps thì trả lại tối đa 100 bps** (tr150): +181,8 (Δ +10,9) · 2025H1 +72 · 2025H2 +11 · 2026H1 +31 · 2026H2 −57 · thắng 90,6% · 5% xấu nhất −852 (hiện tại −1962).
- Giữ 90p (★ hơn ở cả 4 nửa năm theo từng lệnh): +177,5 (Δ +6,7) – nhưng trong danh mục thật kém hơn (xem dưới).
- 17,5% số lệnh giống lệnh BEAT (đã lời ≥ 2% rồi đóng lỗ khi hết giờ), lỗ TB −897 bps. 88% lệnh từng lời ≥ 2%.

**Cách thoát trong danh mục thật (r7_port, thiết lập đang chạy)**

| Thoát | lệnh/ngày | TB bps | thắng | TỔNG | sụt tối đa | 2025H1 | 2025H2 | 2026H1 | 2026H2 |
|---|---|---|---|---|---|---|---|---|---|
| giữ 60p (đang chạy) | 3,7 | +53,2 | 62,7% | +34,9% | 14,1% | −5% | +19% | +7% | +11% |
| **tr150 (đuổi ≥150 trả 100)** | 3,7 | +81,3 | 88,3% | **+60,9%** | **5,0%** | +4% | +18% | +18% | +11% |
| giữ 90p | 3,7 | +53,3 | 61,2% | +33,9% | 15,0% | −3% | +26% | +4% | +5% |
| tr150 – chỉ Long | 1,8 | +106,7 | 87,7% | +35,0% | 3,4% | +2% | +7% | +17% | +6% |
| tr150 – chỉ Short | 1,9 | +58,9 | 88,8% | +19,6% | 4,4% | +1% | +11% | +2% | +5% |

**Bộ lọc khác (r7_port, giữ 60p)** – so với đang chạy +34,9% / sụt 14,1%:
- Bỏ lọc 6 giờ (15p chỉ Short): +48,4% · sụt 16,5% · −7/+8/+19/+24 → sụt tệ hơn, kém 2 nửa năm ✗
- Tối đa 20 lệnh cùng lúc: +41,7% · sụt 20,3% ✗
- Bỏ dao rơi + 15p chỉ Short: +29,7% · sụt 14,9% ✗
- Lọc 15p cả 2 chiều ("Hiện tại" của script): +26,7% · sụt 14,8% ✗
- Thêm chặn "thị trường sập" (≥ 3/5/8 coin khác sốc trong 10p) + 15p chỉ Short: +24,1% / +22,0% / +26,1% (sụt 10–13%) ✗ lời thấp hơn
- Nới dao rơi 15–20% khi thị trường không sập: +10% → +18% ✗
- Với thoát tr150: bỏ lọc 6 giờ → +85,8% · sụt 4,3% · +4/+18/+31/+15 (hơn tr150 ở mọi mặt) – bước 2, chỉ xét sau khi tr150 chạy ổn.

**Kết luận tháng này**: đề xuất thêm thoát cắt lỗ đuổi tr150 (lời ≥ 150 bps → đóng khi trả lại 100 bps từ đỉnh lời, tối đa vẫn 60p).
Đạt cả 3 điều kiện: TỔNG +60,9% vs +34,9%; chỉ kém 1 nửa năm (2025H2 +18% vs +19%); sụt tối đa 5,0% vs 14,1%.
Rủi ro: theo từng lệnh tr150 kém hơn ở 2026H2 (−57 bps/lệnh); mô phỏng nến 1 phút, thực tế khớp lệnh đuổi có thể trượt nhiều hơn 20 bps.
Bộ lọc giữ nguyên. Chưa đổi gì trên bot – chờ Jason quyết.

**2026-11-01 – ĐÃ ÁP DỤNG** (Jason đồng ý): thêm `hk_tra: 150, hk_trg: 100` (cắt lỗ đuổi) vào `SCALP_DEF` – sàn thử (worker/scalp_core.js),
tài khoản Binance Demo/thật (scalper/live.mjs, kiểm tra mỗi 2 giây theo giá giữa) và trang thiết lập (2 thanh trượt, 0 = tắt).
Khác mô phỏng: bot gộp 2 mức khớp thành 1 vị thế giá TB (đỉnh lời tính lại khi khớp thêm mức); trên tài khoản thật, đóng đuổi thì huỷ luôn mức chưa khớp.
Tháng sau so sánh với mốc này: dòng "tr150 – thiết lập đang chạy" là thiết lập hiện tại.

---

## Ghi chú cho lượt kiểm chứng tháng sau (Jason dặn 2026-11-03)

- Bảng "🧪 Bộ lọc có đúng không?" (lệnh ẢO đi theo cú sốc bị chặn) lúc 03/11: khối lượng < 8× 34 lệnh ảo TB +233 bps (lệnh thật +221);
  dao rơi 12 lệnh ảo TB +562 bps, thắng 10/12. Sai số ±1.000 bps/lệnh → **chưa phân biệt được với may rủi** → giữ nguyên cả hai bộ lọc.
- **Xem lại khi đủ mẫu**: dao rơi ≥ 50 lệnh ảo khớp, khối lượng ≥ 100 lệnh ảo khớp. Chỉ đề xuất đổi khi chênh với lệnh thật vượt 2 lần sai số chuẩn
  VÀ r7_port (danh mục thật) xác nhận theo quy tắc ở đầu tệp.
- Khối lượng: xem riêng nhóm 5×–8× (`hkv.S.vol_hi`) và < 5× (`vol_lo`). Nếu chỉ nhóm 5×–8× lời đều → bước hợp lý là hạ `hk_v` xuống ~6×, KHÔNG bỏ hẳn bộ lọc.
- Bot chỉ được đổi khi Jason quyết định.
