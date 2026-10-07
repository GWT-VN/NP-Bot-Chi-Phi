// Test server npzalo (Zalo + lõi giả, kho thật không ghi file) — chạy: node test-zalo-server.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { taoServerZalo } from "./mcp/npzalo.mjs";
import { taoKho } from "./zalo/kho.mjs";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const NHOM = "g123abc";
let t0 = 1791300000000;
const cap = (o = {}) => ({ event_name: "message.image.received", message: { message_id: `z${++t0}`, date: t0, chat: { id: NHOM, chat_type: "GROUP" },
  from: { id: "u1", display_name: "Quỳnh Mai" }, photo_url: "https://zalo/anh.jpg", caption: "@Bot GWT CP chi 180k nước", ...o } });
const chu = (text, o = {}) => ({ event_name: "message.text.received", message: { message_id: `z${++t0}`, date: t0, chat: { id: NHOM, chat_type: "GROUP" },
  from: { id: "u1", display_name: "Quỳnh Mai" }, text, ...o } });

async function dung({ core = {}, taiFn, guiLoi = false } = {}) {
  const gui = [], bo = [], tb = []
  const kho = taoKho({ tenBot: "Bot GWT CP" })
  const api = { guiChu: async (chat_id, text) => { if (guiLoi) throw new Error("Zalo sendMessage lỗi 500"); gui.push({ chat_id, text }); return [{ message_id: `b${gui.length}`, date: ++t0 }] } }
  const inbox = mkdtempSync(join(tmpdir(), "inbox-"))
  const { s, nhanCapNhat } = taoServerZalo({ core, kho, api, cfg: { channels: { [NHOM]: { name: "thử", tab: "Thử Zalo" } } }, inbox, taiFn, nhatKy: (d) => bo.push(d) })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await s.connect(a)
  const c = new Client({ name: "t", version: "1" })
  c.setNotificationHandler(z.object({ method: z.literal("notifications/claude/channel"), params: z.any() }), (n) => { tb.push(n.params) })
  await c.connect(b)
  const tinDau = async () => (await kho.layTinKenh(NHOM, 0)).filter((m) => !m.author.bot).sort((x, y) => (BigInt(x.id) < BigInt(y.id) ? -1 : 1))
  return { c, kho, gui, bo, tb, nhanCapNhat, inbox, tinDau }
}
const cho = () => new Promise((r) => setTimeout(r, 20))
const goi = (c, name, args) => c.callTool({ name, arguments: args })

test("công cụ: tra_loi, tai_anh + 5 lệnh sổ; không có lệnh xoá hay gửi tin riêng", async () => {
  const { c } = await dung()
  assert.deepEqual((await c.listTools()).tools.map((t) => t.name).sort(),
    ["doc_so", "ghi_khoan", "kiem_tin", "sua_khoan", "tai_anh", "tin_chua_xu_ly", "tra_loi"])
})

test("tin nhóm đã khai → vào kho + đẩy vào phiên: chat_id, message_id, #N, tác giả, có ảnh, tên nhóm", async () => {
  const t = await dung(); await t.nhanCapNhat(cap()); await cho()
  const [m] = await t.tinDau()
  assert.equal(t.tb.length, 1); assert.equal(t.tb[0].content, "chi 180k nước")
  assert.deepEqual(t.tb[0].meta, { chat_id: NHOM, message_id: m.id, ma: "1", tac_gia: "Quỳnh Mai", nguoi_id: "u1", co_anh: "1", nhom: "thử" })
})

test("[gác] tin riêng, nhóm chưa khai, sự kiện lạ → KHÔNG vào phiên, chỉ ghi nhật ký (nhóm lạ kèm chat_id để khai)", async () => {
  const t = await dung()
  await t.nhanCapNhat(cap({ chat: { id: "u1", chat_type: "PRIVATE" } }))
  await t.nhanCapNhat(cap({ chat: { id: "khac999", chat_type: "GROUP" } }))
  await t.nhanCapNhat({ event_name: "message.sticker.received", message: { message_id: "x", chat: { id: NHOM, chat_type: "GROUP" } } })
  await cho()
  assert.equal(t.tb.length, 0); assert.equal(t.bo.length, 3)
  assert.equal(t.bo[1].bo, "nhóm chưa khai"); assert.equal(t.bo[1].chat_id, "khac999")
  assert.equal((await t.kho.layTinKenh("khac999", 0)).length, 0)
})

test("tra_loi: nhóm lạ → từ chối, không gửi; hỏi về khoản → gửi, lưu câu hỏi trỏ khoản, đánh dấu ❓", async () => {
  const t = await dung(); await t.nhanCapNhat(cap())
  const [m] = await t.tinDau()
  const r1 = await goi(t.c, "tra_loi", { chat_id: "khac999", text: "x" })
  assert.equal(r1.isError, true); assert.equal(t.gui.length, 0)
  const r2 = await goi(t.c, "tra_loi", { chat_id: NHOM, text: "Khoản #1 chi từ quỹ nào?", hoi_ve: m.id })
  assert.notEqual(r2.isError, true); assert.equal(t.gui[0].text, "Khoản #1 chi từ quỹ nào?")
  assert.ok(m.reactions.some((x) => x.emoji.name === "❓"))
  const hoi = (await t.kho.layTinKenh(NHOM, 0)).find((x) => x.author.bot)
  assert.equal(hoi.message_reference.message_id, m.id)
  assert.equal((await goi(t.c, "tra_loi", { chat_id: NHOM, text: "x", hoi_ve: hoi.id })).isError, true) // hoi_ve phải là tin người dùng
})

test("tin trả lời (đúng 1 khoản đang hỏi) → meta có tra_loi_khoan / tra_loi_ma của khoản gốc", async () => {
  const t = await dung(); await t.nhanCapNhat(cap())
  const [m] = await t.tinDau()
  await goi(t.c, "tra_loi", { chat_id: NHOM, text: "quỹ nào?", hoi_ve: m.id })
  await t.nhanCapNhat(chu("@Bot GWT CP đúng, tiền mặt")); await cho()
  assert.equal(t.tb[1].meta.tra_loi_khoan, m.id); assert.equal(t.tb[1].meta.tra_loi_ma, "1"); assert.equal(t.tb[1].meta.tra_loi_kieu, "suy_ra")
})

test("ghi_khoan thành công → server tự báo '✅ #N tên · …' trong nhóm; thất bại → không báo", async () => {
  let kq = { ok: true, da_ghi: "CHI 180.000đ · GWT - Tiền mặt · HĐ Không · nước khách", canh_bao: [] }
  const t = await dung({ core: { ghiKhoan: async () => kq } }); await t.nhanCapNhat(cap())
  const [m] = await t.tinDau()
  const a = { chat_id: NHOM, message_id: m.id, loai: "chi", so_tien: 180000, noi_dung: "nước khách", hoa_don: "Không", nguon_quy: "GWT - Tiền mặt" }
  const r = await goi(t.c, "ghi_khoan", a)
  assert.notEqual(r.isError, true); assert.match(r.content[0].text, /KHÔNG trả lời thêm/)
  assert.equal(t.gui.at(-1).text, "✅ #1 Quỳnh Mai · CHI 180.000đ · GWT - Tiền mặt · HĐ Không · nước khách")
  kq = { ok: false, ly_do: "thiếu quỹ" }; const n = t.gui.length
  assert.equal((await goi(t.c, "ghi_khoan", a)).isError, true); assert.equal(t.gui.length, n)
})

test("[báo nhóm lỗi] ghi sổ xong mà gửi Zalo lỗi → kết quả vẫn ok + cảnh báo để Claude tự báo", async () => {
  const t = await dung({ guiLoi: true, core: { ghiKhoan: async () => ({ ok: true, da_ghi: "CHI 1.000đ · x", canh_bao: [] }) } })
  await t.nhanCapNhat(cap()); const [m] = await t.tinDau()
  const r = await goi(t.c, "ghi_khoan", { chat_id: NHOM, message_id: m.id, loai: "chi", so_tien: 1000, noi_dung: "x", hoa_don: "Không" })
  assert.notEqual(r.isError, true); assert.match(r.content[0].text, /chưa báo được trong nhóm/)
})

test("sua_khoan thành công → '✏️ Đã sửa #N'", async () => {
  const t = await dung({ core: { suaKhoan: async () => ({ ok: true, dong: 5 }) } }); await t.nhanCapNhat(cap())
  const [m] = await t.tinDau(); await t.nhanCapNhat(chu("@Bot GWT CP sửa #1 thành 150k"))
  const [, y] = await t.tinDau()
  await goi(t.c, "sua_khoan", { chat_id: NHOM, message_id: m.id, yeu_cau_message_id: y.id, so_tien: 150000, loai: "chi" })
  assert.equal(t.gui.at(-1).text, "✏️ Đã sửa #1 theo yêu cầu của Quỳnh Mai")
})

test("tai_anh: tải ảnh về inbox, trả đường dẫn; tin không ảnh → từ chối; ảnh 403 → nhờ gửi lại", async () => {
  let status = 200
  const t = await dung({ taiFn: async () => ({ ok: status === 200, status, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }) })
  await t.nhanCapNhat(cap()); await t.nhanCapNhat(chu("@Bot GWT CP hỏi"))
  const [m1, m2] = await t.tinDau()
  const r = await goi(t.c, "tai_anh", { chat_id: NHOM, message_id: m1.id })
  const p = JSON.parse(r.content[0].text).duong_dan
  assert.ok(p.startsWith(t.inbox)); assert.deepEqual([...readFileSync(p)], [1, 2, 3])
  assert.equal((await goi(t.c, "tai_anh", { chat_id: NHOM, message_id: m2.id })).isError, true)
  status = 403
  const r3 = await goi(t.c, "tai_anh", { chat_id: NHOM, message_id: m1.id })
  assert.equal(r3.isError, true); assert.match(r3.content[0].text, /gửi lại ảnh/)
})

// ── Review cuối nhánh (2026-10-07) ────────────────────────────────────────────────────────────────────────────────
test("[review I2] tra_loi bo_hoi gỡ ❓ của khoản Claude đã chốt không ghi (ghi chú / người gửi huỷ); bo_hoi vào tin bot → từ chối", async () => {
  const t = await dung(); await t.nhanCapNhat(cap())
  const [m] = await t.tinDau()
  await goi(t.c, "tra_loi", { chat_id: NHOM, text: "quỹ nào?", hoi_ve: m.id })
  assert.ok(m.reactions.some((x) => x.emoji.name === "❓"))
  const r = await goi(t.c, "tra_loi", { chat_id: NHOM, text: "Đã bỏ qua khoản #1, không ghi sổ.", bo_hoi: m.id })
  assert.notEqual(r.isError, true, r.content[0].text); assert.ok(!m.reactions.some((x) => x.emoji.name === "❓"))
  const hoi = (await t.kho.layTinKenh(NHOM, 0)).find((x) => x.author.bot)
  assert.equal((await goi(t.c, "tra_loi", { chat_id: NHOM, text: "x", bo_hoi: hoi.id })).isError, true)
})

test("[review M1→I / Focus 1] tai_anh: lỗi mạng hay trang HTML thay ảnh → nhờ gửi lại ảnh, không 'Lỗi hệ thống'", async () => {
  let kieu = "mang"
  const t = await dung({ taiFn: async () => {
    if (kieu === "mang") throw new TypeError("fetch failed")
    return { ok: true, status: 200, headers: { get: () => "text/html; charset=utf-8" }, arrayBuffer: async () => new Uint8Array([60, 104]).buffer }
  } })
  await t.nhanCapNhat(cap()); const [m] = await t.tinDau()
  for (const k of ["mang", "html"]) {
    kieu = k
    const r = await goi(t.c, "tai_anh", { chat_id: NHOM, message_id: m.id })
    assert.equal(r.isError, true, k); assert.match(r.content[0].text, /gửi lại ảnh/, k); assert.doesNotMatch(r.content[0].text, /Lỗi hệ thống/, k)
  }
})

test("[review I3] npzalo thoát khi stdin đóng — không để poller mồ côi giành tin của phiên mới", async () => {
  const d = mkdtempSync(join(tmpdir(), "npz-"))
  writeFileSync(join(d, ".env"), "ZALO_BOT_TOKEN=000:gia\n")
  const p = spawn(process.execPath, ["mcp/npzalo.mjs"], { env: { ...process.env, ZALO_STATE_DIR: d, ZALO_API_GOC: "http://127.0.0.1:9" }, stdio: ["pipe", "pipe", "pipe"] })
  await new Promise((r) => setTimeout(r, 1500))
  const thoat = new Promise((r) => p.on("exit", () => r(true)))
  p.stdin.end()
  const kq = await Promise.race([thoat, new Promise((r) => setTimeout(() => r(false), 3000))])
  if (!kq) p.kill("SIGKILL")
  assert.equal(kq, true, "tiến trình phải tự thoát trong 3s sau khi stdin đóng")
})
