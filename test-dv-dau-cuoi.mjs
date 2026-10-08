// Test đầu cuối np-dichvu (offline): Zalo giả + claude giả (test/claude-gia.mjs) + sổ giả, dịch vụ thật — chạy: node test-dv-dau-cuoi.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { taoDichVu } from "./dichvu/chinh.mjs";
import { taoSo } from "./so-core.mjs";
import { moCsdl } from "./dichvu/csdl.mjs";

const NHOM = "g1", OPS = "ops1", CLAUDE_GIA = fileURLToPath(new URL("./test/claude-gia.mjs", import.meta.url));
let t0 = 1791300000000;
const nguoi = { id: "u1", display_name: "Quỳnh Mai" };
const anh = (caption) => ({ event_name: "message.image.received", message: { message_id: `z${++t0}`, date: t0, chat: { id: NHOM, chat_type: "GROUP" }, from: nguoi, photo_url: "https://zalo.gia/anh.jpg", caption } });
const chu = (text, from = nguoi) => ({ event_name: "message.text.received", message: { message_id: `z${++t0}`, date: t0, chat: { id: NHOM, chat_type: "GROUP" }, from, text } });
async function cho(dk, ms = 20000) { const het = Date.now() + ms; while (Date.now() < het) { if (await dk()) return; await new Promise((r) => setTimeout(r, 50)) } throw new Error(`quá giờ chờ: ${dk}`) }

async function dung({ now = Date.now, cham = 0, coFile = async () => false } = {}) {
  const goc = mkdtempSync(join(tmpdir(), "dv-e2e-"))
  const thuMuc = { goc, csdl: join(goc, "np.sqlite"), anh: join(goc, "anh"), saoLuu: join(goc, "sao-luu"), chay: join(goc, "chay"), logs: join(goc, "logs"), cauHinhClaude: join(goc, "claude-cfg") }
  const zalo = { vao: [], gui: [], dangGui: 0,
    async layCapNhat() { if (this.vao.length) return this.vao.splice(0); await new Promise((r) => setTimeout(r, 30)); return [] },
    async guiChu(chat_id, text) { this.dangGui++; if (cham) await new Promise((r) => setTimeout(r, cham)); this.gui.push({ chat_id, text }); return [{ message_id: `b${this.gui.length}`, date: now() }] } }
  const so = [], sua = []
  const cfgTat = { channels: { "1511655994252460113": { name: "chi-phí", tab: "Chi phí chung" } },
    quy: [{ ten: "GWT - Tiền mặt", goiTat: ["tiền mặt"] }, { ten: "Cá nhân ứng", goiTat: ["cá nhân ứng"] }],
    zalo: { tenBot: "Bot GWT CP", groups: { [NHOM]: { name: "Chi tiêu đoàn TQ", tab: "Đoàn" } }, nhomVanHanh: OPS }, dichvu: { thoiGianToiDaGiay: 30 } }
  const dv = await taoDichVu({ cfgTat, biMat: { CLAUDE_CODE_OAUTH_TOKEN: "gia" }, thuMuc, api: zalo, loiDan: "lời dặn thử", chuongTrinhClaude: CLAUDE_GIA, now, coFile,
    taiFn: async () => ({ ok: true, status: 200, headers: { get: () => "image/jpeg" }, arrayBuffer: async () => new Uint8Array([255, 216, 255]).buffer }),
    taoCore: (cfg, nguonTin) => taoSo({ cfg, discord: nguonTin, drive: { luuAnh: async () => "https://drive.google.com/drive/folders/F1" },
      so: { loadProcessed: async () => new Set(so.flatMap((x) => x.msgIds)), commit: async (x) => so.push(x),
        timDong: async (id) => (so.some((x) => x.rows.length && x.msgIds.includes(id)) ? 2 : null), capNhat: async (dong, f, kenh) => sua.push({ dong, f, kenh }) } }) })
  await dv.batDau({ cong: 0 })
  return { dv, zalo, so, sua, thuMuc, kichBan: (ds) => writeFileSync(join(thuMuc.chay, "kich-ban.json"), JSON.stringify(ds)) }
}

test("tin ảnh đủ thông tin → claude ghi sổ → dịch vụ tự báo ✅; ảnh đã tải về máy; việc xong", async () => {
  const t = await dung(); try {
    t.kichBan([{ loai: "goi", goi: [{ ten: "ghi_khoan", doi: { message_id: "$TIN", loai: "chi", so_tien: 180000, noi_dung: "10 chai nước khách", hoa_don: "Không", nguon_quy: "Cá nhân ứng" } }] }])
    t.zalo.vao.push(anh("@Bot GWT CP chi 180k 10 chai nước khách, cá nhân ứng"))
    await cho(() => t.zalo.gui.some((g) => g.text.startsWith("✅ #1")))
    assert.match(t.zalo.gui.find((g) => g.text.startsWith("✅")).text, /^✅ #1 Quỳnh Mai · \d{2}\/\d{2} · CHI 180\.000đ · Cá nhân ứng/)
    assert.equal(t.so.length, 1); assert.equal(t.so[0].rows[0][7], 180000)
    assert.equal(readdirSync(t.thuMuc.anh).length, 1)
    // ✅ có thể đi trước khi claude giả thoát hẳn → chờ việc 'xong', không kiểm ngay.
    await cho(() => t.dv.db.prepare("SELECT trang_thai FROM viec").get().trang_thai === "xong")
    // Không --bare (chỉ nhận API key): cách ly bằng thư mục cấu hình Claude riêng + đăng nhập bằng token gói claude.ai.
    assert.deepEqual(JSON.parse(readFileSync(join(t.thuMuc.chay, "moi-truong.json"), "utf8")), { CLAUDE_CONFIG_DIR: t.thuMuc.cauHinhClaude, co_token: true })
  } finally { await t.dv.dung() }
})

test("thiếu quỹ → hỏi lại → người gửi trả lời không ghi # → ghi sổ bằng chính tin trả lời; lần chạy 2 thấy 'TRẢ LỜI CHO khoản #1'", async () => {
  const t = await dung(); try {
    t.kichBan([{ loai: "goi", goi: [{ ten: "tra_loi", doi: { text: "Khoản #1 chi từ quỹ nào? (trả lời bắt đầu bằng @Bot GWT CP)", hoi_ve: "$TIN" } }] },
      { loai: "goi", goi: [{ ten: "ghi_khoan", doi: { message_id: "$KHOAN", xac_nhan_message_id: "$TIN", loai: "chi", so_tien: 160000, noi_dung: "Hộp bóng bàn", hoa_don: "Không", nguon_quy: "GWT - Tiền mặt" } }] }])
    t.zalo.vao.push(anh("@Bot GWT CP thanh toán 1 hộp bóng bàn 160k"))
    await cho(() => t.dv.db.prepare("SELECT trang_thai FROM tin WHERE ma=1").get()?.trang_thai === "dang_hoi")
    t.zalo.vao.push(chu("@Bot GWT CP tiền mặt"))
    await cho(() => t.zalo.gui.some((g) => g.text.startsWith("✅ #1")))
    assert.equal(t.so.length, 1); assert.match(t.so[0].rows[0][10], /đã xác nhận: Zalo #2/)
    const nc = readdirSync(t.thuMuc.chay).filter((f) => f.startsWith("ngu-canh-")).sort().map((f) => readFileSync(join(t.thuMuc.chay, f), "utf8"))
    assert.match(nc[1], /TRẢ LỜI CHO khoản #1 · message_id \d+ · kiểu suy_ra/)
  } finally { await t.dv.dung() }
})

test("Claude im lặng → 'Đã nhận #N.'; Claude lỗi 4 lần → that_bai, báo nhóm, cảnh báo nhóm vận hành", async () => {
  let gio = Date.now()
  const t = await dung({ now: () => gio }); try {
    t.kichBan([{ loai: "im_lang" }, { loai: "loi" }, { loai: "loi" }, { loai: "loi" }, { loai: "loi" }])
    t.zalo.vao.push(chu("@Bot GWT CP note: mai đi sớm"))
    await cho(() => t.zalo.gui.some((g) => g.text === "Đã nhận #1."))
    t.zalo.vao.push(chu("@Bot GWT CP chi 50k taxi"))
    const v = () => ({ ...t.dv.db.prepare("SELECT v.* FROM viec v JOIN tin t ON t.id = v.tin_id WHERE t.ma = 2").get() })
    for (const [lan, ms] of [[1, 60e3], [2, 300e3], [3, 900e3]]) {
      await cho(() => v().so_lan === lan && v().trang_thai === "cho")
      gio += ms
    }
    await cho(() => t.zalo.gui.some((g) => g.text === "Khoản #2 chưa xử lý được, đã báo người quản lý."))
    await cho(() => t.zalo.gui.some((g) => g.chat_id === OPS && /hỏng sau 4 lần/.test(g.text)))
  } finally { await t.dv.dung() }
})

// Tình huống spec 7, 10, 11 (12 "xoá" = không có công cụ xoá — test-dv-cong-cu "đúng 5 công cụ").
test("[7] @ không ảnh → nhờ gửi lại → ảnh chú thích '#1' ghi sổ CÓ ảnh chứng từ; [10] người khác '#1' → không thành trả lời; [11] 'sửa #1' → ✏️", async () => {
  const t = await dung(); try {
    t.kichBan([
      { loai: "goi", goi: [{ ten: "tra_loi", doi: { text: "Mình không nhận được ảnh của khoản #1. Gửi lại 1 ảnh bill, chú thích ghi @Bot GWT CP #1", hoi_ve: "$TIN" } }] },
      { loai: "goi", goi: [{ ten: "ghi_khoan", doi: { message_id: "$KHOAN", xac_nhan_message_id: "$TIN", loai: "chi", so_tien: 180000, noi_dung: "10 chai nước khách", hoa_don: "Không", nguon_quy: "Cá nhân ứng" } }] },
      { loai: "im_lang" },
      { loai: "goi", goi: [{ ten: "sua_khoan", doi: { message_id: "$KHOAN", yeu_cau_message_id: "$TIN", loai: "chi", so_tien: 150000 } }] }])
    t.zalo.vao.push(chu("@Bot GWT CP chi 180k 10 chai nước khách, cá nhân ứng"))
    await cho(() => t.dv.db.prepare("SELECT trang_thai FROM tin WHERE ma=1").get()?.trang_thai === "dang_hoi")
    t.zalo.vao.push(anh("@Bot GWT CP #1 bill đây"))
    await cho(() => t.zalo.gui.some((g) => g.text.startsWith("✅ #1")))
    assert.equal(t.so[0].rows[0][9], "https://drive.google.com/drive/folders/F1"); assert.doesNotMatch(t.so[0].rows[0][10], /không có ảnh/)
    t.zalo.vao.push(chu("@Bot GWT CP #1 sai rồi", { id: "u2", display_name: "Bình" }))
    await cho(() => t.zalo.gui.some((g) => g.text === "Đã nhận #3."))
    t.zalo.vao.push(chu("@Bot GWT CP sửa #1 thành 150k"))
    await cho(() => t.zalo.gui.some((g) => g.text === "✏️ Đã sửa #1 theo yêu cầu của Quỳnh Mai"))
    assert.deepEqual([t.sua[0].dong, t.sua[0].f.amount, t.sua[0].kenh], [2, 150000, NHOM])
    const nc = readdirSync(t.thuMuc.chay).filter((f) => f.startsWith("ngu-canh-")).sort().map((f) => readFileSync(join(t.thuMuc.chay, f), "utf8"))
    assert.match(nc[1], /TRẢ LỜI CHO khoản #1 · message_id \d+ · kiểu #N/)
    assert.doesNotMatch(nc[2], /TRẢ LỜI CHO/)
  } finally { await t.dv.dung() }
})

// Review cuối (I1): `launchctl kickstart -k` (cách cập nhật code) giữa lúc đang gửi — phải chờ gửi xong và ghi CSDL rồi mới
// đóng, không thì bật lại sẽ gửi trùng tin.
test("[I1] tắt dịch vụ giữa lúc đang gửi → chờ gửi xong + ghi CSDL; bật lại không gửi lặp", async () => {
  const t = await dung({ cham: 2500 }); let daTat = false
  try {
    t.kichBan([{ loai: "im_lang" }])
    t.zalo.vao.push(chu("@Bot GWT CP note: mai đi sớm"))
    await cho(() => t.zalo.dangGui > 0)
    await t.dv.dung(); daTat = true
    assert.deepEqual(t.zalo.gui.map((g) => g.text), ["Đã nhận #1."])
    const db = moCsdl(t.thuMuc.csdl)
    try {
      assert.deepEqual(db.prepare("SELECT trang_thai FROM gui").all().map((r) => r.trang_thai), ["da_gui"])
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tin WHERE la_bot=1").get().n, 1)
    } finally { db.close() }
  } finally { if (!daTat) await t.dv.dung() }
})

// Spec 2026-10-08-np-chung-tu: khoản không ảnh vẫn ghi → ✅ kèm link → 20:00 nhắc → tải file lên → quét sửa sổ → hôm sau im.
test("[chứng từ] khoản KHÔNG ảnh → ✅ 'Chưa có chứng từ, tải vào' + link → 20:00 nhắc → có file → sổ 'đã bổ sung', hôm sau không nhắc", async () => {
  let gio = Date.parse("2026-10-10T19:50:00+07:00"), coFile = false
  const t = await dung({ now: () => gio, coFile: async () => coFile }); try {
    t.kichBan([{ loai: "goi", goi: [{ ten: "ghi_khoan", doi: { message_id: "$TIN", loai: "chi", so_tien: 50000, noi_dung: "Taxi", hoa_don: "Không", nguon_quy: "GWT - Tiền mặt" } }] }])
    t.zalo.vao.push(chu("@Bot GWT CP Chi - 50k - Taxi - Tiền mặt"))
    await cho(() => t.zalo.gui.some((g) => g.text.startsWith("✅ #1")))
    assert.match(t.zalo.gui.find((g) => g.text.startsWith("✅")).text,
      /^✅ #1 Quỳnh Mai · \d{2}\/\d{2} · CHI 50\.000đ[^\n]*\n📎 Chưa có chứng từ, tải vào: https:\/\/drive\.google\.com\/drive\/folders\/F1$/)
    gio = Date.parse("2026-10-10T20:05:00+07:00")
    await t.dv.chungTu.quet(); assert.equal(t.dv.chungTu.nhacToi(), 1)
    await cho(() => t.zalo.gui.some((g) => g.text.startsWith("📎 Còn thiếu chứng từ (1):\n#1 Quỳnh Mai 50.000đ")))
    coFile = true; assert.equal(await t.dv.chungTu.quet(), 1)
    assert.match(t.sua.at(-1).f.ghiChuThem, /^đã bổ sung chứng từ 10\/10$/)
    gio = Date.parse("2026-10-11T20:05:00+07:00"); await t.dv.chungTu.quet(); assert.equal(t.dv.chungTu.nhacToi(), 0)
  } finally { await t.dv.dung() }
})
