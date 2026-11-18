# Mèo na na – chuyển video (Google Flow) thành khung vector

1. Tách khung: `ffmpeg -i walk.mp4 full/walk/%03d.png` (mỗi clip 1 thư mục: walk, run, sit_idle, sit_to_stand, stand_to_sit, turn;
   nhóm 2: groom_paw, groom_body, stretch, sit_to_loaf (thật ra đứng→nằm), loaf_to_curl (đứng→cuộn), sleep, wake;
   nhóm 3: roll, stalk, meow, annoyed, pounce).
2. `python3 conv.py full out` (chỉ ghi lại vài clip: `ONLY=sleep,wake python3 conv.py full out`) – lọc nền trắng ra hình mèo, mắt → lỗ, vòng cổ → lớp vàng, đồ viền, đưa mọi clip về cùng cỡ
   (cỡ theo diện tích thân, lấy 2 clip chuyển dáng làm thước), cắt vòng lặp khớp đầu–cuối + biến hình mượt chỗ nối, đo tốc độ chân (upf),
   ghi tâm thân từng khung (tx) để nối clip không trượt chân.
3. `python3 bestst.py out` – khung trong vòng đi / chạy giống dáng đứng nhất (st) → bắt đầu đi từ đó.
4. `python3 preview.py out walk 12` – ảnh lưới để soát.
5. Chép `out/<clip>.json` → `site/mascot-seq-v<tên>.json` (vwalk, vrun, vsit, vs2st, vst2s, vturn · vgpaw, vgbody, vstr, vs2l, vl2c, vsleep, vwake · vroll, vstalk, vmeow, vannoy, vpounce);
   clip chuyển dáng cắt bớt khung sau điểm `b` trong `CLIP` của mascot.js (vstr cắt còn 147 khung – cuối clip mèo quay mặt nhìn thẳng).
6. Nối clip: clip máy quay đứng yên dời khung theo tâm thân (`tx`) lúc vào / ra; `ae` khớp theo mắt (nằm → đứng); `yo` phát tới–lui đoạn nằm thở để giữ dáng.

7. Mắt: không khoét theo đốm màu nữa – json ghi vị trí mắt (đã lấp chỗ mất, làm mượt) + `es` (cỡ mắt), trình duyệt vẽ mắt cùng một kiểu mỗi khung (`pe`).
