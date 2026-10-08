// Test CSDL np-dichvu (offline) — chạy: node test-dv-csdl.mjs. Spec 2026-10-08 §CSDL.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { moCsdl, taoKhoTin, nguonTinSoCore, datMoc, layMoc, CUA_SO_HOI } from "./dichvu/csdl.mjs";
import { taoSo } from "./so-core.mjs";

const NHOM = "g123abc";
let t0 = 1791300000000;
const nguoi = { id: "u1", display_name: "Quỳnh Mai", is_bot: false };
const cn = (text, o = {}) => ({ event_name: "message.text.received", message: { message_id: `z${++t0}`, date: t0,
  chat: { id: NHOM, chat_type: "GROUP" }, from: nguoi, text, ...o } });
const anh = (caption, o = {}) => ({ event_name: "message.image.received", message: { message_id: `z${++t0}`, date: t0,
  chat: { id: NHOM, chat_type: "GROUP" }, from: nguoi, photo_url: "https://zalo/anh.jpg", caption, ...o } });
const moi = () => { const db = moCsdl(":memory:"); return { db, k: taoKhoTin(db, { tenBot: "Bot GWT CP" }) } };
// Bot hỏi về khoản g (tin bot đã gửi được) → khoản sang dang_hoi — đúng như hộp thư làm sau khi gửi.
const hoi = (k, g) => { const h = k.ghiBot({ chat_id: NHOM, msg_goc: `b${++t0}`, luc: t0, noi_dung: "quỹ nào?", hoi_ve: g.id }); k.danhDauDangHoi(g.id); return h };
const viec = (db, id) => ({ ...db.prepare("SELECT * FROM viec WHERE tin_id=?").get(id) });

test("moCsdl: dựng cấu trúc phiên bản 1; mở lại file không dựng lại, dữ liệu còn", () => {
  const f = join(mkdtempSync(join(tmpdir(), "dv-")), "np.sqlite")
  const db1 = moCsdl(f), a = taoKhoTin(db1, { tenBot: "Bot GWT CP" }).nhanTin(cn("@Bot GWT CP chi 50k"))
  db1.close()
  const db2 = moCsdl(f)
  assert.equal(db2.prepare("SELECT so FROM phien_ban").get().so, 1)
  assert.equal(taoKhoTin(db2).lay(a.id).noi_dung, "chi 50k")
})

test("tin chữ: bỏ @Bot, id 16 chữ số tăng theo thời gian, #N theo nhóm, mỗi tin một việc 'cho'", () => {
  const { db, k } = moi(), a = k.nhanTin(cn("@Bot GWT CP chi 50k ship test")), b = k.nhanTin(cn("180k @Bot GWT CP"))
  assert.equal(a.noi_dung, "chi 50k ship test"); assert.equal(b.noi_dung, "180k")
  assert.match(a.id, /^\d{16}$/); assert.ok(BigInt(b.id) > BigInt(a.id))
  assert.deepEqual([a.ma, b.ma], [1, 2]); assert.equal(a.ten, "Quỳnh Mai"); assert.equal(a.trang_thai, "moi"); assert.equal(a.anh_tt, "khong_co")
  assert.equal(viec(db, a.id).trang_thai, "cho"); assert.equal(viec(db, b.id).trang_thai, "cho")
})

test("[@ lạ] tên bot khác hoa thường / có NBSP vẫn bị bỏ", () => {
  const { k } = moi()
  assert.equal(k.nhanTin(cn("@bot gwt cp chi 50k")).noi_dung, "chi 50k")
  assert.equal(k.nhanTin(cn("@Bot GWT CP chi 60k")).noi_dung, "chi 60k")
})

test("tin ảnh: giữ anh_url, anh_tt 'cho_tai'; chú thích thành nội dung", () => {
  const t = moi().k.nhanTin(anh("@Bot GWT CP chi 180k nước"))
  assert.equal(t.noi_dung, "chi 180k nước"); assert.equal(t.anh_url, "https://zalo/anh.jpg"); assert.equal(t.anh_tt, "cho_tai")
})

test("cùng message_id Zalo gửi lại → null, không thêm việc; cập nhật không có message → null", () => {
  const { db, k } = moi(), u = cn("@Bot GWT CP chi 50k")
  assert.ok(k.nhanTin(u)); assert.equal(k.nhanTin(u), null); assert.equal(k.nhanTin({ event_name: "x" }), null)
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM viec").get().n, 1)
})

test("suy trả lời: đúng 1 khoản đang hỏi + tin chữ → trỏ câu hỏi cuối của bot, kiểu suy_ra", () => {
  const { k } = moi(), g = k.nhanTin(anh("@Bot GWT CP thanh toán hộp bóng")), h = hoi(k, g)
  const x = k.nhanTin(cn("@Bot GWT CP đúng, quỹ tiền mặt"))
  assert.equal(x.tra_loi_cho, h.id); assert.equal(x.kieu_tra_loi, "suy_ra")
})

test("2 khoản đang hỏi mà không ghi # → không trỏ; tin ảnh = khoản mới → không trỏ", () => {
  const { k } = moi(), g1 = k.nhanTin(anh("@Bot GWT CP a")), g2 = k.nhanTin(anh("@Bot GWT CP b"))
  hoi(k, g1); hoi(k, g2)
  assert.equal(k.nhanTin(cn("@Bot GWT CP đúng")).tra_loi_cho, null)
  k.boHoi(g2.id)
  assert.equal(k.nhanTin(anh("@Bot GWT CP khoản mới")).tra_loi_cho, null)
})

test("#N của chính người gửi → trỏ thẳng khoản (kể cả đã ghi); [C1] #N của người khác → không trỏ, không rơi xuống luật 2", () => {
  const { k } = moi(), g = k.nhanTin(anh("@Bot GWT CP chi 180k")); k.danhDauDaGhi(g.id)
  const s = k.nhanTin(cn(`@Bot GWT CP sửa #${g.ma} thành 150k`))
  assert.equal(s.tra_loi_cho, g.id); assert.equal(s.kieu_tra_loi, "#N")
  const binh = { id: "uB", display_name: "Bình" }
  const cuaBinh = k.nhanTin(anh("@Bot GWT CP chi 200k", { from: binh })); hoi(k, cuaBinh)
  assert.equal(k.nhanTin(cn(`@Bot GWT CP #${g.ma} quỹ tiền mặt nhé`, { from: binh })).tra_loi_cho, null)
})

test("[I1] tin ảnh: #N giữa câu (số phòng) → khoản mới; chú thích MỞ ĐẦU bằng #N → gửi lại ảnh cho khoản #N", () => {
  const { k } = moi(), g = k.nhanTin(cn("@Bot GWT CP chi 180k nước"))
  assert.equal(k.nhanTin(anh(`@Bot GWT CP chi 300k phòng #${g.ma} khách sạn`)).tra_loi_cho, null)
  const lai = k.nhanTin(anh(`@Bot GWT CP #${g.ma} bill đây`))
  assert.equal(lai.tra_loi_cho, g.id); assert.equal(lai.kieu_tra_loi, "#N")
})

test("[I2] khoản đang hỏi quá 48 giờ không còn hút tin chữ", () => {
  const { k } = moi(), g = k.nhanTin(anh("@Bot GWT CP hộp bóng")); hoi(k, g)
  t0 += CUA_SO_HOI + 3600e3
  assert.equal(k.nhanTin(cn("@Bot GWT CP hôm nay chi bao nhiêu?")).tra_loi_cho, null)
})

test("khoanGocCua: trả lời câu hỏi bot → {goc, cauHoi}; #N → {goc, câu hỏi cuối}; tin thường → null", () => {
  const { k } = moi(), g = k.nhanTin(anh("@Bot GWT CP hộp bóng")), h = hoi(k, g)
  const x = k.nhanTin(cn("@Bot GWT CP tiền mặt"))
  assert.deepEqual([k.khoanGocCua(x).goc.id, k.khoanGocCua(x).cauHoi.id], [g.id, h.id])
  const y = k.nhanTin(cn(`@Bot GWT CP #${g.ma} tiền mặt`))
  assert.deepEqual([k.khoanGocCua(y).goc.id, k.khoanGocCua(y).cauHoi.id], [g.id, h.id])
  assert.equal(k.khoanGocCua(g), null)
})

test("trạng thái khoản: dang_hoi chỉ từ moi; boHoi chỉ từ dang_hoi; da_ghi; dangHoiCua; datAnh + tinChoTaiAnh; mốc giờ", () => {
  const { db, k } = moi(), g = k.nhanTin(anh("@Bot GWT CP a"))
  k.danhDauDaGhi(g.id); k.danhDauDangHoi(g.id); k.boHoi(g.id)
  assert.equal(k.lay(g.id).trang_thai, "da_ghi")
  const h = k.nhanTin(anh("@Bot GWT CP b")); k.danhDauDangHoi(h.id)
  assert.deepEqual(k.dangHoiCua(NHOM, "u1", t0).map((r) => r.id), [h.id])
  assert.deepEqual(k.tinChoTaiAnh().map((r) => r.id), [g.id, h.id])
  k.datAnh(g.id, { tep: "/x/1.jpg", tt: "da_tai" }); k.datAnh(h.id, { tt: "loi:HTTP 403" })
  assert.deepEqual(k.tinChoTaiAnh(), []); assert.equal(k.lay(h.id).anh_tt, "loi:HTTP 403")
  datMoc(db, "nhan_zalo_ok", 123); datMoc(db, "nhan_zalo_ok", 456)
  assert.equal(layMoc(db, "nhan_zalo_ok"), 456); assert.equal(layMoc(db, "khong_co"), null)
})

test("nguồn tin cho so-core: dáng tin (bot, ✅/❓, ảnh chỉ khi đã tải về máy), layTin sai nhóm → null, link 'Zalo #N'", async () => {
  const { k } = moi(), n = nguonTinSoCore(k), g = k.nhanTin(anh("@Bot GWT CP chi 180k"))
  assert.deepEqual((await n.layTin(NHOM, g.id)).attachments, [])
  k.datAnh(g.id, { tep: "/x/1.jpg", tt: "da_tai" })
  const m = await n.layTin(NHOM, g.id)
  assert.deepEqual(m.attachments, [{ url: "https://zalo/anh.jpg", tep: "/x/1.jpg", content_type: "image/jpeg", filename: `anh-${g.id}.jpg` }])
  assert.equal(m.author.bot, false); assert.equal(m.channel_id, NHOM); assert.equal(await n.layTin("nhomkhac", g.id), null)
  await n.react(NHOM, g.id, "❓"); assert.equal((await n.layTin(NHOM, g.id)).reactions[0].emoji.name, "❓")
  await n.unreact(NHOM, g.id, "❓"); assert.deepEqual((await n.layTin(NHOM, g.id)).reactions, [])
  await n.react(NHOM, g.id, "✅"); await n.unreact(NHOM, g.id, "❓")
  assert.equal((await n.layTin(NHOM, g.id)).reactions[0].emoji.name, "✅")
  assert.equal(n.link(NHOM, g.id), `Zalo #1 (tin ${g.id})`)
  const h = k.ghiBot({ chat_id: NHOM, msg_goc: "b1", luc: t0 + 1, noi_dung: "x", hoi_ve: g.id })
  assert.equal((await n.layTin(NHOM, h.id)).author.bot, true)
})

test("so-core THẬT + nguồn tin: quét bù thấy khoản đang hỏi; người khác trả lời → từ chối; chính người gửi → ghi, ✅, ảnh đọc từ tệp", async () => {
  const { k } = moi(), g = k.nhanTin(anh("@Bot GWT CP thanh toán 1 hộp bóng bàn")); k.datAnh(g.id, { tep: "/x/1.jpg", tt: "da_tai" }); hoi(k, g)
  const la = k.nhanTin(cn("@Bot GWT CP đúng", { from: { id: "u2", display_name: "Thuỷ" } }))
  const ghi = [], anhLuu = []
  const so = taoSo({ cfg: { channels: { [NHOM]: { name: "thử", tab: "Thử Zalo" } }, quy: [{ ten: "GWT - Tiền mặt", goiTat: ["tiền mặt"] }] }, now: () => t0 + 1000,
    discord: nguonTinSoCore(k), so: { loadProcessed: async () => new Set(), commit: async (x) => ghi.push(x), timDong: async () => null },
    drive: { luuAnh: async (o) => { anhLuu.push(o); return "https://drive/x" } } })
  assert.deepEqual((await so.tinChuaXuLy()).dang_cho.map((d) => d.message_id), [g.id])
  const dung = k.nhanTin(cn("@Bot GWT CP đúng, 160k quỹ tiền mặt"))
  const a = { chat_id: NHOM, message_id: g.id, loai: "chi", so_tien: 160000, noi_dung: "Hộp bóng bàn", hoa_don: "Không", nguon_quy: "GWT - Tiền mặt" }
  assert.equal((await so.ghiKhoan({ ...a, xac_nhan_message_id: la.id })).ok, false)
  const r = await so.ghiKhoan({ ...a, xac_nhan_message_id: dung.id })
  assert.equal(r.ok, true, r.ly_do); assert.match(ghi[0].rows[0][10], /Zalo #/)
  assert.equal(anhLuu[0].msgs[0].attachments[0].tep, "/x/1.jpg"); assert.equal(k.lay(g.id).trang_thai, "da_ghi")
})

// Review cuối (I3): chưa đo đơn vị `date` của Zalo — trả giây thì sổ ghi ngày 01/01/1970 mà không ai biết. Giây → ms.
test("[I3] date Zalo tính bằng GIÂY → đổi ra mili giây; mili giây giữ nguyên", () => {
  const { k } = moi()
  assert.equal(k.nhanTin(cn("@Bot GWT CP chi 50k", { date: 1791300000 })).luc, 1791300000000)
  assert.equal(k.nhanTin(cn("@Bot GWT CP chi 60k", { date: 1791300001234 })).luc, 1791300001234)
})
