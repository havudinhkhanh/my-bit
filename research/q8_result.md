# Vòng 8 – 4 phương pháp Jason gửi (gợi ý của Gemini) · 07/11/2026

Dữ liệu thật Binance (data.binance.vision), đã tính cả coin huỷ niêm yết, trừ phí taker/maker, chênh lệch giá mua bán và trượt giá. Chi tiết: bot-status `research/research_out/quant8a.txt`, `quant8b.txt`; mã: `research/quant8.py`.

| Phương pháp | Kết quả sau phí | Kết luận |
|---|---|---|
| 1. Funding carry (mua spot + bán perp 1x) | Bản thận trọng (1–5 coin, vào khi funding 3 ngày ≥ 10%/năm, ra khi < 0): **+5–7%/năm trên tổng vốn**, sụt tối đa 0,5–1%. Giảm dần: 2024 ≈ 8–10%, 2025 ≈ 4–5%, 2026 ≈ 3,5–4,4%. Walk-forward +1–3%/năm. BTC/ETH giữ cố định +3,3%/năm (2026: ~1%). Đuổi theo funding cao (≥ 40–80%/năm) **lỗ tới −45%/năm** (coin bị ép giá, sắp huỷ niêm yết: DENT, DEGO 04/2026 – perp vọt +58% so với spot, perp ngừng giao dịch trong khi spot vẫn rơi) | Duy nhất có lãi, nhưng lãi thấp, đang giảm |
| 2. Basis coin mới niêm yết | 776 coin mới, chỉ 297 có spot Binance khớp giá; chênh lệch perp/spot trung vị **−8 bps** (perp rẻ hơn, không đắt hơn); chỉ 1% coin có chênh ≥ 0,5% lúc giờ đầu; funding 3 ngày đầu trung vị −14%/năm (bên bán khống phải trả). Bản phòng hộ: −28 đến −51 bps/lệnh, thắng 11–17% | Loại – không có chênh lệch để ăn |
| 3. Breakout + CVD + OI (5 phút, 60 coin, 2024–10/2026) | 36 biến thể đều lỗ sau phí: −9 đến −24 bps/lệnh; walk-forward −16,7 bps. Bộ lọc có giá trị thật (gộp trước phí từ −2 lên +9 bps khi CVD ≥ 0,15 và OI tăng ≥ 1%) nhưng không đủ trả phí taker ~18 bps | Loại |
| 4. Dynamic ATR Grid (20 coin lớn, maker 2 bps) | 16 biến thể đều lỗ; tốt nhất −6%/năm, sụt 37%; walk-forward −18%/năm. Lưới bị xu hướng cuốn: AIA −225%, MYX −179%, 1000SATS −85% | Loại |

Nếu làm carry: chỉ bản thận trọng – 1–5 coin, funding 3 ngày ≥ 10%/năm, ra khi < 0, không vào/thoát khi perp lệch spot > 3%, thoát trước khi huỷ niêm yết, cân lại ký quỹ khi giá chạy ±40%. Kỳ vọng hiện tại ≈ 3–5%/năm trên tổng vốn. Bot chưa đổi gì – chờ Jason quyết.
