#!/usr/bin/env node
// Dựng Sheet "Sổ chi phí New Projects" + folder Drive "Chứng từ New Projects" — CHẠY 1 LẦN, bằng tài khoản ai@gwt.vn.
//   node setup.mjs            → tạo mới, ghi sheetId/folderId vào config.json (từ chối nếu config đã có sheetId)
//   node setup.mjs --force    → vẫn tạo mới dù config đã có (file cũ KHÔNG bị xoá — tự dọn tay trên Drive)
// Cần token Google của ai@gwt.vn (python3 lib/google-dang-nhap.py → ~/Bots/.secrets/np-google-token.json). Spec §4.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { google } from "googleapis";
import { getAuthClient } from "./lib/google-auth.mjs";
import { createFolder } from "./drive.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const TAI_KHOAN = "ai@gwt.vn";

// THUẦN (test được): mọi thứ cần dựng. Công thức viết sẵn dấu ';' vì file được TẠO với locale vi_VN.
export function keHoachSo({ quy = [] } = {}) {
  const loc = "'Sổ chi phí'!B2:H";
  return {
    title: "Sổ chi phí New Projects",
    locale: "vi_VN",
    timeZone: "Asia/Ho_Chi_Minh",
    folderName: "Chứng từ New Projects",
    tabs: [
      { title: "Sổ chi phí", hidden: false, header: ["STT", "Ngày", "Diễn giải", "Người", "Hoá đơn đỏ", "Nguồn quỹ", "Thu", "Chi", "Tồn", "Link chứng từ", "Ghi chú", "Mã tin"] },
      { title: "Tổng hợp", hidden: false, header: [] },
      // _state: bot append [thời điểm, "", "", msgId] — loadProcessed đọc D2:D. Không sửa tay.
      { title: "_state", hidden: true, header: ["Thời điểm", "", "", "msgId (đừng sửa)"] },
      // _rep: [msgId, id tin rep của bot, lý do] — để không nhắc lại cùng lý do và xoá đúng tin rep. Không sửa tay.
      { title: "_rep", hidden: true, header: ["msgId", "repMsgId", "Lý do"] },
    ],
    // Dropdown Nguồn quỹ (F) = tên chuẩn trong config.json `quy`; cột Mã tin (L, index 11) ẩn — chỉ máy dùng.
    dropdownQuy: quy.map((q) => q.ten),
    // KHÔNG chặn cứng: thêm quỹ vào config.json mà quên sửa dropdown thì Sheet chỉ cảnh báo, bot vẫn ghi được.
    dropdownChat: false,
    anCot: 11,
    // Ba bảng ĐỘC LẬP (mỗi bảng tự có Năm/Tháng): ghép chung cột sẽ lệch dòng khi một tháng thiếu loại này/loại kia.
    // Cột B phải là NGÀY thật (bot ghi dd/mm/yyyy USER_ENTERED ở locale vi_VN) thì year()/month() mới chạy.
    // Sổ v2: E Hoá đơn đỏ · F Nguồn quỹ · G Thu · H Chi.
    tongHop: {
      A1: "Theo tháng",
      A2: `=IFERROR(QUERY(${loc}; "select year(B), month(B)+1, sum(G), sum(H), count(H) where B is not null group by year(B), month(B)+1 order by year(B), month(B)+1 label year(B) 'Năm', month(B)+1 'Tháng', sum(G) 'Tổng thu', sum(H) 'Tổng chi', count(H) 'Số khoản chi'"; 0); "Chưa có dữ liệu")`,
      G1: "Chi theo hoá đơn đỏ (Có / Không)",
      G2: `=IFERROR(QUERY(${loc}; "select year(B), month(B)+1, sum(H) where B is not null and H is not null group by year(B), month(B)+1 pivot E label year(B) 'Năm', month(B)+1 'Tháng'"; 0); "Chưa có dữ liệu")`,
      M1: "Chi theo nguồn quỹ",
      M2: `=IFERROR(QUERY(${loc}; "select year(B), month(B)+1, sum(H) where B is not null and H is not null group by year(B), month(B)+1 pivot F label year(B) 'Năm', month(B)+1 'Tháng'"; 0); "Chưa có dữ liệu")`,
    },
  };
}

async function main() {
  process.chdir(DIR);
  const force = process.argv.includes("--force");
  const cfgPath = path.join(DIR, "config.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  if (cfg.book.sheetId && !force) throw new Error(`config.json đã có sheetId ${cfg.book.sheetId} — không tạo trùng. Cố ý tạo mới thì thêm --force.`);

  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });
  const sheets = google.sheets({ version: "v4", auth });
  // Chặn tạo nhầm tài khoản: token đăng nhập ai thì file thuộc người đó.
  const me = (await drive.about.get({ fields: "user(emailAddress)" })).data.user?.emailAddress;
  if (String(me).toLowerCase() !== TAI_KHOAN) throw new Error(`Token Google đang là '${me}', phải là ${TAI_KHOAN} — chạy lại python3 lib/google-dang-nhap.py và đăng nhập đúng tài khoản.`);

  const k = keHoachSo({ quy: cfg.quy || [] });
  if (!k.dropdownQuy.length) console.warn('⚠️  config.json chưa có danh sách quỹ (quy): cột Nguồn quỹ chưa có dropdown. Có danh sách rồi thì thêm tay trên Sheet (Data → Data validation, cột F) — đừng chạy lại setup, setup luôn tạo FILE MỚI.');
  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: k.title, locale: k.locale, timeZone: k.timeZone },
      sheets: k.tabs.map((t, i) => ({ properties: { sheetId: i, title: t.title, hidden: t.hidden, gridProperties: { frozenRowCount: t.header.length ? 1 : 0 } } })),
    },
  });
  const sheetId = res.data.spreadsheetId;
  const data = k.tabs.filter((t) => t.header.length).map((t) => ({ range: `'${t.title}'!A1`, values: [t.header] }));
  for (const o of ["A1", "A2", "G1", "G2", "M1", "M2"]) data.push({ range: `'Tổng hợp'!${o}`, values: [[k.tongHop[o]]] });
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: sheetId, requestBody: { valueInputOption: "USER_ENTERED", data } });
  // Định dạng: tiêu đề sổ in đậm; Thu/Chi/Tồn (G:I) số có ngăn nghìn.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: { requests: [
      { repeatCell: { range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
      { repeatCell: { range: { sheetId: 0, startRowIndex: 1, startColumnIndex: 6, endColumnIndex: 9 }, cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } } }, fields: "userEnteredFormat.numberFormat" } },
      { updateDimensionProperties: { range: { sheetId: 0, dimension: "COLUMNS", startIndex: k.anCot, endIndex: k.anCot + 1 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
      ...(k.dropdownQuy.length ? [{ setDataValidation: { range: { sheetId: 0, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 },
        rule: { condition: { type: "ONE_OF_LIST", values: k.dropdownQuy.map((v) => ({ userEnteredValue: v })) }, strict: k.dropdownChat, showCustomUi: true } } }] : []),
    ] },
  });
  const { folderId, link } = await createFolder(k.folderName, null);

  cfg.book.sheetId = sheetId;
  cfg.book.folderId = folderId;
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  console.log(JSON.stringify({ ok: true, taiKhoan: me, sheetId, sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}`, folderId, folderUrl: link }, null, 2));
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("LỖI setup: " + (e?.message ?? e)); process.exit(1); });
}
