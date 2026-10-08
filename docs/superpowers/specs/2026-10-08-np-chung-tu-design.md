# Chứng từ theo khoản + nhắc bổ sung + ngày thu/chi (np-dichvu) — thiết kế (2026-10-08)

## Vì sao

Zalo **không chuyển album cho bot**. Bằng chứng:
- tài liệu Webhook: trường `photo` là 1 chuỗi;
- đo 07/10: album → chỉ `message.text.received`;
- đo 08/10: 16 lệnh đọc không có trong tài liệu đều 404, nhánh `thu-album-message-id`.

Khoản nhiều chứng từ (vé + hoá đơn…) vì vậy không gửi qua bot được. Chủ dự án chốt: **mỗi khoản một thư mục chứng từ trên
Drive**. Bot ghi khoản (có ảnh thì tải ảnh lên) và trả link để người gửi tự bổ sung, rồi **nhắc cho tới khi có chứng từ**.

Khuôn ghim chưa có ô ngày, nên khoản báo muộn bị ghi ngày gửi tin.

## Quyết định đã chốt (chủ dự án, 2026-10-08)

| # | Quyết định |
|---|---|
| 1 | Khoản **không ảnh vẫn ghi**. Bot luôn tạo thư mục khoản; ✅ kèm link. Gửi kèm 1 ảnh thì bot tải ảnh đó vào như cũ. |
| 2 | **Mọi khoản phải có chứng từ**, chụp gì cũng được. Không có ngoại lệ "không bill". |
| 3 | Nhắc **mỗi tối một tin tổng hợp cho mỗi nhóm** (mặc định 20:00). Thiếu quá 3 ngày thì đánh dấu "(quá 3 ngày)" ngay trong tin đó, vẫn nhắc tiếp. |
| 4 | **Không dùng nhóm vận hành.** Cảnh báo kỹ thuật vẫn chỉ vào nhật ký / `--kiem-tra`. |
| 5 | Bổ sung chứng từ xong → bot sửa ghi chú sổ thành "đã bổ sung chứng từ dd/mm". |
| 6 | Khuôn: `Thu/Chi - Số tiền - Nội dung - Tên quỹ - Ngày`, **ngày không bắt buộc** (bỏ trống = ngày gửi tin). ✅ hiện ngày đã ghi. Sửa được ngày ("sửa #3 ngày 6/10"). |

## Thiết kế

### 1. Ghi khoản

- **Lời dặn bot:**
  - ảnh không còn là điều kiện để ghi; đủ thu/chi, số tiền, nội dung, quỹ là ghi luôn;
  - `ngay` lấy từ tin nếu có, không có thì để trống (so-core tự lấy ngày gửi tin);
  - bỏ các câu "không có bill thì báo";
  - khoản đã ghi mà có ảnh mới kèm #N → nhắc tải vào link trong tin ✅ #N.
- **`mcp/npso.mjs` `taoCoreThat({ cfg, nguonTin, thuMucRong })`:**
  - `thuMucRong: true` → `luuAnh` tạo thư mục khoản kể cả khi không có ảnh, trả link thư mục;
  - mặc định `false`, nên **bot Discord không đổi**;
  - `drive.luuChungTu` thêm tuỳ chọn tương ứng.
- **so-core `ghiKhoan`:** trả thêm `ngay` (dd/mm/yyyy đã ghi) và `co_anh` (đã tải được ảnh). Chỉ cộng thêm trường, Discord không đổi.
- **Tin ✅ (cong-cu):** `✅ #N Tên · dd/mm · CHI 50.000đ · Quỹ · HĐ … · Nội dung`, rồi một dòng tuỳ trường hợp:
  - có ảnh: `📎 Thêm chứng từ: <link>`;
  - không ảnh: `📎 Chưa có chứng từ, tải vào: <link>`.

### 2. CSDL phiên bản 2: bảng `chung_tu`

`chung_tu(tin_id PK → tin, chat_id, ma, ten, loai, so_tien, ngay, thu_muc, link, ghi_luc, co_file 0/1, bo_sung_luc)`

- Thêm dòng khi `ghi_khoan` thành công **và** có link thư mục.
- `co_file = 1` nếu đã tải được ảnh lúc ghi, ngược lại `0`.
- `sua_khoan` thành công thì cập nhật `so_tien`, `loai`, `ngay` nếu có đổi.
- Nâng phiên bản bằng `CAU_TRUC[1]` trong `csdl.mjs` (tự chạy khi mở CSDL cũ).

### 3. Quét (vòng bảo trì, 10 phút)

Với mỗi dòng `co_file = 0`, đếm file trong thư mục trên Drive (`trashed = false`).

- **Có ≥ 1 file:**
  - `co_file = 1`, `bo_sung_luc = now`;
  - sửa ghi chú dòng sổ: bỏ "không có ảnh chứng từ", thêm "đã bổ sung chứng từ dd/mm".
- **Lỗi Drive hoặc thư mục bị xoá:** ghi nhật ký, giữ `co_file = 0`, lần sau quét lại.

Phần sổ cần mở rộng `books.capNhatDong`:
- thêm `ngay`;
- thêm `boGhiChu`: xoá một cụm khỏi ghi chú trước khi ghi thêm.

Cả hai đều là tuỳ chọn mới, nên Discord không đổi.

### 4. Nhắc tối

- **Giờ nhắc:** `config.json` `dichvu.gioNhacChungTu` (mặc định `"20:00"`, giờ VN).
- **Khi nào gửi:** ở lượt bảo trì đầu tiên từ giờ đó trở đi trong ngày. Bot quét trước (để khoản vừa bổ sung không bị nhắc), rồi với mỗi nhóm đã khai còn khoản `co_file = 0` thì gửi **một** tin qua hộp thư.
- **Mỗi ngày chỉ một lần**, nhờ mốc `nhac_ct:<chat_id>:<YYYY-MM-DD>`; khởi động lại cũng không gửi lặp.
- **Nội dung:** `📎 Còn thiếu chứng từ (n):` rồi mỗi khoản một dòng `#N Tên 50.000đ <link>`.
  - Khoản có `ghi_luc` cách bây giờ quá 3 ngày (tính từ lúc bot ghi, không theo ngày chi) thêm `(quá 3 ngày)`.
  - Sắp theo #N. Tin dài hơn 2000 ký tự thì hộp thư tự chia đoạn.
- Không còn khoản thiếu thì không gửi gì.

### 5. Ngày thu/chi

- **Sửa ngày:**
  - `sua_khoan` nhận thêm `ngay` (dd/mm/yyyy);
  - so-core kiểm định dạng rồi chuyển cho `capNhatDong`;
  - **thư mục Drive không dời** (link vẫn đúng). Kế toán lọc theo ngày trên sổ.
- **Khuôn ở mọi nơi:** tin mẫu ghim (`tinMau`), `HUONG-DAN-ZALO.md` và lời dặn bot dùng cùng khuôn có `- Ngày`.

## Không đổi

- Hành vi bot Discord: mọi thay đổi ở `npso` / `so-core` / `books` / `drive` đều là tuỳ chọn hoặc trường mới.
- Hộp thư, hàng đợi, cổng công cụ (trừ chữ tin ✅ và tham số `ngay` của `sua_khoan`).

## Kiểm thử (offline)

- **CSDL:** nâng v1 → v2 giữ dữ liệu cũ; thêm dòng `chung_tu` khi ghi.
- **Cổng công cụ:**
  - ✅ có ngày;
  - 2 kiểu dòng 📎;
  - không ảnh vẫn có dòng `chung_tu` với `co_file = 0`;
  - `sua_khoan` có `ngay`.
- **Quét (Drive giả):**
  - thư mục trống → giữ nguyên;
  - có file → `co_file = 1` + `capNhatDong` gọi với `boGhiChu` / `ghiChuThem`;
  - Drive lỗi → không vỡ.
- **Nhắc:**
  - trước giờ thì không gửi; sau giờ gửi đúng một tin mỗi nhóm;
  - lượt sau cùng ngày không gửi;
  - đánh dấu quá 3 ngày;
  - không còn thiếu thì im.
- **`books.capNhatDong`:** `ngay`, `boGhiChu` (Sheets giả).
- **Đầu cuối:** khoản không ảnh → ✅ "Chưa có chứng từ" + link → tới giờ nhắc → tin tổng hợp.

## Ngoài phạm vi

- Kiểm nội dung file chứng từ (đúng hay sai).
- Nhắc riêng từng người.
- Dời thư mục khi sửa ngày.
- Áp dụng cho bot Discord.
