# Browser MCP Bridge

Cầu nối trực tiếp giữa **AI Agents (Antigravity, Claude Code, Cursor, Windsurf)** và **phiên làm việc trên Firefox / Chrome** của bạn thông qua chuẩn **Model Context Protocol (MCP)** chính thức của Anthropic (`@modelcontextprotocol/sdk`).

---

## 💡 Triết Lý Thiết Kế (Zero Bloat, 3 Primitives)

Thay vì hàng tá công cụ debug cồng kềnh (Lighthouse, SEO audits, console streaming), `browser-mcp-bridge` chỉ tập trung vào **3 primitive actions** mạnh nhất:

1. **`browser_get_recent_requests`**: Đọc bộ đệm các request XHR/Fetch mà web vừa gọi khi bạn thao tác trên trình duyệt (dùng để quan sát và tự học API).
2. **`browser_fetch`**: Gọi API trực tiếp bên trong context của tab đang mở (tự động đính kèm toàn bộ Cookie, Token, CSRF, Header gốc của trình duyệt, không bao giờ bị dính CORS hay WAF).
3. **`browser_eval`**: Thực thi mã JavaScript trực tiếp trên trang để lấy dữ liệu DOM, LocalStorage hoặc trigger các hàm của web.

---

## 🚀 Hướng Dẫn Cài Đặt (Trong 1 Phút)

### 1. Build MCP Server
Đã build sẵn tại thư mục:
```bash
cd /home/dungcq/projects/browser-mcp-bridge
bun run build
# hoặc: npm run build
```

### 2. Cài Extension lên Firefox (Tương thích 100% Firefox Snap trên Ubuntu)
1. Mở Firefox, gõ vào thanh địa chỉ:
   ```text
   about:debugging#/runtime/this-firefox
   ```
2. Bấm nút **"Load Temporary Add-on..."** (Nạp phần bổ trợ tạm thời).
3. Trỏ tới file:
   ```text
   /home/dungcq/projects/browser-mcp-bridge/extension/manifest.json
   ```
4. Biểu tượng 🌐 xuất hiện trên thanh công cụ của Firefox với badge **ON** (khi MCP server chạy).

---

## ⚙️ Cấu Hình MCP Client (Antigravity / Claude Desktop / Cursor)

Thêm vào file cấu hình MCP của bạn (ví dụ `claude_desktop_config.json` hoặc config trong Antigravity/Cursor):

```json
{
  "mcpServers": {
    "browser": {
      "command": "node",
      "args": ["/home/dungcq/projects/browser-mcp-bridge/dist/index.js"]
    }
  }
}
```

*(Hoặc chạy trực tiếp binary: `["/home/dungcq/projects/browser-mcp-bridge/dist/index.js"]`)*

---

## 🎯 Ví Dụ Thực Chiến

### Kéo hóa đơn tự động từ `hoadondientu.gdt.gov.vn`
1. Bạn mở web GDT trên Firefox, đăng nhập và gõ CAPTCHA bình thường (mất 5s).
2. Bấm tra cứu 1 ngày bất kỳ hoặc bấm tải thử 1 hóa đơn mẫu.
3. Chat với Agent:
   > *"Tao vừa bấm tải 1 hóa đơn mẫu trên tab GDT, hãy soi request vừa gửi và viết script kéo toàn bộ 150 hóa đơn mua vào tháng 10 lưu về máy."*
4. **Agent tự động:**
   * Gọi `browser_get_recent_requests` -> Đọc thấy token & endpoint `/query/invoices/purchase`.
   * Gọi `browser_fetch` lặp qua các trang để lấy toàn bộ danh sách ID.
   * Tải toàn bộ XML/PDF trực tiếp về thư mục máy mà không bị chặn bot hay CAPTCHA.

### Chỉnh cấu hình ca làm việc trên `hrm.ipos.vn`
1. Đăng nhập vào iPOS HRM trên Firefox.
2. Chat với Agent:
   > *"Lấy danh sách ca làm việc trên tab hiện tại và chuyển Cách tính giờ sang Theo ca làm việc."*
3. Agent gọi `browser_fetch('/api/v2/shift/list')` -> kiểm tra dữ liệu -> gọi `browser_fetch('/api/v2/shift/{id}', { method: 'PUT', ... })` cập nhật ngay lập tức.
