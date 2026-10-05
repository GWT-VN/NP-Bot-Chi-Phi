// Test lõi ghi sổ NP v2 (Discord/Sheet/Drive giả) — chạy: node test-so-core.mjs. Spec v2 §4, §9.
import test from "node:test";
import assert from "node:assert/strict";
import { taoSo } from "./so-core.mjs";

const KENH = "900", KHAC = "901";
const CFG = { guildId: "1", channels: { [KENH]: { name: "new-projects" } },
  quy: [{ ten: "Quỹ công ty", goiTat: ["qct"] }, { ten: "Tiền cá nhân ứng", goiTat: ["tiền túi"] }] };
const ANH = [{ url: "u", filename: "bill.jpg", content_type: "image/jpeg" }];
const msg = (id, content, o = {}) => ({ id, channel_id: KENH, content, timestamp: "2026-10-05T03:00:00.000Z",
  author: { id: "77", username: "lan", global_name: "Lan" }, attachments: ANH, reactions: [], ...o });

function dung(tins, { daGhi = [], dongTheoMa = {}, loiState = false } = {}) {
  const ghi = [], react = [], unreact = [], sua = [], anh = []
  const kho = Object.fromEntries(tins.map((m) => [`${m.channel_id}/${m.id}`, m]))
  const so = taoSo({ cfg: CFG, now: () => Date.parse("2026-10-05T05:00:00Z"),
    discord: { layTin: async (ch, id) => kho[`${ch}/${id}`] || null, layTinKenh: async (ch) => tins.filter((m) => m.channel_id === ch),
      react: async (...a) => react.push(a), unreact: async (...a) => unreact.push(a) },
    so: { loadProcessed: async () => { if (loiState) throw new Error("Sheets 503"); return new Set(daGhi) },
      commit: async (x) => ghi.push(x), timDong: async (id) => dongTheoMa[id] ?? null, capNhat: async (...a) => sua.push(a),
      docSo: async () => [{ dong: 2, ngay: "04/10/2026", dienGiai: "A", nguonQuy: "Quỹ công ty", thu: 0, chi: 100000 },
        { dong: 3, ngay: "05/10/2026", dienGiai: "B", nguonQuy: "Tiền cá nhân ứng", thu: 500000, chi: 0 }] },
    drive: { luuAnh: async (o) => { anh.push(o); return "https://drive/x" } } })
  return { so, ghi, react, unreact, sua, anh }
}
const DUNG = { chat_id: KENH, message_id: "100", loai: "chi", so_tien: 1250000, noi_dung: "Mua vật tư mẫu", hoa_don: "Có", nguon_quy: "Quỹ công ty" }
const goc = msg("100", "chi Mua vật tư mẫu 1.250.000đ có hoá đơn đỏ qct")

test("đúng luật + khớp → ghi ngay, 12 cột, Mã tin, ✅ và gỡ ❓ sau khi ghi", async () => {
  const t = dung([goc])
  const r = await t.so.ghiKhoan(DUNG)
  assert.equal(r.ok, true)
  const row = t.ghi[0].rows[0]
  assert.equal(row.length, 12); assert.equal(row[5], "Quỹ công ty"); assert.equal(row[7], 1250000); assert.equal(row[11], "100"); assert.equal(row[9], "https://drive/x")
  assert.deepEqual(t.ghi[0].msgIds, ["100"])
  assert.deepEqual(t.react[0], [KENH, "100", "✅"]); assert.deepEqual(t.unreact[0], [KENH, "100", "❓"])
})

test("đúng luật nhưng Claude đưa số KHÁC → từ chối nếu không có xác nhận", async () => {
  const t = dung([goc])
  const r = await t.so.ghiKhoan({ ...DUNG, so_tien: 735000 })
  assert.equal(r.ok, false); assert.match(r.ly_do, /xác nhận/); assert.equal(t.ghi.length, 0)
})

test("sai luật + xác nhận của CHÍNH người gửi, gửi SAU → ghi, Ghi chú có link xác nhận", async () => {
  const g = msg("100", "Mua vật tư 1.250.000đ", { attachments: [] })
  const xn = msg("105", "đúng rồi, chi quỹ công ty, không có bill", { attachments: [] })
  const t = dung([g, xn])
  const r = await t.so.ghiKhoan({ ...DUNG, hoa_don: "Không", xac_nhan_message_id: "105" })
  assert.equal(r.ok, true)
  const gc = t.ghi[0].rows[0][10]
  assert.match(gc, /không có ảnh chứng từ \(đã xác nhận\)/); assert.match(gc, /discord\.com\/channels\/1\/900\/105/)
})

test("[dụ] xác nhận của NGƯỜI KHÁC → từ chối", async () => {
  const g = msg("100", "Mua vật tư 1.250.000đ")
  const xn = msg("105", "đúng", { author: { id: "88", username: "x" } })
  const t = dung([g, xn])
  const r = await t.so.ghiKhoan({ ...DUNG, xac_nhan_message_id: "105" })
  assert.equal(r.ok, false); assert.match(r.ly_do, /người gửi/); assert.equal(t.ghi.length, 0)
})

test("[dụ] xác nhận gửi TRƯỚC tin gốc → từ chối", async () => {
  const g = msg("100", "Mua vật tư 1.250.000đ")
  const t = dung([g, msg("90", "đúng")])
  const r = await t.so.ghiKhoan({ ...DUNG, xac_nhan_message_id: "90" })
  assert.equal(r.ok, false); assert.match(r.ly_do, /sau/i)
})

test("[dụ] tin ở kênh khác / chat_id lạ → từ chối", async () => {
  const t = dung([msg("100", "chi Mua vật tư 1.250.000đ qct", { channel_id: KHAC })])
  assert.equal((await t.so.ghiKhoan({ ...DUNG, chat_id: KHAC })).ok, false)
})

test("[dụ] tin của bot → từ chối", async () => {
  const t = dung([msg("100", "chi Mua vật tư mẫu 1.250.000đ có hoá đơn đỏ qct", { author: { id: "9", bot: true } })])
  assert.equal((await t.so.ghiKhoan(DUNG)).ok, false)
})

test("đã có trong _state → từ chối (không ghi trùng); đọc _state lỗi → lỗi, không ghi", async () => {
  const a = dung([goc], { daGhi: ["100"] })
  const r = await a.so.ghiKhoan(DUNG)
  assert.equal(r.ok, false); assert.match(r.ly_do, /đã ghi/)
  const b = dung([goc], { loiState: true })
  await assert.rejects(b.so.ghiKhoan(DUNG), /503/); assert.equal(b.ghi.length, 0)
})

test("nguồn quỹ ngoài danh sách → luôn từ chối, kể cả có xác nhận", async () => {
  const t = dung([goc, msg("105", "đúng")])
  const r = await t.so.ghiKhoan({ ...DUNG, nguon_quy: "Quỹ lạ", xac_nhan_message_id: "105" })
  assert.equal(r.ok, false); assert.match(r.ly_do, /danh sách/)
})

test("số tiền âm / 0 / lẻ / quá trần, loai/hoa_don lạ → từ chối", async () => {
  const t = dung([goc, msg("105", "đúng")])
  for (const x of [{ so_tien: -1 }, { so_tien: 0 }, { so_tien: 12.5 }, { so_tien: 2e10 }, { loai: "chuyen" }, { hoa_don: "Có thể" }])
    assert.equal((await t.so.ghiKhoan({ ...DUNG, ...x, xac_nhan_message_id: "105" })).ok, false, JSON.stringify(x))
})

test("tin 'note / không ghi sổ' → từ chối hẳn, kể cả có xác nhận", async () => {
  const t = dung([msg("100", "note tổng tháng 1.250.000đ qct"), msg("105", "đúng")])
  assert.equal((await t.so.ghiKhoan({ ...DUNG, xac_nhan_message_id: "105" })).ok, false)
})

test("✅ chỉ thả khi ghi thành công: commit lỗi → không ✅", async () => {
  const react = []
  const s = taoSo({ cfg: CFG, now: () => 0, discord: { layTin: async () => goc, react: async (...a) => react.push(a), unreact: async () => {} },
    so: { loadProcessed: async () => new Set(), commit: async () => { throw new Error("Sheets 500") } }, drive: { luuAnh: async () => "" } })
  await assert.rejects(s.ghiKhoan(DUNG), /500/); assert.equal(react.length, 0)
})

test("sua_khoan: đúng tác giả, tìm theo Mã tin, ghi chú 'sửa theo'", async () => {
  const t = dung([goc, msg("110", "sửa lại 735k")], { dongTheoMa: { "100": 7 } })
  const r = await t.so.suaKhoan({ chat_id: KENH, message_id: "100", yeu_cau_message_id: "110", loai: "chi", so_tien: 735000 })
  assert.equal(r.ok, true)
  assert.equal(t.sua[0][0], 7); assert.equal(t.sua[0][1].amount, 735000); assert.match(t.sua[0][1].ghiChuThem, /sửa theo .*110/)
})

test("[dụ] sua_khoan từ người khác / dòng chưa ghi → từ chối", async () => {
  const a = dung([goc, msg("110", "sửa 1k", { author: { id: "88", username: "x" } })], { dongTheoMa: { "100": 7 } })
  assert.equal((await a.so.suaKhoan({ chat_id: KENH, message_id: "100", yeu_cau_message_id: "110", loai: "chi", so_tien: 1000 })).ok, false)
  const b = dung([goc, msg("110", "sửa 1k")])
  const r = await b.so.suaKhoan({ chat_id: KENH, message_id: "100", yeu_cau_message_id: "110", loai: "chi", so_tien: 1000 })
  assert.equal(r.ok, false); assert.match(r.ly_do, /chưa ghi/)
})

test("doc_so: lọc ngày + tổng thu/chi", async () => {
  const t = dung([])
  const r = await t.so.docSo({ chat_id: KENH, tu_ngay: "05/10/2026" })
  assert.equal(r.so_dong, 1); assert.equal(r.tong_thu, 500000); assert.equal(r.tong_chi, 0)
})

test("tin_chua_xu_ly: bỏ tin đã ghi, tin bot, tin có ❓ của bot, tin trò chuyện", async () => {
  const t = dung([goc, msg("101", "chi ship 45k qct"), msg("102", "Vâng chị", { attachments: [] }),
    msg("103", "chi A 10k qct", { reactions: [{ me: true, emoji: { name: "❓" } }] }), msg("104", "x", { author: { id: "9", bot: true } })], { daGhi: ["100"] })
  const r = await t.so.tinChuaXuLy({})
  assert.deepEqual(r.map((x) => x.message_id), ["101"])
})

test("kiem_tin: trả kết quả luật + đã ghi chưa", async () => {
  const t = dung([goc], { daGhi: [] })
  const r = await t.so.kiemTin({ chat_id: KENH, message_id: "100" })
  assert.equal(r.dung_luat, true); assert.equal(r.da_ghi, false); assert.equal(r.nguon_quy, "Quỹ công ty")
})
