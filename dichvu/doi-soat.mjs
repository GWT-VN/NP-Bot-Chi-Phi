#!/usr/bin/env node
// Đối soát tin Zalo ↔ sổ (chủ dự án 2026-10-20): in mọi tin có tag bot của từng nhóm đã khai, kèm dòng sổ khớp theo Mã tin, để
// người (hoặc Claude) soát số tiền / quỹ / ngày / nội dung. CSDL mở CHỈ ĐỌC; Sheet chỉ đọc, trừ --ghi-tab (chỉ ghi tab báo cáo riêng,
// không đụng tab kênh / tab quỹ). Tin không tag bot thì Zalo không gửi cho bot nên không có ở đây.
//   node dichvu/doi-soat.mjs                              in ra màn hình (trên Mac mini — cần CSDL dịch vụ + đăng nhập Google của bot)
//   node dichvu/doi-soat.mjs --ghi-tab [--tin-thu Dũng]   ghi tab "Đối soát Zalo" (form như tab kênh; tin thử để trống tiền;
//                                                         không vào tab quỹ; chạy lại = ghi đè từ dòng 2)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { thuMucDichVu } from "./chinh.mjs";
import * as books from "../books.mjs";
const { buildFundRow, anToan, COT, SO_COT } = books;

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
const RE_LINK = /\n📎 [^\n]*?(https:\/\/\S+)/;
export const TIEU_DE_THEM = ["Zalo #", "Giờ gửi", "Dòng sổ gốc", "Tình trạng đối soát"];

/** Dòng cho tab "Đối soát Zalo" — FORM giống tab kênh để đặt cạnh nhau mà soát (chủ dự án 2026-10-20): A–O dựng bằng buildFundRow
 *  (STT, Tồn công thức như sổ), M/N và các cột kế toán từ P tới `soCot` chép từ dòng sổ, rồi TIEU_DE_THEM. Mỗi KHOẢN bot đã ghi một
 *  dòng, theo thời gian. Giá trị lấy từ dòng sổ hiện tại; dòng đã mất thì từ tin ✅ bot trả lúc ghi. Tình trạng so dòng sổ với lúc
 *  bot ghi (thấy chỗ ai đó sửa / xoá trên Sheet). Người trong `tinThu` (tin thử) vẫn có dòng nhưng để trống tiền — không cộng vào
 *  tổng, không xét trùng. Tin chưa ghi sổ (đang hỏi, không phải khoản) không vào bảng — xem bản in màn hình. */
export function bangDoiSoat({ tins, rows, tinThu = [], soCot = SO_COT }) {
  const theoId = new Map(tins.map((t) => [t.id, t])), dong = new Map(rows.map((r) => [String(r.maTin), r]));
  const goc = (id) => { let t = theoId.get(id); if (t?.la_bot) t = theoId.get(t.tra_loi_cho); return t };
  const botGhi = new Map(); // #N → giá trị bot ghi lúc ✅ (lấy lần đầu)
  for (const t of tins) {
    const m = t.la_bot ? RE_DA_GHI.exec(t.noi_dung) : null;
    if (m && !botGhi.has(Number(m[1]))) botGhi.set(Number(m[1]), { ngay: m[2] ?? null, loai: m[3], tien: Number(m[4].replaceAll(".", "")), quy: m[5], hd: m[6],
      dg: m[7].replace(/ \(chưa lưu được ảnh chứng từ[^)]*\)$/, ""), link: RE_LINK.exec(t.noi_dung)?.[1] ?? "" });
  }
  const laKhoan = (t) => !t.tra_loi_cho || dong.has(t.id) || !goc(t.tra_loi_cho);
  const ra = [], truoc = [];
  for (const t of tins) {
    if (t.la_bot || !laKhoan(t)) continue;
    const r = dong.get(t.id), b = botGhi.get(t.ma), nam = ngayGio(t.luc).slice(6, 10);
    const v = r ? { ngay: r.ngay, thu: r.thu, chi: r.chi, quy: r.nguonQuy, hd: r.hoaDon, dg: r.dienGiai, nguoi: r.nguoi, link: r.url || b?.link || "" }
      : b ? { ngay: b.ngay ? `${b.ngay}/${nam}` : ngayGio(t.luc).slice(0, 10), thu: b.loai === "THU" ? b.tien : 0, chi: b.loai === "CHI" ? b.tien : 0,
        quy: b.quy, hd: b.hd, dg: b.dg, nguoi: t.ten, link: b.link }
      : null;
    if (!v) continue; // chưa ghi sổ → không phải khoản
    const soTien = v.thu || v.chi, thu = tinThu.includes(t.ten), tt = [];
    if (thu) tt.push(`Tin thử — không tính tiền (bot ghi: ${tien(soTien)})`);
    else {
      if (!r) tt.push("KHÔNG CÒN TRONG SỔ (lấy theo tin ✅ của bot)");
      else if (b) {
        if (b.quy !== r.nguonQuy) tt.push(`Quỹ đã đổi (bot ghi: ${b.quy})`);
        if (b.tien !== soTien) tt.push(`Số tiền đã đổi (bot ghi: ${tien(b.tien)})`);
        if (b.ngay && !String(r.ngay).startsWith(b.ngay)) tt.push(`Ngày đã đổi (bot ghi: ${b.ngay})`);
        if (b.hd !== r.hoaDon) tt.push(`HĐ đã đổi (bot ghi: ${b.hd})`);
      }
      const trung = truoc.find((p) => p.ten === t.ten && p.soTien === soTien && t.luc - p.luc <= 3600e3);
      if (trung) tt.push(`Có thể trùng #${trung.ma}`);
      truoc.push({ ten: t.ten, soTien, luc: t.luc, ma: t.ma });
    }
    const h = buildFundRow({ loai: v.thu ? "thu" : "chi", ngay: v.ngay, dienGiai: v.dg, nguoi: v.nguoi, hoaDon: v.hd, nguonQuy: v.quy,
      amount: thu ? 0 : soTien, link: v.link, ghiChu: r?.ghiChu ?? "", maTin: t.id });
    if (r) h[COT.daHoan] = r.hang[COT.daHoan] ?? "", h[COT.ngayHoan] = r.hang[COT.ngayHoan] ?? "";
    for (let i = SO_COT; i < soCot; i++) h[i] = anToan(r?.hang[i] ?? "");
    ra.push([...h, t.ma, ngayGio(t.luc), r ? r.dong : "", tt.join("; ") || "Khớp"]);
  }
  return ra;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const GOC = dirname(dirname(fileURLToPath(import.meta.url)));
  const cfg = JSON.parse(readFileSync(join(GOC, "config.json"), "utf8"));
  const db = new DatabaseSync(thuMucDichVu().csdl, { readOnly: true });
  const a = process.argv, tinThu = a.flatMap((x, i) => (x === "--tin-thu" ? [a[i + 1]] : []));
  const nhom = Object.entries(cfg.zalo?.groups || {});
  for (const [ch, n] of nhom) {
    const tins = db.prepare("SELECT * FROM tin WHERE chat_id=? ORDER BY luc, id").all(ch).map((r) => ({ ...r }));
    const rows = await books.docSo(cfg.book.sheetId, n.tab);
    if (a.includes("--ghi-tab")) {
      const soCot = (await books.docTieuDe(cfg.book.sheetId, n.tab)).length, ten = nhom.length > 1 ? `Đối soát Zalo - ${n.tab}` : "Đối soát Zalo";
      const bang = bangDoiSoat({ tins, rows, tinThu, soCot });
      await books.ghiTabTheoMau(cfg.book.sheetId, { mau: n.tab, title: ten, rows: bang, tieuDeThem: TIEU_DE_THEM, cotThemTu: soCot });
      const dem = {};
      for (const d of bang) for (const x of d.at(-1).split("; ")) { const k = x.replace(/ \(.*$/, "").replace(/#\d+$/, "#…"); dem[k] = (dem[k] || 0) + 1 }
      console.log(`đã ghi tab "${ten}": ${bang.length} khoản —`, JSON.stringify(dem));
      continue;
    }
    console.log(`\n=== ${n.name} → tab "${n.tab}" · ${tins.filter((t) => !t.la_bot).length} tin có tag bot · ${rows.length} dòng sổ`);
    for (const d of doiSoat({ tins, rows })) console.log(d);
  }
  db.close();
}
