// Test cấu trúc thư mục chứng từ (thuần, không mạng) — chạy: node test-drive.mjs
// Chủ dự án 2026-10-06: xếp theo kiểu kế toán ("Lưu chứng từ" của admin), trong folder mới đặt trong "Chi phí":
//   <kênh> / YYYY / MM.YYYY / 01. Có HĐ | 02. Không HĐ / NN. <diễn giải> / ảnh   (thu → 03. Thu)
import test from "node:test";
import assert from "node:assert/strict";
import { duongChungTu, luuChungTu, thuMucCoFile } from "./drive.mjs";

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
