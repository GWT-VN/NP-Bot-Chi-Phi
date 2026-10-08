# Dịch vụ bot NP (`np-dichvu`) — thiết kế (2026-10-08)

Thay phần **chạy** của `2026-10-07-np-bot-zalo-design.md`: channel Claude Code, tmux, watchdog, script bấm hộp thoại, kho
JSONL. Phần nghiệp vụ của bản đó vẫn giữ: quy định gửi, 15 tình huống, luật hiểu trả lời, đo thật Zalo.

> **Rút gọn theo ponytail (2026-10-08, chủ dự án cài ponytail):** giữ nguyên mọi tính năng đã duyệt, bỏ phần thừa —
> 7 file thay 15 (bảng "Thành phần" dưới đây đã gộp), 4 bảng thay 6 (`canh_bao`, `nhom_la` chỉ là mốc giờ → bảng `moc`),
> bỏ `zalo/nhom.mjs` (lệnh `node dichvu/chinh.mjs --kiem-tra` hiện nhóm chưa khai).

## Mục tiêu

- Chạy **lâu dài, không cần người canh**: tự bật lại khi chết; khởi động lại không mất tin; không có chỗ nào phải "đoán màn hình".
- **Chuẩn ngành**:
  - một dịch vụ nền, adapter cho từng nền tảng;
  - CSDL có ràng buộc thay file;
  - hàng đợi ít-nhất-một-lần với công cụ chống ghi trùng;
  - hộp thư gửi có thử lại;
  - một nơi ghi Sheet/Drive;
  - nhật ký có cấu trúc, cảnh báo chủ động.

## Quyết định đã chốt với chủ dự án

| # | Quyết định |
|---|---|
| 1 | Gọi Claude bằng **`claude -p --bare`**, mỗi việc một lần, dùng **gói claude.ai** qua token 1 năm `claude setup-token` (biến `CLAUDE_CODE_OAUTH_TOKEN`). Không dùng API key, không dùng channel. |
| 2 | **Giai đoạn 1: Zalo** chạy trên dịch vụ mới; bot Discord giữ nguyên. **Giai đoạn 2** (spec riêng, sau đoàn TQ): thêm adapter Discord, tắt bot Discord kiểu Claude Code + plugin, bỏ khoá Drive. |
| 3 | Cảnh báo gửi vào **một nhóm Zalo "vận hành"** có bot. Ai nhận thì do thành viên nhóm quyết định. |

## Sự thật đã kiểm (tài liệu Claude Code, 2026-10-08)

- `-p` không hiện hộp tin cậy thư mục hay hộp duyệt MCP. Công cụ chưa được cho phép thì bị từ chối, không treo.
- `--bare` bỏ qua CLAUDE.md, plugin, hook, MCP tự dò, bộ nhớ, cài đặt người dùng. Chế độ này **không đọc Keychain**, chỉ đọc
  `CLAUDE_CODE_OAUTH_TOKEN` / `ANTHROPIC_API_KEY` từ biến môi trường. Công cụ có sẵn chỉ còn Bash, Read, Edit.
- `--mcp-config` nhận server `{"type":"http","url":...,"headers":{...}}`. `--strict-mcp-config` chỉ dùng server trong file đó.
- `--max-turns`, `--output-format json` (`subtype`: `success` / `error_max_turns` / `error_during_execution`…),
  `--no-session-persistence`, `--permission-mode dontAsk`, `--allowedTools`, `--tools`, `--system-prompt`, `--model`, `--add-dir`.
- **Chưa có tài liệu:** Read đọc được ảnh (thị giác) ở chế độ `-p`. → Kiểm chứng đầu tiên (§Kiểm chứng).

## Kiến trúc

```
Zalo ──getUpdates──▶ adapter Zalo ──▶ CSDL SQLite ──▶ hàng đợi việc ──▶ worker (1 việc/lúc) ──▶ claude -p --bare
                      tải ảnh ngay     tin·viec·gui·moc                                             │ MCP HTTP + token việc
                                                         cổng công cụ (127.0.0.1) ◀─────────────────┘
                                                          kiem_tin · ghi_khoan · sua_khoan · doc_so · tra_loi
                                                                │ chạy TRONG dịch vụ
                                       lõi sổ dùng chung (so-core · books · drive) ──▶ Google Sheet / Drive
                                       hộp thư gửi ──gửi + thử lại──▶ Zalo (nhóm sổ, nhóm vận hành)
```

### Thành phần (`dichvu/`)

| File | Việc duy nhất |
|---|---|
| `csdl.mjs` | Mở SQLite (`node:sqlite`, WAL, khoá ngoại), nâng phiên bản cấu trúc, bảng `tin` + **luật hiểu trả lời** (chuyển từ `zalo/kho.mjs`), mốc giờ (`moc`), và adapter "dáng tin Discord" cho so-core (`layTin`, `layTinKenh`, `react`, `unreact`, `link`). |
| `zalo.mjs` | Adapter Zalo: lọc + chuẩn hoá cập nhật, lưu tin + việc trong một giao dịch, tải ảnh (kiểm `content-type` ảnh), ghi nhóm chưa khai vào `moc`. |
| `hop-thu.mjs` | Hộp thư gửi (thứ tự, thử lại, ghi tin bot, `dang_hoi` khi câu hỏi đã gửi được) + cảnh báo (chống lặp 30 phút qua `moc`, kiểm định kỳ). |
| `claude.mjs` | Dựng lệnh `claude -p`, chạy (chương trình truyền vào được, để test dùng claude giả), giới hạn thời gian, phân loại kết quả. |
| `cong-cu.mjs` | Server MCP Streamable HTTP trên `127.0.0.1:<cổng>`: kiểm token → biết việc → biết nhóm. 5 công cụ. |
| `hang-doi.mjs` | Gói ngữ cảnh + worker: lấy việc, gọi Claude, xếp lịch thử lại / `that_bai`, gửi "Đã nhận #N" khi Claude im lặng. |
| `chinh.mjs` | Điểm vào + cấu hình/bí mật/thư mục, nhật ký JSON, bảo trì (sao lưu `VACUUM INTO` giữ 14, dọn ảnh/nhật ký quá 30 ngày), lệnh `--kiem-tra`, giữ cổng (một bản chạy), các vòng lặp, tắt gọn khi SIGTERM. |
| `loi-dan.md` | Lời dặn hệ thống cho Claude (từ `bot-zalo/CLAUDE.md`, bỏ phần channel). |

Dùng lại không đổi: `so-core.mjs`, `books.mjs`, `drive.mjs`, `luat.mjs`, `lib/khoa.mjs` (tạm), `zalo/api.mjs`, `setup.mjs`.
Bỏ: `mcp/npzalo.mjs`, `zalo/kho.mjs`, `zalo/nhom.mjs`, `bot-zalo/`, `mac/*-zalo.sh`, `mac/chon-canh-bao.sh`.

## CSDL (`~/Bots/np-dichvu/np.sqlite`)

```sql
tin(id TEXT PRIMARY KEY,            -- số, tăng theo thời gian: date_ms*1000 + thứ tự (so-core so sánh BigInt)
    nen_tang TEXT, chat_id TEXT, ma INTEGER,          -- ma = #N theo nhóm, chỉ tin người dùng
    msg_goc TEXT,                                     -- mã tin của nền tảng
    nguoi_id TEXT, ten TEXT, la_bot INTEGER,
    noi_dung TEXT, noi_dung_goc TEXT, luc INTEGER,    -- luc: ms
    anh_url TEXT, anh_tep TEXT, anh_tt TEXT,          -- anh_tt: khong_co | cho_tai | da_tai | loi:<lý do>
    tra_loi_cho TEXT REFERENCES tin(id), kieu_tra_loi TEXT,   -- '#N' | 'suy_ra'
    trang_thai TEXT,                                  -- tin người dùng: moi | dang_hoi | da_ghi | bo_qua
    UNIQUE(nen_tang, msg_goc), UNIQUE(chat_id, ma))
viec(id INTEGER PRIMARY KEY, tin_id TEXT UNIQUE REFERENCES tin(id),
     trang_thai TEXT,                                 -- cho | dang_chay | xong | that_bai
     so_lan INTEGER, sau_luc INTEGER, loi_cuoi TEXT, ket_qua TEXT, tao_luc INTEGER, xong_luc INTEGER)
gui(id INTEGER PRIMARY KEY, chat_id TEXT, thu_tu INTEGER, noi_dung TEXT,
    hoi_ve TEXT REFERENCES tin(id), viec_id INTEGER REFERENCES viec(id), loai TEXT,  -- tra_loi | da_ghi | canh_bao | da_nhan | that_bai
    trang_thai TEXT, so_lan INTEGER, sau_luc INTEGER, msg_goc TEXT, loi_cuoi TEXT, tao_luc INTEGER)
moc(khoa TEXT PRIMARY KEY, luc INTEGER, ghi_chu TEXT)   -- nhan_zalo_ok · claude_ok · canh_bao:<khoá> · nhom_la:<chat_id> (ghi_chu: người, ví dụ)
phien_ban(so INTEGER)
```

**Luật hiểu trả lời.** Giữ nguyên luật đã sửa theo review C1/I1/I2:
1. `#N` của **chính người gửi** thì trỏ tin đó. Tin ảnh: chỉ khi chú thích mở đầu bằng `#N`. `#N` của người khác thì không trỏ gì.
2. Tin chữ, người gửi có **đúng một** khoản `dang_hoi` trong 48 giờ thì trỏ câu hỏi cuối của bot về khoản đó (`suy_ra`).
3. Còn lại thì không trỏ.

**Trạng thái khoản ↔ so-core:**
- `react ✅` → `da_ghi`.
- `react ❓` → `dang_hoi`.
- `unreact ❓` → về `moi` (trừ khi đã `da_ghi`).
- Adapter trả `reactions` / `message_reference` đúng dáng so-core đọc.
- Tin `dang_hoi` trả cho `layTinKenh` thì không kèm Reply suy ra.

## Luồng

1. **Nhận** (vòng long-poll):
   - Bỏ và ghi lại các trường hợp sau:
     - sự kiện không phải `message.text/image.received`;
     - tin riêng;
     - tin từ nhóm vận hành;
     - nhóm chưa khai: ghi `moc` `nhom_la:<chat_id>`.
   - Trong **một giao dịch**: lưu tin (trùng `msg_goc` thì bỏ), áp luật hiểu trả lời, tạo việc `cho`. Rồi tải ảnh về `anh/<id>.jpg`, cập nhật `anh_tt`.
   - Một cập nhật hỏng không làm mất các cập nhật khác cùng lượt.
2. **Worker:** lấy việc `cho` cũ nhất có `sau_luc ≤ bây giờ` và ảnh đã xong (`anh_tt ≠ cho_tai`) → `dang_chay` → gọi Claude.
   - **Thành công:**
     - việc `xong`;
     - Claude không ghi sổ, không bỏ gì vào hộp thư → bỏ "Đã nhận #N." vào hộp thư.
   - **Lỗi:**
     - Thử lại sau 1, 5, 15 phút. Sau lần thử thứ 4 vẫn lỗi → `that_bai`, cảnh báo vận hành, và báo vào nhóm "Khoản #N chưa xử lý được, đã báo người quản lý."
     - Lỗi đăng nhập hoặc chạm giới hạn gói → cảnh báo, chờ 30 phút.
3. **Công cụ:** chạy trong dịch vụ, phạm vi = nhóm của việc.
   - `ghi_khoan` / `sua_khoan` thành công → bỏ "✅ #N tên · tóm tắt" / "✏️ Đã sửa #N" vào hộp thư.
   - `tra_loi(text, hoi_ve?, bo_hoi?)` → bỏ vào hộp thư (cắt ≤ 2000 ký tự / đoạn).
   - `bo_hoi` → khoản đó về `moi` ngay.
4. **Hộp thư:** gửi theo `thu_tu` từng nhóm.
   - Gửi được → lưu tin bot (`tra_loi_cho = hoi_ve` ở đoạn đầu), khoản `hoi_ve` sang `dang_hoi` (nếu chưa `da_ghi`).
   - Lỗi → thử lại 1, 5, 15 phút; vẫn lỗi → `that_bai` + cảnh báo.
5. **Khởi động lại:** việc `dang_chay` → `cho`. Lần chạy lại, gói ngữ cảnh có mục "đã gửi ở lần chạy trước".

## Gọi Claude

```
claude -p <gói ngữ cảnh> --bare --model <cfg> --system-prompt <dichvu/loi-dan.md>
  --tools Read --add-dir <thư mục ảnh> --allowedTools "mcp__np__kiem_tin mcp__np__ghi_khoan mcp__np__sua_khoan mcp__np__doc_so mcp__np__tra_loi Read(<thư mục ảnh>/**)"
  --mcp-config '{"mcpServers":{"np":{"type":"http","url":"http://127.0.0.1:<cổng>/mcp","headers":{"Authorization":"Bearer <token việc>"}}}}'
  --strict-mcp-config --permission-mode dontAsk --max-turns <cfg> --output-format json --no-session-persistence
cwd: ~/Bots/np-dichvu/chay (trống) · env: CLAUDE_CODE_OAUTH_TOKEN, PATH, HOME · quá <cfg> giây → giết cả nhóm tiến trình
```

- **Token việc:** ngẫu nhiên 32 byte, chỉ sống trong lúc việc chạy.
- **Công cụ không có tham số `chat_id`**: nhóm luôn là nhóm của việc. `message_id` truyền vào phải thuộc nhóm đó. Không có lệnh xoá.
- **Gói ngữ cảnh** gồm:
  - việc / nhóm / tab;
  - tin mới (#N, người, giờ, đường dẫn ảnh hoặc lý do không có, nội dung);
  - "trả lời cho" (khoản, kiểu, nội dung, ảnh, câu bot đã hỏi);
  - các khoản đang hỏi của người này;
  - "đã gửi ở lần chạy trước";
  - kết quả bộ đọc luật (`kiemTin`) chạy sẵn;
  - danh sách quỹ.

## Vận hành

- **launchd** `com.gwt.np.dichvu` (LaunchAgent, `KeepAlive`, `RunAtLoad`). Dịch vụ giữ cổng cố định nên bản thứ hai tự thoát.
- **Thư mục:**
  - bí mật: `~/Bots/.secrets/np-dichvu.env` (quyền 600): `ZALO_BOT_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_TOKEN_NGAY_TAO` (YYYY-MM-DD);
  - dữ liệu: `~/Bots/np-dichvu/` (`np.sqlite`, `anh/`, `sao-luu/`, `chay/`, `logs/`). Đổi được bằng `NP_DICHVU_DIR`.
- **Cấu hình** `config.json`:
  - `zalo.tenBot`, `zalo.groups`, **`zalo.nhomVanHanh`**;
  - **`dichvu`**: `{ cong: 8790, model: "claude-sonnet-5-5", maxTurns: 12, thoiGianToiDaGiay: 240 }`.
- **Cảnh báo** (nhóm vận hành, cùng khoá không lặp trong 30 phút):
  - không nhận được Zalo quá 5 phút;
  - việc `that_bai`;
  - Claude lỗi đăng nhập hoặc chạm giới hạn gói;
  - token Claude còn dưới 30 ngày;
  - ghi Sheet/Drive lỗi, hoặc ghi xong mà chưa lưu được ảnh;
  - việc chờ quá 15 phút;
  - tin gửi `that_bai`.
  Chưa khai `nhomVanHanh` thì chỉ ghi nhật ký và lệnh `--kiem-tra` hiện cảnh báo.
- **Cập nhật:** `git pull && npm ci && launchctl kickstart -k gui/$(id -u)/com.gwt.np.dichvu`.

## Kiểm thử

Mọi test chạy offline, kèm toàn bộ test hiện có của bot Discord:
- CSDL và luật trả lời: chuyển nguyên test kho, gồm các ca C1/I1/I2, ghi đè đúng 1 lần, khởi động lại;
- hàng đợi: thử lại, `that_bai`, khôi phục `dang_chay`;
- hộp thư: thứ tự, thử lại, `dang_hoi` chỉ sau khi gửi được;
- cổng công cụ: token sai, token việc A chạm khoản nhóm B, không có `chat_id`, không lệnh xoá;
- gói ngữ cảnh;
- adapter Zalo: lọc, ảnh 403 / HTML / lỗi mạng;
- cảnh báo: chống lặp, token sắp hết hạn;
- **đầu cuối**: Zalo giả + **chương trình `claude` giả**. Chương trình này đọc `--mcp-config`, gọi công cụ qua HTTP theo kịch bản, in JSON như `-p`. Chạy các tình huống 1, 2, 3, 7, 10, 11, 12 cùng ca "Claude im lặng" và "Claude lỗi 4 lần".

## Kiểm chứng (trước khi viết phần còn lại)

1. **MacBook:** `claude -p` (đăng nhập sẵn) đọc 1 ảnh bill và gọi 1 công cụ qua MCP HTTP. Không đạt thì DỪNG, bàn lại.
2. **Mac mini, khi lên máy:**
   - `node -v` ≥ 22.13 (cho `node:sqlite`; thấp hơn thì nâng Node qua Homebrew);
   - `claude setup-token` (chủ dự án tự chạy, tự lưu vào file bí mật) + `claude -p --bare` chạy được;
   - `photo_url` tải được, đơn vị `date`, định dạng ID nhóm;
   - tin gửi lúc dịch vụ tắt có còn không.

## Ngoài phạm vi giai đoạn 1

- Adapter Discord (giai đoạn 2).
- Email làm đường cảnh báo dự phòng.
- Tóm tắt cuối ngày.
- Gắn thêm ảnh vào khoản đã ghi.
