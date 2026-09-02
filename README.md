# Quản lý nhà trọ

Ứng dụng web cài được lên màn hình chính điện thoại (PWA) để quản lý phòng trọ, chỉ số điện nước và phiếu thu tiền. Dùng offline được; khi có mạng và đã đăng nhập thì dữ liệu tự đồng bộ giữa các điện thoại.

## Cài lên điện thoại Android

1. Mở đường dẫn của ứng dụng bằng Chrome.
2. Bấm nút ba chấm ở góc phải trên.
3. Chọn **Thêm vào Màn hình chính** (Add to Home screen), rồi **Cài đặt**.

Sau bước này ứng dụng chạy toàn màn hình như app thường và mở được khi không có mạng.

## Cách dùng

**Lần đầu.** Vào **Cài đặt** điền tên nhà trọ, số điện thoại và thông tin ngân hàng. Thông tin ngân hàng dùng để sinh mã QR chuyển khoản in trên phiếu, nếu bỏ trống thì phiếu không có QR.

**Tạo phòng.** Vào **Phòng** → **Thêm phòng**. Mốc ngày phát phiếu là ngày trong tháng mà phòng đó tới kỳ đóng tiền, mỗi phòng đặt khác nhau được.

**Nhận khách.** Mở phòng → **Nhận khách vào ở**. Khai ngày dọn vào, tiền cọc, chỉ số điện nước lúc bàn giao và tên người ở. Ứng dụng tự tính phần tiền phòng lẻ từ ngày dọn vào tới mốc ngày kế tiếp, cộng tiền phòng tháng liền sau và tiền cọc thành một phiếu nhận phòng.

**Hằng tháng.** Đầu tháng vào **Chỉ số** ghi số công tơ điện nước của tháng vừa rồi. Ứng dụng cảnh báo khi số mới nhỏ hơn số cũ hoặc nhảy vọt bất thường. Sau đó vào **Phiếu** → **Phát phiếu**, chọn các phòng tới kỳ và phát một lượt.

**Gửi phiếu.** Mở phiếu → **Gửi Zalo**. Điện thoại hiện bảng chia sẻ, chọn Zalo rồi chọn người nhận. Máy tính không có bảng chia sẻ thì dùng **Tải ảnh** hoặc **Chép ảnh** rồi dán vào Zalo.

**Thu tiền.** Mở phiếu → **Ghi nhận** để ghi số tiền đã thu. Thu thiếu cũng ghi được, phần còn nợ tự cộng sang phiếu kỳ sau.

**Trả phòng.** Mở phòng → **Trả phòng**. Khai ngày trả và chỉ số chốt. Ứng dụng tính tiền điện nước những ngày ở lẻ, hoàn lại tiền phòng những ngày đã đóng mà chưa ở, cộng khoản còn nợ rồi trừ vào tiền cọc để ra số phải trả lại khách.

## Về tiền phòng và điện nước

Tiền phòng chạy theo mốc ngày của từng phòng, tròn một tháng từ mốc này tới mốc kế tiếp. Tiền điện nước luôn tính theo tháng dương lịch. Hai thứ này lệch nhau là bình thường: phiếu phát ngày 25/09 sẽ gồm tiền phòng 25/09–25/10 và tiền điện nước của tháng 08.

Ứng dụng ghi nhớ tiền phòng đã thu tới ngày nào nên không thu trùng. Khách đóng trước một tháng lúc dọn vào thì phiếu kế tiếp chỉ có điện nước.

## Đồng bộ nhiều điện thoại (Supabase)

1. Tạo project miễn phí tại [supabase.com](https://supabase.com).
2. Vào **SQL Editor**, chạy file `supabase/migrations/001_sync_records.sql`.
3. Vào **Authentication → Providers**: bật **Email** và **Google**.
4. Vào **Authentication → URL Configuration**, thêm **Redirect URL**:
   - `http://localhost:5173/` (dev)
   - `https://qlnt.marchluu.io.vn/` (bản chính)
   - `https://thuongluu2603.github.io/quan-ly-nha-tro/` (GitHub Pages dự phòng)
5. Vào **Project Settings → API**, copy **Project URL** và **anon public key**.
6. Tạo file `.env.local` trong thư mục project (xem `.env.example`).
7. Deploy GitHub Pages: vào repo **Settings → Secrets → Actions**, thêm:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

Cùng một tài khoản đăng nhập trên mọi máy sẽ thấy cùng dữ liệu. Gia đình có thể dùng chung một email/mật khẩu.

## Sao lưu

Dữ liệu nằm trong máy (offline) và trên cloud (khi đã đăng nhập). Vẫn nên xuất file sao lưu định kỳ.

## Chạy trên máy tính

```bash
npm install
npm run dev      # chạy thử
npm test         # kiểm thử phần tính tiền
npm run build    # đóng gói
```

Mỗi lần đẩy code lên nhánh `main`, GitHub Actions tự chạy kiểm thử và cập nhật bản trên GitHub Pages.
