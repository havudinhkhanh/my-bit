# Bot Phản Xạ – bản chạy trên máy chủ riêng

Thư mục này là bản **Bot Phản Xạ** của MyBit chạy 24/7 trên một máy chủ riêng (VPS): dùng chung bộ não với bản trên trang (`../worker/scalp_core.js`), nối thẳng Binance futures & spot, gửi trạng thái và kết quả về trang MyBit.

- `runner.mjs` – vòng chạy chính, kết nối trang MyBit, lưu trạng thái & sổ lệnh.
- `live.mjs` – đặt lệnh trên Binance (Demo hoặc tiền thật) cho 🪝 Bắt râu sập và 🧪 Short coin vừa bơm, với giới hạn an toàn cứng; từ chối khoá API có quyền rút tiền.
- `install.sh` – cài / cập nhật dịch vụ.

Mặc định chỉ chạy trên **sàn thử**. Hướng dẫn cài đặt & vận hành nằm trong tài liệu nội bộ riêng tư của chủ dự án.
