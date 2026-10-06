// Test cấu trúc thư mục chứng từ (thuần, không mạng) — chạy: node test-drive.mjs
// Chủ dự án 2026-10-06: xếp theo kiểu kế toán ("Lưu chứng từ" của admin), trong folder mới đặt trong "Chi phí":
//   <kênh> / YYYY / MM.YYYY / 01. Có HĐ | 02. Không HĐ / NN. <diễn giải> / ảnh   (thu → 03. Thu)
import test from "node:test";
import assert from "node:assert/strict";
import { duongChungTu } from "./drive.mjs";

test("chi có hoá đơn đỏ → <kênh>/<quỹ>/01. Có HĐ/2026/10.2026/05.10.2026", () => {
  assert.deepEqual(duongChungTu({ kenh: "Đoàn hoạ sĩ TQ T10-2026", quy: "GWT - TK Công ty", loai: "chi", hoaDon: "Có", dmy: "05/10/2026" }),
    ["Đoàn hoạ sĩ TQ T10-2026", "GWT - TK Công ty", "01. Có HĐ", "2026", "10.2026", "05.10.2026"]);
});
test("chi không hoá đơn → 02. Không HĐ", () => {
  assert.deepEqual(duongChungTu({ kenh: "Chi phí chung", quy: "Thuỷ", loai: "chi", hoaDon: "Không", dmy: "31/12/2026" }),
    ["Chi phí chung", "Thuỷ", "02. Không HĐ", "2026", "12.2026", "31.12.2026"]);
});
test("thu → 03. Thu (không thuộc Có/Không HĐ)", () => {
  assert.deepEqual(duongChungTu({ kenh: "Chi phí chung", quy: "Thuỷ", loai: "thu", hoaDon: "—", dmy: "01/11/2026" }),
    ["Chi phí chung", "Thuỷ", "03. Thu", "2026", "11.2026", "01.11.2026"]);
});
test("thiếu ngày → thư mục 'khong-ro-ngay' (không đoán tháng)", () => {
  assert.deepEqual(duongChungTu({ kenh: "Chi phí chung", quy: "Thuỷ", loai: "chi", hoaDon: "Không", dmy: "" }),
    ["Chi phí chung", "Thuỷ", "02. Không HĐ", "khong-ro-ngay"]);
});
test("ngày 1 chữ số (8/9/2026) → folder đệm 0: 09.2026 / 08.09.2026 (Drive sắp theo chữ)", () => {
  assert.deepEqual(duongChungTu({ kenh: "Chi phí chung", quy: "Thuỷ", loai: "chi", hoaDon: "Không", dmy: "8/9/2026" }),
    ["Chi phí chung", "Thuỷ", "02. Không HĐ", "2026", "09.2026", "08.09.2026"]);
});
test("chưa rõ quỹ → nhánh 'Chưa rõ quỹ' (không đoán quỹ, không ném vào quỹ khác)", () => {
  assert.deepEqual(duongChungTu({ kenh: "Chi phí chung", loai: "chi", hoaDon: "Không", dmy: "05/10/2026" }),
    ["Chi phí chung", "Chưa rõ quỹ", "02. Không HĐ", "2026", "10.2026", "05.10.2026"]);
});
test("thiếu kênh → lỗi rõ (không ném chứng từ vào gốc)", () => {
  assert.throws(() => duongChungTu({ loai: "chi", hoaDon: "Không", dmy: "05/10/2026" }), /kênh/);
});
