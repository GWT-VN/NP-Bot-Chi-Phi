// Test hàng đợi + gói ngữ cảnh np-dichvu (Claude giả dạng hàm) — chạy: node test-dv-hang-doi.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { moCsdl, taoKhoTin } from "./dichvu/csdl.mjs";
import { taoHopThu, LICH_THU_LAI } from "./dichvu/hop-thu.mjs";
import { taoHangDoi, dungNguCanh, SO_LAN_TOI_DA } from "./dichvu/hang-doi.mjs";

const NHOM = "g1";
let t0 = 1791300000000;
function dung(kichBan) {
  const db = moCsdl(":memory:"), kho = taoKhoTin(db, { tenBot: "Bot GWT CP" })
  let gio = Date.parse("2026-10-10T08:00:00+07:00")
  const hopThu = taoHopThu({ db, kho, api: { guiChu: async () => [{ message_id: "b", date: gio }] }, now: () => gio })
  const bao = [], phien = [], nguCanh = []
  const congCu = { moPhien: (v) => { phien.push(["mo", v.id]); return `tk${v.id}` }, dongPhien: (tk) => phien.push(["dong", tk]) }
  const chay = async ({ nguCanh: nc, token }) => { nguCanh.push(nc); const b = kichBan.shift(); return typeof b === "function" ? b({ token, hopThu }) : b }
  const hd = taoHangDoi({ db, kho, core: { kiemTin: async () => ({ ok: true, da_ghi: false }) }, congCu, hopThu, canhBao: { bao: (k) => bao.push(k) },
    nhom: { [NHOM]: { name: "đoàn", tab: "Đoàn" } }, tenBot: "Bot GWT CP", dsQuy: ["GWT - Tiền mặt"], chay, now: () => gio })
  const tin = (text) => kho.nhanTin({ event_name: "message.text.received", message: { message_id: `z${++t0}`, date: t0, chat: { id: NHOM, chat_type: "GROUP" }, from: { id: "u1", display_name: "Quỳnh Mai" }, text } }, { now: gio })
  const viec = (t) => ({ ...db.prepare("SELECT * FROM viec WHERE tin_id=?").get(t.id) })
  const gui = () => db.prepare("SELECT * FROM gui ORDER BY id").all().map((r) => ({ ...r }))
  return { db, kho, hd, bao, phien, nguCanh, tin, viec, gui, troi: (ms) => { gio += ms }, gio: () => gio }
}
const XONG = { ok: true, kieu: "xong", luot: 2, maThoat: 0 }, LOI = { ok: false, kieu: "loi", loi: "boom", maThoat: 1 }

test("[Review Focus] chạy LẦN LƯỢT theo thứ tự đến; token mở rồi đóng; Claude im lặng → 'Đã nhận #N.'; Claude đã nói → không thêm", async () => {
  const t = dung([XONG, ({ hopThu }) => { hopThu.xepGui({ chat_id: NHOM, noi_dung: "Khoản #2 quỹ nào?", viec_id: 2, loai: "tra_loi" }); return XONG }])
  const a = t.tin("@Bot GWT CP note"), b = t.tin("@Bot GWT CP chi 50k")
  assert.equal(await t.hd.chayMot(), true); assert.equal(await t.hd.chayMot(), true); assert.equal(await t.hd.chayMot(), false)
  assert.deepEqual([t.viec(a).trang_thai, t.viec(b).trang_thai], ["xong", "xong"])
  assert.deepEqual(t.gui().map((g) => g.noi_dung), ["Đã nhận #1.", "Khoản #2 quỹ nào?"])
  assert.deepEqual(t.phien, [["mo", t.viec(a).id], ["dong", `tk${t.viec(a).id}`], ["mo", t.viec(b).id], ["dong", `tk${t.viec(b).id}`]])
  assert.match(t.nguCanh[0], /TIN MỚI #1 · message_id \d{16}/)
})

test("ảnh đang tải → chưa chạy việc; tải xong (kể cả hỏng) mới chạy, gói ngữ cảnh dặn nhờ gửi lại ảnh kèm #N", async () => {
  const t = dung([XONG])
  const a = t.kho.nhanTin({ event_name: "message.image.received", message: { message_id: `z${++t0}`, date: t0, chat: { id: NHOM, chat_type: "GROUP" },
    from: { id: "u1", display_name: "Quỳnh Mai" }, photo_url: "https://z/a.jpg", caption: "@Bot GWT CP chi 180k" } }, { now: t.gio() })
  assert.equal(await t.hd.chayMot(), false)
  t.kho.datAnh(a.id, { tt: "loi:HTTP 403" })
  assert.equal(await t.hd.chayMot(), true)
  assert.match(t.nguCanh[0], /ảnh: tải hỏng \(HTTP 403\) — nhờ người gửi gửi lại 1 ảnh, chú thích bắt đầu bằng @Bot GWT CP #1/)
})

test("lỗi → thử lại sau 1, 5, 15 phút; lần chạy lại thấy 'đã gửi ở lần trước'; hỏng lần 4 → that_bai + cảnh báo + báo nhóm", async () => {
  const t = dung([({ hopThu }) => { hopThu.xepGui({ chat_id: NHOM, noi_dung: "Khoản #1 quỹ nào?", viec_id: 1, loai: "tra_loi" }); return LOI }, LOI, LOI, LOI])
  const a = t.tin("@Bot GWT CP chi 50k")
  assert.equal(await t.hd.chayMot(), true)
  assert.deepEqual([t.viec(a).trang_thai, t.viec(a).so_lan], ["cho", 1])
  assert.equal(await t.hd.chayMot(), false)
  for (const ms of LICH_THU_LAI) { t.troi(ms); assert.equal(await t.hd.chayMot(), true) }
  assert.match(t.nguCanh[1], /ĐÃ GỬI Ở LẦN CHẠY TRƯỚC \(đừng gửi lặp\): "Khoản #1 quỹ nào\?"/)
  assert.deepEqual([t.viec(a).trang_thai, t.viec(a).so_lan], ["that_bai", SO_LAN_TOI_DA])
  assert.deepEqual(t.bao, [`viec_that_bai:${t.viec(a).id}`])
  assert.equal(t.gui().at(-1).noi_dung, "Khoản #1 chưa xử lý được, đã báo người quản lý.")
})

test("[I2] chạm giới hạn gói → cảnh báo, DỪNG CẢ hàng đợi 30 phút, KHÔNG tính lần; huỷ (dịch vụ tắt) → về 'cho', không tính lần", async () => {
  const t = dung([{ ok: false, kieu: "gioi_han" }, { ok: false, kieu: "huy" }, XONG, XONG])
  const a = t.tin("@Bot GWT CP chi 50k"), b = t.tin("@Bot GWT CP chi 60k")
  await t.hd.chayMot(); assert.deepEqual(t.bao, ["claude_gioi_han"])
  assert.deepEqual([t.viec(a).trang_thai, t.viec(a).so_lan], ["cho", 0])
  t.troi(LICH_THU_LAI[0]); assert.equal(await t.hd.chayMot(), false)
  assert.equal(t.nguCanh.length, 1, "việc b không được chạy trong lúc chờ gói")
  t.troi(30 * 60e3); await t.hd.chayMot()
  assert.deepEqual([t.viec(a).trang_thai, t.viec(a).so_lan], ["cho", 0])
  await t.hd.chayMot(); assert.deepEqual([t.viec(a).trang_thai, t.viec(a).so_lan], ["xong", 1])
  await t.hd.chayMot(); assert.equal(t.viec(b).trang_thai, "xong")
})

test("khôi phục: việc 'dang_chay' lúc dịch vụ chết → về 'cho'", () => {
  const t = dung([]), a = t.tin("@Bot GWT CP x")
  t.db.prepare("UPDATE viec SET trang_thai='dang_chay' WHERE tin_id=?").run(a.id)
  assert.equal(t.hd.khoiPhuc(), 1); assert.equal(t.viec(a).trang_thai, "cho")
})

test("gói ngữ cảnh: tin mới, trả lời cho khoản (kèm câu bot hỏi), khoản khác đang hỏi, bộ đọc luật, quỹ", () => {
  const nc = dungNguCanh({ viec: { id: 7, so_lan: 1 }, nhom: { name: "đoàn", tab: "Đoàn" }, tenBot: "Bot GWT CP",
    tin: { id: "1791300000005000", ma: 5, ten: "Quỳnh Mai", luc: Date.parse("2026-10-07T11:08:00Z"), anh_tt: "khong_co", noi_dung: "tiền mặt", kieu_tra_loi: "suy_ra" },
    traLoi: { goc: { id: "1791300000001000", ma: 3, trang_thai: "dang_hoi", anh_tt: "da_tai", anh_tep: "/a/3.jpg", noi_dung: "hộp bóng bàn" }, cauHoi: { noi_dung: "Khoản #3 quỹ nào?" } },
    dangHoi: [{ id: "1791300000001000", ma: 3 }, { id: "1791300000002000", ma: 4 }], kiemTin: { thieu: ["quy"] }, dsQuy: ["GWT - Tiền mặt", "Thuỷ"] })
  assert.match(nc, /^VIỆC 7 \(lần chạy 1\) · nhóm "đoàn" · tab sổ "Đoàn"/)
  assert.match(nc, /TIN MỚI #5 · message_id 1791300000005000 · Quỳnh Mai · .+ · ảnh: không có/)
  assert.match(nc, /TRẢ LỜI CHO khoản #3 · message_id 1791300000001000 · kiểu suy_ra · trạng thái dang_hoi · ảnh: \/a\/3\.jpg/)
  assert.match(nc, /bot đã hỏi: "Khoản #3 quỹ nào\?"/)
  assert.match(nc, /KHOẢN KHÁC ĐANG HỎI Quỳnh Mai: #4 \(message_id 1791300000002000\)/)
  assert.match(nc, /ĐÃ GỬI Ở LẦN CHẠY TRƯỚC: \(không có\)/); assert.match(nc, /BỘ ĐỌC LUẬT \(chỉ tham chiếu\): \{"thieu":\["quy"\]\}/)
  assert.match(nc, /QUỸ: GWT - Tiền mặt · Thuỷ/)
  // Rà soát cuối (I2): giờ tin có NĂM — Claude điền năm cho ngày "7/10" theo đây, không đoán.
  assert.match(nc, /TIN MỚI #5 [^\n]*\/2026/)
})
