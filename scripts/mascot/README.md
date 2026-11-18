# Mèo na na – chuyển video (Google Flow) thành khung vector

1. Tách khung: `ffmpeg -i walk.mp4 full/walk/%03d.png` (mỗi clip 1 thư mục: walk, run, sit_idle, sit_to_stand, stand_to_sit, turn).
2. `python3 conv.py full out` – lọc nền trắng ra hình mèo, mắt → lỗ, vòng cổ → lớp vàng, đồ viền, đưa mọi clip về cùng cỡ
   (cỡ theo diện tích thân, lấy 2 clip chuyển dáng làm thước), cắt vòng lặp khớp đầu–cuối + biến hình mượt chỗ nối, đo tốc độ chân (upf),
   ghi tâm thân từng khung (tx) để nối clip không trượt chân.
3. `python3 bestst.py out` – khung trong vòng đi / chạy giống dáng đứng nhất (st) → bắt đầu đi từ đó.
4. `python3 preview.py out walk 12` – ảnh lưới để soát.
5. Chép `out/<clip>.json` → `site/mascot-seq-v<tên>.json` (vwalk, vrun, vsit, vs2st, vst2s, vturn); clip chuyển dáng cắt bớt khung sau điểm `b` trong `CLIP` của mascot.js.
