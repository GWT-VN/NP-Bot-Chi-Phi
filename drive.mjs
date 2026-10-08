#!/usr/bin/env node
// 🧾 Helper Google Drive cho Xét duyệt chi phí / Sổ quỹ.
// HAI phần:
//   (A) Module (import bởi scanner.mjs): lưu ẢNH CHỨNG TỪ (hóa đơn / ảnh CK) vào Drive theo cây
//       GIAO DỊCH → cột Link trong sổ trỏ tới bản Drive (KHÔNG dẫn chiếu Discord — xóa kênh vẫn xem được).
//   (B) CLI legacy `upload` (flow skill cũ per-employee, DRIVE_FOLDER_ID) — GIỮ để không vỡ SKILL.md.
// Tái dùng PATTERN kho-hang/drive.mjs, KHÔNG import chéo (mỗi tính năng độc lập).

import { readFileSync, createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { google } from "googleapis";
import { getAuthClient } from "./lib/google-auth.mjs";

const SELF = path.dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  try {
    for (const line of readFileSync(path.join(SELF, ".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}
loadEnv();

const MIME_BY_EXT = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".heic": "image/heic", ".pdf": "application/pdf",
};

export function getDrive() {
  return google.drive({ version: "v3", auth: getAuthClient() });
}

// Bỏ ký tự Windows/Drive kỵ (\ / : * ? " < > |) + ký tự điều khiển, gọn khoảng trắng.
// `max` = độ dài tối đa (mặc định 120; tên folder GIAO DỊCH dùng 60 — diễn giải đầy đủ vẫn nằm trong sổ).
export function cleanName(name, max = 120) {
  const s = [...String(name).replace(/[\\/:*?"<>|]/g, "-")].filter((c) => c.charCodeAt(0) >= 32).join("");
  return s.replace(/\s+/g, " ").trim().slice(0, max).trim() || "Khong ten";
}

// Tìm hoặc tạo folder con `name` trong `parentId`
export async function ensureFolder(drive, parentId, name) {
  const escaped = cleanName(name).replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)", pageSize: 1, supportsAllDrives: true, includeItemsFromAllDrives: true,
  });
  if (res.data.files?.length) return res.data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name: cleanName(name), mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id", supportsAllDrives: true,
  });
  return created.data.id;
}

// Tạo (nếu chưa có) chuỗi folder lồng nhau từ rootId → trả id folder cuối + link
export async function ensurePath(drive, rootId, segments) {
  let id = rootId;
  for (const seg of segments) id = await ensureFolder(drive, id, seg);
  return { folderId: id, folderLink: `https://drive.google.com/drive/folders/${id}` };
}

// Upload 1 ảnh từ buffer vào folderId → trả {fileId, webViewLink}
export async function uploadBuffer(drive, folderId, fileName, buffer) {
  const ext = path.extname(fileName).toLowerCase();
  const mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const res = await drive.files.create({
    requestBody: { name: cleanName(fileName), parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id, webViewLink", supportsAllDrives: true,
  });
  return { fileId: res.data.id, webViewLink: res.data.webViewLink };
}

// Escape chuỗi nhét vào literal 'single-quoted' của Drive query (v3): \ rồi '.
function q(s) { return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }

// Đếm folder con trực tiếp của parentId (có phân trang — quá 100 giao dịch/tháng vẫn đếm đúng).
async function countSubFolders(drive, parentId) {
  let n = 0, pageToken;
  do {
    const res = await drive.files.list({
      q: `'${q(parentId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken, files(id)", pageSize: 1000, pageToken,
      supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    n += res.data.files?.length ?? 0;
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return n;
}

// ── Folder GIAO DỊCH: `<NN>. <diễn giải>` — danh tính là msgId, KHÔNG phải tên ────────────────
// 🔴 Vì sao tra theo appProperties.msgId chứ không theo tên:
//   1) Tên KHÔNG tất định: số thứ tự = "đếm folder hiện có + 1". Lưu Drive xong mà commit sổ gãy
//      (Sheets 429/5xx) → tin không vào `_state` → lượt sau xử lý LẠI → đếm ra số KHÁC → folder thứ hai
//      cùng nội dung, ảnh nhân đôi. Tra theo msgId thì chạy lại bao nhiêu lần cũng ra đúng folder cũ.
//   2) Trùng diễn giải là chuyện thường ("Ship hàng cho khách" 3 lần/tháng = 3 giao dịch KHÁC NHAU).
//      Tra theo tên là gộp nhầm 3 giao dịch vào 1 folder.
// Tên `01. Ship hàng` cho NGƯỜI đọc; danh tính cho MÁY là msgId.
// Số 2 chữ số có padding (`01.`…`10.`) là BẮT BUỘC: Drive sắp theo CHỮ, `1.` ra thứ tự 1, 10, 11, 2, 3.
// Số đếm RIÊNG trong mỗi folder `<NN>. <Thu|Chi>` của mỗi tháng — KHÔNG phải STT của sổ (scanner lưu Drive
// TRƯỚC khi ghi sổ nên lúc đó chưa có dòng; và STT `=ROW()-1` đếm cả tab mọi tháng, không reset theo tháng).
export async function ensureTxFolder(drive, parentId, msgId, desc) {
  const id = String(msgId || "");
  if (id) {
    const res = await drive.files.list({
      q: `'${q(parentId)}' in parents and appProperties has { key='msgId' and value='${q(id)}' } `
       + `and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)", pageSize: 1, supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    if (res.data.files?.length) return { folderId: res.data.files[0].id, name: res.data.files[0].name, created: false };
  }
  const nn = String((await countSubFolders(drive, parentId)) + 1).padStart(2, "0"); // >99 tràn 3 chữ số tự nhiên
  const name = `${nn}. ${cleanName(desc, 60)}`;
  const created = await drive.files.create({
    requestBody: {
      name, mimeType: "application/vnd.google-apps.folder", parents: [parentId],
      ...(id ? { appProperties: { msgId: id } } : {}),
    },
    fields: "id, name", supportsAllDrives: true,
  });
  return { folderId: created.data.id, name: created.data.name, created: true };
}

// ── Lưu chứng từ 1 giao dịch (dùng bởi scanner) ──────────────────────────────
// Cây Drive (rootId = folder QUỸ trong channels.json _books):
//   Sổ Hiền (2 quỹ): <folder Hiền> / <01. Sổ tiền mặt|02. Sổ tạm ứng> / <YYYY.MM> / <01. Thu|02. Chi> / <NN>. <diễn giải> / <ảnh...>
//   Sổ Trang (1 quỹ): <folder Trang> /                                  <YYYY.MM> / <01. Thu|02. Chi> / <NN>. <diễn giải> / <ảnh...>
// Cấp quỹ chỉ chèn khi quy = "tamung"|"tienmat" (kênh splitQuy). Trang đi tab "default" → quy không khớp
// → KHÔNG có cấp quỹ. quy/loai = null → bỏ cấp tương ứng. KHÔNG còn cấp NGÀY.
// buffers: [{buffer, name}] · quy: "tamung"|"tienmat"|"default"|null · loai: "thu"|"chi"|null
// dmy: "dd/mm/yyyy" · msgId · desc: diễn giải (đặt tên folder giao dịch, cắt 60 ký tự)
// Trả link FOLDER GIAO DỊCH (dán vào cột Link chứng từ) → link trỏ ĐÚNG giao dịch, không phải cả ngày.
// "" nếu thiếu gốc/ảnh. Ảnh đặt tên <tail 6 số>_<n>; ảnh trùng tên đã có thì BỎ QUA (không nhân đôi khi chạy lại).
// anhMsgId: khi đính ảnh từ tin REPLY (vd chị Hiền chụp thanh toán) vào folder giao dịch GỐC — folder vẫn
// định vị theo msgId GỐC, nhưng tên ảnh lấy tail từ anhMsgId (id reply) để KHÔNG trùng tên ảnh của tin gốc
// (cùng tail = cùng tên → `had` nuốt mất, ảnh chị Hiền không bao giờ được upload). Không truyền → tail = msgId (cũ).
export async function archiveTransaction(drive, rootId, { quy = null, loai = null, dmy, msgId, desc, buffers, anhMsgId = null }) {
  if (!rootId || !buffers?.length) return "";
  const [, mm, yyyy] = String(dmy || "").split("/");
  const monthSeg = (mm && yyyy) ? `${yyyy}.${mm}` : "khong-ro-ngay";
  const segs = [];
  // Cấp quỹ (chỉ file có 2 quỹ): <folder Hiền>/01. Sổ tiền mặt/2026.07/02. Chi/01. Mua mực in/
  if (quy === "tamung") segs.push("02. Sổ tạm ứng"); else if (quy === "tienmat") segs.push("01. Sổ tiền mặt");
  segs.push(monthSeg);
  if (loai === "thu") segs.push("01. Thu"); else if (loai === "chi") segs.push("02. Chi");
  const { folderId: parentId } = await ensurePath(drive, rootId, segs);
  return luuVaoGiaoDich(drive, parentId, { msgId, desc, buffers, anhMsgId });
}

// ── Cây chứng từ NP kiểu KẾ TOÁN (chủ dự án 2026-10-06, giống "Lưu chứng từ" của admin) ─────────────
// <gốc = folder mới trong "0. OTHERS - NEW BRANDS / Chi phí"> / <kênh> / <quỹ> / 01. Có HĐ | 02. Không HĐ | 03. Thu / YYYY
//   / MM.YYYY / DD.MM.YYYY / NN. <diễn giải> / ảnh. Nhóm HĐ đứng TRÊN thời gian (chủ dự án chốt 2026-10-06): kế toán
//   gom chứng từ theo có/không hoá đơn trước, rồi mới lần theo ngày. <quỹ> = Nguồn quỹ đã chốt (chị Tuyết Trang đặt 3 quỹ 2026-10-06);
//   chưa rõ quỹ → "Chưa rõ quỹ", không đoán.  <kênh> = tên tab sổ của kênh (mỗi kênh một tab, một nhánh chứng từ).
// Thu không có Có/Không HĐ (sổ ghi "—") → nhánh riêng 03. Thu.
export function duongChungTu({ kenh, quy, loai, hoaDon, dmy }) {
  if (!kenh) throw new Error("thiếu kênh — không biết lưu chứng từ vào nhánh nào");
  const [d, m, yyyy] = String(dmy || "").split("/");
  // Đệm 0 bắt buộc: Drive sắp theo CHỮ, "8.9.2026" sẽ đứng sau "10.9.2026".
  const dd = String(d || "").padStart(2, "0"), mm = String(m || "").padStart(2, "0");
  const thoiGian = d && m && yyyy ? [yyyy, `${mm}.${yyyy}`, `${dd}.${mm}.${yyyy}`] : ["khong-ro-ngay"];
  const nhom = loai === "thu" ? "03. Thu" : hoaDon === "Có" ? "01. Có HĐ" : "02. Không HĐ";
  return [kenh, String(quy || "").trim() || "Chưa rõ quỹ", nhom, ...thoiGian];
}

export async function luuChungTu(drive, rootId, { kenh, quy, loai, hoaDon, dmy, msgId, desc, buffers, anhMsgId = null, taoRong = false }) {
  // taoRong (dịch vụ Zalo, 2026-10-08): khoản chưa có ảnh vẫn có thư mục để người gửi tự tải chứng từ vào. Bot Discord: false.
  if (!rootId || (!buffers?.length && !taoRong)) return "";
  const { folderId: parentId } = await ensurePath(drive, rootId, duongChungTu({ kenh, quy, loai, hoaDon, dmy }));
  return luuVaoGiaoDich(drive, parentId, { msgId, desc, buffers: buffers || [], anhMsgId });
}

// Folder giao dịch (tra theo msgId) + upload ảnh chưa có — dùng chung cho cả hai kiểu cây.
async function luuVaoGiaoDich(drive, parentId, { msgId, desc, buffers, anhMsgId = null }) {
  const { folderId } = await ensureTxFolder(drive, parentId, msgId, desc);
  // Ảnh đã có sẵn trong folder (lượt trước lưu Drive xong nhưng commit sổ gãy) → không upload lại.
  const had = new Set();
  {
    let pageToken;
    do {
      const res = await drive.files.list({
        q: `'${q(folderId)}' in parents and trashed = false`,
        fields: "nextPageToken, files(name)", pageSize: 1000, pageToken,
        supportsAllDrives: true, includeItemsFromAllDrives: true,
      });
      for (const f of res.data.files ?? []) had.add(f.name);
      pageToken = res.data.nextPageToken;
    } while (pageToken);
  }
  const tail = String(anhMsgId || msgId || "").slice(-6) || "xxxxxx";
  let i = 0;
  for (const b of buffers) {
    i += 1;
    const ext = path.extname(b.name || "") || ".jpg";
    const fname = cleanName(`${tail}_${String(i).padStart(2, "0")}${ext}`);
    if (had.has(fname)) continue;
    await uploadBuffer(drive, folderId, fname, b.buffer);
  }
  return `https://drive.google.com/drive/folders/${folderId}`;
}

/** Thư mục đã có ít nhất 1 file (không tính thùng rác) chưa — dịch vụ Zalo quét chứng từ bổ sung (2026-10-08). */
export async function thuMucCoFile(drive, folderId) {
  const res = await drive.files.list({
    q: `'${q(folderId)}' in parents and trashed = false`, fields: "files(id)", pageSize: 1,
    supportsAllDrives: true, includeItemsFromAllDrives: true,
  }, { timeout: 20_000 }); // treo không được chặn vòng bảo trì (sao lưu, cảnh báo, nhắc) — rà soát cuối 2026-10-08
  return (res.data.files?.length ?? 0) > 0;
}

// Tạo 1 folder con `name` trong `parentId` (hoặc My Drive nếu không có parent). Trả {folderId, link}.
export async function createFolder(name, parentId = null) {
  const drive = getDrive();
  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", ...(parentId ? { parents: [parentId] } : {}) },
    fields: "id, webViewLink", supportsAllDrives: true,
  });
  return { folderId: created.data.id, link: created.data.webViewLink };
}

