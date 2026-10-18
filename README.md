# Nông Trại Mây 🌱

Game nông trại 2D bằng tiếng Việt, chạy trực tiếp trên trình duyệt máy tính và điện thoại. Viết bằng HTML, CSS và JavaScript thuần; không cần cài thư viện hoặc máy chủ xử lý game.

## Chơi

- Chạm/bấm để nhân vật tự tìm đường và tương tác với ruộng hoặc NPC.
- Kéo để xem bản đồ; chụm hai ngón hoặc dùng +/− để thu/phóng.
- ⌖ theo nhân vật; ▧ xem toàn trang trại.
- Chọn hạt giống để gieo, tưới nước, đợi cây chín rồi thu hoạch và bán.
- Hoàn thành nhiệm vụ để nhận vé tuyển nhân viên và dụng cụ.
- Bấm bảng thời tiết để xem giống nào được lợi hoặc chịu ảnh hưởng. Che luống tốn 8 xu và bảo vệ 120 giây.

## Tính năng

- Nhân vật chính và 3 NPC, di chuyển A* theo 8 hướng, tránh vật cản.
- Cà rốt, lúa mì, dâu tây; kinh nghiệm, cửa hàng, nhiệm vụ và mở rộng đất.
- Tuyển nhân viên và mở dụng cụ bằng vé trong game, không có thanh toán tiền thật.
- Nắng nhẹ, mưa, nắng gắt, se lạnh và giông; ảnh hưởng tốc độ lớn, nước và chất lượng cây.
- Đồ họa pixel, camera cảm ứng, giao diện thích ứng với màn hình dọc/ngang.

## Lưu tiến trình và người chơi

Mọi người có thể cùng mở đường dẫn để chơi **trang trại riêng**. Tiến trình lưu bằng `localStorage` trên trình duyệt và thiết bị đang dùng, không gửi lên GitHub. Bản này chưa có đăng nhập, đồng bộ đám mây hoặc nhiều người cùng một bản đồ. Xóa dữ liệu trình duyệt có thể làm mất tiến trình. Bản lưu từ tệp HTML trên máy không tự chuyển sang địa chỉ web mới.

Thời tiết và cây được tính khi quay lại game; nhân viên và chuồng gà làm việc khi game đang mở.

## Chạy trên máy

Phục vụ thư mục dự án bằng một máy chủ tĩnh, ví dụ:

```sh
python3 -m http.server 8000
```

Sau đó mở `http://localhost:8000`. Thư mục không có khóa API hoặc dịch vụ backend.

## Kiểm tra

Cần Node.js, không cần cài dependency:

```sh
npm test
```

Các bài kiểm tra bao gồm cây trồng, kinh tế, gacha, tìm đường, thời tiết, tiến trình khi đóng game, camera và thao tác cảm ứng ở nhiều kích thước màn hình.

## GitHub Pages

Trong **Settings → Pages**, chọn **Deploy from a branch**, nhánh **main**, thư mục **/ (root)**, rồi **Save**. GitHub sẽ hiển thị đường dẫn chơi sau khi triển khai xong. Các đường dẫn tài nguyên là tương đối để hỗ trợ Pages ở thư mục repository.

## Cấu trúc

- `index.html`: giao diện game.
- `style.css`: bố cục và giao diện điện thoại.
- `game.js`: trạng thái, mô phỏng, tìm đường và dựng canvas.
- `assets/`: ba atlas PNG được game sử dụng.
- `tests/`: kiểm tra logic bằng Node.js.

## Hình ảnh

Bộ đồ vật pixel gốc do chủ dự án cung cấp. Các atlas tách nền, nhân vật và địa hình được xử lý/tạo bằng Imagegen theo phong cách mẫu. Repository không tự cấp một giấy phép sử dụng lại cho các hình ảnh gốc.
