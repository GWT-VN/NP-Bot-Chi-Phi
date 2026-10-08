// Hộp thư gửi + cảnh báo (spec 2026-10-08 §Luồng 4, §Vận hành). Mọi tin bot gửi đi qua đây: gửi theo thứ tự từng nhóm, thử
// lại, ghi tin bot; CHỈ khi câu hỏi đã tới tay người dùng mới chuyển khoản sang `dang_hoi`. Cảnh báo = tin vào nhóm vận hành,
// cùng khoá không lặp trong 30 phút (mốc `canh_bao:<khoá>`).
import { chiaDoan } from "../zalo/api.mjs";
import { giaoDich, datMoc, layMoc, msZalo } from "./csdl.mjs";

export const LICH_THU_LAI = [60e3, 300e3, 900e3]; // lần đầu + 3 lần thử lại

export function taoHopThu({ db, kho, api, nhatKy = () => {}, baoLoi = () => {}, now = Date.now, lich = LICH_THU_LAI }) {
  const q = {
    them: db.prepare("INSERT INTO gui(chat_id,thu_tu,noi_dung,hoi_ve,viec_id,loai,trang_thai,so_lan,sau_luc,tao_luc) VALUES (?,?,?,?,?,?,'cho',0,?,?)"),
    cho: db.prepare("SELECT * FROM gui WHERE trang_thai='cho' ORDER BY id"),
    daGui: db.prepare("UPDATE gui SET trang_thai='da_gui', msg_goc=?, so_lan=so_lan+1 WHERE id=?"),
    henLai: db.prepare("UPDATE gui SET so_lan=?, sau_luc=?, loi_cuoi=? WHERE id=?"),
    thatBai: db.prepare("UPDATE gui SET trang_thai='that_bai', so_lan=?, loi_cuoi=? WHERE id=?"),
    cuaViec: db.prepare("SELECT * FROM gui WHERE viec_id=? ORDER BY id"),
  };
  function xepGui({ chat_id, noi_dung, hoi_ve = null, viec_id = null, loai }) {
    const t = now();
    return chiaDoan(noi_dung).map((doan, i) => Number(q.them.run(String(chat_id), i, doan, hoi_ve, viec_id, loai, t, t).lastInsertRowid));
  }
  // Giữ thứ tự trong MỘT nhóm: dòng đầu chưa gửi được (đang chờ thử lại) thì các dòng sau của nhóm đó chờ theo.
  function tiepTheo() {
    const daThay = new Set();
    for (const g of q.cho.all()) {
      if (daThay.has(g.chat_id)) continue;
      daThay.add(g.chat_id);
      if (g.sau_luc <= now()) return g;
    }
    return null;
  }
  async function guiMot() {
    const g = tiepTheo();
    if (!g) return false;
    let r;
    try { [r] = await api.guiChu(g.chat_id, g.noi_dung) }
    catch (e) {
      const lan = g.so_lan + 1, loi = String(e?.message ?? e).slice(0, 300);
      if (lan > lich.length) {
        q.thatBai.run(lan, loi, g.id);
        nhatKy({ gui: g.id, loai: g.loai, that_bai: true });
        if (g.loai !== "canh_bao") baoLoi(`gui_that_bai:${g.id}`, `Tin gửi nhóm ${g.chat_id} hỏng hẳn sau ${lan} lần: ${loi.slice(0, 120)}`);
      } else {
        q.henLai.run(lan, now() + lich[lan - 1], loi, g.id);
        nhatKy({ gui: g.id, loai: g.loai, thu_lai: lan });
      }
      return true;
    }
    const msgGoc = r?.message_id == null ? null : String(r.message_id);
    // Tin ĐÃ tới nhóm: lỗi ghi CSDL từ đây KHÔNG phải gửi hỏng — vẫn đánh dấu đã gửi (gửi lại = trùng tin) và báo (review cuối I1).
    try {
      giaoDich(db, () => {
        q.daGui.run(msgGoc, g.id);
        kho.ghiBot({ chat_id: g.chat_id, msg_goc: msgGoc, luc: msZalo(r?.date) ?? now(), noi_dung: g.noi_dung, hoi_ve: g.thu_tu === 0 ? g.hoi_ve : null });
        if (g.hoi_ve && g.thu_tu === 0) kho.danhDauDangHoi(g.hoi_ve);
      });
      nhatKy({ gui: g.id, loai: g.loai, ok: true });
    } catch (e) {
      try { q.daGui.run(msgGoc, g.id) } catch {}
      nhatKy({ gui: g.id, loai: g.loai, loi_sau_gui: String(e?.message ?? e).slice(0, 200) });
      baoLoi(`gui_ghi_loi:${g.id}`, `Đã gửi tin vào nhóm ${g.chat_id} nhưng không ghi được CSDL (${String(e?.message ?? e).slice(0, 100)}) — bot có thể không nhận ra câu trả lời cho tin này.`);
    }
    return true;
  }
  return { xepGui, guiMot, cuaViec: (viecId) => q.cuaViec.all(viecId) };
}

export function conNgayToken(ngayTao, t = Date.now()) {
  return Math.floor((Date.parse(`${ngayTao}T00:00:00+07:00`) + 365 * 86400e3 - t) / 86400e3);
}

export function taoCanhBao({ db, hopThu, nhomVanHanh = null, nhatKy = () => {}, now = Date.now, cach = 30 * 60e3 }) {
  function bao(khoa, noiDung) {
    nhatKy({ canh_bao: khoa });
    const truoc = layMoc(db, `canh_bao:${khoa}`);
    if (truoc != null && now() - truoc < cach) return false;
    datMoc(db, `canh_bao:${khoa}`, now());
    // ponytail: chưa khai nhóm vận hành (hoặc chính Zalo hỏng) → cảnh báo chỉ nằm trong nhật ký / --kiem-tra; thêm email khi cần.
    if (nhomVanHanh) hopThu.xepGui({ chat_id: nhomVanHanh, noi_dung: `⚠️ ${noiDung}`, loai: "canh_bao" });
    return true;
  }
  function kiemDinhKy({ tokenNgayTao = null } = {}) {
    const t = now();
    const nhan = layMoc(db, "nhan_zalo_ok");
    if (nhan != null && t - nhan > 5 * 60e3) bao("zalo_mat", `Không nhận được tin Zalo ${Math.round((t - nhan) / 60e3)} phút (token Zalo / mạng) — xem logs.`);
    const cu = db.prepare("SELECT MIN(sau_luc) AS t FROM viec WHERE trang_thai='cho'").get()?.t;
    if (cu != null && t - cu > 15 * 60e3) bao("hang_doi_ket", `Hàng đợi kẹt: có việc quá hạn ${Math.round((t - cu) / 60e3)} phút chưa chạy.`);
    if (tokenNgayTao) {
      const con = conNgayToken(tokenNgayTao, t);
      if (con < 30) bao("token_claude", `Token Claude còn ${con} ngày (tạo ${tokenNgayTao}) — chạy \`claude setup-token\` trên Mac mini rồi thay CLAUDE_CODE_OAUTH_TOKEN và CLAUDE_TOKEN_NGAY_TAO trong ~/Bots/.secrets/np-dichvu.env.`);
    }
  }
  return { bao, kiemDinhKy };
}
