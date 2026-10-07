// Kho tin Zalo của bot NP (đo thật 2026-10-07): Zalo Bot API KHÔNG có API đọc lại tin theo ID, lịch sử nhóm, Reply hay
// thả biểu tượng. Lõi sổ (so-core.mjs) lại cần đọc lại tin gốc / tin xác nhận theo ID. Nên server npzalo tự lưu MỌI tin
// nhận và gửi vào một file JSONL, rồi trả tin theo "dáng tin Discord" mà so-core đang dùng — so-core chạy nguyên, không rẽ nhánh:
//   - id: số tăng theo thời gian (Zalo `date` ms × 1000 + thứ tự) — so-core so sánh id bằng BigInt như snowflake Discord.
//   - ma: số "#N" theo từng nhóm — người dùng gõ "#N" để chỉ khoản (Zalo không gửi kèm Reply).
//   - reactions: ✅ / ❓ do bot đặt, chỉ để so-core biết khoản nào đã ghi / đang hỏi.
//   - message_reference: Reply SUY RA lúc nhận tin (suyTraLoi).
// Chỉ MỘT tiến trình ghi file (server npzalo).
import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const thoat = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const co = (m, e) => (m.reactions || []).some((r) => r.me && r.emoji?.name === e);
const truoc = (a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1);

export function taoKho({ file = null, tenBot = "", botId = "bot" } = {}) {
  const tin = new Map(), theoZalo = new Map(), maCuoi = new Map();
  // "@Bot GWT CP": Zalo có thể chèn khoảng trắng lạ (NBSP) giữa các chữ, người gõ tay thì hoa thường tuỳ ý.
  const reBot = tenBot.trim() ? new RegExp(`@${tenBot.trim().split(/\s+/).map(thoat).join("\\s+")}`, "giu") : null;
  const boMention = (s) => (reBot ? String(s ?? "").replace(reBot, " ") : String(s ?? ""))
    .replace(/[^\S\n]+/g, " ").replace(/ *\n */g, "\n").trim();
  const ghi = (rec) => { if (!file) return; mkdirSync(dirname(file), { recursive: true }); appendFileSync(file, JSON.stringify(rec) + "\n") };
  const luu = (m) => {
    tin.set(m.id, m);
    if (m.zalo_id) theoZalo.set(m.zalo_id, m.id);
    if (m.ma) maCuoi.set(m.channel_id, Math.max(maCuoi.get(m.channel_id) || 0, m.ma));
  };
  const datDau = (id, e, bat) => {
    const m = tin.get(String(id));
    if (!m) return;
    m.reactions = (m.reactions || []).filter((r) => r.emoji?.name !== e);
    if (bat) m.reactions.push({ emoji: { name: e }, me: true });
  };
  const idMoi = (date) => { let n = BigInt(Math.trunc(Number(date) || Date.now())) * 1000n; while (tin.has(String(n))) n++; return String(n) };

  if (file && existsSync(file)) {
    const noi = readFileSync(file, "utf8");
    for (const dong of noi.split("\n")) {
      if (!dong.trim()) continue;
      let r;
      try { r = JSON.parse(dong) } catch { continue } // dòng cuối ghi dở (mất điện giữa chừng) — bỏ, không làm chết bot
      if (r.t === "tin") luu(r.m); else if (r.t === "dau") datDau(r.id, r.e, r.bat);
    }
    // Dòng ghi dở không có "\n" → bản ghi kế tiếp sẽ dính vào nó và MẤT ở lần đọc sau. Chốt dòng trước khi ghi tiếp.
    if (noi && !noi.endsWith("\n")) appendFileSync(file, "\n");
  }

  const cuaNguoi = (ch, uid) => [...tin.values()].filter((m) => m.channel_id === ch && !m.author?.bot && m.author?.id === uid);
  const cauHoiCuoi = (gocId) => [...tin.values()].filter((m) => m.author?.bot && m.message_reference?.message_id === gocId).sort(truoc).pop();

  // Tin mới của người A trả lời khoản nào (Zalo không gửi kèm Reply — đo 2026-10-07):
  //   1. Có "#N" là số của một tin CHÍNH A gửi trong nhóm → trỏ thẳng tin đó (trả lời lẫn "sửa #N").
  //   2. Không có ảnh và A đang có ĐÚNG MỘT khoản bot đang hỏi (❓, chưa ✅) → trỏ câu hỏi cuối của bot về khoản đó.
  //   3. Còn lại (có ảnh = khoản mới; 0 hoặc ≥2 khoản đang hỏi mà không ghi #) → không trỏ: so-core không nhận làm xác
  //      nhận, Claude hỏi lại "khoản nào, ghi #số" — thà hỏi thêm một câu còn hơn gán nhầm khoản.
  function suyTraLoi(ch, uid, noiDung, coAnh) {
    const cua = cuaNguoi(ch, uid);
    const so = /#(\d{1,6})(?!\d)/.exec(noiDung);
    if (so) { const g = cua.find((m) => m.ma === Number(so[1])); if (g) return g.id }
    if (coAnh) return null;
    const dangHoi = cua.filter((m) => co(m, "❓") && !co(m, "✅"));
    if (dangHoi.length !== 1) return null;
    return cauHoiCuoi(dangHoi[0].id)?.id ?? dangHoi[0].id;
  }

  return {
    /** Nhận 1 cập nhật getUpdates (message.text/image.received). Trả tin đã lưu; null nếu trùng / không phải tin. */
    nhan(u) {
      const z = u?.message;
      if (!z?.message_id || theoZalo.has(String(z.message_id))) return null;
      const ch = String(z.chat?.id ?? ""), uid = String(z.from?.id ?? ""), anh = z.photo_url || z.photo || "";
      const goc = String(z.text ?? z.caption ?? "");
      const noiDung = boMention(goc);
      const id = idMoi(z.date);
      const ref = suyTraLoi(ch, uid, noiDung, !!anh);
      const m = { id, zalo_id: String(z.message_id), channel_id: ch, ma: (maCuoi.get(ch) || 0) + 1, content: noiDung, raw_text: goc,
        timestamp: new Date(Number(z.date) || Date.now()).toISOString(),
        author: { id: uid, global_name: z.from?.display_name || "", bot: !!z.from?.is_bot },
        attachments: anh ? [{ url: anh, content_type: "image/jpeg", filename: `anh-${id}.jpg` }] : [], reactions: [],
        ...(ref ? { message_reference: { message_id: ref, type: 0 } } : {}) };
      luu(m); ghi({ t: "tin", m });
      return m;
    },
    /** Lưu tin bot vừa gửi (sendMessage trả message_id + date). hoi_ve = id tin người dùng mà câu này hỏi về. */
    ghiBot({ chat_id, zalo_id = "", date = Date.now(), text = "", hoi_ve = null }) {
      const id = idMoi(date);
      const m = { id, zalo_id: zalo_id ? String(zalo_id) : "", channel_id: String(chat_id), content: text,
        timestamp: new Date(Number(date) || Date.now()).toISOString(), author: { id: botId, global_name: tenBot, bot: true },
        attachments: [], reactions: [], ...(hoi_ve ? { message_reference: { message_id: String(hoi_ve), type: 0 } } : {}) };
      luu(m); ghi({ t: "tin", m });
      return m;
    },
    layTin: async (ch, id) => { const m = tin.get(String(id)); return m && m.channel_id === String(ch) ? m : null },
    layTinKenh: async (ch, tuMs) => [...tin.values()].filter((m) => m.channel_id === String(ch) && Date.parse(m.timestamp) >= tuMs),
    react: async (ch, id, e) => { datDau(id, e, true); ghi({ t: "dau", id: String(id), e, bat: true }) },
    unreact: async (ch, id, e) => { datDau(id, e, false); ghi({ t: "dau", id: String(id), e, bat: false }) },
    link: (ch, id) => `Zalo #${tin.get(String(id))?.ma ?? "?"} (tin ${id})`,
    tinTheoId: (id) => tin.get(String(id)) || null,
  };
}
