// Test tầng ghi sổ NP (offline, không mạng) — chạy: node test-books.mjs (exit 0 = đạt).
import assert from "node:assert/strict";
import { buildFundRow, localizeRows, laLocaleVi, viTriMaTin, yeuCauTheoForm, capNhatDong, timDongTheoMaTin, ghiTabTheoMau, doRongForm, ghiTongLoc, taoTabLoc, timKhapSheet, commit, sapXepTheoNgay } from "./books.mjs";

let n = 0;
const t = (ten, fn) => { fn(); n++; console.log("  ✓ " + ten); };

t("dòng chi có hoá đơn đỏ: 12 cột A–L (Nguồn quỹ F, Mã tin L), Chi có số, Thu trống", () => {
  const r = buildFundRow({ loai: "chi", ngay: "2026-10-05", dienGiai: "Mua vật tư mẫu", nguoi: "Lan", hoaDon: "Có", nguonQuy: "Quỹ công ty", amount: 1250000, link: "https://drive/x", ghiChu: "dự án X", maTin: "1500" });
  assert.equal(r.length, 15);
  assert.deepEqual([r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[9], r[10], r[11]],
    ["=ROW()-1", "05/10/2026", "Mua vật tư mẫu", "Lan", "Có", "Quỹ công ty", "", 1250000, "https://drive/x", "dự án X", "'1500"]);
});
t("dòng chi không khai hoá đơn → mặc định Không", () => {
  const r = buildFundRow({ loai: "chi", ngay: "2026-10-05", dienGiai: "Ship", amount: 45000 });
  assert.equal(r[4], "Không");
});
t("dòng thu: Hoá đơn '—', Thu có số, Chi trống", () => {
  const r = buildFundRow({ loai: "thu", ngay: "2026-10-05", dienGiai: "Hoàn cọc", amount: 2000000, hoaDon: "Có" });
  assert.equal(r[4], "—"); assert.equal(r[6], 2000000); assert.equal(r[7], "");
});
t("cột Tồn (I) = Σthu(G) − Σchi(H), dấu ngăn theo locale vi (;)", () => {
  const [row] = localizeRows([buildFundRow({ loai: "chi", ngay: "2026-10-05", dienGiai: "x", amount: 1 })], ";");
  assert.equal(row[8], "=SUM($G$2:INDEX($G:$G;ROW()))-SUM($H$2:INDEX($H:$H;ROW()))");
});
t("viTriMaTin: tìm dòng theo msgId ở cột L (không theo số dòng), bỏ dòng tiêu đề", () => {
  assert.equal(viTriMaTin([["Mã tin"], ["111"], [], ["222"]], "222"), 4);
  assert.equal(viTriMaTin([["Mã tin"], ["111"]], "999"), null);
});
t("[review M2] chữ do người gõ bắt đầu bằng = + - @ không thành công thức (USER_ENTERED)", () => {
  const r = buildFundRow({ loai: "chi", ngay: "2026-10-05", dienGiai: "=IMPORTXML(\"http://x\")", nguoi: "+84 Lan", amount: 1, ghiChu: "@all" });
  assert.equal(r[2], "'=IMPORTXML(\"http://x\")"); assert.equal(r[3], "'+84 Lan"); assert.equal(r[10], "'@all");
  assert.equal(r[0], "=ROW()-1"); // công thức CỦA BOT giữ nguyên
});
t("laLocaleVi: chỉ nhận vi", () => {
  assert.equal(laLocaleVi("vi_VN"), true);
  assert.equal(laLocaleVi("vi"), true);
  assert.equal(laLocaleVi("en_US"), false);
  assert.equal(laLocaleVi(""), false);
  assert.equal(laLocaleVi(undefined), false);
});
// Cá nhân ứng chờ hoàn (chủ dự án 2026-10-06): M Đã hoàn ứng · N Ngày hoàn · O URL chứng từ (ẩn — tab quỹ dựng lại link
// bấm được từ đây, vì công thức đọc chip Drive chỉ ra chữ).
t("dòng Cá nhân ứng: M = 'Chưa', N trống; quỹ khác: M trống", () => {
  const r = buildFundRow({ loai: "chi", ngay: "2026-06-03", dienGiai: "Đặt cọc thành lập công ty", nguonQuy: "Cá nhân ứng", hoaDon: "Chờ xuất", amount: 1000000, link: "https://drive.google.com/drive/folders/x" });
  assert.equal(r[4], "Chờ xuất"); assert.equal(r[12], "Chưa"); assert.equal(r[13], ""); assert.equal(r[14], "https://drive.google.com/drive/folders/x");
  assert.equal(buildFundRow({ loai: "chi", ngay: "2026-06-03", dienGiai: "x", nguonQuy: "Thuỷ", amount: 1 })[12], "");
});
t("dòng thu: Đã hoàn ứng để trống kể cả quỹ Cá nhân ứng (thu không có vòng hoàn)", () => {
  assert.equal(buildFundRow({ loai: "thu", ngay: "2026-06-03", dienGiai: "x", nguonQuy: "Cá nhân ứng", amount: 1 })[12], "");
});

// Form sổ do NGƯỜI chỉnh trên Sheet (chủ dự án 2026-10-06): dòng mới chép định dạng dòng ngay trên + link chứng từ là chip Drive.
t("yeuCauTheoForm: dòng 3 → chép định dạng dòng 2 (A:L), cột J thành chip Drive", () => {
  const r = yeuCauTheoForm({ gid: 7, dong: 3, link: "https://drive.google.com/drive/folders/abc" });
  assert.deepEqual(r[0].copyPaste, { source: { sheetId: 7, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 15 },
    destination: { sheetId: 7, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 15 }, pasteType: "PASTE_FORMAT" });
  const o = r[1].updateCells;
  assert.deepEqual(o.range, { sheetId: 7, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 9, endColumnIndex: 10 });
  assert.equal(o.rows[0].values[0].userEnteredValue.stringValue, "@");
  assert.equal(o.rows[0].values[0].chipRuns[0].chip.richLinkProperties.uri, "https://drive.google.com/drive/folders/abc");
});
t("yeuCauTheoForm: dòng dữ liệu đầu tiên (2) không có dòng mẫu → không chép nhưng vẫn chip; link không phải Drive → giữ chữ", () => {
  assert.deepEqual(yeuCauTheoForm({ gid: 7, dong: 2, link: "https://drive.google.com/drive/folders/a" }).map((x) => Object.keys(x)[0]), ["updateCells"]);
  assert.deepEqual(yeuCauTheoForm({ gid: 7, dong: 2, link: "https://example.com/x" }), []);
  assert.deepEqual(yeuCauTheoForm({ gid: 7, dong: 5, link: "" }).map((x) => Object.keys(x)[0]), ["copyPaste"]);
});

// Dịch vụ Zalo 2026-10-08: sửa ngày khoản (USER_ENTERED như lúc commit) + bỏ "không có ảnh chứng từ" khi đã bổ sung.
const ta = async (ten, fn) => { await fn(); n++; console.log("  ✓ " + ten); };
function sheetsGia(ghiChu) {
  const goi = [];
  return { goi, sheets: { spreadsheets: { values: {
    get: async () => ({ data: { values: [[ghiChu]] } }),
    batchUpdate: async (x) => { goi.push(["batch", x]); }, update: async (x) => { goi.push(["update", x]); } } } } };
}
await ta("capNhatDong: boGhiChu bỏ cụm ghi chú rồi nối ghiChuThem; ngay ghi cột B USER_ENTERED dd/mm/yyyy", async () => {
  const s = sheetsGia("không có ảnh chứng từ (đã xác nhận); đã xác nhận: Zalo #2 (tin 1)");
  await capNhatDong("S", "Đoàn", 7, { boGhiChu: "không có ảnh chứng từ", ghiChuThem: "đã bổ sung chứng từ 08/10" }, { sheets: s.sheets });
  assert.deepEqual(s.goi[0][1].requestBody.data, [{ range: "'Đoàn'!K7", values: [["đã xác nhận: Zalo #2 (tin 1); đã bổ sung chứng từ 08/10"]] }]);
  const g = sheetsGia("");
  const r = await capNhatDong("S", "Đoàn", 7, { ngay: "6/10/2026" }, { sheets: g.sheets });
  assert.deepEqual(g.goi.map((x) => x[0]), ["update"]); assert.equal(r.updated, true);
  assert.deepEqual([g.goi[0][1].range, g.goi[0][1].valueInputOption, g.goi[0][1].requestBody.values], ["'Đoàn'!B7", "USER_ENTERED", [["06/10/2026"]]]);
});
await ta("[Review Focus] capNhatDong không truyền tuỳ chọn mới → nối ghi chú y như cũ (bot Discord)", async () => {
  const s = sheetsGia("không có ảnh chứng từ");
  await capNhatDong("S", "Chi phí chung", 3, { ghiChuThem: "sửa theo X" }, { sheets: s.sheets });
  assert.deepEqual(s.goi[0][1].requestBody.data, [{ range: "'Chi phí chung'!K3", values: [["không có ảnh chứng từ; sửa theo X"]] }]);
  assert.deepEqual(await capNhatDong("S", "T", 3, {}, { sheets: sheetsGia("").sheets }), { updated: false });
});

// Đối soát 2026-10-20: mã tin Zalo 16 chữ số bị Sheets (USER_ENTERED) đổi thành SỐ, hiện "1,79144E+15" → tìm dòng theo chữ
// hiển thị không bao giờ khớp (sửa khoản / bổ sung chứng từ hỏng). Đọc giá trị gốc; ghi mã tin dạng chữ (dấu ' đầu).
await ta("timDongTheoMaTin đọc giá trị GỐC: ô mã tin đã thành số vẫn tìm ra dòng", async () => {
  let req;
  const sheets = { spreadsheets: { values: { get: async (x) => { req = x; return { data: { values: [["Mã tin"], ["1556858628550692914"], [1791432704193000]] } }; } } } };
  assert.equal(await timDongTheoMaTin("S", "Đoàn", "1791432704193000", { sheets }), 3);
  assert.equal(req.valueRenderOption, "UNFORMATTED_VALUE");
});

// Tab đối soát theo FORM tab kênh (chủ dự án 2026-10-20): chưa có → nhân bản tab mẫu (giữ định dạng, cột ẩn, dropdown); xoá dữ
// liệu cũ từ dòng 2; ghi USER_ENTERED (công thức STT/Tồn chạy, dấu ngăn theo locale); tiêu đề cột thêm ở dòng 1 sau cột của mẫu.
await ta("ghiTabTheoMau: nhân bản tab mẫu khi chưa có; xoá từ dòng 2; ghi USER_ENTERED đã đổi dấu ngăn; tiêu đề cột thêm; tab mẫu không có → lỗi", async () => {
  const goi = [];
  const gia = (coSan) => ({ spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { sheetId: 7, title: "Đoàn" } }, ...(coSan ? [{ properties: { sheetId: 9, title: "Đối soát Zalo" } }] : [])] } }),
    batchUpdate: async (x) => { goi.push(["nhan_ban", x.requestBody.requests[0].duplicateSheet]); },
    values: { clear: async (x) => { goi.push(["xoa", x.range]); }, update: async (x) => { goi.push(["ghi", x.range, x.valueInputOption, x.requestBody.values]); } } } });
  const hang = [["=ROW()-1", "=SUM(A\u001FB)", "x", 5]];
  assert.equal(await ghiTabTheoMau("S", { mau: "Đoàn", title: "Đối soát Zalo", rows: hang, tieuDeThem: ["Zalo #", "Tình trạng"], cotThemTu: 15 }, { sheets: gia(false), sep: ";" }), 1);
  assert.deepEqual(goi, [
    ["nhan_ban", { sourceSheetId: 7, newSheetName: "Đối soát Zalo", insertSheetIndex: 1 }],
    ["xoa", "'Đối soát Zalo'!A2:Z"],
    ["ghi", "'Đối soát Zalo'!A2", "USER_ENTERED", [["=ROW()-1", "=SUM(A;B)", "x", 5]]],
    ["ghi", "'Đối soát Zalo'!P1", "RAW", [["Zalo #", "Tình trạng"]]],
  ]);
  goi.length = 0;
  await ghiTabTheoMau("S", { mau: "Đoàn", title: "Đối soát Zalo", rows: hang }, { sheets: gia(true), sep: ";" });
  assert.deepEqual(goi.map((g) => g[0]), ["xoa", "ghi"]);
  await assert.rejects(ghiTabTheoMau("S", { mau: "Không có", title: "Mới", rows: [] }, { sheets: gia(false), sep: ";" }), /tab mẫu "Không có"/);
});

// Chủ dự án 2026-10-21: tổng chi theo LỌC (SUBTOTAL) + 4 tab "sống" (HCM, HCM - Shopee/GWT/Other) ăn theo tab sổ bằng FILTER.
await ta("doRongForm: độ rộng form = tiêu đề liền nhau từ A (ô tổng ở dòng 1 cách một ô trống không tính)", async () => {
  const tieuDe = [...Array.from({ length: 19 }, (_, i) => `c${i}`), "", "Tổng chi (theo lọc):", 5];
  const sheets = { spreadsheets: { values: { get: async (x) => { assert.equal(x.range, "'Đoàn'!1:1"); return { data: { values: [tieuDe] } } } } } };
  assert.equal(await doRongForm("S", "Đoàn", { sheets }), 19);
  assert.equal(await doRongForm("S", "Đoàn", { sheets: { spreadsheets: { values: { get: async () => ({ data: { values: [["a", "b"]] } }) } } } }), 2);
});

await ta("ghiTongLoc: dòng 1, cách form một cột: SUBTOTAL(109) tổng chi + SUBTOTAL(102) số khoản, ô tổng định dạng #,##0", async () => {
  const goi = [];
  const sheets = { spreadsheets: { get: async () => ({ data: { sheets: [{ properties: { sheetId: 7, title: "Đoàn" } }] } }),
    batchUpdate: async (x) => { goi.push(x.requestBody.requests) },
    values: { update: async (x) => { goi.push(["ghi", x.range, x.valueInputOption, x.requestBody.values]) } } } };
  await ghiTongLoc("S", "Đoàn", { soCot: 19 }, { sheets, sep: ";" });
  assert.deepEqual(goi, [
    ["ghi", "'Đoàn'!U1", "USER_ENTERED", [["Tổng chi (theo lọc):", "=SUBTOTAL(109;H2:H)", "Số khoản:", "=SUBTOTAL(102;H2:H)"]]],
    [{ repeatCell: { range: { sheetId: 7, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 21, endColumnIndex: 22 },
      cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } } }, fields: "userEnteredFormat.numberFormat" } }],
  ]);
});

await ta("taoTabLoc: nhân bản tab sổ, xoá dữ liệu, A2 = FILTER chứa chữ (sống theo sổ), chép form dòng 2 xuống cả cột, hiện cột URL; đã có → không đụng", async () => {
  const goi = [];
  const gia = (coSan) => ({ spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { sheetId: 7, title: "Đoàn", gridProperties: { rowCount: 1000 } } }, ...(coSan ? [{ properties: { sheetId: 9, title: "HCM - GWT" } }] : [])] } }),
    batchUpdate: async (x) => { const r = x.requestBody.requests; goi.push(r); return { data: { replies: [r[0].duplicateSheet ? { duplicateSheet: { properties: { sheetId: 42 } } } : {}] } } },
    values: { clear: async (x) => { goi.push(["xoa", x.range]) }, update: async (x) => { goi.push(["ghi", x.range, x.valueInputOption, x.requestBody.values]) } } } });
  assert.equal(await taoTabLoc("S", { mau: "Đoàn", title: "HCM - GWT", loc: [{ cot: 17, chua: "HCM" }, { cot: 18, chua: "GWT" }], soCot: 19 }, { sheets: gia(false), sep: ";" }), true);
  assert.deepEqual(goi, [
    [{ duplicateSheet: { sourceSheetId: 7, newSheetName: "HCM - GWT", insertSheetIndex: 1 } }],
    ["xoa", "'HCM - GWT'!A2:Z"],
    [{ copyPaste: { source: { sheetId: 7, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 19 },
        destination: { sheetId: 42, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 19 }, pasteType: "PASTE_FORMAT" } },
      { updateDimensionProperties: { range: { sheetId: 42, dimension: "COLUMNS", startIndex: 14, endIndex: 15 }, properties: { hiddenByUser: false }, fields: "hiddenByUser" } },
      { setBasicFilter: { filter: { range: { sheetId: 42 } } } }],
    ["ghi", "'HCM - GWT'!A2", "USER_ENTERED", [[`=IFERROR(FILTER('Đoàn'!A2:S; ISNUMBER(SEARCH("HCM"; 'Đoàn'!R2:R)); ISNUMBER(SEARCH("GWT"; 'Đoàn'!S2:S))); "")`]]],
  ]);
  goi.length = 0;
  assert.equal(await taoTabLoc("S", { mau: "Đoàn", title: "HCM - GWT", loc: [], soCot: 19 }, { sheets: gia(true), sep: ";" }), false);
  assert.deepEqual(goi, []);
  await assert.rejects(taoTabLoc("S", { mau: "Không có", title: "Mới", loc: [], soCot: 19 }, { sheets: gia(false), sep: ";" }), /tab mẫu "Không có"/);
});

await ta("timKhapSheet: đọc mọi tab (UNFORMATTED), trả dòng có ô trùng mã tin / số tiền (so dạng chữ)", async () => {
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { title: "Đoàn" } }, { properties: { title: "_state" } }] } }),
    values: { batchGet: async (x) => { assert.deepEqual(x.ranges, ["'Đoàn'!A1:Z", "'_state'!A1:Z"]); assert.equal(x.valueRenderOption, "UNFORMATTED_VALUE");
      return { data: { valueRanges: [{ values: [["STT"], [1, "11/10/2026", "Xe", "", "", "", "", 44560800]] }, { values: [["Thời điểm"], ["2026-10-19T03:00:00Z", "", "", 1791900000000000]] }] } } } } } };
  assert.deepEqual(await timKhapSheet("S", ["1791900000000000", 44560800], { sheets }), [
    { tab: "Đoàn", dong: 2, hang: [1, "11/10/2026", "Xe", "", "", "", "", 44560800] },
    { tab: "_state", dong: 2, hang: ["2026-10-19T03:00:00Z", "", "", 1791900000000000] },
  ]);
});

// Sự cố 19/10/2026: values.append (OVERWRITE) dò "cuối bảng" lệch khi giữa sổ có dòng trống (#49 bị xoá trắng ở dòng 41) →
// #88, #89, #90, #91, #92 lần lượt ghi ĐÈ lên dòng 41, mất 4 khoản. Giờ: ghi vào dòng NGAY DƯỚI dòng cuối có dữ liệu (đọc B:O),
// bằng values.update đúng địa chỉ — không bao giờ lấp chỗ trống giữa sổ, không bao giờ đè dòng đang có.
await ta("commit: ghi dưới dòng CUỐI có dữ liệu (bỏ qua dòng trống giữa sổ), không dùng append dò bảng; chép form + _state như cũ", async () => {
  const goi = [], hang = Array.from({ length: 82 }, (_, i) => (i === 40 ? [] : ["x"])); // dòng 1..82, dòng 41 trống
  const sheets = { spreadsheets: {
    get: async () => ({ data: { sheets: [{ properties: { sheetId: 7, title: "Đoàn" } }] } }),
    batchUpdate: async (x) => { goi.push(["form", x.requestBody.requests.map((r) => Object.keys(r)[0] + ":" + (r.copyPaste?.destination.startRowIndex ?? r.updateCells?.range.startRowIndex))]) },
    values: {
      get: async (x) => { goi.push(["doc", x.range]); return { data: { values: hang } } },
      update: async (x) => { goi.push(["ghi", x.range, x.valueInputOption, x.requestBody.values.length]); return { data: { updatedRange: `'Đoàn'!A83:O84` } } },
      append: async (x) => { goi.push(["append", x.range]); return { data: {} } } } } };
  const r1 = buildFundRow({ ngay: "19/10/2026", dienGiai: "Thuê xe", amount: 44560800, link: "https://drive.google.com/drive/folders/a", maTin: "1792410654565000" });
  const kq = await commit({ sheetId: "S", tab: "Đoàn", rows: [r1, r1], msgIds: ["1792410654565000"] }, { sheets, sep: ";" });
  assert.deepEqual(kq.written, { "Đoàn": 2 });
  assert.deepEqual(goi, [
    ["doc", "'Đoàn'!B:O"],
    ["ghi", "'Đoàn'!A83", "USER_ENTERED", 2],
    ["form", ["copyPaste:82", "updateCells:82", "copyPaste:83", "updateCells:83"]],
    ["append", "_state!A:D"],
  ]);
});

await ta("sapXepTheoNgay: sắp cả dòng (mọi cột, từ dòng 2) theo cột B tăng dần — dòng trống / không ngày xuống cuối", async () => {
  const goi = [];
  const sheets = { spreadsheets: { get: async () => ({ data: { sheets: [{ properties: { sheetId: 7, title: "Đoàn" } }] } }),
    batchUpdate: async (x) => { goi.push(x.requestBody.requests) } } };
  await sapXepTheoNgay("S", "Đoàn", { sheets });
  assert.deepEqual(goi, [[{ sortRange: { range: { sheetId: 7, startRowIndex: 1 }, sortSpecs: [{ dimensionIndex: 1, sortOrder: "ASCENDING" }] } }]]);
  await assert.rejects(sapXepTheoNgay("S", "Khác", { sheets }), /không thấy tab "Khác"/);
});

console.log(`\n${n} test đạt`);
