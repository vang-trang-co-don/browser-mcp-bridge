# Browser MCP Bridge

Cầu nối trực tiếp giữa AI Agent (Antigravity/Claude/Cursor) với phiên duyệt web Firefox qua chuẩn MCP. Bỏ qua CAPTCHA, Cloudflare, tự lấy Token/Cookie từ tab đang mở.

---

## 1. Cài Extension lên Firefox (Làm 1 lần)

1. Gõ vào thanh địa chỉ Firefox: `about:debugging#/runtime/this-firefox`
2. Bấm **"Load Temporary Add-on..."**
3. Chọn file:
   ```text
   /home/dungcq/projects/browser-mcp-bridge/extension/manifest.json
   ```

---

## 2. Khai báo MCP (Copy vào file config MCP)

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

---

## 3. Cách dùng trong Chat (Prompt mẫu)

Chỉ cần đăng nhập web trên Firefox, sau đó ra lệnh cho Agent:

* **Kéo dữ liệu GDT:**
  > "Tao vừa bấm tải 1 hóa đơn mẫu trên `hoadondientu.gdt.gov.vn`. Soi request vừa gửi rồi kéo 50 hóa đơn mua vào gần nhất lưu về `./invoices`."

* **Sửa cấu hình iPOS / SaaS nội bộ:**
  > "Gọi `browser_fetch` trên tab iPOS HRM đang mở để đổi toàn bộ ca làm việc sang 'Theo ca làm việc'."

---

## 4. Danh sách Tools AI tự gọi
* `browser_list_tabs`: Xem danh sách tab đang mở.
* `browser_get_recent_requests`: Đọc các API request web vừa gửi khi bạn bấm trên UI.
* `browser_fetch`: Bắn request vào tab (mang đủ Cookie/Token của bạn, né CORS/WAF).
* `browser_eval`: Chạy JS trực tiếp trên trang.
