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