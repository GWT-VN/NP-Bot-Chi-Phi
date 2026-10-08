// Test phần nền np-dichvu (cấu hình, bí mật, nhật ký, bảo trì, --kiem-tra) — chạy: node test-dv-chinh.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, utimesSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { docBiMat, thuMucDichVu, cauHinhDichVu, MAC_DINH_DICH_VU, taoNhatKy, taoBaoTri, tomTat, tinMau } from "./dichvu/chinh.mjs";
import http from "node:http";
import { spawn } from "node:child_process";
import { moCsdl, taoKhoTin, datMoc } from "./dichvu/csdl.mjs";

const tam = () => mkdtempSync(join(tmpdir(), "dv-"));

test("docBiMat: đọc KEY=VALUE, bỏ comment; thiếu khoá bắt buộc → lỗi nêu TÊN khoá, không in giá trị", () => {
  const f = join(tam(), "np.env")
  writeFileSync(f, "# bí mật\nZALO_BOT_TOKEN=123:abc\nCLAUDE_CODE_OAUTH_TOKEN = sk-ant-oat01-xyz \nCLAUDE_TOKEN_NGAY_TAO=2026-10-08\n")
  assert.deepEqual(docBiMat(f), { ZALO_BOT_TOKEN: "123:abc", CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-xyz", CLAUDE_TOKEN_NGAY_TAO: "2026-10-08" })
  writeFileSync(f, "ZALO_BOT_TOKEN=123:abc\n")
  assert.throws(() => docBiMat(f), (e) => /CLAUDE_CODE_OAUTH_TOKEN/.test(e.message) && !e.message.includes("123:abc"))
})

test("thuMucDichVu: mặc định ~/Bots/np-dichvu, đổi được bằng NP_DICHVU_DIR", () => {
  assert.deepEqual(thuMucDichVu({ NP_DICHVU_DIR: "/x/dv" }), { goc: "/x/dv", csdl: "/x/dv/np.sqlite", anh: "/x/dv/anh", saoLuu: "/x/dv/sao-luu", chay: "/x/dv/chay", logs: "/x/dv/logs", cauHinhClaude: "/x/dv/claude-cfg" })
  assert.match(thuMucDichVu({}).goc, /Bots\/np-dichvu$/)
})

test("cauHinhDichVu: nhóm Zalo thành channels cho so-core (kênh Discord KHÔNG lọt vào); dichvu có mặc định", () => {
  const c = cauHinhDichVu({ channels: { "1511655994252460113": { tab: "Chi phí chung" } }, quy: [{ ten: "Thuỷ" }],
    zalo: { tenBot: "Bot GWT CP", groups: { g1: { name: "đoàn", tab: "Đoàn" } }, nhomVanHanh: "ops1" }, dichvu: { maxTurns: 8 } })
  assert.deepEqual(c.channels, { g1: { name: "đoàn", tab: "Đoàn" } })
  assert.equal(c.tenBot, "Bot GWT CP"); assert.equal(c.nhomVanHanh, "ops1")
  assert.deepEqual(c.dichvu, { ...MAC_DINH_DICH_VU, maxTurns: 8 })
  assert.deepEqual(cauHinhDichVu({}).channels, {}); assert.equal(cauHinhDichVu({ zalo: { nhomVanHanh: "" } }).nhomVanHanh, null)
})

test("nhật ký: một dòng JSON/sự kiện vào dichvu-<ngày VN>.jsonl; che Bearer/token=/sk-ant; không bao giờ ném lỗi", () => {
  const d = tam(), nk = taoNhatKy(d, { now: () => Date.parse("2026-10-07T18:30:00Z") }) // 01:30 ngày 08/10 giờ VN
  nk({ viec: 5, loi: "Bearer abc.def gọi https://x?token=SECRET sk-ant-oat01-QQQ" })
  assert.deepEqual(readdirSync(d), ["dichvu-2026-10-08.jsonl"])
  const dong = JSON.parse(readFileSync(join(d, "dichvu-2026-10-08.jsonl"), "utf8").trim())
  assert.equal(dong.viec, 5); assert.ok(!/abc\.def|SECRET|QQQ/.test(dong.loi), dong.loi)
  taoNhatKy("/khong/the/ghi/\0")({ x: 1 })
})

test("bảo trì: sao lưu mỗi ngày 1 bản (VACUUM INTO), giữ 14 bản mới nhất; dọn ảnh/nhật ký quá 30 ngày", () => {
  const d = tam(), thuMuc = { saoLuu: join(d, "sl"), anh: join(d, "anh"), logs: join(d, "logs") }, T = Date.parse("2026-10-20T10:00:00+07:00")
  const db = moCsdl(join(d, "np.sqlite")); taoKhoTin(db)
  mkdirSync(thuMuc.saoLuu, { recursive: true })
  for (let i = 1; i <= 15; i++) writeFileSync(join(thuMuc.saoLuu, `np-2026-09-${String(i).padStart(2, "0")}.sqlite`), "")
  const bt = taoBaoTri({ db, thuMuc, now: () => T })
  const f = bt.saoLuu()
  assert.equal(f, join(thuMuc.saoLuu, "np-2026-10-20.sqlite")); assert.equal(bt.saoLuu(), null)
  const ds = readdirSync(thuMuc.saoLuu).sort()
  assert.equal(ds.length, 14); assert.equal(ds[0], "np-2026-09-03.sqlite"); assert.equal(ds.at(-1), "np-2026-10-20.sqlite")
  assert.equal(moCsdl(f).prepare("SELECT so FROM phien_ban").get().so, 1)
  mkdirSync(thuMuc.anh, { recursive: true })
  const cu = join(thuMuc.anh, "cu.jpg"), moi = join(thuMuc.anh, "moi.jpg"); writeFileSync(cu, "x"); writeFileSync(moi, "x")
  const xa = new Date(T - 40 * 86400e3); utimesSync(cu, xa, xa)
  assert.equal(bt.donCu(), 1); assert.ok(!existsSync(cu)); assert.ok(existsSync(moi))
})

test("tomTat (--kiem-tra): việc/gửi theo trạng thái, việc quá hạn, cách lần nhận Zalo, nhóm chưa khai, cảnh báo gần đây", () => {
  const db = moCsdl(":memory:"), kho = taoKhoTin(db, { tenBot: "Bot GWT CP" }), T = Date.parse("2026-10-10T08:00:00+07:00")
  kho.nhanTin({ event_name: "message.text.received", message: { message_id: "z1", date: T - 20 * 60e3, chat: { id: "g1", chat_type: "GROUP" }, from: { id: "u1", display_name: "A" }, text: "x" } }, { now: T - 20 * 60e3 })
  datMoc(db, "nhan_zalo_ok", T - 2 * 60e3); datMoc(db, "nhom_la:g9", T - 60e3, JSON.stringify({ nguoi: "Thuỷ", vi_du: "@Bot thử" })); datMoc(db, "canh_bao:zalo_mat", T - 5 * 60e3)
  const r = tomTat(db, T)
  assert.deepEqual(r.viec, { cho: 1 }); assert.equal(r.viec_qua_han_phut, 20); assert.equal(r.nhan_zalo_cach_phut, 2); assert.equal(r.claude_ok_cach_phut, null)
  assert.deepEqual(r.nhom_chua_khai, [{ chat_id: "g9", lan_cuoi_phut: 1, nguoi: "Thuỷ", vi_du: "@Bot thử" }])
  assert.deepEqual(r.canh_bao_gan_day, [{ khoa: "zalo_mat", cach_phut: 5 }])
})

test("node dichvu/chinh.mjs --kiem-tra in tình trạng dạng JSON (không cần bí mật)", () => {
  const r = spawnSync(process.execPath, ["dichvu/chinh.mjs", "--kiem-tra"], { cwd: fileURLToPath(new URL(".", import.meta.url)), env: { ...process.env, NP_DICHVU_DIR: tam() }, encoding: "utf8" })
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(Object.keys(JSON.parse(r.stdout)), ["viec", "gui", "viec_qua_han_phut", "nhan_zalo_cach_phut", "claude_ok_cach_phut", "nhom_chua_khai", "canh_bao_gan_day"])
})

// Chủ dự án 2026-10-08: muốn ô nhập hiện sẵn cú pháp mờ — Zalo Bot API không có (sendMessage chỉ chat_id/text/parse_mode/
// text_styles). Thay bằng tin mẫu do bot gửi, phần cú pháp in nghiêng + chữ nhỏ, trưởng nhóm ghim.
test("tinMau: khuôn Thu/Chi - Số tiền - Nội dung - Tên quỹ + ví dụ in nghiêng chữ nhỏ đúng vị trí (UTF-16, có emoji); quỹ bỏ 'GWT - '", () => {
  const m = tinMau({ zalo: { tenBot: "Bot GWT CP" }, quy: [{ ten: "GWT - TK Công ty" }, { ten: "GWT - Tiền mặt" }, { ten: "Thuỷ" }] })
  assert.equal(m.text, "📌 Báo chi phí: 1 ảnh bill, chú thích bắt đầu bằng tag @Bot GWT CP\nThu/Chi - Số tiền - Nội dung - Tên quỹ\nVD: Chi - 50k - Nước khách - Tiền mặt\nQuỹ: TK Công ty · Tiền mặt · Thuỷ")
  assert.deepEqual(m.text_styles.map((s) => [m.text.slice(s.start, s.start + s.len), s.st]),
    [["Thu/Chi - Số tiền - Nội dung - Tên quỹ", ["i", "f_13"]], ["VD: Chi - 50k - Nước khách - Tiền mặt", ["i", "f_13"]]])
})

const nhomDaKhai = Object.keys(JSON.parse(readFileSync(new URL("./config.json", import.meta.url), "utf8")).zalo?.groups || {})[0];
const chayChinh = (args, env) => new Promise((ok) => { // spawn (không spawnSync): Zalo giả chạy trong CHÍNH tiến trình test
  const p = spawn(process.execPath, ["dichvu/chinh.mjs", ...args], { cwd: fileURLToPath(new URL(".", import.meta.url)), env: { ...process.env, ...env } })
  let out = "", err = ""; p.stdout.on("data", (c) => { out += c }); p.stderr.on("data", (c) => { err += c }); p.on("close", (ma) => ok({ ma, out, err }))
})
test("--gui-mau <chat_id>: nhóm chưa khai → từ chối, không đọc bí mật; nhóm đã khai → bot gửi sendMessage kèm text_styles", { skip: !nhomDaKhai && "config.json chưa khai nhóm Zalo nào" }, async () => {
  const lo = await chayChinh(["--gui-mau", "nhom-la"], { NP_BI_MAT: "/khong/co/file" })
  assert.equal(lo.ma, 1); assert.match(lo.err, /chưa khai/)
  const nhan = []
  const may = http.createServer(async (req, res) => { let b = ""; for await (const c of req) b += c; nhan.push({ url: req.url, body: JSON.parse(b) }); res.end(JSON.stringify({ ok: true, result: { message_id: "m1", date: Date.now() } })) })
  await new Promise((r) => may.listen(0, "127.0.0.1", r))
  try {
    const f = join(tam(), "np.env"); writeFileSync(f, "ZALO_BOT_TOKEN=123:abc\n")
    const r = await chayChinh(["--gui-mau", nhomDaKhai], { NP_BI_MAT: f, ZALO_API_GOC: `http://127.0.0.1:${may.address().port}` })
    assert.equal(r.ma, 0, r.err)
    assert.equal(nhan.length, 1); assert.equal(nhan[0].url, "/bot123:abc/sendMessage")
    assert.equal(nhan[0].body.chat_id, nhomDaKhai); assert.match(nhan[0].body.text, /Thu\/Chi - Số tiền - Nội dung - Tên quỹ/); assert.equal(nhan[0].body.text_styles.length, 2)
  } finally { may.close() }
})
