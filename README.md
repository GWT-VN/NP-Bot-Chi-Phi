# NP Bot Chi Phí

Bot Discord riêng cho kênh **New Projects**: đọc tin thu/chi kèm ảnh, ghi vào Google Sheet "Sổ chi phí New
Projects" (của `ai@gwt.vn`), lưu ảnh chứng từ lên Drive, thả ✅/⚠️/📷/⌛. Chạy GitHub Actions 11:00 · 15:00 · 20:30.

- Spec (vì sao làm thế này): `docs/superpowers/specs/2026-10-05-np-bot-chi-phi-design.md`
- Cách gửi tin (ghim lên kênh): `HUONG-DAN-NHAN-TIN.md`

## Nguồn gốc — đọc trước khi vá parser

Chép rút gọn từ `GWT-Admin-Portal` **`bots/xet-duyet-chi-phi` @ `da1b637`**, chỉ giữ luồng tiền tố thu/chi (kênh chị
Trang). Tên hàm và cấu trúc giữ nguyên **cố ý** để đối chiếu bản vá:

```bash
git -C ../GWT-Admin-Portal diff da1b637 HEAD -- bots/xet-duyet-chi-phi/scanner.mjs
```

Lệnh này cho thấy bên Sổ quỹ đã vá gì kể từ lúc chép. Bản vá **không tự sang đây** và ngược lại. Đó là cái giá đã
chấp nhận khi tách repo, vì chủ dự án muốn sổ này không lẫn vào Admin Portal.

Khác bản gốc (có chủ đích):

- 1 sổ 1 tab, 10 cột: bỏ hoàn ứng, bỏ chọn quỹ (`detectQuy`), bỏ "người thanh toán reply ảnh".
- Không Supabase, không mirror, không DM báo cáo.
- **Lỗi làm workflow ĐỎ.** Bản gốc nuốt lỗi đọc kênh vì còn DM báo cáo làm kênh báo. Ở đây không có DM, nên email
  "workflow failed" của GitHub là kênh báo lỗi duy nhất. Hãy **watch repo** để nhận email.
- Dừng khi chưa bật Message Content Intent, hoặc khi Sheet không ở locale vi_VN.

## Secret (Settings → Secrets → Actions)

| Secret | Lấy ở đâu |
|---|---|
| `DISCORD_BOT_TOKEN` | Bot riêng "NP Chi Phí" (Developer Portal → Bot). Phải bật **Message Content Intent** |
| `GOOGLE_OAUTH_CREDENTIALS_JSON` | Nội dung `credentials.json`: OAuth client "Desktop app" của dự án Google Cloud mà bot Sổ quỹ đang dùng |
| `GOOGLE_OAUTH_TOKEN_JSON` | Nội dung `token.json` sau khi chạy `node lib/auth.mjs` và đăng nhập **ai@gwt.vn** |

Hai bot dùng chung OAuth client nhưng mỗi bot có refresh token riêng. Consent screen phải ở chế độ **Internal/Production**.
Để ở Testing thì token hết hạn sau 7 ngày, và cả hai bot cùng ngừng ghi.

## Lệnh

```bash
npm test                                             # test offline
node setup.mjs                                       # 1 lần: tạo Sheet + folder, ghi id vào config.json
node scanner.mjs --dry                               # xem trước, không ghi / react / lưu Drive
node scanner.mjs                                     # chạy thật
node scanner.mjs --requet=<msgId|link>               # chấm lại 1 tin theo luật hiện tại
node scanner.mjs --xoadong=<dòng>:<sốtiền>[:<dd/mm/yyyy>] [--dry]   # xoá dòng ghi nhầm (đối chiếu số tiền)
node scanner.mjs --suadong=<dòng>:<msgId> [--dry]   # ghi lại Diễn giải + Ghi chú từ tin gốc
```

Chạy tay trên Actions: tab Actions → "Sổ chi phí New Projects" → Run workflow, điền `args`. Lưu ý `--xoadong`/
`--suadong` không được có dấu cách.

## Thêm kênh / đổi tên người

- `config.json` → `channels`: `{ "<channelId>": { "name": "…" } }`. Bot phải được mời vào kênh với quyền View Channel,
  Read Message History, Send Messages, Add Reactions.
- `config.json` → `persons`: `{ "<userId>": "Tên" }` để cột Người hiện tên cố định thay vì tên Discord.
