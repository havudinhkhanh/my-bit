# Ghi chú làm việc cho Claude

## Nhật ký phiên bản ("Có gì mới", trang #/changes)
- Mỗi thay đổi người dùng thấy được (tính năng mới, cải tiến, sửa lỗi) → thêm 1 mục vào `site/changelog.json` trong CÙNG commit.
- Phiên bản = ngày theo giờ VN (`2026.11.17`); thêm mục vào phiên bản của ngày đó, chưa có thì tạo phiên bản mới ở ĐẦU mảng `rel` (mới nhất trước), kèm tiêu đề `t`/`te` và tóm tắt `s`/`se`.
- Mục: `c` = new | imp | fix | res · `a` = bot | live | chart | ui | notif | port | acct | perf | mascot | res · `t`/`te` tiêu đề VI/EN · `d`/`de` chi tiết (tuỳ chọn)
  · `f` = khoá tính năng theo gói (bot, futures, backtest…: hiện ★ Pro) · `aud: "admin"` = chỉ quản trị viên thấy (tài khoản Binance thật, máy chủ riêng, nghiên cứu nội bộ) · `go` = đường dẫn mở tính năng · `hi: 1` = điểm nhấn.
- Viết bằng lời người dùng; không ghi đường dẫn máy chủ, tên kho riêng, khoá, hay thông tin cá nhân.
