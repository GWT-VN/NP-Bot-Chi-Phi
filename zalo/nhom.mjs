#!/usr/bin/env node
// Liệt kê nhóm Zalo bot đã thấy mà CHƯA khai trong config.json zalo.groups — đọc bo-qua.jsonl (server npzalo ghi khi gặp
// nhóm chưa khai) và probe.jsonl (phép thử 2026-10-07). Dùng để lấy chat.id khai nhóm mới. Chạy: node zalo/nhom.mjs
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function nhomChuaKhai(dongBoQua = [], dongProbe = [], daKhai = {}) {
  const ra = new Map();
  const them = (id, nguoi, vi_du, ts) => {
    if (!id || Object.prototype.hasOwnProperty.call(daKhai, id)) return;
    const x = ra.get(id) || { chat_id: id, so_tin: 0 };
    x.so_tin++; x.lan_cuoi = ts || x.lan_cuoi;
    if (nguoi) x.nguoi = nguoi;
    if (vi_du) x.vi_du = vi_du;
    ra.set(id, x);
  };
  for (const d of dongBoQua) if (d.bo === "nhóm chưa khai") them(String(d.chat_id), d.nguoi, d.vi_du, d.ts);
  for (const d of dongProbe) for (const r of [].concat(d.payload?.result ?? [])) {
    const m = r?.message;
    if (m?.chat?.chat_type === "GROUP") them(String(m.chat.id), m.from?.display_name, String(m.text ?? m.caption ?? "").slice(0, 40), d.luc);
  }
  return [...ra.values()];
}

const docJsonl = (f) => (existsSync(f) ? readFileSync(f, "utf8").split("\n").flatMap((l) => { try { return l.trim() ? [JSON.parse(l)] : [] } catch { return [] } }) : []);

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const dir = process.env.ZALO_STATE_DIR || join(homedir(), ".claude", "channels", "zalo-np");
  const cfg = JSON.parse(readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), "config.json"), "utf8"));
  const ds = nhomChuaKhai(docJsonl(join(dir, "bo-qua.jsonl")), docJsonl(join(dir, "probe.jsonl")), cfg.zalo?.groups || {});
  if (!ds.length) console.log("Không có nhóm nào chưa khai. (Bot phải đang chạy và có người @Bot trong nhóm mới thì mới thấy.)");
  for (const x of ds) console.log(JSON.stringify(x));
}
