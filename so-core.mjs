// Lõi ghi sổ NP v2 — 5 lệnh MCP `npso` (spec v2 §4). Phụ thuộc truyền vào (Discord/Sheet/Drive) để test không cần mạng.
// Nguyên tắc: lệnh TỰ ĐỌC LẠI tin gốc từ Discord, không tin lời Claude khai. Luật 1–5 là cổng "ghi ngay"; lệch luật
// hoặc Claude đọc khác luật → BẮT BUỘC có tin xác nhận của CHÍNH người gửi, gửi SAU tin gốc. Không có lệnh xoá.
import { kiemLuat } from "./luat.mjs";
import { buildFundRow } from "./books.mjs";
import { ngayVN } from "./scanner.mjs";

const TRAN = 1e10;
const ND = (m) => m.author?.global_name || m.author?.username || "";
const toDMY = (iso) => { const [y, mo, d] = String(iso).split("-"); return `${d}/${mo}/${y}` };
const dmyIso = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || "").trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : null };

export function taoSo({ discord, so, drive, cfg, now = () => Date.now() }) {
  const quyTen = new Set((cfg.quy || []).map((q) => q.ten));
  const link = (ch, id) => `https://discord.com/channels/${cfg.guildId || "@me"}/${ch}/${id}`;
  const kenhHopLe = (ch) => Object.prototype.hasOwnProperty.call(cfg.channels || {}, String(ch));
  const tuChoi = (ly_do, them = {}) => ({ ok: false, ly_do, ...them });
  const sau = (a, b) => BigInt(a) > BigInt(b);

  async function tinGoc(chat_id, message_id) {
    if (!kenhHopLe(chat_id)) return { loi: "kênh không phải kênh sổ chi phí NP" };
    const m = await discord.layTin(String(chat_id), String(message_id));
    if (!m) return { loi: `không thấy tin ${message_id} trong kênh` };
    if (m.author?.bot) return { loi: "tin của bot, không phải khoản" };
    return { m };
  }

  async function xacNhanHopLe(chat_id, goc, xnId, viec) {
    if (!xnId) return { loi: `cần tin xác nhận của người gửi trước khi ${viec}` };
    const xn = await discord.layTin(String(chat_id), String(xnId));
    if (!xn) return { loi: `không thấy tin xác nhận ${xnId} trong kênh` };
    if (xn.author?.bot || String(xn.author?.id) !== String(goc.author?.id)) return { loi: "tin xác nhận phải của CHÍNH người gửi khoản" };
    if (!sau(xn.id, goc.id)) return { loi: "tin xác nhận phải gửi SAU tin gốc" };
    return { xn };
  }

  function kiemGiaTri({ loai, so_tien, hoa_don, nguon_quy }, { batBuoc = true } = {}) {
    if ((batBuoc || loai !== undefined) && !["thu", "chi"].includes(loai)) return "loai phải là thu hoặc chi";
    if ((batBuoc || so_tien !== undefined) && !(Number.isInteger(so_tien) && so_tien > 0 && so_tien <= TRAN)) return "so_tien phải là số nguyên dương ≤ 10 tỷ (VND)";
    if ((batBuoc || hoa_don !== undefined) && !["Có", "Không"].includes(hoa_don)) return "hoa_don phải là Có hoặc Không";
    if ((batBuoc || nguon_quy !== undefined) && !quyTen.has(nguon_quy)) return `nguon_quy "${nguon_quy}" không có trong danh sách quỹ (${[...quyTen].join(", ") || "chưa khai"}) — người quản lý thêm vào config.json trước`;
    return null;
  }

  async function kiemTin({ chat_id, message_id }) {
    const { m, loi } = await tinGoc(chat_id, message_id);
    if (loi) return tuChoi(loi);
    const daGhi = (await so.loadProcessed()).has(String(m.id));
    return { ok: true, da_ghi: daGhi, tac_gia: ND(m), ...kiemLuat(m, cfg) };
  }

  async function ghiKhoan(a) {
    const { m, loi } = await tinGoc(a.chat_id, a.message_id);
    if (loi) return tuChoi(loi);
    if ((await so.loadProcessed()).has(String(m.id))) return tuChoi("tin này đã ghi sổ rồi — muốn sửa thì dùng sua_khoan");
    const sai = kiemGiaTri(a);
    if (sai) return tuChoi(sai);
    const luat = kiemLuat(m, cfg);
    if (luat.bo_qua && /ghi chú có chủ đích/.test(luat.ly_do || "")) return tuChoi("tin này người gửi ghi rõ là ghi chú / không ghi sổ");
    const khop = luat.dung_luat && luat.loai === a.loai && luat.so_tien === a.so_tien && luat.hoa_don === a.hoa_don && luat.nguon_quy === a.nguon_quy;
    let xn = null;
    if (!khop) {
      const r = await xacNhanHopLe(a.chat_id, m, a.xac_nhan_message_id, "ghi");
      if (r.loi) return tuChoi(r.loi, { thieu: luat.thieu || [], luat_doc_duoc: { loai: luat.loai, so_tien: luat.so_tien, hoa_don: luat.hoa_don, nguon_quy: luat.nguon_quy } });
      xn = r.xn;
    }
    const coAnh = luat.co_anh || (xn?.attachments || []).length > 0;
    const ghiChu = [a.ghi_chu || luat.ghi_chu || "", !coAnh ? "không có ảnh chứng từ (đã xác nhận)" : "", xn ? `đã xác nhận: ${link(a.chat_id, xn.id)}` : ""].filter(Boolean).join("; ");
    const ngay = luat.ngay || toDMY(ngayVN(m.timestamp));
    let anh = "";
    try { anh = await drive.luuAnh({ msgs: [m, xn].filter(Boolean), loai: a.loai, ngay, noiDung: a.noi_dung }) } catch {}
    const row = buildFundRow({ loai: a.loai, ngay: dmyIso(ngay) || ngay, dienGiai: a.noi_dung, nguoi: ND(m), hoaDon: a.hoa_don,
      nguonQuy: a.nguon_quy, amount: a.so_tien, link: anh, ghiChu, maTin: m.id });
    await so.commit({ rows: [row], msgIds: [String(m.id)] }); // lỗi → ném lên, KHÔNG ✅
    const dau = [];
    try { await discord.react(String(a.chat_id), String(m.id), "✅") } catch (e) { dau.push(`không thả được ✅: ${e.message}`) }
    try { await discord.unreact(String(a.chat_id), String(m.id), "❓") } catch {}
    return { ok: true, da_ghi: `${a.loai.toUpperCase()} ${a.so_tien.toLocaleString("vi-VN")}đ · ${a.nguon_quy} · HĐ ${a.hoa_don} · ${a.noi_dung}`, link_anh: anh || null, canh_bao: dau };
  }

  async function suaKhoan(a) {
    const { m, loi } = await tinGoc(a.chat_id, a.message_id);
    if (loi) return tuChoi(loi);
    const r = await xacNhanHopLe(a.chat_id, m, a.yeu_cau_message_id, "sửa");
    if (r.loi) return tuChoi(r.loi.replace("xác nhận", "yêu cầu sửa"));
    const sai = kiemGiaTri(a, { batBuoc: false });
    if (sai) return tuChoi(sai);
    if ((a.so_tien === undefined) !== (a.loai === undefined)) return tuChoi("sửa số tiền phải kèm cả loai lẫn so_tien");
    const dong = await so.timDong(String(m.id));
    if (!dong) return tuChoi("khoản này chưa ghi sổ (không thấy Mã tin) — dùng ghi_khoan");
    await so.capNhat(dong, { dienGiai: a.noi_dung, hoaDon: a.hoa_don, nguonQuy: a.nguon_quy, loai: a.loai, amount: a.so_tien,
      ghiChuThem: `sửa theo ${link(a.chat_id, r.xn.id)}` });
    return { ok: true, dong };
  }

  async function docSo({ chat_id, tu_ngay, den_ngay, loai } = {}) {
    if (chat_id && !kenhHopLe(chat_id)) return tuChoi("kênh không phải kênh sổ chi phí NP");
    const tu = dmyIso(tu_ngay), den = dmyIso(den_ngay);
    const rows = (await so.docSo()).filter((d) => {
      const i = dmyIso(d.ngay);
      return (!tu || (i && i >= tu)) && (!den || (i && i <= den)) && (!loai || (loai === "thu" ? d.thu > 0 : d.chi > 0));
    });
    return { ok: true, so_dong: rows.length, tong_thu: rows.reduce((s, d) => s + d.thu, 0), tong_chi: rows.reduce((s, d) => s + d.chi, 0),
      dong: rows.slice(-200).map(({ dong, ngay, dienGiai, nguonQuy, hoaDon, thu, chi }) => ({ dong, ngay, dienGiai, nguonQuy, hoaDon, thu, chi })) };
  }

  async function tinChuaXuLy() {
    const daGhi = await so.loadProcessed();
    const tu = now() - 7 * 86400e3, ra = [];
    for (const ch of Object.keys(cfg.channels || {})) {
      for (const m of await discord.layTinKenh(ch, tu)) {
        if (m.author?.bot || m.pinned || daGhi.has(String(m.id))) continue;
        if ((m.reactions || []).some((r) => r.me && ["❓", "✅"].includes(r.emoji?.name))) continue;
        const l = kiemLuat(m, cfg);
        if (l.bo_qua) continue;
        ra.push({ chat_id: ch, message_id: String(m.id), tac_gia: ND(m), noi_dung: String(m.content || "").slice(0, 200), dung_luat: l.dung_luat, thieu: l.thieu });
      }
    }
    return ra.sort((a, b) => (BigInt(a.message_id) < BigInt(b.message_id) ? -1 : 1));
  }

  return { kiemTin, ghiKhoan, suaKhoan, docSo, tinChuaXuLy };
}
