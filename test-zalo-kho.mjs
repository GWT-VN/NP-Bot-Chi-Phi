// Test kho tin Zalo (offline) — chạy: node test-zalo-kho.mjs. Spec 2026-10-07 §Thiết kế.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { taoKho } from "./zalo/kho.mjs";
import { taoSo } from "./so-core.mjs";

const NHOM = "g123abc";
let t0 = 1791300000000;
const nguoi = { id: "u1", display_name: "Quỳnh Mai", is_bot: false };
const cn = (text, o = {}) => ({ event_name: "message.text.received", message: { message_id: `z${++t0}`, date: t0,
  chat: { id: NHOM, chat_type: "GROUP" }, from: nguoi, text, ...o } });
const anh = (caption, o = {}) => ({ event_name: "message.image.received", message: { message_id: `z${++t0}`, date: t0,
  chat: { id: NHOM, chat_type: "GROUP" }, from: nguoi, photo_url: "https://zalo/anh.jpg", caption, message_type: "CHAT_PHOTO", ...o } });
const kho = () => taoKho({ tenBot: "Bot GWT CP" });

test("tin chữ: bỏ @Bot, id số tăng theo thời gian, #N tăng theo nhóm, tác giả", () => {
  const k = kho(), a = k.nhan(cn("@Bot GWT CP chi 50k ship test")), b = k.nhan(cn("180k @Bot GWT CP"))
  assert.equal(a.content, "chi 50k ship test"); assert.equal(b.content, "180k")
  assert.match(a.id, /^\d{16}$/); assert.ok(BigInt(b.id) > BigInt(a.id))
  assert.deepEqual([a.ma, b.ma], [1, 2]); assert.equal(a.author.global_name, "Quỳnh Mai"); assert.equal(a.attachments.length, 0)
})

test("[@ lạ] tên bot khác hoa thường / có NBSP vẫn bị bỏ khỏi nội dung", () => {
  const k = kho()
  assert.equal(k.nhan(cn("@bot gwt cp chi 50k")).content, "chi 50k")
  assert.equal(k.nhan(cn("@Bot GWT CP chi 60k")).content, "chi 60k")
})

test("tin ảnh: photo_url thành attachments ảnh, chú thích thành nội dung", () => {
  const m = kho().nhan(anh("@Bot GWT CP chi 180k nước"))
  assert.equal(m.content, "chi 180k nước")
  assert.deepEqual(m.attachments, [{ url: "https://zalo/anh.jpg", content_type: "image/jpeg", filename: `anh-${m.id}.jpg` }])
})

test("cùng message_id Zalo gửi lại → bỏ (không nhân đôi)", () => {
  const k = kho(), u = cn("@Bot GWT CP chi 50k")
  assert.ok(k.nhan(u)); assert.equal(k.nhan(u), null); assert.equal(k.nhan({ event_name: "x" }), null)
})

test("trả lời suy ra: 1 khoản đang hỏi + tin chữ → trỏ câu hỏi cuối của bot về khoản đó", async () => {
  const k = kho(), g = k.nhan(anh("@Bot GWT CP thanh toán hộp bóng"))
  const h = k.ghiBot({ chat_id: NHOM, zalo_id: "b1", date: t0 + 1, text: "chi từ quỹ nào?", hoi_ve: g.id }); await k.react(NHOM, g.id, "❓")
  t0 += 5
  assert.equal(k.nhan(cn("@Bot GWT CP đúng, quỹ tiền mặt")).message_reference.message_id, h.id)
})

test("trả lời suy ra: 2 khoản đang hỏi mà không ghi # → KHÔNG trỏ; tin có ảnh = khoản mới, không trỏ", async () => {
  const k = kho(), g1 = k.nhan(anh("@Bot GWT CP a")), g2 = k.nhan(anh("@Bot GWT CP b"))
  await k.react(NHOM, g1.id, "❓"); await k.react(NHOM, g2.id, "❓")
  assert.equal(k.nhan(cn("@Bot GWT CP đúng")).message_reference, undefined)
  await k.unreact(NHOM, g2.id, "❓")
  assert.equal(k.nhan(anh("@Bot GWT CP khoản mới")).message_reference, undefined)
})

test("'#N' trỏ thẳng tin #N của CHÍNH người gửi (kể cả khoản đã ✅); của người khác thì không", async () => {
  const k = kho(), g = k.nhan(anh("@Bot GWT CP chi 180k"))
  await k.react(NHOM, g.id, "✅")
  assert.equal(k.nhan(cn(`@Bot GWT CP sửa #${g.ma} thành 150k`)).message_reference.message_id, g.id)
  assert.equal(k.nhan(cn(`@Bot GWT CP sửa #${g.ma}`, { from: { id: "u2", display_name: "Thuỷ" } })).message_reference, undefined)
})

test("layTin sai nhóm → null; layTinKenh lọc theo thời gian; link có #N", async () => {
  const k = kho(), a = k.nhan(cn("@Bot GWT CP a"))
  assert.equal(await k.layTin("nhomkhac", a.id), null); assert.equal((await k.layTin(NHOM, a.id)).id, a.id)
  assert.equal((await k.layTinKenh(NHOM, t0 + 1)).length, 0); assert.equal((await k.layTinKenh(NHOM, 0)).length, 1)
  assert.equal(k.link(NHOM, a.id), `Zalo #1 (tin ${a.id})`)
})

test("ghi file → mở lại kho: còn tin, dấu ✅, #N tiếp tục tăng; dòng ghi dở cuối file bị bỏ qua, tin ghi sau nó không mất", async () => {
  const f = join(mkdtempSync(join(tmpdir(), "kho-")), "kho.jsonl")
  const k1 = taoKho({ file: f, tenBot: "Bot GWT CP" }), g = k1.nhan(anh("@Bot GWT CP chi 180k"))
  await k1.react(NHOM, g.id, "✅")
  appendFileSync(f, '{"t":"tin","m":')
  const k2 = taoKho({ file: f, tenBot: "Bot GWT CP" })
  assert.equal((await k2.layTin(NHOM, g.id)).reactions[0].emoji.name, "✅")
  const x = k2.nhan(cn("@Bot GWT CP x"))
  assert.equal(x.ma, 2)
  assert.ok(await taoKho({ file: f, tenBot: "Bot GWT CP" }).layTin(NHOM, x.id), "tin ghi SAU dòng hỏng vẫn đọc lại được")
})

// Ghép với so-core THẬT: quy tắc "xác nhận phải gắn đúng khoản, đúng người gửi" giữ nguyên trên dữ liệu Zalo.
test("so-core + kho: chính người gửi trả lời câu hỏi → ghi được, Ghi chú có 'Zalo #', ✅; người khác → từ chối", async () => {
  const k = kho(), g = k.nhan(anh("@Bot GWT CP thanh toán 1 hộp bóng bàn"))
  k.ghiBot({ chat_id: NHOM, zalo_id: "b1", date: t0 + 1, text: "quỹ nào?", hoi_ve: g.id }); await k.react(NHOM, g.id, "❓"); t0 += 5
  const la = k.nhan(cn("@Bot GWT CP đúng", { from: { id: "u2", display_name: "Thuỷ" } }))
  const dung = k.nhan(cn("@Bot GWT CP đúng, 160k quỹ tiền mặt"))
  const ghi = []
  const so = taoSo({ cfg: { channels: { [NHOM]: { name: "thử", tab: "Thử Zalo" } }, quy: [{ ten: "GWT - Tiền mặt", goiTat: ["tiền mặt"] }] },
    discord: k, so: { loadProcessed: async () => new Set(), commit: async (x) => ghi.push(x), timDong: async () => null },
    drive: { luuAnh: async () => "https://drive/x" } })
  const a = { chat_id: NHOM, message_id: g.id, loai: "chi", so_tien: 160000, noi_dung: "Hộp bóng bàn", hoa_don: "Không", nguon_quy: "GWT - Tiền mặt" }
  assert.equal((await so.ghiKhoan({ ...a, xac_nhan_message_id: la.id })).ok, false)
  const r = await so.ghiKhoan({ ...a, xac_nhan_message_id: dung.id })
  assert.equal(r.ok, true, r.ly_do); assert.match(ghi[0].rows[0][10], /Zalo #/)
  assert.ok((await k.layTin(NHOM, g.id)).reactions.some((x) => x.emoji.name === "✅"))
})

test("[khởi động lại] kho đọc lại từ file → tin_chua_xu_ly thấy tin mới chưa xử lý + khoản đang hỏi kèm câu trả lời", async () => {
  const f = join(mkdtempSync(join(tmpdir(), "kho-")), "kho.jsonl")
  const k1 = taoKho({ file: f, tenBot: "Bot GWT CP" })
  const hoi = k1.nhan(anh("@Bot GWT CP hộp bóng bàn"))
  k1.ghiBot({ chat_id: NHOM, zalo_id: "b9", date: t0 + 1, text: "quỹ nào?", hoi_ve: hoi.id }); await k1.react(NHOM, hoi.id, "❓"); t0 += 5
  const tl = k1.nhan(cn("@Bot GWT CP tiền mặt")), moi = k1.nhan(anh("@Bot GWT CP chi 50k taxi, tiền mặt"))
  const so = taoSo({ cfg: { channels: { [NHOM]: { name: "thử", tab: "Thử Zalo" } }, quy: [] }, now: () => t0 + 1000,
    discord: taoKho({ file: f, tenBot: "Bot GWT CP" }), so: { loadProcessed: async () => new Set() }, drive: {} })
  const r = await so.tinChuaXuLy()
  assert.deepEqual(r.moi.map((x) => x.message_id), [moi.id])
  assert.equal(r.dang_cho[0].message_id, hoi.id); assert.deepEqual(r.dang_cho[0].tra_loi.map((x) => x.message_id), [tl.id])
})

// ── Review cuối nhánh (2026-10-07) ────────────────────────────────────────────────────────────────────────────────
test("[review C1] '#N' của NGƯỜI KHÁC không được rơi xuống 'khoản duy nhất đang hỏi' của người gửi", async () => {
  const k = kho(), cuaAn = k.nhan(anh("@Bot GWT CP chi 100k", { from: { id: "uAn", display_name: "An" } }))
  const cuaBinh = k.nhan(anh("@Bot GWT CP chi 200k", { from: { id: "uBinh", display_name: "Bình" } }))
  k.ghiBot({ chat_id: NHOM, zalo_id: "b1", date: t0 + 1, text: "quỹ nào?", hoi_ve: cuaBinh.id }); await k.react(NHOM, cuaBinh.id, "❓"); t0 += 5
  const x = k.nhan(cn(`@Bot GWT CP #${cuaAn.ma} quỹ tiền mặt nhé`, { from: { id: "uBinh", display_name: "Bình" } }))
  assert.equal(x.message_reference, undefined)
})

test("[review I1] ảnh có #N giữa câu (số phòng…) = khoản mới; ảnh MỞ ĐẦU bằng #N = gửi lại ảnh cho khoản #N", async () => {
  const k = kho(), g = k.nhan(cn("@Bot GWT CP chi 180k nước"))
  assert.equal(k.nhan(anh(`@Bot GWT CP chi 300k phòng #${g.ma} khách sạn`)).message_reference, undefined)
  const lai = k.nhan(anh(`@Bot GWT CP #${g.ma} bill đây`))
  assert.equal(lai.message_reference.message_id, g.id); assert.equal(lai.message_reference.suy_ra, false)
})

test("[review I1] Reply suy ra được đánh dấu suy_ra; khoản tự mang ❓ (dù có Reply suy ra) vẫn hiện trong dang_cho sau khởi động lại", async () => {
  const f = join(mkdtempSync(join(tmpdir(), "kho-")), "kho.jsonl")
  const k1 = taoKho({ file: f, tenBot: "Bot GWT CP" })
  const g = k1.nhan(anh("@Bot GWT CP hộp bóng"))
  k1.ghiBot({ chat_id: NHOM, zalo_id: "b1", date: t0 + 1, text: "quỹ nào?", hoi_ve: g.id }); await k1.react(NHOM, g.id, "❓"); t0 += 5
  const x = k1.nhan(cn("@Bot GWT CP chi 50k gửi xe không bill"))
  assert.equal(x.message_reference.suy_ra, true)
  k1.ghiBot({ chat_id: NHOM, zalo_id: "b2", date: t0 + 1, text: "khoản #2 quỹ nào?", hoi_ve: x.id }); await k1.react(NHOM, x.id, "❓"); t0 += 5
  const so = taoSo({ cfg: { channels: { [NHOM]: { name: "thử", tab: "Thử Zalo" } }, quy: [] }, now: () => t0 + 1000,
    discord: taoKho({ file: f, tenBot: "Bot GWT CP" }), so: { loadProcessed: async () => new Set() }, drive: {} })
  const r = await so.tinChuaXuLy()
  assert.ok(r.dang_cho.some((d) => d.message_id === x.id), JSON.stringify(r))
})

test("[review I2] khoản đang hỏi quá 48 giờ không còn 'hút' tin chữ của người gửi", async () => {
  const k = kho(), g = k.nhan(anh("@Bot GWT CP hộp bóng"))
  k.ghiBot({ chat_id: NHOM, zalo_id: "b1", date: t0 + 1, text: "quỹ nào?", hoi_ve: g.id }); await k.react(NHOM, g.id, "❓")
  t0 += 49 * 3600e3
  assert.equal(k.nhan(cn("@Bot GWT CP hôm nay chi bao nhiêu?")).message_reference, undefined)
})
