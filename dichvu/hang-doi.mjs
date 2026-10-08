// Hàng đợi việc + gói ngữ cảnh (spec 2026-10-08 §Luồng 2, §Gọi Claude): mỗi tin người dùng là một việc, chạy LẦN LƯỢT,
// ít nhất một lần (dịch vụ chết giữa chừng thì bật lại chạy tiếp; ghi sổ vốn chống ghi trùng theo mã tin).
import { LICH_THU_LAI } from "./hop-thu.mjs";
import { datMoc, layMoc } from "./csdl.mjs";

export const SO_LAN_TOI_DA = LICH_THU_LAI.length + 1; // lần đầu + 3 lần thử lại
// Chạm giới hạn gói / lỗi đăng nhập là lỗi CỦA GÓI, không của tin: dừng CẢ hàng đợi (mốc `claude_cho_den`), không tính lần —
// giới hạn gói claude.ai kéo dài hàng giờ, tính lần thì mọi tin đang chờ thành that_bai (review cuối I2).
const CHO_GOI = 30 * 60e3;

const gio = (luc) => new Date(luc).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const anhCua = (t, tenBot) => t.anh_tt === "da_tai" ? `ảnh: ${t.anh_tep}` : t.anh_tt === "khong_co" ? "ảnh: không có"
  : String(t.anh_tt).startsWith("loi:") ? `ảnh: tải hỏng (${t.anh_tt.slice(4)}) — nhờ người gửi gửi lại 1 ảnh, chú thích bắt đầu bằng @${tenBot} #${t.ma}` : "ảnh: đang tải";

/** Gói ngữ cảnh cho MỘT việc. Các "message_id <số>" là mã Claude truyền vào công cụ. */
export function dungNguCanh({ viec, tin, nhom, tenBot, traLoi = null, dangHoi = [], daGui = [], kiemTin = null, dsQuy = [] }) {
  const d = [
    `VIỆC ${viec.id} (lần chạy ${viec.so_lan}) · nhóm "${nhom?.name ?? tin.chat_id}" · tab sổ "${nhom?.tab ?? ""}"`,
    `TIN MỚI #${tin.ma} · message_id ${tin.id} · ${tin.ten} · ${gio(tin.luc)} · ${anhCua(tin, tenBot)}`,
    `  nội dung: ${JSON.stringify(tin.noi_dung)}`,
  ];
  if (traLoi?.goc) {
    d.push(`TRẢ LỜI CHO khoản #${traLoi.goc.ma} · message_id ${traLoi.goc.id} · kiểu ${tin.kieu_tra_loi} · trạng thái ${traLoi.goc.trang_thai} · ${anhCua(traLoi.goc, tenBot)}`,
      `  nội dung khoản: ${JSON.stringify(traLoi.goc.noi_dung)}`);
    if (traLoi.cauHoi) d.push(`  bot đã hỏi: ${JSON.stringify(traLoi.cauHoi.noi_dung)}`);
  }
  const khac = dangHoi.filter((x) => x.id !== traLoi?.goc?.id);
  if (khac.length) d.push(`KHOẢN KHÁC ĐANG HỎI ${tin.ten}: ${khac.map((x) => `#${x.ma} (message_id ${x.id})`).join(", ")}`);
  d.push(daGui.length ? `ĐÃ GỬI Ở LẦN CHẠY TRƯỚC (đừng gửi lặp): ${daGui.map((g) => JSON.stringify(g.noi_dung)).join(" | ")}` : "ĐÃ GỬI Ở LẦN CHẠY TRƯỚC: (không có)");
  if (kiemTin) d.push(`BỘ ĐỌC LUẬT (chỉ tham chiếu): ${JSON.stringify(kiemTin)}`);
  d.push(`QUỸ: ${dsQuy.join(" · ") || "(chưa khai)"}`, "Xử lý ĐÚNG MỘT tin mới ở trên theo lời dặn. Nói gì trong nhóm thì dùng tra_loi.");
  return d.join("\n");
}

export function taoHangDoi({ db, kho, core, congCu, hopThu, canhBao, nhom, tenBot, dsQuy = [], chay, nhatKy = () => {}, now = Date.now, lich = LICH_THU_LAI }) {
  const q = {
    tiep: db.prepare("SELECT v.* FROM viec v JOIN tin t ON t.id = v.tin_id WHERE v.trang_thai='cho' AND v.sau_luc <= ? AND t.anh_tt != 'cho_tai' ORDER BY v.id LIMIT 1"),
    nhan: db.prepare("UPDATE viec SET trang_thai='dang_chay', so_lan = so_lan + 1 WHERE id=? AND trang_thai='cho'"),
    lay: db.prepare("SELECT * FROM viec WHERE id=?"),
    xong: db.prepare("UPDATE viec SET trang_thai='xong', ket_qua=?, xong_luc=? WHERE id=?"),
    henLai: db.prepare("UPDATE viec SET trang_thai='cho', sau_luc=?, loi_cuoi=?, ket_qua=? WHERE id=?"),
    traLan: db.prepare("UPDATE viec SET trang_thai='cho', so_lan = so_lan - 1 WHERE id=?"),
    thatBai: db.prepare("UPDATE viec SET trang_thai='that_bai', loi_cuoi=?, ket_qua=?, xong_luc=? WHERE id=?"),
    khoiPhuc: db.prepare("UPDATE viec SET trang_thai='cho' WHERE trang_thai='dang_chay'"),
  };
  async function chayMot() {
    const choGoi = layMoc(db, "claude_cho_den");
    if (choGoi != null && now() < choGoi) return false;
    const v0 = q.tiep.get(now());
    if (!v0) return false;
    if (Number(q.nhan.run(v0.id).changes) !== 1) return true;
    const v = { ...q.lay.get(v0.id) }, t = kho.lay(v.tin_id), n = nhom[t.chat_id];
    const kiemTin = await Promise.resolve().then(() => core.kiemTin({ chat_id: t.chat_id, message_id: t.id })).catch(() => null);
    const nguCanh = dungNguCanh({ viec: v, tin: t, nhom: n, tenBot, traLoi: kho.khoanGocCua(t), dangHoi: kho.dangHoiCua(t.chat_id, t.nguoi_id, now()),
      daGui: hopThu.cuaViec(v.id), kiemTin, dsQuy });
    const token = congCu.moPhien({ id: v.id, chat_id: t.chat_id, tin_id: t.id });
    let kq;
    try { kq = await chay({ nguCanh, token }) } finally { congCu.dongPhien(token) }
    const tom = JSON.stringify({ kieu: kq.kieu, luot: kq.luot ?? null, ma_thoat: kq.maThoat ?? null });
    nhatKy({ viec: v.id, tin: t.id, lan: v.so_lan, kieu: kq.kieu });
    if (kq.kieu === "huy") { q.traLan.run(v.id); return true } // dịch vụ đang tắt: không tính là một lần thử
    if (kq.ok) {
      q.xong.run(tom, now(), v.id);
      datMoc(db, "claude_ok", now());
      // Claude im lặng (không ghi, không nói gì) → vẫn phải có phản hồi: "tin không có bot trả lời = bot chưa thấy".
      if (!hopThu.cuaViec(v.id).length) hopThu.xepGui({ chat_id: t.chat_id, noi_dung: `Đã nhận #${t.ma}.`, viec_id: v.id, loai: "da_nhan" });
      return true;
    }
    if (kq.kieu === "gioi_han" || kq.kieu === "dang_nhap") {
      q.traLan.run(v.id);
      datMoc(db, "claude_cho_den", now() + CHO_GOI);
      canhBao.bao(`claude_${kq.kieu}`, kq.kieu === "gioi_han" ? "Claude chạm giới hạn gói — cả hàng đợi tạm dừng 30 phút rồi thử lại."
        : "Claude lỗi đăng nhập — cả hàng đợi tạm dừng; kiểm tra CLAUDE_CODE_OAUTH_TOKEN (chạy lại `claude setup-token` trên Mac mini).");
      return true;
    }
    if (v.so_lan >= SO_LAN_TOI_DA) {
      q.thatBai.run(kq.loi || kq.kieu, tom, now(), v.id);
      canhBao.bao(`viec_that_bai:${v.id}`, `Khoản #${t.ma} (nhóm ${n?.name ?? t.chat_id}) hỏng sau ${v.so_lan} lần: ${kq.loi || kq.kieu}`);
      hopThu.xepGui({ chat_id: t.chat_id, noi_dung: `Khoản #${t.ma} chưa xử lý được, đã báo người quản lý.`, viec_id: v.id, loai: "that_bai" });
    } else {
      q.henLai.run(now() + lich[v.so_lan - 1], kq.loi || kq.kieu, tom, v.id);
    }
    return true;
  }
  return { chayMot, khoiPhuc: () => Number(q.khoiPhuc.run().changes) };
}
