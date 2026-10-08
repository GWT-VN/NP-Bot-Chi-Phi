// Adapter Zalo của np-dichvu (spec 2026-10-08 §Luồng 1): lọc → lưu tin + việc (MỘT giao dịch, trong csdl.nhanTin) → tải ảnh
// bill NGAY (link Zalo có thể hết hạn trước khi khoản được ghi). Nhóm chưa khai ghi mốc `nhom_la:<chat_id>` (xem --kiem-tra).
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { datMoc } from "./csdl.mjs";

export function taoAdapterZalo({ db, kho, nhom, nhomVanHanh = null, thuMucAnh, taiFn = fetch, nhatKy = () => {}, now = Date.now }) {
  const hopLe = (ch) => Object.prototype.hasOwnProperty.call(nhom, ch);
  async function taiAnh(t) {
    let tt = "da_tai", tep = null;
    try {
      const r = await taiFn(t.anh_url, { signal: AbortSignal.timeout(20_000) });
      const loai = String(r.headers?.get?.("content-type") || "");
      if (!r.ok) tt = `loi:HTTP ${r.status}`;
      else if (loai && !loai.startsWith("image/")) tt = `loi:Zalo trả ${loai.split(";")[0]}, không phải ảnh`;
      else {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 20_000_000) tt = "loi:ảnh quá 20MB";
        else { mkdirSync(thuMucAnh, { recursive: true }); tep = join(thuMucAnh, `${t.id}.jpg`); writeFileSync(tep, buf) }
      }
    } catch (e) { tt = `loi:${e?.name === "TimeoutError" ? "hết giờ chờ" : "lỗi mạng"}` }
    kho.datAnh(t.id, { tep, tt });
    nhatKy({ tin: t.id, anh: tt === "da_tai" ? "da_tai" : "loi" });
  }
  async function nhan(u) {
    const z = u?.message, ch = String(z?.chat?.id ?? "");
    if (!z || !/^message\.(text|image)\.received$/.test(String(u?.event_name))) return nhatKy({ bo: u?.event_name || "khong_ro" });
    if (z.chat?.chat_type !== "GROUP") return nhatKy({ bo: "tin_rieng" });
    if (z.from?.is_bot) return nhatKy({ bo: "tin_bot" }); // tin của chính bot quay lại → vòng lặp bot trả lời bot
    if (nhomVanHanh && ch === String(nhomVanHanh)) return nhatKy({ bo: "nhom_van_hanh" });
    if (!hopLe(ch)) {
      datMoc(db, `nhom_la:${ch}`, now(), JSON.stringify({ nguoi: z.from?.display_name || "", vi_du: String(z.text ?? z.caption ?? "").slice(0, 40) }));
      return nhatKy({ bo: "nhom_chua_khai", chat_id: ch });
    }
    const t = kho.nhanTin(u, { now: now() });
    if (!t) return;
    nhatKy({ nhan: t.id, chat_id: ch, ma: t.ma });
    if (t.anh_tt === "cho_tai") await taiAnh(t);
  }
  return { nhan, taiAnhConDo: async () => { for (const t of kho.tinChoTaiAnh()) await taiAnh(t) } };
}

/** Một lượt getUpdates: mỗi cập nhật tự bắt lỗi — một tin hỏng không làm mất các tin còn lại (Zalo đã giao, không giao lại). */
export async function xuLyLo(ds, fn, nhatKy = () => {}) {
  for (const u of ds) {
    try { await fn(u) }
    catch (e) { nhatKy({ loi: `xử lý tin hỏng: ${String(e?.message ?? e).slice(0, 200)}`, su_kien: u?.event_name || "" }) }
  }
}
