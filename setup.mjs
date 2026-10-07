#!/usr/bin/env node
// Dựng Sheet "Sổ chi phí New Projects" + folder Drive "Chứng từ New Projects" — CHẠY 1 LẦN, bằng tài khoản ai@gwt.vn.
//   node setup.mjs            → tạo mới, ghi sheetId/folderId vào config.json (từ chối nếu config đã có sheetId)
//   node setup.mjs --force    → vẫn tạo mới dù config đã có (file cũ KHÔNG bị xoá — tự dọn tay trên Drive)
//   node setup.mjs --tab-kenh → file ĐÃ CÓ: dựng tab sổ + tab tổng hợp cho từng kênh trong config.channels (chạy lại vô hại)
//   node setup.mjs --tab-quy  → file ĐÃ CÓ: dựng/cập nhật tab quỹ + "Cá nhân ứng chờ hoàn" + "Tổng hợp quỹ" (chạy lại vô hại)
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
  const loc = `'${tab}'!B2:H`, c = (cot) => `'${tab}'!${cot}2:${cot}`;
  return {
    A1: "Theo tháng",
    // Thu/Chi đọc qua N() trong mảng ('\\' = ngăn cột ở vi_VN): cột Thu trống hoàn toàn thì QUERY coi là cột chữ và sum ra #VALUE!.
    A2: `=IFERROR(QUERY({${c("B")}\\ARRAYFORMULA(N(${c("G")}))\\ARRAYFORMULA(N(${c("H")}))\\ARRAYFORMULA(--(N(${c("H")})>0))}; "select year(Col1), month(Col1)+1, sum(Col2), sum(Col3), sum(Col4) where Col1 is not null group by year(Col1), month(Col1)+1 order by year(Col1), month(Col1)+1 label year(Col1) 'Năm', month(Col1)+1 'Tháng', sum(Col2) 'Tổng thu', sum(Col3) 'Tổng chi', sum(Col4) 'Số khoản chi'"; 0); "Chưa có dữ liệu")`,
    G1: "Chi theo hoá đơn đỏ (Có / Không)",
    G2: `=IFERROR(QUERY(${loc}; "select year(B), month(B)+1, sum(H) where B is not null and H is not null group by year(B), month(B)+1 pivot E label year(B) 'Năm', month(B)+1 'Tháng'"; 0); "Chưa có dữ liệu")`,
    M1: "Chi theo nguồn quỹ",
    M2: `=IFERROR(QUERY(${loc}; "select year(B), month(B)+1, sum(H) where B is not null and H is not null group by year(B), month(B)+1 pivot F label year(B) 'Năm', month(B)+1 'Tháng'"; 0); "Chưa có dữ liệu")`,
  };
}

// Kế hoạch dựng tab theo kênh trên file ĐÃ CÓ (thuần). Kênh đầu tiên chưa có tab thì nhận lại cặp tab mặc định
// (book.tab + "Tổng hợp") của file vừa tạo bằng cách ĐỔI TÊN — Sheets tự sửa tham chiếu trong công thức QUERY.
// Kênh sau thì THÊM tab. Tab đã có thì bỏ qua → chạy lại vô hại.
// Kênh có tab sổ = kênh Discord + nhóm Zalo (2026-10-07). Nhóm thử (`thu: true`) có tab riêng nhưng KHÔNG gộp vào tab
// quỹ — tiền thử không được lẫn vào tồn quỹ thật. Kênh Discord và nhóm Zalo có thể chung một tab → các kế hoạch khử trùng tên.
export const kenhCoTab = (cfg) => ({ ...(cfg.channels || {}), ...(cfg.zalo?.groups || {}) });
export const kenhGopQuy = (cfg) => Object.fromEntries(Object.entries(kenhCoTab(cfg)).filter(([, k]) => !k?.thu));
export const tenTongHop = (tab) => `Tổng hợp - ${tab}`;
export function keHoachTabKenh(tenHienCo, channels = {}, book = {}) {
  const co = new Set(tenHienCo);
  const ds = [...new Set(Object.entries(channels).map(([id, k]) => { if (!k?.tab) throw new Error(`kênh ${k?.name || id} chưa khai tab trong config.json`); return k.tab; }))];
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

// ── Tab quỹ tự tổng hợp + Cá nhân ứng chờ hoàn (chủ dự án 2026-10-06) ─────────────────────────────────────────
// Bot CHỈ ghi tab kênh (quyết toán từng dự án). Các tab dưới đây là CÔNG THỨC đọc mọi tab kênh → sửa một dòng ở tab
// kênh là tab quỹ tự đổi, không nhập 2 lần. Nguồn gộp (vi_VN: ';' ngăn tham số, '\\' ngăn cột trong {}):
//   Col 1 Ngày · 2 Kênh · 3 Diễn giải · 4 Người · 5 Hoá đơn · 6 Quỹ · 7 Thu · 8 Chi · 9 Chứng từ (chữ của chip) ·
//   10 Ghi chú · 11 Đã hoàn ứng · 12 Ngày hoàn · 13 URL chứng từ.
// Thu/Chi qua N(): cột trống hoàn toàn thì QUERY coi là chữ và sum ra #VALUE! (đo 2026-10-06). Chip Drive đi qua công
// thức chỉ còn chữ → link bấm dựng lại bằng HYPERLINK từ cột URL ẩn (O ở tab kênh).
export const CA_NHAN = "Cá nhân ứng";
// Form chung = form người chỉnh tay ở tab "Chi phí chung" (2026-10-06): cột mặc định 100px, chữ dài rộng hơn.
// Theo TÊN cột để tab nào có cột cùng nghĩa thì cùng độ rộng.
const RONG = { "Diễn giải": 202, "Link chứng từ": 194, "Chứng từ": 194, "Ghi chú": 202 };
export const rongTheoForm = (header) => header.map((h) => RONG[h] ?? 100);
export function nguonGop(tabs) {
  const khoi = (t) => `HSTACK('${t}'!B2:B;ARRAYFORMULA(IF('${t}'!B2:B="";"";"${t}"));'${t}'!C2:F;ARRAYFORMULA(N('${t}'!G2:G));ARRAYFORMULA(N('${t}'!H2:H));'${t}'!J2:K;'${t}'!M2:O)`;
  return `VSTACK(${tabs.map(khoi).join(";")})`;
}
export function keHoachTabQuy({ channels = {}, quy = [] } = {}) {
  const tabs = [...new Set(Object.values(channels).map((k) => k.tab).filter(Boolean))];
  const N = nguonGop(tabs);
  const q = (sel, where, extra = "") => `=IFERROR(QUERY(${N}; "select ${sel} where Col1 is not null${where}${extra}"; 0); "")`;
  const STT = `=ARRAYFORMULA(IF(B2:B="";"";ROW(B2:B)-1))`;
  const LINK = `=ARRAYFORMULA(IF(B2:B="";"";IF(M2:M="";L2:L;HYPERLINK(M2:M;L2:L))))`;
  const ra = [];
  for (const { ten } of quy.filter((x) => x.ten !== CA_NHAN)) {
    const w = ` and Col6 = '${ten}'`, ord = " order by Col1";
    ra.push({ title: `Quỹ ${ten}`, loai: "quy",
      header: ["STT", "Ngày", "Kênh", "Diễn giải", "Người", "Hoá đơn", "Thu", "Chi", "Tồn quỹ", "Chứng từ", "Ghi chú", "_tên", "_url"],
      o: { A2: STT, B2: q("Col1, Col2, Col3, Col4, Col5, Col7, Col8", w, ord),
        I2: `=ARRAYFORMULA(IF(B2:B="";"";SCAN(0;IFERROR(--G2:G;0)-IFERROR(--H2:H;0);LAMBDA(a;x;a+x))))`,
        J2: LINK, K2: q("Col10, Col9, Col13", w, ord) },
      ngay: [1], tien: [6, 7, 8], an: [11, 12] });
  }
  if (quy.some((x) => x.ten === CA_NHAN)) {
    const w = ` and Col6 = '${CA_NHAN}' and Col8 > 0`, ord = " order by Col11, Col1"; // "Chưa" < "Đã hoàn" → chưa hoàn lên trước
    ra.push({ title: "Cá nhân ứng chờ hoàn", loai: "canhan",
      header: ["STT", "Người ứng", "Ngày", "Kênh", "Diễn giải", "Số tiền", "Hoá đơn", "Đã hoàn ứng", "Ngày hoàn", "Chứng từ", "Ghi chú", "_tên", "_url", "", "Công ty đang nợ"],
      o: { A2: STT, B2: q("Col4, Col1, Col2, Col3, Col8, Col5, Col11, Col12", w, ord), J2: LINK, K2: q("Col10, Col9, Col13", w, ord),
        O2: `=IFERROR(QUERY(${N}; "select Col4, sum(Col8) where Col1 is not null and Col6 = '${CA_NHAN}' and Col8 > 0 and Col11 <> 'Đã hoàn' group by Col4 label Col4 'Người', sum(Col8) 'Đang nợ'"; 0); "Không còn khoản chờ hoàn")` },
      ngay: [2, 8], tien: [5, 15], an: [11, 12] });
  }
  ra.push({ title: "Tổng hợp quỹ", loai: "tonghop", header: [],
    o: { A1: "Theo quỹ (mọi kênh)", F1: "Chi theo tháng × quỹ",
      A2: `=IFERROR(QUERY(${N}; "select Col6, sum(Col7), sum(Col8), sum(Col7)-sum(Col8) where Col1 is not null group by Col6 order by Col6 label Col6 'Quỹ', sum(Col7) 'Tổng thu', sum(Col8) 'Tổng chi', sum(Col7)-sum(Col8) 'Tồn'"; 0); "Chưa có dữ liệu")`,
      F2: `=IFERROR(QUERY(${N}; "select year(Col1), month(Col1)+1, sum(Col8) where Col1 is not null group by year(Col1), month(Col1)+1 pivot Col6 label year(Col1) 'Năm', month(Col1)+1 'Tháng'"; 0); "Chưa có dữ liệu")` },
    ngay: [], tien: [1, 2, 3, 7, 8, 9, 10, 11, 12], an: [] });
  for (const k of ra) k.rong = rongTheoForm(k.header.length ? k.header : []);
  return ra;
}

export function keHoachSo({ quy = [] } = {}) {
  return {
    title: "Sổ chi phí New Projects",
    locale: "vi_VN",
    timeZone: "Asia/Ho_Chi_Minh",
    folderName: "Chứng từ New Projects",
    tabs: [
      { title: "Sổ chi phí", hidden: false, header: ["STT", "Ngày", "Diễn giải", "Người", "Hoá đơn đỏ", "Nguồn quỹ", "Thu", "Chi", "Tồn", "Link chứng từ", "Ghi chú", "Mã tin", "Đã hoàn ứng", "Ngày hoàn", "URL chứng từ"] },
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

// --tab-quy: dựng/cập nhật tab quỹ + Cá nhân ứng chờ hoàn + Tổng hợp quỹ; bổ sung cột M:O + dropdown cho tab kênh.
// Chạy lại vô hại (ghi đè công thức, không đụng dòng dữ liệu tab kênh). Thêm kênh/quỹ → chạy lại.
async function taoTabQuy(cfg) {
  const sheets = google.sheets({ version: "v4", auth: getAuthClient() });
  const { sheetId } = cfg.book;
  const lay = async () => (await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets(properties(sheetId,title,index),protectedRanges(protectedRangeId))" })).data.sheets;
  const kenh = [...new Set(Object.values(kenhCoTab(cfg)).map((k) => k.tab).filter(Boolean))]; // định dạng MỌI tab sổ, kể cả nhóm thử
  const ke = keHoachTabQuy({ ...cfg, channels: kenhGopQuy(cfg) });                        // tab quỹ chỉ gộp kênh thật
  let ds = await lay();
  const gid = (t) => ds.find((x) => x.properties.title === t)?.properties.sheetId;
  const them = ke.filter((k) => gid(k.title) == null).map((k) => ({ addSheet: { properties: { title: k.title, gridProperties: { frozenRowCount: k.header.length ? 1 : 0 } } } }));
  if (them.length) { await sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests: them } }); ds = await lay(); }
  const dv = (g, c, vals) => ({ setDataValidation: { range: { sheetId: g, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: c, endColumnIndex: c + 1 },
    rule: { condition: { type: "ONE_OF_LIST", values: vals.map((v) => ({ userEnteredValue: v })) }, strict: false, showCustomUi: true } } });
  const cot = (g, c, props, fields) => ({ updateDimensionProperties: { range: { sheetId: g, dimension: "COLUMNS", startIndex: c, endIndex: c + 1 }, properties: props, fields } });
  const fmt = (g, c, nf) => ({ repeatCell: { range: { sheetId: g, startRowIndex: 1, startColumnIndex: c, endColumnIndex: c + 1 }, cell: { userEnteredFormat: { numberFormat: nf } }, fields: "userEnteredFormat.numberFormat" } });
  const NGAY = { type: "DATE", pattern: "dd/mm/yyyy" }, TIEN = { type: "NUMBER", pattern: "#,##0;-#,##0;" }; // = #,##0 của form, ẩn số 0 (cột Thu qua N())
  const dam = (g, r) => ({ repeatCell: { range: { sheetId: g, startRowIndex: r, endRowIndex: r + 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } });
  const trai = (g, r0) => ({ repeatCell: { range: { sheetId: g, startRowIndex: r0, endRowIndex: 1000 }, cell: { userEnteredFormat: { horizontalAlignment: "LEFT" } }, fields: "userEnteredFormat.horizontalAlignment" } });
  const reqs = [], data = [];
  // 1) Tab kênh: căn trái cả vùng dữ liệu (form người chỉnh), tiêu đề M:O (giữ chữ đậm như tiêu đề người đã chỉnh), O ẩn, dropdown Hoá đơn / Quỹ / Đã hoàn ứng.
  for (const t of kenh) {
    const g = gid(t);
    data.push({ range: `'${t}'!M1:O1`, values: [["Đã hoàn ứng", "Ngày hoàn", "URL chứng từ"]] });
    reqs.push(trai(g, 1), { copyPaste: { source: { sheetId: g, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 }, destination: { sheetId: g, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 12, endColumnIndex: 15 }, pasteType: "PASTE_FORMAT" } },
      cot(g, 14, { hiddenByUser: true }, "hiddenByUser"), fmt(g, 13, NGAY),
      dv(g, 4, ["Có", "Không", "Chờ xuất", "—"]), dv(g, 5, (cfg.quy || []).map((x) => x.ten)), dv(g, 12, ["Chưa", "Đã hoàn"]));
    // URL ẩn cho dòng cũ: lấy từ chip / link của cột J.
    const r = (await sheets.spreadsheets.get({ spreadsheetId: sheetId, includeGridData: true, ranges: [`'${t}'!J2:O`], fields: "sheets.data.rowData.values(formattedValue,hyperlink,chipRuns)" })).data.sheets[0].data[0].rowData || [];
    r.forEach((row, i) => {
      const v = row.values || [], j = v[0] || {}, o = v[5] || {};
      const url = j.chipRuns?.[0]?.chip?.richLinkProperties?.uri || j.hyperlink || (/^https?:/.test(j.formattedValue || "") ? j.formattedValue : "");
      if (url && !o.formattedValue) data.push({ range: `'${t}'!O${i + 2}`, values: [[url]] });
    });
  }
  // 2) Tab công thức: xoá cũ, ghi tiêu đề + công thức, định dạng, khoá (cảnh báo khi gõ tay — gõ vào là vỡ công thức).
  const mau = gid(kenh[0]);
  for (const k of ke) {
    const g = gid(k.title);
    reqs.push({ updateCells: { range: { sheetId: g }, fields: "userEnteredValue" } });
    if (k.header.length) {
      data.push({ range: `'${k.title}'!A1`, values: [k.header] });
      reqs.push({ copyPaste: { source: { sheetId: mau, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 }, destination: { sheetId: g, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: k.header.length }, pasteType: "PASTE_FORMAT" } });
    } else reqs.push({ repeatCell: { range: { sheetId: g, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } });
    for (const [o, v] of Object.entries(k.o)) data.push({ range: `'${k.title}'!${o}`, values: [[v]] });
    k.ngay.forEach((c) => reqs.push(fmt(g, c, NGAY)));
    k.tien.forEach((c) => reqs.push(fmt(g, c, TIEN)));
    // Form chung: độ rộng theo tên cột (cột ngoài tiêu đề về 100 như mặc định), dữ liệu căn trái như tab kênh.
    for (let c = 0; c < Math.max(k.rong.length, 16); c++) reqs.push(cot(g, c, { pixelSize: k.rong[c] ?? 100, hiddenByUser: k.an.includes(c) }, "pixelSize,hiddenByUser"));
    reqs.push(trai(g, 1));
    if (!k.header.length) reqs.push(dam(g, 1)); // tab tổng hợp: dòng 2 là nhãn cột do QUERY sinh
    // Tab bảng: chữ dài CẮT trong ô (mặc định là tràn sang ô trống bên cạnh — link chứng từ đè lên cột Ghi chú,
    // chủ dự án báo 2026-10-06). Tab tổng hợp giữ tràn để tiêu đề bảng hiện đủ.
    else reqs.push({ repeatCell: { range: { sheetId: g, startRowIndex: 1, endRowIndex: 1000 }, cell: { userEnteredFormat: { wrapStrategy: "CLIP" } }, fields: "userEnteredFormat.wrapStrategy" } });
    if (!(ds.find((x) => x.properties.sheetId === g)?.protectedRanges || []).length)
      reqs.push({ addProtectedRange: { protectedRange: { range: { sheetId: g }, description: "Tab tự tính từ các tab kênh — sửa ở tab kênh", warningOnly: true } } });
  }
  // 2b) Tab "Tổng hợp - <kênh>" (công thức từ --tab-kenh): cùng form — tiêu đề + nhãn đậm, căn trái, tiền #,##0
  //     (trừ cột Năm/Tháng A,B · G,H · M,N của 3 bảng).
  for (const t of kenh.map(tenTongHop)) {
    const g = gid(t); if (g == null) continue;
    reqs.push(dam(g, 0), dam(g, 1), trai(g, 1));
    for (let c = 0; c < 20; c++) if (![0, 1, 6, 7, 12, 13].includes(c)) reqs.push(fmt(g, c, TIEN));
  }
  // 3) Thứ tự tab: kênh → quỹ → cá nhân ứng → tổng hợp quỹ → tổng hợp từng kênh → tab kỹ thuật.
  const thuTu = [...kenh, ...ke.map((k) => k.title), ...kenh.map(tenTongHop), "_state", "_rep"];
  thuTu.forEach((t, i) => { const g = gid(t); if (g != null) reqs.push({ updateSheetProperties: { properties: { sheetId: g, index: i }, fields: "index" } }); });
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetId, requestBody: { requests: reqs } });
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: sheetId, requestBody: { valueInputOption: "USER_ENTERED", data } });
  console.log(JSON.stringify({ ok: true, tab: ke.map((k) => k.title), them: them.length }, null, 2));
}

async function main() {
  process.chdir(DIR);
  const force = process.argv.includes("--force");
  const cfgPath = path.join(DIR, "config.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  if (process.argv.includes("--tab-kenh")) { await taoTabKenh({ ...cfg, channels: kenhCoTab(cfg) }); return taoTabQuy(cfg); } // kênh mới → tab quỹ phải đọc thêm tab đó
  if (process.argv.includes("--tab-quy")) return taoTabQuy(cfg);
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
