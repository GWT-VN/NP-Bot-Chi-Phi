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
async function dung({ loiSheet = false, linkAnh = "", dongSo = null } = {}) {
  const capNhat = [], ct = []
  const db = moCsdl(":memory:"), kho = taoKhoTin(db, { tenBot: "Bot GWT CP" }), ghi = []
  const core = taoSo({ cfg: { channels: { [A]: { name: "A", tab: "A" }, [B]: { name: "B", tab: "B" } }, quy: [{ ten: "GWT - Tiền mặt", goiTat: ["tiền mặt"] }] },
    discord: nguonTinSoCore(kho), drive: { luuAnh: async () => linkAnh },
    so: { loadProcessed: async () => new Set(ghi.flatMap((x) => x.msgIds)), timDong: async () => dongSo, capNhat: async (...x) => { capNhat.push(x) },
      commit: async (x) => { if (loiSheet) throw new Error("Sheets 503"); ghi.push(x) } } })
  const hopThu = taoHopThu({ db, kho, api: { guiChu: async () => [{ message_id: "b", date: Date.now() }] } })
  const bao = []
  const cc = taoCongCu({ core, kho, hopThu, canhBao: { bao: (k) => bao.push(k) },
    chungTu: { them: (x) => { ct.push(x); return true }, capNhat: (...x) => { ct.push(["sua", ...x]) } } })
  const cong = await cc.nghe(0)
  const noi = async (token) => { const c = new Client({ name: "t", version: "1" }); await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${cong}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } })); return c }
  const tin = (ch, text, uid = "u1") => kho.nhanTin({ event_name: "message.text.received", message: { message_id: `z${++t0}`, date: t0, chat: { id: ch, chat_type: "GROUP" }, from: { id: uid, display_name: "Quỳnh Mai" }, text } })
  const anh = (ch, caption) => { const x = kho.nhanTin({ event_name: "message.image.received", message: { message_id: `z${++t0}`, date: t0,
    chat: { id: ch, chat_type: "GROUP" }, from: { id: "u1", display_name: "Quỳnh Mai" }, photo_url: "https://zalo/a.jpg", caption } })
    kho.datAnh(x.id, { tep: "/x/a.jpg", tt: "da_tai" }); return kho.lay(x.id) }
  const phien = (t) => cc.moPhien({ id: db.prepare("SELECT id FROM viec WHERE tin_id=?").get(t.id).id, chat_id: t.chat_id, tin_id: t.id })
  const gui = () => db.prepare("SELECT * FROM gui ORDER BY id").all().map((r) => ({ ...r }))
  return { kho, cc, noi, tin, anh, phien, ghi, gui, bao, ct, capNhat, dong: () => cc.dong() }
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
    assert.match(t.gui()[0].noi_dung, /^✅ #1 Quỳnh Mai · \d{2}\/\d{2} · CHI 50\.000đ · GWT - Tiền mặt/)
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

// Chủ dự án 2026-10-08 (spec np-chung-tu): ✅ kèm ngày + link thư mục chứng từ; khoản không ảnh vẫn ghi, bot theo dõi để nhắc.
test("ghi_khoan → ✅ có ngày + link thư mục: chưa có ảnh → 'Chưa có chứng từ, tải vào'; có ảnh → 'Thêm chứng từ'; theo dõi chứng từ; không link → không dòng 📎", async () => {
  const L = "https://drive.google.com/drive/folders/F1"
  const t = await dung({ linkAnh: L }); try {
    const k = t.tin(A, "@Bot GWT CP chi 50k taxi tiền mặt"), c = await t.noi(t.phien(k))
    assert.equal((await goi(c, "ghi_khoan", { message_id: k.id, ...CHI })).loi, false)
    assert.match(t.gui()[0].noi_dung, /^✅ #1 Quỳnh Mai · \d{2}\/\d{2} · CHI 50\.000đ[^\n]*\n📎 Chưa có chứng từ, tải vào: https:\/\/drive\.google\.com\/drive\/folders\/F1$/)
    assert.deepEqual([t.ct[0].tin.id, t.ct[0].co_anh, t.ct[0].link, t.ct[0].so_tien], [k.id, false, L, 50000])
    const h = t.anh(A, "@Bot GWT CP chi 60k nước tiền mặt"), c2 = await t.noi(t.phien(h))
    assert.equal((await goi(c2, "ghi_khoan", { message_id: h.id, ...CHI, so_tien: 60000 })).loi, false)
    assert.match(t.gui()[1].noi_dung, /\n📎 Thêm chứng từ: https:\/\/drive\.google\.com\/drive\/folders\/F1$/); assert.equal(t.ct[1].co_anh, true)
  } finally { await t.dong() }
  const k2 = await dung(); try {
    const k = k2.tin(A, "@Bot GWT CP chi 50k taxi tiền mặt"), c = await k2.noi(k2.phien(k))
    await goi(c, "ghi_khoan", { message_id: k.id, ...CHI }); assert.doesNotMatch(k2.gui()[0].noi_dung, /📎/); assert.deepEqual(k2.ct, [])
  } finally { await k2.dong() }
})

test("sua_khoan nhận ngay ('sửa #1 ngày 6/10') → sổ đổi ngày dd/mm/yyyy; khoản đang theo dõi chứng từ cập nhật theo", async () => {
  const t = await dung({ dongSo: 7 }); try {
    const k = t.tin(A, "@Bot GWT CP chi 50k taxi tiền mặt"), y = t.tin(A, "@Bot GWT CP sửa #1 ngày 6/10"), c = await t.noi(t.phien(y))
    const r = await goi(c, "sua_khoan", { message_id: k.id, yeu_cau_message_id: y.id, ngay: "6/10/2026" })
    assert.equal(r.loi, false, r.chu); assert.equal(t.capNhat[0][1].ngay, "06/10/2026")
    assert.deepEqual(t.ct.at(-1), ["sua", k.id, { loai: null, so_tien: null, ngay: "6/10/2026" }])
    assert.match(t.gui().at(-1).noi_dung, /^✏️ Đã sửa #1/)
  } finally { await t.dong() }
})
