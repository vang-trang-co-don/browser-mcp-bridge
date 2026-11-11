# Browser MCP Bridge

Cầu nối phiên duyệt web thực tế (Firefox/Chrome) với bất kỳ AI Agent nào hỗ trợ chuẩn **Model Context Protocol (MCP)**. Bỏ qua CAPTCHA, Cloudflare, WAF; tự tái sử dụng Cookie/Token trên tab đang mở.

---

## 🚀 Cài Đặt (Cho Máy Mới / Mọi Agent)

```bash
git clone https://github.com/vang-trang-co-don/browser-mcp-bridge.git
cd browser-mcp-bridge
npm install && npm run build
```

### 1. Nạp Extension vào Firefox (10s)
1. Mở Firefox: `about:debugging#/runtime/this-firefox`
2. Bấm **"Load Temporary Add-on..."** và chọn:
   ```text
   <path_to_repo>/extension/manifest.json
   ```

### 2. Cấu hình MCP Server
Thêm vào file config MCP của Agent (Claude, Cursor, Windsurf, Zed, Antigravity):

```json
{
  "mcpServers": {
    "browser": {
      "command": "node",
      "args": ["<path_to_repo>/dist/index.js"]
    }
  }
}
```

---

## 🛠️ Công Cụ Cung Cấp Cho Agent

| Tool | Tham số | Mô tả |
| :--- | :--- | :--- |
| `browser_list_tabs` | *none* | Liệt kê tab đang mở (`id`, `url`, `title`). |
| `browser_get_active_tab` | *none* | Xem tab hiện tại & trạng thái relay. |
| `browser_get_recent_requests` | `urlMatch?`, `limit?` | Đọc 10-30 request API web vừa gọi (học API mẫu). |
| `browser_fetch` | `urlMatch?`, `url`, `method`, `body` | Gọi API trong tab (mang đủ Cookie/Token, né CORS). |
| `browser_eval` | `urlMatch?`, `script` | Chạy JS trực tiếp trong DOM của tab. |

*Tip:* Truyền `urlMatch` (ví dụ `"gdt.gov.vn"`) để Agent cố định đúng tab, tránh bị ảnh hưởng khi chuyển tab.

---

## 💬 Prompt Mẫu Cho Agent

* **Hóa đơn GDT:** *"Tao vừa bấm tải 1 hóa đơn mẫu trên `hoadondientu.gdt.gov.vn`. Soi request bằng `browser_get_recent_requests` rồi kéo 50 hóa đơn mua vào về `./invoices`."*
* **iPOS / SaaS:** *"Dùng `browser_fetch` trên tab iPOS HRM đang mở để đổi toàn bộ ca sang 'Theo ca làm việc'."*
