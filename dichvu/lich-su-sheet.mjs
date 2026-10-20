#!/usr/bin/env node
// Lần theo LỊCH SỬ PHIÊN BẢN của tab sổ (chủ dự án 2026-10-20: "#88–#91 bot đã ✅ mà mất khỏi sổ, xem lịch sử không thấy bot ghi") —
// CHỈ ĐỌC qua Drive API: mỗi phiên bản trong khoảng thời gian → tải CSV của tab → số dòng + dòng chứa từng chữ cần tìm, kèm người sửa
// phiên bản đó. Thấy khoản xuất hiện ở phiên bản nào / dòng nào và biến mất ở phiên bản nào, do ai. Bot ghi bằng tài khoản Google của
// bot (ai@gwt.vn) nên trong lịch sử nó mang tên tài khoản đó, không có chữ "bot". Google có thể gộp các lần sửa gần nhau làm một phiên bản.
//   node dichvu/lich-su-sheet.mjs --tu 2026-10-19T18:40 [--den 2026-10-20T23:59] --tim "thuê xe 8-14,thuê xe 14-16,Little Charm,Yatch" [--tab "tên tab"]
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** CSV → các dòng (mảng ô); chịu được ô có dấu phẩy / ngoặc kép / xuống dòng nằm trong ngoặc kép. */
function docCsv(s) {
  const ra = []; let hang = [], o = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { o += '"'; i++ } else q = false } else o += c }
    else if (c === '"') q = true;
    else if (c === ",") { hang.push(o); o = "" }
    else if (c === "\n") { hang.push(o.replace(/\r$/, "")); ra.push(hang); hang = []; o = "" }
    else o += c;
  }
  if (o || hang.length) { hang.push(o); ra.push(hang) }
  return ra;
}

/** Một bản CSV của tab: số dòng có dữ liệu + dòng (1-based) đầu tiên chứa từng chữ cần tìm, không có → null. */
export function timTrongCsv(csv, canTim) {
  const hang = docCsv(csv), chu = hang.map((h) => h.join(" ").toLowerCase());
  return { soDong: hang.filter((h) => h.some((x) => x.trim())).length,
    thay: Object.fromEntries(canTim.map((t) => [t, chu.findIndex((x) => x.includes(t.toLowerCase())) + 1 || null])) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { google } = await import("googleapis");
  const { getAuthClient } = await import("../lib/google-auth.mjs");
  const a = process.argv, lay = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null);
  const ms = (s) => Date.parse(/(Z|[+-]\d\d:\d\d)$/i.test(s) ? s : `${s}+07:00`); // giờ VN nếu không ghi múi giờ
  const gio = (t) => new Date(t).toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).replace(",", "");
  const cfg = JSON.parse(readFileSync(new URL("../config.json", import.meta.url), "utf8"));
  const fileId = cfg.book.sheetId, tab = lay("--tab") ?? Object.values(cfg.zalo.groups)[0].tab;
  const tu = ms(lay("--tu") ?? "1970-01-01T00:00Z"), den = lay("--den") ? ms(lay("--den")) : Date.now();
  const canTim = (lay("--tim") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const auth = getAuthClient(), drive = google.drive({ version: "v3", auth }), sheets = google.sheets({ version: "v4", auth });
  const gid = (await sheets.spreadsheets.get({ spreadsheetId: fileId, fields: "sheets.properties(sheetId,title)" })).data.sheets.find((s) => s.properties.title === tab)?.properties.sheetId;
  if (gid == null) throw new Error(`không thấy tab "${tab}"`);
  const revs = [];
  let trang;
  do {
    const r = await drive.revisions.list({ fileId, pageToken: trang, pageSize: 1000, fields: "nextPageToken,revisions(id,modifiedTime,lastModifyingUser(displayName,emailAddress))" });
    revs.push(...(r.data.revisions || [])); trang = r.data.nextPageToken;
  } while (trang);
  const trong = revs.filter((r) => { const t = Date.parse(r.modifiedTime); return t >= tu && t <= den });
  console.log(`File có ${revs.length} phiên bản, ${trong.length} trong khoảng ${gio(tu)} → ${gio(den)} — tab "${tab}"`);
  for (const r of trong) {
    const ai = `${r.lastModifyingUser?.displayName ?? "?"} <${r.lastModifyingUser?.emailAddress ?? "?"}>`;
    try {
      const csv = (await auth.request({ url: `https://docs.google.com/spreadsheets/export?id=${fileId}&revision=${r.id}&exportFormat=csv&gid=${gid}`, responseType: "text" })).data;
      const k = timTrongCsv(String(csv), canTim);
      console.log(`  ${gio(r.modifiedTime)} · ${ai} · ${k.soDong} dòng${canTim.map((t) => ` · ${t}: ${k.thay[t] ? `dòng ${k.thay[t]}` : "—"}`).join("")}`);
    } catch (e) { console.log(`  ${gio(r.modifiedTime)} · ${ai} · tải bản này lỗi: ${String(e?.message ?? e).slice(0, 120)}`) }
  }
}
