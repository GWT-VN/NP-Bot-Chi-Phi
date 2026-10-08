// Test tầng ghi sổ NP (offline, không mạng) — chạy: node test-books.mjs (exit 0 = đạt).
import assert from "node:assert/strict";
import { buildFundRow, localizeRows, laLocaleVi, viTriMaTin, dongTuRange, yeuCauTheoForm, capNhatDong } from "./books.mjs";

let n = 0;
const t = (ten, fn) => { fn(); n++; console.log("  ✓ " + ten); };

t("dòng chi có hoá đơn đỏ: 12 cột A–L (Nguồn quỹ F, Mã tin L), Chi có số, Thu trống", () => {
  const r = buildFundRow({ loai: "chi", ngay: "2026-10-05", dienGiai: "Mua vật tư mẫu", nguoi: "Lan", hoaDon: "Có", nguonQuy: "Quỹ công ty", amount: 1250000, link: "https://drive/x", ghiChu: "dự án X", maTin: "1500" });
  assert.equal(r.length, 15);
  assert.deepEqual([r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[9], r[10], r[11]],
    ["=ROW()-1", "05/10/2026", "Mua vật tư mẫu", "Lan", "Có", "Quỹ công ty", "", 1250000, "https://drive/x", "dự án X", "1500"]);
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
t("dongTuRange: đọc số dòng từ updatedRange của values.append", () => {
  assert.deepEqual(dongTuRange("'Chi phí chung'!A3:L3"), { dau: 3, cuoi: 3 });
  assert.deepEqual(dongTuRange("'Đoàn hoạ sĩ TQ T10-2026'!A12:L13"), { dau: 12, cuoi: 13 });
  assert.equal(dongTuRange(""), null);
});
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

console.log(`\n${n} test đạt`);
