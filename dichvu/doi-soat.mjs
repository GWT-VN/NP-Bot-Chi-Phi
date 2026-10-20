#!/usr/bin/env node
// Đối soát tin Zalo ↔ sổ (chủ dự án 2026-10-20): in mọi tin có tag bot của từng nhóm đã khai, kèm dòng sổ khớp theo Mã tin, để
// người (hoặc Claude) soát số tiền / quỹ / ngày / nội dung. CHỈ ĐỌC (CSDL mở chỉ đọc, Sheet chỉ đọc). Tin không tag bot thì Zalo
// không gửi cho bot nên không có ở đây.
//   node dichvu/doi-soat.mjs        (trên Mac mini — cần CSDL dịch vụ + đăng nhập Google của bot)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { thuMucDichVu } from "./chinh.mjs";

const gio = (luc) => new Date(luc).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const tien = (n) => Number(n || 0).toLocaleString("vi-VN");
const cat = (s, n) => { const x = String(s ?? "").replace(/\s+/g, " ").trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x };

/** tins: hàng `tin` (người dùng + bot) của MỘT nhóm, theo thời gian; rows: books.docSo của tab nhóm → các dòng chữ để soát. */
export function doiSoat({ tins, rows }) {
  const theoId = new Map(tins.map((t) => [t.id, t])), dong = new Map(rows.map((r) => [String(r.maTin), r]));
  const goc = (id) => { let t = theoId.get(id); if (t?.la_bot) t = theoId.get(t.tra_loi_cho); return t };
  const ra = [];
  for (const t of tins.filter((x) => !x.la_bot)) {
    const r = dong.get(t.id), g = t.tra_loi_cho ? goc(t.tra_loi_cho) : null;
    ra.push(`#${t.ma} ${gio(t.luc)} ${t.ten}${g ? ` (trả lời #${g.ma})` : ""}${t.anh_tt === "da_tai" ? " [ảnh]" : ""}: "${cat(t.noi_dung, 140)}"`);
    if (r) ra.push(`   SỔ dòng ${r.dong}: ${r.ngay} · ${r.thu ? `THU ${tien(r.thu)}` : `CHI ${tien(r.chi)}`} · ${r.nguonQuy || "—"} · HĐ ${r.hoaDon || "—"} · "${cat(r.dienGiai, 90)}"${r.ghiChu ? ` · GC: ${cat(r.ghiChu, 70)}` : ""}`);
    else if (!g) ra.push(`   SỔ: không có dòng (trạng thái tin: ${t.trang_thai})`);
  }
  const ids = new Set(tins.map((t) => t.id));
  for (const r of rows) {
    if (/^\d{16}$/.test(String(r.maTin)) && !ids.has(String(r.maTin))) ra.push(`?? SỔ dòng ${r.dong} mã tin ${r.maTin} không thấy tin Zalo: ${r.ngay} · CHI ${tien(r.chi)} · "${cat(r.dienGiai, 90)}"`);
  }
  return ra;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const GOC = dirname(dirname(fileURLToPath(import.meta.url)));
  const cfg = JSON.parse(readFileSync(join(GOC, "config.json"), "utf8"));
  const books = await import("../books.mjs");
  const db = new DatabaseSync(thuMucDichVu().csdl, { readOnly: true });
  for (const [ch, n] of Object.entries(cfg.zalo?.groups || {})) {
    const tins = db.prepare("SELECT * FROM tin WHERE chat_id=? ORDER BY luc, id").all(ch).map((r) => ({ ...r }));
    const rows = await books.docSo(cfg.book.sheetId, n.tab);
    console.log(`\n=== ${n.name} → tab "${n.tab}" · ${tins.filter((t) => !t.la_bot).length} tin có tag bot · ${rows.length} dòng sổ`);
    for (const d of doiSoat({ tins, rows })) console.log(d);
  }
  db.close();
}
