#!/usr/bin/env node
// Dựng Sheet "Sổ chi phí New Projects" + folder Drive "Chứng từ New Projects" — CHẠY 1 LẦN, bằng tài khoản ai@gwt.vn.
//   node setup.mjs            → tạo mới, ghi sheetId/folderId vào config.json (từ chối nếu config đã có sheetId)
//   node setup.mjs --force    → vẫn tạo mới dù config đã có (file cũ KHÔNG bị xoá — tự dọn tay trên Drive)
//   node setup.mjs --tab-kenh → file ĐÃ CÓ: dựng tab sổ + tab tổng hợp cho từng kênh trong config.channels (chạy lại vô hại)
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
// Ba bảng ĐỘC LẬP (mỗi bảng tự có Năm/Tháng): ghép chung cột sẽ lệch dòng khi một tháng thiếu loại này/loại kia.
// Cột B phải là NGÀY thật (bot ghi dd/mm/yyyy USER_ENTERED ở locale vi_VN) thì year()/month() mới chạy.
// Sổ v2: E Hoá đơn đỏ · F Nguồn quỹ · G Thu · H Chi. Mỗi kênh một tab sổ → tổng hợp trỏ đúng tab đó (2026-10-06).
export function keHoachTongHop(tab) {
  const loc = `'${tab}'!B2:H`;
  return {
    A1: "Theo tháng",
    A2: `=IFERROR(QUERY(${loc}; "select year(B), month(B)+1, sum(G), sum(H), count(H) where B is not null group by year(B), month(B)+1 order by year(B), month(B)+1 label year(B) 'Năm', month(B)+1 'Tháng', sum(G) 'Tổng thu', sum(H) 'Tổng chi', count(H) 'Số khoản chi'"; 0); "Chưa có dữ liệu")`,
    G1: "Chi theo hoá đơn đỏ (Có / Không)",
    G2: `=IFERROR(QUERY(${loc}; "select year(B), month(B)+1, sum(H) where B is not null and H is not null group by year(B), month(B)+1 pivot E label year(B) 'Năm', month(B)+1 'Tháng'"; 0); "Chưa có dữ liệu")`,
    M1: "Chi theo nguồn quỹ",
    M2: `=IFERROR(QUERY(${loc}; "select year(B), month(B)+1, sum(H) where B is not null and H is not null group by year(B), month(B)+1 pivot F label year(B) 'Năm', month(B)+1 'Tháng'"; 0); "Chưa có dữ liệu")`,
  };
}

// Kế hoạch dựng tab theo kênh trên file ĐÃ CÓ (thuần). Kênh đầu tiên chưa có tab thì nhận lại cặp tab mặc định
// (book.tab + "Tổng hợp") của file vừa tạo bằng cách ĐỔI TÊN — Sheets tự sửa tham chiếu trong công thức QUERY.
// Kênh sau thì THÊM tab. Tab đã có thì bỏ qua → chạy lại vô hại.
export const tenTongHop = (tab) => `Tổng hợp - ${tab}`;
export function keHoachTabKenh(tenHienCo, channels = {}, book = {}) {
  const co = new Set(tenHienCo);
  const ds = Object.entries(channels).map(([id, k]) => { if (!k?.tab) throw new Error(`kênh ${k?.name || id} chưa khai tab trong config.json`); return k.tab; });
  const ops = [];
  let daNhanTabCu = false;
  for (const tab of ds) {
    const th = tenTongHop(tab);
    if (co.has(tab)) { if (!co.has(th)) ops.push({ loai: "them_th", tab, th }); continue; }
    if (!daNhanTabCu && book.tab && co.has(book.tab) && !ds.includes(book.tab)) {
      daNhanTabCu = true;
      ops.push({ loai: "doi_ten", tu: book.tab, sang: tab });
      ops.push(co.has("Tổng hợp") && !co.has(th) ? { loai: "doi_ten", tu: "Tổng hợp", sang: th } : { loai: "them_th", tab, th });
      continue;
    }
    ops.push({ loai: "them_so", tab }, { loai: "them_th", tab, th });
  }
  return ops;
}

export function keHoachSo({ quy = [] } = {}) {
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
    tongHop: keHoachTongHop("Sổ chi phí"),
  };
}

// --tab-kenh: dựng tab sổ + tab tổng hợp cho từng kênh trên file ĐÃ CÓ (config.book.sheetId).
async function taoTabKenh(cfg) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: "v4", auth });
  const { sheetId } = cfg.book;
  if (!sheetId) throw new Error("config.json chưa có book.sheetId — chạy node setup.mjs trước");
  const meta = (await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets(properties(sheetId,title))" })).data.sheets.map((x) => x.properties);
  const idCua = new Map(meta.map((p) => [p.title, p.sheetId]));
  const ops = keHoachTabKenh(meta.map((p) => p.title), cfg.channels, cfg.book);
  if (!ops.length) { console.log("Tab của mọi kênh đã có — không làm gì."); return; }
  // Chỉ nhận lại tab mặc định khi nó CÒN TRỐNG — tab đã có dữ liệu thì dừng, không đổi tên lẫn sổ.
  for (const o of ops.filter((o) => o.loai === "doi_ten" && o.tu === cfg.book.tab)) {
    const v = (await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `'${o.tu}'!A2:A` })).data.values || [];
    if (v.some((r) => String(r[0] ?? "").trim())) throw new Error(`tab '${o.tu}' đã có dữ liệu — không đổi tên. Khai tab đó cho đúng kênh trong config.json.`);
  }
  const k = keHoachSo({ quy: cfg.quy || [] });
  const header = k.tabs[0].header;
  let idMoi = Date.now() % 1e9;
  const reqs = [], data = [];
  for (const o of ops) {
    if (o.loai === "doi_ten") { reqs.push({ updateSheetProperties: { properties: { sheetId: idCua.get(o.tu), title: o.sang }, fields: "title" } }); continue; }
    const id = idMoi++;
    if (o.loai === "them_so") {
      reqs.push({ addSheet: { properties: { sheetId: id, title: o.tab, gridProperties: { frozenRowCount: 1 } } } },
        { repeatCell: { range: { sheetId: id, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
        { repeatCell: { range: { sheetId: id, startRowIndex: 1, startColumnIndex: 6, endColumnIndex: 9 }, cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } } }, fields: "userEnteredFormat.numberFormat" } },
        { updateDimensionProperties: { range: { sheetId: id, dimension: "COLUMNS", startIndex: k.anCot, endIndex: k.anCot + 1 }, properties: { hiddenByUser: true }, fields: "hiddenByUser" } },
        ...(k.dropdownQuy.length ? [{ setDataValidation: { range: { sheetId: id, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 },
          rule: { condition: { type: "ONE_OF_LIST", values: k.dropdownQuy.map((v) => ({ userEnteredValue: v })) }, strict: k.dropdownChat, showCustomUi: true } } }] : []));
      data.push({ range: `'${o.tab}'!A1`, values: [header] });
    } else if (o.loai === "them_th") {
      reqs.push({ addSheet: { properties: { sheetId: id, title: o.th } } });
      const th = keHoachTongHop(o.tab);
      for (const o2 of Object.keys(th)) data.push({ range: `'${o.th}'!${o2}`, values: [[th[o2]]] });
    }
  }
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests: reqs } });
  if (data.length) await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: sheetId, requestBody: { valueInputOption: "USER_ENTERED", data } });
  console.log(JSON.stringify({ ok: true, viec: ops }, null, 2));
}

async function main() {
  process.chdir(DIR);
  const force = process.argv.includes("--force");
  const cfgPath = path.join(DIR, "config.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  if (process.argv.includes("--tab-kenh")) return taoTabKenh(cfg);
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
