#!/usr/bin/env node
// Đối soát tin Zalo ↔ sổ (chủ dự án 2026-10-20): in mọi tin có tag bot của từng nhóm đã khai, kèm dòng sổ khớp theo Mã tin, để
// người (hoặc Claude) soát số tiền / quỹ / ngày / nội dung. CSDL mở CHỈ ĐỌC; Sheet chỉ đọc, trừ --ghi-tab (chỉ ghi tab báo cáo riêng,
// không đụng tab kênh / tab quỹ). Tin không tag bot thì Zalo không gửi cho bot nên không có ở đây.
//   node dichvu/doi-soat.mjs                              in ra màn hình (trên Mac mini — cần CSDL dịch vụ + đăng nhập Google của bot)
//   node dichvu/doi-soat.mjs --ghi-tab [--bo-nguoi Dũng]  ghi tab "Đối soát Zalo" trong sổ (báo cáo, không vào tab quỹ; chạy lại = ghi đè)
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

const ngayGio = (luc) => new Date(luc).toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(",", "");
// Tin ✅ của bot: "✅ #12 Quỳnh Mai · 08/10 · CHI 400.000đ · GWT - Tiền mặt · HĐ Không · Xích lô…" (bản đầu 08/10 chưa có ngày).
const RE_DA_GHI = /^✅ #(\d+) .*? · (?:(\d{2}\/\d{2}) · )?(THU|CHI) ([\d.]+)đ · (.*?) · HĐ (.*?) · ([^\n]*)/;
export const COT_DOI_SOAT = ["STT", "Zalo #", "Giờ gửi", "Người gửi", "Ngày", "Thu", "Chi", "Nguồn quỹ", "Hoá đơn", "Diễn giải", "Dòng sổ", "Tình trạng", "Ghi chú sổ"];

/** Bảng cho tab "Đối soát Zalo": mỗi KHOẢN bot đã ghi (tin có tag bot) một dòng, theo thời gian — không kèm nguyên văn tin (chủ dự án
 *  2026-10-20). Giá trị lấy từ dòng sổ hiện tại; dòng đã mất thì lấy từ tin ✅ bot trả lúc ghi. Tình trạng so dòng sổ với lúc bot ghi
 *  (thấy chỗ ai đó sửa / xoá trên Sheet). Tin chưa ghi sổ (đang hỏi, không phải khoản) không vào bảng — xem bản in màn hình. */
export function bangDoiSoat({ tins, rows, boNguoi = [] }) {
  const theoId = new Map(tins.map((t) => [t.id, t])), dong = new Map(rows.map((r) => [String(r.maTin), r]));
  const goc = (id) => { let t = theoId.get(id); if (t?.la_bot) t = theoId.get(t.tra_loi_cho); return t };
  const botGhi = new Map(); // #N → giá trị bot ghi lúc ✅ (lấy lần đầu)
  for (const t of tins) {
    const m = t.la_bot ? RE_DA_GHI.exec(t.noi_dung) : null;
    if (m && !botGhi.has(Number(m[1]))) botGhi.set(Number(m[1]), { ngay: m[2] ?? null, loai: m[3], tien: Number(m[4].replaceAll(".", "")), quy: m[5], hd: m[6],
      dg: m[7].replace(/ \(chưa lưu được ảnh chứng từ[^)]*\)$/, "") });
  }
  const laKhoan = (t) => !t.tra_loi_cho || dong.has(t.id) || !goc(t.tra_loi_cho);
  const ra = [COT_DOI_SOAT], truoc = [];
  for (const t of tins) {
    if (t.la_bot || boNguoi.includes(t.ten) || !laKhoan(t)) continue;
    const r = dong.get(t.id), b = botGhi.get(t.ma), nam = ngayGio(t.luc).slice(6, 10);
    const v = r ? { ngay: r.ngay, thu: r.thu, chi: r.chi, quy: r.nguonQuy, hd: r.hoaDon, dg: r.dienGiai }
      : b ? { ngay: b.ngay ? `${b.ngay}/${nam}` : ngayGio(t.luc).slice(0, 10), thu: b.loai === "THU" ? b.tien : 0, chi: b.loai === "CHI" ? b.tien : 0, quy: b.quy, hd: b.hd, dg: b.dg }
      : null;
    if (!v) continue; // chưa ghi sổ → không phải khoản
    const tt = [];
    if (!r) tt.push("KHÔNG CÒN TRONG SỔ (lấy theo tin ✅ của bot)");
    else if (b) {
      if (b.quy !== r.nguonQuy) tt.push(`Quỹ đã đổi (bot ghi: ${b.quy})`);
      if (b.tien !== (r.thu || r.chi)) tt.push(`Số tiền đã đổi (bot ghi: ${tien(b.tien)})`);
      if (b.ngay && !String(r.ngay).startsWith(b.ngay)) tt.push(`Ngày đã đổi (bot ghi: ${b.ngay})`);
      if (b.hd !== r.hoaDon) tt.push(`HĐ đã đổi (bot ghi: ${b.hd})`);
    }
    const soTien = v.thu || v.chi, trung = truoc.find((p) => p.ten === t.ten && p.soTien === soTien && t.luc - p.luc <= 3600e3);
    if (trung) tt.push(`Có thể trùng #${trung.ma}`);
    truoc.push({ ten: t.ten, soTien, luc: t.luc, ma: t.ma });
    ra.push([ra.length, t.ma, ngayGio(t.luc), t.ten, v.ngay, v.thu || "", v.chi || "", v.quy, v.hd, v.dg, r ? r.dong : "", tt.join("; ") || "Khớp", r?.ghiChu ?? ""]);
  }
  return ra;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const GOC = dirname(dirname(fileURLToPath(import.meta.url)));
  const cfg = JSON.parse(readFileSync(join(GOC, "config.json"), "utf8"));
  const books = await import("../books.mjs");
  const db = new DatabaseSync(thuMucDichVu().csdl, { readOnly: true });
  const a = process.argv, boNguoi = a.flatMap((x, i) => (x === "--bo-nguoi" ? [a[i + 1]] : []));
  const nhom = Object.entries(cfg.zalo?.groups || {});
  for (const [ch, n] of nhom) {
    const tins = db.prepare("SELECT * FROM tin WHERE chat_id=? ORDER BY luc, id").all(ch).map((r) => ({ ...r }));
    const rows = await books.docSo(cfg.book.sheetId, n.tab);
    if (a.includes("--ghi-tab")) {
      const bang = bangDoiSoat({ tins, rows, boNguoi }), ten = nhom.length > 1 ? `Đối soát Zalo - ${n.tab}` : "Đối soát Zalo";
      await books.ghiTabBaoCao(cfg.book.sheetId, ten, bang);
      const dem = {};
      for (const d of bang.slice(1)) for (const x of d[11].split("; ")) { const k = x.replace(/ \(.*$/, "").replace(/#\d+$/, "#…"); dem[k] = (dem[k] || 0) + 1 }
      console.log(`đã ghi tab "${ten}": ${bang.length - 1} khoản —`, JSON.stringify(dem));
      continue;
    }
    console.log(`\n=== ${n.name} → tab "${n.tab}" · ${tins.filter((t) => !t.la_bot).length} tin có tag bot · ${rows.length} dòng sổ`);
    for (const d of doiSoat({ tins, rows })) console.log(d);
  }
  db.close();
}
