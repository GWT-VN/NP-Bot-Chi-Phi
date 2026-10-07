# NP Bot Chi Phí trên nhóm Zalo — thiết kế (2026-10-07)

## Vì sao

Đoàn hoạ sĩ TQ (6–16/10/2026) báo chi tiêu trong **nhóm Zalo** "Chi tiêu đoàn TQ 6-16/10" (8 thành viên, trưởng nhóm
Thuỷ Thư Ký). Anh chủ tịch đầu tư không dùng Discord, nên cần theo dõi ngay trong nhóm Zalo. Bot Discord hiện có
(`bot/`, `mcp/npso.mjs`) vẫn chạy cho kênh chi phí chung. Phần Zalo chạy **song song**, dùng chung lõi sổ.

## Đã cân nhắc và loại

- **Zalo OA + nhóm GMF:** đọc được mọi tin, nhưng phải mua gói (≈1,6tr/6 tháng), xác thực tên miền, mở webhook công khai, chuyển team sang
  nhóm mới do OA tạo, dùng chung OA với khách hàng. App "NP Chi Phí" (App ID 3001497288329436392) để nguyên, chưa kích hoạt.
- **Bot nhắn riêng 1:1:** cần nhóm để anh chủ tịch theo dõi. Nhắn riêng cho bot cũng không gửi được (đo thật).
- **Tài khoản Zalo cá nhân + thư viện không chính thức (zca-js):** trái điều khoản, tài khoản có thể bị khoá.

**Chọn: Zalo Bot Platform trong nhóm** (bot "Bot GWT CP", tạo bằng tài khoản cá nhân đã KYC của chủ dự án).

## Đo thật (2026-10-07, nhóm thử, `zalo/probe.mjs`)

| Thử | Kết quả |
|---|---|
| Bot vào nhóm | Được (tính năng nhóm dùng được với tài khoản này) |
| Tin chữ không @ | **Không tới** bot |
| Tin chữ có @Bot | `message.text.received`, trường: `chat, text, message_id, date, from` |
| 1 ảnh + chú thích có @Bot | `message.image.received`, trường: `chat, message_id, date, message_type, from, photo_url, caption` (tài liệu ghi `photo`, thật là `photo_url`) |
| Ảnh gửi rời không @ | Không tới |
| Album 2 ảnh + chú thích @ | Chỉ tới **chữ** (`message.text.received`), mất ảnh |
| Trả lời (quote) tin bot / ảnh | Tới như tin chữ thường, **không có trường nào cho biết trả lời tin nào** |
| Nhắn riêng cho bot | Người dùng không nhắn được |

Zalo Bot API **không có**: thả biểu tượng, đọc lại tin theo ID, lịch sử nhóm, thông tin Reply.

## Thiết kế

**Một tiến trình `mcp/npzalo.mjs`** làm ba việc. Lý do gộp: kho tin phải là nguồn duy nhất, vì Zalo không có API đọc lại tin.

1. **Channel** của Claude Code: long-poll `getUpdates`, chỉ đẩy tin của nhóm đã khai trong `config.json` `zalo.groups`.
   - Tin riêng, nhóm chưa khai, sự kiện lạ: bỏ, ghi vào `bo-qua.jsonl`. Nhóm chưa khai được ghi kèm `chat_id` để lấy ID khai nhóm.
2. **5 lệnh sổ** (`taoServer` của npso, lõi `so-core.mjs` dùng nguyên).
   - Ghi hoặc sửa xong, **server tự báo trong nhóm**: `✅ #N <tên> · <tóm tắt>` hoặc `✏️ Đã sửa #N`. Đây là phần thay cho ✅ của Discord.
3. **`tra_loi`**: chỉ gửi vào nhóm đã khai, không có gửi tin riêng.
   - `hoi_ve` = khoản đang hỏi; server tự đánh dấu ❓ cho khoản đó.
4. **`tai_anh`**: tải `photo_url` về inbox để Claude đọc bill.

**Kho tin `zalo/kho.mjs`** (JSONL, một tiến trình ghi) dựng lại "dáng tin Discord" mà so-core đang dùng:

- `id`: số tăng theo thời gian (`date` ms × 1000 + thứ tự), vì so-core so sánh id bằng BigInt.
- `ma`: số `#N` theo từng nhóm. Người dùng gõ `#N` để chỉ khoản.
- `reactions`: ✅ / ❓ do bot đặt, chỉ để lõi biết trạng thái khoản.
- `content`: đã bỏ `@<tenBot>`. So khớp tên không phân biệt hoa thường, mọi khoảng trắng (kể cả NBSP) đều khớp.
- `message_reference`: Reply **suy ra lúc nhận tin** (`suyTraLoi`):
  1. Có `#N` là tin của chính người gửi → trỏ tin `#N` (dùng cho trả lời lẫn "sửa #N").
  2. Không có ảnh và người gửi có **đúng một** khoản đang hỏi (❓ chưa ✅) → trỏ câu hỏi cuối của bot về khoản đó.
  3. Còn lại thì không trỏ: so-core không nhận làm xác nhận, Claude hỏi lại "khoản nào, ghi #số".

Nhờ vậy quy tắc "xác nhận phải gắn đúng khoản, đúng người gửi" của so-core giữ nguyên, không rẽ nhánh theo nền tảng.

**Sổ:** nhóm Zalo khai `tab` như kênh Discord. Mặc định nhóm đoàn TQ ghi tab **"Đoàn hoạ sĩ TQ T10-2026"** (chung với
kênh Discord của đoàn). Nhóm thử khai `thu: true`:
- có tab riêng ("Thử Zalo");
- **không gộp vào tab quỹ**.

`setup.mjs` khử trùng tên tab khi Discord và Zalo dùng chung một tab, để tab quỹ không cộng hai lần.

**Phiên bot:** `bot-zalo/` (CLAUDE.md riêng, quyền riêng, **không** nạp plugin Discord). Phiên chạy trong tmux `npz` với các cờ:
- `--dangerously-load-development-channels server:npzalo`: channel tự viết chưa nằm trong allowlist.
- `MCP_PROTOCOL_NEGOTIATION=legacy`: channel tự viết phải bắt tay kiểu cũ mới đăng ký được.

Hộp cảnh báo dev-channel hiện mỗi lần khởi động, nên script tự bấm qua. Watchdog và launchd tách riêng (`com.gwt.np.zalo.watchdog`) để không đụng bot Discord.

## Quy định gửi (ghim trong nhóm: `HUONG-DAN-ZALO.md`)

Mỗi khoản là **1 ảnh bill**, nội dung gõ vào **chú thích ảnh**, mở đầu bằng **@Bot GWT CP**.
- Nhiều bill thì gửi nhiều tin.
- Trả lời bot thì cũng mở đầu bằng @Bot. Bot đang hỏi nhiều khoản thì ghi thêm `#số`.

**Tin không có bot trả lời bên dưới là bot chưa thấy** (thường do quên @), gửi lại có @.

## Tình huống

1. **Đủ thông tin:** ghi sổ và báo ✅.
2. **Thiếu hoặc chưa rõ:** bot hỏi một câu kèm đề xuất, ghi `#N` và tên người gửi, nhắc "(trả lời bắt đầu bằng @Bot GWT CP)".
3. **Trả lời câu bot hỏi:** ghi sổ.
4. **Khoản thu:** ghi như khoản chi.
5. **Cá nhân ứng:** sổ tự đánh dấu "Chưa" hoàn.
6. **Tệ hoặc $:** bot hỏi số VND thực trả.
7. **@ mà không có ảnh:** bot nhắc gửi lại ảnh kèm @ trong chú thích, hoặc xác nhận không có bill.
8. **Album:** bot nhắc gửi từng ảnh.
9. **Quên @:** bot không thấy tin (giới hạn của Zalo).
10. **Người khác trả lời hộ:** không tính.
11. **Sửa khoản:** chỉ người gửi, phải có `#N`.
12. **Xoá:** từ chối, nhờ người quản lý sổ.
13. **Hỏi sổ:** ai trong nhóm cũng hỏi được.
14. **Ghi chú có @:** bot trả lời "đã bỏ qua".
15. **Yêu cầu vượt quyền:** từ chối.

## Ngoài phạm vi v1

- Tóm tắt cuối ngày (chủ dự án: chưa cần).
- Gắn thêm ảnh vào khoản đã ghi (`thêm ảnh #N`): bot nhờ người quản lý.
- Đọc tin gửi trước khi bot vào nhóm: Zalo không cho, nên gửi lại hoặc nhập tay.

## Còn phải đo lúc lên máy (Mac mini)

1. `photo_url` có tải được không cần đăng nhập không. Nếu không thì cả `tai_anh` lẫn việc lưu chứng từ đều hỏng.
2. Bot tắt thì tin có được Zalo giữ lại không. Nếu không, tin trong lúc tắt bị mất; kho vẫn giữ những gì đã nhận.
3. Hộp cảnh báo dev-channel bấm qua tự động được không.
