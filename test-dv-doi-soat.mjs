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

// Tab "Đối soát Zalo" (chủ dự án 2026-10-20): FORM giống tab kênh (A–O dựng bằng buildFundRow, P.. chép từ dòng sổ) + 4 cột đối soát;
// chỉ khoản bot đã ghi; giá trị từ sổ, sổ mất thì từ tin ✅ (kể cả link 📎); tin thử vẫn có dòng nhưng để trống tiền.
import { bangDoiSoat, TIEU_DE_THEM } from "./dichvu/doi-soat.mjs";
test("bảng đối soát theo form tab kênh: khớp / quỹ đã đổi / không còn trong sổ (từ ✅ + link 📎) / có thể trùng / tin thử để trống tiền", () => {
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
  const thu = u(5, "Dũng", "Chi 14.724.000đ vé máy bay")
  const ok5 = b("✅ #5 Dũng · 11/10 · CHI 14.724.000đ · GWT - TK Công ty · HĐ Có · Vé máy bay")
  const hangA = ["", "11/10/2026", "Xe", "Mai", "Không", "GWT - Tiền mặt", "", 400000, -400000, "01. Xe", "kế toán sửa", a.id, "", "", "https://drive.google.com/drive/folders/FA", "", "", "HCM", "GWT"]
  const rows = [
    { dong: 40, ngay: "11/10/2026", dienGiai: "Xe", nguoi: "Mai", hoaDon: "Không", nguonQuy: "GWT - Tiền mặt", thu: 0, chi: 400000, ghiChu: "kế toán sửa", maTin: a.id, url: hangA[14], hang: hangA },
    { dong: 42, ngay: "11/10/2026", dienGiai: "Tiền xe 3 gác", nguoi: "Trang", hoaDon: "Không", nguonQuy: "GWT - Tiền mặt", thu: 0, chi: 400000, ghiChu: "", maTin: d.id, url: "", hang: [] },
  ]
  const bang = bangDoiSoat({ tins: [a, ok1, c, ok2, d, ok3, e, thu, ok5], rows, tinThu: ["Dũng"], soCot: 19 })
  assert.deepEqual(TIEU_DE_THEM, ["Zalo #", "Giờ gửi", "Dòng sổ gốc", "Tình trạng đối soát"])
  assert.equal(bang.length, 4, "#1, #2, #3 và tin thử #5 (#4 chưa ghi → bỏ)")
  assert.ok(bang.every((h) => h.length === 23), "19 cột như tab mẫu + 4 cột đối soát")
  const [r1, r2, r3, r5] = bang
  assert.deepEqual([r1[0], r1[1], r1[2], r1[5], r1[7], r1[10], r1[11], r1[14], r1[17], r1[18]], ["=ROW()-1", "11/10/2026", "Xe", "GWT - Tiền mặt", 400000, "kế toán sửa", `'${a.id}`, hangA[14], "HCM", "GWT"])
  assert.match(r1[8], /^=SUM\(/)
  assert.deepEqual(r1.slice(19), ["#1", r1[20], 40, "Quỹ đã đổi (bot ghi: Cá nhân ứng)"]); assert.match(r1[20], /^\d{2}\/10\/2026 \d{2}:\d{2}$/)
  assert.deepEqual([r2[1], r2[2], r2[3], r2[7], r2[9], r2[14], r2[21], r2[22]], ["11/10/2026", "Tiền xe 3 gác", "Trang", 400000, "https://drive.google.com/drive/folders/F2", "https://drive.google.com/drive/folders/F2", "", "KHÔNG CÒN TRONG SỔ (lấy theo tin ✅ của bot)"])
  assert.deepEqual([r3[19], r3[21], r3[22]], ["#3", 42, "Có thể trùng #2"])
  assert.deepEqual([r5[2], r5[6], r5[7], r5[19], r5[22]], ["Vé máy bay", "", "", "#5", "Tin thử — không tính tiền (bot ghi: 14.724.000)"])
})

// Tab "HCM - <đơn vị>" (chủ dự án 2026-10-20): lọc cột R (Địa điểm) chứa HCM + cột S (Đơn vị), tổng/số khoản ở K/L khớp cột Chi (G) của tab mới.
import { tabHcm } from "./dichvu/tach-hcm.mjs";
test("tab HCM theo đơn vị: QUERY lọc R/S/H, tiêu đề A1:L1, tổng + số khoản ở K2/L2 không đè vùng QUERY", () => {
  const t = tabHcm("Đoàn", "Shopee")
  assert.equal(t.title, "HCM - Shopee")
  const [h] = t.rows, q = h[0]
  assert.match(q, /^=QUERY\('Đoàn'!A2:S\u001F "select A, B, C, D, E, F, H, O, K where upper\(R\) contains 'HCM' and upper\(S\) = 'SHOPEE' and H > 0 order by B/)
  assert.equal(t.tieuDeThem[6], "Chi"); assert.equal(t.cotThemTu, 0)
  assert.deepEqual([t.tieuDeThem[10], h[10], t.tieuDeThem[11], h[11]], ["Tổng chi", "=SUM(G2:G)", "Số khoản", "=COUNT(G2:G)"])
  assert.ok(h.slice(1, 10).every((x) => x === ""), "B2:J2 trống cho QUERY tràn xuống")
})

// "Bot có bị off không" (chủ dự án 2026-10-20): đọc nhật ký + viec — khởi động lại, cảnh báo, lỗi vòng gộp, tin nhận trễ / xong chậm / chưa xong.
import { gianDoan } from "./dichvu/gian-doan.mjs";
test("gián đoạn: liệt kê khởi động lại, cảnh báo, gộp lỗi vòng, chỉ tin chậm (nhận trễ, xong chậm, chưa xong)", () => {
  const T = Date.parse("2026-10-12T09:00:00+07:00"), ts = (m) => new Date(T + m * 60e3).toISOString()
  const suKien = [{ ts: ts(0), khoi_dong: true }, { ts: ts(30), canh_bao: "zalo_mat" }, { ts: ts(31), vong: "nhan", loi: "fetch failed" },
    { ts: ts(40), vong: "nhan", loi: "fetch failed" }, { ts: ts(90), khoi_dong: true }, { ts: ts(91), nhan: "x" }]
  const v = (ma, gui, nhan, xong, o = {}) => ({ ma, ten: "Mai", luc: T + gui * 60e3, tao_luc: T + nhan * 60e3, xong_luc: xong == null ? null : T + xong * 60e3, so_lan: 1, trang_thai: "xong", loi_cuoi: null, ...o })
  const ra = gianDoan({ tins: [v(1, 10, 10, 11), v(2, 35, 92, 93), v(3, 95, 95, 120, { so_lan: 3, loi_cuoi: "het_han_muc" }), v(4, 100, 100, null, { trang_thai: "cho" })], suKien })
  const s = ra.join("\n")
  assert.match(s, /Khởi động lại \(2\): 12\/10 09:00, 12\/10 10:30/)
  assert.match(s, /12\/10 09:30 zalo_mat/)
  assert.match(s, /2× 12\/10 09:31 → 12\/10 09:40 nhan: fetch failed/)
  assert.match(s, /Tin chậm \(3\/4\)/); assert.doesNotMatch(s, /#1 /)
  assert.match(s, /#2 Mai gửi 12\/10 09:35 · nhận sau 57′ · xong sau 58′/)
  assert.match(s, /#3 .* xong sau 25′ · 3 lần · het_han_muc/)
  assert.match(s, /#4 .* CHƯA XONG \(cho\)/)
})
