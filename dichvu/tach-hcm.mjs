#!/usr/bin/env node
// Tách chi phí HCM theo đơn vị (chủ dự án 2026-10-20): mỗi đơn vị một tab "HCM - <đơn vị>" = bản NHÂN BẢN tab sổ + bộ lọc
// cột R (Địa điểm) chứa "HCM" và cột S (Đơn vị) chứa tên đơn vị; T1..W1 tổng chi / số khoản đang hiện. Bản chụp lúc chạy — sổ đổi
// thì xoá 3 tab rồi chạy lại (tab đã có thì không đụng). Trước đó in bảng đếm Địa điểm × Đơn vị của sổ để soát giá trị lệch.
//   node dichvu/tach-hcm.mjs ["tên tab sổ"]     mặc định: tab của nhóm Zalo đầu tiên trong config (trên Mac mini — cần đăng nhập Google của bot)
import { readFileSync } from "node:fs";
import * as books from "../books.mjs";

const cfg = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));
const sheetId = cfg.book.sheetId, so = process.argv[2] ?? Object.values(cfg.zalo.groups)[0].tab;
const R = 17, S = 18; // Địa điểm, Đơn vị — cột kế toán thêm sau O

const dem = new Map(), rows = await books.docSo(sheetId, so);
for (const r of rows.filter((x) => x.chi)) { const k = `${JSON.stringify(String(r.hang[R] ?? ""))} × ${JSON.stringify(String(r.hang[S] ?? ""))}`; dem.set(k, (dem.get(k) || 0) + 1) }
console.log(`Sổ "${so}": ${rows.filter((x) => x.chi).length} khoản chi — Địa điểm × Đơn vị:`);
for (const [k, n] of [...dem].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);

const cotTong = (await books.docTieuDe(sheetId, so)).length;
for (const dv of ["Shopee", "GWT", "Other"]) {
  const title = `HCM - ${dv}`;
  const moi = await books.nhanBanLoc(sheetId, { mau: so, title, loc: [{ cot: R, chua: "HCM" }, { cot: S, chua: dv }], cotTong });
  console.log(moi ? `đã tạo tab "${title}" (bộ lọc HCM + ${dv})` : `tab "${title}" đã có — không đụng; muốn làm lại thì xoá tab đó rồi chạy lại`);
}
