// Test đối soát tin Zalo ↔ sổ (thuần, không mạng) — chạy: node test-dv-doi-soat.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { doiSoat } from "./dichvu/doi-soat.mjs";

test("đối soát: tin có dòng sổ → in dòng sổ; trả lời → '(trả lời #N)' không dòng SỔ riêng; tin chưa ghi → 'không có dòng'; dòng sổ Zalo lạ → '??'; dòng Discord bỏ qua", () => {
  const T = Date.parse("2026-10-09T10:00:00+07:00")
  const tins = [
    { id: "1791500000000000", ma: 1, ten: "Mai", luc: T, la_bot: 0, noi_dung: "Chi - 50k - Taxi - Tiền mặt", anh_tt: "da_tai", trang_thai: "da_ghi", tra_loi_cho: null },
    { id: "1791500000001000", ma: 2, ten: "Mai", luc: T + 60e3, la_bot: 0, noi_dung: "Chi 30k bánh", anh_tt: "khong_co", trang_thai: "dang_hoi", tra_loi_cho: null },
    { id: "1791500000002000", ma: null, ten: "Bot GWT CP", luc: T + 61e3, la_bot: 1, noi_dung: "#2 quỹ nào?", tra_loi_cho: "1791500000001000" },
    { id: "1791500000003000", ma: 3, ten: "Mai", luc: T + 120e3, la_bot: 0, noi_dung: "tiền mặt", anh_tt: "khong_co", trang_thai: "moi", tra_loi_cho: "1791500000002000" },
  ]
  const rows = [
    { dong: 5, ngay: "09/10/2026", dienGiai: "Taxi", hoaDon: "Không", nguonQuy: "GWT - Tiền mặt", thu: 0, chi: 50000, ghiChu: "", maTin: "1791500000000000" },
    { dong: 6, ngay: "09/10/2026", dienGiai: "Lạ", hoaDon: "Không", nguonQuy: "GWT - Tiền mặt", thu: 0, chi: 70000, ghiChu: "", maTin: "1791599999999000" },
    { dong: 7, ngay: "06/10/2026", dienGiai: "Discord", hoaDon: "Có", nguonQuy: "GWT - TK Công ty", thu: 0, chi: 1, ghiChu: "", maTin: "1556858628550692914" },
  ]
  const ra = doiSoat({ tins, rows }).join("\n")
  assert.match(ra, /#1 [^\n]*Mai \[ảnh\]: "Chi - 50k - Taxi - Tiền mặt"\n   SỔ dòng 5: 09\/10\/2026 · CHI 50\.000 · GWT - Tiền mặt · HĐ Không · "Taxi"/)
  assert.match(ra, /#2 [^\n]*Mai: "Chi 30k bánh"\n   SỔ: không có dòng \(trạng thái tin: dang_hoi\)/)
  assert.match(ra, /#3 [^\n]*Mai \(trả lời #2\): "tiền mặt"(\n|$)/); assert.doesNotMatch(ra, /#3[^\n]*\n   SỔ/)
  assert.match(ra, /\?\? SỔ dòng 6 mã tin 1791599999999000 không thấy tin Zalo/); assert.doesNotMatch(ra, /dòng 7/)
  assert.doesNotMatch(ra, /quỹ nào/)
})
