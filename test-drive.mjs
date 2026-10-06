// Test cấu trúc thư mục chứng từ (thuần, không mạng) — chạy: node test-drive.mjs
// Chủ dự án 2026-10-06: xếp theo kiểu kế toán ("Lưu chứng từ" của admin), trong folder mới đặt trong "Chi phí":
//   <kênh> / YYYY / MM.YYYY / 01. Có HĐ | 02. Không HĐ / NN. <diễn giải> / ảnh   (thu → 03. Thu)
import test from "node:test";
import assert from "node:assert/strict";
import { duongChungTu } from "./drive.mjs";

test("chi có hoá đơn đỏ → <kênh>/2026/10.2026/01. Có HĐ", () => {
  assert.deepEqual(duongChungTu({ kenh: "Đoàn hoạ sĩ TQ T10-2026", loai: "chi", hoaDon: "Có", dmy: "05/10/2026" }),
    ["Đoàn hoạ sĩ TQ T10-2026", "2026", "10.2026", "01. Có HĐ"]);
});
test("chi không hoá đơn → 02. Không HĐ", () => {
  assert.deepEqual(duongChungTu({ kenh: "Chi phí chung", loai: "chi", hoaDon: "Không", dmy: "31/12/2026" }),
    ["Chi phí chung", "2026", "12.2026", "02. Không HĐ"]);
});
test("thu → 03. Thu (không thuộc Có/Không HĐ)", () => {
  assert.deepEqual(duongChungTu({ kenh: "Chi phí chung", loai: "thu", hoaDon: "—", dmy: "01/11/2026" }),
    ["Chi phí chung", "2026", "11.2026", "03. Thu"]);
});
test("thiếu ngày → thư mục 'khong-ro-ngay' (không đoán tháng)", () => {
  assert.deepEqual(duongChungTu({ kenh: "Chi phí chung", loai: "chi", hoaDon: "Không", dmy: "" }),
    ["Chi phí chung", "khong-ro-ngay", "02. Không HĐ"]);
});
test("thiếu kênh → lỗi rõ (không ném chứng từ vào gốc)", () => {
  assert.throws(() => duongChungTu({ loai: "chi", hoaDon: "Không", dmy: "05/10/2026" }), /kênh/);
});
