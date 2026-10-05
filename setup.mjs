#!/usr/bin/env node
// Dựng Sheet "Sổ chi phí New Projects" + folder Drive "Chứng từ New Projects" — CHẠY 1 LẦN, bằng tài khoản ai@gwt.vn.
//   node setup.mjs            → tạo mới, ghi sheetId/folderId vào config.json (từ chối nếu config đã có sheetId)
//   node setup.mjs --force    → vẫn tạo mới dù config đã có (file cũ KHÔNG bị xoá — tự dọn tay trên Drive)
// Cần credentials.json + token.json (node lib/auth.mjs) trong thư mục này. Spec §4.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { google } from "googleapis";
import { getAuthClient } from "./lib/google-auth.mjs";
import { createFolder } from "./drive.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const TAI_KHOAN = "ai@gwt.vn";

// THUẦN (test được): mọi thứ cần dựng. Công thức viết sẵn dấu ';' vì file được TẠO với locale vi_VN.
export function keHoachSo() {
  const loc = "'Sổ chi phí'!B2:G";
  return {
    title: "Sổ chi phí New Projects",
    locale: "vi_VN",
    timeZone: "Asia/Ho_Chi_Minh",
    folderName: "Chứng từ New Projects",
    tabs: [
      { title: "Sổ chi phí", hidden: false, header: ["STT", "Ngày", "Diễn giải", "Người", "Hoá đơn đỏ", "Thu", "Chi", "Tồn", "Link chứng từ", "Ghi chú"] },
      { title: "Tổng hợp", hidden: false, header: [] },
      // _state: bot append [thời điểm, "", "", msgId] — loadProcessed đọc D2:D. Không sửa tay.
      { title: "_state", hidden: true, header: ["Thời điểm", "", "", "msgId (đừng sửa)"] },
      // _rep: [msgId, id tin rep của bot, lý do] — để không nhắc lại cùng lý do và xoá đúng tin rep. Không sửa tay.
      { title: "_rep", hidden: true, header: ["msgId", "repMsgId", "Lý do"] },
    ],
    // Hai bảng ĐỘC LẬP (mỗi bảng tự có Năm/Tháng): tháng chỉ có thu không hiện ở bảng 2 → ghép chung cột sẽ lệch dòng.
    // Cột B phải là NGÀY thật (bot ghi dd/mm/yyyy USER_ENTERED ở locale vi_VN) thì year()/month() mới chạy.
    tongHop: {
      A1: "Theo tháng",
      A2: `=IFERROR(QUERY(${loc}; "select year(B), month(B)+1, sum(F), sum(G), count(G) where B is not null group by year(B), month(B)+1 order by year(B), month(B)+1 label year(B) 'Năm', month(B)+1 'Tháng', sum(F) 'Tổng thu', sum(G) 'Tổng chi', count(G) 'Số khoản chi'"; 0); "Chưa có dữ liệu")`,
      G1: "Chi theo hoá đơn đỏ (Có / Không)",
      G2: `=IFERROR(QUERY(${loc}; "select year(B), month(B)+1, sum(G) where B is not null and G is not null group by year(B), month(B)+1 pivot E label year(B) 'Năm', month(B)+1 'Tháng'"; 0); "Chưa có dữ liệu")`,
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
  // Chặn tạo nhầm tài khoản: token.json đăng nhập ai thì file thuộc người đó.
  const me = (await drive.about.get({ fields: "user(emailAddress)" })).data.user?.emailAddress;
  if (String(me).toLowerCase() !== TAI_KHOAN) throw new Error(`token.json đang là '${me}', phải là ${TAI_KHOAN} — chạy lại node lib/auth.mjs và đăng nhập đúng tài khoản.`);

  const k = keHoachSo();
  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: k.title, locale: k.locale, timeZone: k.timeZone },
      sheets: k.tabs.map((t, i) => ({ properties: { sheetId: i, title: t.title, hidden: t.hidden, gridProperties: { frozenRowCount: t.header.length ? 1 : 0 } } })),
    },
  });
  const sheetId = res.data.spreadsheetId;
  const data = k.tabs.filter((t) => t.header.length).map((t) => ({ range: `'${t.title}'!A1`, values: [t.header] }));
  data.push({ range: "'Tổng hợp'!A1", values: [[k.tongHop.A1]] }, { range: "'Tổng hợp'!A2", values: [[k.tongHop.A2]] },
    { range: "'Tổng hợp'!G1", values: [[k.tongHop.G1]] }, { range: "'Tổng hợp'!G2", values: [[k.tongHop.G2]] });
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: sheetId, requestBody: { valueInputOption: "USER_ENTERED", data } });
  // Định dạng: tiêu đề sổ in đậm; Thu/Chi/Tồn (F:H) số có ngăn nghìn.
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: { requests: [
      { repeatCell: { range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
      { repeatCell: { range: { sheetId: 0, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 8 }, cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } } }, fields: "userEnteredFormat.numberFormat" } },
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
