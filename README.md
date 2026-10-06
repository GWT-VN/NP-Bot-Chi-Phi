# NP Bot Chi Phí (v2)

Bot Discord riêng của server **New Projects** (2 kênh: `#chi-phí` và `#chi-phí-tiếp-đoàn-hoạ-sĩ-trung-quốc-tháng-10-2026`; mỗi kênh một tab sổ trong cùng file), chạy 24/7 trên Mac mini như Bắp (Claude Code + plugin Discord). Claude
đọc tin, hỏi lại khi thiếu hoặc chưa rõ, trả lời câu hỏi về sổ. **Ghi sổ chỉ đi qua MCP `npso`**, và MCP này ép luật
1–5 cùng điều kiện "chính người gửi xác nhận". Không có lệnh xoá.

- Spec (vì sao làm thế này): `docs/superpowers/specs/2026-10-05-np-bot-chi-phi-design.md`
- Plan v2: `docs/superpowers/plans/2026-10-05-np-bot-v2.md` · Bản ghim kênh: `HUONG-DAN-NHAN-TIN.md`

## Cấu trúc

| Phần | Vai trò |
|---|---|
| `luat.mjs` | Luật 1–5 + nhận nguồn quỹ (tên chuẩn + tên gọi tắt trong `config.json` `quy`) |
| `so-core.mjs` | 5 lệnh: `kiem_tin`, `ghi_khoan`, `sua_khoan`, `doc_so`, `tin_chua_xu_ly`. Tự đọc lại tin gốc; lệch luật thì bắt buộc có tin xác nhận cùng tác giả, gửi sau, **Reply** vào tin gốc hoặc câu hỏi của bot; ✅ chỉ sau khi ghi |
| `mcp/npso.mjs` | Vỏ MCP, nối Discord REST (token ở `~/.claude/channels/discord-np/.env`), `books.mjs` (Sheet 12 cột A–L), `drive.mjs` |
| `bot/` | Thư mục làm việc của phiên Claude bot: `CLAUDE.md` (vai trò + quy trình), `bot-settings.json` (quyền), `hooks/` |
| `mac/` | `start-bot.sh` (tmux `np`), `watchdog.sh`, `stop-bot.sh`, `cai-launchd.sh` (`com.gwt.np.watchdog`) |
| `scanner.mjs` | Parser v1 (171 ca test), dùng lại làm luật; CLI `--xoadong` / `--suadong` cho người quản lý. Chạy trơn không cờ → từ chối (v2 không quét theo lịch nữa; token đọc từ `~/.claude/channels/discord-np/.env`) |

Code dùng lại từ `GWT-Admin-Portal bots/xet-duyet-chi-phi@da1b637`. Bản vá bên đó **không tự sang đây**:
`git -C ../GWT-Admin-Portal diff da1b637 HEAD -- bots/xet-duyet-chi-phi/scanner.mjs` để đối chiếu.

## Vận hành trên Mac mini (`~/Bots/NP-Bot-Chi-Phi`)

**Cài lần đầu** (các bước dính tài khoản hoặc bí mật do chủ dự án làm):
1. Discord Developer Portal: tạo app **NP Chi Phí**, bật **Message Content Intent**, mời vào server, chỉ cấp quyền ở
   kênh NP (View, Read History, Send, Add Reactions).
2. Token: `mkdir -p ~/.claude/channels/discord-np && read -rs "T?Token: " && print -r "DISCORD_BOT_TOKEN=$T" > ~/.claude/channels/discord-np/.env && chmod 600 ~/.claude/channels/discord-np/.env; unset T`.
3. `~/.claude/channels/discord-np/access.json`:
   `{"dmPolicy":"allowlist","allowFrom":[],"groups":{"<kênh NP>":{"requireMention":false,"allowFrom":[]}}}`.
   **Không** dùng `dmPolicy: "disabled"`: plugin hiểu là bỏ mọi tin.
4. Google: `/usr/bin/python3 lib/google-dang-nhap.py` (dùng client `~/Bots/.secrets/google-client.json`, đăng nhập
   **ai@gwt.vn**; token Sheet + Drive ở `~/Bots/.secrets/np-google-token.json`).
5. `config.json`: điền `channels` (`{ "<id kênh>": { "name", "tab" } }`, mỗi kênh một tab) và `quy`; rồi `node setup.mjs` (tạo Sheet +
   folder Drive, ghi sheetId/folderId).
6. `npm ci && npm test`, rồi `zsh mac/cai-launchd.sh`. Lần đầu `tmux attach -t np`, chọn "Yes, I trust this folder",
   **Ctrl+B rồi D** để thoát.

**Hằng ngày:** `tmux attach -t np` để xem; `zsh mac/stop-bot.sh` để tắt hẳn; khởi động lại bằng
`tmux kill-session -t np && launchctl kickstart gui/$(id -u)/com.gwt.np.watchdog`. Code mới: `git pull` **trên màn
hình** Mac mini (SSH không mở được Keychain), rồi khởi động lại.

**Quỹ chưa chốt (`quy: []`):** luật 5 tắt. Quỹ không bắt buộc; có nhắc thì ghi đúng chữ người gõ (lõi kiểm chữ đó nằm trong
tin, để Claude không bịa tên). Chốt danh sách thì điền `quy` → luật 5 bật lại, quỹ bắt buộc và phải đúng danh sách.

**Thêm kênh:** thêm `{ "<id>": { "name": "...", "tab": "<tên tab>" } }` vào `config.json` `channels` + nhóm kênh vào
`~/.claude/channels/discord-np/access.json` (`requireMention:false`), chạy `node setup.mjs --tab-kenh` (thêm tab sổ +
"Tổng hợp - <tab>", chạy lại vô hại), cấp quyền kênh cho bot trên Discord, khởi động lại bot. Vì sao mỗi kênh một tab: tin
gốc ở kênh đoàn hoạ sĩ yêu cầu "tách riêng"; chủ dự án chọn chung 1 file, mỗi kênh 1 tab (2026-10-06).

**Claude đọc, không so khuôn (chủ dự án chốt 2026-10-06):** bộ đọc luật (`luat.mjs` `kiemLuat`) chỉ còn là gợi ý.
Claude tự chốt thu/chi, số tiền (dòng tổng), hoá đơn (không nhắc = Không), ngày chi ghi trong tin. Lệnh `ghi_khoan` ghi
ngay khi có BẰNG CHỨNG trong chữ tin (`bangChung`: số tiền có trong tin, có chữ thu/chi, có ảnh, hoá đơn không trái tin);
thiếu → phải có Reply của chính người gửi, và số tiền vắng trong tin gốc thì phải có trong tin xác nhận hoặc câu hỏi của bot
(chặn Claude bị dụ gán số cho tin trò chuyện). Tin đánh dấu "note/ghi chú/không ghi sổ" vẫn chặn cứng.

**Chứng từ (ảnh bill)** — cây kiểu kế toán (chủ dự án chốt 2026-10-06, giống "Lưu chứng từ" của admin), gốc là folder
"Chứng từ chi phí New Projects (bot NP)" đặt trong `0. OTHERS - NEW BRANDS / Chi phí` (`config.json` `book.folderId`):
`<tab kênh> / 01. Có HĐ | 02. Không HĐ | 03. Thu / YYYY / MM.YYYY / DD.MM.YYYY / NN. <diễn giải> / ảnh`. Folder giao dịch tra theo msgId
(chạy lại không nhân đôi). Thứ đã tạo tay trong "Chi phí" (shortcut báo cáo…) bot không đụng. Hạn chế: `sua_khoan` đổi
hoá đơn Có↔Không thì ảnh vẫn ở nhánh HĐ cũ — chuyển tay nếu cần.

**Sổ (Google Sheet)** nằm ở gốc My Drive của tài khoản Google bot dùng, không nằm cạnh folder chứng từ — chủ dự án
chốt để nguyên (2026-10-06). Chuyển chỗ thì ID/link không đổi, bot không cần sửa.

**Thêm quỹ:** sửa `config.json` `quy` (MCP đọc lúc khởi động → khởi động lại bot), và thêm vào dropdown cột F trên
Sheet (Data validation). Dropdown chỉ **cảnh báo**, không chặn: quên sửa dropdown thì bot vẫn ghi được.

## Lệnh

```bash
npm test                                            # toàn bộ test (offline)
node scanner.mjs --xoadong=<dòng>:<sốtiền>[:<dd/mm/yyyy>] [--dry]
node scanner.mjs --suadong=<dòng>:<msgId> [--dry]
```
