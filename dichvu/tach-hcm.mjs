#!/usr/bin/env node
// Tách chi phí theo địa điểm / đơn vị (chủ dự án 2026-10-21). KHÔNG GHI GÌ VÀO TAB SỔ GỐC (chủ dự án dặn) — chỉ đọc và nhân bản nó.
// Tab SỐNG nhân bản từ tab sổ, mỗi tab có ô "Tổng chi (theo lọc)" ở dòng 1 (SUBTOTAL — lọc gì ra tổng nấy): "HCM" (cột R Địa điểm chứa HCM, đủ 3 đơn vị, xếp theo Đơn vị rồi Ngày) + "Shopee" / "GWT" /
// "Other" (cột S Đơn vị chứa tên đơn vị — MỌI địa điểm) + "Khác - chưa có đơn vị" (cột S không chứa tên nào trong 3 đơn vị, kể cả
// trống; dòng có ngày) → 3 tab đơn vị + tab này = tổng sổ (trừ khi một ô ghi HAI đơn vị — dòng đó vào 2 tab).
// Mỗi tab là một hàm FILTER đọc thẳng tab sổ → sửa ở sổ là tab ăn theo, KHÔNG cần chạy lại. Tab đã có thì không đụng (tab bản chụp
// cũ: xoá rồi chạy lại). In thêm bảng đếm Địa điểm × Đơn vị và dòng có tiền mà không có ngày (dòng tổng gõ tay → SUBTOTAL cộng cả nó).
//   node dichvu/tach-hcm.mjs ["tên tab sổ"]     mặc định: tab của nhóm Zalo đầu tiên trong config (trên Mac mini — cần đăng nhập Google của bot)
import { readFileSync } from "node:fs";
import * as books from "../books.mjs";

const cfg = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));
const sheetId = cfg.book.sheetId, so = process.argv[2] ?? Object.values(cfg.zalo.groups)[0].tab;
const R = 17, S = 18; // Địa điểm, Đơn vị — cột kế toán thêm sau O

const dem = new Map(), rows = await books.docSo(sheetId, so);
for (const r of rows.filter((x) => x.chi)) { const k = `${JSON.stringify(String(r.hang[R] ?? ""))} × ${JSON.stringify(String(r.hang[S] ?? ""))}`; dem.set(k, (dem.get(k) || 0) + 1) }
console.log(`Sổ "${so}": ${rows.filter((x) => x.chi).length} dòng có tiền chi — Địa điểm × Đơn vị:`);
for (const [k, n] of [...dem].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);
for (const r of rows.filter((x) => !x.ngay && (x.thu || x.chi))) console.log(`ℹ️ dòng ${r.dong} của sổ có tiền mà không có ngày (dòng tổng gõ tay?) — các tab tách không lấy dòng này`);

const soCot = await books.doRongForm(sheetId, so);
const DON_VI = ["Shopee", "GWT", "Other"];
const tabs = [["HCM", [{ cot: R, chua: "HCM" }], [S + 1, 2]], ...DON_VI.map((dv) => [dv, [{ cot: S, chua: dv }], []]),
  ["Khác - chưa có đơn vị", [...DON_VI.map((dv) => ({ cot: S, khongChua: dv })), { cot: 1, coGiaTri: true }], []]];
for (const [title, loc, sapXep] of tabs) {
  const moi = await books.taoTabLoc(sheetId, { mau: so, title, loc, soCot, sapXep });
  if (moi) await books.ghiTongLoc(sheetId, title, { soCot }); // ô tổng theo lọc ghi vào TAB MỚI, không vào sổ gốc
  console.log(moi ? `đã tạo tab "${title}" (tự cập nhật theo sổ)` : `tab "${title}" đã có — không đụng; tab bản chụp cũ thì xoá rồi chạy lại`);
}
