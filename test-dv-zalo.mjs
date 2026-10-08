// Test adapter Zalo np-dichvu — chạy: node test-dv-zalo.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { moCsdl, taoKhoTin } from "./dichvu/csdl.mjs";
import { taoAdapterZalo, xuLyLo } from "./dichvu/zalo.mjs";

const NHOM = "g1", OPS = "ops";
let t0 = 1791300000000;
const cap = (o = {}, m = {}) => ({ event_name: "message.image.received", ...o, message: { message_id: `z${++t0}`, date: t0,
  chat: { id: NHOM, chat_type: "GROUP" }, from: { id: "u1", display_name: "Quỳnh Mai" }, photo_url: "https://zalo/anh.jpg", caption: "@Bot GWT CP chi 180k", ...m } });
const traAnh = (status = 200, loai = "image/jpeg") => async () => ({ ok: status === 200, status, headers: { get: () => loai }, arrayBuffer: async () => new Uint8Array([255, 216, 255]).buffer });
function dung(taiFn = traAnh()) {
  const db = moCsdl(":memory:"), kho = taoKhoTin(db, { tenBot: "Bot GWT CP" }), nk = []
  const thuMucAnh = mkdtempSync(join(tmpdir(), "anh-"))
  const z = taoAdapterZalo({ db, kho, nhom: { [NHOM]: { name: "đoàn", tab: "Đoàn" } }, nhomVanHanh: OPS, thuMucAnh, taiFn, nhatKy: (d) => nk.push(d), now: () => 1791400000000 })
  return { db, kho, z, nk, thuMucAnh, soViec: () => db.prepare("SELECT COUNT(*) AS n FROM viec").get().n }
}

test("[gác] sự kiện lạ, tin riêng, [Review Focus] nhóm vận hành → bỏ + nhật ký; nhóm chưa khai → mốc nhom_la để lấy chat_id", async () => {
  const t = dung()
  await t.z.nhan(cap({ event_name: "message.sticker.received" }))
  await t.z.nhan(cap({}, { chat: { id: "u1", chat_type: "PRIVATE" } }))
  await t.z.nhan(cap({}, { chat: { id: OPS, chat_type: "GROUP" } }))
  await t.z.nhan(cap({}, { chat: { id: "la9", chat_type: "GROUP" }, caption: "@Bot GWT CP thử nhóm mới" }))
  assert.equal(t.soViec(), 0)
  assert.deepEqual(t.nk.map((d) => d.bo), ["message.sticker.received", "tin_rieng", "nhom_van_hanh", "nhom_chua_khai"])
  assert.deepEqual(JSON.parse(t.db.prepare("SELECT ghi_chu FROM moc WHERE khoa='nhom_la:la9'").get().ghi_chu), { nguoi: "Quỳnh Mai", vi_du: "@Bot GWT CP thử nhóm mới" })
})

test("tin nhóm đã khai: lưu + tạo việc; tải ảnh về máy → da_tai, tệp đúng nội dung", async () => {
  const t = dung(); await t.z.nhan(cap())
  const r = { ...t.db.prepare("SELECT * FROM tin").get() }
  assert.equal(r.anh_tt, "da_tai"); assert.equal(r.anh_tep, join(t.thuMucAnh, `${r.id}.jpg`))
  assert.deepEqual([...readFileSync(r.anh_tep)], [255, 216, 255]); assert.equal(t.soViec(), 1)
})

test("[Focus 1] ảnh lỗi: HTTP 403, trang HTML, lỗi mạng → anh_tt 'loi:…'; việc vẫn tạo để Claude nhờ gửi lại", async () => {
  for (const [taiFn, mau] of [[traAnh(403), /^loi:HTTP 403$/], [traAnh(200, "text/html; charset=utf-8"), /^loi:.*text\/html/],
    [async () => { throw new TypeError("fetch failed") }, /^loi:lỗi mạng$/]]) {
    const t = dung(taiFn); await t.z.nhan(cap())
    const r = { ...t.db.prepare("SELECT * FROM tin").get() }
    assert.match(r.anh_tt, mau); assert.equal(r.anh_tep, null); assert.equal(t.soViec(), 1)
  }
})

test("taiAnhConDo: tin còn 'cho_tai' (dịch vụ chết giữa lúc tải) được tải khi khởi động", async () => {
  const t = dung()
  t.kho.nhanTin(cap(), { now: 1791400000000 })
  assert.equal(t.kho.tinChoTaiAnh().length, 1)
  await t.z.taiAnhConDo()
  assert.equal(t.kho.tinChoTaiAnh().length, 0)
})

test("xuLyLo: một cập nhật lỗi không làm mất các cập nhật còn lại", async () => {
  const da = [], nk = []
  await xuLyLo([1, 2, 3], async (u) => { if (u === 2) throw new Error("hỏng ghi"); da.push(u) }, (d) => nk.push(d))
  assert.deepEqual(da, [1, 3]); assert.match(nk[0].loi, /hỏng ghi/)
})

// Review cuối (M1, nâng Important theo tác động): Zalo mà trả lại tin của chính bot (câu hỏi có chữ "@Bot GWT CP") thì mỗi tin
// bot thành một việc → bot trả lời bot, vòng lặp spam trong nhóm. Bỏ tin from.is_bot.
test("[M1] tin do bot gửi (from.is_bot) → bỏ + nhật ký, không thành việc", async () => {
  const t = dung()
  await t.z.nhan(cap({ event_name: "message.text.received" }, { from: { id: "bot1", display_name: "Bot GWT CP", is_bot: true }, text: "Khoản #1 quỹ nào? (trả lời bắt đầu bằng @Bot GWT CP)" }))
  assert.equal(t.soViec(), 0); assert.deepEqual(t.nk.map((d) => d.bo), ["tin_bot"])
})
