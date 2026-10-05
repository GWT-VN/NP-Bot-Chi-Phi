// Luật 1–5 của NP v2 (HÀM THUẦN) — cổng "ghi ngay hay phải hỏi". Spec v2 §3.
//   1 tiền tố thu/chi · 2 đúng 1 số tiền · 3 ảnh đính trực tiếp · 4 hoá đơn rõ (Có/Không) · 5 đúng 1 quỹ trong danh sách.
// Dùng lại parser v1 (scanner.mjs: dungItem/parseEntry, 171 ca test) — KHÔNG viết lại luật đọc số tiền / hoá đơn.
import { dungItem, parseEntry } from "./scanner.mjs";

const CHU = "a-z0-9à-ỹđ";
const thoat = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Nhận nguồn quỹ trong chữ. Tên dài khớp trước và "ăn" luôn đoạn đó (tên gọi tắt nằm trong tên khác không đếm 2 lần). */
export function nhanQuy(text, quy = []) {
  let t = String(text || "").normalize("NFC").toLowerCase();
  const ten = quy.flatMap((q) => [q.ten, ...(q.goiTat || [])].filter(Boolean).map((n) => ({ quy: q.ten, n: n.normalize("NFC").toLowerCase() })))
    .sort((a, b) => b.n.length - a.n.length);
  const thay = new Set();
  for (const { quy: q, n } of ten) {
    const re = new RegExp(`(?<![${CHU}])${thoat(n)}(?![${CHU}])`, "giu");
    if (re.test(t)) { thay.add(q); t = t.replace(re, " ") }
  }
  return thay.size === 1 ? { quy: [...thay][0], soQuy: 1 } : { quy: null, soQuy: thay.size };
}

const MA_LY_DO = [["thiếu cả tiền tố", ["tien_to", "so_tien"]], ["thiếu tiền tố", ["tien_to"]], ["không thấy số tiền", ["so_tien"]],
  ["thấy", ["nhieu_so_tien"]], ["thiếu nội dung", ["noi_dung"]]];

/** Chạy luật trên tin Discord THÔ (do npso tự đọc lại, không tin lời Claude khai). */
export function kiemLuat(msg, { quy = [], channels = {} } = {}) {
  const ch = channels[String(msg.channel_id)] || { name: "?" };
  const cfg = { name: ch.name, route: "fund", book: "np", loaiTuTienTo: true };
  const item = dungItem(msg, String(msg.channel_id), cfg);
  if (!item) return { bo_qua: true, ly_do: "tin rỗng" };
  const p0 = parseEntry(item);
  if (p0.skip && p0.silent && !p0.boQua) return { bo_qua: true, ly_do: p0.reason };
  // Có tiền mà thiếu ảnh: v1 dừng ở "📷" trước khi xét tiếp → chạy lại như có ảnh để lấy đủ các trường, rồi ghi "anh" vào thiếu.
  const p = p0.boQua ? parseEntry({ ...item, hasDirectImg: true }) : p0;
  const thieu = []
  if (p.skip) {
    const ma = MA_LY_DO.find(([dau]) => p.reason.startsWith(dau))
    thieu.push(...(ma ? ma[1] : ["khac"]))
  } else {
    if (!p.loai) thieu.push("tien_to")
    if (p.usd) thieu.push("so_tien_usd")
    if (p.hoaDon === "mơ hồ") thieu.push("hoa_don")
  }
  const coAnh = !!item.hasDirectImg
  if (!coAnh) thieu.push("anh")
  // Chưa có danh sách quỹ (config `quy: []`) → luật 5 TẮT, quỹ không bắt buộc (Dũng chốt 2026-10-05: tên quỹ làm sau).
  const q = quy.length ? nhanQuy(item.content, quy) : { quy: "", soQuy: 1 }
  if (q.soQuy === 0) thieu.push("quy")
  if (q.soQuy > 1) thieu.push("quy_mo_ho")
  return {
    dung_luat: thieu.length === 0,
    loai: p.skip ? null : p.loai || null,
    so_tien: p.skip ? null : p.amount || null,
    hoa_don: p.skip ? null : p.hoaDon,
    nguon_quy: q.quy,
    co_anh: coAnh,
    noi_dung: p.skip ? null : p.noiDung,
    ghi_chu: p.skip ? "" : p.ghiChu || "",
    ngay: p.skip ? null : p.ngay,
    thieu,
    ...(p.skip ? { ly_do: p.reason } : {}),
  }
}
