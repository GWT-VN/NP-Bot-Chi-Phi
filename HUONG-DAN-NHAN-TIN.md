# 📌 Cách gửi chi phí vào kênh New Projects

Bot **NP Chi Phí** đọc kênh liên tục và ghi vào file "Sổ chi phí New Projects".

**Mỗi khoản = 1 tin nhắn có đủ 5 thứ, kèm ảnh bill trong CÙNG tin:**

```
chi Mua vật tư mẫu dự án X 1.250.000đ có hoá đơn đỏ, quỹ công ty     [+ ảnh bill]
thu Hoàn tiền cọc 2tr vào quỹ công ty                                  [+ ảnh]
```

1. Mở đầu bằng **`thu`** hoặc **`chi`**.
2. **Số tiền**: `350.000đ`, `500k`, `1tr5`. Nhiều phần thì thêm `tổng <số>`.
3. **Ảnh bill** trong cùng tin.
4. **Hoá đơn đỏ**: có thì ghi `có hoá đơn đỏ`, không ghi gì thì bot hiểu là **không có**.
5. **Nguồn quỹ**: chi TỪ quỹ nào, thu VÀO quỹ nào (tên quỹ hoặc tên gọi tắt quen dùng).

**Bot phản hồi:**

| | Nghĩa | Làm gì |
|---|---|---|
| ✅ | Đã ghi sổ | Không cần làm gì |
| ❓ + câu hỏi | Tin còn thiếu hoặc chưa rõ (thiếu quỹ, thiếu `chi`, hoá đơn lấp lửng, số tiền chỉ có trong ảnh…) | Bấm **Trả lời (Reply)** vào câu hỏi của bot rồi gõ ("đúng", "735k", "quỹ công ty", "không có bill"…). **Phải bấm Reply**, nhắn rời bot không biết bạn đang trả lời khoản nào. Chỉ chính người gửi khoản đó trả lời mới tính. Bot ghi xong sẽ báo |

- Chỉ **chính người gửi khoản** trả lời mới được tính. Người khác trả lời hộ thì bot hỏi lại.
- **Sửa khoản đã ✅**: nhắn "sửa lại 735k", "nhầm quỹ, là tiền cá nhân ứng"… (người gửi khoản đó nhắn).
- **Xoá khoản**: bot không xoá được, nhờ người quản lý sổ.
- **Hỏi sổ**: "tháng này chi bao nhiêu?", "quỹ công ty đã chi những gì?".
- Tin mở đầu bằng `note` / `ghi chú`, hoặc có cụm "không ghi sổ", thì bot bỏ qua.
- **Sửa tin cũ bot không thấy được** (Discord không báo). Muốn đính chính thì trả lời bot hoặc nhắn tin mới.
