# 📌 Cách báo chi phí trong nhóm (bot **Bot GWT CP**)

Bot ghi vào file "Sổ chi phí New Projects". **Bot chỉ thấy tin có gắn @Bot GWT CP.**

**Mỗi khoản = 1 ảnh bill, gõ nội dung vào phần CHÚ THÍCH của ảnh, mở đầu bằng @Bot GWT CP:**

    [ảnh bill]  @Bot GWT CP chi 180k 10 chai nước khách bóng bàn 7/10, cá nhân ứng
    [ảnh]       @Bot GWT CP thu hoàn cọc 2tr vào TK công ty

Nên có: **thu/chi** · **số tiền** · **hoá đơn đỏ** (không ghi = không có) · **quỹ** (GWT - TK Công ty / GWT - Tiền mặt /
Thuỷ / Cá nhân ứng). Thiếu gì bot hỏi lại.

- **Nhiều bill** → gửi nhiều tin, **mỗi tin 1 ảnh** (gửi album thì bot không nhận được ảnh).
- **Đừng gửi ảnh rồi mới gõ chữ ở tin sau** — ảnh không có @ thì bot không thấy.
- **Bot hỏi lại** → trả lời bắt đầu bằng **@Bot GWT CP** ("@Bot GWT CP đúng", "@Bot GWT CP quỹ tiền mặt"). Bot đang hỏi bạn
  nhiều khoản thì ghi thêm **#số** khoản: "@Bot GWT CP #5 đúng". Chỉ chính người gửi khoản trả lời mới tính.
- **Bot nhắc gửi lại ảnh** cho khoản #5 → gửi 1 ảnh, chú thích **bắt đầu** bằng "@Bot GWT CP #5".
- **Bot ghi xong** sẽ trả lời "✅ #số …". **Tin không có bot trả lời bên dưới = bot chưa thấy** (thường do quên @) → gửi lại có @.
- **Sửa** khoản đã ✅: "@Bot GWT CP sửa #5 thành 150k" (chỉ người gửi khoản đó).
- **Xoá**: bot không xoá được, nhờ người quản lý sổ.
- **Hỏi sổ**: "@Bot GWT CP hôm nay chi bao nhiêu?", "@Bot GWT CP quỹ Thuỷ chi những gì?"
- Tiền **tệ / $** → bot hỏi số tiền VND thực trả.
- Tin gửi **trước khi bot vào nhóm** bot không đọc được → gửi lại theo cách trên, hoặc báo người quản lý sổ.
