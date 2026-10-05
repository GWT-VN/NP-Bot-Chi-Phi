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
