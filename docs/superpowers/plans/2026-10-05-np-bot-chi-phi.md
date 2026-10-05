# NP Bot Chi Phí Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một bot Discord riêng quét kênh New Projects 3 lần/ngày, ghi mỗi tin thu/chi hợp lệ (kèm ảnh) thành một dòng
trong Google Sheet "Sổ chi phí New Projects", lưu ảnh chứng từ lên Drive và thả ✅/⚠️/📷/⌛.

**Architecture:** Bản chép rút gọn từ bot Sổ quỹ `GWT-Admin-Portal/bots/xet-duyet-chi-phi@da1b637`, chỉ giữ luồng tiền
tố thu/chi của kênh chị Trang. Code giữ nguyên cấu trúc bản gốc (`scanner.mjs` + `books.mjs` + `drive.mjs`) để sau
này `diff` với bản gốc vẫn đọc được. Mỗi chỗ khác bản gốc là một sửa đổi có chủ đích, liệt kê trong plan này. Chạy
bằng GitHub Actions, không có Supabase.

**Tech Stack:** Node.js ≥ 20 (ESM `.mjs`), `googleapis` (Sheets v4 + Drive v3), Discord REST API v10 bằng `fetch`,
GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-05-np-bot-chi-phi-design.md`

## Global Constraints

- Nguồn chép duy nhất: repo `GWT-Admin-Portal` commit **`da1b637`**. Lấy file bằng `git -C "../GWT-Admin-Portal" show da1b637:<path>`, không chép từ working tree vì nó có thể đã đổi.
- Thư mục làm việc: `/Users/duncreative/Coding Agent/NP-Bot-Chi-Phi` (repo `GWT-VN/NP-Bot-Chi-Phi`, nhánh `main`). Mọi lệnh trong plan chạy từ thư mục này.
- Repo **phẳng**: `scanner.mjs`, `books.mjs`, `drive.mjs`, `setup.mjs`, `config.json` ở gốc, `lib/` cho auth. Import `./lib/google-auth.mjs`, KHÔNG `../lib/...`.
- Commit author: `AIGWTVN <287866284+AIGWTVN@users.noreply.github.com>`. Dùng `git -c user.name=AIGWTVN -c user.email=287866284+AIGWTVN@users.noreply.github.com commit …`. Mỗi commit message kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Không có khoá Supabase, không DM báo cáo, không mirror. Không được thêm phụ thuộc nào ngoài `googleapis`.
- Bố cục sổ đúng **10 cột**: `STT · Ngày · Diễn giải · Người · Hoá đơn đỏ · Thu · Chi · Tồn · Link chứng từ · Ghi chú` (A..J). Tab sổ tên `Sổ chi phí`.
- Sheet locale **`vi_VN`**, múi giờ **`Asia/Ho_Chi_Minh`**.
- Chữ hiển thị cho người dùng: tiếng Việt có dấu. Định danh mới trong code: tiếng Anh hoặc giữ tên của bản gốc (đừng đổi tên hàm chép sang, vì sẽ phá diff).
- Agent không bao giờ cầm giá trị secret (token Discord, `credentials.json`, `token.json`). Những bước đó do chủ dự án làm.
- Lịch cron (UTC): `0 4 * * *`, `0 8 * * *`, `30 13 * * *` (= 11:00 · 15:00 · 20:30 giờ VN). Cửa sổ quét `--days=7`. Chỉ lượt 20:30 có `--nhac-lai`.

## Review Focus

1. **Token sai, hoặc bot chưa được mời vào kênh (Discord 401/403):** bản gốc nuốt lỗi, ra "0 tin" và job vẫn xanh. Bản này phải làm workflow ĐỎ. Kiểm bằng lệnh smoke ở Task 3, Step 7.
2. **Chưa bật Message Content Intent:** mọi tin người đến với chữ rỗng. Bot phải dừng và báo lỗi, không được ⚠️ oan cả loạt tin. Kiểm bằng test `nghiThieuIntent` ở Task 3.
3. **Sheet bị đổi locale khỏi vi_VN:** ngày `05/10/2026` sẽ bị đọc thành 10 tháng 5. Bot phải dừng trước khi ghi. Kiểm bằng test `laLocaleVi` ở Task 1.
4. **Cụm "hoá đơn đỏ" của bản ghim kênh** (cả `hoá` lẫn `hóa`, có/không/treo, và "VAT" là lỗ đã biết) phải ra đúng Có/Không/mơ hồ. Kiểm bằng nhóm `NP_HD_CASES` ở Task 2.
5. **Tiêu đề do `setup.mjs` tạo lệch số cột với dòng do `buildFundRow` ghi:** dữ liệu sẽ lệch cột âm thầm. Kiểm bằng test so độ dài ở Task 4.

---

### Task 1: Khung repo + `books.mjs` 10 cột + chặn locale

**Files:**
- Create: `package.json`, `.gitignore`, `lib/google-auth.mjs`, `lib/auth.mjs`, `books.mjs`, `test-books.mjs`

**Interfaces:**
- Consumes: không có.
- Produces:
  - `books.buildFundRow({ loai, ngay, dienGiai, nguoi, hoaDon, amount, link, ghiChu }) → Array(10)`.
  - `books.localizeRows(rows, sep)`.
  - `books.argSepFor(sheetId) → Promise<";"|",">`.
  - `books.laLocaleVi(locale: string) → boolean`.
  - `books.kiemTraLocale(sheetId) → Promise<void>`, ném lỗi khi locale không phải vi.
  - `books.loadProcessed(sheetId) → Promise<Set<string>>`.
  - `books.loadRepped(sheetId) → Promise<Map<msgId,{repMsgId,reason}>>`.
  - `books.markRepped(sheetId, entries)`.
  - `books.commit({ sheetId, tab, rows, msgIds })`.
  - `books.xoaDongSo({ sheetId, tab, rowNum, expectAmount, expectDMY, dry })`.
  - `books.suaDongSo({ sheetId, tab, rowNum, expectDMY, dienGiai, ghiChu, dry })`.
  - `books.toDMY(s)`, `books.toISO(s)`.

- [ ] **Step 1: Tạo `package.json` và `.gitignore`**

`package.json`:
```json
{
  "name": "np-bot-chi-phi",
  "version": "1.0.0",
  "private": true,
  "description": "Bot Discord ghi sổ chi phí kênh New Projects vào Google Sheet riêng",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node test-books.mjs"
  },
  "dependencies": {
    "googleapis": "^144.0.0"
  }
}
```

`.gitignore`:
```
node_modules/
.env
credentials.json
token.json
logs/
```

- [ ] **Step 2: Cài dependency, tạo `package-lock.json`**

Run: `npm install`
Expected: tạo `node_modules/` và `package-lock.json`, không có lỗi. Workflow dùng `npm ci` nên phải commit lock file.

- [ ] **Step 3: Chép `lib/` từ bản gốc (không sửa)**

```bash
mkdir -p lib
git -C "../GWT-Admin-Portal" show da1b637:bots/lib/google-auth.mjs > lib/google-auth.mjs
git -C "../GWT-Admin-Portal" show da1b637:bots/lib/auth.mjs > lib/auth.mjs
```
`google-auth.mjs` đọc `credentials.json`/`token.json` theo **thư mục hiện tại** (cwd), hoặc từ env
`GOOGLE_OAUTH_CREDENTIALS_JSON`/`GOOGLE_OAUTH_TOKEN_JSON`. Các script ở các task sau đều `process.chdir()` về gốc
repo để cwd luôn đúng.

- [ ] **Step 4: Viết test hỏng trước — `test-books.mjs`**

```js
// Test tầng ghi sổ NP (offline, không mạng) — chạy: node test-books.mjs (exit 0 = đạt).
import assert from "node:assert/strict";
import { buildFundRow, localizeRows, laLocaleVi } from "./books.mjs";

let n = 0;
const t = (ten, fn) => { fn(); n++; console.log("  ✓ " + ten); };

t("dòng chi có hoá đơn đỏ: 10 cột, Chi có số, Thu trống", () => {
  const r = buildFundRow({ loai: "chi", ngay: "2026-10-05", dienGiai: "Mua vật tư mẫu", nguoi: "Lan", hoaDon: "Có", amount: 1250000, link: "https://drive/x", ghiChu: "dự án X" });
  assert.equal(r.length, 10);
  assert.deepEqual([r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[8], r[9]],
    ["=ROW()-1", "05/10/2026", "Mua vật tư mẫu", "Lan", "Có", "", 1250000, "https://drive/x", "dự án X"]);
});
t("dòng chi không khai hoá đơn → mặc định Không", () => {
  const r = buildFundRow({ loai: "chi", ngay: "2026-10-05", dienGiai: "Ship", amount: 45000 });
  assert.equal(r[4], "Không");
});
t("dòng thu: Hoá đơn '—', Thu có số, Chi trống", () => {
  const r = buildFundRow({ loai: "thu", ngay: "2026-10-05", dienGiai: "Hoàn cọc", amount: 2000000, hoaDon: "Có" });
  assert.equal(r[4], "—"); assert.equal(r[5], 2000000); assert.equal(r[6], "");
});
t("cột Tồn = Σthu − Σchi, dấu ngăn theo locale vi (;)", () => {
  const [row] = localizeRows([buildFundRow({ loai: "chi", ngay: "2026-10-05", dienGiai: "x", amount: 1 })], ";");
  assert.equal(row[7], "=SUM($F$2:INDEX($F:$F;ROW()))-SUM($G$2:INDEX($G:$G;ROW()))");
});
t("laLocaleVi: chỉ nhận vi", () => {
  assert.equal(laLocaleVi("vi_VN"), true);
  assert.equal(laLocaleVi("vi"), true);
  assert.equal(laLocaleVi("en_US"), false);
  assert.equal(laLocaleVi(""), false);
  assert.equal(laLocaleVi(undefined), false);
});
console.log(`\n${n} test đạt`);
```

- [ ] **Step 5: Chạy cho thấy test hỏng**

Run: `node test-books.mjs`
Expected: FAIL với `Cannot find module '.../books.mjs'`.

- [ ] **Step 6: Chép `books.mjs` và sửa thành bản 10 cột**

```bash
git -C "../GWT-Admin-Portal" show da1b637:bots/xet-duyet-chi-phi/books.mjs > books.mjs
```
Sau đó sửa đúng các chỗ sau:

(a) Đường dẫn: thay `import { getAuthClient } from "../lib/google-auth.mjs";` bằng
`import { getAuthClient } from "./lib/google-auth.mjs";`. Thay
`const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");` bằng
`const ROOT = path.dirname(fileURLToPath(import.meta.url)); // repo phẳng: .env cùng thư mục`.

(b) Xoá trọn khối báo cáo: từ dòng `// ── Ngày của BÁO CÁO = "ngày vừa xong"` tới hết hàm `reportDayDMY` (dấu `}` đóng
hàm, ngay trước `export function toThang`). Khối này gồm `REPORT_ROLLBACK_HOUR` và `reportDayDMY`, chỉ DM báo cáo
dùng, mà NP không có báo cáo.

(c) Thay toàn bộ `buildFundRow` và xoá `buildLADRow`. Đoạn từ dòng `export function buildFundRow(` tới hết hàm
`buildLADRow` thay bằng:
```js
// Bố cục sổ NP (10 cột, A..J): STT · Ngày · Diễn giải · Người · Hoá đơn đỏ · Thu · Chi · Tồn · Link chứng từ · Ghi chú.
// Khác bản gốc: BỎ "Đã hoàn ứng" / "Ngày hoàn" / "Link hóa đơn" — sổ chi phí dự án không có vòng công ty hoàn tiền.
// Dòng thu: Hoá đơn "—" (hoá đơn đỏ chỉ có nghĩa với khoản chi).
export function buildFundRow({ loai = "chi", ngay, dienGiai, nguoi = "", hoaDon = "Không", amount = 0, link = "", ghiChu = "" }) {
  const isThu = loai === "thu";
  const hd = isThu ? "—" : (hoaDon || "Không");
  const n = Number(amount) || "";
  return [
    "=ROW()-1", toDMY(ngay), dienGiai || "", nguoi || "", hd,
    isThu ? n : "", isThu ? "" : n,
    TON_FUND, link || "", ghiChu || "",
  ];
}
```

(d) Thêm ngay sau hàm `argSepFor`:
```js
// Sheet PHẢI ở locale vi: bot ghi ngày "dd/mm/yyyy" bằng USER_ENTERED — locale en_US đọc "05/10/2026" thành
// 10 THÁNG 5 (sai im lặng, Tổng hợp theo tháng lệch theo). setup.mjs đặt vi_VN lúc tạo; hàm này chặn khi ai đó đổi.
export function laLocaleVi(locale) { return /^vi([_-]|$)/i.test(String(locale || "")); }
export async function kiemTraLocale(sheetId) {
  const r = await sheetsApi().spreadsheets.get({ spreadsheetId: sheetId, fields: "properties.locale" });
  const loc = r.data?.properties?.locale;
  if (!laLocaleVi(loc)) throw new Error(`Sheet đang ở locale '${loc}', phải là vi_VN (File → Cài đặt) — dừng, không ghi ngày sai`);
}
```

(e) Đổi cột M → J ở hai hàm sửa dòng (bố cục mới hết ở cột J, Ghi chú là index 9):
```bash
perl -pi -e 's/:M\$\{rowNum\}/:J\${rowNum}/g; s/!M\$\{rowNum\}/!J\${rowNum}/g; s/row\[12\]/row[9]/g' books.mjs
grep -n 'M\${rowNum}\|row\[12\]' books.mjs
```
Expected: lệnh `grep` không in dòng nào.

(f) Sửa câu "Dùng:" trong khối CLI cuối file cho khớp tên file: `node books.mjs ping <sheetId> | processed <sheetId>`.
Câu này vốn đã đúng; chỉ kiểm lại cho chắc, không cần sửa.

- [ ] **Step 7: Chạy test cho thấy đạt**

Run: `node test-books.mjs`
Expected: 5 dòng `✓`, cuối là `5 test đạt`, exit 0.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .gitignore lib books.mjs test-books.mjs
git -c user.name=AIGWTVN -c user.email=287866284+AIGWTVN@users.noreply.github.com commit -m "feat: khung repo + books.mjs sổ 10 cột, chặn locale khác vi

Chép từ GWT-Admin-Portal bots/xet-duyet-chi-phi@da1b637; bỏ hoàn ứng, bỏ báo cáo.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `scanner.mjs` phần logic thuần + `config.json` + bộ test parser

**Files:**
- Create: `config.json`, `scanner.mjs`, `drive.mjs`, `test-parser.mjs`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: `books.buildFundRow`, `books.toDMY` (Task 1).
- Produces (export từ `scanner.mjs`; import an toàn, không gọi mạng):
  - `parseEntry(item) → {amount, loai, hoaDon, ngay, noiDung, ncc, ghiChu, usd?} | {skip, silent, boQua?, reason}`.
  - `detectHoaDon(text) → "Có"|"Không"|"mơ hồ"`.
  - `route(item, p, link="") → {book:"np", quy:null, tab, loai, row, emoji, summary} | {skip, reason}`.
  - `phanLoaiReply(item) → "canhbao"|"imlang"`.
  - `nenRep({wasRepped, repReason, reason}) → boolean`.
  - `repText(authorId, reason) → string`.
  - Item có dạng: `{ id, channelId, channel, cfg:{name, route:"fund", book:"np", loaiTuTienTo:true}, book:"np", expired, hasDirectImg, wasRepped, repMsgId, repReason, date:"YYYY-MM-DD", authorId, author, content, images:[{url,ct,name}], replyToId, refItem }`.
  - `drive.mjs`: `getDrive()`, `cleanName()`, `ensureFolder()`, `ensurePath()`, `uploadBuffer()`, `ensureTxFolder()`, `archiveTransaction(drive, rootId, {quy, loai, dmy, msgId, desc, buffers, anhMsgId}) → Promise<link>`, `createFolder(name, parentId) → {folderId, link}`.

- [ ] **Step 1: Tạo `config.json`**

```json
{
  "_help": "Cấu hình bot NP. channels: { \"<channelId>\": { \"name\": \"new-projects\" } } — kênh không có ở đây thì bot không đọc. book.sheetId/folderId do setup.mjs điền. persons: { \"<userId Discord>\": \"Tên hiển thị trong cột Người\" } (tuỳ chọn; trống thì lấy tên Discord).",
  "persons": {},
  "book": { "label": "Sổ chi phí New Projects", "sheetId": "", "folderId": "", "tab": "Sổ chi phí" },
  "channels": {}
}
```

- [ ] **Step 2: Chép `drive.mjs`, sửa đường dẫn, cắt phần CLI legacy**

```bash
git -C "../GWT-Admin-Portal" show da1b637:bots/xet-duyet-chi-phi/drive.mjs \
  | awk '/^\/\/ ── \(B\) LEGACY CLI/{exit} {print}' > drive.mjs
perl -pi -e 's#"\.\./lib/google-auth\.mjs"#"./lib/google-auth.mjs"#; s#^const SELF = path\.resolve\(path\.dirname\(fileURLToPath\(import\.meta\.url\)\), "\.\."\);#const SELF = path.dirname(fileURLToPath(import.meta.url));#' drive.mjs
grep -n 'google-auth\|^const SELF\|LEGACY\|setupTree\|legacyUpload' drive.mjs
```
Expected: chỉ còn dòng import `./lib/google-auth.mjs` và `const SELF = path.dirname(...)`, không còn
`LEGACY`/`setupTree`/`legacyUpload`. File kết thúc ở hàm `createFolder`. Không cần sửa `archiveTransaction`: route
của NP truyền `quy: null` nên cây folder không có cấp quỹ (`<gốc>/<yyyy.mm>/<01. Thu|02. Chi>/<NN. nội dung>/`).

- [ ] **Step 3: Chép `scanner.mjs` và sửa để nạp được**

```bash
git -C "../GWT-Admin-Portal" show da1b637:bots/xet-duyet-chi-phi/scanner.mjs > scanner.mjs
```
Sửa đúng các chỗ sau.

(a) Đầu file: thay 13 dòng comment đầu (từ `#!/usr/bin/env node` tới dòng `//   • NGÀY = ngày nhân viên nhắn
tin…`) bằng:
```js
#!/usr/bin/env node
// Scanner sổ chi phí kênh New Projects (THUẦN NODE — chạy GitHub Actions). Spec: docs/superpowers/specs/2026-10-05-np-bot-chi-phi-design.md
// Chép rút gọn từ GWT-Admin-Portal bots/xet-duyet-chi-phi/scanner.mjs@da1b637 — CHỈ luồng tiền tố thu/chi (kênh chị
// Trang). Giữ nguyên tên hàm/cấu trúc để `diff` với bản gốc còn đọc được khi đối chiếu bản vá.
// Quét tin chưa ghi → PARSE số tiền + nội dung TỪ CHỮ (không đọc ảnh) → 1 sổ 1 tab → lưu ảnh Drive → react ✅/⚠️/📷/⌛.
//   node scanner.mjs [--days=7|--all|--since=YYYY-MM-DD] [--limit=N] [--dry] [--nhac-lai]
//   node scanner.mjs --requet=<msgId|link>[,…] · --xoadong=<dòng>:<sốtiền>[:<DD/MM/YYYY>] · --suadong=<dòng>:<msgId>
// CÚ PHÁP TIN: `thu`/`chi` ĐẦU tin (bắt buộc) · số tiền có đ/k/tr hoặc dấu chấm nghìn · "có hoá đơn (đỏ)" → Có,
// không nhắc → Không, nhắc lấp lửng → ⚠️ · ảnh trong CÙNG tin (thiếu → 📷) · NGÀY = ngày nhắn tin (trừ "Ngày 6/8: …").
```

(b) Import + gốc repo: thay khối
```js
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";
import * as books from "./books.mjs";
import * as drive from "./drive.mjs";
import { mirror } from "./mirror.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, "..");
process.chdir(ROOT);
```
bằng
```js
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as books from "./books.mjs";
import * as drive from "./drive.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = DIR; // repo phẳng: config.json, credentials.json, token.json nằm cùng thư mục
process.chdir(ROOT);
```

(c) Cờ: thay dòng `const noReport = args.includes("--no-report");` bằng
```js
// Lượt 20:30 (workflow truyền --nhac-lai): tin ⚠️ chưa sửa được ĐẨY lại xuống đáy kênh 1 lần/ngày. Bản gốc gắn việc
// này vào "lượt có báo cáo" (!noReport); NP không có báo cáo nên dùng cờ riêng.
const nhacLaiLuot = args.includes("--nhac-lai");
```
và trong `scanPhase`, thay `const nhacLai = !reasonChanged && !noReport && w.wasRepped && w.repMsgId;` bằng
`const nhacLai = !reasonChanged && nhacLaiLuot && w.wasRepped && w.repMsgId;`.

(d) Log: `perl -pi -e 's#path\.join\(ROOT, "xet-duyet-chi-phi", "logs"#path.join(ROOT, "logs"#g' scanner.mjs`

(e) Chuyển kiểm token vào main: XOÁ dòng `if (!TOKEN) die("Thiếu DISCORD_BOT_TOKEN");` ở top-level. Task 3 sẽ đặt lại
dòng này trong khối main. Lý do: test import `scanner.mjs`, mà top-level `die()` sẽ giết tiến trình test khi không có
token.

(f) Cấu hình: thay khối từ dòng `// ── Config (channels.json) ───…` tới hết dòng
`const laKenh = (k, v) => /^\d+$/.test(k) && v && typeof v === "object" && !!v.route;` (gồm `CHANS`, `PERSONS`,
`BOOKS`, `PAYERS` và các comment xen giữa) bằng:
```js
// ── Config (config.json) ─────────────────────────────────────────────────────
// NP có ĐÚNG 1 sổ + kênh khai trong config.json. Dựng lại hình dạng CHANS/BOOKS của bản gốc để phần còn lại của
// scanner (buildWorklist, scanPhase, requetPhase) giữ nguyên chữ. Mọi kênh đều là luồng tiền tố (loaiTuTienTo).
const CFG = JSON.parse(readFileSync(path.join(DIR, "config.json"), "utf8"));
const PERSONS = CFG.persons || {};
const BOOKS = { np: { label: CFG.book.label, sheetId: CFG.book.sheetId, folderId: CFG.book.folderId, tabs: { default: CFG.book.tab } } };
const CHANS = Object.fromEntries(Object.entries(CFG.channels || {}).map(([id, c]) =>
  [id, { name: c.name, route: "fund", book: "np", loaiTuTienTo: true }]));
// Khoá nào là KÊNH: id Discord toàn chữ số + giá trị có `route` (giữ từ bản gốc).
const laKenh = (k, v) => /^\d+$/.test(k) && v && typeof v === "object" && !!v.route;
```

(g) Xoá chọn quỹ: xoá khối từ dòng `// Lời khai quỹ. Lớp A = tạm ứng` tới hết hàm `detectQuy` (dấu `}` ngay trước dòng
`// Dựng ngày giao dịch DD/MM/YYYY từ ngày người dùng GÕ`). Khối gồm `SAYS_TAM_UNG`, `SAYS_TIEN_MAT`, `detectQuy`.
NP chỉ có 1 tab nên không có chuyện chọn quỹ.

(h) Lý do trong `parseEntry`: thay hai dòng
```js
        ? { skip: true, silent: false, reason: usd ? "kênh Trang: có số $ nhưng thiếu tiền tố 'thu'/'chi' đầu tin" : "kênh Trang thiếu cả tiền tố lẫn số tiền đọc được" }
        : { skip: true, silent: true, reason: "kênh Trang: tin giao tiếp/hướng dẫn (không tiền tố, không số, không ảnh) — bỏ qua im lặng" };
```
bằng
```js
        ? { skip: true, silent: false, reason: usd ? "thiếu tiền tố: có số $ nhưng không có 'thu'/'chi' đầu tin" : "thiếu cả tiền tố lẫn số tiền đọc được" }
        : { skip: true, silent: true, reason: "tin giao tiếp/hướng dẫn (không tiền tố, không số, không ảnh) — bỏ qua im lặng" };
```

(i) Thay TOÀN BỘ hàm `route`, từ dòng `export function route(item, p, link = "") {` tới dòng ngay trước
`// ── Reply = KHÔNG BAO GIỜ là giao dịch`, bằng:
```js
export function route(item, p, link = "") {
  const c = item.cfg;
  const amount = p.amount, ngay = p.ngay, desc = p.noiDung, nguoi = personName(item);
  if (c.route !== "fund") return { skip: true, reason: `route không hỗ trợ: ${c.route}` };
  const b = BOOKS[c.book];
  if (!b) return { skip: true, reason: `chưa cấu hình sổ '${c.book}'` };
  // Sổ 1 tab chứa CẢ thu lẫn chi → tiền tố BẮT BUỘC, không đoán hướng (chủ dự án chốt 2026-10-05).
  if (!p.loai) return { skip: true, reason: "thiếu tiền tố: không có 'thu'/'chi' đầu tin" };
  const loai = p.loai;
  // Hoá đơn khai MƠ HỒ ("hoá đơn gửi sau") → KHÔNG ghi, hỏi lại. Bot không đoán Có/Không.
  if (p.hoaDon === "mơ hồ")
    return { skip: true, reason: "hóa đơn khai chưa rõ: tin có nhắc 'hóa đơn' nhưng không rõ là có hay không" };
  const tab = b.tabs.default;
  const hoaDon = p.hoaDon || "Không";
  const row = books.buildFundRow({ loai, ngay, dienGiai: desc, nguoi, hoaDon, amount, link, ghiChu: p.ghiChu });
  // Khoản $ (memo): amount=0 → buildFundRow để trống CẢ Thu lẫn Chi; số $ đã nằm ở Ghi chú.
  const tien = p.usd ? `${p.usd.raw} (chưa quy VND)` : `${vnd(amount)}đ`;
  return { book: c.book, quy: null, tab, loai, row, emoji: "✅", summary: `${loai.toUpperCase()} ${tien} · ${b.label}/${tab} · HĐ:${hoaDon} · ${nguoi} · ${desc}` };
}

```

(j) Thay khối từ dòng `// ── Reply = KHÔNG BAO GIỜ là giao dịch (luật sổ tiền) ───…` tới hết hàm `phanLoaiReply`
(gồm `laReplyDinhAnh`) bằng:
```js
// ── Reply = KHÔNG BAO GIỜ là giao dịch (luật sổ tiền) ─────────────────────────
// Chỉ tin GỐC mới là khoản. Bản gốc có nhánh "người thanh toán reply ảnh = chứng từ" (quỹ chị Hiền) — NP không có.
//   "canhbao" — reply TRÔNG NHƯ một khoản (số tiền / ảnh / tiền tố) → ⚠️ nhắc gửi TIN MỚI.
//   "imlang"  — reply trò chuyện → bỏ qua im lặng.
export function phanLoaiReply(item) {
  const rp = parseEntry(item);
  // `boQua` (thiếu ảnh) vẫn tính là "trông như khoản": reply không bao giờ vào sổ nên câu nhắc là "gửi TIN MỚI".
  return rp.silent && !rp.boQua ? "imlang" : "canhbao";
}
```
Rồi bỏ đối số `PAYERS` ở mọi chỗ gọi, và nhánh "đính" trong `requetPhase`:
```bash
perl -pi -e 's/phanLoaiReply\((item|it), PAYERS\)/phanLoaiReply($1)/g' scanner.mjs
perl -pi -e 's/verdict = lr === "dinh" \? "REPLY-ĐÍNH-ẢNH" : lr === "canhbao" \? "WARN" : "SILENT";/verdict = lr === "canhbao" ? "WARN" : "SILENT";/' scanner.mjs
grep -n 'PAYERS\|detectQuy\|"dinh"\|REPLY-ĐÍNH' scanner.mjs
```
Expected: `grep` chỉ còn đúng một dòng: `if (loaiRep === "dinh") proofs.push(item);` trong `scanPhase`. Task 3 sẽ xoá nó.

(k) `repText`: thay ba dòng nhánh đầu
```js
  if (reason.startsWith("kênh Trang thiếu cả")) how = "Kênh này **chỉ ghi khoản thu/chi**, mỗi tin cần đủ **2 thứ**:\n"
    + "1. Chữ `thu` hoặc `chi` ở **đầu** tin.\n"
    + "2. Số tiền có `đ` hoặc `k` — gõ trơn `45000` bot không đọc được.\n"
    + "VD: `chi Ship hàng cho khách 45.000đ`";
  else if (reason.startsWith("kênh Trang")) how = "Kênh này cần chữ `thu` hoặc `chi` ở **đầu** tin.\nVD: `chi Ship hàng cho khách 45.000đ`";
  else if (reason.startsWith("khai mâu thuẫn")) how = "Tin vừa ghi *tiền mặt* vừa ghi *có hóa đơn* — bot không biết trừ quỹ nào.\nKhoản **có** hóa đơn → ghi `có hóa đơn`. Khoản **không** có → bỏ trống.";
  else if (reason.startsWith("hóa đơn khai chưa rõ")) how = "Tin có nhắc *hóa đơn* nhưng không rõ là **có** hay **không** — bot không đoán.\nKhoản **có** hóa đơn → ghi đúng cụm `có hóa đơn`.\nKhoản **không** có → đừng nhắc chữ `hóa đơn`, hoặc ghi `không có hóa đơn`.";
```
bằng
```js
  // Thứ tự quan trọng: "thiếu cả tiền tố" phải đứng TRƯỚC "thiếu tiền tố" (startsWith).
  if (reason.startsWith("thiếu cả tiền tố")) how = "Kênh này **chỉ ghi khoản thu/chi**, mỗi tin cần đủ **2 thứ**:\n"
    + "1. Chữ `thu` hoặc `chi` ở **đầu** tin.\n"
    + "2. Số tiền có `đ` hoặc `k` — gõ trơn `45000` bot không đọc được.\n"
    + "VD: `chi Mua vật tư mẫu 1.250.000đ`";
  else if (reason.startsWith("thiếu tiền tố")) how = "Kênh này cần chữ `thu` hoặc `chi` ở **đầu** tin.\nVD: `chi Mua vật tư mẫu 1.250.000đ`";
  else if (reason.startsWith("hóa đơn khai chưa rõ")) how = "Tin có nhắc *hoá đơn* nhưng không rõ là **có** hay **không** — bot không đoán.\nKhoản **có** hoá đơn đỏ → ghi đúng cụm `có hoá đơn đỏ`.\nKhoản **không** có → đừng nhắc chữ `hoá đơn`, hoặc ghi `không có hoá đơn`.";
```

- [ ] **Step 4: Kiểm `scanner.mjs` import được mà không gọi mạng**

Run: `node -e 'import("./scanner.mjs").then(m => console.log(Object.keys(m).sort().join(",")))'`
Expected: in ra danh sách export có `deleteMessage,detectHoaDon,extractUsd,nenRep,parseEntry,parseMoney,phanLoaiReply,repText,reply,route`.
Không in lỗi, không in "LỖI".

- [ ] **Step 5: Chép bộ test gốc và sửa cho NP**

```bash
git -C "../GWT-Admin-Portal" show da1b637:bots/xet-duyet-chi-phi/test-parser.mjs > test-parser.mjs
```
Sửa:

(a) Thay dòng 1 bằng `// Test parser sổ chi phí NP — chạy: node test-parser.mjs (exit 0 = đạt, 1 = hỏng). Chép từ bản gốc @da1b637.`
Thay dòng import `import { parseEntry, detectHoaDon, detectQuy, route, repText, laReplyDinhAnh, phanLoaiReply, nenRep } from "./scanner.mjs";`
bằng `import { parseEntry, detectHoaDon, route, repText, phanLoaiReply, nenRep } from "./scanner.mjs";`.
Xoá 3 dòng kế tiếp (2 dòng comment về `reportDayDMY` và dòng `import { reportDayDMY } from "./books.mjs";`).

(b) Thay hai dòng `const CFG_HIEN_CHI = …;` và `const CFG_TRANG = …;` bằng:
```js
// Kênh NP = luồng tiền tố của kênh chị Trang. Giữ TÊN biến CFG_TRANG để các mảng ca chép nguyên từ bản gốc.
const CFG_TRANG = { name: "new-projects", route: "fund", book: "np", loaiTuTienTo: true };
// Ca của quỹ chị Hiền KHÔNG áp cho NP. Giữ nguyên trong mảng (diff với bản gốc thẳng hàng) nhưng LỌC BỎ lúc chạy.
const CFG_HIEN_CHI = { hien: true };
const laNP = (row) => !row.some((x) => x && x.hien);
```

(c) Kỳ vọng tên tab và mã lý do, cùng index cột Ghi chú trong bố cục 10 cột:
```bash
perl -pi -e 's/"Sổ quỹ"/"Sổ chi phí"/g; s/WARN-route:kênh Trang/WARN-route:thiếu tiền tố/g; s/rt\.row\[12\]/rt.row[9]/g' test-parser.mjs
```

(d) Lọc ca Hiền ở mọi vòng có cột cfg:
```bash
perl -pi -e 's/of (ROUTE_CASES|REP_CASES|TIENTO_CASES|DATE_CASES|IMLANG_CASES|USD_CASES|ANH_CASES)\)/of $1.filter(laNP))/g' test-parser.mjs
grep -n '_CASES.filter(laNP)' test-parser.mjs | wc -l
```
Expected: `7`.

(e) Xoá hai vòng chạy không còn áp dụng. Xoá nguyên khối
```js
for (const [tag, input, want] of QUY_CASES) {
  const r = detectQuy(input);
  const got = r.conflict ? "CONFLICT" : r.quy;
  if (got === want) pass++;
  else fails.push({ tag, input, want, got });
}
```
và nguyên khối
```js
for (const [tag, now, dateArg, want] of DAY_CASES) {
  const got = reportDayDMY(now, dateArg);
  const input = `${now.toString().slice(0, 24)}${dateArg ? ` --date=${dateArg}` : ""}`;
  if (got === want) pass++;
  else fails.push({ tag, input, want, got });
}
```
Mảng `QUY_CASES`/`DAY_CASES` cứ để nguyên (không còn ai dùng, nhưng giữ thì diff với bản gốc thẳng hàng).

(f) REPLY: thay khối từ dòng `const HIEN = "1481522492966305882", KHAC = "999", PAY = new Set([HIEN]);` tới hết mảng
`REPLY_CASES` (dấu `];`) bằng:
```js
const KHAC = "999";
const REF = { id: "1000", content: "chi Mua vật tư 480k", authorId: KHAC };
const ANH = [{ url: "u", ct: "image/png", name: "a.png" }];
const rep = (over) => ({ replyToId: "1000", authorId: KHAC, images: [], refItem: REF, content: "", cfg: CFG_TRANG, ...over });
// [nhãn, item, nhánh mong đợi] — NP không có nhánh "đính chứng từ": reply có ảnh vẫn chỉ là ⚠️ "gửi tin mới".
const REPLY_CASES = [
  ["REPLY-có-tiền→cảnh-báo", rep({ content: "chi thêm vé xe 50k" }), "canhbao"],
  ["REPLY-trò-chuyện→im", rep({ content: "Vâng chị" }), "imlang"],
  ["REPLY-ảnh-không-tiền→cảnh-báo", rep({ images: ANH }), "canhbao"],
  ["REPLY-ảnh-kèm-tiền→cảnh-báo", rep({ images: ANH, content: "đã chuyển 480k" }), "canhbao"],
];
```
Trong vòng chạy REPLY, thay
```js
  const got = phanLoaiReply(it, PAY);
  if (got === want) pass++;
  else fails.push({ tag, input: `${it.authorId === HIEN ? "Hiền" : "Khác"} ảnh:${it.images.length} "${String(it.content).slice(0, 26)}"`, want, got });
```
bằng
```js
  const got = phanLoaiReply(it);
  if (got === want) pass++;
  else fails.push({ tag, input: `ảnh:${it.images.length} "${String(it.content).slice(0, 26)}"`, want, got });
```
Trong mảng kiểm lẻ ngay sau đó, xoá hai dòng `["laReplyDinhAnh-đúng", …]` và `["laReplyDinhAnh-không-payer", …]`.
Xoá luôn dòng comment `// laReplyDinhAnh vẫn đúng riêng: chỉ payer+ảnh+có tin gốc.`.

(g) Tổng số ca: thay dòng `const total = CASES.length + HD_CASES.length + … + 9;` bằng
`const total = pass + fails.length; // đếm theo ca THỰC chạy (đã lọc ca Hiền)`.

(h) Thêm nhóm ca NP ngay TRƯỚC dòng `let pass = 0;`:
```js
// ── NP: cụm "hoá đơn đỏ" đúng như bản ghim kênh New Projects ──────────────────
const NP_HD_CASES = [
  ["NP-hđ-đỏ-có", "chi Mua vật tư 1.250.000đ có hoá đơn đỏ", "Có"],
  ["NP-hđ-đỏ-có-dấu-kiểu-cũ", "chi Mua vật tư 1.250.000đ có hóa đơn đỏ", "Có"],
  ["NP-hđ-đỏ-không", "chi Mua vật tư 1.250.000đ không có hoá đơn đỏ", "Không"],
  ["NP-hđ-mặc-định-không", "chi Mua vật tư 1.250.000đ", "Không"],
  ["NP-hđ-đỏ-treo", "chi Mua vật tư 1.250.000đ hoá đơn đỏ gửi sau", "mơ hồ"],
  // LỖ ĐÃ BIẾT, cố ý không vá (spec §3): "VAT" không được hiểu là có hoá đơn.
  ["NP-VAT-lỗ-đã-biết", "chi Mua vật tư 1.250.000đ có VAT", "Không"],
];
```
và thêm NGAY SAU vòng `for (const [tag, input, want] of HD_CASES) { … }`:
```js
for (const [tag, input, want] of NP_HD_CASES) {
  const got = detectHoaDon(input);
  if (got === want) pass++;
  else fails.push({ tag, input, want, got });
}
// NP end-to-end: tin chuẩn của bản ghim → đúng tab, 10 cột, HĐ "Có", số ở cột Chi.
{
  const it = item(CFG_TRANG, "chi Mua vật tư mẫu 1.250.000đ có hoá đơn đỏ");
  const p = parseEntry(it);
  const rt = p.skip ? p : route(it, p);
  const got = rt.skip ? `SKIP:${rt.reason}` : `${rt.tab}|${rt.row.length}|${rt.row[4]}|${rt.row[5]}|${rt.row[6]}`;
  const want = "Sổ chi phí|10|Có||1250000";
  if (got === want) pass++; else fails.push({ tag: "NP-e2e-tin-chuẩn", input: it.content, want, got });
}
```

- [ ] **Step 6: Chạy test parser**

Run: `node test-parser.mjs`
Expected: dòng cuối dạng `N/N đạt` (hai số bằng nhau), không có dòng `HỎNG`, exit 0.
Có ca hỏng thì **không sửa kỳ vọng**. Ca chép từ bản gốc mà hỏng nghĩa là một bước sửa ở Step 3 đã đổi hành vi, phải
tìm ra bước đó và sửa lại. Ngoại lệ duy nhất là các phép thay chuỗi đã liệt kê ở Step 5.

- [ ] **Step 7: Gộp vào `npm test`**

Trong `package.json` đổi `"test": "node test-books.mjs"` thành `"test": "node test-parser.mjs && node test-books.mjs"`.
Run: `npm test` → Expected: cả hai file đạt, exit 0.

- [ ] **Step 8: Commit**

```bash
git add config.json scanner.mjs drive.mjs test-parser.mjs package.json
git -c user.name=AIGWTVN -c user.email=287866284+AIGWTVN@users.noreply.github.com commit -m "feat: scanner NP — luồng tiền tố thu/chi, 1 sổ 1 tab, bỏ quỹ Hiền/payer/mirror

Chép từ bots/xet-duyet-chi-phi@da1b637. Lý do skip đổi 'kênh Trang' → 'thiếu tiền tố'.
Bộ test gốc giữ nguyên mảng, lọc ca quỹ Hiền lúc chạy; thêm ca 'hoá đơn đỏ'.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Lỗi phải làm workflow đỏ + chặn thiếu Intent + khối main

**Files:**
- Modify: `scanner.mjs` (`buildWorklist`, `scanPhase`, `requetPhase`, khối main), `test-parser.mjs`

**Interfaces:**
- Consumes: `books.kiemTraLocale(sheetId)` (Task 1), cấu hình `BOOKS`/`CHANS` (Task 2).
- Produces: `export function nghiThieuIntent(msgs: DiscordMessage[]) → boolean`. CLI `node scanner.mjs …` thoát với
  exit code 1 khi có bất kỳ lỗi quét, commit, Discord hay locale nào.

- [ ] **Step 1: Viết test hỏng trước cho `nghiThieuIntent`**

Trong `test-parser.mjs`: thêm `nghiThieuIntent` vào dòng import từ `./scanner.mjs`, rồi chèn ngay trước dòng
`const total = …`:
```js
// ── INTENT: chưa bật Message Content Intent → mọi tin người có content "" → phải DỪNG, không ⚠️ oan cả loạt ──
const nguoi = (content, extra = {}) => ({ author: { bot: false }, content, ...extra });
for (const [tag, msgs, want] of [
  ["INTENT-3-tin-rỗng→nghi", [nguoi(""), nguoi(""), nguoi("", { attachments: [{ url: "x" }] })], true],
  ["INTENT-có-1-tin-có-chữ→không-nghi", [nguoi(""), nguoi(""), nguoi("chi ship 45k")], false],
  ["INTENT-dưới-3-tin→không-nghi", [nguoi(""), nguoi("")], false],
  ["INTENT-tin-bot-không-tính", [nguoi(""), nguoi(""), { author: { bot: true }, content: "" }], false],
  ["INTENT-forward-không-tính-là-rỗng", [nguoi(""), nguoi(""), nguoi("", { message_snapshots: [{ message: { content: "x" } }] })], false],
]) {
  const got = nghiThieuIntent(msgs);
  if (got === want) pass++; else fails.push({ tag, input: tag, want, got });
}
```

- [ ] **Step 2: Chạy cho thấy hỏng**

Run: `node test-parser.mjs`
Expected: FAIL với `SyntaxError: The requested module './scanner.mjs' does not provide an export named 'nghiThieuIntent'`.

- [ ] **Step 3: `buildWorklist` báo lỗi Discord thay vì nuốt, và chặn thiếu Intent**

Trong `scanner.mjs`, thêm ngay TRƯỚC `async function buildWorklist()`:
```js
// Chưa bật Message Content Intent → Discord trả content "" cho MỌI tin người (trừ tin @bot). Không chặn thì bot ⚠️ oan
// mọi tin có ảnh ("thiếu cả tiền tố lẫn số") và bỏ qua mọi tin chữ. ≥3 tin người, tin nào cũng rỗng chữ (không tính
// tin forward — chữ của nó nằm trong snapshot) → gần như chắc chắn thiếu intent, không phải người gửi toàn ảnh trơn.
export function nghiThieuIntent(msgs) {
  const nguoi = (msgs || []).filter((m) => !m.author?.bot);
  return nguoi.length >= 3 && nguoi.every((m) => !String(m.content || "").trim() && !(m.message_snapshots || []).length);
}

// Đọc 1 trang tin. KHÁC bản gốc: bản gốc nuốt mọi lỗi (`catch { continue; }`, batch không phải mảng → break) nên token
// sai / bot chưa vào kênh ra "0 tin", job vẫn XANH. Bot mới dựng là đúng lúc dễ sai mấy thứ đó nhất → phải NÉM.
async function layTrang(url, tenKenh) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(url, H);
    if (r.status === 429) { const d = await r.json().catch(() => ({})); await sleep((d.retry_after ?? 1) * 1000 + 100); continue; }
    if (!r.ok) throw new Error(`Discord ${r.status} khi đọc kênh ${tenKenh} — kiểm DISCORD_BOT_TOKEN, bot đã được mời vào kênh, có quyền View Channel + Read Message History`);
    const batch = await r.json();
    if (!Array.isArray(batch)) throw new Error(`Discord trả dữ liệu lạ khi đọc kênh ${tenKenh}`);
    return batch;
  }
  throw new Error(`Discord 429 quá 5 lần khi đọc kênh ${tenKenh}`);
}
```
Trong `buildWorklist`, thay đoạn từ dòng `    const msgs = [];` tới hết dòng `    if (!msgs.length) continue;` bằng:
```js
    const msgs = [];
    let before = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = before ? `?limit=100&before=${before}` : "?limit=100";
      const batch = await layTrang(`${API}/channels/${id}/messages${q}`, c.name);
      if (!batch.length) break;
      msgs.push(...batch);
      before = batch[batch.length - 1].id;
      // Discord trả MỚI→CŨ: tin cuối batch đã cũ hơn sàn FETCH → mọi trang sau còn cũ hơn nữa → dừng.
      if (batch.length < 100 || (!all && String(batch[batch.length - 1].timestamp) < fetchFloor)) break;
      if (page === MAX_PAGES - 1) logLine(`⚠ ${c.name} vượt ${MAX_PAGES} trang (~${MAX_PAGES * 100} tin) — dừng, có thể còn sót; quét --all nếu cần`);
    }
    if (nghiThieuIntent(msgs))
      throw new Error(`Mọi tin người trong kênh ${c.name} đều rỗng chữ — gần như chắc chắn bot CHƯA BẬT Message Content Intent (Discord Developer Portal → Bot → Privileged Gateway Intents). Dừng, không ⚠️ oan.`);
    if (!msgs.length) continue;
```

- [ ] **Step 4: `scanPhase` — chặn locale, bỏ pha "đính chứng từ", commit lỗi thì đỏ**

(a) Thay dòng đầu hàm
`  if (!Object.keys(BOOKS).length) { logLine("⚠ channels.json thiếu _books — không có sổ để ghi."); return; }`
bằng
`  await books.kiemTraLocale(BOOKS.np.sheetId); // ném nếu Sheet không ở vi_VN — dừng TRƯỚC khi ghi ngày sai`.

(b) Xoá dòng `  const proofs = [];   // reply người thanh toán + ảnh → đính chứng từ vào giao dịch gốc (xử lý ở pha riêng)`.

(c) Thay
```js
      if (loaiRep === "dinh") proofs.push(item);
      else if (loaiRep === "canhbao") {
```
bằng
```js
      if (loaiRep === "canhbao") {
```

(d) Trong dòng log `Kết quả: …`, xoá đoạn `${proofs.length ? ` · ${proofs.length} reply chứng từ` : ""}`.

(e) Xoá nguyên khối từ dòng `  // ── Pha đính ảnh chứng từ từ reply của người thanh toán vào folder giao dịch GỐC ──` tới hết vòng
`for (const item of proofs) { … }`, tức dòng ngay trước `  // ── Pha DỌN "báo sai"`.

(f) Trong dòng `if (dry) { logLine("[DRY] không ghi/react/lưu Drive (pha đính chứng từ + dọn báo sai + 📷 thiếu ảnh + hết hạn ở trên chỉ mô phỏng)."); return; }`
đổi chữ `(pha đính chứng từ + dọn báo sai` thành `(pha dọn báo sai`.

(g) Trong `catch` của vòng commit (dòng bắt đầu `      logLine(\`✗ commit ${d.book}/${d.tab} lỗi`), thêm
`      process.exitCode = 1;` ngay trước dòng `      continue;`.

Kiểm: `grep -n 'proofs\|PAYERS\|"dinh"\|noReport\|mirror()\|execFileSync' scanner.mjs`
Expected: chỉ còn kết quả nằm trong khối main (Step 5 thay khối đó). Chữ "mirror" trong comment không tính, nên grep
tìm `mirror()` (lời gọi hàm).

- [ ] **Step 5: Thay khối main**

Thay toàn bộ từ dòng `// ── Main (CHỈ chạy khi gọi trực tiếp từ CLI — import an toàn, không ghi/DM) ────` tới cuối file bằng:
```js
// ── Main (CHỈ chạy khi gọi trực tiếp từ CLI — import an toàn) ─────────────────
// MỌI lỗi đặt process.exitCode = 1 → workflow ĐỎ → GitHub gửi email. Bản gốc nuốt lỗi quét ("vẫn báo cáo") vì còn
// DM báo cáo làm kênh báo; NP không có DM, workflow đỏ là kênh báo lỗi DUY NHẤT.
if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  (async () => {
    if (!TOKEN) die("Thiếu DISCORD_BOT_TOKEN");
    const b = BOOKS.np, tab = b.tabs.default;
    if (!b.sheetId) die("config.json chưa có book.sheetId — chạy setup.mjs trước");
    if (!Object.keys(CHANS).length) die("config.json chưa khai kênh nào trong channels");
    // --xoadong=<dòng>:<sốtiền>[:<DD/MM/YYYY>] — xoá 1 dòng ghi nhầm. NP 1 sổ 1 tab nên khỏi khai book/tab như bản gốc.
    // Đối chiếu SỐ TIỀN (+ ngày) trước khi xoá để không xoá nhầm dòng khi ai đó đã chèn/xoá tay.
    if (xoaDongArg) {
      const [rowS, tienS, ngayS] = xoaDongArg.split(":");
      const rowNum = Number(rowS), expectAmount = Number(tienS);
      if (!Number.isInteger(rowNum) || rowNum < 2) die(`--xoadong: số dòng không hợp lệ '${rowS}' (dòng 1 là tiêu đề)`);
      if (!Number.isFinite(expectAmount) || expectAmount <= 0) die(`--xoadong: thiếu/sai số tiền đối chiếu '${tienS}' — BẮT BUỘC để không xoá nhầm dòng`);
      logLine(`=== Xoá dòng ${rowNum} · ${b.label}/${tab} · đối chiếu ${vnd(expectAmount)}đ${ngayS ? ` · ngày ${ngayS}` : ""}${dry ? " (DRY)" : ""} ===`);
      try {
        const r = await books.xoaDongSo({ sheetId: b.sheetId, tab, rowNum, expectAmount, expectDMY: ngayS || null, dry });
        logLine(r.dry ? `   [DRY] KHỚP — sẽ xoá: ${r.mota}` : `   🗑️ ĐÃ XOÁ dòng ${r.rowNum}: ${r.mota}`);
      } catch (e) { logLine(`   ✗ ${e?.message ?? e}`); process.exitCode = 1; }
      return;
    }
    // --suadong=<dòng>:<msgId> — đọc lại tin gốc, parse theo luật HIỆN TẠI, ghi đè Diễn giải + Ghi chú (tiền giữ nguyên).
    if (suaDongArg) {
      const [rowS, msgId] = suaDongArg.split(":");
      const rowNum = Number(rowS);
      if (!Number.isInteger(rowNum) || rowNum < 2 || !/^\d{5,}$/.test(msgId || "")) die("--suadong: cần <dòng>:<msgId> (id số, không phải link)");
      logLine(`=== Sửa chữ dòng ${rowNum} · ${b.label}/${tab} · theo tin ${msgId}${dry ? " (DRY)" : ""} ===`);
      const found = await timTinTheoId(msgId);
      if (!found) { logLine(`   ✗ không thấy tin ${msgId} trong kênh đã cấu hình`); process.exitCode = 1; return; }
      const it = dungItem(found.m, found.cid, found.c);
      const p = it ? parseEntry(it) : { skip: true, reason: "tin rỗng" };
      if (p.skip) { logLine(`   ✗ tin nay KHÔNG parse ra khoản (${p.reason}) — dừng.`); process.exitCode = 1; return; }
      const rt = route(it, p);
      if (rt.skip) { logLine(`   ✗ tin nay không route được (${rt.reason}) — dừng.`); process.exitCode = 1; return; }
      try {
        const r = await books.suaDongSo({ sheetId: b.sheetId, tab, rowNum, expectDMY: p.ngay, dienGiai: p.noiDung, ghiChu: p.ghiChu || "", dry });
        logLine(`   cũ : "${r.cu.dienGiai}" | ghi chú: "${r.cu.ghiChu}"`);
        logLine(`   mới: "${r.moi.dienGiai}" | ghi chú: "${r.moi.ghiChu}"`);
        logLine(r.dry ? "   [DRY] khớp ngày — sẽ ghi đè 2 ô trên." : `   ✏️ ĐÃ SỬA dòng ${r.rowNum}`);
      } catch (e) { logLine(`   ✗ ${e?.message ?? e}`); process.exitCode = 1; }
      return;
    }
    // --requet chạy RIÊNG: chấm lại đúng mấy tin được nêu rồi dừng (lệnh sửa chữa chạy tay).
    if (requetIds.length) {
      logLine(`=== Chấm lại ${requetIds.length} tin theo luật hiện tại${dry ? " (DRY)" : ""} ===`);
      try { await requetPhase(requetIds); } catch (e) { logLine("✗ requet lỗi: " + (e?.message ?? e)); process.exitCode = 1; }
      return;
    }
    logLine(`=== Scanner NP chạy (${sinceISO ? `since=${sinceArg}` : `days=${all ? "all" : days}`}${limit ? `, limit=${limit}` : ""}${dry ? ", DRY" : ""}${nhacLaiLuot ? ", nhắc lại" : ""}) ===`);
    try { await scanPhase(); } catch (e) { logLine("✗ Bước quét lỗi: " + (e?.message ?? e)); process.exitCode = 1; }
    logLine(process.exitCode ? "=== Xong — CÓ LỖI (workflow sẽ đỏ) ===" : "=== Xong ===");
  })();
}
```

- [ ] **Step 6: Chạy toàn bộ test**

Run: `npm test`
Expected: `test-parser.mjs` ra `N/N đạt` (có thêm 5 ca INTENT), `test-books.mjs` ra `5 test đạt`, exit 0.
Kiểm thêm: `grep -n 'proofs\|PAYERS\|noReport\|mirror()\|execFileSync\|report\.mjs' scanner.mjs` không in dòng nào.

- [ ] **Step 7: Smoke — token sai phải làm tiến trình thoát mã 1 (Review Focus #1)**

Tạm điền một kênh và một sheetId giả để qua được các kiểm `die()`. Không commit thay đổi này:
```bash
cp config.json /tmp/np-config.bak
node -e 'const f="config.json",c=JSON.parse(require("fs").readFileSync(f));c.book.sheetId="GIA";c.channels={"1111111111111111111":{name:"thu"}};require("fs").writeFileSync(f,JSON.stringify(c,null,2))'
DISCORD_BOT_TOKEN=token-sai node scanner.mjs --dry; echo "exit=$?"
cp /tmp/np-config.bak config.json && git diff --stat config.json
```
Expected: log có dòng `✗ Bước quét lỗi:`. Lỗi có thể đến từ Google (chưa có `token.json`, kiểm locale chạy trước)
hoặc từ Discord `401`, tuỳ bước nào gặp trước. Dòng cuối phải là `exit=1`, và `git diff --stat config.json` không
in gì. Điểm cần chứng minh: lỗi **không** bị nuốt thành "0 tin" + exit 0.

- [ ] **Step 8: Commit**

```bash
git add scanner.mjs test-parser.mjs
git -c user.name=AIGWTVN -c user.email=287866284+AIGWTVN@users.noreply.github.com commit -m "feat: lỗi Discord/locale/commit làm workflow đỏ; chặn thiếu Message Content Intent

Bản gốc nuốt lỗi đọc kênh (0 tin, job xanh) và lỗi quét (còn DM báo cáo làm kênh báo).
NP không có DM nên exit code là kênh báo lỗi duy nhất.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `setup.mjs` — tạo Sheet + folder Drive bằng `ai@gwt.vn`

**Files:**
- Create: `setup.mjs`, `test-setup.mjs`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: `books.buildFundRow` (để test so độ dài), `drive.createFolder(name, parentId) → {folderId, link}`, `lib/google-auth.getAuthClient()`.
- Produces:
  - `export const TAI_KHOAN = "ai@gwt.vn"`.
  - `export function keHoachSo() → { title, locale, timeZone, folderName, tabs:[{title, hidden, header:string[]}], tongHop:{ A1, A2, G1, G2 } }`.
  - CLI `node setup.mjs [--force]` ghi `book.sheetId` và `book.folderId` vào `config.json`.

- [ ] **Step 1: Viết test hỏng trước — `test-setup.mjs`**

```js
// Test kế hoạch dựng Sheet (offline) — chạy: node test-setup.mjs (exit 0 = đạt).
import assert from "node:assert/strict";
import { keHoachSo, TAI_KHOAN } from "./setup.mjs";
import { buildFundRow } from "./books.mjs";

const k = keHoachSo();
const so = k.tabs.find((t) => t.title === "Sổ chi phí");
let n = 0;
const t = (ten, fn) => { fn(); n++; console.log("  ✓ " + ten); };

t("đúng tài khoản ai@gwt.vn", () => assert.equal(TAI_KHOAN, "ai@gwt.vn"));
t("locale vi_VN + múi giờ VN", () => { assert.equal(k.locale, "vi_VN"); assert.equal(k.timeZone, "Asia/Ho_Chi_Minh"); });
t("4 tab, _state/_rep ẩn", () => {
  assert.deepEqual(k.tabs.map((x) => x.title), ["Sổ chi phí", "Tổng hợp", "_state", "_rep"]);
  assert.deepEqual(k.tabs.filter((x) => x.hidden).map((x) => x.title), ["_state", "_rep"]);
});
t("tiêu đề sổ = đúng số cột buildFundRow ghi (Review Focus #5)", () => {
  assert.equal(so.header.length, buildFundRow({ loai: "chi", ngay: "2026-10-05", dienGiai: "x", amount: 1 }).length);
  assert.deepEqual(so.header, ["STT", "Ngày", "Diễn giải", "Người", "Hoá đơn đỏ", "Thu", "Chi", "Tồn", "Link chứng từ", "Ghi chú"]);
});
t("_state cột D là msgId (loadProcessed đọc D2:D)", () => assert.equal(k.tabs.find((x) => x.title === "_state").header[3], "msgId (đừng sửa)"));
t("công thức Tổng hợp dùng ';' (locale vi) và bọc IFERROR", () => {
  for (const f of [k.tongHop.A2, k.tongHop.G2]) {
    assert.match(f, /^=IFERROR\(QUERY\('Sổ chi phí'!B2:G; "/);
    assert.ok(!/QUERY\([^;]*,\s*"/.test(f), "không được dùng ',' làm dấu ngăn tham số");
  }
});
console.log(`\n${n} test đạt`);
```

- [ ] **Step 2: Chạy cho thấy hỏng**

Run: `node test-setup.mjs`
Expected: FAIL với `Cannot find module '.../setup.mjs'`.

- [ ] **Step 3: Viết `setup.mjs`**

```js
#!/usr/bin/env node
// Dựng Sheet "Sổ chi phí New Projects" + folder Drive "Chứng từ New Projects" — CHẠY 1 LẦN, bằng tài khoản ai@gwt.vn.
//   node setup.mjs            → tạo mới, ghi sheetId/folderId vào config.json (từ chối nếu config đã có sheetId)
//   node setup.mjs --force    → vẫn tạo mới dù config đã có (file cũ KHÔNG bị xoá — tự dọn tay trên Drive)
// Cần credentials.json + token.json (node lib/auth.mjs) trong thư mục này. Spec §4.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { google } from "googleapis";
import { getAuthClient } from "./lib/google-auth.mjs";
import { createFolder } from "./drive.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const TAI_KHOAN = "ai@gwt.vn";

// THUẦN (test được): mọi thứ cần dựng. Công thức viết sẵn dấu ';' vì file được TẠO với locale vi_VN.
export function keHoachSo() {
  const loc = "'Sổ chi phí'!B2:G";
  return {
    title: "Sổ chi phí New Projects",
    locale: "vi_VN",
    timeZone: "Asia/Ho_Chi_Minh",
    folderName: "Chứng từ New Projects",
    tabs: [
      { title: "Sổ chi phí", hidden: false, header: ["STT", "Ngày", "Diễn giải", "Người", "Hoá đơn đỏ", "Thu", "Chi", "Tồn", "Link chứng từ", "Ghi chú"] },
      { title: "Tổng hợp", hidden: false, header: [] },
      // _state: bot append [thời điểm, "", "", msgId] — loadProcessed đọc D2:D. Không sửa tay.
      { title: "_state", hidden: true, header: ["Thời điểm", "", "", "msgId (đừng sửa)"] },
      // _rep: [msgId, id tin rep của bot, lý do] — để không nhắc lại cùng lý do và xoá đúng tin rep. Không sửa tay.
      { title: "_rep", hidden: true, header: ["msgId", "repMsgId", "Lý do"] },
    ],
    // Hai bảng ĐỘC LẬP (mỗi bảng tự có Năm/Tháng): tháng chỉ có thu không hiện ở bảng 2 → ghép chung cột sẽ lệch dòng.
    // Cột B phải là NGÀY thật (bot ghi dd/mm/yyyy USER_ENTERED ở locale vi_VN) thì year()/month() mới chạy.
    tongHop: {
      A1: "Theo tháng",
      A2: `=IFERROR(QUERY(${loc}; "select year(B), month(B)+1, sum(F), sum(G), count(G) where B is not null group by year(B), month(B)+1 order by year(B), month(B)+1 label year(B) 'Năm', month(B)+1 'Tháng', sum(F) 'Tổng thu', sum(G) 'Tổng chi', count(G) 'Số khoản chi'"; 0); "Chưa có dữ liệu")`,
      G1: "Chi theo hoá đơn đỏ (Có / Không)",
      G2: `=IFERROR(QUERY(${loc}; "select year(B), month(B)+1, sum(G) where B is not null and G is not null group by year(B), month(B)+1 pivot E label year(B) 'Năm', month(B)+1 'Tháng'"; 0); "Chưa có dữ liệu")`,
    },
  };
}

async function main() {
  process.chdir(DIR);
  const force = process.argv.includes("--force");
  const cfgPath = path.join(DIR, "config.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  if (cfg.book.sheetId && !force) throw new Error(`config.json đã có sheetId ${cfg.book.sheetId} — không tạo trùng. Cố ý tạo mới thì thêm --force.`);

  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });
  const sheets = google.sheets({ version: "v4", auth });
  // Chặn tạo nhầm tài khoản: token.json đăng nhập ai thì file thuộc người đó.
  const me = (await drive.about.get({ fields: "user(emailAddress)" })).data.user?.emailAddress;
  if (String(me).toLowerCase() !== TAI_KHOAN) throw new Error(`token.json đang là '${me}', phải là ${TAI_KHOAN} — chạy lại node lib/auth.mjs và đăng nhập đúng tài khoản.`);

  const k = keHoachSo();
  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: k.title, locale: k.locale, timeZone: k.timeZone },
      sheets: k.tabs.map((t, i) => ({ properties: { sheetId: i, title: t.title, hidden: t.hidden, gridProperties: { frozenRowCount: t.header.length ? 1 : 0 } } })),
    },
  });
  const sheetId = res.data.spreadsheetId;
  const data = k.tabs.filter((t) => t.header.length).map((t) => ({ range: `'${t.title}'!A1`, values: [t.header] }));
  data.push({ range: "'Tổng hợp'!A1", values: [[k.tongHop.A1]] }, { range: "'Tổng hợp'!A2", values: [[k.tongHop.A2]] },
    { range: "'Tổng hợp'!G1", values: [[k.tongHop.G1]] }, { range: "'Tổng hợp'!G2", values: [[k.tongHop.G2]] });
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: sheetId, requestBody: { valueInputOption: "USER_ENTERED", data } });
  // Định dạng: tiêu đề sổ in đậm; Thu/Chi/Tồn (F:H) số có ngăn nghìn.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: { requests: [
      { repeatCell: { range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
      { repeatCell: { range: { sheetId: 0, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 8 }, cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } } }, fields: "userEnteredFormat.numberFormat" } },
    ] },
  });
  const { folderId, link } = await createFolder(k.folderName, null);

  cfg.book.sheetId = sheetId;
  cfg.book.folderId = folderId;
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ ok: true, taiKhoan: me, sheetId, sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}`, folderId, folderUrl: link }, null, 2));
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("LỖI setup: " + (e?.message ?? e)); process.exit(1); });
}
```

- [ ] **Step 4: Chạy test cho thấy đạt**

Run: `node test-setup.mjs`
Expected: 6 dòng `✓`, `6 test đạt`, exit 0.

- [ ] **Step 5: Gộp vào `npm test`**

Đổi script `test` thành `"node test-parser.mjs && node test-books.mjs && node test-setup.mjs"`.
Run: `npm test` → Expected: cả ba file đạt, exit 0.

- [ ] **Step 6: Commit**

```bash
git add setup.mjs test-setup.mjs package.json
git -c user.name=AIGWTVN -c user.email=287866284+AIGWTVN@users.noreply.github.com commit -m "feat: setup.mjs dựng Sheet (vi_VN, 4 tab, Tổng hợp QUERY) + folder Drive, chặn sai tài khoản

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Workflow GitHub Actions + README + bản ghim kênh

**Files:**
- Create: `.github/workflows/scan.yml`, `README.md`, `HUONG-DAN-NHAN-TIN.md`

**Interfaces:**
- Consumes: CLI `node scanner.mjs [--days=7] [--nhac-lai] [--dry] …` (Task 3), `npm test` (Task 4).
- Produces: workflow `Sổ chi phí New Projects`, trigger `workflow_dispatch` (input `args`) + 3 cron.

- [ ] **Step 1: Viết `.github/workflows/scan.yml`**

```yaml
name: Sổ chi phí New Projects
on:
  workflow_dispatch:
    inputs:
      args:
        description: "Cờ thêm cho scanner. --dry = xem trước, KHÔNG ghi sổ/react/rep/lưu Drive. Trống = chạy thật."
        required: false
        default: ""
  schedule:
    - cron: "0 4 * * *"   # 11:00 VN
    - cron: "0 8 * * *"   # 15:00 VN
    - cron: "30 13 * * *" # 20:30 VN — kèm --nhac-lai (đẩy lại tin ⚠️ chưa sửa)
permissions:
  contents: read
concurrency:
  group: np-scan
  cancel-in-progress: false   # không huỷ lượt đang ghi giữa chừng
jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      TZ: Asia/Ho_Chi_Minh
      DISCORD_BOT_TOKEN: ${{ secrets.DISCORD_BOT_TOKEN }}
      GOOGLE_OAUTH_CREDENTIALS_JSON: ${{ secrets.GOOGLE_OAUTH_CREDENTIALS_JSON }}
      GOOGLE_OAUTH_TOKEN_JSON: ${{ secrets.GOOGLE_OAUTH_TOKEN_JSON }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - name: Cài dependencies
        run: npm ci
      - name: Test parser + sổ (đỏ thì không quét)
        run: npm test
      - name: Quét kênh New Projects
        env:
          SCHEDULE: ${{ github.event.schedule }}
          # $ARGS để TRẦN (không nháy kép) là cố ý: tách từ để truyền nhiều cờ ("--dry --limit=20").
          ARGS: ${{ github.event.inputs.args }}
        run: |
          if [ "$SCHEDULE" = "30 13 * * *" ]; then
            node scanner.mjs --days=7 --nhac-lai $ARGS
          else
            node scanner.mjs --days=7 $ARGS
          fi
```

- [ ] **Step 2: Viết `HUONG-DAN-NHAN-TIN.md` (bản ghim kênh)**

```markdown
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
| 📷 | Có số tiền nhưng thiếu ảnh | Sửa tin, đính ảnh vào |
| ⌛ | Tin ⚠️ đã quá 7 ngày | Gửi **tin mới** |

- **Sau khi đã ✅ mà sửa tin thì bot không cập nhật sổ.** Nhắn người quản lý sổ để sửa.
- Tin trao đổi thường (không số tiền, không ảnh) bot bỏ qua. Mở đầu bằng `note` hoặc `ghi chú` thì bot cũng bỏ qua, kể cả khi có số tiền.
- Reply (trả lời tin khác) **không bao giờ** được ghi sổ. Khoản mới thì gửi tin mới.
```

- [ ] **Step 3: Viết `README.md`**

```markdown
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
```

- [ ] **Step 4: Kiểm workflow hợp lệ YAML**

Run: `node -e 'console.log(require("node:fs").readFileSync(".github/workflows/scan.yml","utf8").includes("npm test"))'`
Expected: `true`. Kiểm cú pháp thật diễn ra khi push ở Step 5: GitHub hiện workflow trong tab Actions, không có cảnh
báo "Invalid workflow file".

- [ ] **Step 5: Commit + push**

```bash
git add .github README.md HUONG-DAN-NHAN-TIN.md
git -c user.name=AIGWTVN -c user.email=287866284+AIGWTVN@users.noreply.github.com commit -m "feat: workflow 3 lượt/ngày + README + bản ghim kênh New Projects

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
gh workflow list -R GWT-VN/NP-Bot-Chi-Phi
```
Expected: `gh workflow list` in dòng `Sổ chi phí New Projects  active`. Cron đã bật nhưng mỗi lượt sẽ đỏ
(`config.json chưa có book.sheetId`) cho tới khi xong Task 6. Đỏ như vậy là đúng ý đồ, không cần xử lý.

---

### Task 6: Đưa vào chạy (go-live) — phối hợp với chủ dự án

Task này không viết code, chỉ vận hành. Agent làm các bước **[Agent]**. Bước **[Chủ dự án]** thì agent dừng lại,
hướng dẫn, và chờ xác nhận. Agent không cầm token hay nội dung file OAuth.

**Files:**
- Modify: `config.json` (channelId + sheetId/folderId)

- [ ] **Step 1 [Chủ dự án]: Tạo bot Discord**

Discord Developer Portal → New Application "NP Chi Phí" → mục Bot:
- Reset Token, giữ token lại, không dán vào chat.
- Bật **Message Content Intent**.

OAuth2 → URL Generator: scope `bot`, quyền View Channel, Read Message History, Send Messages, Add Reactions. Mở link
vừa tạo, mời bot vào server GWT, rồi cấp quyền cho bot ở kênh New Projects. Gửi agent **link kênh** (chuột phải kênh →
Sao chép liên kết).

- [ ] **Step 2 [Agent]: Điền kênh vào `config.json`**

Link kênh có dạng `https://discord.com/channels/<guildId>/<channelId>`, lấy số cuối:
```bash
node -e 'const f="config.json",fs=require("fs"),c=JSON.parse(fs.readFileSync(f));c.channels={"<channelId>":{name:"new-projects"}};fs.writeFileSync(f,JSON.stringify(c,null,2)+"\n")'
```
(thay `<channelId>` bằng số thật).

- [ ] **Step 3 [Chủ dự án]: Đăng nhập Google bằng ai@gwt.vn**

Đặt `credentials.json` vào thư mục repo. Đây là OAuth client "Desktop app" của dự án Google Cloud mà bot Sổ quỹ đang
dùng, lấy từ Google Cloud Console → APIs & Services → Credentials. Sau đó chạy:
```bash
node lib/auth.mjs
```
Trình duyệt sẽ mở ra, chọn đăng nhập **ai@gwt.vn**. Kết quả phải in `Refresh token: CÓ ✓`.

- [ ] **Step 4 [Agent]: Chạy `setup.mjs`**

Run: `node setup.mjs`
Expected: JSON có `"taiKhoan": "ai@gwt.vn"`, kèm `sheetUrl` và `folderUrl`. `config.json` giờ có `sheetId` và
`folderId`. Nếu báo sai tài khoản thì quay lại Step 3. Mở `sheetUrl` để kiểm 4 tab:
- `Sổ chi phí` có dòng tiêu đề 10 cột.
- `Tổng hợp` hiện "Chưa có dữ liệu".
- `_state` và `_rep` bị ẩn.
- File → Cài đặt: Ngôn ngữ = Tiếng Việt (Việt Nam).

Kiểm thêm bằng: `node books.mjs ping <sheetId>`. Phải in đúng 4 tên tab.

- [ ] **Step 5 [Agent]: Commit cấu hình**

```bash
git add config.json
git -c user.name=AIGWTVN -c user.email=287866284+AIGWTVN@users.noreply.github.com commit -m "chore: điền kênh New Projects + Sheet/folder vừa dựng

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 6 [Chủ dự án]: Đặt 3 secret**

```bash
gh secret set DISCORD_BOT_TOKEN -R GWT-VN/NP-Bot-Chi-Phi
gh secret set GOOGLE_OAUTH_CREDENTIALS_JSON -R GWT-VN/NP-Bot-Chi-Phi < credentials.json
gh secret set GOOGLE_OAUTH_TOKEN_JSON -R GWT-VN/NP-Bot-Chi-Phi < token.json
```
Agent kiểm (chỉ tên, không có giá trị): `gh secret list -R GWT-VN/NP-Bot-Chi-Phi` phải ra đủ 3 tên.

- [ ] **Step 7 [Chủ dự án]: Gửi 3 tin thử vào kênh**

1. `chi Thử bot 10.000đ có hoá đơn đỏ` kèm 1 ảnh.
2. `chi Thử bot thiếu ảnh 5.000đ` không có ảnh.
3. `Thử bot 7.000đ` kèm ảnh, không có tiền tố.

- [ ] **Step 8 [Agent]: Chạy thử `--dry` trên Actions**

```bash
gh workflow run "Sổ chi phí New Projects" -R GWT-VN/NP-Bot-Chi-Phi -f args="--dry"
gh run list -R GWT-VN/NP-Bot-Chi-Phi -w "Sổ chi phí New Projects" -L 1
gh run watch <runId> -R GWT-VN/NP-Bot-Chi-Phi --exit-status
gh run view <runId> -R GWT-VN/NP-Bot-Chi-Phi --log | grep -E "Tìm thấy|✅|⚠️|📷|Kết quả|✗|Xong"
```
Expected: run xanh. Log có `Tìm thấy N tin` (N ≥ 3, tuỳ kênh đã có tin khác chưa) và với 3 tin thử:
`Kết quả: 1 ghi · 1 cần xử lý tay · 1 bỏ qua (không phải giao dịch) · 1 thiếu ảnh (📷).` (📷 được đếm cả vào "bỏ
qua", như bản gốc). Tin 1 ra `✅ CHI
10.000đ … HĐ:Có`, tin 2 ra 📷 [DRY], tin 3 ra ⚠️ `thiếu tiền tố`. Trên Discord **không** được có dấu nào (vì là dry).
Run đỏ thì đọc dòng `✗` (401/403 thì sai token hoặc thiếu quyền kênh; "rỗng chữ" thì chưa bật Intent), sửa rồi chạy
lại bước này.

- [ ] **Step 9 [Agent]: Chạy thật một lượt, kiểm kết quả**

```bash
gh workflow run "Sổ chi phí New Projects" -R GWT-VN/NP-Bot-Chi-Phi
```
Theo dõi như Step 8. Kiểm:
- Discord: tin 1 có ✅. Tin 2 có 📷. Tin 3 có ⚠️ và một tin rep "Kênh này cần chữ `thu` hoặc `chi` ở đầu tin…".
- Sheet `Sổ chi phí` dòng 2: Ngày hôm nay dạng dd/mm/yyyy, Hoá đơn đỏ "Có", Chi 10.000, Tồn −10.000, Link chứng từ
  mở ra folder có ảnh.
- `Tổng hợp`: bảng "Theo tháng" có tháng hiện tại với Tổng chi 10.000. Bảng hoá đơn có cột "Có" = 10.000.
- Sửa tin 3 thành `chi Thử bot 7.000đ`, chạy workflow lần nữa. Tin 3 chuyển ✅, ⚠️ được gỡ, tin rep bị xoá, sổ có dòng 3.

- [ ] **Step 10 [Chủ dự án]: Dọn dữ liệu thử và mở dùng**

- Xoá 2 dòng thử trong Sheet. Cột STT và Tồn là công thức nên tự đánh lại.
- Xoá 3 tin thử trên Discord.
- ID tin thử vẫn nằm trong `_state` nên bot không ghi lại. Cứ để nguyên.
- Nếu có số dư đầu kỳ thì nhập vào dòng 2, cột Thu.
- Ghim nội dung `HUONG-DAN-NHAN-TIN.md` lên kênh. Bot bỏ qua tin ghim nên ví dụ số tiền trong bản ghim không bị ghi.
- Chia sẻ Sheet cho người cần xem.
- **Watch** repo trên GitHub để nhận email khi workflow đỏ.
```
