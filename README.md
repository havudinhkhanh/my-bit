# MyBit – phân tích crypto & bot giao dịch tự động

Trang web riêng (đăng nhập, dùng như app trên điện thoại – PWA) để **phân tích ~500 coin** spot & futures và **vận hành bot giao dịch** có kiểm soát rủi ro.
Mọi chiến lược đều được kiểm chứng trên dữ liệu lịch sử (đã trừ phí, trượt giá, funding) trước khi chạy, và chạy trên **sàn thử** trước khi dùng tiền thật.

> Công cụ hỗ trợ ra quyết định cho người dùng của trang, không phải lời khuyên đầu tư. Giao dịch crypto có rủi ro mất vốn.

## Mục tiêu

- Thấy nhanh **thị trường đang ở đâu** (đèn thị trường, chu kỳ Bitcoin, dòng tiền theo ngành, đám đông futures).
- Chọn coin dựa trên **giá trị thật** (doanh thu, phí, phần về người giữ token) thay vì cảm tính.
- Biết **vào bao nhiêu, cắt lỗ ở đâu, đòn bẩy tối đa bao nhiêu** – hệ thống tự giới hạn theo thị trường và biến động.
- Để **bot làm phần lặp lại** (bắt râu sập, lướt nhanh) với giới hạn an toàn cứng, còn người dùng xem kết quả và rút bài học.

## Tính năng chính

**Phân tích thị trường**
- **Định giá thực tế**: P/F, P/S, phần về người giữ token (DefiLlama); so với nhóm cùng ngành; áp lực cung (lưu hành/FDV, lịch mở khoá, lạm phát cung). Coin không có dòng tiền → nhãn *Đầu cơ*.
- **Chu kỳ Bitcoin**: MVRV, giá vốn toàn mạng, Mayer multiple, mô hình luỹ thừa; lợi nhuận lịch sử theo vùng MVRV & Sợ hãi/Tham lam.
- **Futures**: funding, OI, basis gộp nhiều sàn, tín hiệu đám đông, cơ hội carry (mua spot + bán perp).
- **Bảng giá trực tiếp, radar tín hiệu, nhóm ngành, coin cùng nhịp.**

**Vào lệnh & quản trị rủi ro**
- **Lên kế hoạch lệnh**: giá vào, cắt lỗ, mục tiêu, khối lượng theo % rủi ro; đòn bẩy do hệ thống kiểm soát.
- **Danh mục** spot + futures: lãi/lỗ, giá thanh lý ước tính, funding/ngày, độ phơi nhiễm ròng; đồng bộ từ tài khoản Binance (chỉ đọc).
- **Sàn thử**: giao dịch tiền ảo trên giá thật.

**Bot tự động**
- **Đội bot** theo xu hướng khung ngày / 4 giờ (kiểm chứng toàn lịch sử).
- **Bot Phản Xạ**: 🪝 *Bắt râu sập* (đặt lệnh chờ sau cú sốc giá 1 phút) và ⚡ *lướt giây*, chạy 24/7 trên máy chủ riêng nối thẳng Binance; tuỳ chọn đặt lệnh trên Binance Demo hoặc tiền thật, với giới hạn an toàn cứng (ký quỹ, giá trị lệnh, mức lỗ xấu nhất, lỗ trong ngày) và khoá API không có quyền rút tiền.
- **Phòng thử nghiệm**: các chiến lược giữ nhiều ngày (Short coin vừa bơm, coin mới niêm yết) chạy trên sàn thử trước.
- **Bot giám sát**: rủi ro chung, khám nghiệm từng lệnh.
- **Kết quả theo ngày** và **📒 Sổ lệnh & bài học**: toàn bộ lịch sử lệnh (giá vào/ra, khối lượng, phí, funding, lời/lỗ ròng), bài học tổng hợp theo lý do đóng, giờ, coin, cỡ cú sốc; xuất CSV.

**Trải nghiệm**
- Thông báo đẩy kiểu app (chờ khớp → khớp → đóng), chuông thông báo, xem nhanh tin bằng cách giữ lâu.
- Giao diện sáng / tối / theo hệ thống, thanh điều hướng tuỳ chỉnh, cài như app trên iPhone/Android.

---

*Hướng dẫn cài đặt, cấu hình và vận hành nằm trong tài liệu nội bộ riêng tư của chủ dự án.*
