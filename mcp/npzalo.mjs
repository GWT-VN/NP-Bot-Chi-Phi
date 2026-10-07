#!/usr/bin/env node
// MCP "npzalo" — bot NP trên NHÓM Zalo (Zalo Bot Platform), chạy song song bot Discord.
// Spec: docs/superpowers/specs/2026-10-07-np-bot-zalo-design.md. MỘT tiến trình làm 3 việc, vì kho tin (zalo/kho.mjs)
// phải là nguồn duy nhất — Zalo không có API đọc lại tin:
//   1. Channel của Claude Code: long-poll getUpdates, chỉ đẩy tin của NHÓM đã khai (config.json zalo.groups) vào phiên.
//   2. 5 lệnh sổ (taoServer của npso, lõi so-core dùng chung) — ghi/sửa xong server TỰ báo trong nhóm (thay ✅ Discord).
//   3. tra_loi (chỉ gửi vào nhóm đã khai — KHÔNG có gửi tin riêng) và tai_anh (tải ảnh bill về inbox để Claude xem).
// stdout là đường MCP → nhật ký ghi FILE (bo-qua.jsonl), không console.log.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { taoServer, taoCoreThat } from "./npso.mjs";
import { taoKho } from "../zalo/kho.mjs";
import { taoApi, docToken, chiaDoan } from "../zalo/api.mjs";

export const HUONG_DAN = "Tin nhóm Zalo tới dạng <channel source=\"npzalo\" chat_id message_id ma tac_gia nguoi_id co_anh nhom>, "
  + "thêm tra_loi_khoan / tra_loi_ma khi tin được hiểu là trả lời một khoản. Chỉ tin có @Bot mới tới. Xử lý theo CLAUDE.md; "
  + "nói gì trong nhóm thì dùng tra_loi (hỏi về khoản thì truyền hoi_ve).";
const ID_NHOM = z.string().regex(/^[A-Za-z0-9._-]{4,64}$/);
const ID_TIN = z.string().regex(/^\d{5,25}$/);
const tra = (kq) => ({ content: [{ type: "text", text: JSON.stringify(kq, null, 1) }], ...(kq?.ok === false ? { isError: true } : {}) });
const boc = (fn) => async (a) => {
  try { return tra(await fn(a)) }
  catch (e) { return { content: [{ type: "text", text: `Lỗi hệ thống: ${String(e?.message ?? e).slice(0, 300)}` }], isError: true } }
};

/** Xử lý một lượt getUpdates: mỗi cập nhật tự bắt lỗi — một tin hỏng không được làm mất các tin còn lại (Zalo đã giao
 * rồi, không giao lại). */
export async function xuLyLo(ds, nhanCapNhat, nhatKy = () => {}) {
  for (const u of ds) {
    try { await nhanCapNhat(u) }
    catch (e) { nhatKy({ loi: `xử lý tin hỏng: ${String(e?.message ?? e).slice(0, 200)}`, su_kien: u?.event_name || "" }) }
  }
}

export function taoServerZalo({ core, kho, api, cfg, inbox, taiFn = fetch, nhatKy = () => {} }) {
  const nhom = cfg.channels || {};
  const hopLe = (ch) => Object.prototype.hasOwnProperty.call(nhom, String(ch));
  const s = new McpServer({ name: "npzalo", version: "1.0.0" }, { capabilities: { experimental: { "claude/channel": {} } }, instructions: HUONG_DAN });

  // Gửi TỪNG đoạn ≤ 2000 và lưu kho ngay sau mỗi đoạn: đoạn 2 lỗi thì đoạn 1 (người dùng đã thấy) vẫn có trong kho, và khoản
  // đang hỏi vẫn được đánh dấu ❓ ngay sau đoạn đầu — không thì câu trả lời của họ không gắn được vào khoản.
  async function gui(chat_id, text, hoi_ve = null) {
    let dau = true;
    for (const doan of chiaDoan(text)) {
      for (const r of await api.guiChu(chat_id, doan)) {
        kho.ghiBot({ chat_id, zalo_id: r?.message_id, date: r?.date, text: doan, hoi_ve: dau ? hoi_ve : null });
        if (dau && hoi_ve) await kho.react(chat_id, hoi_ve, "❓");
        dau = false;
      }
    }
  }
  // Ghi/sửa xong → server TỰ báo trong nhóm: không phụ thuộc Claude nhớ trả lời, và quy ước "tin không có bot trả lời = bot
  // chưa thấy" vẫn đúng. Báo lỗi KHÔNG làm hỏng kết quả ghi sổ (sổ đã ghi) — trả cảnh báo để Claude tự báo, không ghi lại.
  async function baoNhom(kq, chat_id, chu) {
    if (!kq?.ok) return kq;
    try { await gui(chat_id, chu); return { ...kq, da_bao_nhom: "server đã tự báo trong nhóm — KHÔNG trả lời thêm" } }
    catch (e) { return { ...kq, canh_bao: [...(kq.canh_bao || []), `chưa báo được trong nhóm (${e.message}) — tự tra_loi ngắn cho người gửi`] } }
  }
  const coreZ = {
    ...core,
    ghiKhoan: async (a) => {
      const kq = await core.ghiKhoan(a), m = kho.tinTheoId(a.message_id);
      const bu = String(kq?.da_ghi || "").startsWith("khoản này đã có");
      const anhLoi = (kq?.canh_bao || []).some((x) => /ảnh/.test(x));
      return baoNhom(kq, a.chat_id, bu ? `✅ #${m?.ma} đã có trong sổ`
        : `✅ #${m?.ma} ${m?.author?.global_name || ""} · ${kq?.da_ghi}${anhLoi ? " (chưa lưu được ảnh chứng từ — người quản lý kiểm tra)" : ""}`);
    },
    suaKhoan: async (a) => {
      const kq = await core.suaKhoan(a), m = kho.tinTheoId(a.message_id);
      return baoNhom(kq, a.chat_id, `✏️ Đã sửa #${m?.ma} theo yêu cầu của ${m?.author?.global_name || "người gửi"}`);
    },
  };
  taoServer(coreZ, { s, idKenh: ID_NHOM });

  s.registerTool("tra_loi", { description: "Gửi 1 tin vào nhóm Zalo (chỉ nhóm sổ NP đã khai; không gửi tin riêng được). Khi HỎI LẠI về một khoản: truyền hoi_ve = message_id tin khoản đó (server tự đánh dấu khoản đang hỏi). Chốt một khoản đang hỏi mà KHÔNG ghi sổ (hoá ra là ghi chú, người gửi huỷ): truyền bo_hoi = message_id khoản đó để gỡ dấu đang hỏi. Tin > 2000 ký tự tự chia đoạn.",
    inputSchema: { chat_id: ID_NHOM, text: z.string().min(1).max(6000), hoi_ve: ID_TIN.optional(), bo_hoi: ID_TIN.optional() } },
  boc(async ({ chat_id, text, hoi_ve, bo_hoi }) => {
    if (!hopLe(chat_id)) return { ok: false, ly_do: "chỉ được gửi vào nhóm sổ chi phí NP đã khai trong config.json" };
    for (const [ten, id] of [["hoi_ve", hoi_ve], ["bo_hoi", bo_hoi]]) {
      if (!id) continue;
      const g = kho.tinTheoId(id);
      if (!g || g.channel_id !== String(chat_id) || g.author?.bot) return { ok: false, ly_do: `${ten} phải là message_id của một tin người dùng trong nhóm này` };
    }
    await gui(chat_id, text, hoi_ve); // ❓ được đặt trong gui, ngay sau đoạn đầu
    // Khoản chốt không ghi phải thôi "đang hỏi", không thì nó còn hút tin chữ của người gửi và nằm mãi trong dang_cho (review I2).
    if (bo_hoi) await kho.unreact(chat_id, bo_hoi, "❓");
    return { ok: true };
  }));

  s.registerTool("tai_anh", { description: "Tải ảnh bill của 1 tin trong nhóm về máy để xem (Read đường dẫn trả về).",
    inputSchema: { chat_id: ID_NHOM, message_id: ID_TIN } },
  boc(async ({ chat_id, message_id }) => {
    const m = kho.tinTheoId(message_id);
    const a = m && m.channel_id === String(chat_id) ? m.attachments?.[0] : null;
    if (!a) return { ok: false, ly_do: "tin này không có ảnh" };
    // Mọi kiểu hỏng (HTTP lỗi, mạng/hết giờ, link hết hạn trả trang HTML) đều về MỘT câu cho Claude: nhờ người gửi gửi lại
    // ảnh — "Lỗi hệ thống" thì Claude hứa "thử lại sau" mà ảnh hết hạn không bao giờ tải lại được (Review Focus 1).
    const guiLai = (ly) => ({ ok: false, ly_do: `không tải được ảnh (${ly}) — nhờ người gửi gửi lại ảnh` });
    let r;
    try { r = await taiFn(a.url, { signal: AbortSignal.timeout(20_000) }) } catch (e) { return guiLai(e?.name === "TimeoutError" ? "hết giờ chờ" : "lỗi mạng") }
    if (!r.ok) return guiLai(`HTTP ${r.status}`);
    const loai = String(r.headers?.get?.("content-type") || "");
    if (loai && !loai.startsWith("image/")) return guiLai(`Zalo trả ${loai.split(";")[0]}, không phải ảnh`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 20_000_000) return { ok: false, ly_do: "ảnh quá 20MB — nhờ người gửi gửi lại ảnh nhỏ hơn" };
    mkdirSync(inbox, { recursive: true });
    const duong_dan = join(inbox, `${message_id}.jpg`);
    writeFileSync(duong_dan, buf);
    return { ok: true, duong_dan };
  }));

  /** Một cập nhật getUpdates: lọc → lưu kho → đẩy vào phiên Claude. */
  async function nhanCapNhat(u) {
    const z = u?.message, ch = String(z?.chat?.id ?? "");
    if (!z || !/^message\.(text|image)\.received$/.test(String(u?.event_name))) return nhatKy({ bo: u?.event_name || "không rõ" });
    if (z.chat?.chat_type !== "GROUP") return nhatKy({ bo: "tin riêng", nguoi: z.from?.display_name || "" });
    if (!hopLe(ch)) return nhatKy({ bo: "nhóm chưa khai", chat_id: ch, nguoi: z.from?.display_name || "", vi_du: String(z.text ?? z.caption ?? "").slice(0, 40) });
    const m = kho.nhan(u);
    if (!m) return;
    const ref = m.message_reference?.message_id ? kho.tinTheoId(m.message_reference.message_id) : null;
    const goc = ref?.author?.bot ? kho.tinTheoId(ref.message_reference?.message_id) : ref;
    await s.server.notification({ method: "notifications/claude/channel", params: {
      content: m.content || (m.attachments.length ? "(ảnh, không có chú thích)" : "(trống)"),
      meta: { chat_id: ch, message_id: m.id, ma: String(m.ma), tac_gia: m.author.global_name, nguoi_id: m.author.id,
        co_anh: m.attachments.length ? "1" : "0", nhom: nhom[ch]?.name || "",
        ...(goc ? { tra_loi_khoan: goc.id, tra_loi_ma: String(goc.ma), tra_loi_kieu: m.message_reference.suy_ra ? "suy_ra" : "#N" } : {}) } } });
  }
  return { s, nhanCapNhat };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const GOC = dirname(dirname(fileURLToPath(import.meta.url)));
  const dir = process.env.ZALO_STATE_DIR || join(homedir(), ".claude", "channels", "zalo-np");
  const tat = JSON.parse(readFileSync(join(GOC, "config.json"), "utf8"));
  const cfg = { ...tat, channels: tat.zalo?.groups || {} };
  const nhatKy = (d) => { try { mkdirSync(dir, { recursive: true }); appendFileSync(join(dir, "bo-qua.jsonl"), JSON.stringify({ ts: new Date().toISOString(), ...d }) + "\n") } catch {} };
  const kho = taoKho({ file: join(dir, "kho.jsonl"), tenBot: tat.zalo?.tenBot || "" });
  const api = taoApi({ token: docToken(dir), ...(process.env.ZALO_API_GOC ? { goc: process.env.ZALO_API_GOC } : {}) }); // ZALO_API_GOC: chỉ để test

  const core = await taoCoreThat({ cfg, nguonTin: kho });
  const { s, nhanCapNhat } = taoServerZalo({ core, kho, api, cfg, inbox: join(dir, "inbox"), nhatKy });
  // Phiên Claude đóng (kể cả chết đột ngột) → stdin đóng → THOÁT NGAY. Vòng long-poll không tự dừng; tiến trình mồ côi sẽ
  // giành getUpdates của phiên mới và ghi tin vào kho với số #N riêng (review I3).
  const thoi = () => process.exit(0);
  process.stdin.on("end", thoi); process.stdin.on("close", thoi); process.on("SIGTERM", thoi);
  await s.connect(new StdioServerTransport());
  s.server.onclose = thoi;
  for (;;) {
    try { await xuLyLo(await api.layCapNhat(), nhanCapNhat, nhatKy) }
    catch (e) { nhatKy({ loi: String(e?.message ?? e).slice(0, 200) }); await new Promise((r) => setTimeout(r, 5000)) }
  }
}
