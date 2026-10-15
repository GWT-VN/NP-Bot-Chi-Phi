# Handoff — Bot Zalo mới chạy bằng tài khoản ChatGPT (Codex)

Ngày: 2026-10-15 · Trạng thái: **chờ mô tả nghiệp vụ** — chưa viết code.

## Mục tiêu

Dựng một bot Zalo mới, **việc khác** với bot NP chi phí, nhưng cùng khung vận hành:
bot đọc tin trong nhóm Zalo → giao cho AI xử lý → AI gọi công cụ → bot trả lời trong nhóm.
Khác duy nhất ở "bộ não": dùng **Codex CLI đăng nhập bằng gói ChatGPT** thay cho
`claude -p` dùng gói claude.ai — chi phí nằm trong hạn mức gói, không trả theo token.

## Khung có sẵn để dùng lại (repo NP-Bot-Chi-Phi, nhánh `zalo`)

| File | Vai trò | Dùng lại |
|---|---|---|
| `dichvu/chinh.mjs` | dựng service, vòng chạy | giữ khung |
| `dichvu/zalo.mjs`, `zalo/api.mjs` | nhận/gửi tin Zalo Bot Platform (getUpdates, sendMessage, photo_url) | giữ nguyên |
| `dichvu/hop-thu.mjs`, `dichvu/hang-doi.mjs` | hộp thư + hàng đợi việc, outbox, dừng hàng khi hết hạn mức | giữ nguyên |
| `dichvu/csdl.mjs` | SQLite (`node:sqlite`): tin / viec / gui / canh_bao | giữ schema lõi, thêm bảng nghiệp vụ |
| `dichvu/claude.mjs` | gọi `claude -p` mỗi việc | **thay** bằng runner `codex exec` |
| `dichvu/cong-cu.mjs` | công cụ MCP qua HTTP, token theo từng việc | giữ cơ chế, đổi bộ công cụ |
| `dichvu/loi-dan.md` | lời dặn cho AI | viết mới theo nghiệp vụ |
| `dichvu/chung-tu.mjs`, `so-core.mjs`, `luat.mjs`, `books.mjs`, `drive.mjs` | nghiệp vụ chi phí | **không dùng** |
| `mac/cai-dichvu.sh`, `mac/cai-launchd.sh` | cài service launchd trên Mac mini | chép, đổi tên service |

Thiết kế gốc: `docs/superpowers/specs/2026-10-08-np-dichvu-design.md`.

Quyết định mở: bot mới là **repo riêng** (chép khung) hay **service thứ hai trong repo này**
(tách lõi chung ra `lib/`). Mặc định đề xuất: repo riêng — hai nghiệp vụ không dính nhau.

## Đổi "bộ não" sang ChatGPT

| | Bot NP (Claude) | Bot mới (ChatGPT) |
|---|---|---|
| Lệnh chạy không người | `claude -p` | `codex exec` |
| Đăng nhập theo gói | `claude setup-token` (CLAUDE_CODE_OAUTH_TOKEN) | `codex login` bằng tài khoản ChatGPT |
| Đọc ảnh | có | có (đính kèm ảnh) — cần thử |
| MCP qua HTTP | có | khai trong `~/.codex/config.toml` — cần thử |
| Cách ly cấu hình | `CLAUDE_CONFIG_DIR` riêng | `CODEX_HOME` riêng — cần thử |

**Bước đầu tiên bắt buộc (spike, giống spike Claude ngày 08/10):** trên Mac mini,
`codex exec` đọc 1 ảnh mẫu + gọi 1 công cụ MCP HTTP + trả JSON. Chưa qua spike thì chưa làm tiếp.
Kiến thức về Codex CLI ở thời điểm viết có thể đã cũ — kiểm cờ lệnh thật bằng `codex exec --help`.

## Rủi ro đã biết

- **Điều khoản gói thuê bao:** gói ChatGPT/claude.ai dành cho người dùng thao tác; service tự chạy
  lâu dài có rủi ro bị giới hạn/khoá. Đường chính thống là API key (trả theo token).
- **Hạn mức gói:** Plus giới hạn số lần chạy Codex theo giờ/tuần → hàng đợi phải dừng khi hết
  (cơ chế "quota pause" có sẵn trong `hang-doi.mjs`, cần map đúng thông báo lỗi của Codex).
- **Giới hạn Zalo Bot Platform** (đã đo 07–08/10): trong nhóm chỉ nhận tin có @Bot; album ảnh
  không tới (chỉ tới caption) → 1 ảnh/tin; không có quote/reply, không đọc lịch sử, không reaction.
- **Bí mật** (token Zalo, đăng nhập Codex) chỉ để trên Mac mini, không để trên MacBook, không vào git.

## Cần chủ dự án mô tả trước khi thiết kế

1. Việc mới là gì: bot nhận gì (chữ / ảnh / file) và phải làm ra gì.
2. Kết quả ghi vào đâu: Google Sheet, Drive, DB Masterdata (đi đúng luật 6 bước), hay chỉ trả lời.
3. Nhóm Zalo nào, ai dùng; có cần người duyệt/xác nhận không.
4. Gói ChatGPT nào (Plus / Pro / Business) — quyết định hạn mức.

Có mô tả → brainstorming → spec → plan → spike Codex → code.
