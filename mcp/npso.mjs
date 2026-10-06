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
const boc = (fn) => async (a) => { try { return tra(await fn(a)) } catch (e) { return { content: [{ type: "text", text: `Lỗi hệ thống: ${che(e?.message ?? e)}. Có thể đã ghi một phần — gọi kiem_tin để xem tin đã vào sổ chưa trước khi thử lại; KHÔNG đoán.` }], isError: true } } };

export function taoServer(core) {
  const s = new McpServer({ name: "npso", version: "2.0.0" });
  const id = z.string().regex(/^\d{5,25}$/);
  s.registerTool("kiem_tin", { description: "Đọc lại 1 tin trong kênh NP và chạy luật 1–5: đúng luật chưa, thiếu gì (tien_to, so_tien, nhieu_so_tien, anh, hoa_don, quy, quy_mo_ho, noi_dung, so_tien_usd), đã ghi sổ chưa.",
    inputSchema: { chat_id: id, message_id: id } }, boc((a) => core.kiemTin(a)));
  s.registerTool("ghi_khoan", { description: "Ghi 1 khoản vào sổ theo giá trị BẠN đọc và chốt từ tin (và ảnh). Chỉ gọi khi tin đã đủ rõ 5 ý: thu hay chi, số tiền, có ảnh chứng từ, hoá đơn (Có / Không / Chờ xuất — không nhắc = Không), nguồn quỹ (tên trong danh_sach_quy). Thiếu hoặc chưa rõ ý nào thì HỎI người gửi trước, đừng đoán. Đã hỏi và người gửi Reply trả lời → truyền xac_nhan_message_id = tin Reply đó (lệnh kiểm đúng người gửi). ngay (dd/mm/yyyy): ngày chi ghi trong tin, không có thì bỏ trống. Kết quả có tham_chieu = chỗ bộ đọc luật thấy khác giá trị bạn chốt → đọc lại tin, sai thì sua_khoan. Tự thả ✅ và gỡ ❓.",
    inputSchema: { chat_id: id, message_id: id, loai: z.enum(["thu", "chi"]), so_tien: z.number().int().positive(), noi_dung: z.string().min(1).max(300),
      hoa_don: z.enum(["Có", "Không", "Chờ xuất"]), nguon_quy: z.string().max(60).optional(), ghi_chu: z.string().max(300).optional(), xac_nhan_message_id: id.optional(),
      ngay: z.string().regex(/^\d{1,2}\/\d{1,2}\/\d{4}$/).optional() } },
  boc((a) => core.ghiKhoan(a)));
  s.registerTool("sua_khoan", { description: "Sửa khoản ĐÃ ghi theo yêu cầu của CHÍNH người gửi khoản (yeu_cau_message_id gửi sau tin gốc). Sửa số tiền thì kèm loai.",
    inputSchema: { chat_id: id, message_id: id, yeu_cau_message_id: id, noi_dung: z.string().min(1).max(300).optional(), loai: z.enum(["thu", "chi"]).optional(),
      so_tien: z.number().int().positive().optional(), hoa_don: z.enum(["Có", "Không", "Chờ xuất"]).optional(), nguon_quy: z.string().max(60).optional() } },
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
      // Drive không giới hạn cỡ như API ảnh của Claude: ảnh điện thoại 5–12MB vẫn phải lưu được chứng từ. Trần 20MB chỉ chặn file lạ.
      if (buffer.length > 20_000_000) continue;
      out.push({ buffer, mime: (r.headers.get("content-type") || a.content_type || "image/jpeg").split(";")[0], name: a.filename || `anh-${m.id}.jpg` });
    } catch {}
  }
  return out;
}

// Nhiều kênh (2026-10-06): mỗi kênh một tab sổ trong cùng file. Kênh khai `tab` riêng; không khai thì dùng book.tab.
export function tabCuaKenh(cfg, kenh) {
  const k = (cfg.channels || {})[String(kenh)];
  if (!k) throw new Error(`kênh ${kenh} không phải kênh sổ chi phí NP`);
  const tab = k.tab || cfg.book?.tab;
  if (!tab) throw new Error(`kênh ${kenh} chưa khai tab sổ trong config.json`);
  return tab;
}

export async function taoCoreThat() {
  const cfg = JSON.parse(readFileSync(join(GOC, "config.json"), "utf8"));
  const books = await import("../books.mjs");
  const drive = await import("../drive.mjs");
  const { taoSo } = await import("../so-core.mjs");
  const { sheetId, folderId } = cfg.book;
  const tab = (kenh) => tabCuaKenh(cfg, kenh);
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
      commit: async ({ rows, msgIds, kenh }) => { await books.kiemTraLocale(sheetId); return books.commit({ sheetId, tab: tab(kenh), rows, msgIds }) },
      timDong: (msgId, kenh) => books.timDongTheoMaTin(sheetId, tab(kenh), msgId),
      capNhat: (dong, f, kenh) => books.capNhatDong(sheetId, tab(kenh), dong, f),
      docSo: (kenh) => books.docSo(sheetId, tab(kenh)),
    },
    drive: {
      // Cây kế toán (2026-10-06): <folderId> / <tab kênh> / YYYY / MM.YYYY / Có HĐ | Không HĐ | Thu / NN. <diễn giải>
      luuAnh: async ({ msgs, loai, ngay, noiDung, kenh, quy, hoaDon }) => {
        const buffers = await taiAnh(msgs);
        if (!buffers.length || !folderId) return "";
        return drive.luuChungTu(drive.getDrive(), folderId, { kenh: tab(kenh), quy, loai, hoaDon, dmy: ngay, msgId: msgs[0].id, desc: noiDung, buffers });
      },
    } });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await taoServer(await taoCoreThat()).connect(new StdioServerTransport());
}
