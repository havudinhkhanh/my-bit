# Ghi chú làm việc cho Claude

## Nhật ký phiên bản ("Có gì mới", trang #/changes)
- Mỗi thay đổi người dùng thấy được (tính năng mới, cải tiến, sửa lỗi) → thêm 1 mục vào `site/changelog.json` trong CÙNG commit.
- Phiên bản = ngày theo giờ VN (`2026.11.17`); thêm mục vào phiên bản của ngày đó, chưa có thì tạo phiên bản mới ở ĐẦU mảng `rel` (mới nhất trước), kèm tiêu đề `t`/`te` và tóm tắt `s`/`se`.
- Mục: `c` = new | imp | fix | res · `a` = bot | live | chart | ui | notif | port | acct | perf | mascot | res · `t`/`te` tiêu đề VI/EN · `d`/`de` chi tiết (tuỳ chọn)
  · `f` = khoá tính năng theo gói (bot, futures, backtest…: hiện ★ Pro) · `aud: "admin"` = chỉ quản trị viên thấy (tài khoản Binance thật, máy chủ riêng, nghiên cứu nội bộ) · `go` = đường dẫn mở tính năng · `hi: 1` = điểm nhấn.
- Viết bằng lời người dùng; không ghi đường dẫn máy chủ, tên kho riêng, khoá, hay thông tin cá nhân.

## Phòng thử nghiệm phương pháp (research/lab.py, lab_methods.py)
- Quy tắc của Jason (27/11/2026): phương pháp nào kiểm chứng cả giai đoạn CÓ LỜI là phải có công tắc 🧪 sàn thử + 💰 tiền thật ngay, không cần nhắc.
- Cơ chế đã có sẵn và tự động: phương pháp trả ma trận tỉ trọng qua `_out(D, W)` → lab.py ghi `site/lab_targets.json` mỗi ngày → máy chủ riêng giữ danh mục (`worker/labx.js` sàn thử, `scalper/live.mjs` → `lxSync` tiền thật) → web tự hiện 2 công tắc (`lxM` trong `site/app-bot.js`). Thêm phương pháp mới: LUÔN đi qua `_out(D, W)`.
- Công tắc mặc định TẮT; bật tiền thật luôn qua xác nhận 2 bước. Không tự bật thay Jason.
