// Test kế hoạch dựng Sheet (offline) — chạy: node test-setup.mjs (exit 0 = đạt).
import assert from "node:assert/strict";
import { keHoachSo, keHoachTongHop, keHoachTabKenh, keHoachTabQuy, kenhCoTab, kenhGopQuy, rongTheoForm, TAI_KHOAN } from "./setup.mjs";
import { buildFundRow } from "./books.mjs";

const k = keHoachSo({ quy: [{ ten: "Quỹ công ty", goiTat: ["qct"] }, { ten: "Tiền cá nhân ứng", goiTat: [] }] });
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
  assert.deepEqual(so.header, ["STT", "Ngày", "Diễn giải", "Người", "Hoá đơn đỏ", "Nguồn quỹ", "Thu", "Chi", "Tồn", "Link chứng từ", "Ghi chú", "Mã tin", "Đã hoàn ứng", "Ngày hoàn", "URL chứng từ"]);
});
t("_state cột D là msgId (loadProcessed đọc D2:D)", () => assert.equal(k.tabs.find((x) => x.title === "_state").header[3], "msgId (đừng sửa)"));
t("dropdown Nguồn quỹ (F) theo danh sách quỹ trong config; cột Mã tin (L) ẩn", () => {
  assert.deepEqual(k.dropdownQuy, ["Quỹ công ty", "Tiền cá nhân ứng"]);
  assert.equal(k.anCot, 11);
  assert.equal(k.dropdownChat, false, "dropdown không chặn cứng: thêm quỹ vào config trước khi sửa dropdown không được làm ghi sổ lỗi");
});
t("Tổng hợp: 3 bảng (tổng, theo HĐ đỏ, theo quỹ) dùng ';' và cột mới (Thu G, Chi H, HĐ E, Quỹ F)", () => {
  assert.match(k.tongHop.G2, /pivot E/); assert.match(k.tongHop.M2, /pivot F/);
  for (const f of [k.tongHop.G2, k.tongHop.M2]) {
    assert.match(f, /^=IFERROR\(QUERY\('Sổ chi phí'!B2:H; "/);
    assert.ok(!/QUERY\([^;]*,\s*"/.test(f), "không được dùng ',' làm dấu ngăn tham số");
  }
});
// Đo thật 2026-10-06: cột Thu trống hoàn toàn → QUERY coi là cột chữ, sum(G) ra #VALUE! và bảng "Theo tháng" luôn báo
// "Chưa có dữ liệu". Đọc Thu/Chi qua N() trong mảng thì cột luôn là số; số khoản chi = tổng cờ (Chi > 0).
t("Theo tháng: không sum thẳng cột Thu (trống là lỗi) — đọc qua N() trong mảng, ngăn cột '\\' của vi_VN", () => {
  const f = k.tongHop.A2;
  assert.ok(!/sum\(G\)/.test(f), "không sum(G) trên cột có thể trống");
  assert.match(f, /^=IFERROR\(QUERY\(\{'Sổ chi phí'!B2:B\\ARRAYFORMULA\(N\('Sổ chi phí'!G2:G\)\)\\/);
  assert.match(f, /sum\(Col2\), sum\(Col3\), sum\(Col4\)/);
  assert.match(f, /'Số khoản chi'/);
});
// Nhiều kênh (2026-10-06): 1 file, mỗi kênh 1 tab sổ + 1 tab tổng hợp riêng.
t("keHoachTongHop(tab): công thức trỏ đúng tab của kênh", () => {
  const th = keHoachTongHop("Đoàn hoạ sĩ TQ T10-2026");
  for (const o of ["G2", "M2"]) assert.match(th[o], /^=IFERROR\(QUERY\('Đoàn hoạ sĩ TQ T10-2026'!B2:H; "/);
  assert.match(th.A2, /^=IFERROR\(QUERY\(\{'Đoàn hoạ sĩ TQ T10-2026'!B2:B\\/);
  assert.deepEqual(Object.keys(th), ["A1", "A2", "G1", "G2", "M1", "M2"]);
});
t("keHoachTabKenh: file mới tạo (tab cũ trống) → đổi tên cho kênh đầu, thêm tab cho kênh sau; chạy lại không làm gì", () => {
  const kenh = { "1": { name: "chi-phi", tab: "Chi phí chung" }, "2": { name: "doan", tab: "Đoàn hoạ sĩ TQ T10-2026" } };
  const lan1 = keHoachTabKenh(["Sổ chi phí", "Tổng hợp", "_state", "_rep"], kenh, { tab: "Sổ chi phí" });
  assert.deepEqual(lan1, [
    { loai: "doi_ten", tu: "Sổ chi phí", sang: "Chi phí chung" },
    { loai: "doi_ten", tu: "Tổng hợp", sang: "Tổng hợp - Chi phí chung" },
    { loai: "them_so", tab: "Đoàn hoạ sĩ TQ T10-2026" },
    { loai: "them_th", tab: "Đoàn hoạ sĩ TQ T10-2026", th: "Tổng hợp - Đoàn hoạ sĩ TQ T10-2026" },
  ]);
  const lan2 = keHoachTabKenh(["Chi phí chung", "Tổng hợp - Chi phí chung", "Đoàn hoạ sĩ TQ T10-2026", "Tổng hợp - Đoàn hoạ sĩ TQ T10-2026", "_state", "_rep"], kenh, { tab: "Sổ chi phí" });
  assert.deepEqual(lan2, []);
});
t("keHoachTabKenh: kênh thiếu tab → lỗi rõ (không đoán tên tab)", () => {
  assert.throws(() => keHoachTabKenh([], { "1": { name: "x" } }, {}), /tab/);
});
// Tab quỹ tự tổng hợp + Cá nhân ứng chờ hoàn (chủ dự án 2026-10-06): công thức đọc MỌI tab kênh, bot chỉ ghi tab kênh.
const KQ = keHoachTabQuy({ channels: { "1": { tab: "Chi phí chung" }, "2": { tab: "Đoàn hoạ sĩ TQ T10-2026" } },
  quy: [{ ten: "GWT - TK Công ty" }, { ten: "Thuỷ" }, { ten: "Cá nhân ứng" }] });
t("keHoachTabQuy: 1 tab mỗi quỹ (trừ Cá nhân ứng) + tab Cá nhân ứng chờ hoàn + Tổng hợp quỹ", () => {
  assert.deepEqual(KQ.map((x) => x.title), ["Quỹ GWT - TK Công ty", "Quỹ Thuỷ", "Cá nhân ứng chờ hoàn", "Tổng hợp quỹ"]);
});
t("tab quỹ: gộp mọi tab kênh (VSTACK, ';' vi_VN), lọc đúng quỹ, xếp theo ngày; Thu/Chi qua N() (cột trống không vỡ)", () => {
  const f = KQ[0].o.B2;
  assert.match(f, /^=IFERROR\(QUERY\(VSTACK\(HSTACK\('Chi phí chung'!B2:B;/);
  assert.match(f, /HSTACK\('Đoàn hoạ sĩ TQ T10-2026'!B2:B;/);
  assert.match(f, /ARRAYFORMULA\(N\('Chi phí chung'!G2:G\)\)/);
  assert.match(f, /Col6 = 'GWT - TK Công ty' order by Col1/);
  assert.ok(!/QUERY\([^;]*,\s*"/.test(f), "không dùng ',' làm dấu ngăn tham số");
  assert.match(KQ[0].o.I2, /SCAN\(0;/);               // Tồn quỹ cộng dồn riêng quỹ này
  assert.match(KQ[0].o.J2, /HYPERLINK\(M2:M;L2:L\)/); // link chứng từ dựng lại từ URL ẩn
  assert.deepEqual(KQ[0].an, [11, 12]);
});
t("tab Cá nhân ứng: chỉ dòng Chi của nguồn Cá nhân ứng, 'Chưa' lên trước; bảng đang nợ theo người bỏ dòng Đã hoàn", () => {
  const k = KQ[2];
  assert.match(k.o.B2, /Col6 = 'Cá nhân ứng' and Col8 > 0 order by Col11, Col1/);
  assert.match(k.o.O2, /Col11 <> 'Đã hoàn' group by Col4/);
});
t("Tổng hợp quỹ: thu/chi/tồn theo quỹ + chi theo tháng × quỹ", () => {
  const k = KQ[3];
  assert.match(k.o.A2, /group by Col6/); assert.match(k.o.F2, /pivot Col6/);
});

// Form chung = form người chỉnh ở tab "Chi phí chung" (2026-10-06): mặc định 100px, Diễn giải 202, chứng từ 194, Ghi chú 202.
t("rongTheoForm: độ rộng theo TÊN cột như form tab kênh; tab quỹ dùng đúng bộ đó", () => {
  assert.deepEqual(rongTheoForm(["STT", "Diễn giải", "Link chứng từ", "Chứng từ", "Ghi chú", "Người"]), [100, 202, 194, 194, 202, 100]);
  const q = KQ[0];
  assert.equal(q.rong[q.header.indexOf("Diễn giải")], 202); assert.equal(q.rong[q.header.indexOf("Chứng từ")], 194);
  assert.equal(q.rong[q.header.indexOf("STT")], 100);
});

// Zalo (2026-10-07): nhóm Zalo có tab sổ như kênh; nhóm thử không gộp quỹ; Discord + Zalo chung tab → không trùng, không cộng 2 lần.
t("kenhCoTab / kenhGopQuy: nhóm Zalo có tab; nhóm thử (thu) không gộp quỹ; chung tab → không tạo trùng, không cộng 2 lần", () => {
  const cfg = { channels: { "1": { tab: "Chi phí chung" }, "2": { tab: "Đoàn hoạ sĩ TQ T10-2026" } },
    zalo: { groups: { gA: { tab: "Đoàn hoạ sĩ TQ T10-2026" }, gT: { tab: "Thử Zalo", thu: true } } } };
  assert.deepEqual(Object.keys(kenhCoTab(cfg)), ["1", "2", "gA", "gT"]);
  assert.deepEqual(Object.keys(kenhGopQuy(cfg)), ["1", "2", "gA"]);
  const f = keHoachTabQuy({ channels: kenhGopQuy(cfg), quy: [{ ten: "Thuỷ" }] })[0].o.B2;
  assert.equal((f.match(/HSTACK\('Đoàn hoạ sĩ TQ T10-2026'!B2:B;/g) || []).length, 1);
  assert.ok(!f.includes("Thử Zalo"));
  const ops = keHoachTabKenh(["Chi phí chung", "Tổng hợp - Chi phí chung", "_state"], kenhCoTab(cfg), {});
  assert.deepEqual(ops, [
    { loai: "them_so", tab: "Đoàn hoạ sĩ TQ T10-2026" }, { loai: "them_th", tab: "Đoàn hoạ sĩ TQ T10-2026", th: "Tổng hợp - Đoàn hoạ sĩ TQ T10-2026" },
    { loai: "them_so", tab: "Thử Zalo" }, { loai: "them_th", tab: "Thử Zalo", th: "Tổng hợp - Thử Zalo" },
  ]);
  assert.deepEqual(kenhCoTab({ channels: { "1": { tab: "A" } } }), { "1": { tab: "A" } }); // chưa có zalo → như cũ
});
console.log(`\n${n} test đạt`);
