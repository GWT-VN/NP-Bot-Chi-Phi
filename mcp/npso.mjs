#!/usr/bin/env node
// MCP "npso" — CỔNG GHI SỔ DUY NHẤT của bot NP v2 (spec v2 §4). Claude chỉ chạm sổ qua 5 lệnh này; không có lệnh xoá.
// Lõi luật ở so-core.mjs (đã test); file này chỉ nối Discord REST (token NP, thư mục DISCORD_STATE_DIR riêng — KHÔNG
// dùng chung ~/.claude/channels/discord với Bắp), Google Sheet (books.mjs) và Drive (drive.mjs).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const GOC = dirname(dirname(fileURLToPath(import.meta.url)));
const che = (s) => String(s).replace(/(access_token|refresh_token|token|sign|key)=[^&\s]+/gi, "$1=***").replace(/Bot [\w.-]{20,}/g, "Bot ***").slice(0, 400);
const tra = (kq) => {
  const loi = kq && typeof kq === "object" && !Array.isArray(kq) && kq.ok === false;
  return { content: [{ type: "text", text: JSON.stringify(kq, null, 1) }], ...(loi ? { isError: true } : {}) };
};
const boc = (fn) => async (a) => { try { return tra(await fn(a)) } catch (e) { return { content: [{ type: "text", text: `Lỗi hệ thống (chưa ghi gì): ${che(e?.message ?? e)}. Báo người gửi sẽ thử lại sau, KHÔNG đoán.` }], isError: true } } };

export function taoServer(core) {
  const s = new McpServer({ name: "npso", version: "2.0.0" });
  const id = z.string().regex(/^\d{5,25}$/);
  s.registerTool("kiem_tin", { description: "Đọc lại 1 tin trong kênh NP và chạy luật 1–5: đúng luật chưa, thiếu gì (tien_to, so_tien, nhieu_so_tien, anh, hoa_don, quy, quy_mo_ho, noi_dung, so_tien_usd), đã ghi sổ chưa.",
    inputSchema: { chat_id: id, message_id: id } }, boc((a) => core.kiemTin(a)));
  s.registerTool("ghi_khoan", { description: "Ghi 1 khoản vào sổ. Ghi ngay nếu tin đúng luật VÀ các trường khớp luật; ngược lại BẮT BUỘC xac_nhan_message_id = tin xác nhận của CHÍNH người gửi, gửi sau tin gốc. Tự thả ✅ và gỡ ❓.",
    inputSchema: { chat_id: id, message_id: id, loai: z.enum(["thu", "chi"]), so_tien: z.number().int().positive(), noi_dung: z.string().min(1).max(300),
      hoa_don: z.enum(["Có", "Không"]), nguon_quy: z.string().min(1), ghi_chu: z.string().max(300).optional(), xac_nhan_message_id: id.optional() } },
  boc((a) => core.ghiKhoan(a)));
  s.registerTool("sua_khoan", { description: "Sửa khoản ĐÃ ghi theo yêu cầu của CHÍNH người gửi khoản (yeu_cau_message_id gửi sau tin gốc). Sửa số tiền thì kèm loai.",
    inputSchema: { chat_id: id, message_id: id, yeu_cau_message_id: id, noi_dung: z.string().min(1).max(300).optional(), loai: z.enum(["thu", "chi"]).optional(),
      so_tien: z.number().int().positive().optional(), hoa_don: z.enum(["Có", "Không"]).optional(), nguon_quy: z.string().optional() } },
  boc((a) => core.suaKhoan(a)));
  s.registerTool("doc_so", { description: "Đọc sổ (chỉ đọc): các dòng + tổng thu/chi, lọc theo ngày dd/mm/yyyy và loai.",
    inputSchema: { chat_id: id.optional(), tu_ngay: z.string().optional(), den_ngay: z.string().optional(), loai: z.enum(["thu", "chi"]).optional() } },
  boc((a) => core.docSo(a)));
  s.registerTool("tin_chua_xu_ly", { description: "Liệt kê tin trong 7 ngày chưa ghi sổ và chưa có câu hỏi ❓ đang chờ — dùng khi vừa khởi động để quét bù.",
    inputSchema: {} }, boc(() => core.tinChuaXuLy({})));
  return s;
}

// ── Phụ thuộc thật ────────────────────────────────────────────────────────────
function tokenDiscord() {
  const dir = process.env.DISCORD_STATE_DIR || join(homedir(), ".claude", "channels", "discord-np");
  const m = /^DISCORD_BOT_TOKEN=(.+)$/m.exec(readFileSync(join(dir, ".env"), "utf8"));
  if (!m) throw new Error(`thiếu DISCORD_BOT_TOKEN trong ${dir}/.env`);
  return m[1].trim();
}
async function discordGoi(method, path, { khong404 = false } = {}) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`https://discord.com/api/v10${path}`, { method, headers: { Authorization: `Bot ${tokenDiscord()}` }, signal: AbortSignal.timeout(15_000) });
    if (r.status === 429) { const d = await r.json().catch(() => ({})); await new Promise((ok) => setTimeout(ok, (d.retry_after ?? 1) * 1000 + 100)); continue; }
    if (r.status === 404 && khong404) return null;
    if (!r.ok) throw new Error(`Discord ${r.status} ${method} ${path.split("?")[0]}`);
    return r.status === 204 ? null : r.json();
  }
  throw new Error("Discord 429 quá 5 lần");
}
const laAnh = (a) => (a.content_type || "").startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(a.filename || "");

async function taiAnh(msgs) {
  const out = [];
  for (const m of msgs) for (const a of (m.attachments || []).filter(laAnh).slice(0, 5)) {
    try {
      const r = await fetch(a.url, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) continue;
      const buffer = Buffer.from(await r.arrayBuffer());
      if (buffer.length > 4_500_000) continue;
      out.push({ buffer, mime: (r.headers.get("content-type") || a.content_type || "image/jpeg").split(";")[0], name: a.filename || `anh-${m.id}.jpg` });
    } catch {}
  }
  return out;
}

export async function taoCoreThat() {
  const cfg = JSON.parse(readFileSync(join(GOC, "config.json"), "utf8"));
  const books = await import("../books.mjs");
  const drive = await import("../drive.mjs");
  const { taoSo } = await import("../so-core.mjs");
  const { sheetId, tab, folderId } = cfg.book;
  if (!sheetId) throw new Error("config.json chưa có book.sheetId — chạy setup.mjs");
  return taoSo({ cfg,
    discord: {
      layTin: (ch, id) => discordGoi("GET", `/channels/${ch}/messages/${id}`, { khong404: true }),
      layTinKenh: async (ch, tuMs) => {
        const ra = []; let truoc = "";
        for (let trang = 0; trang < 20; trang++) {
          const b = await discordGoi("GET", `/channels/${ch}/messages?limit=100${truoc ? `&before=${truoc}` : ""}`);
          if (!b?.length) break;
          ra.push(...b); truoc = b[b.length - 1].id;
          if (b.length < 100 || Date.parse(b[b.length - 1].timestamp) < tuMs) break;
        }
        return ra.filter((m) => Date.parse(m.timestamp) >= tuMs);
      },
      react: (ch, id, e) => discordGoi("PUT", `/channels/${ch}/messages/${id}/reactions/${encodeURIComponent(e)}/@me`),
      unreact: (ch, id, e) => discordGoi("DELETE", `/channels/${ch}/messages/${id}/reactions/${encodeURIComponent(e)}/@me`, { khong404: true }),
    },
    so: {
      loadProcessed: () => books.loadProcessed(sheetId),
      commit: async ({ rows, msgIds }) => { await books.kiemTraLocale(sheetId); return books.commit({ sheetId, tab, rows, msgIds }) },
      timDong: (msgId) => books.timDongTheoMaTin(sheetId, tab, msgId),
      capNhat: (dong, f) => books.capNhatDong(sheetId, tab, dong, f),
      docSo: () => books.docSo(sheetId, tab),
    },
    drive: {
      luuAnh: async ({ msgs, loai, ngay, noiDung }) => {
        const buffers = await taiAnh(msgs);
        if (!buffers.length || !folderId) return "";
        return drive.archiveTransaction(drive.getDrive(), folderId, { quy: null, loai, dmy: ngay, msgId: msgs[0].id, desc: noiDung, buffers });
      },
    } });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await taoServer(await taoCoreThat()).connect(new StdioServerTransport());
}
