# Hướng dẫn Deploy & Cài đặt Mechatronics Morning Hub lên iPhone

Ứng dụng được xây dựng 100% tĩnh (HTML5, CSS3, ES Modules JS, Service Worker) nên deploy miễn phí trong 1 phút, không cần server backend.

---

## Cách 1: Deploy siêu nhanh bằng Netlify Drop (30 giây)
1. Truy cập https://app.netlify.com/drop trên máy tính.
2. Kéo-thả toàn bộ thư mục dự án (chứa `index.html`, `manifest.json`, `sw.js`, `css/`, `js/`, `icons/`) vào khung thả.
3. Netlify sẽ cấp ngay một đường dẫn **HTTPS** (ví dụ `https://mecha-hub-xxxx.netlify.app`).
   *(Lưu ý: iOS Safari yêu cầu HTTPS để Service Worker chạy chế độ offline và định vị GPS.)*

## Cách 2: Deploy miễn phí qua GitHub Pages
1. Tạo repository mới trên GitHub và đẩy toàn bộ mã nguồn lên nhánh `main`.
2. Vào **Settings → Pages → Build and deployment**:
   - **Source:** `Deploy from a branch`
   - **Branch:** `main` / `/ (root)` → bấm **Save**.
3. Đợi ~1 phút để GitHub xuất bản tại `https://<username>.github.io/<ten-repo>/`.

## Cách 3: Chạy thử cục bộ trên máy tính (Full tính năng: 9/9 RSS + Giọng Neural)
Mở PowerShell / Terminal trong thư mục dự án:
```bash
python server.py
```
Sau đó mở trình duyệt vào `http://127.0.0.1:5173` (bật DevTools → chế độ điện thoại `390×844` để xem đúng tỷ lệ iPhone).
*(Chạy bằng `server.py` sẽ tự động cấp proxy RSS không bị giới hạn 429 và giọng đọc phát thanh viên Neural tiếng Việt: **Hoài My**, **Nam Minh**, **Google Tiếng Việt**.)*

---

## Cách 4: Deploy Cloudflare Worker miễn phí cho iPhone dùng từ xa (2 phút)
Để khi mở web trên iPhone bằng 4G ở bất kỳ đâu vẫn có **9/9 nguồn RSS xanh (không lỗi 429)** và **giọng đọc Cloud Audio**:
1. Đăng nhập miễn phí tại https://dash.cloudflare.com → **Workers & Pages → Create → Create Worker**.
2. Bấm **Deploy** → **Edit code**, dán toàn bộ nội dung tệp `cloudflare/worker.js` vào rồi bấm **Deploy**.
3. Copy đường dẫn Worker (dạng `https://ten-worker.ten-ban.workers.dev`), mở app trên iPhone vào **Tab 4 → Cài đặt → Cloudflare Worker**, dán vào và bấm **Lưu**. *(Miễn phí 100.000 lượt/ngày, không cần thẻ tín dụng.)*

---

## Ghim ra Màn hình chính iPhone (Add to Home Screen)
1. Mở đường dẫn HTTPS đã deploy bằng **Safari** trên iPhone *(không dùng Chrome/Zalo in-app browser)*.
2. Chạm nút **Chia sẻ (Share)** ở thanh dưới cùng (biểu tượng ô vuông có mũi tên hướng lên).
3. Cuộn xuống chọn **Thêm vào Màn hình chính (Add to Home Screen)** → bấm **Thêm (Add)**.
4. Mở biểu tượng **Mecha Hub** trên màn hình chính — ứng dụng sẽ chạy toàn màn hình không thanh địa chỉ, lưu cache dữ liệu tức thì và chạy **Lab Tools + 55 thẻ ôn kỹ thuật 100% offline**.

---

## Mẹo sử dụng & Bảo toàn dữ liệu
- **Sao lưu định kỳ:** Vào **Tab 4 (Lưu & Ghi chú) → Cài đặt → Export JSON** để tải tệp sao lưu toàn bộ Bookmarks, Lab Log và cấu hình Radar về iCloud Drive / Files.
- **Tùy chọn AI Dịch & Tóm tắt (BYOK):** Nếu muốn tóm tắt tin tiếng Anh sang tiếng Việt bằng `gemini-2.5-flash`, lấy khóa miễn phí tại Google AI Studio rồi dán vào mục **Gemini AI** trong Cài đặt. Key chỉ lưu cục bộ trên trình duyệt của bạn.
