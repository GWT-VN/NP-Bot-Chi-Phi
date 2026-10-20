#!/usr/bin/env node
// Tách chi phí HCM theo đơn vị (chủ dự án 2026-10-20): mỗi đơn vị một tab "HCM - <đơn vị>", công thức QUERY đọc thẳng tab sổ —
// cột R (Địa điểm) chứa "HCM", cột S (Đơn vị) — nên tự cập nhật khi kế toán điền R/S. Tab báo cáo, không vào tab quỹ; chạy lại = ghi đè.
//   node dichvu/tach-hcm.mjs ["tên tab sổ"]     mặc định: tab của nhóm Zalo đầu tiên trong config (trên Mac mini — cần đăng nhập Google của bot)
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import * as books from "../books.mjs";

export const DON_VI = ["Shopee", "GWT", "Other"];
const COT = ["STT", "Ngày", "Diễn giải", "Người", "Hoá đơn đỏ", "Nguồn quỹ", "Chi", "URL chứng từ", "Ghi chú"]; // A..I của tab mới

export function tabHcm(so, dv) {
  const S = books.ARG_SEP;
  const q = `=QUERY('${so}'!A2:S${S} "select A, B, C, D, E, F, H, O, K where upper(R) contains 'HCM' and upper(S) = '${dv.toUpperCase()}' and H > 0 order by B format H '#,##0'"${S} 0)`;
  // Dòng 2: QUERY ở A2 tràn A..I; J trống; K2 tổng chi, L2 số khoản (cột Chi của tab mới là G).
  return { title: `HCM - ${dv}`, rows: [[q, ...Array(9).fill(""), "=SUM(G2:G)", "=COUNT(G2:G)"]], tieuDeThem: [...COT, "", "Tổng chi", "Số khoản"], cotThemTu: 0 };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const cfg = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));
  const so = process.argv[2] ?? Object.values(cfg.zalo.groups)[0].tab;
  for (const dv of DON_VI) {
    const t = tabHcm(so, dv);
    await books.ghiTabTheoMau(cfg.book.sheetId, t);
    console.log(`đã ghi tab "${t.title}" (lọc từ tab "${so}")`);
  }
}
