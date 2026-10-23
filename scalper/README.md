# Bot lướt giây MyBit trên máy chủ riêng

Bản này chạy cùng bộ não với bot lướt giây trên trang MyBit, nhưng đặt trên một máy chủ thuê riêng (VPS) để:

- **Nối thẳng Binance futures và Binance spot.** Binance đang chặn máy chủ Cloudflare (lỗi 403), nên bản Cloudflare phải dùng dữ liệu Bybit hoặc OKX.
- **Chạy liên tục 24/7, không giới hạn số tin nhắn.** Gói Cloudflare miễn phí hết hạn mức sau khoảng nửa giờ quét toàn thị trường.

Bot vẫn chỉ đánh trên **sàn thử**. Máy chủ không giữ khoá Binance nào và không đặt lệnh thật. Nó chỉ đọc dữ liệu thị trường công khai, rồi gửi trạng thái về trang MyBit. Anh vẫn xem và chỉnh bot ở trang **Bot → Bot lướt giây** như bình thường.

## 1. Thuê máy chủ (khoảng 5–6 USD/tháng)

- **Nhà cung cấp:** chọn một trong AWS Lightsail, Vultr, DigitalOcean hoặc Linode.
- **Vùng:** **Tokyo** (gần máy chủ khớp lệnh của Binance nhất) hoặc **Singapore**.
- **Hệ điều hành:** Ubuntu 24.04 (hoặc 22.04).
- **Cấu hình:** gói nhỏ nhất có **1 GB RAM** là đủ.
- **Không dùng máy chủ ở Mỹ.** Binance chặn địa chỉ IP của Mỹ.

## 2. Tạo khoá trên trang MyBit

1. Mở **Bot lướt giây → Thiết lập → Nơi chạy**.
2. Chọn **Máy chủ riêng (VPS)**.
3. Bấm **🔑 Tạo khoá máy chủ riêng**, rồi bấm **📋 Chép**.
   - Khoá chỉ hiện **một lần**. Trang chỉ lưu mã băm của khoá, không lưu khoá thật.
4. Bấm **💾 Lưu**.

Từ lúc này bản Cloudflare tự dừng, để tránh hai nơi cùng chạy.

## 3. Cài lên máy chủ: một lệnh

Mở cửa sổ dòng lệnh của máy chủ. Hầu hết nhà cung cấp có nút **Console / Connect** ngay trên web. Dán lệnh sau:

```bash
curl -fsSL https://raw.githubusercontent.com/havudinhkhanh/my-bit/main/scalper/install.sh | sudo bash
```

Chương trình cài sẽ làm lần lượt:

1. Cài Node.js 22 và git.
2. Tải mã MyBit về `/opt/my-bit`.
3. Hỏi khoá: anh **dán dòng `MYBIT_SCALP_KEY=...`** vừa chép rồi bấm Enter.
4. Thử kết nối Binance. Cả hai dòng phải ra **200**.
   - Nếu ra **451** hoặc **403**, Binance đang chặn vùng này. Anh hãy tạo máy ở vùng khác.
5. Tạo dịch vụ tự chạy. Dịch vụ tự khởi động lại khi máy khởi động hoặc khi gặp lỗi.

Khoảng 1 phút sau, trang MyBit sẽ hiện **● Đang chạy · Chạy ở: máy chủ riêng**.

## 4. Các lệnh hay dùng

| Việc | Lệnh |
|---|---|
| Xem nhật ký trực tiếp | `journalctl -u mybit-scalper -f` |
| Xem tình trạng | `systemctl status mybit-scalper` |
| Cập nhật bản mới nhất | `sudo bash /opt/my-bit/scalper/install.sh` |
| Khởi động lại | `sudo systemctl restart mybit-scalper` |
| Dừng hẳn | `sudo systemctl disable --now mybit-scalper` |
| Đổi khoá (sau khi tạo khoá mới trên trang) | `curl -fsSL https://raw.githubusercontent.com/havudinhkhanh/my-bit/main/scalper/install.sh \| sudo bash -s -- --key` |

Bộ học và tài khoản sàn thử của máy chủ được lưu ở `/opt/my-bit/scalper/data/state.json`, nên khởi động lại không bị mất.

## 5. An toàn

- Khoá chỉ có hai quyền: đọc thiết lập bot lướt giây và ghi trạng thái bot lướt giây của chính anh. Nó không đọc hay ghi được dữ liệu nào khác.
- Mất khoá thì anh chỉ cần tạo khoá mới trên trang, khoá cũ hết hiệu lực ngay.
- Tệp `.env` chỉ người dùng hệ thống `mybit` đọc được (quyền 600). Dịch vụ chạy với quyền tối thiểu: không ghi được ra ngoài thư mục `data`.
- Muốn quay về chạy trên Cloudflare: chọn lại **Cloudflare** ở mục **Nơi chạy** rồi Lưu. Máy chủ sẽ tự đứng chờ.
