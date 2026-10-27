# Bot lướt giây MyBit trên máy chủ riêng

Bản này chạy cùng bộ não với bot lướt giây trên trang MyBit, nhưng đặt trên một máy chủ thuê riêng (VPS) để:

- **Nối thẳng Binance futures và Binance spot.** Binance đang chặn máy chủ Cloudflare (lỗi 403), nên bản Cloudflare phải dùng dữ liệu Bybit hoặc OKX.
- **Chạy liên tục 24/7, không giới hạn số tin nhắn.** Gói Cloudflare miễn phí hết hạn mức sau khoảng nửa giờ quét toàn thị trường.

Mặc định bot chỉ đánh trên **sàn thử**. Muốn phương pháp 🪝 Bắt râu sập đặt lệnh thật trên Binance, xem mục 6. Nó chỉ đọc dữ liệu thị trường công khai, rồi gửi trạng thái về trang MyBit. Anh vẫn xem và chỉnh bot ở trang **Bot → Bot lướt giây** như bình thường.

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

**Bộ nhớ học dùng chung:** khoảng 10 phút một lần, bot gửi bộ nhớ học lên MyBit. Bản lưu này phục vụ ba việc:

- **Máy chủ mới hoặc cài lại:** bot nạp lại kiến thức cũ, không phải học lại từ đầu.
- **Bot giao dịch thật sau này:** cũng dùng được bản lưu này.
- **Sao lưu:** trên trang có nút **⬇ Tải bộ nhớ học** để anh tự giữ một bản.

Nút **Làm lại tài khoản** chỉ xoá lịch sử lệnh và giữ nguyên kiến thức. Muốn bot học lại từ đầu thì bấm **🧹 Xoá bộ nhớ học**.

## 5. An toàn

- Khoá chỉ có hai quyền: đọc thiết lập bot lướt giây và ghi trạng thái bot lướt giây của chính anh. Nó không đọc hay ghi được dữ liệu nào khác.
- Mất khoá thì anh chỉ cần tạo khoá mới trên trang, khoá cũ hết hiệu lực ngay.
- Tệp `.env` chỉ người dùng hệ thống `mybit` đọc được (quyền 600). Dịch vụ chạy với quyền tối thiểu: không ghi được ra ngoài thư mục `data`.
- Muốn quay về chạy trên Cloudflare: chọn lại **Cloudflare** ở mục **Nơi chạy** rồi Lưu. Máy chủ sẽ tự đứng chờ.

## 6. Nối tài khoản Binance (chỉ phương pháp 🪝 Bắt râu sập)

Nên chạy trên **Binance Demo Trading** (tiền ảo, giá thật) vài ngày trước. Khi đặt, huỷ và cắt lỗ đều chạy đúng thì mới chuyển sang tiền thật.

1. **Tạo khoá API riêng cho bot.**
   - Demo: vào demo.binance.com → Quản lý API.
   - Thật: vào binance.com → Quản lý API.
   - Chỉ bật **Futures** (và Reading). **TẮT rút tiền.** Giới hạn IP bằng IP máy chủ (chương trình cài sẽ in IP này ra).
   - Ở môi trường thật, bot kiểm tra quyền của khoá và **từ chối chạy** nếu khoá được phép rút tiền.
2. **Chuyển tài khoản futures sang chế độ vị thế One-way** (không dùng Hedge).
3. **Cài khoá lên máy chủ:**

   ```bash
   sudo bash /opt/my-bit/scalper/install.sh --binance
   ```

   Chọn 1 (Demo) hoặc 2 (Thật), rồi dán API Key và Secret Key. Khoá chỉ nằm trong `/opt/my-bit/scalper/.env` (quyền 600), không gửi lên trang MyBit.
4. **Bật trên trang:** Bot lướt giây → Thiết lập → **💵 Tài khoản Binance thật**.
   - Bật công tắc.
   - Chọn Demo hoặc THẬT. Chọn THẬT phải gõ `TIEN THAT` để xác nhận.
   - Đặt **Vốn tối đa**, **Đòn bẩy** và **Ngừng khi lỗ trong ngày**. Đổi lúc nào cũng được.

**Bot làm gì:**
- Mỗi lần Bắt râu sập đặt lệnh chờ trên sàn thử, bot đặt lệnh LIMIT tương ứng trên Binance: ký quỹ cô lập, tối đa "Vốn tối đa".
- Lệnh chờ quá xa giá hiện tại bị sàn từ chối, nên bot chỉ gửi lệnh khi giá đã tới gần.
- Khớp rồi thì bot đặt ngay **cắt lỗ trên sàn** (STOP_MARKET, đóng toàn bộ). Máy chủ cũng có cắt lỗ dự phòng.
- Hết giờ giữ thì đóng bằng lệnh MARKET chỉ-giảm-vị-thế (reduce-only).
- Bot không đụng vào coin anh đang có vị thế.
- Có 5 lỗi API liên tiếp, hoặc lỗ quá giới hạn ngày, thì bot ngừng mở lệnh mới. Lệnh đang mở vẫn được quản lý tới khi đóng.
- Mọi lần khớp và đóng lệnh đều đẩy thông báo về điện thoại. Trạng thái xem ở khung 💵 trên trang Bot lướt giây.
