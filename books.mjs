#!/usr/bin/env node
// Tầng ghi sổ NP: 1 spreadsheet (id trong config.json book.sheetId), tab sổ + _state (dedup msgId ở cột D) + _rep.
// Import bởi scanner.mjs (ghi sổ) và test-books.mjs.
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
const TON_FUND = `=SUM($G$2:INDEX($G:$G${ARG_SEP}ROW()))-SUM($H$2:INDEX($H:$H${ARG_SEP}ROW()))`;
// `=ROW()-1` (cột STT) không có dấu ngăn → không đụng tới.
// Bố cục sổ NP v2 (12 cột, A..L): STT · Ngày · Diễn giải · Người · Hoá đơn đỏ · Nguồn quỹ · Thu · Chi · Tồn ·
// Link chứng từ · Ghi chú · Mã tin. Spec v2 §6.
//   - Nguồn quỹ (F): chi TỪ quỹ nào / thu VÀO quỹ nào — tên chuẩn trong config.json `quy` (luật 5).
//   - Mã tin (L, ẩn): msgId tin gốc — sua_khoan tìm dòng theo cột này vì người quản lý có thể xoá/chèn dòng tay.
// Khác bản gốc: BỎ "Đã hoàn ứng" / "Ngày hoàn" / "Link hóa đơn" — sổ chi phí dự án không có vòng công ty hoàn tiền.
// Dòng thu: Hoá đơn "—" (hoá đơn đỏ chỉ có nghĩa với khoản chi).
export const COT = { ngay: 1, dienGiai: 2, nguoi: 3, hoaDon: 4, nguonQuy: 5, thu: 6, chi: 7, ton: 8, link: 9, ghiChu: 10, maTin: 11 };
const CHU = "ABCDEFGHIJKL";
export function buildFundRow({ loai = "chi", ngay, dienGiai, nguoi = "", hoaDon = "Không", nguonQuy = "", amount = 0, link = "", ghiChu = "", maTin = "" }) {
  const isThu = loai === "thu";
  const hd = isThu ? "—" : (hoaDon || "Không");
  const n = Number(amount) || "";
  return [
    "=ROW()-1", toDMY(ngay), dienGiai || "", nguoi || "", hd, nguonQuy || "",
    isThu ? n : "", isThu ? "" : n,
    TON_FUND, link || "", ghiChu || "", maTin ? String(maTin) : "",
  ];
}

// Dòng (số thứ tự trên sheet, 1-based) chứa msgId ở cột L; `cot` = giá trị đọc từ L1:L (gồm tiêu đề). THUẦN.
export function viTriMaTin(cot, msgId) {
  for (let i = 1; i < cot.length; i++) if (String((cot[i] || [])[0] ?? "").trim() === String(msgId)) return i + 1;
  return null;
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
  const rng = `'${tab}'!A${rowNum}:L${rowNum}`;
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: rng, valueRenderOption: "FORMATTED_VALUE" });
  const row = (r.data.values || [])[0];
  if (!row) throw new Error(`dòng ${rowNum} của tab '${tab}' RỖNG — không xoá`);
  const soTu = (v) => Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;   // "210.000" / "210,000" → 210000
  const ngay = String(row[1] ?? "").trim(), dienGiai = String(row[2] ?? "").trim();
  const thu = soTu(row[COT.thu]), chi = soTu(row[COT.chi]);
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
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `'${tab}'!A${rowNum}:L${rowNum}`, valueRenderOption: "FORMATTED_VALUE" });
  const row = (r.data.values || [])[0];
  if (!row) throw new Error(`dòng ${rowNum} của tab '${tab}' RỖNG — không sửa`);
  const ngay = String(row[1] ?? "").trim();
  const cu = { dienGiai: String(row[2] ?? "").trim(), ghiChu: String(row[COT.ghiChu] ?? "").trim() };
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
        { range: `'${tab}'!K${rowNum}`, values: [[ghiChu]] },
      ],
    },
  });
  return { updated: true, rowNum, cu, moi: { dienGiai, ghiChu } };
}

// CLI nhẹ: ping <sheetId> | processed <sheetId>
// ── v2: tìm / sửa / đọc dòng cho MCP npso ─────────────────────────────────────
export async function timDongTheoMaTin(sheetId, tab, msgId) {
  const r = await sheetsApi().spreadsheets.values.get({ spreadsheetId: sheetId, range: `'${tab}'!L1:L` });
  return viTriMaTin(r.data.values || [], msgId);
}

// Ghi đè các trường được sửa trên MỘT dòng (đã tìm theo Mã tin). Không đụng STT/Tồn (công thức) và cột L.
export async function capNhatDong(sheetId, tab, rowNum, { dienGiai, hoaDon, nguonQuy, loai, amount, ghiChuThem } = {}) {
  const sheets = sheetsApi();
  const o = (k, v) => ({ range: `'${tab}'!${CHU[COT[k]]}${rowNum}`, values: [[v]] });
  const data = []
  if (dienGiai !== undefined) data.push(o("dienGiai", dienGiai));
  if (hoaDon !== undefined) data.push(o("hoaDon", loai === "thu" ? "—" : hoaDon));
  if (nguonQuy !== undefined) data.push(o("nguonQuy", nguonQuy));
  if (amount !== undefined || loai !== undefined) {
    if (!loai || amount === undefined) throw new Error("sửa số tiền phải kèm cả loai lẫn amount");
    data.push(o("thu", loai === "thu" ? Number(amount) : ""), o("chi", loai === "thu" ? "" : Number(amount)));
  }
  if (ghiChuThem) {
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `'${tab}'!K${rowNum}` });
    const cu = String(((r.data.values || [])[0] || [])[0] ?? "").trim();
    data.push(o("ghiChu", cu ? `${cu}; ${ghiChuThem}` : ghiChuThem));
  }
  if (!data.length) return { updated: false };
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId: sheetId, requestBody: { valueInputOption: "RAW", data } });
  return { updated: true, rowNum, so: data.length };
}

// Đọc toàn bộ sổ (cho doc_so). Ngày giữ dạng chữ dd/mm/yyyy, số giữ dạng số.
export async function docSo(sheetId, tab) {
  const r = await sheetsApi().spreadsheets.values.get({ spreadsheetId: sheetId, range: `'${tab}'!A2:L`,
    valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING" });
  return (r.data.values || []).map((x, i) => ({ dong: i + 2, ngay: x[COT.ngay] ?? "", dienGiai: x[COT.dienGiai] ?? "",
    nguoi: x[COT.nguoi] ?? "", hoaDon: x[COT.hoaDon] ?? "", nguonQuy: x[COT.nguonQuy] ?? "", thu: Number(x[COT.thu]) || 0,
    chi: Number(x[COT.chi]) || 0, ghiChu: x[COT.ghiChu] ?? "", maTin: String(x[COT.maTin] ?? "") })).filter((d) => d.ngay || d.thu || d.chi);
}

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
