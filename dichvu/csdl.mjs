// CSDL SQLite của dịch vụ np-dichvu (spec 2026-10-08 §CSDL) — nguồn sự thật duy nhất: tin, số #N, khoản đang hỏi, hàng
// đợi việc, hộp thư gửi, mốc giờ. File này giữ CẤU TRÚC (có phiên bản, tự nâng khi mở), bảng `tin` + LUẬT HIỂU TRẢ LỜI
// (chuyển từ zalo/kho.mjs, đã sửa theo review C1/I1/I2) và adapter "dáng tin Discord" cho lõi so-core. Bảng viec / gui / chung_tu do
// hang-doi.mjs / hop-thu.mjs / chung-tu.mjs giữ SQL của mình.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const CAU_TRUC = [`
CREATE TABLE tin(
  id TEXT PRIMARY KEY, nen_tang TEXT NOT NULL, chat_id TEXT NOT NULL, ma INTEGER, msg_goc TEXT,
  nguoi_id TEXT, ten TEXT, la_bot INTEGER NOT NULL DEFAULT 0,
  noi_dung TEXT NOT NULL DEFAULT '', noi_dung_goc TEXT NOT NULL DEFAULT '', luc INTEGER NOT NULL,
  anh_url TEXT, anh_tep TEXT, anh_tt TEXT NOT NULL DEFAULT 'khong_co',
  tra_loi_cho TEXT REFERENCES tin(id), kieu_tra_loi TEXT, trang_thai TEXT,
  UNIQUE(nen_tang, msg_goc), UNIQUE(chat_id, ma));
CREATE INDEX tin_nhom_luc ON tin(chat_id, luc);
CREATE INDEX tin_tra_loi ON tin(tra_loi_cho);
CREATE TABLE viec(id INTEGER PRIMARY KEY, tin_id TEXT NOT NULL UNIQUE REFERENCES tin(id),
  trang_thai TEXT NOT NULL DEFAULT 'cho', so_lan INTEGER NOT NULL DEFAULT 0, sau_luc INTEGER NOT NULL,
  loi_cuoi TEXT, ket_qua TEXT, tao_luc INTEGER NOT NULL, xong_luc INTEGER);
CREATE INDEX viec_cho ON viec(trang_thai, sau_luc);
CREATE TABLE gui(id INTEGER PRIMARY KEY, chat_id TEXT NOT NULL, thu_tu INTEGER NOT NULL DEFAULT 0, noi_dung TEXT NOT NULL,
  hoi_ve TEXT REFERENCES tin(id), viec_id INTEGER REFERENCES viec(id), loai TEXT NOT NULL,
  trang_thai TEXT NOT NULL DEFAULT 'cho', so_lan INTEGER NOT NULL DEFAULT 0, sau_luc INTEGER NOT NULL,
  msg_goc TEXT, loi_cuoi TEXT, tao_luc INTEGER NOT NULL);
CREATE INDEX gui_cho ON gui(trang_thai, sau_luc);
CREATE TABLE moc(khoa TEXT PRIMARY KEY, luc INTEGER NOT NULL, ghi_chu TEXT);
`,
// v2 (2026-10-08): chứng từ theo khoản — thư mục Drive của khoản đã có file chưa, để quét + nhắc bổ sung (dichvu/chung-tu.mjs).
`CREATE TABLE chung_tu(tin_id TEXT PRIMARY KEY REFERENCES tin(id), chat_id TEXT NOT NULL, ma INTEGER, ten TEXT, loai TEXT,
  so_tien INTEGER, ngay TEXT, thu_muc TEXT NOT NULL, link TEXT NOT NULL, ghi_luc INTEGER NOT NULL,
  co_file INTEGER NOT NULL DEFAULT 0, bo_sung_luc INTEGER);
CREATE INDEX chung_tu_thieu ON chung_tu(co_file, chat_id);
`];

export function moCsdl(file) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS phien_ban(so INTEGER NOT NULL)");
  const hien = db.prepare("SELECT so FROM phien_ban").get()?.so ?? 0;
  for (let i = hien; i < CAU_TRUC.length; i++) giaoDich(db, () => {
    db.exec(CAU_TRUC[i]);
    db.exec("DELETE FROM phien_ban");
    db.prepare("INSERT INTO phien_ban(so) VALUES (?)").run(i + 1);
  });
  return db;
}

/** Chạy fn trong một giao dịch (BEGIN IMMEDIATE: giữ quyền ghi ngay). KHÔNG lồng nhau. */
export function giaoDich(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try { const kq = fn(); db.exec("COMMIT"); return kq }
  catch (e) { try { db.exec("ROLLBACK") } catch {} throw e }
}

export const datMoc = (db, khoa, luc, ghiChu = null) =>
  db.prepare("INSERT INTO moc(khoa,luc,ghi_chu) VALUES (?,?,?) ON CONFLICT(khoa) DO UPDATE SET luc=excluded.luc, ghi_chu=excluded.ghi_chu").run(khoa, luc, ghiChu);
export const layMoc = (db, khoa) => db.prepare("SELECT luc FROM moc WHERE khoa=?").get(khoa)?.luc ?? null;

/** `date` của Zalo → mili giây. Chưa đo được đơn vị (review cuối I3): số < 1e11 là giây (ms của năm 2026 có 13 chữ số). */
export const msZalo = (d) => { const n = Number(d); return n > 0 ? (n < 1e11 ? n * 1000 : n) : null };

const thoat = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Khoản bot hỏi quá 48 giờ không còn "hút" tin chữ của người gửi (review I2).
export const CUA_SO_HOI = 48 * 3600e3;

export function taoKhoTin(db, { tenBot = "", nenTang = "zalo" } = {}) {
  // "@Bot GWT CP": Zalo có thể chèn khoảng trắng lạ (NBSP) giữa các chữ, người gõ tay thì hoa thường tuỳ ý.
  const reBot = tenBot.trim() ? new RegExp(`@${tenBot.trim().split(/\s+/).map(thoat).join("\\s+")}`, "giu") : null;
  const boMention = (s) => (reBot ? String(s ?? "").replace(reBot, " ") : String(s ?? ""))
    .replace(/[^\S\n]+/g, " ").replace(/ *\n */g, "\n").trim();
  const q = {
    co: db.prepare("SELECT 1 FROM tin WHERE id=?"),
    lay: db.prepare("SELECT * FROM tin WHERE id=?"),
    theoGoc: db.prepare("SELECT id FROM tin WHERE nen_tang=? AND msg_goc=?"),
    maCuoi: db.prepare("SELECT MAX(ma) AS m FROM tin WHERE chat_id=?"),
    them: db.prepare(`INSERT INTO tin(id,nen_tang,chat_id,ma,msg_goc,nguoi_id,ten,la_bot,noi_dung,noi_dung_goc,luc,anh_url,anh_tt,tra_loi_cho,kieu_tra_loi,trang_thai)
      VALUES ($id,$nen_tang,$chat_id,$ma,$msg_goc,$nguoi_id,$ten,$la_bot,$noi_dung,$noi_dung_goc,$luc,$anh_url,$anh_tt,$tra_loi_cho,$kieu_tra_loi,$trang_thai)`),
    themViec: db.prepare("INSERT INTO viec(tin_id,trang_thai,so_lan,sau_luc,tao_luc) VALUES (?,'cho',0,?,?)"),
    theoMa: db.prepare("SELECT id FROM tin WHERE chat_id=? AND ma=? AND nguoi_id=? AND la_bot=0"),
    dangHoi: db.prepare("SELECT * FROM tin WHERE chat_id=? AND nguoi_id=? AND la_bot=0 AND trang_thai='dang_hoi' AND luc>=? ORDER BY luc"),
    cauHoiCuoi: db.prepare("SELECT id FROM tin WHERE la_bot=1 AND tra_loi_cho=? ORDER BY luc DESC, id DESC LIMIT 1"),
    trongNhom: db.prepare("SELECT * FROM tin WHERE chat_id=? AND luc>=? ORDER BY luc"),
    sangDangHoi: db.prepare("UPDATE tin SET trang_thai='dang_hoi' WHERE id=? AND la_bot=0 AND trang_thai='moi'"),
    boHoi: db.prepare("UPDATE tin SET trang_thai='moi' WHERE id=? AND trang_thai='dang_hoi'"),
    daGhi: db.prepare("UPDATE tin SET trang_thai='da_ghi' WHERE id=? AND la_bot=0"),
    datAnh: db.prepare("UPDATE tin SET anh_tep=?, anh_tt=? WHERE id=?"),
    choTai: db.prepare("SELECT * FROM tin WHERE anh_tt='cho_tai' ORDER BY luc"),
  };
  const lay = (id) => q.lay.get(String(id)) ?? null;
  // id số tăng theo thời gian: so-core so sánh id bằng BigInt như snowflake Discord.
  const idMoi = (luc) => { let n = BigInt(Math.trunc(Number(luc) || Date.now())) * 1000n; while (q.co.get(String(n))) n++; return String(n) };

  // Tin mới của người A trả lời khoản nào (Zalo không gửi kèm Reply — đo 2026-10-07):
  //   1. "#N" là số tin của CHÍNH A → trỏ thẳng tin đó (trả lời lẫn "sửa #N"). Tin chữ: #N ở đâu cũng tính; tin ẢNH: chỉ khi
  //      chú thích MỞ ĐẦU bằng #N (gửi lại ảnh) — "#1" giữa câu ở tin ảnh là số phòng/hoá đơn (review I1). "#N" không phải của
  //      A → KHÔNG trỏ gì, không rơi xuống luật 2 (review C1).
  //   2. Không ảnh và A có ĐÚNG MỘT khoản `dang_hoi` trong 48 giờ → trỏ câu hỏi cuối của bot về khoản đó (`suy_ra`).
  //   3. Còn lại → không trỏ: so-core không nhận làm xác nhận, Claude hỏi lại "khoản nào, ghi #số".
  function suyTraLoi(ch, uid, noiDung, coAnh, luc) {
    const so = (coAnh ? /^#(\d{1,6})(?!\d)/ : /#(\d{1,6})(?!\d)/).exec(noiDung);
    if (so) { const g = q.theoMa.get(ch, Number(so[1]), uid); return g ? { id: g.id, kieu: "#N" } : null }
    if (coAnh) return null;
    const dang = q.dangHoi.all(ch, uid, luc - CUA_SO_HOI);
    if (dang.length !== 1) return null;
    return { id: q.cauHoiCuoi.get(dang[0].id)?.id ?? dang[0].id, kieu: "suy_ra" };
  }

  /** Nhận 1 cập nhật Zalo (đã qua lọc nhóm). MỘT giao dịch: lưu tin + suy trả lời + tạo việc. Trùng / không phải tin → null. */
  function nhanTin(u, { now = Date.now() } = {}) {
    const z = u?.message;
    if (!z?.message_id) return null;
    return giaoDich(db, () => {
      if (q.theoGoc.get(nenTang, String(z.message_id))) return null;
      const ch = String(z.chat?.id ?? ""), uid = String(z.from?.id ?? ""), anh = z.photo_url || z.photo || "";
      const goc = String(z.text ?? z.caption ?? ""), noiDung = boMention(goc), luc = msZalo(z.date) ?? now;
      const ref = suyTraLoi(ch, uid, noiDung, !!anh, luc);
      const t = { id: idMoi(luc), nen_tang: nenTang, chat_id: ch, ma: (q.maCuoi.get(ch)?.m ?? 0) + 1, msg_goc: String(z.message_id),
        nguoi_id: uid, ten: z.from?.display_name || "", la_bot: 0, noi_dung: noiDung, noi_dung_goc: goc, luc,
        anh_url: anh || null, anh_tt: anh ? "cho_tai" : "khong_co", tra_loi_cho: ref?.id ?? null, kieu_tra_loi: ref?.kieu ?? null, trang_thai: "moi" };
      q.them.run(t);
      q.themViec.run(t.id, now, now);
      return lay(t.id);
    });
  }

  /** Lưu tin bot đã gửi được (hộp thư gọi sau sendMessage). hoi_ve = id khoản mà câu này hỏi về. */
  function ghiBot({ chat_id, msg_goc = null, luc = Date.now(), noi_dung = "", hoi_ve = null }) {
    const t = { id: idMoi(luc), nen_tang: nenTang, chat_id: String(chat_id), ma: null, msg_goc: msg_goc == null ? null : String(msg_goc),
      nguoi_id: "bot", ten: tenBot, la_bot: 1, noi_dung, noi_dung_goc: noi_dung, luc: Number(luc), anh_url: null, anh_tt: "khong_co",
      tra_loi_cho: hoi_ve == null ? null : String(hoi_ve), kieu_tra_loi: null, trang_thai: null };
    q.them.run(t);
    return lay(t.id);
  }

  /** Tin t trả lời khoản nào: { goc: khoản, cauHoi: câu hỏi cuối của bot về khoản đó | null } hoặc null. */
  function khoanGocCua(t) {
    const r = t?.tra_loi_cho ? lay(t.tra_loi_cho) : null;
    if (!r) return null;
    if (r.la_bot) return { goc: lay(r.tra_loi_cho), cauHoi: r };
    const h = q.cauHoiCuoi.get(r.id);
    return { goc: r, cauHoi: h ? lay(h.id) : null };
  }

  return {
    lay, nhanTin, ghiBot, khoanGocCua,
    tinTrongNhom: (ch, tuMs) => q.trongNhom.all(String(ch), tuMs),
    dangHoiCua: (ch, uid, luc = Date.now()) => q.dangHoi.all(String(ch), String(uid), luc - 7 * 86400e3),
    danhDauDangHoi: (id) => { q.sangDangHoi.run(String(id)) },
    boHoi: (id) => { q.boHoi.run(String(id)) },
    danhDauDaGhi: (id) => { q.daGhi.run(String(id)) },
    datAnh: (id, { tep = null, tt }) => { q.datAnh.run(tep, tt, String(id)) },
    tinChoTaiAnh: () => q.choTai.all(),
  };
}

/** Adapter "dáng tin Discord" cho lõi so-core (viết cho Discord: id so bằng BigInt, author.bot, attachments, ✅/❓ của bot,
 *  message_reference). Ảnh chỉ đính kèm khi đã tải về máy — npso.taiAnh đọc thẳng tệp (`tep`), không gọi mạng. */
export function nguonTinSoCore(kho) {
  const dang = (r, choQuetBu = false) => r && ({
    id: r.id, channel_id: r.chat_id, ma: r.ma, content: r.noi_dung, timestamp: new Date(r.luc).toISOString(),
    author: { id: r.la_bot ? "bot" : r.nguoi_id, global_name: r.ten || "", bot: !!r.la_bot },
    attachments: r.anh_tt === "da_tai" && r.anh_tep ? [{ url: r.anh_url, tep: r.anh_tep, content_type: "image/jpeg", filename: `anh-${r.id}.jpg` }] : [],
    reactions: r.trang_thai === "da_ghi" ? [{ emoji: { name: "✅" }, me: true }] : r.trang_thai === "dang_hoi" ? [{ emoji: { name: "❓" }, me: true }] : [],
    // Khoản đang hỏi trả cho quét bù KHÔNG kèm Reply suy ra, không thì so-core coi nó là câu trả lời và nó biến mất (review I1).
    ...(r.tra_loi_cho && !(choQuetBu && r.trang_thai === "dang_hoi") ? { message_reference: { message_id: r.tra_loi_cho, type: 0 } } : {}),
  });
  return {
    layTin: async (ch, id) => { const r = kho.lay(id); return r && r.chat_id === String(ch) ? dang(r) : null },
    layTinKenh: async (ch, tuMs) => kho.tinTrongNhom(String(ch), tuMs).map((r) => dang(r, true)),
    react: async (ch, id, e) => { if (e === "✅") kho.danhDauDaGhi(id); else if (e === "❓") kho.danhDauDangHoi(id) },
    unreact: async (ch, id, e) => { if (e === "❓") kho.boHoi(id) },
    link: (ch, id) => `Zalo #${kho.lay(id)?.ma ?? "?"} (tin ${id})`,
  };
}
