# Vòng 18 – khớp lệnh theo từng giao dịch thật ở 12 ngày sập lớn (giờ VN)

Ngày: 2026-08-22, 2025-11-21, 2026-01-19, 2025-09-22, 2025-11-03, 2025-08-14, 2026-05-18, 2026-09-10, 2026-02-06, 2025-02-03, 2025-10-10, 2025-10-11

2030 cú sốc qua lọc trong các ngày này · 1686 'cả nhóm' · cần dữ liệu giao dịch 1278 · đã chạy theo giao dịch 1278 (thiếu 0)

Kiểm dựng lại giá từ nến: 2030/2030 cú sốc ra đúng kết quả mô hình nến của vòng 17.

## 1. Từng chân lệnh chờ (1,25× và 1,5×) – mô hình nến vs giao dịch thật

| Cách khớp | Nhóm | Số chân khớp | Lời TB/chân (bps) | Trung vị | Tỷ lệ lời | Chân lỗ ≤ −300 |
|---|---|---|---|---|---|---|
| nến 1 phút (vòng 17) | cả nhóm sập | 1141 | +357 | +362 | 96% | 36 |
| nến 1 phút (vòng 17) | sập một mình | 54 | +90 | +198 | 89% | 6 |
| xuyên L · trượt 0 | cả nhóm sập | 1153 | +99 | +113 | 80% | 34 |
| xuyên L · trượt 0 | sập một mình | 56 | -19 | +99 | 82% | 6 |
| xuyên L · trượt 20 | cả nhóm sập | 1153 | +79 | +93 | 77% | 36 |
| xuyên L · trượt 20 | sập một mình | 56 | -39 | +79 | 80% | 6 |
| xuyên L · trượt 50 | cả nhóm sập | 1153 | +49 | +63 | 70% | 41 |
| xuyên L · trượt 50 | sập một mình | 56 | -69 | +49 | 68% | 6 |
| xuyên 5 bps · trượt 20 | cả nhóm sập | 1141 | +76 | +92 | 76% | 37 |
| xuyên 5 bps · trượt 20 | sập một mình | 54 | -44 | +79 | 80% | 6 |
| xuyên L · trượt 20 · đặt trễ 10 giây | cả nhóm sập | 1145 | +75 | +91 | 77% | 38 |
| xuyên L · trượt 20 · đặt trễ 10 giây | sập một mình | 54 | -38 | +79 | 85% | 6 |

Cùng chân, khớp cả hai cách (1195 chân): giao dịch thật (xuyên L · trượt 20) − nến = TB -273 bps · trung vị -238 · 10% tệ nhất ≤ -737
95% chân thoát < 5 phút sau khớp (trung vị 6 giây) do luật đuổi 150/100 trên giá từng giao dịch.

## 2. Danh mục cả giai đoạn (thay 12 ngày bằng kết quả theo giao dịch) – trung vị 20 lần (tệ nhất)

| Dữ liệu các ngày sập | Cách | Lợi nhuận | Sụt tối đa | Ngày tệ | Sharpe | Lời/lỗ cộng 12 ngày (điểm %) |
|---|---|---|---|---|---|---|
| nến 1 phút | HIỆN TẠI | +145% (+138%) | 9.4% | -3.3% (-3.3%) | 3.36 | +13.1 |
| nến 1 phút | ×1,5 khi cả nhóm sập | +173% (+159%) | 9.4% | -3.3% (-4.2%) | 3.54 | +19.2 |
| nến 1 phút | ×1,5 có chặn | +146% (+138%) | 9.4% | -3.3% (-3.3%) | 3.40 | +11.1 |
| nến 1 phút | ×2 khi cả nhóm sập | +203% (+185%) | 9.4% | -3.7% (-5.5%) | 3.60 | +24.9 |
| xuyên L · trượt 0 | HIỆN TẠI | +115% | 9.4% | -3.3% | 2.94 | +0.0 |
| xuyên L · trượt 0 | ×1,5 | +126% | 9.4% | -4.0% | 3.01 | +0.0 |
| xuyên L · trượt 0 | ×2 | +138% | 9.4% | -5.3% | 3.06 | +0.5 |
| xuyên L · trượt 20 | HIỆN TẠI | +111% | 9.4% | -3.3% | 2.87 | -1.8 |
| xuyên L · trượt 20 | ×1,5 | +120% | 9.4% | -4.2% | 2.91 | -2.5 |
| xuyên L · trượt 20 | ×1,5 có chặn | +114% | 9.4% | -3.3% | 2.90 | -2.3 |
| xuyên L · trượt 20 | ×2 | +131% | 9.4% | -5.6% | 2.95 | -2.7 |
| xuyên L · trượt 50 | HIỆN TẠI | +104% | 9.4% | -3.3% | 2.73 | -5.0 |
| xuyên L · trượt 50 | ×1,5 | +112% | 9.4% | -4.6% | 2.76 | -6.3 |
| xuyên L · trượt 50 | ×2 | +120% | 9.4% | -6.1% | 2.76 | -7.5 |

Phần lợi thêm so với HIỆN TẠI: nến ×1,5 +29 / có chặn +1 / ×2 +59 · thật trượt 20: ×1,5 +9 / có chặn +3 / ×2 +20.

## 3. Từng ngày (HIỆN TẠI, seed 0): nến → thật trượt 20
2026-08-22 +0.36 → -0.29 · 2025-11-21 +1.65 → +0.03 · 2026-01-19 +1.99 → -0.91 · 2025-09-22 +1.90 → +0.50 · 2025-11-03 +1.75 → +0.56 · 2025-08-14 +1.23 → +0.37 · 2026-05-18 +1.22 → -0.59 · 2026-09-10 +2.14 → +0.09 · 2026-02-06 +1.03 → +0.72 · 2025-02-03 -0.36 → -0.30 · 2025-10-10 +0.42 → +0.40 · 2025-10-11 -1.16 → -2.44
