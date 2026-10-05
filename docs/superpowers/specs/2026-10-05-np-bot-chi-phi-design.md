# NP Bot Chi Phí — thiết kế

Ngày: 2026-10-05 · Trạng thái: chờ duyệt spec

## 1. Mục đích

Kênh Discord **New Projects** (NP) cần một bot ghi sổ chi phí. Người nhắn gửi tin thu/chi kèm ảnh, bot ghi vào **một
file Google Sheet riêng**. Lời yêu cầu gốc:

> ơi em add bot vào đây tổng hợp chi phí giúp chị nhé (chỉ có chi ko có thu), tách riêng 1 file
> 1. Ghi rõ là Thu hay Chi · 2. Ghi rõ số tiền · 3. Gửi tin nhắn + ảnh trong 1 tin (bot quét 1 lượt và lưu lại)
> 4. Có hoá đơn đỏ thì note lại, bot mặc định hiểu là không có hoá đơn đỏ

Thành công = mỗi tin hợp lệ trong kênh thành đúng một dòng trong Sheet, có ảnh chứng từ lưu Drive. Tin sai cú pháp
không lọt vào sổ: bot đánh dấu để người nhắn sửa.

## 2. Quyết định đã chốt (và vì sao)

| Quyết định | Lý do |
|---|---|
| **Ghi cả thu lẫn chi**, đầu tin bắt buộc `thu`/`chi` | Lời yêu cầu nói "chỉ có chi" nhưng quy định lại bắt ghi rõ Thu/Chi. Chủ dự án chốt: hiện chủ yếu là chi, nhưng sổ phải ghi được thu, và bắt gõ tiền tố để khoản thu không bị ghi nhầm thành chi. |
| **Tách hẳn khỏi Admin Portal**: repo riêng, bot Discord riêng (token riêng), không có khoá Supabase | "Tách riêng ra một file, không lẫn vào Admin Portal". Dữ liệu chỉ nằm ở Sheet. Bot riêng thì lộ hay thu hồi token chỉ ảnh hưởng một bot, và bot chỉ được mời vào đúng kênh NP. |
| **Chép rút gọn** từ bot Sổ quỹ (`GWT-Admin-Portal/bots/xet-duyet-chi-phi`, commit gốc `da1b637`), chỉ giữ luồng kênh chị Trang (`loaiTuTienTo`) | Luồng đó khớp gần y nguyên quy định trên và đã có nhiều bản vá thực chiến (sửa tin 7 ngày, chống trùng, 429, đọc hoá đơn có phủ định). **Cái giá phải chấp nhận:** hai bản code đi riêng. Bản vá parser bên Sổ quỹ không tự sang đây và ngược lại. Muốn đối chiếu thì diff với commit gốc. |
| **Bỏ hoàn ứng** (cột Đã hoàn ứng / Ngày hoàn / Link hoá đơn) | Đây là sổ chi phí dự án, không phải quỹ tạm ứng chờ công ty hoàn. |
| **Thêm tab Tổng hợp theo tháng**, làm bằng công thức Sheet chứ không bằng code | Đúng ý "tổng hợp chi phí", tự cập nhật, không thêm việc cho bot. |
| **Không DM báo cáo, không mirror portal** | Chủ dự án chốt "tạo sheet mới, không thêm gì". |
| Sheet và folder Drive do **`ai@gwt.vn`** tạo | Tài khoản chung của GWT. OAuth hiện có đã có scope `spreadsheets` + `drive`. |
| Chạy **GitHub Actions** cron 11:00 · 15:00 · 20:30 giờ VN, cửa sổ 7 ngày | Không phụ thuộc máy nào bật. Giữ lịch và cửa sổ của bot cũ để lời hứa "sửa trong 7 ngày" còn đúng. |

## 3. Cú pháp tin nhắn (luật bot)

```
chi: Mua vật tư mẫu cho dự án X 1.250.000đ có hoá đơn đỏ     + ảnh trong CÙNG tin
thu: Hoàn tiền cọc 2tr                                        + ảnh
```

- **Tiền tố**: `thu`/`chi` ở đầu tin, có hoặc không có dấu `:`. Dạng trần "chi mua…" vẫn nhận, như kênh chị Trang.
  Thiếu tiền tố thì ⚠️, không ghi.
- **Số tiền** phải có `đ`/`₫` hoặc dấu chấm ngăn nghìn, hoặc đơn vị `k`/`tr`/`triệu`: `350.000đ`, `500k`, `1tr5`.
  Gõ `350000` trơn thì bot bỏ qua. Nhiều số tiền trong tin thì phải có `tổng <số>`, không thì ⚠️.
- **Hoá đơn đỏ**, giữ nguyên `detectHoaDon` của bản gốc:
  - không nhắc tới hoá đơn → **Không**
  - `có hoá đơn (đỏ)` / `có hđ` / `có xuất hoá đơn` → **Có**
  - `không có hoá đơn`, `ko hđ` → **Không**
  - nhắc lấp lửng (`đang chờ hoá đơn`, `hoá đơn về sau`) → ⚠️ hỏi lại
  - Nhận cả `hóa` lẫn `hoá`.
  - **Lỗ đã biết, cố ý không vá:** "VAT" không được hiểu là có hoá đơn, và gõ không dấu thì không bắt được. Bản ghim
    kênh dặn phải gõ có dấu.
- **Ảnh**: nằm trong cùng tin. Thiếu ảnh thì 📷, không ghi. Ảnh lưu Drive làm bằng chứng, bot **không đọc** ảnh.
- **Ngày** = ngày nhắn tin vào kênh. **Reply không bao giờ là giao dịch.**
- **1 tin = 1 khoản.**

| Dấu | Nghĩa |
|---|---|
| ✅ | Đã ghi sổ |
| ⚠️ + 1 tin rep | Chưa ghi (thiếu tiền tố, không thấy hoặc thấy nhiều số tiền, hoá đơn mơ hồ). Sửa thẳng tin trong 7 ngày là bot tự ghi, không gửi lại. Ghi được rồi thì bot gỡ ⚠️ và xoá tin rep |
| 📷 | Có số tiền nhưng thiếu ảnh. Không rep để tránh spam |
| ⌛ | Tin ⚠️ quá 7 ngày, bot không ghi nữa |

## 4. Google Sheet "Sổ chi phí New Projects"

Locale **vi_VN**, múi giờ **Asia/Ho_Chi_Minh**. Phải đặt hai giá trị này lúc tạo file. Bot ghi ngày dạng `dd/mm/yyyy`
với `USER_ENTERED`: Sheet để locale en_US sẽ đọc `05/10/2026` thành 10 tháng 5. Dấu ngăn tham số công thức vẫn hỏi
locale của file (`argSepFor`, giữ từ bản gốc).

**Tab `Sổ chi phí`**, dòng 1 là tiêu đề, cố định dòng 1:

| Cột | A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|---|
| Tên | STT | Ngày | Diễn giải | Người | Hoá đơn đỏ | Thu | Chi | Tồn | Link chứng từ | Ghi chú |
| Giá trị | `=ROW()-1` | ngày nhắn | nội dung đã bỏ tiền tố + số tiền | tên Discord người nhắn | Có/Không; dòng thu ghi "—" | số | số | Σthu − Σchi từ dòng 2 tới dòng này | link folder Drive | ghi chú từ tin |

Số dư đầu kỳ, nếu có, người dùng tự nhập vào dòng 2 (cột Thu). Không nhập thì Tồn chỉ tính phát sinh từ ngày bot chạy.

**Tab `Tổng hợp`**: chỉ công thức, setup tạo một lần. Mỗi tháng có phát sinh là một dòng: Tháng · Tổng thu · Tổng
chi · Chi có HĐ đỏ · Chi không HĐ đỏ · Số khoản chi. Tháng mới tự hiện ra, không cần bot làm gì.

**Tab `_state`** (cột D = ID tin đã ghi, để chống trùng) và **`_rep`** (A msgId · B id tin rep · C lý do) do bot tự
quản lý. Ẩn hai tab này và ghi chú "không sửa tay".

**Folder Drive "Chứng từ New Projects"**: giữ cây của `drive.mjs` gốc, bỏ cấp quỹ:
`<gốc>/<yyyy.mm>/<Thu|Chi>/<NN. nội dung>/` chứa ảnh, tối đa 5 ảnh/tin, 4,5MB/ảnh. Ảnh đã có trong folder thì không
tải lại (lượt trước lưu Drive xong nhưng ghi sổ gãy).

## 5. Kiến trúc repo

```
config.json        guildId, channelId (kênh NP), sheetId, folderId, tên tab. Không bí mật, commit thẳng
scanner.mjs        quét kênh → parseEntry → ghi sổ → lưu ảnh → react/rep; lệnh sửa tay --requet/--xoadong/--suadong
book.mjs           ghi Sheet 1 sổ 1 tab: buildRow (10 cột), loadProcessed, commit, _rep, xoaDong/suaDong
drive.mjs          lưu ảnh vào folder Drive
lib/discord.mjs    REST Discord (fetch tin, phân trang, 429)
lib/google-auth.mjs  OAuth ai@gwt.vn từ env GOOGLE_OAUTH_*_JSON hoặc file
setup.mjs          chạy 1 lần: tạo Sheet (locale, 4 tab, tiêu đề, định dạng, công thức Tổng hợp) + folder, in ID ra
test-parser.mjs    test offline (npm test)
.github/workflows/scan.yml
README.md · HUONG-DAN-NHAN-TIN.md (bản ghim kênh)
```

**Chép gì, bỏ gì** so với `bots/xet-duyet-chi-phi@da1b637`:

| Giữ | Bỏ |
|---|---|
| `parseMoney`/`extractAmount`/`extractUsd`, `moTaTuText`, `detectHoaDon`, tiền tố thu/chi | `detectQuy` (chọn tab tạm ứng/tiền mặt của quỹ chị Hiền), `splitQuy`, tab `loai` cố định theo kênh |
| Cửa sổ 7 ngày + dải ân hạn ⌛, 📷 thiếu ảnh, ⚠️ + rep + xoá rep khi đã ghi | `_payers` / `laReplyDinhAnh` (reply ảnh = chứng từ thanh toán) |
| Chống trùng `_state`, reply ≠ giao dịch, retry 429, `--dry`, `--days`, `--since`, `--limit` | `mirror.mjs`, `sb.mjs`, mọi đường Supabase |
| `--requet`, `--xoadong`, `--suadong`, đổi cột theo bố cục 10 cột | `report.mjs` + DM, `REPORT_RECIPIENTS` |
| `argSepFor`/`localizeRows` | File legacy: `sheets.mjs`, `setup-books.mjs`, `prep.mjs`, `build-drive-tree.mjs`, `SKILL.md`, `buildLADRow` |

`config.json` chỉ khai **một** kênh. Tin từ kênh khác không bao giờ được đọc, vì bot chỉ fetch đúng `channelId`.

## 6. Bí mật và quyền

| Secret (GitHub Actions) | Ai đặt | Ghi chú |
|---|---|---|
| `DISCORD_BOT_TOKEN` | Chủ dự án tự `gh secret set` | Bot Discord **mới**. Bật Message Content Intent. Chỉ cấp quyền ở kênh NP: View Channel, Read Message History, Send Messages, Add Reactions |
| `GOOGLE_OAUTH_CREDENTIALS_JSON`, `GOOGLE_OAUTH_TOKEN_JSON` | Agent đặt từ bản đang dùng của bot Sổ quỹ | Refresh token của `ai@gwt.vn`. **Phụ thuộc chung:** token bị thu hồi thì bot NP và bot Sổ quỹ cùng ngừng, cách cấp lại như nhau (`node lib/auth.mjs`) |

Không có khoá Supabase hay khoá ERP nào. Workflow chạy với `permissions: contents: read`.

## 7. Lỗi và giám sát

- Ghi Sheet lỗi thì tin **không** được đánh dấu đã xử lý, lượt sau tự ghi lại. Không mất khoản, không ghi trùng.
- Lưu Drive lỗi thì vẫn ghi dòng nhưng để trống cột link và log cảnh báo, như bản gốc.
- Workflow fail thì GitHub gửi email cho người watch repo. Không có kênh báo lỗi nào khác.
- `concurrency` không huỷ lượt đang chạy, để hai lượt không ghi chồng.
- Log nằm trong output của run Actions. Runner xoá file sau khi chạy nên không trông vào `logs/`.

## 8. Kiểm thử

- `test-parser.mjs`: chép các nhóm test còn áp dụng (số tiền, USD, tiền tố thu/chi, hoá đơn gồm phủ định/treo/trần/
  dấu câu/gạch dưới, reply, 📷, nenRep/repText). Bỏ nhóm detectQuy và payers.
- Test mới: `buildRow` ra đúng 10 cột (dòng thu thì Hoá đơn "—" và Chi rỗng; dòng chi có/không HĐ), `xoaDong`/
  `suaDong` đối chiếu đúng cột Thu/Chi/Ghi chú theo bố cục mới, và `có hoá đơn đỏ` ra "Có".
- Workflow chạy `npm test` trước bước quét. Test đỏ thì không quét.
- Nghiệm thu: `scanner.mjs --dry` trên kênh thật (không ghi, không react), rồi một tin thử thật có ✅ và đúng dòng
  trong Sheet, rồi mới bật cron.

## 9. Triển khai

1. Viết code + test (repo này).
2. Kiểm token OAuth đúng là `ai@gwt.vn` (`oauth2.userinfo` hoặc `drive.about.get`), rồi chạy `setup.mjs` và điền ID
   vào `config.json`.
3. Chủ dự án tạo bot Discord, mời vào server, cấp quyền kênh NP, `gh secret set DISCORD_BOT_TOKEN`. Agent đặt 2
   secret Google.
4. `workflow_dispatch` với `--dry`, soi log.
5. Chạy thật một lượt, kiểm Sheet. Cron tự chạy sau khi merge vào `main`.
6. Ghim `HUONG-DAN-NHAN-TIN.md` lên kênh. Chia sẻ Sheet cho người cần xem, việc này do chủ dự án quyết.

## 10. Ngoài phạm vi

DM báo cáo, mirror portal, đọc ảnh (vision), nhiều kênh hoặc nhiều sổ, nhận "VAT"/chữ không dấu, đồng bộ bản vá với
bot Sổ quỹ.
