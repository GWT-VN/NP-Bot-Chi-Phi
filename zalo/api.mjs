// Gọi Zalo Bot API (https://bot.zaloplatforms.com/docs) cho bot NP. Token nằm TRONG URL → không bao giờ đưa URL hay lỗi
// gốc của fetch vào thông báo lỗi. sendMessage giới hạn 1–2000 ký tự → chia đoạn.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function docToken(dir) {
  const m = /^ZALO_BOT_TOKEN=(.+)$/m.exec(readFileSync(join(dir, ".env"), "utf8"));
  if (!m) throw new Error(`thiếu ZALO_BOT_TOKEN trong ${dir}/.env`);
  return m[1].trim();
}

/** Chia chữ thành các đoạn ≤ max ký tự, ưu tiên cắt ở chỗ xuống dòng. */
export function chiaDoan(text, max = 2000) {
  let con = String(text ?? "");
  const ra = [];
  while (con.length > max) {
    let cat = con.lastIndexOf("\n", max);
    if (cat < max / 2) cat = max;
    ra.push(con.slice(0, cat));
    con = con.slice(con[cat] === "\n" ? cat + 1 : cat);
  }
  ra.push(con);
  return ra;
}

export function taoApi({ token, fetchFn = fetch, goc = "https://bot-api.zaloplatforms.com" }) {
  async function goi(fn, body = {}, timeoutMs = 45_000) {
    let r;
    try {
      r = await fetchFn(`${goc}/bot${token}/${fn}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      const loi = new Error(`Zalo ${fn}: ${e?.name === "TimeoutError" ? "hết giờ chờ" : "lỗi mạng"}`);
      loi.code = 0;
      throw loi;
    }
    const j = await r.json().catch(() => null);
    if (!j?.ok) {
      const loi = new Error(`Zalo ${fn} lỗi ${j?.error_code ?? r.status}: ${String(j?.description ?? "").slice(0, 200)}`);
      loi.code = j?.error_code ?? r.status;
      throw loi;
    }
    return j.result;
  }
  return {
    goi,
    /** Long-poll 30s. Không có tin → Zalo trả 408 → []. */
    async layCapNhat() {
      try { const kq = await goi("getUpdates", { timeout: "30" }); return kq == null ? [] : [].concat(kq) }
      catch (e) { if (e.code === 408) return []; throw e }
    },
    async guiChu(chat_id, text) {
      const ra = [];
      for (const doan of chiaDoan(text)) ra.push(await goi("sendMessage", { chat_id: String(chat_id), text: doan }, 15_000));
      return ra;
    },
  };
}
