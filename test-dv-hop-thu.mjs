// Test hộp thư gửi + cảnh báo np-dichvu (Zalo giả) — chạy: node test-dv-hop-thu.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { moCsdl, taoKhoTin, datMoc } from "./dichvu/csdl.mjs";
import { taoHopThu, taoCanhBao, conNgayToken, LICH_THU_LAI } from "./dichvu/hop-thu.mjs";

const NHOM = "g1", KHAC = "g2", OPS = "ops";
let t0 = 1791300000000;
function dung({ hong = () => false } = {}) {
  const db = moCsdl(":memory:"), kho = taoKhoTin(db, { tenBot: "Bot GWT CP" })
  let gio = Date.parse("2026-10-10T08:00:00+07:00"), lan = 0
  const gui = [], loi = []
  const api = { guiChu: async (chat_id, text) => { lan++; if (hong(lan, chat_id)) throw new Error("Zalo sendMessage lỗi 500"); gui.push({ chat_id, text }); return [{ message_id: `b${lan}`, date: gio }] } }
  const ht = taoHopThu({ db, kho, api, now: () => gio, baoLoi: (k) => loi.push(k) })
  const khoan = (ch = NHOM) => kho.nhanTin({ event_name: "message.image.received", message: { message_id: `z${++t0}`, date: t0,
    chat: { id: ch, chat_type: "GROUP" }, from: { id: "u1", display_name: "Quỳnh Mai" }, photo_url: "https://z/a.jpg", caption: "@Bot GWT CP chi 180k" } }, { now: gio })
  return { db, kho, ht, gui, loi, khoan, guiHet: async () => { while (await ht.guiMot()); }, troi: (ms) => { gio += ms }, gio: () => gio }
}
const dongGui = (db) => db.prepare("SELECT * FROM gui ORDER BY id").all().map((r) => ({ ...r }))

test("tin dài cắt thành đoạn ≤ 2000 theo thứ tự; gửi lần lượt; lưu tin bot, CHỈ đoạn đầu trỏ khoản", async () => {
  const t = dung(), g = t.khoan()
  t.ht.xepGui({ chat_id: NHOM, noi_dung: "a".repeat(2500), hoi_ve: g.id, loai: "tra_loi" })
  assert.deepEqual(dongGui(t.db).map((r) => [r.thu_tu, r.noi_dung.length]), [[0, 2000], [1, 500]])
  await t.guiHet()
  assert.equal(t.gui.length, 2)
  assert.deepEqual(t.db.prepare("SELECT tra_loi_cho FROM tin WHERE la_bot=1 ORDER BY id").all().map((r) => r.tra_loi_cho), [g.id, null])
  assert.deepEqual(dongGui(t.db).map((r) => r.trang_thai), ["da_gui", "da_gui"])
})

test("khoản chỉ sang 'dang_hoi' SAU khi câu hỏi gửi được; khoản đã ghi giữ 'da_ghi'", async () => {
  const t = dung(), g = t.khoan(), h = t.khoan()
  t.ht.xepGui({ chat_id: NHOM, noi_dung: "quỹ nào?", hoi_ve: g.id, loai: "tra_loi" })
  assert.equal(t.kho.lay(g.id).trang_thai, "moi")
  await t.guiHet(); assert.equal(t.kho.lay(g.id).trang_thai, "dang_hoi")
  t.kho.danhDauDaGhi(h.id); t.ht.xepGui({ chat_id: NHOM, noi_dung: "x", hoi_ve: h.id, loai: "tra_loi" }); await t.guiHet()
  assert.equal(t.kho.lay(h.id).trang_thai, "da_ghi")
})

test("gửi lỗi → thử lại sau 1 phút; dòng sau CÙNG nhóm chờ, nhóm khác vẫn đi", async () => {
  const t = dung({ hong: (lan) => lan === 1 })
  t.ht.xepGui({ chat_id: NHOM, noi_dung: "một", loai: "tra_loi" }); t.ht.xepGui({ chat_id: NHOM, noi_dung: "hai", loai: "tra_loi" })
  t.ht.xepGui({ chat_id: KHAC, noi_dung: "nhóm khác", loai: "tra_loi" })
  await t.guiHet()
  assert.deepEqual(t.gui.map((x) => x.text), ["nhóm khác"])
  t.troi(LICH_THU_LAI[0]); await t.guiHet()
  assert.deepEqual(t.gui.map((x) => x.text), ["nhóm khác", "một", "hai"])
})

test("hỏng 4 lần → that_bai + báo lỗi; chính tin cảnh báo hỏng thì không báo vòng", async () => {
  const t = dung({ hong: () => true })
  t.ht.xepGui({ chat_id: NHOM, noi_dung: "x", loai: "tra_loi" }); t.ht.xepGui({ chat_id: OPS, noi_dung: "⚠️ y", loai: "canh_bao" })
  for (const ms of [0, ...LICH_THU_LAI]) { t.troi(ms); await t.guiHet() }
  assert.deepEqual(dongGui(t.db).map((r) => [r.trang_thai, r.so_lan]), [["that_bai", 4], ["that_bai", 4]])
  assert.equal(t.loi.length, 1); assert.match(t.loi[0], /^gui_that_bai:/)
})

test("cảnh báo: vào nhóm vận hành với ⚠️; cùng khoá không lặp trong 30 phút; chưa khai nhóm vận hành → chỉ nhật ký", async () => {
  const t = dung(), nk = []
  const cb = taoCanhBao({ db: t.db, hopThu: t.ht, nhomVanHanh: OPS, nhatKy: (d) => nk.push(d), now: t.gio })
  assert.equal(cb.bao("viec_that_bai:1", "Khoản #3 hỏng"), true); assert.equal(cb.bao("viec_that_bai:1", "lặp"), false)
  t.troi(31 * 60e3); assert.equal(cb.bao("viec_that_bai:1", "lại"), true)
  await t.guiHet()
  assert.deepEqual(t.gui.map((x) => [x.chat_id, x.text]), [[OPS, "⚠️ Khoản #3 hỏng"], [OPS, "⚠️ lại"]])
  taoCanhBao({ db: t.db, hopThu: t.ht, nhomVanHanh: null, nhatKy: (d) => nk.push(d), now: t.gio }).bao("khac", "y"); await t.guiHet()
  assert.equal(t.gui.length, 2); assert.ok(nk.some((d) => d.canh_bao === "khac"))
})

test("kiểm định kỳ: Zalo im > 5 phút, việc quá hạn > 15 phút, token còn < 30 ngày → cảnh báo; conNgayToken", async () => {
  const t = dung(), cb = taoCanhBao({ db: t.db, hopThu: t.ht, nhomVanHanh: OPS, now: t.gio })
  datMoc(t.db, "nhan_zalo_ok", t.gio()); t.khoan()
  cb.kiemDinhKy({ tokenNgayTao: "2026-10-08" }); await t.guiHet()
  assert.equal(t.gui.length, 0)
  t.troi(16 * 60e3); cb.kiemDinhKy({ tokenNgayTao: "2025-10-20" }); await t.guiHet()
  const chu = t.gui.map((x) => x.text).join("\n")
  assert.match(chu, /Không nhận được tin Zalo 16 phút/); assert.match(chu, /Hàng đợi kẹt/); assert.match(chu, /Token Claude còn/)
  assert.equal(conNgayToken("2026-10-08", Date.parse("2026-10-08T12:00:00+07:00")), 364)
})
