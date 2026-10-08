// Chứng từ theo khoản (spec 2026-10-08-np-chung-tu): mỗi khoản ghi sổ có một thư mục Drive; khoản chưa có file thì bot nhắc
// trong bản tổng hợp tối (mỗi nhóm một tin/ngày) cho tới khi có. Zalo không chuyển album cho bot → chứng từ thứ 2 trở đi
// người gửi tự tải vào thư mục qua link trong tin ✅. Bảng chung_tu do file này giữ SQL.
import { datMoc, layMoc } from "./csdl.mjs";

const NGAY = 86400e3;
const ngayVN = (t) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }); // YYYY-MM-DD
const gioVN = (t) => new Date(t).toLocaleTimeString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
const ddmm = (t) => { const [, m, d] = ngayVN(t).split("-"); return `${d}/${m}` };
export const idThuMuc = (link) => /\/folders\/([\w-]+)/.exec(String(link || ""))?.[1] ?? null;

export function taoChungTu({ db, hopThu, core, coFile, nhom = {}, gioNhac = "08:00", now = Date.now, nhatKy = () => {} }) {
  // "8:00" / "08:00" → "08:00" để so chuỗi với giờ VN cho đúng (chủ dự án đặt 8:00, 2026-10-08); sai dạng → 08:00.
  const gm = /^(\d{1,2}):(\d{2})$/.exec(String(gioNhac).trim()), gioChuan = gm ? `${gm[1].padStart(2, "0")}:${gm[2]}` : "08:00";
  const q = {
    // bo_sung_luc: lúc đã sửa ghi chú sổ — hoặc lúc ghi nếu có ảnh từ đầu (không có gì để sửa). NULL + co_file=1 = còn phải sửa sổ.
    them: db.prepare(`INSERT OR IGNORE INTO chung_tu(tin_id,chat_id,ma,ten,loai,so_tien,ngay,thu_muc,link,ghi_luc,co_file,bo_sung_luc)
      VALUES ($tin_id,$chat_id,$ma,$ten,$loai,$so_tien,$ngay,$thu_muc,$link,$ghi_luc,$co_file,$bo_sung_luc)`),
    sua: db.prepare("UPDATE chung_tu SET loai=COALESCE(?,loai), so_tien=COALESCE(?,so_tien), ngay=COALESCE(?,ngay) WHERE tin_id=?"),
    thieu: db.prepare("SELECT * FROM chung_tu WHERE co_file=0 ORDER BY chat_id, ma"),
    daCoFile: db.prepare("UPDATE chung_tu SET co_file=1 WHERE tin_id=?"),
    choSuaSo: db.prepare("SELECT * FROM chung_tu WHERE co_file=1 AND bo_sung_luc IS NULL ORDER BY chat_id, ma"),
    daSuaSo: db.prepare("UPDATE chung_tu SET bo_sung_luc=? WHERE tin_id=?"),
  };

  /** Sau ghi_khoan thành công. Không có link thư mục (Drive lỗi / khoản đã có từ trước) → không theo dõi. */
  function them({ tin, loai, so_tien, ngay = null, link, co_anh }) {
    const thu_muc = idThuMuc(link);
    if (!thu_muc) return false;
    q.them.run({ tin_id: tin.id, chat_id: tin.chat_id, ma: tin.ma, ten: tin.ten || "", loai, so_tien, ngay, thu_muc, link,
      ghi_luc: now(), co_file: co_anh ? 1 : 0, bo_sung_luc: co_anh ? now() : null });
    return true;
  }

  /** Khoản chưa có file → hỏi Drive; có rồi → thôi nhắc + sửa ghi chú sổ (sổ lỗi chỉ ghi nhật ký: thôi nhắc vẫn đúng). */
  async function quet() {
    let du = 0;
    for (const r of q.thieu.all()) {
      let co;
      try { co = await coFile(r.thu_muc) }
      catch (e) { nhatKy({ chung_tu: r.tin_id, loi_drive: String(e?.message ?? e).slice(0, 150) }); continue }
      if (!co) continue;
      q.daCoFile.run(r.tin_id); // thôi nhắc ngay, kể cả khi sửa sổ dưới đây lỗi
      du++;
    }
    // Sửa ghi chú sổ cho khoản đã đủ. Lỗi tạm (Sheets 429/5xx) → lượt sau làm lại (rà soát cuối I4); sổ trả lời "không thấy
    // dòng" / kênh lạ → thôi, ghi nhật ký (làm lại cũng vô ích, chỉ tốn hạn mức Sheets dùng chung với bot Discord).
    for (const r of q.choSuaSo.all()) {
      try {
        const kq = await core.boSungChungTu({ chat_id: r.chat_id, message_id: r.tin_id, ngay: ddmm(now()) });
        if (!kq?.ok) nhatKy({ chung_tu: r.tin_id, so: kq?.ly_do });
        q.daSuaSo.run(now(), r.tin_id);
      } catch (e) { nhatKy({ chung_tu: r.tin_id, loi_so: String(e?.message ?? e).slice(0, 150) }) }
    }
    return du;
  }

  /** Từ giờ nhắc trở đi trong ngày: mỗi nhóm đã khai còn khoản thiếu → MỘT tin (mốc nhac_ct:<nhóm>:<ngày> chống lặp). */
  function nhacToi() {
    const t = now();
    if (gioVN(t) < gioChuan) return 0;
    const theoNhom = new Map();
    for (const r of q.thieu.all()) {
      if (!Object.prototype.hasOwnProperty.call(nhom, r.chat_id)) continue;
      if (!theoNhom.has(r.chat_id)) theoNhom.set(r.chat_id, []);
      theoNhom.get(r.chat_id).push(r);
    }
    let gui = 0;
    for (const [chat_id, ds] of theoNhom) {
      const moc = `nhac_ct:${chat_id}:${ngayVN(t)}`;
      if (layMoc(db, moc) != null) continue;
      const dong = ds.map((r) => `#${r.ma} ${r.ten} ${Number(r.so_tien).toLocaleString("vi-VN")}đ${t - r.ghi_luc > 3 * NGAY ? " (quá 3 ngày)" : ""} ${r.link}`);
      hopThu.xepGui({ chat_id, noi_dung: [`📎 Còn thiếu chứng từ (${ds.length}):`, ...dong].join("\n"), loai: "nhac_ct" });
      datMoc(db, moc, t);
      gui++;
    }
    return gui;
  }

  return {
    them, quet, nhacToi,
    capNhat: (tinId, { loai = null, so_tien = null, ngay = null } = {}) => { q.sua.run(loai, so_tien, ngay, String(tinId)) },
    soThieu: () => q.thieu.all().length,
  };
}
