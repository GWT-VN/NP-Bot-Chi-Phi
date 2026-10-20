#!/usr/bin/env node
// Đối soát tin Zalo ↔ sổ (chủ dự án 2026-10-20): in mọi tin có tag bot của từng nhóm đã khai, kèm dòng sổ khớp theo Mã tin, để
// người (hoặc Claude) soát số tiền / quỹ / ngày / nội dung. CSDL mở CHỈ ĐỌC; Sheet chỉ đọc, trừ --ghi-tab (chỉ ghi tab báo cáo riêng,
// không đụng tab kênh / tab quỹ). Tin không tag bot thì Zalo không gửi cho bot nên không có ở đây.
//   node dichvu/doi-soat.mjs                              in ra màn hình (trên Mac mini — cần CSDL dịch vụ + đăng nhập Google của bot)
//   node dichvu/doi-soat.mjs --so-sanh [--tin-thu Dũng] so với sổ: tổng hai bên, khoản lệch, dòng sổ không từ Zalo
//   node dichvu/doi-soat.mjs --ghi-lai 88,89 [--xac-nhan]  ghi lại khoản ✅ bị mất khỏi sổ rồi sắp tab theo ngày (không --xac-nhan = chỉ xem trước)
//   node dichvu/doi-soat.mjs --tin 88,89                 chẩn đoán từng khoản: tin gốc, bot trả lời, việc, nhật ký, dòng Sheet khớp
//   node dichvu/doi-soat.mjs --ghi-tab [--tin-thu Dũng]   ghi tab "Đối soát Zalo" (form như tab kênh; tin thử để trống tiền;
//                                                         không vào tab quỹ; chạy lại = ghi đè từ dòng 2)
import { readFileSync, readdirSync } from "node:fs";
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
// "Zalo #" ghi dạng "#N" (chủ dự án 2026-10-20): Zalo không có link tới từng tin — dán "#N" vào ô tìm trong nhóm ra tin ✅ #N của bot,
// tin gốc nằm ngay trước đó.
const RE_LINK = /\n📎 [^\n]*?(https:\/\/\S+)/;
export const TIEU_DE_THEM = ["Zalo #", "Giờ gửi", "Dòng sổ gốc", "Tình trạng đối soát"];

/** Dòng cho tab "Đối soát Zalo" — FORM giống tab kênh để đặt cạnh nhau mà soát (chủ dự án 2026-10-20): A–O dựng bằng buildFundRow
 *  (STT, Tồn công thức như sổ), M/N và các cột kế toán từ P tới `soCot` chép từ dòng sổ, rồi TIEU_DE_THEM. Mỗi KHOẢN bot đã ghi một
 *  dòng, theo thời gian. Giá trị lấy từ dòng sổ hiện tại; dòng đã mất thì từ tin ✅ bot trả lúc ghi. Tình trạng so dòng sổ với lúc
 *  bot ghi (thấy chỗ ai đó sửa / xoá trên Sheet). Người trong `tinThu` (tin thử) vẫn có dòng nhưng để trống tiền — không cộng vào
 *  tổng, không xét trùng. `tinhKhoanMat: false` (tab — chủ dự án 2026-10-20): khoản đã bỏ khỏi sổ cũng để trống tiền, tổng tab =
 *  tổng khoản Zalo đang ở sổ; mặc định (so sánh / ghi lại) giữ số tiền theo tin ✅. Tin chưa ghi sổ (đang hỏi, không phải khoản) không vào bảng — xem bản in màn hình. */
export function bangDoiSoat({ tins, rows, tinThu = [], soCot = SO_COT, tinhKhoanMat = true }) {
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
      if (!r) tt.push(tinhKhoanMat ? "KHÔNG CÒN TRONG SỔ (lấy theo tin ✅ của bot)" : `KHÔNG CÒN TRONG SỔ — không tính tiền (bot ghi: ${tien(soTien)})`);
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
      amount: thu || (!r && !tinhKhoanMat) ? 0 : soTien, link: v.link, ghiChu: r?.ghiChu ?? "", maTin: t.id });
    if (r) h[COT.daHoan] = r.hang[COT.daHoan] ?? "", h[COT.ngayHoan] = r.hang[COT.ngayHoan] ?? "";
    for (let i = SO_COT; i < soCot; i++) h[i] = anToan(r?.hang[i] ?? "");
    ra.push([...h, `#${t.ma}`, ngayGio(t.luc), r ? r.dong : "", tt.join("; ") || "Khớp"]);
  }
  return ra;
}

/** So bảng Đối soát (bangDoiSoat) với sổ: tổng chi hai bên, khoản Zalo lệch (bỏ "Khớp" và tin thử), dòng sổ không ứng với khoản
 *  Zalo nào (Discord / nhập tay / mã tin lạ). 4 cột đối soát luôn ở cuối dòng nên đọc bằng .at(-k), không phụ thuộc độ rộng form. */
export function soSanh({ bang, rows }) {
  const tong = (xs) => xs.reduce((s, x) => s + (Number(x) || 0), 0), khop = new Set(bang.map((h) => h.at(-2)).filter(Boolean));
  const lech = bang.filter((h) => h.at(-1) !== "Khớp" && !h.at(-1).startsWith("Tin thử"));
  // Dòng không có ngày (dòng tổng gõ tay…) không phải khoản: không cộng vào tổng sổ, liệt kê riêng.
  const khongNgay = rows.filter((r) => !r.ngay); rows = rows.filter((r) => r.ngay);
  const ngoai = rows.filter((r) => !khop.has(r.dong));
  const so = (thu, chi) => (thu ? `THU ${tien(thu)}` : `CHI ${tien(chi)}`);
  return [
    `Tổng chi — sổ: ${tien(tong(rows.map((r) => r.chi)))} (${rows.filter((r) => r.chi).length} khoản) · khoản Zalo bot ghi: ${tien(tong(bang.map((h) => h[7])))} (${bang.filter((h) => h[7]).length} khoản)`,
    `\nKhoản Zalo LỆCH với sổ (${lech.length}):`,
    ...lech.map((h) => `  ${h.at(-4)} ${h[3]} · ${h[1]} · ${so(h[6], h[7])} · ${h[5]} · ${h.at(-2) ? `sổ dòng ${h.at(-2)}` : "không có trong sổ"} → ${h.at(-1)}`),
    `\nDòng sổ KHÔNG từ khoản Zalo (${ngoai.length}) — Discord / nhập tay / mã tin lạ:`,
    ...ngoai.map((r) => `  dòng ${r.dong} · ${r.ngay} · ${r.nguoi} · ${so(r.thu, r.chi)} · ${r.nguonQuy} · "${cat(r.dienGiai, 60)}" · mã tin: ${r.maTin || "trống"}`),
    ...(khongNgay.length ? [`\nDòng KHÔNG có ngày — không cộng vào tổng sổ (${khongNgay.length}): ${khongNgay.map((r) => `dòng ${r.dong} (${so(r.thu, r.chi)})`).join(", ")}`] : []),
  ];
}

/** Ghi lại khoản bot đã ✅ mà KHÔNG còn trong sổ (sự cố 19/10: append dò bảng ghi đè dòng 41). Dòng form A–O lấy từ bảng đối soát
 *  (soCot mặc định = A–O); khoản còn trong sổ hoặc không có tin ✅ thì bỏ, kèm lý do. Không ghi _state: mã tin đã có ở đó. */
export function dongGhiLai({ bang, ma, ghiChu }) {
  const ghi = [], bo = [];
  for (const m of ma) {
    const h = bang.find((x) => x.at(-4) === `#${m}`);
    if (!h) bo.push(`#${m} không thấy trong tin bot đã ghi`);
    else if (h.at(-2)) bo.push(`#${m} đang ở sổ dòng ${h.at(-2)}`);
    else { const r = h.slice(0, SO_COT); r[COT.ghiChu] = anToan(ghiChu); ghi.push(r) }
  }
  return { ghi, bo };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const GOC = dirname(dirname(fileURLToPath(import.meta.url)));
  const cfg = JSON.parse(readFileSync(join(GOC, "config.json"), "utf8"));
  const db = new DatabaseSync(thuMucDichVu().csdl, { readOnly: true });
  const a = process.argv, tinThu = a.flatMap((x, i) => (x === "--tin-thu" ? [a[i + 1]] : []));
  const nhom = Object.entries(cfg.zalo?.groups || {});
  for (const [ch, n] of nhom) {
    const tins = db.prepare("SELECT * FROM tin WHERE chat_id=? ORDER BY luc, id").all(ch).map((r) => ({ ...r }));
    if (a.includes("--tin")) { // chẩn đoán từng khoản: tin gốc, bot trả lời, việc, nhật ký, và mọi dòng Sheet có mã tin / số tiền đó
      const suKien = readdirSync(thuMucDichVu().logs).filter((f) => /^dichvu-.*\.jsonl$/.test(f)).sort()
        .flatMap((f) => readFileSync(join(thuMucDichVu().logs, f), "utf8").split("\n").flatMap((d) => { try { return [JSON.parse(d)] } catch { return [] } }));
      const canTim = [];
      for (const ma of a[a.indexOf("--tin") + 1].split(",").map(Number)) {
        const t = tins.find((x) => !x.la_bot && x.ma === ma);
        if (!t) { console.log(`\n#${ma}: không có trong CSDL nhóm "${n.name}"`); continue }
        console.log(`\n#${ma} ${t.ten} gửi ${ngayGio(t.luc)} · ảnh: ${t.anh_tt} · trạng thái: ${t.trang_thai} · mã ${t.id}\n  "${cat(t.noi_dung, 600)}"`);
        for (const b of tins.filter((x) => x.la_bot && (x.tra_loi_cho === t.id || x.noi_dung.startsWith(`✅ #${ma} `)))) {
          console.log(`  bot ${ngayGio(b.luc)}: ${cat(b.noi_dung, 400)}`);
          const m = RE_DA_GHI.exec(b.noi_dung); if (m) canTim.push(Number(m[4].replaceAll(".", "")));
        }
        const v = db.prepare("SELECT * FROM viec WHERE tin_id=?").get(t.id);
        if (v) console.log(`  việc: ${v.trang_thai} · ${v.so_lan} lần · nhận ${ngayGio(v.tao_luc)} · xong ${v.xong_luc ? ngayGio(v.xong_luc) : "—"}${v.loi_cuoi ? ` · lỗi: ${cat(v.loi_cuoi, 200)}` : ""}`);
        for (const e of suKien.filter((e) => e.tin === t.id || e.nhan === t.id)) console.log(`  nhật ký ${ngayGio(Date.parse(e.ts))}: ${JSON.stringify(e)}`);
        canTim.push(t.id);
      }
      console.log(`\nSheet — mọi dòng (mọi tab) có mã tin / số tiền trên: ${canTim.join(", ")}`);
      for (const h of await books.timKhapSheet(cfg.book.sheetId, canTim)) console.log(`  "${h.tab}" dòng ${h.dong}: ${cat(h.hang.slice(0, 15).join(" | "), 260)}`);
      continue;
    }
    const rows = await books.docSo(cfg.book.sheetId, n.tab);
    if (a.includes("--ghi-lai")) { // xem trước; thêm --xac-nhan mới ghi vào sổ
      const ma = a[a.indexOf("--ghi-lai") + 1].split(",").map(Number);
      const { ghi, bo } = dongGhiLai({ bang: bangDoiSoat({ tins, rows }), ma, ghiChu: `Ghi lại ${ngayGio(Date.now()).slice(0, 10)}: dòng gốc bị bot ghi đè (lỗi 19/10/2026)` });
      for (const x of bo) console.log(`  bỏ qua ${x}`);
      for (const r of ghi) console.log(`  ${r[1]} · ${r[2]} · ${r[3]} · ${r[5]} · ${tien(r[6] || r[7])}`);
      if (!a.includes("--xac-nhan")) { console.log(`XEM TRƯỚC ${ghi.length} dòng — chưa ghi. Thêm --xac-nhan để ghi vào tab "${n.tab}" rồi sắp cả tab theo ngày.`); continue }
      if (ghi.length) await books.commit({ sheetId: cfg.book.sheetId, tab: n.tab, rows: ghi, msgIds: [] });
      await books.sapXepTheoNgay(cfg.book.sheetId, n.tab); // chủ dự án: bổ sung xong thì đặt lại đúng thứ tự ngày
      console.log(`đã ghi ${ghi.length} dòng và sắp tab "${n.tab}" theo ngày`);
      continue;
    }
    if (a.includes("--so-sanh")) { for (const d of soSanh({ bang: bangDoiSoat({ tins, rows, tinThu }), rows })) console.log(d); continue }
    if (a.includes("--ghi-tab")) {
      const soCot = (await books.docTieuDe(cfg.book.sheetId, n.tab)).length, ten = nhom.length > 1 ? `Đối soát Zalo - ${n.tab}` : "Đối soát Zalo";
      const bang = bangDoiSoat({ tins, rows, tinThu, soCot, tinhKhoanMat: false });
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
