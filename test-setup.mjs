// Test kế hoạch dựng Sheet (offline) — chạy: node test-setup.mjs (exit 0 = đạt).
import assert from "node:assert/strict";
import { keHoachSo, TAI_KHOAN } from "./setup.mjs";
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
});
t("Tổng hợp: 3 bảng (tổng, theo HĐ đỏ, theo quỹ) dùng ';' và cột mới (Thu G, Chi H, HĐ E, Quỹ F)", () => {
  assert.match(k.tongHop.A2, /sum\(G\), sum\(H\), count\(H\)/);
  assert.match(k.tongHop.G2, /pivot E/); assert.match(k.tongHop.M2, /pivot F/);
  for (const f of [k.tongHop.A2, k.tongHop.G2, k.tongHop.M2]) {
    assert.match(f, /^=IFERROR\(QUERY\('Sổ chi phí'!B2:H; "/);
    assert.ok(!/QUERY\([^;]*,\s*"/.test(f), "không được dùng ',' làm dấu ngăn tham số");
  }
});
console.log(`\n${n} test đạt`);
