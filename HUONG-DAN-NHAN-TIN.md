# 📌 Cách gửi chi phí vào kênh New Projects

Bot đọc kênh lúc **11:00 · 15:00 · 20:30** mỗi ngày và ghi vào file "Sổ chi phí New Projects".

**Mỗi khoản = 1 tin nhắn, gồm CẢ chữ VÀ ảnh trong cùng một tin** (đừng gửi ảnh một tin, chữ một tin).

```
chi Mua vật tư mẫu dự án X 1.250.000đ có hoá đơn đỏ     [+ ảnh bill]
thu Hoàn tiền cọc 2tr                                    [+ ảnh]
```

1. **Mở đầu bằng `thu` hoặc `chi`.**
2. **Số tiền** có `đ`, `k`, `tr` hoặc dấu chấm: `350.000đ` · `500k` · `1tr5`. Gõ trơn `350000` thì bot **không đọc**.
3. **Có hoá đơn đỏ** thì thêm cụm `có hoá đơn đỏ`. Không ghi gì thì bot hiểu là **không có**.
   Chưa lấy được hoá đơn thì đừng nhắc chữ "hoá đơn", tránh bot hỏi lại.
4. **Kèm ảnh** trong cùng tin.
5. Nhiều khoản nhỏ gộp một tin thì thêm `tổng <số>`. VD: `chi Vật tư 300k + công 100k, tổng 400k`.
6. Gõ **có dấu**. Chữ `VAT` hay `hoa don` không dấu thì bot không hiểu là có hoá đơn.
7. Ghi bù khoản ngày cũ: mở đầu bằng ngày, VD `Ngày 3/10: chi …`.

**Bot thả cảm xúc:**

| | Nghĩa | Làm gì |
|---|---|---|
| ✅ | Đã ghi sổ | Không cần làm gì |
| ⚠️ | **CHƯA ghi**, bot rep lý do | **Sửa thẳng tin đó** trong 7 ngày, đừng gửi lại (gửi lại là ghi 2 lần) |
| 📷 | Có số tiền nhưng thiếu ảnh | Gửi **tin mới** gồm chữ + ảnh (Discord không cho thêm ảnh khi sửa tin). Tin 📷 chưa vào sổ nên gửi lại **không** bị ghi trùng; xoá tin cũ cho gọn |
| ⌛ | Tin ⚠️ đã quá 7 ngày | Gửi **tin mới** |

- **Sau khi đã ✅ mà sửa tin thì bot không cập nhật sổ.** Nhắn người quản lý sổ để sửa.
- Tin trao đổi thường (không số tiền, không ảnh) bot bỏ qua. Mở đầu bằng `note` hoặc `ghi chú` thì bot cũng bỏ qua, kể cả khi có số tiền.
- Reply (trả lời tin khác) **không bao giờ** được ghi sổ. Khoản mới thì gửi tin mới.
