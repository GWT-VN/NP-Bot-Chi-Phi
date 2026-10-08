// Chứng từ theo khoản (spec 2026-10-08-np-chung-tu): mỗi khoản ghi sổ có một thư mục Drive; khoản chưa có file thì bot nhắc
// trong bản tổng hợp tối (mỗi nhóm một tin/ngày) cho tới khi có. Zalo không chuyển album cho bot → chứng từ thứ 2 trở đi
// người gửi tự tải vào thư mục qua link trong tin ✅. Bảng chung_tu do file này giữ SQL.
import { datMoc, layMoc } from "./csdl.mjs";

const NGAY = 86400e3;
const ngayVN = (t) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }); // YYYY-MM-DD
const gioVN = (t) => new Date(t).toLocaleTimeString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
const ddmm = (t) => { const [, m, d] = ngayVN(t).split("-"); return `${d}/${m}` };
export const idThuMuc = (link) => /\/folders\/([\w-]+)/.exec(String(link || ""))?.[1] ?? null;

export function taoChungTu({ db, hopThu, core, coFile, nhom = {}, gioNhac = "20:00", now = Date.now, nhatKy = () => {} }) {
  const q = {
    them: db.prepare(`INSERT OR IGNORE INTO chung_tu(tin_id,chat_id,ma,ten,loai,so_tien,ngay,thu_muc,link,ghi_luc,co_file)
      VALUES ($tin_id,$chat_id,$ma,$ten,$loai,$so_tien,$ngay,$thu_muc,$link,$ghi_luc,$co_file)`),
    sua: db.prepare("UPDATE chung_tu SET loai=COALESCE(?,loai), so_tien=COALESCE(?,so_tien), ngay=COALESCE(?,ngay) WHERE tin_id=?"),
    thieu: db.prepare("SELECT * FROM chung_tu WHERE co_file=0 ORDER BY chat_id, ma"),
    du: db.prepare("UPDATE chung_tu SET co_file=1, bo_sung_luc=? WHERE tin_id=?"),
  };

  /** Sau ghi_khoan thành công. Không có link thư mục (Drive lỗi / khoản đã có từ trước) → không theo dõi. */
  function them({ tin, loai, so_tien, ngay = null, link, co_anh }) {
    const thu_muc = idThuMuc(link);
    if (!thu_muc) return false;
    q.them.run({ tin_id: tin.id, chat_id: tin.chat_id, ma: tin.ma, ten: tin.ten || "", loai, so_tien, ngay, thu_muc, link,
      ghi_luc: now(), co_file: co_anh ? 1 : 0 });
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
      q.du.run(now(), r.tin_id);
      du++;
      try {
        const kq = await core.boSungChungTu({ chat_id: r.chat_id, message_id: r.tin_id, ngay: ddmm(now()) });
        if (!kq?.ok) nhatKy({ chung_tu: r.tin_id, so: kq?.ly_do });
      } catch (e) { nhatKy({ chung_tu: r.tin_id, loi_so: String(e?.message ?? e).slice(0, 150) }) }
    }
    return du;
  }

  /** Từ giờ nhắc trở đi trong ngày: mỗi nhóm đã khai còn khoản thiếu → MỘT tin (mốc nhac_ct:<nhóm>:<ngày> chống lặp). */
  function nhacToi() {
    const t = now();
    if (gioVN(t) < gioNhac) return 0;
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
