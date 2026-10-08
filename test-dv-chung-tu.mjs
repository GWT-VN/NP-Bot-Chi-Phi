// Test chứng từ theo khoản (Drive giả) — chạy: node test-dv-chung-tu.mjs. Spec 2026-10-08-np-chung-tu.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { moCsdl, taoKhoTin } from "./dichvu/csdl.mjs";
import { taoHopThu } from "./dichvu/hop-thu.mjs";
import { taoChungTu, idThuMuc } from "./dichvu/chung-tu.mjs";

const G = "g1";
let t0 = 1791300000000;
const cn = (text, o = {}) => ({ event_name: "message.text.received", message: { message_id: `z${++t0}`, date: t0,
  chat: { id: G, chat_type: "GROUP" }, from: { id: "u1", display_name: "Dũng" }, text, ...o } });
function dung({ coFile = async () => false, gio = "2026-10-10T19:00:00+07:00", boSung } = {}) {
  const db = moCsdl(":memory:"), kho = taoKhoTin(db, { tenBot: "Bot GWT CP" })
  let luc = Date.parse(gio)
  const hopThu = taoHopThu({ db, kho, api: { guiChu: async () => [{ message_id: "b", date: luc }] }, now: () => luc })
  const sua = [], nk = []
  const core = { boSungChungTu: boSung ?? (async (a) => { sua.push(a); return { ok: true, dong: 7 } }) }
  const ct = taoChungTu({ db, hopThu, core, coFile, nhom: { [G]: { name: "đoàn" } }, gioNhac: "20:00", now: () => luc, nhatKy: (d) => nk.push(d) })
  const khoan = (text, o = {}, them = {}) => {
    const tin = kho.nhanTin(cn(text, o), { now: luc })
    ct.them({ tin, loai: "chi", so_tien: 50000, ngay: "07/10/2026", link: `https://drive.google.com/drive/folders/F${tin.ma}`, co_anh: false, ...them })
    return tin
  }
  const gui = () => db.prepare("SELECT chat_id, noi_dung, loai FROM gui ORDER BY id").all().map((r) => ({ ...r }))
  return { db, kho, ct, khoan, gui, sua, nk, troi: (ms) => { luc += ms }, datGio: (s) => { luc = Date.parse(s) } }
}

test("CSDL cũ (phiên bản 1) mở lại → tự nâng lên 2, có bảng chung_tu, dữ liệu cũ còn", () => {
  const f = join(mkdtempSync(join(tmpdir(), "ct-")), "np.sqlite")
  const db1 = moCsdl(f), a = taoKhoTin(db1, { tenBot: "Bot GWT CP" }).nhanTin(cn("@Bot GWT CP chi 50k"))
  db1.exec("DROP TABLE chung_tu; UPDATE phien_ban SET so = 1"); db1.close()
  const db2 = moCsdl(f)
  assert.equal(db2.prepare("SELECT so FROM phien_ban").get().so, 2)
  assert.equal(taoKhoTin(db2).lay(a.id).noi_dung, "chi 50k")
  assert.equal(db2.prepare("SELECT COUNT(*) AS n FROM chung_tu").get().n, 0)
})

test("idThuMuc: lấy id từ link thư mục Drive; link lạ → null", () => {
  assert.equal(idThuMuc("https://drive.google.com/drive/folders/1AbC-_x"), "1AbC-_x"); assert.equal(idThuMuc("https://drive/x"), null)
})

test("[Review Focus] them: theo dõi khoản có link; có ảnh lúc ghi → đã đủ; không link → không theo dõi; ghi lại cùng khoản → không trùng", () => {
  const t = dung()
  const a = t.khoan("@Bot GWT CP chi 50k taxi"); t.khoan("@Bot GWT CP chi 60k nước", {}, { co_anh: true })
  t.ct.them({ tin: a, loai: "chi", so_tien: 50000, link: "https://drive.google.com/drive/folders/F1", co_anh: false })
  const kl = t.kho.nhanTin(cn("@Bot GWT CP chi 70k"), { now: 0 })
  assert.equal(t.ct.them({ tin: kl, loai: "chi", so_tien: 70000, link: "", co_anh: false }), false)
  assert.equal(t.ct.soThieu(), 1)
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM chung_tu").get().n, 2)
})

test("capNhat: sửa số tiền / loại / ngày của khoản đang theo dõi; bỏ trống thì giữ", () => {
  const t = dung(), a = t.khoan("@Bot GWT CP chi 50k")
  t.ct.capNhat(a.id, { so_tien: 90000 }); t.ct.capNhat(a.id, { ngay: "06/10/2026" })
  assert.deepEqual({ ...t.db.prepare("SELECT loai, so_tien, ngay FROM chung_tu WHERE tin_id=?").get(a.id) }, { loai: "chi", so_tien: 90000, ngay: "06/10/2026" })
})

test("[Review Focus] quét: thư mục trống → vẫn thiếu; có file → đủ + sửa ghi chú sổ (ngày bổ sung dd/mm); Drive lỗi → bỏ qua, không vỡ", async () => {
  const co = new Set(["F2"])
  const t = dung({ coFile: async (id) => { if (id === "F3") throw new Error("Drive 500"); return co.has(id) } })
  t.khoan("@Bot GWT CP chi 50k a"); const b = t.khoan("@Bot GWT CP chi 50k b"); t.khoan("@Bot GWT CP chi 50k c")
  assert.equal(await t.ct.quet(), 1)
  assert.equal(t.ct.soThieu(), 2)
  assert.deepEqual(t.sua, [{ chat_id: G, message_id: b.id, ngay: "10/10" }])
  assert.match(t.nk.find((d) => d.loi_drive).loi_drive, /Drive 500/)
})

test("[Review Focus] quét: sửa sổ lỗi / không thấy dòng → vẫn thôi nhắc (đã có file), chỉ ghi nhật ký", async () => {
  const t = dung({ coFile: async () => true, boSung: async () => { throw new Error("Sheets 503") } })
  t.khoan("@Bot GWT CP chi 50k a")
  assert.equal(await t.ct.quet(), 1); assert.equal(t.ct.soThieu(), 0); assert.match(t.nk[0].loi_so, /Sheets 503/)
  const h = dung({ coFile: async () => true, boSung: async () => ({ ok: false, ly_do: "không thấy dòng" }) })
  h.khoan("@Bot GWT CP chi 50k b")
  assert.equal(await h.ct.quet(), 1); assert.equal(h.ct.soThieu(), 0); assert.equal(h.nk[0].so, "không thấy dòng")
})

test("nhắc tối: trước 20:00 → không; từ 20:00 → MỘT tin/nhóm (#N tên số tiền link, quá 3 ngày đánh dấu); cùng ngày → không lặp; hôm sau → lại; nhóm chưa khai → không", () => {
  const t = dung({ gio: "2026-10-06T10:00:00+07:00" })
  t.khoan("@Bot GWT CP chi 50k cũ")
  t.datGio("2026-10-10T09:00:00+07:00"); t.khoan("@Bot GWT CP chi 120k mới", {}, { so_tien: 120000 })
  t.khoan("@Bot GWT CP chi 50k nhóm lạ", { chat: { id: "g9", chat_type: "GROUP" } })
  t.datGio("2026-10-10T19:59:00+07:00"); assert.equal(t.ct.nhacToi(), 0)
  t.datGio("2026-10-10T20:05:00+07:00"); assert.equal(t.ct.nhacToi(), 1)
  assert.deepEqual(t.gui(), [{ chat_id: G, loai: "nhac_ct", noi_dung: "📎 Còn thiếu chứng từ (2):\n"
    + "#1 Dũng 50.000đ (quá 3 ngày) https://drive.google.com/drive/folders/F1\n#2 Dũng 120.000đ https://drive.google.com/drive/folders/F2" }])
  t.troi(600e3); assert.equal(t.ct.nhacToi(), 0)
  t.datGio("2026-10-11T20:01:00+07:00"); assert.equal(t.ct.nhacToi(), 1)
})

test("nhắc tối: không còn khoản thiếu → không gửi gì", () => {
  const t = dung({ gio: "2026-10-10T20:30:00+07:00" }); t.khoan("@Bot GWT CP chi 50k", {}, { co_anh: true })
  assert.equal(t.ct.nhacToi(), 0); assert.deepEqual(t.gui(), [])
})
