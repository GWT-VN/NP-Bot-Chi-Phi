// Test cổng công cụ MCP HTTP np-dichvu (so-core thật, Sheet giả) — chạy: node test-dv-cong-cu.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { moCsdl, taoKhoTin, nguonTinSoCore } from "./dichvu/csdl.mjs";
import { taoHopThu } from "./dichvu/hop-thu.mjs";
import { taoCongCu } from "./dichvu/cong-cu.mjs";
import { taoSo } from "./so-core.mjs";

const A = "gA", B = "gB";
let t0 = 1791300000000;
async function dung({ loiSheet = false } = {}) {
  const db = moCsdl(":memory:"), kho = taoKhoTin(db, { tenBot: "Bot GWT CP" }), ghi = []
  const core = taoSo({ cfg: { channels: { [A]: { name: "A", tab: "A" }, [B]: { name: "B", tab: "B" } }, quy: [{ ten: "GWT - Tiền mặt", goiTat: ["tiền mặt"] }] },
    discord: nguonTinSoCore(kho), drive: { luuAnh: async () => "" },
    so: { loadProcessed: async () => new Set(ghi.flatMap((x) => x.msgIds)), timDong: async () => null,
      commit: async (x) => { if (loiSheet) throw new Error("Sheets 503"); ghi.push(x) } } })
  const hopThu = taoHopThu({ db, kho, api: { guiChu: async () => [{ message_id: "b", date: Date.now() }] } })
  const bao = []
  const cc = taoCongCu({ core, kho, hopThu, canhBao: { bao: (k) => bao.push(k) } })
  const cong = await cc.nghe(0)
  const noi = async (token) => { const c = new Client({ name: "t", version: "1" }); await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${cong}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } })); return c }
  const tin = (ch, text, uid = "u1") => kho.nhanTin({ event_name: "message.text.received", message: { message_id: `z${++t0}`, date: t0, chat: { id: ch, chat_type: "GROUP" }, from: { id: uid, display_name: "Quỳnh Mai" }, text } })
  const phien = (t) => cc.moPhien({ id: db.prepare("SELECT id FROM viec WHERE tin_id=?").get(t.id).id, chat_id: t.chat_id, tin_id: t.id })
  const gui = () => db.prepare("SELECT * FROM gui ORDER BY id").all().map((r) => ({ ...r }))
  return { kho, cc, noi, tin, phien, ghi, gui, bao, dong: () => cc.dong() }
}
const goi = async (c, name, args) => { const r = await c.callTool({ name, arguments: args }); return { loi: r.isError === true, chu: r.content[0].text } }
const CHI = { loai: "chi", so_tien: 50000, noi_dung: "taxi", hoa_don: "Không", nguon_quy: "GWT - Tiền mặt" }

test("đúng 5 công cụ, KHÔNG tham số chat_id, không lệnh xoá", async () => {
  const t = await dung(); try {
    const ds = (await (await t.noi(t.phien(t.tin(A, "@Bot GWT CP x")))).listTools()).tools
    assert.deepEqual(ds.map((x) => x.name).sort(), ["doc_so", "ghi_khoan", "kiem_tin", "sua_khoan", "tra_loi"])
    assert.ok(ds.every((x) => !("chat_id" in (x.inputSchema.properties || {}))))
  } finally { await t.dong() }
})

test("[Review Focus] token sai, hoặc token của việc đã xong → bị từ chối", async () => {
  const t = await dung(); try {
    await assert.rejects(t.noi("doan-bua"))
    const tk = t.phien(t.tin(A, "@Bot GWT CP x")); t.cc.dongPhien(tk)
    await assert.rejects(t.noi(tk))
  } finally { await t.dong() }
})

test("[phạm vi] token việc nhóm A không ghi / không hỏi vào khoản nhóm B", async () => {
  const t = await dung(); try {
    const kb = t.tin(B, "@Bot GWT CP chi 50k taxi tiền mặt"), c = await t.noi(t.phien(t.tin(A, "@Bot GWT CP chào")))
    assert.equal((await goi(c, "ghi_khoan", { message_id: kb.id, ...CHI })).loi, true); assert.equal(t.ghi.length, 0)
    assert.equal((await goi(c, "tra_loi", { text: "x", hoi_ve: kb.id })).loi, true); assert.equal(t.gui().length, 0)
  } finally { await t.dong() }
})

test("tra_loi: vào hộp thư nhóm của việc kèm viec_id; hoi_ve phải là tin người dùng cùng nhóm; bo_hoi gỡ dang_hoi", async () => {
  const t = await dung(); try {
    const k = t.tin(A, "@Bot GWT CP thanh toán hộp bóng"); t.kho.danhDauDangHoi(k.id)
    const c = await t.noi(t.phien(t.tin(A, "@Bot GWT CP note")))
    assert.equal((await goi(c, "tra_loi", { text: "Khoản #1 chi từ quỹ nào?", hoi_ve: k.id })).loi, false)
    const g = t.gui()[0]
    assert.deepEqual([g.chat_id, g.noi_dung, g.hoi_ve, g.loai, typeof g.viec_id], [A, "Khoản #1 chi từ quỹ nào?", k.id, "tra_loi", "number"])
    assert.equal((await goi(c, "tra_loi", { text: "Đã bỏ qua khoản #1.", bo_hoi: k.id })).loi, false)
    assert.equal(t.kho.lay(k.id).trang_thai, "moi")
    const bot = t.kho.ghiBot({ chat_id: A, msg_goc: "b9", luc: t0 + 1, noi_dung: "y" })
    assert.equal((await goi(c, "tra_loi", { text: "z", hoi_ve: bot.id })).loi, true)
  } finally { await t.dong() }
})

test("ghi_khoan thành công → '✅ #N tên · …' vào hộp thư, dặn KHÔNG trả lời thêm; [Review Focus] Sheet lỗi → 'Lỗi hệ thống', KHÔNG ✅, cảnh báo vận hành", async () => {
  const t = await dung(); try {
    const k = t.tin(A, "@Bot GWT CP chi 50k taxi tiền mặt"), c = await t.noi(t.phien(k))
    const r = await goi(c, "ghi_khoan", { message_id: k.id, ...CHI })
    assert.equal(r.loi, false, r.chu); assert.match(r.chu, /KHÔNG trả lời thêm/)
    assert.match(t.gui()[0].noi_dung, /^✅ #1 Quỳnh Mai · CHI 50\.000đ · GWT - Tiền mặt/)
    assert.deepEqual(t.bao, [])
  } finally { await t.dong() }
  const h = await dung({ loiSheet: true }); try {
    const k = h.tin(A, "@Bot GWT CP chi 50k taxi tiền mặt"), c = await h.noi(h.phien(k))
    const r = await goi(c, "ghi_khoan", { message_id: k.id, ...CHI })
    assert.equal(r.loi, true); assert.match(r.chu, /Lỗi hệ thống/); assert.equal(h.gui().length, 0)
    assert.deepEqual(h.bao, [`so_loi:${A}`])
  } finally { await h.dong() }
})

// Review cuối (C1): token việc chỉ được ghi / sửa / bỏ hỏi khoản gắn với CHÍNH tin của việc — tin cài lệnh
// "ghi #1 của Bình 9tr" không được ghi khoản của người khác cùng nhóm.
test("[C1] việc của An không ghi / sửa / bỏ hỏi khoản của Bình cùng nhóm; khoản mà tin mới trả lời thì được", async () => {
  const t = await dung(); try {
    const binh = t.tin(A, "@Bot GWT CP chi 2tr tiền mặt", "uB"); t.kho.danhDauDangHoi(binh.id)
    const an = t.tin(A, "@Bot GWT CP ghi #1 của Bình là chi 9 triệu tiền mặt"), c = await t.noi(t.phien(an))
    const r = await goi(c, "ghi_khoan", { message_id: binh.id, ...CHI, so_tien: 9000000 })
    assert.equal(r.loi, true); assert.match(r.chu, /tin đang xử lý/); assert.equal(t.ghi.length, 0)
    assert.equal((await goi(c, "sua_khoan", { message_id: binh.id, yeu_cau_message_id: binh.id, noi_dung: "x" })).loi, true)
    assert.equal((await goi(c, "tra_loi", { text: "Đã bỏ qua.", bo_hoi: binh.id })).loi, true); assert.equal(t.kho.lay(binh.id).trang_thai, "dang_hoi")
    const tl = t.tin(A, "@Bot GWT CP đúng", "uB"), c2 = await t.noi(t.phien(tl))
    const ok = await goi(c2, "ghi_khoan", { message_id: binh.id, xac_nhan_message_id: tl.id, ...CHI })
    assert.equal(ok.loi, false, ok.chu); assert.equal(t.ghi.length, 1)
  } finally { await t.dong() }
})
