# Torbox Cached Regex Search Addon (Stremio & Nuvio)

Addon dành cho **Stremio** và **Nuvio** giúp tự động tìm kiếm torrents đã **cached** trong tài khoản **Torbox** (và Torbox Global Cache) thông qua Regex Matching theo tên phim/series.

## 🌟 Tính năng nổi bật
- **Chuẩn Stremio Addon Protocol v3**: Tương thích hoàn toàn với Stremio (Desktop, Web, Mobile, TV) và Nuvio.
- **Tự động Regex Search**: Chuyển đổi tên phim từ Cinemeta/TMDB thành Pattern Regex thông minh (khớp linh hoạt dấu câu, khoảng trắng, năm sản xuất, mùa & tập `S01E05`).
- **Chỉ phát torrent Cached**: Tìm kiếm trong tài khoản Torbox (`mylist`) & Cache Check (`checkcached`) đảm bảo tốc độ phát tức thì, không chờ tải xuống.
- **Stream Direct Permalinks**: Trực tiếp phát video từ CDN Torbox bằng permalink tự động chuyển hướng.
- **Trang Cấu hình Web UI Thần thánh**: Giao diện Glassmorphic hiện đại tại `/configure` giúp dễ dàng nhập Torbox API Token, tùy chỉnh bộ lọc Regex (Include/Exclude) và tạo link cài đặt 1-Click.
- **Đóng gói Docker**: Sẵn sàng chạy bằng Docker Container hoặc Docker Compose.

---

## 🛠️ Hướng dẫn cài đặt & Chạy ứng dụng

### Cách 1: Chạy trực tiếp với Node.js
```bash
cd torbox-addon
npm install
npm start
```
Server sẽ lắng nghe tại `http://localhost:7000`.

---

### Cách 2: Chạy bằng Docker Compose (Khuyên dùng)
```bash
cd torbox-addon
docker compose up -d --build
```
Dịch vụ sẽ mở port `7070` trên máy chủ (mapped sang container port `7000`).

---

## 🔗 Hướng dẫn Thêm Addon vào Stremio & Nuvio

1. Mở trình duyệt và truy cập trang cấu hình:
   - Nếu chạy Node.js trực tiếp: `http://localhost:7000/configure`
   - Nếu chạy Docker Compose: `http://localhost:7070/configure`
2. Nhập **Torbox API Token** (Lấy từ Torbox -> Account -> API Key).
3. Tuỳ chỉnh các bộ lọc Regex (nếu muốn, ví dụ Include: `4K|1080p`, Exclude: `CAM|TS`).
4. Nhấn **⚡ Install to Stremio** để mở và thêm trực tiếp vào app Stremio, hoặc nhấn **📋 Copy Manifest Link** để dán vào Nuvio.

---

## 📂 Cấu trúc thư mục dự án

```
torbox-addon/
├── src/
│   ├── services/
│   │   ├── cinemeta.js      # Resolve metadata (Title, Year, Season, Episode)
│   │   └── torbox.js        # Torbox API (mylist, checkcached, permalinks)
│   ├── utils/
│   │   └── regexMatcher.js  # Build title regex & quality parser
│   ├── public/
│   │   └── configure.html   # Web UI cấu hình glassmorphism
│   └── server.js            # Express server & stream endpoints
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```
