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

// Tab "Đối soát Zalo" (chủ dự án 2026-10-20): mỗi khoản một dòng theo thời gian; giá trị từ sổ, sổ mất thì từ tin ✅ của bot.
import { bangDoiSoat } from "./dichvu/doi-soat.mjs";
test("bảng đối soát: CHỈ khoản bot đã ghi (không cột tin gốc); khớp / quỹ đã đổi / không còn trong sổ (lấy từ ✅) / có thể trùng; bỏ người thử", () => {
  const T = Date.parse("2026-10-11T17:00:00+07:00"), G = "g"
  let n = 0
  const u = (ma, ten, noi_dung, o = {}) => ({ id: `17915000000${String(++n).padStart(2, "0")}000`, chat_id: G, ma, ten, luc: T + n * 60e3, la_bot: 0, noi_dung, anh_tt: "khong_co", trang_thai: "da_ghi", tra_loi_cho: null, ...o })
  const b = (noi_dung, o = {}) => ({ id: `17915000000${String(++n).padStart(2, "0")}000`, chat_id: G, ma: null, ten: "Bot GWT CP", luc: T + n * 60e3, la_bot: 1, noi_dung, tra_loi_cho: null, ...o })
  const a = u(1, "Mai", "Chi - 400.000đ - xe - cá nhân ứng")
  const ok1 = b("✅ #1 Mai · 11/10 · CHI 400.000đ · Cá nhân ứng · HĐ Không · Xe")
  const c = u(2, "Trang", "Chi - 400.000đ - tiền xe 3 gác - Tiền mặt")
  const ok2 = b("✅ #2 Trang · 11/10 · CHI 400.000đ · GWT - Tiền mặt · HĐ Không · Tiền xe 3 gác\n📎 Chưa có chứng từ, tải vào: https://drive.google.com/drive/folders/F2")
  const d = u(3, "Trang", "Chi - 400.000đ - tiền xe 3 gác - Tiền mặt")
  const ok3 = b("✅ #3 Trang · 11/10 · CHI 400.000đ · GWT - Tiền mặt · HĐ Không · Tiền xe 3 gác")
  const e = u(4, "Mai", "Chi 30k bánh", { trang_thai: "dang_hoi" })
  const hoi = b("#4 quỹ nào?", { tra_loi_cho: e.id })
  const f = u(5, "Mai", "tiền mặt", { trang_thai: "moi", tra_loi_cho: hoi.id })
  const thu = u(6, "Dũng", "Chi 1k test")
  const rows = [
    { dong: 40, ngay: "11/10/2026", dienGiai: "Xe", hoaDon: "Không", nguonQuy: "GWT - Tiền mặt", thu: 0, chi: 400000, ghiChu: "kế toán sửa", maTin: a.id },
    { dong: 42, ngay: "11/10/2026", dienGiai: "Tiền xe 3 gác", hoaDon: "Không", nguonQuy: "GWT - Tiền mặt", thu: 0, chi: 400000, ghiChu: "", maTin: d.id },
  ]
  const bang = bangDoiSoat({ tins: [a, ok1, c, ok2, d, ok3, e, hoi, f, thu], rows, boNguoi: ["Dũng"] })
  assert.deepEqual(bang[0], ["STT", "Zalo #", "Giờ gửi", "Người gửi", "Ngày", "Thu", "Chi", "Nguồn quỹ", "Hoá đơn", "Diễn giải", "Dòng sổ", "Tình trạng", "Ghi chú sổ"])
  assert.equal(bang.length, 4, "3 khoản đã ghi (#4 chưa ghi, #5 là trả lời, Dũng bị bỏ)")
  const [, r1, r2, r3] = bang
  assert.deepEqual([r1[1], r1[7], r1[10], r1[11], r1[12]], [1, "GWT - Tiền mặt", 40, "Quỹ đã đổi (bot ghi: Cá nhân ứng)", "kế toán sửa"])
  assert.deepEqual([r2[1], r2[4], r2[6], r2[7], r2[9], r2[10], r2[11]], [2, "11/10/2026", 400000, "GWT - Tiền mặt", "Tiền xe 3 gác", "", "KHÔNG CÒN TRONG SỔ (lấy theo tin ✅ của bot)"])
  assert.deepEqual([r3[1], r3[10], r3[11]], [3, 42, "Có thể trùng #2"])
  assert.ok(bang.every((d) => !d.includes("Chi 30k bánh") && !d.includes("tiền mặt")), "không có nguyên văn tin")
  assert.match(r1[2], /^\d{2}\/10\/2026 \d{2}:\d{2}$/)
})
