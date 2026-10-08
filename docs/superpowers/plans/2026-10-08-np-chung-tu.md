# Chứng từ theo khoản + nhắc bổ sung + ngày thu/chi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khoản báo qua Zalo không cần ảnh vẫn được ghi. Mỗi khoản có một thư mục chứng từ trên Drive, ✅ kèm link và ngày đã ghi. Bot quét Drive và nhắc mỗi tối các khoản còn thiếu chứng từ.

**Architecture:**
- Thêm module `dichvu/chung-tu.mjs`: bảng `chung_tu` (CSDL v2), quét, nhắc tối. Nó được nối vào cổng công cụ (lúc ghi/sửa) và vòng bảo trì của `chinh.mjs`.
- Phần dùng chung với bot Discord (`books`, `drive`, `so-core`, `npso`) chỉ thêm **tuỳ chọn mới / trường mới**; mặc định giữ hành vi cũ.

**Tech Stack:** Node ≥ 22.13 (`node:sqlite`, `node:test`), googleapis (đã có), không thêm thư viện.

**Spec:** `docs/superpowers/specs/2026-10-08-np-chung-tu-design.md`

## Global Constraints

- **Bot Discord không đổi hành vi.**
  - `taoCoreThat` mặc định `thuMucRong: false`;
  - `luuChungTu` mặc định `taoRong: false`;
  - `capNhatDong` không truyền tuỳ chọn mới thì ghi y như cũ.
- **Không thêm thư viện npm.**
- **Giờ Việt Nam** (`Asia/Ho_Chi_Minh`) cho ngày ghi, giờ nhắc và mốc "mỗi ngày một lần".
- **Ngày trên sổ** ghi bằng `USER_ENTERED` dạng `dd/mm/yyyy`, như lúc commit (sheet locale vi). `RAW` sẽ thành chữ.
- **Cấu hình** `config.json` `dichvu.gioNhacChungTu`, mặc định `"20:00"`.
- **"Quá 3 ngày"** tính từ `ghi_luc`, không theo ngày chi.
- **Nhóm nhận nhắc:** mọi nhóm đã khai trong `zalo.groups` (kể cả nhóm thử). Không dùng nhóm vận hành.
- **Kiểu code:** comment và chữ hiển thị bằng tiếng Việt, theo giọng code hiện có. `node:sqlite` trả object không prototype, test chép `{ ...row }` trước khi `deepStrictEqual`.

## Review Focus

1. **Thư mục chứng từ bị xoá / mất quyền (Drive lỗi khi quét):** quét không vỡ, khoản vẫn còn trong danh sách nhắc, lỗi ghi vào nhật ký. *(Task 3: test "quét: … Drive lỗi".)*
2. **Đã có file nhưng sửa ghi chú sổ lỗi (Sheets 503 / không thấy dòng):** vẫn thôi nhắc, vì chứng từ đã có. *(Task 3: test "quét: sửa sổ lỗi".)*
3. **Người gửi sửa ngày sai dạng ("6-10"):** từ chối kèm lý do để Claude hỏi lại; không ghi ngày rác vào sổ. *(Task 2: test "sua_khoan đổi ngày".)*
4. **Ghi lại một khoản đã có trong sổ, hoặc gọi ghi hai lần:** không tạo hai dòng theo dõi, không nhắc trùng. *(Task 3: test "them: … không trùng".)*
5. **Bot Discord gọi `capNhatDong` / `luuChungTu` như cũ:** ghi chú vẫn nối như trước; không ảnh thì không tạo thư mục. *(Task 1: hai test "như cũ".)*

---

### Task 1: Sổ + Drive dùng chung — sửa ngày, bỏ cụm ghi chú, tạo thư mục rỗng, kiểm thư mục có file

**Files:**
- Modify: `books.mjs` (`capNhatDong`), `drive.mjs` (`luuChungTu`, thêm `thuMucCoFile`)
- Test: `test-books.mjs`, `test-drive.mjs`

**Interfaces:**
- Produces:
  - `capNhatDong(sheetId, tab, rowNum, { …cũ, boGhiChu?, ngay? }, { sheets? } = {})`
    - `boGhiChu`: bỏ các cụm ghi chú (ngăn bằng `"; "`) bắt đầu bằng chuỗi này;
    - `ngay`: `"d/m/yyyy"` hoặc `"dd/mm/yyyy"`, ghi cột B bằng `USER_ENTERED` dạng `dd/mm/yyyy`;
    - `sheets` dùng cho test.
  - `luuChungTu(drive, rootId, { …cũ, taoRong = false })`: `taoRong` → không có ảnh vẫn tạo thư mục khoản, trả link thư mục.
  - `thuMucCoFile(drive, folderId) → Promise<boolean>`

- [ ] **Step 1: Viết test thất bại.** Thêm vào cuối `test-books.mjs`, và thêm `capNhatDong` vào dòng `import { … } from "./books.mjs"` ở đầu file:

```js
// Dịch vụ Zalo 2026-10-08: sửa ngày khoản (USER_ENTERED như lúc commit) + bỏ "không có ảnh chứng từ" khi đã bổ sung.
function sheetsGia(ghiChu) {
  const goi = []
  return { goi, sheets: { spreadsheets: { values: {
    get: async () => ({ data: { values: [[ghiChu]] } }),
    batchUpdate: async (x) => { goi.push(["batch", x]) }, update: async (x) => { goi.push(["update", x]) } } } } }
}
test("capNhatDong: boGhiChu bỏ cụm ghi chú rồi nối ghiChuThem; ngay ghi cột B USER_ENTERED dd/mm/yyyy", async () => {
  const s = sheetsGia("không có ảnh chứng từ (đã xác nhận); đã xác nhận: Zalo #2 (tin 1)")
  await capNhatDong("S", "Đoàn", 7, { boGhiChu: "không có ảnh chứng từ", ghiChuThem: "đã bổ sung chứng từ 08/10" }, { sheets: s.sheets })
  assert.deepEqual(s.goi[0][1].requestBody.data, [{ range: "'Đoàn'!K7", values: [["đã xác nhận: Zalo #2 (tin 1); đã bổ sung chứng từ 08/10"]] }])
  const n = sheetsGia("")
  const r = await capNhatDong("S", "Đoàn", 7, { ngay: "6/10/2026" }, { sheets: n.sheets })
  assert.deepEqual(n.goi.map((g) => g[0]), ["update"]); assert.equal(r.updated, true)
  assert.deepEqual([n.goi[0][1].range, n.goi[0][1].valueInputOption, n.goi[0][1].requestBody.values], ["'Đoàn'!B7", "USER_ENTERED", [["06/10/2026"]]])
})
test("[Review Focus] capNhatDong không truyền tuỳ chọn mới → nối ghi chú y như cũ (bot Discord)", async () => {
  const s = sheetsGia("không có ảnh chứng từ")
  await capNhatDong("S", "Chi phí chung", 3, { ghiChuThem: "sửa theo X" }, { sheets: s.sheets })
  assert.deepEqual(s.goi[0][1].requestBody.data, [{ range: "'Chi phí chung'!K3", values: [["không có ảnh chứng từ; sửa theo X"]] }])
  assert.deepEqual((await capNhatDong("S", "T", 3, {}, { sheets: sheetsGia("").sheets })), { updated: false })
})
```

Thêm vào cuối `test-drive.mjs`, và đổi dòng import thành `import { duongChungTu, luuChungTu, thuMucCoFile } from "./drive.mjs";`:

```js
// Drive giả: không có gì sẵn; create cấp id F1, F2…; coFile → liệt kê file trong thư mục (không phải tìm folder) trả 1 file.
function driveGia({ coFile = false } = {}) {
  let n = 0; const tao = []
  return { tao, files: {
    list: async ({ q }) => ({ data: { files: coFile && !q.includes("mimeType") && !q.includes("appProperties") ? [{ id: "f1", name: "x.jpg" }] : [] } }),
    create: async ({ requestBody }) => { tao.push(requestBody.name); return { data: { id: `F${++n}`, name: requestBody.name } } } } }
}
test("[Review Focus] luuChungTu không ảnh: mặc định không tạo gì (bot Discord như cũ); taoRong → tạo thư mục khoản, trả link", async () => {
  const d = driveGia(), o = { kenh: "Đoàn", quy: "GWT - Tiền mặt", loai: "chi", hoaDon: "Không", dmy: "07/10/2026", msgId: "1791", desc: "Taxi", buffers: [] }
  assert.equal(await luuChungTu(d, "ROOT", o), ""); assert.equal(d.tao.length, 0)
  const link = await luuChungTu(d, "ROOT", { ...o, taoRong: true })
  assert.match(link, /^https:\/\/drive\.google\.com\/drive\/folders\/F\d+$/); assert.equal(d.tao.at(-1), "01. Taxi")
})
test("thuMucCoFile: thư mục trống → false; có file → true", async () => {
  assert.equal(await thuMucCoFile(driveGia(), "F1"), false)
  assert.equal(await thuMucCoFile(driveGia({ coFile: true }), "F1"), true)
})
```

- [ ] **Step 2: Chạy, xác nhận FAIL.** Lệnh: `node test-books.mjs; node test-drive.mjs`. Kỳ vọng: `capNhatDong` / `thuMucCoFile` chưa có (`does not provide an export named 'thuMucCoFile'`) hoặc assert sai.

- [ ] **Step 3: Sửa `books.mjs` `capNhatDong`.** Thay cả hàm bằng:

```js
export async function capNhatDong(sheetId, tab, rowNum, { dienGiai, hoaDon, nguonQuy, loai, amount, ghiChuThem, boGhiChu, ngay } = {}, { sheets = sheetsApi() } = {}) {
  const o = (k, v) => ({ range: `'${tab}'!${CHU[COT[k]]}${rowNum}`, values: [[v]] });
  const data = []
  if (dienGiai !== undefined) data.push(o("dienGiai", dienGiai));
  if (hoaDon !== undefined) data.push(o("hoaDon", loai === "thu" ? "—" : hoaDon));
  if (nguonQuy !== undefined) {
    data.push(o("nguonQuy", nguonQuy));
    // Đổi sang/khỏi Cá nhân ứng thì cột Đã hoàn ứng theo; đang "Đã hoàn" thì giữ (không xoá dấu người quản lý đã đánh).
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `'${tab}'!M${rowNum}` });
    const cu = String(((r.data.values || [])[0] || [])[0] ?? "").trim();
    if (nguonQuy === CA_NHAN_UNG && loai !== "thu" && !cu) data.push(o("daHoan", "Chưa"));
    if (nguonQuy !== CA_NHAN_UNG && cu === "Chưa") data.push(o("daHoan", ""));
  }
  if (amount !== undefined || loai !== undefined) {
    if (!loai || amount === undefined) throw new Error("sửa số tiền phải kèm cả loai lẫn amount");
    data.push(o("thu", loai === "thu" ? Number(amount) : ""), o("chi", loai === "thu" ? "" : Number(amount)));
  }
  if (ghiChuThem || boGhiChu) {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `'${tab}'!K${rowNum}` });
    const cu = String(((r.data.values || [])[0] || [])[0] ?? "").trim();
    // boGhiChu (dịch vụ Zalo 2026-10-08): bỏ cụm ghi chú bắt đầu bằng chuỗi này (vd "không có ảnh chứng từ" khi đã bổ sung).
    const giu = boGhiChu ? cu.split("; ").filter((p) => !p.startsWith(boGhiChu)).join("; ") : cu;
    data.push(o("ghiChu", [giu, ghiChuThem].filter(Boolean).join("; ")));
  }
  if (!data.length && ngay === undefined) return { updated: false };
  if (data.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: sheetId, requestBody: { valueInputOption: "RAW", data } });
  // Ngày ghi USER_ENTERED như commit (sheet locale vi đọc "dd/mm/yyyy" thành NGÀY) — RAW thành chữ, tab quỹ lọc theo ngày hỏng.
  if (ngay !== undefined) await sheets.spreadsheets.values.update({ spreadsheetId: sheetId, range: `'${tab}'!${CHU[COT.ngay]}${rowNum}`,
    valueInputOption: "USER_ENTERED", requestBody: { values: [[toDMY(ngay)]] } });
  return { updated: true, rowNum, so: data.length + (ngay !== undefined ? 1 : 0) };
}
```

- [ ] **Step 4: Sửa `drive.mjs`.**
  - Thay hàm `luuChungTu` bằng:

```js
export async function luuChungTu(drive, rootId, { kenh, quy, loai, hoaDon, dmy, msgId, desc, buffers, anhMsgId = null, taoRong = false }) {
  // taoRong (dịch vụ Zalo, 2026-10-08): khoản chưa có ảnh vẫn có thư mục để người gửi tự tải chứng từ vào. Bot Discord: false.
  if (!rootId || (!buffers?.length && !taoRong)) return "";
  const { folderId: parentId } = await ensurePath(drive, rootId, duongChungTu({ kenh, quy, loai, hoaDon, dmy }));
  return luuVaoGiaoDich(drive, parentId, { msgId, desc, buffers: buffers || [], anhMsgId });
}
```

  - Thêm ngay sau hàm `luuVaoGiaoDich`:

```js
/** Thư mục đã có ít nhất 1 file (không tính thùng rác) chưa — dịch vụ Zalo quét chứng từ bổ sung (2026-10-08). */
export async function thuMucCoFile(drive, folderId) {
  const res = await drive.files.list({
    q: `'${q(folderId)}' in parents and trashed = false`, fields: "files(id)", pageSize: 1,
    supportsAllDrives: true, includeItemsFromAllDrives: true,
  });
  return (res.data.files?.length ?? 0) > 0;
}
```

- [ ] **Step 5: Chạy, xác nhận PASS.** Lệnh: `node test-books.mjs && node test-drive.mjs`. Kỳ vọng: không có test fail.

- [ ] **Step 6: Chạy `npm test`, rồi commit**

```bash
git add books.mjs drive.mjs test-books.mjs test-drive.mjs
git commit -m "feat(np): sổ/Drive dùng chung — capNhatDong sửa ngày (USER_ENTERED) + bỏ cụm ghi chú; luuChungTu taoRong; thuMucCoFile (mặc định như cũ cho bot Discord)"
```

---

### Task 2: so-core + npso — trả ngày/đã có ảnh, sửa ngày, bổ sung chứng từ, thư mục rỗng cho dịch vụ

**Files:**
- Modify: `so-core.mjs`, `mcp/npso.mjs` (`taoCoreThat`)
- Test: `test-so-core.mjs`, `test-mcp.mjs`

**Interfaces:**
- Consumes: `capNhatDong` với `boGhiChu` / `ngay` (Task 1, qua `so.capNhat` của npso — npso truyền nguyên object nên không phải sửa).
- Produces:
  - `ghiKhoan(…) → { ok, da_ghi, link_anh, canh_bao, ngay: "dd/mm/yyyy", co_anh: boolean, … }`
  - `suaKhoan({ …, ngay? })`: sai dạng → `{ ok: false, ly_do }`
  - `boSungChungTu({ chat_id, message_id, ngay: "dd/mm" }) → { ok, dong }`
  - `taoCoreThat({ cfg, nguonTin, thuMucRong = false })`

- [ ] **Step 1: Viết test thất bại.** Thêm vào cuối `test-so-core.mjs`:

```js
// Dịch vụ Zalo 2026-10-08: ✅ hiện ngày đã ghi + biết đã có ảnh chưa; sửa ngày; bổ sung chứng từ sau.
test("[chứng từ] ghiKhoan trả ngay dd/mm/yyyy (chuẩn hoá thiếu số 0) + co_anh", async () => {
  const r = await dung([goc]).so.ghiKhoan({ ...DUNG, ngay: "7/10/2026" })
  assert.deepEqual([r.ngay, r.co_anh], ["07/10/2026", true])
  const g2 = msg("101", "chi taxi 50k qct", { attachments: [] })
  const r2 = await dung([g2]).so.ghiKhoan({ ...DUNG, message_id: "101" })
  assert.deepEqual([r2.ngay, r2.co_anh], ["05/10/2026", false])
})
test("[Review Focus] sua_khoan đổi ngày: chuẩn hoá rồi chuyển cho sổ; sai dạng → từ chối, không đụng sổ", async () => {
  const t = dung([goc, tl("110", "sửa ngày 6/10", "100")], { dongTheoMa: { "100": 7 } })
  const r = await t.so.suaKhoan({ chat_id: KENH, message_id: "100", yeu_cau_message_id: "110", ngay: "6/10/2026" })
  assert.equal(r.ok, true, r.ly_do); assert.equal(t.sua[0][1].ngay, "06/10/2026")
  const sai = await t.so.suaKhoan({ chat_id: KENH, message_id: "100", yeu_cau_message_id: "110", ngay: "6-10" })
  assert.equal(sai.ok, false); assert.match(sai.ly_do, /dd\/mm\/yyyy/); assert.equal(t.sua.length, 1)
})
test("[chứng từ] boSungChungTu: bỏ 'không có ảnh chứng từ', ghi ngày bổ sung; chưa có dòng / kênh lạ → từ chối", async () => {
  const t = dung([goc], { dongTheoMa: { "100": 7 } })
  const r = await t.so.boSungChungTu({ chat_id: KENH, message_id: "100", ngay: "08/10" })
  assert.equal(r.ok, true); assert.deepEqual(t.sua[0], [7, { boGhiChu: "không có ảnh chứng từ", ghiChuThem: "đã bổ sung chứng từ 08/10" }, KENH])
  assert.equal((await t.so.boSungChungTu({ chat_id: KENH, message_id: "999", ngay: "08/10" })).ok, false)
  assert.equal((await t.so.boSungChungTu({ chat_id: "lạ", message_id: "100", ngay: "08/10" })).ok, false)
})
```

Thêm vào cuối test `"lưu chứng từ Drive đi qua khoá liên tiến trình dùng chung (KHOA_DRIVE)…"` trong `test-mcp.mjs` (ngay trước `})` của test đó):

```js
  // Dịch vụ Zalo (2026-10-08): bật thuMucRong để khoản không ảnh vẫn có thư mục; mặc định false (bot Discord như cũ).
  assert.match(nguon, /taoCoreThat\(\{ cfg = null, nguonTin = null, thuMucRong = false \} = \{\}\)/)
  assert.match(nguon, /if \(\(!buffers\.length && !thuMucRong\) \|\| !folderId\) return "";/)
  assert.match(nguon, /taoRong: thuMucRong/)
```

- [ ] **Step 2: Chạy, xác nhận FAIL.** Lệnh: `node test-so-core.mjs; node test-mcp.mjs`. Kỳ vọng: 3 test so-core fail (`r.ngay` undefined, `boSungChungTu is not a function`), test KHOA_DRIVE của test-mcp fail ở regex mới.

- [ ] **Step 3: Sửa `so-core.mjs`.**
  - Ngay sau dòng `const dmyIso = …`, thêm:

```js
// "7/10/2026" → "07/10/2026" (Claude / người gửi viết thiếu số 0); sai dạng → null.
const chuanNgay = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? "").trim()); return m ? `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}` : null };
```

  - Trong `ghiKhoanTho`, sửa `return { ok: true, da_ghi: … }` cuối hàm: thêm `ngay: chuanNgay(ngay) || ngay, co_anh: coAnh && !!anh,` ngay sau `canh_bao: dau,`. Kết quả:

```js
    return { ok: true, da_ghi: `${a.loai.toUpperCase()} ${a.so_tien.toLocaleString("vi-VN")}đ · ${a.nguon_quy || "chưa ghi quỹ"} · HĐ ${a.hoa_don} · ${a.noi_dung}`, link_anh: anh || null, canh_bao: dau,
      ngay: chuanNgay(ngay) || ngay, co_anh: coAnh && !!anh,
      ...(thamChieu.length ? { tham_chieu: `bộ đọc luật thấy khác ở: ${thamChieu.join(", ")} — đọc lại tin; ghi sai thì sua_khoan` } : {}) };
```

  - Trong `suaKhoan`:
    - ngay sau dòng `if (sai) return tuChoi(sai);`, thêm:

```js
    if (a.ngay !== undefined && !chuanNgay(a.ngay)) return tuChoi("ngay phải dạng dd/mm/yyyy (vd 06/10/2026)");
```

    - trong lời gọi `so.capNhat(dong, { … }`, thêm `ngay: a.ngay === undefined ? undefined : chuanNgay(a.ngay),` ngay sau `amount: a.so_tien,`.

  - Thêm hàm mới ngay trước `return { kiemTin, ghiKhoan, suaKhoan, docSo, tinChuaXuLy };`, rồi thêm `boSungChungTu` vào object trả về:

```js
  // Dịch vụ Zalo (2026-10-08): thư mục chứng từ của khoản vừa có file → bỏ "không có ảnh chứng từ", ghi ngày bổ sung.
  async function boSungChungTu({ chat_id, message_id, ngay }) {
    if (!kenhHopLe(chat_id)) return tuChoi("kênh không phải kênh sổ chi phí NP");
    const dong = await so.timDong(String(message_id), String(chat_id));
    if (!dong) return tuChoi("không thấy dòng của khoản trong sổ");
    await so.capNhat(dong, { boGhiChu: "không có ảnh chứng từ", ghiChuThem: `đã bổ sung chứng từ ${ngay}` }, String(chat_id));
    return { ok: true, dong };
  }

  return { kiemTin, ghiKhoan, suaKhoan, docSo, tinChuaXuLy, boSungChungTu };
```

- [ ] **Step 4: Sửa `mcp/npso.mjs` `taoCoreThat`.**
  - Đổi dòng khai báo thành:

```js
export async function taoCoreThat({ cfg = null, nguonTin = null, thuMucRong = false } = {}) {
```

  - Trong `luuAnh`, thay hai dòng `if (!buffers.length || !folderId) return "";` và `return voiKhoa(…)` bằng:

```js
        // thuMucRong (dịch vụ Zalo, 2026-10-08): khoản chưa có ảnh vẫn tạo thư mục để người gửi tự tải chứng từ; Discord giữ như cũ.
        if ((!buffers.length && !thuMucRong) || !folderId) return "";
        return voiKhoa(KHOA_DRIVE, () => drive.luuChungTu(drive.getDrive(), folderId, { kenh: tab(kenh), quy, loai, hoaDon, dmy: ngay, msgId: msgs[0].id, desc: noiDung, buffers, taoRong: thuMucRong }));
```

- [ ] **Step 5: Chạy, xác nhận PASS.** Lệnh: `node test-so-core.mjs && node test-mcp.mjs`. Kỳ vọng: không có test fail.

- [ ] **Step 6: Chạy `npm test`, rồi commit**

```bash
git add so-core.mjs mcp/npso.mjs test-so-core.mjs test-mcp.mjs
git commit -m "feat(np): so-core trả ngày + co_anh, sua_khoan đổi ngày, boSungChungTu; taoCoreThat thuMucRong (mặc định false — Discord như cũ)"
```

---

### Task 3: CSDL v2 + `dichvu/chung-tu.mjs` (theo dõi, quét, nhắc tối)

**Files:**
- Create: `dichvu/chung-tu.mjs`, `test-dv-chung-tu.mjs`
- Modify: `dichvu/csdl.mjs` (`CAU_TRUC` thêm phiên bản 2), `test-dv-csdl.mjs`, `test-dv-chinh.mjs` (phiên bản 1 → 2), `package.json`

**Interfaces:**
- Consumes:
  - `datMoc`, `layMoc`, `moCsdl`, `taoKhoTin` (csdl);
  - `hopThu.xepGui` (hop-thu);
  - `core.boSungChungTu` (Task 2).
- Produces:
  - `idThuMuc(link) → string | null`
  - `taoChungTu({ db, hopThu, core, coFile, nhom, gioNhac = "20:00", now = Date.now, nhatKy })` → `{ them({ tin, loai, so_tien, ngay, link, co_anh }) → boolean, capNhat(tinId, { loai?, so_tien?, ngay? }), quet() → Promise<number>, nhacToi() → number, soThieu() → number }`
  - `coFile(folderId) → Promise<boolean>` do bên gọi truyền vào (`chinh.mjs` dùng `drive.thuMucCoFile`).

- [ ] **Step 1: Viết test thất bại.** Tạo `test-dv-chung-tu.mjs`:

```js
// Test chứng từ theo khoản (Drive giả) — chạy: node test-dv-chung-tu.mjs. Spec 2026-10-08-np-chung-tu.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { moCsdl, taoKhoTin } from "./dichvu/csdl.mjs";
import { taoHopThu } from "./dichvu/hop-thu.mjs";
import { taoChungTu, idThuMuc } from "./dichvu/chung-tu.mjs";

const G = "g1";
let t0 = 1791300000000;
const cn = (text, o = {}) => ({ event_name: "message.text.received", message: { message_id: `z${++t0}`, date: t0,
  chat: { id: G, chat_type: "GROUP" }, from: { id: "u1", display_name: "Dũng" }, text, ...o } });
function dung({ coFile = async () => false, gio = "2026-10-10T19:00:00+07:00", boSung } = {}) {
  const db = moCsdl(":memory:"), kho = taoKhoTin(db, { tenBot: "Bot GWT CP" })
  let luc = Date.parse(gio)
  const hopThu = taoHopThu({ db, kho, api: { guiChu: async () => [{ message_id: "b", date: luc }] }, now: () => luc })
  const sua = [], nk = []
  const core = { boSungChungTu: boSung ?? (async (a) => { sua.push(a); return { ok: true, dong: 7 } }) }
  const ct = taoChungTu({ db, hopThu, core, coFile, nhom: { [G]: { name: "đoàn" } }, gioNhac: "20:00", now: () => luc, nhatKy: (d) => nk.push(d) })
  const khoan = (text, o = {}, them = {}) => {
    const tin = kho.nhanTin(cn(text, o), { now: luc })
    ct.them({ tin, loai: "chi", so_tien: 50000, ngay: "07/10/2026", link: `https://drive.google.com/drive/folders/F${tin.ma}`, co_anh: false, ...them })
    return tin
  }
  const gui = () => db.prepare("SELECT chat_id, noi_dung, loai FROM gui ORDER BY id").all().map((r) => ({ ...r }))
  return { db, kho, ct, khoan, gui, sua, nk, troi: (ms) => { luc += ms }, datGio: (s) => { luc = Date.parse(s) } }
}

test("CSDL cũ (phiên bản 1) mở lại → tự nâng lên 2, có bảng chung_tu, dữ liệu cũ còn", () => {
  const f = join(mkdtempSync(join(tmpdir(), "ct-")), "np.sqlite")
  const db1 = moCsdl(f), a = taoKhoTin(db1, { tenBot: "Bot GWT CP" }).nhanTin(cn("@Bot GWT CP chi 50k"))
  db1.exec("DROP TABLE chung_tu; UPDATE phien_ban SET so = 1"); db1.close()
  const db2 = moCsdl(f)
  assert.equal(db2.prepare("SELECT so FROM phien_ban").get().so, 2)
  assert.equal(taoKhoTin(db2).lay(a.id).noi_dung, "chi 50k")
  assert.equal(db2.prepare("SELECT COUNT(*) AS n FROM chung_tu").get().n, 0)
})

test("idThuMuc: lấy id từ link thư mục Drive; link lạ → null", () => {
  assert.equal(idThuMuc("https://drive.google.com/drive/folders/1AbC-_x"), "1AbC-_x"); assert.equal(idThuMuc("https://drive/x"), null)
})

test("[Review Focus] them: theo dõi khoản có link; có ảnh lúc ghi → đã đủ; không link → không theo dõi; ghi lại cùng khoản → không trùng", () => {
  const t = dung()
  const a = t.khoan("@Bot GWT CP chi 50k taxi"); t.khoan("@Bot GWT CP chi 60k nước", {}, { co_anh: true })
  t.ct.them({ tin: a, loai: "chi", so_tien: 50000, link: "https://drive.google.com/drive/folders/F1", co_anh: false })
  const kl = t.kho.nhanTin(cn("@Bot GWT CP chi 70k"), { now: 0 })
  assert.equal(t.ct.them({ tin: kl, loai: "chi", so_tien: 70000, link: "", co_anh: false }), false)
  assert.equal(t.ct.soThieu(), 1)
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM chung_tu").get().n, 2)
})

test("capNhat: sửa số tiền / loại / ngày của khoản đang theo dõi; bỏ trống thì giữ", () => {
  const t = dung(), a = t.khoan("@Bot GWT CP chi 50k")
  t.ct.capNhat(a.id, { so_tien: 90000 }); t.ct.capNhat(a.id, { ngay: "06/10/2026" })
  assert.deepEqual({ ...t.db.prepare("SELECT loai, so_tien, ngay FROM chung_tu WHERE tin_id=?").get(a.id) }, { loai: "chi", so_tien: 90000, ngay: "06/10/2026" })
})

test("[Review Focus] quét: thư mục trống → vẫn thiếu; có file → đủ + sửa ghi chú sổ (ngày bổ sung dd/mm); Drive lỗi → bỏ qua, không vỡ", async () => {
  const co = new Set(["F2"])
  const t = dung({ coFile: async (id) => { if (id === "F3") throw new Error("Drive 500"); return co.has(id) } })
  t.khoan("@Bot GWT CP chi 50k a"); const b = t.khoan("@Bot GWT CP chi 50k b"); t.khoan("@Bot GWT CP chi 50k c")
  assert.equal(await t.ct.quet(), 1)
  assert.equal(t.ct.soThieu(), 2)
  assert.deepEqual(t.sua, [{ chat_id: G, message_id: b.id, ngay: "10/10" }])
  assert.match(t.nk.find((d) => d.loi_drive).loi_drive, /Drive 500/)
})

test("[Review Focus] quét: sửa sổ lỗi / không thấy dòng → vẫn thôi nhắc (đã có file), chỉ ghi nhật ký", async () => {
  const t = dung({ coFile: async () => true, boSung: async () => { throw new Error("Sheets 503") } })
  t.khoan("@Bot GWT CP chi 50k a")
  assert.equal(await t.ct.quet(), 1); assert.equal(t.ct.soThieu(), 0); assert.match(t.nk[0].loi_so, /Sheets 503/)
  const h = dung({ coFile: async () => true, boSung: async () => ({ ok: false, ly_do: "không thấy dòng" }) })
  h.khoan("@Bot GWT CP chi 50k b")
  assert.equal(await h.ct.quet(), 1); assert.equal(h.ct.soThieu(), 0); assert.equal(h.nk[0].so, "không thấy dòng")
})

test("nhắc tối: trước 20:00 → không; từ 20:00 → MỘT tin/nhóm (#N tên số tiền link, quá 3 ngày đánh dấu); cùng ngày → không lặp; hôm sau → lại; nhóm chưa khai → không", () => {
  const t = dung({ gio: "2026-10-06T10:00:00+07:00" })
  t.khoan("@Bot GWT CP chi 50k cũ")
  t.datGio("2026-10-10T09:00:00+07:00"); t.khoan("@Bot GWT CP chi 120k mới", {}, { so_tien: 120000 })
  t.khoan("@Bot GWT CP chi 50k nhóm lạ", { chat: { id: "g9", chat_type: "GROUP" } })
  t.datGio("2026-10-10T19:59:00+07:00"); assert.equal(t.ct.nhacToi(), 0)
  t.datGio("2026-10-10T20:05:00+07:00"); assert.equal(t.ct.nhacToi(), 1)
  assert.deepEqual(t.gui(), [{ chat_id: G, loai: "nhac_ct", noi_dung: "📎 Còn thiếu chứng từ (2):\n"
    + "#1 Dũng 50.000đ (quá 3 ngày) https://drive.google.com/drive/folders/F1\n#2 Dũng 120.000đ https://drive.google.com/drive/folders/F2" }])
  t.troi(600e3); assert.equal(t.ct.nhacToi(), 0)
  t.datGio("2026-10-11T20:01:00+07:00"); assert.equal(t.ct.nhacToi(), 1)
})

test("nhắc tối: không còn khoản thiếu → không gửi gì", () => {
  const t = dung({ gio: "2026-10-10T20:30:00+07:00" }); t.khoan("@Bot GWT CP chi 50k", {}, { co_anh: true })
  assert.equal(t.ct.nhacToi(), 0); assert.deepEqual(t.gui(), [])
})
```

  - Trong `test-dv-csdl.mjs`, test `"moCsdl: dựng cấu trúc phiên bản 1; …"`: đổi tên thành `"moCsdl: dựng cấu trúc phiên bản mới nhất (2); …"` và đổi `assert.equal(db2.prepare("SELECT so FROM phien_ban").get().so, 1)` thành `…, 2)`.
  - Trong `test-dv-chinh.mjs`, test bảo trì: đổi `assert.equal(moCsdl(f).prepare("SELECT so FROM phien_ban").get().so, 1)` thành `…, 2)`.

- [ ] **Step 2: Chạy, xác nhận FAIL.** Lệnh: `node test-dv-chung-tu.mjs`. Kỳ vọng: `Cannot find module './dichvu/chung-tu.mjs'`.

- [ ] **Step 3: Thêm phiên bản 2 vào `dichvu/csdl.mjs`.**
  - `CAU_TRUC` hiện là mảng một chuỗi. Thêm phần tử thứ hai: sửa dòng đóng `` `]; `` của mảng thành `` `, `` rồi thêm:

```js
// v2 (2026-10-08): chứng từ theo khoản — thư mục Drive của khoản đã có file chưa, để quét + nhắc bổ sung (dichvu/chung-tu.mjs).
`CREATE TABLE chung_tu(tin_id TEXT PRIMARY KEY REFERENCES tin(id), chat_id TEXT NOT NULL, ma INTEGER, ten TEXT, loai TEXT,
  so_tien INTEGER, ngay TEXT, thu_muc TEXT NOT NULL, link TEXT NOT NULL, ghi_luc INTEGER NOT NULL,
  co_file INTEGER NOT NULL DEFAULT 0, bo_sung_luc INTEGER);
CREATE INDEX chung_tu_thieu ON chung_tu(co_file, chat_id);
`];
```

  - Sửa comment đầu file: "Bảng viec / gui do hang-doi.mjs / hop-thu.mjs giữ SQL của mình" thành "Bảng viec / gui / chung_tu do hang-doi.mjs / hop-thu.mjs / chung-tu.mjs giữ SQL của mình".

- [ ] **Step 4: Viết `dichvu/chung-tu.mjs`**

```js
// Chứng từ theo khoản (spec 2026-10-08-np-chung-tu): mỗi khoản ghi sổ có một thư mục Drive; khoản chưa có file thì bot nhắc
// trong bản tổng hợp tối (mỗi nhóm một tin/ngày) cho tới khi có. Zalo không chuyển album cho bot → chứng từ thứ 2 trở đi
// người gửi tự tải vào thư mục qua link trong tin ✅. Bảng chung_tu do file này giữ SQL.
import { datMoc, layMoc } from "./csdl.mjs";

const NGAY = 86400e3;
const ngayVN = (t) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }); // YYYY-MM-DD
const gioVN = (t) => new Date(t).toLocaleTimeString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
const ddmm = (t) => { const [, m, d] = ngayVN(t).split("-"); return `${d}/${m}` };
export const idThuMuc = (link) => /\/folders\/([\w-]+)/.exec(String(link || ""))?.[1] ?? null;

export function taoChungTu({ db, hopThu, core, coFile, nhom = {}, gioNhac = "20:00", now = Date.now, nhatKy = () => {} }) {
  const q = {
    them: db.prepare(`INSERT OR IGNORE INTO chung_tu(tin_id,chat_id,ma,ten,loai,so_tien,ngay,thu_muc,link,ghi_luc,co_file)
      VALUES ($tin_id,$chat_id,$ma,$ten,$loai,$so_tien,$ngay,$thu_muc,$link,$ghi_luc,$co_file)`),
    sua: db.prepare("UPDATE chung_tu SET loai=COALESCE(?,loai), so_tien=COALESCE(?,so_tien), ngay=COALESCE(?,ngay) WHERE tin_id=?"),
    thieu: db.prepare("SELECT * FROM chung_tu WHERE co_file=0 ORDER BY chat_id, ma"),
    du: db.prepare("UPDATE chung_tu SET co_file=1, bo_sung_luc=? WHERE tin_id=?"),
  };

  /** Sau ghi_khoan thành công. Không có link thư mục (Drive lỗi / khoản đã có từ trước) → không theo dõi. */
  function them({ tin, loai, so_tien, ngay = null, link, co_anh }) {
    const thu_muc = idThuMuc(link);
    if (!thu_muc) return false;
    q.them.run({ tin_id: tin.id, chat_id: tin.chat_id, ma: tin.ma, ten: tin.ten || "", loai, so_tien, ngay, thu_muc, link,
      ghi_luc: now(), co_file: co_anh ? 1 : 0 });
    return true;
  }

  /** Khoản chưa có file → hỏi Drive; có rồi → thôi nhắc + sửa ghi chú sổ (sổ lỗi chỉ ghi nhật ký: thôi nhắc vẫn đúng). */
  async function quet() {
    let du = 0;
    for (const r of q.thieu.all()) {
      let co;
      try { co = await coFile(r.thu_muc) }
      catch (e) { nhatKy({ chung_tu: r.tin_id, loi_drive: String(e?.message ?? e).slice(0, 150) }); continue }
      if (!co) continue;
      q.du.run(now(), r.tin_id);
      du++;
      try {
        const kq = await core.boSungChungTu({ chat_id: r.chat_id, message_id: r.tin_id, ngay: ddmm(now()) });
        if (!kq?.ok) nhatKy({ chung_tu: r.tin_id, so: kq?.ly_do });
      } catch (e) { nhatKy({ chung_tu: r.tin_id, loi_so: String(e?.message ?? e).slice(0, 150) }) }
    }
    return du;
  }

  /** Từ giờ nhắc trở đi trong ngày: mỗi nhóm đã khai còn khoản thiếu → MỘT tin (mốc nhac_ct:<nhóm>:<ngày> chống lặp). */
  function nhacToi() {
    const t = now();
    if (gioVN(t) < gioNhac) return 0;
    const theoNhom = new Map();
    for (const r of q.thieu.all()) {
      if (!Object.prototype.hasOwnProperty.call(nhom, r.chat_id)) continue;
      if (!theoNhom.has(r.chat_id)) theoNhom.set(r.chat_id, []);
      theoNhom.get(r.chat_id).push(r);
    }
    let gui = 0;
    for (const [chat_id, ds] of theoNhom) {
      const moc = `nhac_ct:${chat_id}:${ngayVN(t)}`;
      if (layMoc(db, moc) != null) continue;
      const dong = ds.map((r) => `#${r.ma} ${r.ten} ${Number(r.so_tien).toLocaleString("vi-VN")}đ${t - r.ghi_luc > 3 * NGAY ? " (quá 3 ngày)" : ""} ${r.link}`);
      hopThu.xepGui({ chat_id, noi_dung: [`📎 Còn thiếu chứng từ (${ds.length}):`, ...dong].join("\n"), loai: "nhac_ct" });
      datMoc(db, moc, t);
      gui++;
    }
    return gui;
  }

  return {
    them, quet, nhacToi,
    capNhat: (tinId, { loai = null, so_tien = null, ngay = null } = {}) => { q.sua.run(loai, so_tien, ngay, String(tinId)) },
    soThieu: () => q.thieu.all().length,
  };
}
```

- [ ] **Step 5: Chạy, xác nhận PASS.** Lệnh: `node test-dv-chung-tu.mjs && node test-dv-csdl.mjs && node test-dv-chinh.mjs`. Kỳ vọng: không có test fail.

- [ ] **Step 6: Thêm `&& node test-dv-chung-tu.mjs` vào `scripts.test`** (trước `&& node --test bot/hooks…`). Chạy `npm test`, rồi commit:

```bash
git add dichvu/csdl.mjs dichvu/chung-tu.mjs test-dv-chung-tu.mjs test-dv-csdl.mjs test-dv-chinh.mjs package.json
git commit -m "feat(np-dichvu): CSDL v2 bảng chung_tu + chung-tu.mjs — theo dõi thư mục chứng từ từng khoản, quét Drive, nhắc tổng hợp tối (mỗi nhóm 1 tin/ngày, quá 3 ngày đánh dấu)"
```

---

### Task 4: Cổng công cụ — ✅ có ngày + dòng 📎 hai kiểu, theo dõi chứng từ, `sua_khoan` nhận `ngay`

**Files:**
- Modify: `dichvu/cong-cu.mjs`, `test-dv-cong-cu.mjs`, `test-dv-dau-cuoi.mjs` (regex ✅ có ngày)

**Interfaces:**
- Consumes:
  - `ghiKhoan` trả `ngay`, `co_anh` (Task 2);
  - `chungTu.them` / `chungTu.capNhat` (Task 3).
- Produces: `taoCongCu({ core, kho, hopThu, canhBao?, chungTu?, nhatKy? })`. `chungTu` mặc định là object không làm gì.

- [ ] **Step 1: Sửa test (thất bại).** Trong `test-dv-cong-cu.mjs`:
  - Hàm `dung`:
    - đổi khai báo thành `async function dung({ loiSheet = false, linkAnh = "", dongSo = null } = {}) {`;
    - trong `so: { … }` của `taoSo`: đổi `timDong: async () => null` thành `timDong: async () => dongSo`, rồi thêm `capNhat: async (...x) => { capNhat.push(x) },`;
    - khai báo `const capNhat = [], ct = []` ở đầu hàm;
    - đổi lời gọi `taoCongCu({ core, kho, hopThu, canhBao: … })` thành:

```js
  const cc = taoCongCu({ core, kho, hopThu, canhBao: { bao: (k) => bao.push(k) },
    chungTu: { them: (x) => { ct.push(x); return true }, capNhat: (...x) => { ct.push(["sua", ...x]) } } })
```

    - thêm helper ảnh ngay sau dòng `const tin = …`:

```js
  const anh = (ch, caption) => { const x = kho.nhanTin({ event_name: "message.image.received", message: { message_id: `z${++t0}`, date: t0,
    chat: { id: ch, chat_type: "GROUP" }, from: { id: "u1", display_name: "Quỳnh Mai" }, photo_url: "https://zalo/a.jpg", caption } })
    kho.datAnh(x.id, { tep: "/x/a.jpg", tt: "da_tai" }); return kho.lay(x.id) }
```

    - sửa dòng `return` cuối hàm thành `return { kho, cc, noi, tin, anh, phien, ghi, gui, bao, ct, capNhat, dong: () => cc.dong() }`.
  - Test `"ghi_khoan thành công → …"`: đổi regex `/^✅ #1 Quỳnh Mai · CHI 50\.000đ · GWT - Tiền mặt/` thành `/^✅ #1 Quỳnh Mai · \d{2}\/\d{2} · CHI 50\.000đ · GWT - Tiền mặt/`.
  - Thay **toàn bộ** test `"ghi_khoan lưu được ảnh → tin ✅ kèm dòng link thư mục chứng từ; …"` bằng:

```js
test("ghi_khoan → ✅ có ngày + link thư mục: chưa có ảnh → 'Chưa có chứng từ, tải vào'; có ảnh → 'Thêm chứng từ'; theo dõi chứng từ; không link → không dòng 📎", async () => {
  const L = "https://drive.google.com/drive/folders/F1"
  const t = await dung({ linkAnh: L }); try {
    const k = t.tin(A, "@Bot GWT CP chi 50k taxi tiền mặt"), c = await t.noi(t.phien(k))
    assert.equal((await goi(c, "ghi_khoan", { message_id: k.id, ...CHI })).loi, false)
    assert.match(t.gui()[0].noi_dung, /^✅ #1 Quỳnh Mai · \d{2}\/\d{2} · CHI 50\.000đ[^\n]*\n📎 Chưa có chứng từ, tải vào: https:\/\/drive\.google\.com\/drive\/folders\/F1$/)
    assert.deepEqual([t.ct[0].tin.id, t.ct[0].co_anh, t.ct[0].link, t.ct[0].so_tien], [k.id, false, L, 50000])
    const h = t.anh(A, "@Bot GWT CP chi 60k nước tiền mặt"), c2 = await t.noi(t.phien(h))
    assert.equal((await goi(c2, "ghi_khoan", { message_id: h.id, ...CHI, so_tien: 60000 })).loi, false)
    assert.match(t.gui()[1].noi_dung, /\n📎 Thêm chứng từ: https:\/\/drive\.google\.com\/drive\/folders\/F1$/); assert.equal(t.ct[1].co_anh, true)
  } finally { await t.dong() }
  const k2 = await dung(); try {
    const k = k2.tin(A, "@Bot GWT CP chi 50k taxi tiền mặt"), c = await k2.noi(k2.phien(k))
    await goi(c, "ghi_khoan", { message_id: k.id, ...CHI }); assert.doesNotMatch(k2.gui()[0].noi_dung, /📎/); assert.deepEqual(k2.ct, [])
  } finally { await k2.dong() }
})

test("sua_khoan nhận ngay ('sửa #1 ngày 6/10') → sổ đổi ngày dd/mm/yyyy; khoản đang theo dõi chứng từ cập nhật theo", async () => {
  const t = await dung({ dongSo: 7 }); try {
    const k = t.tin(A, "@Bot GWT CP chi 50k taxi tiền mặt"), y = t.tin(A, "@Bot GWT CP sửa #1 ngày 6/10"), c = await t.noi(t.phien(y))
    const r = await goi(c, "sua_khoan", { message_id: k.id, yeu_cau_message_id: y.id, ngay: "6/10/2026" })
    assert.equal(r.loi, false, r.chu); assert.equal(t.capNhat[0][1].ngay, "06/10/2026")
    assert.deepEqual(t.ct.at(-1), ["sua", k.id, { loai: null, so_tien: null, ngay: "6/10/2026" }])
    assert.match(t.gui().at(-1).noi_dung, /^✏️ Đã sửa #1/)
  } finally { await t.dong() }
})
```

  - `test-dv-dau-cuoi.mjs`, test ảnh đủ: đổi regex `/^✅ #1 Quỳnh Mai · CHI 180\.000đ · Cá nhân ứng/` thành `/^✅ #1 Quỳnh Mai · \d{2}\/\d{2} · CHI 180\.000đ · Cá nhân ứng/`.

- [ ] **Step 2: Chạy, xác nhận FAIL.** Lệnh: `node test-dv-cong-cu.mjs`. Kỳ vọng: ba test ✅ / `sua_khoan` fail (✅ chưa có ngày, `sua_khoan` chưa nhận `ngay`).

- [ ] **Step 3: Sửa `dichvu/cong-cu.mjs`.**
  - Khai báo: `export function taoCongCu({ core, kho, hopThu, canhBao = { bao: () => {} }, chungTu = { them: () => false, capNhat: () => {} }, nhatKy = () => {} }) {`
  - Trong `ghi_khoan`, thay đoạn từ `const m = kho.lay(a.message_id), anhLoi = …` tới hết lời gọi `bao(…)` bằng:

```js
      const m = kho.lay(a.message_id), anhLoi = (kq.canh_bao || []).some((x) => /ảnh/.test(x));
      const daCo = String(kq.da_ghi || "").startsWith("khoản này đã có");
      // Zalo không chuyển album cho bot → mỗi khoản một thư mục; chứng từ thiếu / thêm người gửi tự tải vào (2026-10-08).
      const dongAnh = !kq.link_anh ? "" : kq.co_anh ? `\n📎 Thêm chứng từ: ${kq.link_anh}` : `\n📎 Chưa có chứng từ, tải vào: ${kq.link_anh}`;
      bao(daCo ? `✅ #${m?.ma} đã có trong sổ`
        : `✅ #${m?.ma} ${m?.ten || ""}${kq.ngay ? ` · ${String(kq.ngay).slice(0, 5)}` : ""} · ${kq.da_ghi}`
          + `${anhLoi ? " (chưa lưu được ảnh chứng từ — người quản lý kiểm tra)" : ""}${dongAnh}`);
      if (!daCo && m && kq.link_anh) chungTu.them({ tin: m, loai: a.loai, so_tien: a.so_tien, ngay: kq.ngay, link: kq.link_anh, co_anh: !!kq.co_anh });
```

  - Trong `sua_khoan`:
    - `description` thêm câu: "Đổi ngày thu/chi → ngay (dd/mm/yyyy).";
    - `inputSchema` thêm `ngay: z.string().regex(/^\d{1,2}\/\d{1,2}\/\d{4}$/).optional()`;
    - trong nhánh `if (kq?.ok) { … }`, thêm `chungTu.capNhat(a.message_id, { loai: a.loai ?? null, so_tien: a.so_tien ?? null, ngay: a.ngay ?? null });` trước lời gọi `bao(…)`.

- [ ] **Step 4: Chạy, xác nhận PASS.** Lệnh: `node test-dv-cong-cu.mjs`. Kỳ vọng: không có test fail.

- [ ] **Step 5: Chạy `npm test`** (gồm test đầu cuối, phải xanh), rồi commit:

```bash
git add dichvu/cong-cu.mjs test-dv-cong-cu.mjs test-dv-dau-cuoi.mjs
git commit -m "feat(np-dichvu): ✅ hiện ngày đã ghi + dòng 📎 (chưa có chứng từ / thêm chứng từ), theo dõi chứng từ khi ghi; sua_khoan nhận ngay"
```

---

### Task 5: Nối vào dịch vụ — vòng bảo trì quét + nhắc, `--kiem-tra`, cấu hình, test đầu cuối

**Files:**
- Modify: `dichvu/chinh.mjs`, `config.json`, `test-dv-chinh.mjs`, `test-dv-dau-cuoi.mjs`

**Interfaces:**
- Consumes:
  - `taoChungTu` (Task 3);
  - `taoCongCu({ …, chungTu })` (Task 4);
  - `taoCoreThat({ …, thuMucRong })` (Task 2);
  - `thuMucCoFile`, `getDrive` (Task 1).
- Produces:
  - `MAC_DINH_DICH_VU.gioNhacChungTu = "20:00"`;
  - `taoDichVu({ …, coFile? })` trả thêm `chungTu`;
  - `tomTat` có thêm khoá `chung_tu_thieu`.

- [ ] **Step 1: Sửa test (thất bại).**
  - `test-dv-chinh.mjs`, test `--kiem-tra`: thêm `"chung_tu_thieu"` vào cuối mảng khoá kỳ vọng.
  - `test-dv-dau-cuoi.mjs`, hàm `dung`:
    - đổi khai báo thành `async function dung({ now = Date.now, cham = 0, coFile = async () => false } = {}) {`;
    - truyền `coFile` vào `taoDichVu({ …, coFile, … })`;
    - đổi `drive: { luuAnh: async () => "https://drive/x" }` thành `drive: { luuAnh: async () => "https://drive.google.com/drive/folders/F1" }`.
  - Trong cùng file, test [7]/[10]/[11]: `assert.equal(t.so[0].rows[0][9], "https://drive/x")` → `…, "https://drive.google.com/drive/folders/F1")`.
  - Thêm test cuối file:

```js
// Spec 2026-10-08-np-chung-tu: khoản không ảnh vẫn ghi → ✅ kèm link → 20:00 nhắc → tải file lên → quét sửa sổ → hôm sau im.
test("[chứng từ] khoản KHÔNG ảnh → ✅ 'Chưa có chứng từ, tải vào' + link → 20:00 nhắc → có file → sổ 'đã bổ sung', hôm sau không nhắc", async () => {
  let gio = Date.parse("2026-10-10T19:50:00+07:00"), coFile = false
  const t = await dung({ now: () => gio, coFile: async () => coFile }); try {
    t.kichBan([{ loai: "goi", goi: [{ ten: "ghi_khoan", doi: { message_id: "$TIN", loai: "chi", so_tien: 50000, noi_dung: "Taxi", hoa_don: "Không", nguon_quy: "GWT - Tiền mặt" } }] }])
    t.zalo.vao.push(chu("@Bot GWT CP Chi - 50k - Taxi - Tiền mặt"))
    await cho(() => t.zalo.gui.some((g) => g.text.startsWith("✅ #1")))
    assert.match(t.zalo.gui.find((g) => g.text.startsWith("✅")).text,
      /^✅ #1 Quỳnh Mai · \d{2}\/\d{2} · CHI 50\.000đ[^\n]*\n📎 Chưa có chứng từ, tải vào: https:\/\/drive\.google\.com\/drive\/folders\/F1$/)
    gio = Date.parse("2026-10-10T20:05:00+07:00")
    await t.dv.chungTu.quet(); assert.equal(t.dv.chungTu.nhacToi(), 1)
    await cho(() => t.zalo.gui.some((g) => g.text.startsWith("📎 Còn thiếu chứng từ (1):\n#1 Quỳnh Mai 50.000đ")))
    coFile = true; assert.equal(await t.dv.chungTu.quet(), 1)
    assert.match(t.sua.at(-1).f.ghiChuThem, /^đã bổ sung chứng từ 10\/10$/)
    gio = Date.parse("2026-10-11T20:05:00+07:00"); await t.dv.chungTu.quet(); assert.equal(t.dv.chungTu.nhacToi(), 0)
  } finally { await t.dv.dung() }
})
```

- [ ] **Step 2: Chạy, xác nhận FAIL.** Lệnh: `node test-dv-chinh.mjs; node test-dv-dau-cuoi.mjs`. Kỳ vọng: test `--kiem-tra` thiếu khoá `chung_tu_thieu`; test đầu cuối mới fail vì `t.dv.chungTu` undefined.

- [ ] **Step 3: Sửa `dichvu/chinh.mjs`.**
  - Import: thêm `import { taoChungTu } from "./chung-tu.mjs";` sau dòng import `taoHangDoi`.
  - `MAC_DINH_DICH_VU`: thêm `gioNhacChungTu: "20:00"`:

```js
export const MAC_DINH_DICH_VU = { cong: 8790, model: "claude-sonnet-5-5", maxTurns: 12, thoiGianToiDaGiay: 240, gioNhacChungTu: "20:00" };
```

  - `tomTat`: thêm vào object trả về, sau `canh_bao_gan_day`:

```js
    chung_tu_thieu: db.prepare("SELECT COUNT(*) AS n FROM chung_tu WHERE co_file=0").get().n,
```

  - Khai báo `taoDichVu`: thêm tham số `coFile` và đổi mặc định `taoCore`:

```js
export async function taoDichVu({ cfgTat, biMat, thuMuc, api, loiDan, chuongTrinhClaude = "claude", taiFn = fetch, now = Date.now,
  // Drive nạp lười (googleapis nặng; test truyền coFile giả). Dịch vụ Zalo: khoản không ảnh vẫn có thư mục (thuMucRong).
  coFile = async (id) => { const d = await import("../drive.mjs"); return d.thuMucCoFile(d.getDrive(), id) },
  taoCore = (cfg, nguonTin) => taoCoreThat({ cfg, nguonTin, thuMucRong: true }) }) {
```

  - Sau dòng `canhBao = taoCanhBao(…)`, thêm:

```js
  const chungTu = taoChungTu({ db, hopThu, core, coFile, nhom: cfg.channels, gioNhac: cfg.dichvu.gioNhacChungTu, now, nhatKy });
```

  - Đổi lời gọi `taoCongCu` thành `taoCongCu({ core, kho, hopThu, canhBao, chungTu, nhatKy })`.
  - Vòng bảo trì: thay

```js
      vong.push(lap("bao_tri", async () => { baoTri.saoLuu(); baoTri.donCu(); canhBao.kiemDinhKy({ tokenNgayTao: biMat.CLAUDE_TOKEN_NGAY_TAO }); return false }, 600_000));
```

    bằng

```js
      // Bảo trì 10 phút/lần: sao lưu, dọn, cảnh báo, quét chứng từ bổ sung, rồi nhắc tối (lượt đầu từ giờ nhắc trở đi).
      vong.push(lap("bao_tri", async () => {
        baoTri.saoLuu(); baoTri.donCu(); canhBao.kiemDinhKy({ tokenNgayTao: biMat.CLAUDE_TOKEN_NGAY_TAO });
        await chungTu.quet(); chungTu.nhacToi();
        return false;
      }, 600_000));
```

  - Đổi object trả về của `taoDichVu` từ `db, kho,` thành `db, kho, chungTu,`.

- [ ] **Step 4: Sửa `config.json` tại chỗ.** Dòng `"dichvu": { … }` thành:

```json
  "dichvu": { "cong": 8790, "model": "claude-sonnet-5-5", "maxTurns": 12, "thoiGianToiDaGiay": 240, "gioNhacChungTu": "20:00" }
```

- [ ] **Step 5: Chạy, xác nhận PASS.** Lệnh: `node test-dv-chinh.mjs && node test-dv-dau-cuoi.mjs`. Kỳ vọng: không có test fail; các test đầu cuối cũ vẫn xanh.

- [ ] **Step 6: Chạy `npm test`, rồi commit**

```bash
git add dichvu/chinh.mjs config.json test-dv-chinh.mjs test-dv-dau-cuoi.mjs
git commit -m "feat(np-dichvu): nối chứng từ vào dịch vụ — bảo trì quét Drive + nhắc 20:00, khoản không ảnh vẫn có thư mục (thuMucRong), --kiem-tra chung_tu_thieu; test đầu cuối"
```

---

### Task 6: Lời dặn bot, tin mẫu ghim, hướng dẫn — ảnh không bắt buộc, khuôn có ngày, sửa ngày

**Files:**
- Modify: `dichvu/loi-dan.md`, `dichvu/chinh.mjs` (`tinMau`), `HUONG-DAN-ZALO.md`, `test-cauhinh.mjs`, `test-dv-chinh.mjs`

- [ ] **Step 1: Sửa test (thất bại).**
  - `test-cauhinh.mjs`: trong test `np-dichvu: …`, thêm sau dòng kiểm `"Zalo không chuyển album", "link trong tin ✅"`:

```js
  // Spec 2026-10-08-np-chung-tu: ảnh không còn là điều kiện ghi; khuôn có ngày; không còn "không có bill thì báo".
  for (const x of ["KHÔNG phải điều kiện để ghi", "Thu/Chi - Số tiền - Nội dung - Tên quỹ - Ngày", "sửa #N ngày"]) assert.ok(l.includes(x), x);
  assert.doesNotMatch(l, /không có bill thì báo/);
  for (const x of ["Thu/Chi - Số tiền - Nội dung - Tên quỹ - Ngày", "20:00", "sửa #5 ngày"]) assert.ok(doc("./HUONG-DAN-ZALO.md").includes(x), x);
```

  - `test-dv-chinh.mjs`, test `tinMau: …`: thay assert `m.text` và assert `text_styles` bằng:

```js
  assert.equal(m.text, "📌 Báo chi phí: tag @Bot GWT CP, kèm 1 ảnh bill nếu có\nThu/Chi - Số tiền - Nội dung - Tên quỹ - Ngày\n"
    + "VD: Chi - 50k - Nước khách - Tiền mặt - 7/10\nQuỹ: TK Công ty · Tiền mặt · Thuỷ\n"
    + "Ngày bỏ trống = hôm nay. Chưa có ảnh vẫn gửi được: ✅ kèm link để tải chứng từ, 20:00 bot nhắc khoản còn thiếu.")
  assert.deepEqual(m.text_styles.map((s) => [m.text.slice(s.start, s.start + s.len), s.st]),
    [["Thu/Chi - Số tiền - Nội dung - Tên quỹ - Ngày", ["i", "f_13"]], ["VD: Chi - 50k - Nước khách - Tiền mặt - 7/10", ["i", "f_13"]]])
```

- [ ] **Step 2: Chạy, xác nhận FAIL.** Lệnh: `node test-cauhinh.mjs; node test-dv-chinh.mjs`. Kỳ vọng: test np-dichvu và test `tinMau` fail.

- [ ] **Step 3: Sửa `dichvu/chinh.mjs` `tinMau`.** Thay thân hàm bằng:

```js
  const mau = ["Thu/Chi - Số tiền - Nội dung - Tên quỹ - Ngày", "VD: Chi - 50k - Nước khách - Tiền mặt - 7/10"];
  const quy = (cfg.quy || []).map((q) => q.ten.replace(/^GWT - /, "")).join(" · ");
  const text = [`📌 Báo chi phí: tag @${cfg.zalo?.tenBot || "Bot"}, kèm 1 ảnh bill nếu có`, ...mau, ...(quy ? [`Quỹ: ${quy}`] : []),
    "Ngày bỏ trống = hôm nay. Chưa có ảnh vẫn gửi được: ✅ kèm link để tải chứng từ, 20:00 bot nhắc khoản còn thiếu."].join("\n");
  return { text, text_styles: mau.map((d) => ({ start: text.indexOf(d), len: d.length, st: ["i", "f_13"] })) }; // chỉ số JS = UTF-16 như Zalo
```

- [ ] **Step 4: Sửa `dichvu/loi-dan.md`.** Lần lượt thay (mỗi đoạn cũ xuất hiện đúng một lần):

1. Đoạn

```
Khuôn ghim trong nhóm: "Thu/Chi - Số tiền - Nội dung - Tên quỹ". Người gửi viết khác khuôn vẫn đọc hiểu; chỉ hỏi khi THIẾU ý.
```

   thành

```
Khuôn ghim trong nhóm: "Thu/Chi - Số tiền - Nội dung - Tên quỹ - Ngày" (ngày không bắt buộc). Người gửi viết khác khuôn vẫn
đọc hiểu; chỉ hỏi khi THIẾU ý.
```

2. Đoạn `3. Có **ảnh** bill trong chính tin đó.` thành

```
3. **Chứng từ** KHÔNG phải điều kiện để ghi. Có ảnh thì dịch vụ tự tải lên; không có thì dịch vụ tạo thư mục, ✅ kèm link để
   người gửi tải chứng từ, 20:00 bot nhắc khoản còn thiếu. Bạn KHÔNG hỏi ảnh.
```

3. Đoạn

```
   - Khoản #M đã ghi và người gửi yêu cầu sửa ("sửa #M …") → `sua_khoan(message_id = khoản #M, yeu_cau_message_id = TIN MỚI, …)`.
```

   thành

```
   - Khoản #M đã ghi và người gửi yêu cầu sửa ("sửa #M …", "sửa #N ngày 6/10") → `sua_khoan(message_id = khoản #M,
     yeu_cau_message_id = TIN MỚI, …)`; đổi ngày → `ngay` (dd/mm/yyyy).
```

4. Đoạn

```
2. **Tin mới là một khoản** → đọc tin (và ảnh nếu cần), tự chốt `loai`, `so_tien`, `hoa_don`, `nguon_quy`, `ngay` (ngày chi
   ghi trong tin, dd/mm/yyyy), `noi_dung`:
   - **Đủ rõ 5 ý → `ghi_khoan` LUÔN**, không hỏi. Dịch vụ tự báo ✅ trong nhóm — bạn KHÔNG trả lời thêm.
```

   thành

```
2. **Tin mới là một khoản** → đọc tin (và ảnh nếu có), tự chốt `loai`, `so_tien`, `hoa_don`, `nguon_quy`, `noi_dung`, `ngay`
   (ngày thu/chi ghi trong tin, dd/mm/yyyy, thiếu năm = năm nay; tin KHÔNG ghi ngày → bỏ trống, dịch vụ lấy ngày gửi tin):
   - **Rõ thu/chi, số tiền, nội dung, quỹ → `ghi_khoan` LUÔN**, kể cả không có ảnh, không hỏi. Dịch vụ tự báo ✅ (kèm link
     chứng từ) trong nhóm — bạn KHÔNG trả lời thêm.
```

5. Đoạn (hai luật ảnh / album)

```
   - Ảnh "không có" hoặc "tải hỏng" mà là khoản → "#N chưa nhận được ảnh (gửi album thì Zalo không chuyển ảnh cho bot). Gửi 1 ảnh,
     chú thích: @Bot GWT CP #N (không có bill thì báo nhé)"
   - Tin nhắc nhiều ảnh / album mà không có ảnh → "#N: Zalo không chuyển album cho bot. Gửi 1 ảnh, chú thích: @Bot GWT CP #N;
     ảnh còn lại thêm qua link trong tin ✅."
   - Khoản ĐÃ ghi mà người gửi gửi thêm ảnh có #N → "#N đã ghi, ảnh thêm bỏ vào link trong tin ✅ #N nhé." (không ghi lại).
```

   thành

```
   - Tin nói gửi album / nhiều ảnh mà không có ảnh → vẫn ghi như thường (Zalo không chuyển album cho bot; chứng từ người gửi tải
     qua link trong tin ✅).
   - Ảnh chú thích mở đầu @Bot GWT CP #N là chứng từ của khoản #N: chưa ghi → ghi với `xac_nhan_message_id`; đã ghi → "#N đã
     ghi, ảnh thêm bỏ vào link trong tin ✅ #N nhé." (không ghi lại).
```

- [ ] **Step 5: Sửa `HUONG-DAN-ZALO.md`.** Lần lượt thay:

1. `**Mỗi khoản = 1 ảnh bill, gõ nội dung vào phần CHÚ THÍCH của ảnh, mở đầu bằng @Bot GWT CP:**` thành `**Mỗi khoản = 1 tin mở đầu bằng @Bot GWT CP; có ảnh bill thì gửi 1 ảnh, gõ nội dung vào CHÚ THÍCH ảnh:**`.
2. Ba dòng khuôn / ví dụ thành:

```
    Khuôn:      @Bot GWT CP Thu/Chi - Số tiền - Nội dung - Tên quỹ - Ngày   (ngày bỏ trống = hôm nay)
    [ảnh bill]  @Bot GWT CP Chi - 180k - 10 chai nước khách bóng bàn - Cá nhân ứng - 7/10
    [không ảnh] @Bot GWT CP Thu - 2tr - Hoàn cọc - TK Công ty
```

3. Gạch đầu dòng `- **Một khoản nhiều ảnh** … (Zalo không chuyển album cho bot).` (2 dòng) thành:

```
- **Chứng từ:** bot ghi xong trả lời ✅ kèm **link thư mục chứng từ** của khoản. Chưa có ảnh, hoặc nhiều ảnh (vé + hoá đơn…),
  thì tải vào link đó. **Khoản nào cũng phải có chứng từ**: 20:00 bot nhắc trong nhóm các khoản còn thiếu. Gửi album thì bot
  không nhận được ảnh (Zalo không chuyển album cho bot).
```

4. Xoá dòng `- **Bot nhắc gửi lại ảnh** cho khoản #5 → gửi 1 ảnh, chú thích **bắt đầu** bằng "@Bot GWT CP #5".`
5. `- **Sửa** khoản đã ✅: "@Bot GWT CP sửa #5 thành 150k" (chỉ người gửi khoản đó).` thành `- **Sửa** khoản đã ✅: "@Bot GWT CP sửa #5 thành 150k", "@Bot GWT CP sửa #5 ngày 6/10" (chỉ người gửi khoản đó).`

- [ ] **Step 6: Chạy, xác nhận PASS.** Lệnh: `node test-cauhinh.mjs && node test-dv-chinh.mjs`. Kỳ vọng: không có test fail.

- [ ] **Step 7: Chạy `npm test`, rồi commit**

```bash
git add dichvu/loi-dan.md dichvu/chinh.mjs HUONG-DAN-ZALO.md test-cauhinh.mjs test-dv-chinh.mjs
git commit -m "feat(np-dichvu): lời dặn + tin mẫu + hướng dẫn — ảnh không còn bắt buộc khi ghi, khuôn có Ngày, sửa ngày, nhắc chứng từ 20:00"
```

---

### Task 7: Lên máy (Mac mini, cùng chủ dự án)

Không có code. Bước nào lệch kỳ vọng thì DỪNG, báo lại.

- [ ] **Step 1 (MacBook): Push.** Lệnh: `git push` (nhánh `zalo`, chủ dự án đã cho push nhánh này trong đợt go-live).
- [ ] **Step 2 (Mac mini): Kéo code, chạy test, khởi động lại, gửi lại tin mẫu.** Lệnh:
  `cd ~/Bots/NP-Bot-Chi-Phi && git pull && npm test && launchctl kickstart -k gui/$(id -u)/com.gwt.np.dichvu && node dichvu/chinh.mjs --gui-mau zgr-ed6cf9b895d77c8925c6`.
  Kỳ vọng: `npm test` xanh; trong nhóm đoàn có tin mẫu mới → ghim lại.
- [ ] **Step 3 (nhóm thử): Thử ba tình huống.**
  - (a) khoản không ảnh `@Bot GWT CP Chi - 20k - Gửi xe - Tiền mặt` → ✅ có ngày + "📎 Chưa có chứng từ, tải vào: …"; mở link thấy thư mục khoản.
  - (b) khoản có 1 ảnh → ✅ + "📎 Thêm chứng từ: …"; ảnh đã nằm trong thư mục.
  - (c) `@Bot GWT CP sửa #… ngày 6/10` → ✏️, cột Ngày trên sổ đổi đúng (dạng ngày, không phải chữ).
- [ ] **Step 4: Kiểm quét + nhắc.**
  - Tải một ảnh vào thư mục khoản (a), chờ ≤ 10 phút → ghi chú sổ thành "đã bổ sung chứng từ dd/mm".
  - Chạy `node ~/Bots/NP-Bot-Chi-Phi/dichvu/chinh.mjs --kiem-tra` → `chung_tu_thieu` giảm.
  - Sau 20:00: nhóm có khoản thiếu nhận đúng một tin "📎 Còn thiếu chứng từ (n): …".
