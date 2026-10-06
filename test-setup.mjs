// Test kế hoạch dựng Sheet (offline) — chạy: node test-setup.mjs (exit 0 = đạt).
import assert from "node:assert/strict";
import { keHoachSo, keHoachTongHop, keHoachTabKenh, TAI_KHOAN } from "./setup.mjs";
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
  assert.deepEqual(so.header, ["STT", "Ngày", "Diễn giải", "Người", "Hoá đơn đỏ", "Nguồn quỹ", "Thu", "Chi", "Tồn", "Link chứng từ", "Ghi chú", "Mã tin"]);
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
console.log(`\n${n} test đạt`);
