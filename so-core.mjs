// Lõi ghi sổ NP v2 — 5 lệnh MCP `npso` (spec v2 §4). Phụ thuộc truyền vào (Discord/Sheet/Drive) để test không cần mạng.
// Nguyên tắc (chủ dự án chốt 2026-10-06): luật 1–5 (rõ thu/chi · số tiền · ảnh · hoá đơn · quỹ) là CHUẨN NỘI DUNG mà
// CLAUDE đọc và tự đối chiếu — đủ thì ghi, thiếu/chưa rõ thì hỏi lại. Lệnh KHÔNG so từ khoá để chặn ("luật cứng chỉ để
// Claude phân tích"): kết quả bộ đọc luật trả về làm THAM CHIẾU (kiem_tin trước khi ghi, tham_chieu sau khi ghi).
// Lệnh chỉ chặn dữ liệu không hợp lệ (giá trị ngoài danh sách, tin đã ghi, kênh lạ) và xác nhận giả (Reply không phải
// của người gửi). Không có lệnh xoá.
import { kiemLuat, bangChung } from "./luat.mjs";
import { buildFundRow } from "./books.mjs";
import { ngayVN } from "./scanner.mjs";

const TRAN = 1e10;
// "Chờ xuất": chưa có hoá đơn nhưng sẽ xuất sau (vd cá nhân ứng trước, công ty hoàn rồi xuất HĐ — 2026-10-06).
export const HOA_DON = ["Có", "Không", "Chờ xuất"];
const ND = (m) => m.author?.global_name || m.author?.username || "";
const toDMY = (iso) => { const [y, mo, d] = String(iso).split("-"); return `${d}/${mo}/${y}` };
const dmyIso = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || "").trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : null };

export function taoSo({ discord, so, drive, cfg, now = () => Date.now() }) {
  const quyTen = new Set((cfg.quy || []).map((q) => q.ten));
  // Có danh sách quỹ (chị Tuyết Trang đặt 2026-10-06) → nguon_quy bắt buộc và phải là tên trong danh sách.
  const batBuocQuy = quyTen.size > 0;
  // Link tới tin (ghi vào Ghi chú khi có xác nhận / sửa). Nền tảng không có link tin (Zalo, 2026-10-07) truyền discord.link riêng.
  const link = discord.link ?? ((ch, id) => `https://discord.com/channels/${cfg.guildId || "@me"}/${ch}/${id}`);
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

  // Xác nhận phải GẮN với đúng khoản (review C1, 2026-10-05): là Discord REPLY vào tin gốc, hoặc reply vào câu hỏi của
  // BOT mà câu hỏi đó reply tin gốc. "Tin bất kỳ của người gửi, gửi sau" là KHÔNG đủ: một chữ "đúng" sẽ bị dùng cho
  // nhiều khoản, và Claude bị dụ có thể gán số tuỳ ý cho tin trò chuyện. Reply trỏ đúng 1 tin → không dùng lại được.
  async function xacNhanHopLe(chat_id, goc, xnId, viec) {
    if (!xnId) return { loi: `cần tin xác nhận của người gửi (Reply vào tin gốc hoặc vào câu hỏi của bot) trước khi ${viec}` };
    const xn = await discord.layTin(String(chat_id), String(xnId));
    if (!xn) return { loi: `không thấy tin xác nhận ${xnId} trong kênh` };
    if (xn.author?.bot || String(xn.author?.id) !== String(goc.author?.id)) return { loi: "tin xác nhận phải của CHÍNH người gửi khoản" };
    if (!sau(xn.id, goc.id)) return { loi: "tin xác nhận phải gửi SAU tin gốc" };
    const ref = xn.message_reference?.type === 1 ? null : xn.message_reference?.message_id; // type 1 = forward, không phải reply
    if (ref && String(ref) === String(goc.id)) return { xn, hoi: null };
    if (ref) {
      const hoi = await discord.layTin(String(chat_id), String(ref));
      if (hoi?.author?.bot && String(hoi.message_reference?.message_id) === String(goc.id)) return { xn, hoi };
    }
    return { loi: "tin xác nhận phải là Reply (trả lời) vào tin gốc, hoặc vào câu hỏi của bot về đúng khoản này — nhờ người gửi bấm Reply" };
  }

  function kiemGiaTri({ loai, so_tien, hoa_don, nguon_quy }, { batBuoc = true } = {}) {
    if ((batBuoc || loai !== undefined) && !["thu", "chi"].includes(loai)) return "loai phải là thu hoặc chi";
    if ((batBuoc || so_tien !== undefined) && !(Number.isInteger(so_tien) && so_tien > 0 && so_tien <= TRAN)) return "so_tien phải là số nguyên dương ≤ 10 tỷ (VND)";
    if ((batBuoc || hoa_don !== undefined) && !HOA_DON.includes(hoa_don)) return `hoa_don phải là ${HOA_DON.join(" / ")}`;
    if (!batBuocQuy) { if (nguon_quy !== undefined && (typeof nguon_quy !== "string" || nguon_quy.length > 60)) return "nguon_quy phải là chữ ≤ 60 ký tự"; return null }
    if ((batBuoc || nguon_quy !== undefined) && !quyTen.has(nguon_quy)) return `nguon_quy "${nguon_quy}" không có trong danh sách quỹ (${[...quyTen].join(", ") || "chưa khai"}) — người quản lý thêm vào config.json trước`;
    return null;
  }

  async function kiemTin({ chat_id, message_id }) {
    const { m, loi } = await tinGoc(chat_id, message_id);
    if (loi) return tuChoi(loi);
    const daGhi = (await so.loadProcessed()).has(String(m.id));
    return { ok: true, da_ghi: daGhi, tac_gia: ND(m), danh_sach_quy: [...quyTen], quy_bat_buoc: batBuocQuy, ...kiemLuat(m, cfg) };
  }

  // Khoá theo tin (review I1): hai lời gọi cùng tin chạy song song (Claude gọi lặp, quét bù trùng tin trực tiếp) mà cùng
  // qua bước kiểm _state thì ghi 2 dòng. Một tiến trình MCP / phiên → Set trong bộ nhớ là đủ.
  const dangGhi = new Set();
  async function ghiKhoan(a) {
    const k = `${a.chat_id}/${a.message_id}`;
    if (dangGhi.has(k)) return tuChoi("tin này đang được ghi ở lời gọi khác — chờ kết quả, đừng gọi lại");
    dangGhi.add(k);
    try { return await ghiKhoanTho(a) } finally { dangGhi.delete(k) }
  }
  async function ghiKhoanTho(a) {
    const { m, loi } = await tinGoc(a.chat_id, a.message_id);
    if (loi) return tuChoi(loi);
    if ((await so.loadProcessed()).has(String(m.id))) return tuChoi("tin này đã ghi sổ rồi — muốn sửa thì dùng sua_khoan");
    const sai = kiemGiaTri(a);
    if (sai) return tuChoi(sai);
    const luat = kiemLuat(m, cfg);
    // Tham chiếu cho Claude tự soát lại (KHÔNG chặn): chỗ giá trị Claude chốt khác chữ tin theo bộ đọc luật.
    const thamChieu = bangChung(m, a, luat.co_anh);
    // Xác nhận chỉ kiểm khi Claude gửi kèm (sau khi đã hỏi): phải đúng Reply của CHÍNH người gửi về đúng khoản (review C1).
    let xn = null;
    if (a.xac_nhan_message_id) {
      const r = await xacNhanHopLe(a.chat_id, m, a.xac_nhan_message_id, "ghi");
      if (r.loi) return tuChoi(r.loi);
      xn = r.xn;
    }
    // Dòng đã nằm trong sổ (lần trước ghi dòng xong mà ghi _state lỗi) → KHÔNG thêm dòng, chỉ bù _state (review I1).
    // Nhiều kênh (2026-10-06): mỗi kênh một tab — mọi lệnh sổ mang `kenh` để tầng sổ chọn đúng tab.
    const kenh = String(a.chat_id);
    if (so.timDong && await so.timDong(String(m.id), kenh)) {
      await so.commit({ rows: [], msgIds: [String(m.id)], kenh });
      try { await discord.react(String(a.chat_id), String(m.id), "✅") } catch {}
      try { await discord.unreact(String(a.chat_id), String(m.id), "❓") } catch {}
      return { ok: true, da_ghi: "khoản này đã có trong sổ từ lần trước — chỉ bù đánh dấu", canh_bao: [] };
    }
    const coAnh = luat.co_anh || (xn?.attachments || []).length > 0;
    // Ngày: Claude đọc ra từ tin (ngày chi) → dùng; không có thì bộ đọc luật / ngày gửi tin.
    const ngay = a.ngay || luat.ngay || toDMY(ngayVN(m.timestamp));
    const dau = [];
    let anh = "";
    try { anh = await drive.luuAnh({ msgs: [m, xn].filter(Boolean), loai: a.loai, ngay, noiDung: a.noi_dung, kenh, quy: a.nguon_quy, hoaDon: a.hoa_don }) } catch (e) { dau.push(`chưa lưu được ảnh chứng từ lên Drive (${String(e?.message ?? e).slice(0, 80)})`) }
    // Có ảnh mà không ra link (lỗi Drive / ảnh quá lớn / tải hỏng) → phải để lại dấu trong sổ, không im lặng (review I3).
    if (coAnh && !anh && !dau.length) dau.push("chưa lưu được ảnh chứng từ lên Drive");
    const ghiChu = [a.ghi_chu || luat.ghi_chu || "", !coAnh ? `không có ảnh chứng từ${xn ? " (đã xác nhận)" : ""}` : "", coAnh && !anh ? "chưa lưu được ảnh chứng từ" : "",
      xn ? `đã xác nhận: ${link(a.chat_id, xn.id)}` : ""].filter(Boolean).join("; ");
    const row = buildFundRow({ loai: a.loai, ngay: dmyIso(ngay) || ngay, dienGiai: a.noi_dung, nguoi: ND(m), hoaDon: a.hoa_don,
      nguonQuy: a.nguon_quy || "", amount: a.so_tien, link: anh, ghiChu, maTin: m.id });
    await so.commit({ rows: [row], msgIds: [String(m.id)], kenh }); // lỗi → ném lên, KHÔNG ✅
    try { await discord.react(String(a.chat_id), String(m.id), "✅") } catch (e) { dau.push(`không thả được ✅: ${e.message}`) }
    try { await discord.unreact(String(a.chat_id), String(m.id), "❓") } catch {}
    return { ok: true, da_ghi: `${a.loai.toUpperCase()} ${a.so_tien.toLocaleString("vi-VN")}đ · ${a.nguon_quy || "chưa ghi quỹ"} · HĐ ${a.hoa_don} · ${a.noi_dung}`, link_anh: anh || null, canh_bao: dau,
      ...(thamChieu.length ? { tham_chieu: `bộ đọc luật thấy khác ở: ${thamChieu.join(", ")} — đọc lại tin; ghi sai thì sua_khoan` } : {}) };
  }

  async function suaKhoan(a) {
    const { m, loi } = await tinGoc(a.chat_id, a.message_id);
    if (loi) return tuChoi(loi);
    const r = await xacNhanHopLe(a.chat_id, m, a.yeu_cau_message_id, "sửa");
    if (r.loi) return tuChoi(r.loi.replace("xác nhận", "yêu cầu sửa"));
    const sai = kiemGiaTri(a, { batBuoc: false });
    if (sai) return tuChoi(sai);
    if ((a.so_tien === undefined) !== (a.loai === undefined)) return tuChoi("sửa số tiền phải kèm cả loai lẫn so_tien");
    const dong = await so.timDong(String(m.id), String(a.chat_id));
    if (!dong) return tuChoi("khoản này chưa ghi sổ (không thấy Mã tin) — dùng ghi_khoan");
    await so.capNhat(dong, { dienGiai: a.noi_dung, hoaDon: a.hoa_don, nguonQuy: a.nguon_quy, loai: a.loai, amount: a.so_tien,
      ghiChuThem: `sửa theo ${link(a.chat_id, r.xn.id)}` }, String(a.chat_id));
    return { ok: true, dong };
  }

  async function docSo({ chat_id, tu_ngay, den_ngay, loai } = {}) {
    if (!chat_id) return tuChoi("cần chat_id của kênh đang hỏi — mỗi kênh một sổ riêng");
    if (!kenhHopLe(chat_id)) return tuChoi("kênh không phải kênh sổ chi phí NP");
    const tu = dmyIso(tu_ngay), den = dmyIso(den_ngay);
    const rows = (await so.docSo(String(chat_id))).filter((d) => {
      const i = dmyIso(d.ngay);
      return (!tu || (i && i >= tu)) && (!den || (i && i <= den)) && (!loai || (loai === "thu" ? d.thu > 0 : d.chi > 0));
    });
    return { ok: true, so_dong: rows.length, tong_thu: rows.reduce((s, d) => s + d.thu, 0), tong_chi: rows.reduce((s, d) => s + d.chi, 0),
      dong: rows.slice(-200).map(({ dong, ngay, dienGiai, nguonQuy, hoaDon, thu, chi }) => ({ dong, ngay, dienGiai, nguonQuy, hoaDon, thu, chi })) };
  }

  // Quét bù lúc khởi động (review I2): phiên mới không nhớ câu hỏi đang chờ → trả CẢ `dang_cho` (tin có ❓ của bot) kèm các
  // câu trả lời (Reply) của chính người gửi, để Claude ghi tiếp; tin Reply KHÔNG bao giờ bị coi là khoản mới.
  async function tinChuaXuLy() {
    const daGhi = await so.loadProcessed();
    const tu = now() - 7 * 86400e3, moi = [], dangCho = [];
    const daCo = (m, e) => (m.reactions || []).some((r) => r.me && r.emoji?.name === e);
    const refCua = (m) => (m.message_reference?.type === 1 ? null : m.message_reference?.message_id ? String(m.message_reference.message_id) : null);
    for (const ch of Object.keys(cfg.channels || {})) {
      const ds = await discord.layTinKenh(ch, tu);
      const hoiVe = new Map(ds.filter((m) => m.author?.bot && refCua(m)).map((m) => [String(m.id), refCua(m)])); // câu hỏi bot → tin gốc
      for (const m of ds) {
        if (m.author?.bot || m.pinned || daGhi.has(String(m.id)) || refCua(m) || daCo(m, "✅")) continue;
        if (daCo(m, "❓")) {
          const traLoi = ds.filter((x) => !x.author?.bot && String(x.author?.id) === String(m.author?.id) && refCua(x)
            && (refCua(x) === String(m.id) || hoiVe.get(refCua(x)) === String(m.id)))
            .map((x) => ({ message_id: String(x.id), noi_dung: String(x.content || "").slice(0, 200) }))
          dangCho.push({ chat_id: ch, message_id: String(m.id), tac_gia: ND(m), noi_dung: String(m.content || "").slice(0, 200), tra_loi: traLoi });
          continue;
        }
        const l = kiemLuat(m, cfg);
        if (l.bo_qua) continue;
        moi.push({ chat_id: ch, message_id: String(m.id), tac_gia: ND(m), noi_dung: String(m.content || "").slice(0, 200), dung_luat: l.dung_luat, thieu: l.thieu });
      }
    }
    const xep = (a, b) => (BigInt(a.message_id) < BigInt(b.message_id) ? -1 : 1);
    return { moi: moi.sort(xep), dang_cho: dangCho.sort(xep) };
  }

  return { kiemTin, ghiKhoan, suaKhoan, docSo, tinChuaXuLy };
}
