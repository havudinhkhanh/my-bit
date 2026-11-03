# Kiểm chứng 6 phương pháp định lượng (03/11/2026)

Dữ liệu Binance USDⓈ-M futures (data.binance.vision). Phần A (P1–P4): nến 1 giờ 01/2022 → 10/2026, 100 mã/tháng theo khối lượng tháng trước, kể cả mã đã huỷ niêm yết. Phần B (P5, P6, P3b): nến 5 phút + Open Interest 5 phút 07/2025 → 10/2026, 60 mã/tháng.
Phí taker + chênh lệch + trượt 14–19 bps/vòng (+5 bps cho thác thanh lý; cặp coin trừ 2 chân) + funding thật. Nến đã đóng, vào giá mở nến kế tiếp, cùng nến chạm chốt & cắt → tính cắt.
Walk-forward: chọn biến thể tốt nhất trên 6 tháng → chạy mù 2 tháng kế tiếp, trượt dần; cửa sổ mà biến thể tốt nhất vẫn lỗ trong mẫu thì không đánh. Số dưới đây là phần NGOÀI MẪU nối lại.

| Phương pháp | Lệnh ngoài mẫu | Thắng | TB ròng bps/lệnh | gộp − phí + funding | t | Theo năm (lệnh, bps) |
|---|---|---|---|---|---|---|
| P1 · Cặp coin Ornstein-Uhlenbeck | 1744 | 57.1% | -5.7 | +9.9 − 15.8 + +0.2 | -1.02 | {'2023': [694, 1.1], '2025': [528, -3.6], '2026': [522, -16.7]} |
| P2 · Connors RSI(2) | 1564 | 60.6% | -23.7 | -0.8 − 17.3 + -5.7 | -0.66 | {'2022': [164, 124.1], '2023': [277, -66.2], '2024': [299, -89.9], '2025': [480, 80.5], '2026': [344, -148.1]} |
| P3 · Funding cực âm → Long | 7099 | 46.3% | +21.7 | -6.8 − 17.3 + +45.7 | +0.68 | {'2022': [775, 72.4], '2023': [1276, 121.2], '2024': [1794, 61.2], '2025': [2192, -50.6], '2026': [1062, -52.6]} |
| P4 · ORB + NR7 (Crabel) | 8670 | 40.3% | -27.6 | -7.6 − 19.2 + -0.8 | -2.64 | {'2022': [2163, -55.6], '2023': [514, -0.2], '2024': [120, 10.1], '2025': [3782, -26.1], '2026': [2091, -10.3]} |
| P6 · Thác thanh lý + OI xả | 46 | 41.3% | -83.3 | -62.4 − 21.0 + +0.2 | -1.33 | {'2026': [46, -83.3]} |
| P5 · VWAP ngày ± kσ + HMM + MFI | 1853 | 31.7% | -13.0 | -0.2 − 13.2 + +0.4 | -2.62 | {'2026': [1853, -13.0]} |
| P3b · Funding cực âm + OI tăng, giá không giảm | 228 | 34.2% | -383.6 | -548.2 − 16.7 + +181.3 | -2.52 | {'2026': [228, -383.6]} |

## Biến thể tốt nhất toàn giai đoạn (chỉ tham khảo – có thiên lệch chọn)

**P1 · Cặp coin Ornstein-Uhlenbeck**: fix|z2.5 6984 lệnh, thắng 57.2%, -8.4 bps; fix|z2.0 9972 lệnh, thắng 60.5%, -10.6 bps; fix|z1.5 13621 lệnh, thắng 63.7%, -10.8 bps; kal|z2.5 9283 lệnh, thắng 52.5%, -12.2 bps

**P2 · Connors RSI(2)**: H4|L|r10|kel|ema10|slNone 668 lệnh, thắng 59.4%, +35.4 bps; H1|L|r10|kel|ema10|slNone 3245 lệnh, thắng 62.3%, +29.6 bps; H1|L|r5|kel|ema10|slNone 2684 lệnh, thắng 61.9%, +27.7 bps; H4|S|r10|kel|ema10|slNone 2330 lệnh, thắng 65.0%, +26.9 bps

**P3 · Funding cực âm → Long**: h72|slNone|fall 9111 lệnh, thắng 49.7%, +65.5 bps; h72|slNone|abs 7469 lệnh, thắng 45.8%, +34.1 bps; h72|sl0.05|fall 9123 lệnh, thắng 36.8%, +24.2 bps; h24|slNone|fall 9131 lệnh, thắng 50.6%, +18.8 bps

**P4 · ORB + NR7 (Crabel)**: both|tp1.0 3425 lệnh, thắng 42.4%, -8.3 bps; both|tp0.5 3425 lệnh, thắng 44.9%, -9.5 bps; bb30|tp1.0 19618 lệnh, thắng 40.3%, -11.6 bps; nr7|tp1.0 27858 lệnh, thắng 42.7%, -14.8 bps

**P6 · Thác thanh lý + OI xả**: L|x5|oi5|h48 79 lệnh, thắng 49.4%, +5.8 bps; L|x5|oi5|h12 79 lệnh, thắng 48.1%, -5.6 bps; L|x5|oi3|h48 182 lệnh, thắng 55.5%, -8.6 bps; L|x3|oi5|h48 115 lệnh, thắng 43.5%, -12.9 bps

**P5 · VWAP ngày ± kσ + HMM + MFI**: L|k3.0|mfi 2089 lệnh, thắng 30.8%, +75.1 bps; L|k3.0|none 4647 lệnh, thắng 33.4%, +52.6 bps; L|k2.5|mfi 10578 lệnh, thắng 35.8%, +4.0 bps; L|k2.5|none 21891 lệnh, thắng 36.0%, +1.3 bps

**P3b · Funding cực âm + OI tăng, giá không giảm**: oi10|h72 320 lệnh, thắng 40.9%, +731.3 bps; oi5|h72 582 lệnh, thắng 41.9%, +476.8 bps; oi10|h24 320 lệnh, thắng 30.3%, +213.8 bps; oi5|h24 582 lệnh, thắng 33.8%, +149.9 bps

## Kết luận

Không phương pháp nào có lợi thế chắc chắn sau phí ở phần ngoài mẫu (không cái nào t ≥ 2). Funding cực âm → Long (chỉ funding, không OI) dương +21,7 bps nhưng t 0,68, lời đến từ funding nhận được trong khi giá trung bình vẫn giảm, và 2025–2026 âm. RSI2 có tỉ lệ thắng ~61% nhưng thua lớn hơn thắng; ORB + NR7 và VWAP âm rõ (t ≈ −2,6). Trong bot: sàn thử đánh cả 6 để theo dõi tiếp, tiền thật mặc định tắt.

## Tinh lọc (03/11/2026) – research/quant6r.py

```
TINH LỌC 3 phương pháp · 2022-01 → 2026-10 · 2026-11-03 10:07 UTC

==================== R1 · Cặp coin O-U – top 15, |Z| > 2,8, σ spread > 1,2%

  mặc định (fix|z2.8|s1.2|st3.5), toàn giai đoạn: 362 lệnh (78/năm) · thắng 53.0% (trước phí 54.1%) · TB ròng -25.0 bps/lệnh (gộp -10.4 − phí 14.7 + funding +0.1) · trung vị +22.6 · t -1.63 · mỗi lệnh 10% vốn ≈ -2.0%/năm, sụt 9.6% · theo năm {2022: [59, -19.5], 2023: [21, -7.6], 2024: [31, -53.3], 2025: [157, -13.5], 2026: [94, -42.2]}
  WALK-FORWARD ngoài mẫu: 160 lệnh (42/năm) · thắng 53.8% (trước phí 55.6%) · TB ròng -32.3 bps/lệnh (gộp -17.6 − phí 14.5 + funding -0.1) · trung vị +26.2 · t -1.51 · mỗi lệnh 10% vốn ≈ -1.4%/năm, sụt 7.2% · theo năm {2022: [9, 34.2], 2023: [9, -80.9], 2024: [10, -49.4], 2025: [60, -40.4], 2026: [72, -25.3]}
  10 biến thể tốt nhất (toàn giai đoạn, CHỈ để tham khảo – có thiên lệch chọn):
    kal|z3.0|s1.2|st3.5                           165 lệnh · thắng  56.4% · TB ròng    -2.6 · gộp   +12.0
    kal|z3.0|s0.8|st3.5                           286 lệnh · thắng  54.5% · TB ròng    -5.6 · gộp    +9.0
    kal|z3.0|s0.8|st4.5                           318 lệnh · thắng  60.4% · TB ròng    -6.3 · gộp    +8.3
    kal|z3.0|s1.2|st4.5                           175 lệnh · thắng  60.0% · TB ròng    -8.4 · gộp    +6.3
    kal|z3.0|s1.5|st3.5                           109 lệnh · thắng  55.0% · TB ròng    -9.1 · gộp    +5.5
    kal|z3.0|s1.5|st4.5                           109 lệnh · thắng  59.6% · TB ròng    -9.8 · gộp    +4.8
    kal|z2.8|s0.8|st4.5                           362 lệnh · thắng  58.3% · TB ròng   -10.3 · gộp    +4.3
    kal|z3.0|s0.0|st3.5                           696 lệnh · thắng  49.4% · TB ròng   -11.1 · gộp    +3.4
    kal|z2.8|s1.5|st4.5                           120 lệnh · thắng  57.5% · TB ròng   -11.3 · gộp    +3.3
    kal|z2.8|s1.2|st4.5                           198 lệnh · thắng  60.1% · TB ròng   -11.5 · gộp    +3.1
  Lựa chọn từng cửa sổ: 2025-02..2025-07 → 2025-08..2025-09: kal|z3.0|s0.8|st4.5 (-4.4, 86 lệnh) – KHÔNG ĐÁNH | 2025-04..2025-09 → 2025-10..2025-11: fix|z3.0|s0.8|st4.5 (-4.4, 86 lệnh) – KHÔNG ĐÁNH | 2025-06..2025-11 → 2025-12..2026-01: fix|z3.0|s0.8|st4.5 (24.3, 61 lệnh) | 2025-08..2026-01 → 2026-02..2026-03: kal|z3.0|s0.8|st3.5 (1.3, 37 lệnh) | 2025-10..2026-03 → 2026-04..2026-05: kal|z3.0|s0.8|st3.5 (3.9, 41 lệnh) | 2025-12..2026-05 → 2026-06..2026-07: kal|z3.0|s0.8|st3.5 (-0.1, 41 lệnh) – KHÔNG ĐÁNH | 2026-02..2026-07 → 2026-08..2026-09: kal|z3.0|s0.0|st4.5 (-10.3, 136 lệnh) – KHÔNG ĐÁNH | 2026-04..2026-09 → 2026-10: kal|z3.0|s0.0|st4.5 (-15.0, 159 lệnh) – KHÔNG ĐÁNH
  ▸ Biến thể anh đề xuất / so sánh (toàn giai đoạn · riêng 2025–2026):
    fix|z2.8|s1.2|st3.5 – toàn bộ: 362 lệnh (78/năm) · thắng 53.0% · TB ròng -25.0 bps (gộp -10.4 − phí 14.7 + funding +0.1) · trung vị +22.6 · t -1.63 · 10%/lệnh ≈ -2.0%/năm, sụt 9.6% · {2022: [59, -19.5], 2023: [21, -7.6], 2024: [31, -53.3], 2025: [157, -13.5], 2026: [94, -42.2]}
    fix|z2.8|s1.2|st3.5 – 2025–26: 251 lệnh (146/năm) · thắng 53.8% · TB ròng -24.3 bps (gộp -9.4 − phí 14.6 + funding -0.2) · trung vị +28.5 · t -1.32 · 10%/lệnh ≈ -3.5%/năm, sụt 8.4% · {2025: [157, -13.5], 2026: [94, -42.2]}
    fix|z2.8|s1.2|st4.5 – toàn bộ: 309 lệnh (67/năm) · thắng 60.8% · TB ròng -21.2 bps (gộp -6.6 − phí 14.7 + funding +0.2) · trung vị +56.2 · t -1.12 · 10%/lệnh ≈ -1.4%/năm, sụt 7.3% · {2022: [58, -21.1], 2023: [15, 5.2], 2024: [24, -59.2], 2025: [137, 3.1], 2026: [75, -58.7]}
    fix|z2.8|s1.2|st4.5 – 2025–26: 212 lệnh (123/năm) · thắng 61.8% · TB ròng -18.8 bps (gộp -3.9 − phí 14.6 + funding -0.3) · trung vị +59.8 · t -0.84 · 10%/lệnh ≈ -2.3%/năm, sụt 7.3% · {2025: [137, 3.1], 2026: [75, -58.7]}
    kal|z2.8|s1.2|st3.5 – toàn bộ: 212 lệnh (46/năm) · thắng 53.8% · TB ròng -13.5 bps (gộp +1.1 − phí 14.7 + funding +0.1) · trung vị +26.7 · t -0.93 · 10%/lệnh ≈ -0.6%/năm, sụt 5.5% · {2022: [37, 56.8], 2023: [5, -7.0], 2024: [20, -68.4], 2025: [122, -25.4], 2026: [28, -16.9]}
    kal|z2.8|s1.2|st3.5 – 2025–26: 150 lệnh (87/năm) · thắng 51.3% · TB ròng -23.8 bps (gộp -9.2 − phí 14.7 + funding +0.0) · trung vị +8.8 · t -1.33 · 10%/lệnh ≈ -2.1%/năm, sụt 3.9% · {2025: [122, -25.4], 2026: [28, -16.9]}
    kal|z2.8|s1.2|st4.5 – toàn bộ: 198 lệnh (43/năm) · thắng 60.1% · TB ròng -11.5 bps (gộp +3.1 − phí 14.8 + funding +0.2) · trung vị +56.3 · t -0.62 · 10%/lệnh ≈ -0.5%/năm, sụt 4.3% · {2022: [42, 35.6], 2023: [4, 2.6], 2024: [17, -105.3], 2025: [105, -13.0], 2026: [30, -21.3]}
    kal|z2.8|s1.2|st4.5 – 2025–26: 135 lệnh (78/năm) · thắng 57.8% · TB ròng -14.8 bps (gộp -0.1 − phí 14.7 + funding +0.0) · trung vị +41.5 · t -0.63 · 10%/lệnh ≈ -1.2%/năm, sụt 3.8% · {2025: [105, -13.0], 2026: [30, -21.3]}
    fix|z3.0|s1.2|st4.5 – toàn bộ: 246 lệnh (53/năm) · thắng 58.5% · TB ròng -16.9 bps (gộp -2.4 − phí 14.7 + funding +0.2) · trung vị +61.0 · t -0.82 · 10%/lệnh ≈ -0.9%/năm, sụt 6.0% · {2022: [50, -12.6], 2023: [13, 11.7], 2024: [20, -29.5], 2025: [102, 13.0], 2026: [61, -72.3]}
    fix|z3.0|s1.2|st4.5 – 2025–26: 163 lệnh (95/năm) · thắng 58.3% · TB ròng -18.9 bps (gộp -4.0 − phí 14.6 + funding -0.3) · trung vị +62.1 · t -0.78 · 10%/lệnh ≈ -1.8%/năm, sụt 6.0% · {2025: [102, 13.0], 2026: [61, -72.3]}
    fix|z2.0|s0.0|st3.5 – toàn bộ: 1429 lệnh (303/năm) · thắng 56.1% · TB ròng -20.2 bps (gộp -5.7 − phí 14.6 + funding +0.1) · trung vị +15.5 · t -3.21 · 10%/lệnh ≈ -6.1%/năm, sụt 29.2% · {2022: [157, -18.3], 2023: [89, -11.4], 2024: [65, -38.9], 2025: [554, -13.9], 2026: [564, -26.0]}
    fix|z2.0|s0.0|st3.5 – 2025–26: 1118 lệnh (620/năm) · thắng 56.1% · TB ròng -20.0 bps (gộp -5.5 − phí 14.5 + funding -0.0) · trung vị +13.9 · t -2.77 · 10%/lệnh ≈ -12.4%/năm, sụt 24.3% · {2025: [554, -13.9], 2026: [564, -26.0]}
    kal|z2.0|s0.0|st3.5 – toàn bộ: 2360 lệnh (498/năm) · thắng 48.0% · TB ròng -16.8 bps (gộp -2.3 − phí 14.6 + funding +0.0) · trung vị -2.3 · t -6.06 · 10%/lệnh ≈ -8.4%/năm, sụt 39.6% · {2022: [277, -20.1], 2023: [139, -15.0], 2024: [89, -36.3], 2025: [893, -12.3], 2026: [962, -18.4]}
    kal|z2.0|s0.0|st3.5 – 2025–26: 1855 lệnh (1017/năm) · thắng 46.9% · TB ròng -15.5 bps (gộp -1.0 − phí 14.5 + funding +0.0) · trung vị -3.4 · t -5.02 · 10%/lệnh ≈ -15.8%/năm, sụt 28.7% · {2025: [893, -12.3], 2026: [962, -18.4]}
    WALK-FORWARD ngoài mẫu – riêng 2025–26: 132 lệnh (118/năm) · thắng 53.8% · TB ròng -32.2 bps (gộp -17.4 − phí 14.5 + funding -0.3) · trung vị +22.2 · t -1.31 · 10%/lệnh ≈ -3.8%/năm, sụt 7.2% · {2025: [60, -40.4], 2026: [72, -25.3]}
  ▸ 8 biến thể tốt nhất RIÊNG 2025–26 (tham khảo, có thiên lệch chọn): kal|z3.0|s0.8|st3.5 204 lệnh -7.9 bps thắng 53% | kal|z3.0|s0.8|st4.5 227 lệnh -8.5 bps thắng 58% | kal|z3.0|s1.2|st3.5 116 lệnh -11.0 bps thắng 53% | kal|z3.0|s1.2|st4.5 120 lệnh -12.1 bps thắng 57% | kal|z2.8|s0.8|st4.5 258 lệnh -12.4 bps thắng 56% | kal|z3.0|s0.0|st3.5 539 lệnh -12.7 bps thắng 49% | kal|z2.8|s1.2|st4.5 135 lệnh -14.8 bps thắng 58% | kal|z3.0|s0.0|st4.5 713 lệnh -15.2 bps thắng 50%

==================== R2 · RSI(2) chỉ Long – coin lớn

  mặc định (MAJ|H1|r5|noadx|nokel|sma5|slNone), toàn giai đoạn: 3726 lệnh (786/năm) · thắng 60.4% (trước phí 66.7%) · TB ròng -2.4 bps/lệnh (gộp +12.9 − phí 14.9 + funding -0.4) · trung vị +18.7 · t -0.60 · mỗi lệnh 10% vốn ≈ -1.9%/năm, sụt 20.2% · theo năm {2022: [588, -5.3], 2023: [830, 10.5], 2024: [861, 6.0], 2025: [766, -13.4], 2026: [681, -13.8]}
  WALK-FORWARD ngoài mẫu: 526 lệnh (124/năm) · thắng 66.7% (trước phí 68.3%) · TB ròng -4.4 bps/lệnh (gộp +9.8 − phí 14.2 + funding -0.0) · trung vị +64.8 · t -0.19 · mỗi lệnh 10% vốn ≈ -0.5%/năm, sụt 12.7% · theo năm {2022: [32, 22.0], 2023: [96, 2.4], 2024: [155, -25.4], 2025: [110, -25.9], 2026: [133, 26.8]}
  10 biến thể tốt nhất (toàn giai đoạn, CHỈ để tham khảo – có thiên lệch chọn):
    T10|H1|r5|adx|kel|ema10|slNone                346 lệnh · thắng  63.3% · TB ròng   +42.9 · gộp   +56.7
    MAJ|H4|r10|adx|kel|sma5|sl2.5                  97 lệnh · thắng  61.9% · TB ròng   +38.5 · gộp   +54.1
    T10|H1|r10|adx|kel|ema10|slNone               400 lệnh · thắng  62.0% · TB ròng   +34.3 · gộp   +48.2
    MAJ|H4|r10|adx|kel|sma5|slNone                 97 lệnh · thắng  61.9% · TB ròng   +33.4 · gộp   +48.9
    MAJ|H1|r5|noadx|kel|ema10|slNone              490 lệnh · thắng  62.2% · TB ròng   +27.7 · gộp   +43.1
    T10|H4|r10|adx|kel|ema10|slNone               101 lệnh · thắng  55.4% · TB ròng   +26.8 · gộp   +41.2
    MAJ|H1|r10|noadx|kel|ema10|slNone             583 lệnh · thắng  62.1% · TB ròng   +24.5 · gộp   +39.9
    MAJ|H1|r5|adx|kel|ema10|slNone                384 lệnh · thắng  60.9% · TB ròng   +23.1 · gộp   +38.5
    T10|H1|r5|adx|kel|sma5|slNone                 350 lệnh · thắng  62.3% · TB ròng   +20.9 · gộp   +35.1
    T10|H1|r10|adx|kel|sma5|slNone                412 lệnh · thắng  62.1% · TB ròng   +20.0 · gộp   +34.2
  Lựa chọn từng cửa sổ: 2025-02..2025-07 → 2025-08..2025-09: T10|H4|r5|adx|nokel|ema10|slNone (90.9, 69 lệnh) | 2025-04..2025-09 → 2025-10..2025-11: T10|H1|r5|noadx|kel|ema10|slNone (34.2, 62 lệnh) | 2025-06..2025-11 → 2025-12..2026-01: T10|H1|r5|noadx|kel|ema10|slNone (22.0, 51 lệnh) | 2025-08..2026-01 → 2026-02..2026-03: T10|H1|r5|noadx|kel|ema10|slNone (70.9, 46 lệnh) | 2025-10..2026-03 → 2026-04..2026-05: T10|H1|r5|noadx|kel|ema10|slNone (87.4, 39 lệnh) | 2025-12..2026-05 → 2026-06..2026-07: T10|H1|r5|noadx|kel|ema10|slNone (21.3, 55 lệnh) | 2026-02..2026-07 → 2026-08..2026-09: T10|H4|r5|noadx|nokel|ema10|slNone (28.9, 67 lệnh) | 2026-04..2026-09 → 2026-10: T10|H4|r5|noadx|nokel|ema10|slNone (63.1, 113 lệnh)
  ▸ Biến thể anh đề xuất / so sánh (toàn giai đoạn · riêng 2025–2026):
    MAJ|H1|r5|noadx|nokel|sma5|slNone – toàn bộ: 3726 lệnh (786/năm) · thắng 60.4% · TB ròng -2.4 bps (gộp +12.9 − phí 14.9 + funding -0.4) · trung vị +18.7 · t -0.60 · 10%/lệnh ≈ -1.9%/năm, sụt 20.2% · {2022: [588, -5.3], 2023: [830, 10.5], 2024: [861, 6.0], 2025: [766, -13.4], 2026: [681, -13.8]}
    MAJ|H1|r5|noadx|nokel|sma5|slNone – 2025–26: 1447 lệnh (794/năm) · thắng 57.2% · TB ròng -13.6 bps (gộp +1.5 − phí 14.9 + funding -0.2) · trung vị +11.8 · t -2.06 · 10%/lệnh ≈ -10.8%/năm, sụt 20.0% · {2025: [766, -13.4], 2026: [681, -13.8]}
    MAJ|H4|r5|noadx|nokel|sma5|slNone – toàn bộ: 920 lệnh (197/năm) · thắng 59.9% · TB ròng -6.8 bps (gộp +9.1 − phí 14.9 + funding -1.0) · trung vị +40.1 · t -0.37 · 10%/lệnh ≈ -1.3%/năm, sụt 15.1% · {2022: [115, -90.7], 2023: [231, 22.3], 2024: [241, 26.0], 2025: [192, -16.7], 2026: [141, -28.9]}
    MAJ|H4|r5|noadx|nokel|sma5|slNone – 2025–26: 333 lệnh (188/năm) · thắng 58.9% · TB ròng -21.9 bps (gộp -6.7 − phí 14.9 + funding -0.3) · trung vị +33.5 · t -0.81 · 10%/lệnh ≈ -4.1%/năm, sụt 7.8% · {2025: [192, -16.7], 2026: [141, -28.9]}
    MAJ|H1|r5|adx|kel|sma5|slNone – toàn bộ: 390 lệnh (84/năm) · thắng 61.8% · TB ròng +11.5 bps (gộp +26.7 − phí 14.9 + funding -0.3) · trung vị +30.7 · t +1.00 · 10%/lệnh ≈ +1.0%/năm, sụt 2.5% · {2022: [61, 1.2], 2023: [65, 53.1], 2024: [93, 27.2], 2025: [100, -4.2], 2026: [71, -16.1]}
    MAJ|H1|r5|adx|kel|sma5|slNone – 2025–26: 171 lệnh (98/năm) · thắng 56.1% · TB ròng -9.1 bps (gộp +5.9 − phí 14.9 + funding -0.1) · trung vị +21.3 · t -0.46 · 10%/lệnh ≈ -0.9%/năm, sụt 2.5% · {2025: [100, -4.2], 2026: [71, -16.1]}
    MAJ|H1|r5|noadx|nokel|ema10|slNone – toàn bộ: 3541 lệnh (747/năm) · thắng 64.7% · TB ròng +2.8 bps (gộp +18.2 − phí 14.9 + funding -0.5) · trung vị +31.6 · t +0.54 · 10%/lệnh ≈ +2.1%/năm, sụt 22.7% · {2022: [562, 1.2], 2023: [800, 20.2], 2024: [820, 16.3], 2025: [729, -15.2], 2026: [630, -14.7]}
    MAJ|H1|r5|noadx|nokel|ema10|slNone – 2025–26: 1359 lệnh (746/năm) · thắng 62.1% · TB ròng -15.0 bps (gộp +0.2 − phí 14.9 + funding -0.2) · trung vị +24.5 · t -1.74 · 10%/lệnh ≈ -11.2%/năm, sụt 22.7% · {2025: [729, -15.2], 2026: [630, -14.7]}
    MAJ|H1|r5|noadx|nokel|sma5|sl2.5 – toàn bộ: 3772 lệnh (796/năm) · thắng 60.2% · TB ròng -4.7 bps (gộp +10.6 − phí 14.9 + funding -0.3) · trung vị +18.7 · t -1.24 · 10%/lệnh ≈ -3.7%/năm, sụt 21.3% · {2022: [592, -8.5], 2023: [842, 6.5], 2024: [876, -1.9], 2025: [772, -8.4], 2026: [690, -14.5]}
    MAJ|H1|r5|noadx|nokel|sma5|sl2.5 – 2025–26: 1462 lệnh (803/năm) · thắng 57.0% · TB ròng -11.3 bps (gộp +3.8 − phí 14.9 + funding -0.2) · trung vị +11.8 · t -2.08 · 10%/lệnh ≈ -9.1%/năm, sụt 17.1% · {2025: [772, -8.4], 2026: [690, -14.5]}
    T10|H1|r5|noadx|nokel|sma5|slNone – toàn bộ: 3527 lệnh (743/năm) · thắng 61.2% · TB ròng -0.2 bps (gộp +13.7 − phí 14.0 + funding +0.1) · trung vị +20.9 · t -0.03 · 10%/lệnh ≈ -0.1%/năm, sụt 21.1% · {2022: [580, 4.4], 2023: [770, 13.6], 2024: [807, 8.1], 2025: [689, -19.3], 2026: [681, -10.1]}
    T10|H1|r5|noadx|nokel|sma5|slNone – 2025–26: 1370 lệnh (748/năm) · thắng 56.6% · TB ròng -14.7 bps (gộp -1.5 − phí 14.0 + funding +0.8) · trung vị +9.6 · t -2.00 · 10%/lệnh ≈ -11.0%/năm, sụt 21.1% · {2025: [689, -19.3], 2026: [681, -10.1]}
    T10|H4|r5|noadx|nokel|sma5|slNone – toàn bộ: 943 lệnh (199/năm) · thắng 60.4% · TB ròng -4.2 bps (gộp +8.1 − phí 14.0 + funding +1.7) · trung vị +46.2 · t -0.23 · 10%/lệnh ≈ -0.8%/năm, sụt 17.8% · {2022: [121, -110.4], 2023: [235, 34.9], 2024: [240, 20.0], 2025: [190, 0.8], 2026: [157, -24.2]}
    T10|H4|r5|noadx|nokel|sma5|slNone – 2025–26: 347 lệnh (191/năm) · thắng 57.3% · TB ròng -10.5 bps (gộp -2.1 − phí 14.0 + funding +5.6) · trung vị +32.9 · t -0.34 · 10%/lệnh ≈ -2.0%/năm, sụt 11.1% · {2025: [190, 0.8], 2026: [157, -24.2]}
    WALK-FORWARD ngoài mẫu – riêng 2025–26: 243 lệnh (134/năm) · thắng 62.6% · TB ròng +2.9 bps (gộp +16.7 − phí 14.0 + funding +0.2) · trung vị +49.4 · t +0.09 · 10%/lệnh ≈ +0.4%/năm, sụt 7.6% · {2025: [110, -25.9], 2026: [133, 26.8]}
  ▸ 8 biến thể tốt nhất RIÊNG 2025–26 (tham khảo, có thiên lệch chọn): MAJ|H4|r10|noadx|kel|ema10|slNone 39 lệnh +45.9 bps thắng 56% | MAJ|H4|r10|adx|kel|ema10|slNone 31 lệnh +37.3 bps thắng 55% | T10|H1|r5|adx|kel|ema10|slNone 159 lệnh +21.8 bps thắng 58% | T10|H1|r5|noadx|kel|ema10|slNone 219 lệnh +16.9 bps thắng 59% | MAJ|H1|r5|noadx|kel|ema10|sl2.5 215 lệnh +12.3 bps thắng 59% | MAJ|H4|r5|noadx|kel|ema10|slNone 32 lệnh +11.3 bps thắng 50% | T10|H1|r10|adx|kel|ema10|slNone 175 lệnh +8.6 bps thắng 55% | T10|H4|r5|noadx|nokel|ema10|sl2.5 337 lệnh +7.9 bps thắng 62%

==================== R3 · Funding cực âm → Long + giá trên SMA20 H4

  mặc định (h24|slNone|sma20), toàn giai đoạn: 5199 lệnh (1110/năm) · thắng 42.8% (trước phí 42.5%) · TB ròng +4.4 bps/lệnh (gộp -21.1 − phí 17.4 + funding +42.9) · trung vị -82.3 · t +0.20 · mỗi lệnh 10% vốn ≈ +4.9%/năm, sụt 90.1% · theo năm {2022: [777, 0.8], 2023: [950, 42.5], 2024: [1239, -35.2], 2025: [1467, 46.0], 2026: [766, -55.0]}
  WALK-FORWARD ngoài mẫu: 7815 lệnh (1844/năm) · thắng 44.8% (trước phí 44.5%) · TB ròng +17.9 bps/lệnh (gộp -10.6 − phí 17.3 + funding +45.8) · trung vị -81.5 · t +0.54 · mỗi lệnh 10% vốn ≈ +33.0%/năm, sụt 317.0% · theo năm {2022: [387, -71.7], 2023: [1819, 144.4], 2024: [2718, 47.4], 2025: [2361, -95.7], 2026: [530, 4.0]}
  10 biến thể tốt nhất (toàn giai đoạn, CHỈ để tham khảo – có thiên lệch chọn):
    h72|slNone|none                             16581 lệnh · thắng  48.0% · TB ròng   +51.4 · gộp   +21.7
    h72|slNone|sma20                             5197 lệnh · thắng  43.3% · TB ròng   +36.8 · gộp   -34.8
    h72|slNone|abs                               7468 lệnh · thắng  45.8% · TB ròng   +34.2 · gộp    -8.7
    h72|sl0.05|sma20                             5201 lệnh · thắng  32.0% · TB ròng   +32.0 · gộp   -39.6
    h72|slNone|sma20+abs                         3732 lệnh · thắng  42.6% · TB ròng   +31.7 · gộp   -44.0
    h72|sl0.05|sma20+abs                         3736 lệnh · thắng  31.7% · TB ròng   +30.2 · gộp   -45.4
    h72|sl0.05|none                             16603 lệnh · thắng  35.4% · TB ròng   +17.5 · gộp   -12.3
    h24|sl0.05|sma20                             5201 lệnh · thắng  38.0% · TB ròng   +12.6 · gộp   -12.9
    h24|slNone|none                             16615 lệnh · thắng  47.8% · TB ròng    +9.8 · gộp    +4.6
    h72|sl0.05|abs                               7478 lệnh · thắng  33.7% · TB ròng    +9.3 · gộp   -33.5
  Lựa chọn từng cửa sổ: 2025-02..2025-07 → 2025-08..2025-09: h72|sl0.05|sma20 (4.2, 780 lệnh) | 2025-04..2025-09 → 2025-10..2025-11: h72|slNone|sma20+abs (319.2, 396 lệnh) | 2025-06..2025-11 → 2025-12..2026-01: h72|slNone|sma20+abs (178.5, 477 lệnh) | 2025-08..2026-01 → 2026-02..2026-03: h72|slNone|sma20+abs (191.6, 497 lệnh) | 2025-10..2026-03 → 2026-04..2026-05: h24|sl0.05|sma20+abs (117.1, 525 lệnh) | 2025-12..2026-05 → 2026-06..2026-07: h72|sl0.05|sma20+abs (179.6, 380 lệnh) | 2026-02..2026-07 → 2026-08..2026-09: h72|sl0.05|sma20+abs (89.5, 339 lệnh) | 2026-04..2026-09 → 2026-10: h72|sl0.05|sma20 (183.3, 371 lệnh)
  ▸ Biến thể anh đề xuất / so sánh (toàn giai đoạn · riêng 2025–2026):
    h24|slNone|sma20 – toàn bộ: 5199 lệnh (1110/năm) · thắng 42.8% · TB ròng +4.4 bps (gộp -21.1 − phí 17.4 + funding +42.9) · trung vị -82.3 · t +0.20 · 10%/lệnh ≈ +4.9%/năm, sụt 90.1% · {2022: [777, 0.8], 2023: [950, 42.5], 2024: [1239, -35.2], 2025: [1467, 46.0], 2026: [766, -55.0]}
    h24|slNone|sma20 – 2025–26: 2233 lệnh (1228/năm) · thắng 41.8% · TB ròng +11.4 bps (gộp -50.5 − phí 17.4 + funding +79.3) · trung vị -103.7 · t +0.28 · 10%/lệnh ≈ +14.0%/năm, sụt 59.5% · {2025: [1467, 46.0], 2026: [766, -55.0]}
    h72|slNone|sma20 – toàn bộ: 5197 lệnh (1109/năm) · thắng 43.3% · TB ròng +36.8 bps (gộp -34.8 − phí 17.4 + funding +89.0) · trung vị -121.4 · t +1.11 · 10%/lệnh ≈ +40.8%/năm, sụt 197.8% · {2022: [773, 16.9], 2023: [950, 174.6], 2024: [1239, 19.1], 2025: [1467, 33.6], 2026: [768, -78.8]}
    h72|slNone|sma20 – 2025–26: 2235 lệnh (1229/năm) · thắng 40.3% · TB ròng -5.0 bps (gộp -151.1 − phí 17.4 + funding +163.5) · trung vị -206.6 · t -0.09 · 10%/lệnh ≈ -6.2%/năm, sụt 162.4% · {2025: [1467, 33.6], 2026: [768, -78.8]}
    h8|slNone|sma20 – toàn bộ: 5202 lệnh (1110/năm) · thắng 43.1% · TB ròng -0.6 bps (gộp -1.0 − phí 17.4 + funding +17.8) · trung vị -40.3 · t -0.05 · 10%/lệnh ≈ -0.6%/năm, sụt 54.8% · {2022: [778, 8.8], 2023: [950, 21.7], 2024: [1239, -16.7], 2025: [1467, 1.8], 2026: [768, -16.0]}
    h8|slNone|sma20 – 2025–26: 2235 lệnh (1229/năm) · thắng 42.4% · TB ròng -4.3 bps (gộp -20.4 − phí 17.4 + funding +33.5) · trung vị -48.5 · t -0.23 · 10%/lệnh ≈ -5.3%/năm, sụt 39.8% · {2025: [1467, 1.8], 2026: [768, -16.0]}
    h24|sl0.05|sma20 – toàn bộ: 5201 lệnh (1110/năm) · thắng 38.0% · TB ròng +12.6 bps (gộp -12.9 − phí 17.4 + funding +43.0) · trung vị -163.1 · t +0.71 · 10%/lệnh ≈ +14.0%/năm, sụt 83.3% · {2022: [777, -4.9], 2023: [950, 37.8], 2024: [1239, -43.3], 2025: [1467, 31.4], 2026: [768, 53.8]}
    h24|sl0.05|sma20 – 2025–26: 2235 lệnh (1229/năm) · thắng 36.6% · TB ròng +39.1 bps (gộp -22.8 − phí 17.4 + funding +79.3) · trung vị -191.4 · t +1.32 · 10%/lệnh ≈ +48.0%/năm, sụt 41.7% · {2025: [1467, 31.4], 2026: [768, 53.8]}
    h24|slNone|sma20+abs – toàn bộ: 3735 lệnh (798/năm) · thắng 41.6% · TB ròng -7.5 bps (gộp -35.8 − phí 17.5 + funding +45.8) · trung vị -98.6 · t -0.29 · 10%/lệnh ≈ -6.0%/năm, sụt 95.1% · {2022: [606, -38.6], 2023: [707, 27.5], 2024: [892, -56.7], 2025: [1025, 54.5], 2026: [505, -58.3]}
    h24|slNone|sma20+abs – 2025–26: 1530 lệnh (842/năm) · thắng 41.4% · TB ròng +17.3 bps (gộp -54.3 − phí 17.5 + funding +89.2) · trung vị -118.6 · t +0.34 · 10%/lệnh ≈ +14.6%/năm, sụt 48.8% · {2025: [1025, 54.5], 2026: [505, -58.3]}
    h24|slNone|none – toàn bộ: 16615 lệnh (3537/năm) · thắng 47.8% · TB ròng +9.8 bps (gộp +4.6 − phí 17.3 + funding +22.4) · trung vị -23.3 · t +0.52 · 10%/lệnh ≈ +34.5%/năm, sụt 147.5% · {2022: [3154, 11.0], 2023: [2498, 40.9], 2024: [3583, 11.4], 2025: [4797, 9.1], 2026: [2583, -22.9]}
    h24|slNone|none – 2025–26: 7380 lệnh (4028/năm) · thắng 45.6% · TB ròng -2.1 bps (gộp -23.8 − phí 17.3 + funding +39.0) · trung vị -43.8 · t -0.09 · 10%/lệnh ≈ -8.5%/năm, sụt 112.0% · {2025: [4797, 9.1], 2026: [2583, -22.9]}
    h72|slNone|abs – toàn bộ: 7468 lệnh (1590/năm) · thắng 45.8% · TB ròng +34.2 bps (gộp -8.7 − phí 17.3 + funding +60.2) · trung vị -61.1 · t +1.16 · 10%/lệnh ≈ +54.4%/năm, sụt 212.3% · {2022: [1348, -34.0], 2023: [1235, 150.3], 2024: [1794, 64.8], 2025: [2090, -6.0], 2026: [1001, 12.1]}
    h72|slNone|abs – 2025–26: 3091 lệnh (1688/năm) · thắng 43.4% · TB ròng -0.2 bps (gộp -99.5 − phí 17.4 + funding +116.7) · trung vị -127.2 · t -0.00 · 10%/lệnh ≈ -0.3%/năm, sụt 212.3% · {2025: [2090, -6.0], 2026: [1001, 12.1]}
    WALK-FORWARD ngoài mẫu – riêng 2025–26: 2891 lệnh (1589/năm) · thắng 38.8% · TB ròng -77.4 bps (gộp -151.6 − phí 17.4 + funding +91.6) · trung vị -227.5 · t -1.50 · 10%/lệnh ≈ -123.0%/năm, sụt 317.0% · {2025: [2361, -95.7], 2026: [530, 4.0]}
  ▸ 8 biến thể tốt nhất RIÊNG 2025–26 (tham khảo, có thiên lệch chọn): h72|sl0.05|sma20+abs 1531 lệnh +80.3 bps thắng 32% | h72|sl0.05|sma20 2235 lệnh +58.4 bps thắng 31% | h24|sl0.05|sma20+abs 1531 lệnh +54.2 bps thắng 36% | h24|sl0.05|sma20 2235 lệnh +39.1 bps thắng 37% | h72|slNone|sma20+abs 1531 lệnh +26.9 bps thắng 40% | h72|sl0.05|abs 3091 lệnh +25.8 bps thắng 34% | h8|sl0.05|sma20+abs 1531 lệnh +18.8 bps thắng 40% | h24|sl0.05|abs 3094 lệnh +18.0 bps thắng 39%
```
