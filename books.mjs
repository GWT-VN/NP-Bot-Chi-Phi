#!/usr/bin/env node
// Tầng ghi sổ NP: 1 spreadsheet (id trong config.json book.sheetId), tab sổ + _state (dedup msgId ở cột D) + _rep.
// Mỗi file có tab sổ (Sổ quỹ / Sổ LAD) + tab _state (dedup msgId ở cột D). Import bởi scanner.mjs.
// Export: date helpers · buildFundRow · laLocaleVi/kiemTraLocale · loadProcessed(sheetId) · commit({sheetId,tab,rows,msgIds}).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { google } from "googleapis";
import { getAuthClient } from "./lib/google-auth.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url)); // repo phẳng: .env cùng thư mục
function loadEnv() {
  try {
    for (const line of readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}
loadEnv();

const STATE = "_state";
let _sheets = null;
function sheetsApi() { return (_sheets ||= google.sheets({ version: "v4", auth: getAuthClient() })); }

// ── Ngày ─────────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
export function toISO(s) {
  if (!s) return new Date().toISOString().slice(0, 10);
  const str = String(s).trim();
  let m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return new Date().toISOString().slice(0, 10);
}
export function toDMY(s) { const i = toISO(s); return `${i.slice(8, 10)}/${i.slice(5, 7)}/${i.slice(0, 4)}`; }
export function toThang(s) { const i = toISO(s); return `${i.slice(0, 4)}.${i.slice(5, 7)}`; }

// ── Dấu ngăn tham số công thức PHỤ THUỘC LOCALE CỦA SHEET ────────────────────
// Google parse công thức gửi qua API **theo locale của spreadsheet**, không theo một chuẩn cố định:
// locale có dấu thập phân là "," (vi_VN, de_DE…) thì dấu ngăn tham số là ";"; locale dấu thập phân "."
// (en_US…) thì là ",". Ghi sai dấu → ô ra "#ERROR!" (đo thật 16/07/2026 trên sheet vi_VN). Không có
// đường vòng: `values.update/append` (USER_ENTERED) lẫn `batchUpdate/updateCells` + `formulaValue`
// đều parse theo locale.
// KHÔNG hardcode ";" — đó chỉ là đổi giả định "',' luôn đúng" lấy giả định "';' luôn đúng". Sheet mới
// Google mặc định en_US; ai tạo sheet mà quên đổi locale là "#ERROR!" quay lại. Bot phải HỎI SHEET.
// Suy dấu từ dấu thập phân của locale (Intl) thay vì liệt kê danh sách locale — danh sách sẽ mục.
const ARG_SEP = "\u001F"; // placeholder trong công thức mẫu; commit() thay bằng dấu thật của sheet.
export function sepForLocale(locale) {
  const tag = String(locale || "en_US").replace(/_/g, "-");
  let dec = ".";
  try { dec = new Intl.NumberFormat(tag).format(1.1).charAt(1); } catch { dec = "."; }
  return dec === "," ? ";" : ",";
}
const _sepCache = new Map(); // sheetId → sep. Tra 1 lần/sheet/tiến trình, không gọi API mỗi dòng.
export async function argSepFor(sheetId) {
  if (_sepCache.has(sheetId)) return _sepCache.get(sheetId);
  const r = await sheetsApi().spreadsheets.get({ spreadsheetId: sheetId, fields: "properties.locale" });
  const sep = sepForLocale(r.data?.properties?.locale);
  _sepCache.set(sheetId, sep);
  return sep;
}
// Thay placeholder trong MỌI ô công thức của rows. Hàm THUẦN (test được không cần mạng).
export function localizeRows(rows, sep) {
  return rows.map((row) => row.map((v) => (typeof v === "string" && v.includes(ARG_SEP) ? v.split(ARG_SEP).join(sep) : v)));
}
// Sheet PHẢI ở locale vi: bot ghi ngày "dd/mm/yyyy" bằng USER_ENTERED — locale en_US đọc "05/10/2026" thành
// 10 THÁNG 5 (sai im lặng, Tổng hợp theo tháng lệch theo). setup.mjs đặt vi_VN lúc tạo; hàm này chặn khi ai đó đổi.
export function laLocaleVi(locale) { return /^vi([_-]|$)/i.test(String(locale || "")); }
export async function kiemTraLocale(sheetId) {
  const r = await sheetsApi().spreadsheets.get({ spreadsheetId: sheetId, fields: "properties.locale" });
  const loc = r.data?.properties?.locale;
  if (!laLocaleVi(loc)) throw new Error(`Sheet đang ở locale '${loc}', phải là vi_VN (File → Cài đặt) — dừng, không ghi ngày sai`);
}

// ── Builders (khớp tiêu đề do setup.mjs tạo) ─────────────────────────────────
// Tồn = ΣThu(F) − ΣChi(G) cộng dồn.
// Dấu ngăn = ARG_SEP (placeholder) — buildFundRow ĐỒNG BỘ (route() gọi nó, route() không async được),
// mà dấu thật chỉ biết sau khi hỏi sheet. commit() thay ở biên ghi. Placeholder sót lại → "#ERROR!"
// (lỗi KÊU TO), không bao giờ ra số sai im lặng.
const TON_FUND = `=SUM($F$2:INDEX($F:$F${ARG_SEP}ROW()))-SUM($G$2:INDEX($G:$G${ARG_SEP}ROW()))`;
// `=ROW()-1` (cột STT) không có dấu ngăn → không đụng tới.
// Bố cục sổ NP (10 cột, A..J): STT · Ngày · Diễn giải · Người · Hoá đơn đỏ · Thu · Chi · Tồn · Link chứng từ · Ghi chú.
// Khác bản gốc: BỎ "Đã hoàn ứng" / "Ngày hoàn" / "Link hóa đơn" — sổ chi phí dự án không có vòng công ty hoàn tiền.
// Dòng thu: Hoá đơn "—" (hoá đơn đỏ chỉ có nghĩa với khoản chi).
export function buildFundRow({ loai = "chi", ngay, dienGiai, nguoi = "", hoaDon = "Không", amount = 0, link = "", ghiChu = "" }) {
  const isThu = loai === "thu";
  const hd = isThu ? "—" : (hoaDon || "Không");
  const n = Number(amount) || "";
  return [
    "=ROW()-1", toDMY(ngay), dienGiai || "", nguoi || "", hd,
    isThu ? n : "", isThu ? "" : n,
    TON_FUND, link || "", ghiChu || "",
  ];
}

// ── dedup (messageId ở _state!D) ─────────────────────────────────────────────
export async function loadProcessed(sheetId) {
  const sheets = sheetsApi();
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${STATE}!D2:D` });
  return new Set((r.data.values || []).map((x) => String(x[0] || "").trim()).filter(Boolean));
}

const REP = "_rep";
// Danh sách "đã rep" TÁCH khỏi "đã ghi sổ": tin ⚠️ KHÔNG được đánh dấu đã-xử-lý (để người ta
// sửa thẳng tin cũ là bot ghi nhận), nhưng cũng không được rep lại mỗi lần chạy.
// 3 CỘT: A=MsgId (tin NGƯỜI gõ) · B=RepMsgId (tin rep của CHÍNH BOT) · C=Reason (lý do lúc rep).
// Cột B sinh ra để scanner XOÁ được tin rep khi tin gốc được sửa đúng và đã vào sổ — rep nói "CHƯA vào sổ"
// mà khoản đã ✅ là hai tín hiệu mâu thuẫn trên cùng một khoản; ai đọc rep sẽ gửi lại tin mới → ghi 2 dòng.
// Cột C sinh ra để biết LÝ DO CÓ ĐỔI KHÔNG: không lưu lý do thì "đã rep rồi thì thôi" khoá luôn tin ở
// hướng dẫn đầu tiên, người sửa xong lỗi A lộ lỗi B sẽ không bao giờ được báo B (xem nenRep ở scanner.mjs).
// KHÔNG bao giờ ghi công thức vào tab này: công thức gửi qua API parse theo LOCALE của sheet (xem
// ARG_SEP ở trên) — _rep là dữ liệu trần, đừng kéo cả tầng đó vào đây.
// Dòng CŨ thiếu cột B/C → "" → caller bỏ qua bước xoá (không đoán id) và rep lại một lần cho khớp lý do.
// Cùng msgId có thể có NHIỀU dòng (mỗi lần đổi lý do thêm một dòng) → dòng SAU đè dòng trước, vì append
// luôn ghi xuống cuối bảng nên dòng cuối là trạng thái mới nhất.
export async function loadRepped(sheetId) {
  const sheets = sheetsApi();
  try {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${REP}!A2:C` });
    // Map (không Set): `.has(msgId)` giữ nguyên hợp đồng cũ; `.get(msgId)` → { repMsgId, reason }.
    const m = new Map();
    for (const row of r.data.values || []) {
      const msgId = String((row || [])[0] || "").trim();
      if (!msgId) continue;
      m.set(msgId, {
        repMsgId: String((row || [])[1] || "").trim(), // dòng thiếu cột → undefined → ""
        reason: String((row || [])[2] || "").trim(),
      });
    }
    return m;
  } catch { return new Map(); }
}
// entries: [{ msgId, repMsgId, reason }] (chấp cả chuỗi msgId trần → hai cột sau rỗng).
export async function markRepped(sheetId, entries = []) {
  const rows = entries
    .map((e) => (typeof e === "string" ? { msgId: e } : e || {}))
    .filter((e) => e.msgId)
    .map((e) => [String(e.msgId), e.repMsgId ? String(e.repMsgId) : "", e.reason ? String(e.reason) : ""]);
  if (!rows.length) return { written: 0 };
  // Ghi ĐỦ HÀNG 3 cột vào A:C — cùng luật với _state!A:D (xem commit() bên dưới):
  // `values.append` dùng range để DÒ BẢNG rồi ghi từ **cột đầu của BẢNG**, không phải cột đầu của range.
  // Nên KHÔNG bao giờ append thẳng "C:C" để mong rơi vào cột C — nó rơi về cột A và hỏng IM LẶNG.
  await sheetsApi().spreadsheets.values.append({
    spreadsheetId: sheetId, range: `${REP}!A:C`,
    valueInputOption: "RAW", insertDataOption: "OVERWRITE", requestBody: { values: rows },
  });
  return { written: rows.length };
}

// ── commit: ghi 1 sheet (1 tab) + đánh dấu đã xử lý ──────────────────────────
export async function commit({ sheetId, tab, rows = [], msgIds = [] }) {
  const sheets = sheetsApi();
  const written = {};
  if (rows.length) {
    // Thay dấu ngăn tham số theo LOCALE CỦA CHÍNH SHEET NÀY, ngay trước khi ghi: đây là chỗ duy nhất
    // vừa async vừa biết sheetId. Hỏi hỏng (mất quyền / Sheets 5xx) → ném → scanner không ✅, quét lại
    // lượt sau. Thà không ghi còn hơn ghi "#ERROR!" đè lên sổ thật.
    const localized = localizeRows(rows, await argSepFor(sheetId));
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId, range: `${tab}!A1`,
      valueInputOption: "USER_ENTERED", insertDataOption: "OVERWRITE",
      requestBody: { values: localized },
    });
    written[tab] = rows.length;
  }
  // Ghi ĐỦ 4 cột vào A:D — KHÔNG append thẳng vào D:D.
  // `values.append` dùng range để DÒ BẢNG, rồi ghi từ cột ĐẦU CỦA BẢNG, không phải cột đầu của range.
  // Header _state trải A1:D1 (khối liền) → bảng là A:D → append "D:D" vẫn rơi xuống cột A, trong khi
  // loadProcessed đọc D2:D → dedup trả 0, mỗi lượt cron ghi lại toàn bộ cửa sổ 7 ngày (đo thật 2026-07-15).
  // (Đối chứng: `_rep` chỉ có header 1 cột → bảng là A:A → append A:A rơi đúng cột A. Đừng đổi.)
  const ts = new Date().toISOString();
  const ids = msgIds.filter(Boolean).map((id) => [ts, "", "", String(id)]);
  if (ids.length) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId, range: `${STATE}!A:D`,
      valueInputOption: "RAW", insertDataOption: "OVERWRITE",
      requestBody: { values: ids },
    });
  }
  return { written };
}

// ── Xoá 1 DÒNG trong sổ (sửa chữa chạy tay) ──────────────────────────────────
// Dùng khi bot đã ghi nhầm một dòng theo luật cũ (ca 14/08/2026: tin dặn dò có "210k" bị ghi thành khoản chi).
// 🔴 XOÁ DÒNG SỔ TIỀN LÀ KHÔNG LÙI ĐƯỢC → hàm này BẮT BUỘC đối chiếu trước khi xoá:
//   • số tiền (Thu hoặc Chi) phải khớp `expectAmount`
//   • ngày phải khớp `expectDMY` nếu truyền
// Lệch một thứ là NÉM LỖI kèm nội dung dòng thật, không xoá. Vì sao cần: số dòng có thể LỆCH bất cứ lúc nào
// (ai đó chèn/xoá dòng tay giữa lúc mình đọc và lúc mình xoá) — xoá theo số dòng trần là cách mất dòng đúng.
// Công thức KHÔNG cần sửa sau khi xoá: STT là `=ROW()-1` và Tồn quỹ dùng INDEX(...ROW()) nên tự co lại.
export async function xoaDongSo({ sheetId, tab, rowNum, expectAmount, expectDMY = null, dry = false }) {
  const sheets = sheetsApi();
  const rng = `'${tab}'!A${rowNum}:J${rowNum}`;
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: rng, valueRenderOption: "FORMATTED_VALUE" });
  const row = (r.data.values || [])[0];
  if (!row) throw new Error(`dòng ${rowNum} của tab '${tab}' RỖNG — không xoá`);
  const soTu = (v) => Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;   // "210.000" / "210,000" → 210000
  const ngay = String(row[1] ?? "").trim(), dienGiai = String(row[2] ?? "").trim();
  const thu = soTu(row[5]), chi = soTu(row[6]);
  const mota = `Ngày ${ngay} · Thu ${thu} · Chi ${chi} · "${dienGiai}"`;
  if (thu !== expectAmount && chi !== expectAmount)
    throw new Error(`KHÔNG khớp số tiền (chờ ${expectAmount}) tại dòng ${rowNum} → ${mota}. Dừng, không xoá.`);
  if (expectDMY && ngay !== expectDMY)
    throw new Error(`KHÔNG khớp ngày (chờ ${expectDMY}) tại dòng ${rowNum} → ${mota}. Dừng, không xoá.`);
  if (dry) return { dry: true, rowNum, mota };
  // gid của tab (deleteDimension đòi sheetId nội bộ, không phải tên tab).
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties" });
  const gid = meta.data.sheets.find((s) => s.properties.title === tab)?.properties?.sheetId;
  if (gid == null) throw new Error(`không tìm thấy tab '${tab}'`);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: { requests: [{ deleteDimension: { range: { sheetId: gid, dimension: "ROWS", startIndex: rowNum - 1, endIndex: rowNum } } }] },
  });
  return { deleted: true, rowNum, mota };
}

// ── Sửa Diễn giải / Ghi chú của 1 dòng (sửa chữa chạy tay) ───────────────────
// Dùng khi bot ghi ĐÚNG TIỀN nhưng chữ xấu/sai (ca 14/08/2026: nhánh $ để lại rác "Gói Pro Supabase - + -
// Tổng"). Nhẹ hơn xoaDongSo: chỉ đụng 2 ô CHỮ (C = Diễn giải, M = Ghi chú), KHÔNG đụng số tiền/công thức.
// Vẫn đối chiếu NGÀY trước khi ghi đè — số dòng có thể lệch nếu ai đó chèn/xoá dòng tay.
export async function suaDongSo({ sheetId, tab, rowNum, expectDMY, dienGiai, ghiChu, dry = false }) {
  const sheets = sheetsApi();
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `'${tab}'!A${rowNum}:J${rowNum}`, valueRenderOption: "FORMATTED_VALUE" });
  const row = (r.data.values || [])[0];
  if (!row) throw new Error(`dòng ${rowNum} của tab '${tab}' RỖNG — không sửa`);
  const ngay = String(row[1] ?? "").trim();
  const cu = { dienGiai: String(row[2] ?? "").trim(), ghiChu: String(row[9] ?? "").trim() };
  if (expectDMY && ngay !== expectDMY)
    throw new Error(`KHÔNG khớp ngày (chờ ${expectDMY}, thấy ${ngay}) tại dòng ${rowNum} → "${cu.dienGiai}". Dừng, không sửa.`);
  if (dry) return { dry: true, rowNum, cu, moi: { dienGiai, ghiChu } };
  // Ghi 2 ô rời (C và M) — KHÔNG ghi cả dải A:M, kẻo đè mất công thức STT/Tồn quỹ và các cột người nhập tay
  // (Đã hoàn ứng, Ngày hoàn, Link hóa đơn). RAW: chữ thuần, không cho Sheets diễn giải thành công thức/ngày.
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: `'${tab}'!C${rowNum}`, values: [[dienGiai]] },
        { range: `'${tab}'!J${rowNum}`, values: [[ghiChu]] },
      ],
    },
  });
  return { updated: true, rowNum, cu, moi: { dienGiai, ghiChu } };
}

// CLI nhẹ: ping <sheetId> | processed <sheetId>
if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  (async () => {
    const [cmd, sheetId] = process.argv.slice(2);
    if (cmd === "ping" && sheetId) {
      const m = await sheetsApi().spreadsheets.get({ spreadsheetId: sheetId });
      console.log(JSON.stringify({ ok: true, title: m.data.properties.title, tabs: m.data.sheets.map((s) => s.properties.title) }, null, 2));
    } else if (cmd === "processed" && sheetId) {
      console.log(JSON.stringify({ count: (await loadProcessed(sheetId)).size }));
    } else {
      console.log("Dùng: node books.mjs ping <sheetId> | processed <sheetId>");
    }
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
