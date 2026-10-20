#!/usr/bin/env node
// Bot có bị "off" lúc nào không (chủ dự án 2026-10-20) — CHỈ ĐỌC: CSDL dịch vụ (readOnly), nhật ký logs/dichvu-*.jsonl (giữ 30 ngày),
// lịch ngủ/thức của máy (pmset). In lần khởi động lại, cảnh báo, lỗi vòng lặp, tin nhận trễ / trả lời chậm. Không in nội dung tin.
//   node dichvu/gian-doan.mjs            (trên Mac mini)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { thuMucDichVu } from "./chinh.mjs";

const gio = (ms) => new Date(ms).toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(",", "");
const phut = (ms) => Math.round(ms / 60e3);

/** tins: tin người gửi JOIN viec — luc = giờ gửi trên Zalo, tao_luc = lúc dịch vụ nhận, xong_luc; suKien: các dòng nhật ký. */
export function gianDoan({ tins, suKien, nhanTre = 2 * 60e3, xongTre = 5 * 60e3 }) {
  const kd = suKien.filter((e) => e.khoi_dong), cb = suKien.filter((e) => e.canh_bao), loi = new Map();
  for (const e of suKien.filter((x) => x.vong && x.loi)) {
    const k = `${e.vong}: ${String(e.loi).slice(0, 80)}`, v = loi.get(k) || { n: 0, dau: e.ts };
    v.n++; v.cuoi = e.ts; loi.set(k, v);
  }
  const cham = tins.filter((t) => t.tao_luc - t.luc > nhanTre || (t.xong_luc ?? Infinity) - t.luc > xongTre);
  return [
    `Khởi động lại (${kd.length}): ${kd.map((e) => gio(Date.parse(e.ts))).join(", ") || "—"}`,
    `Cảnh báo (${cb.length}):`, ...cb.map((e) => `  ${gio(Date.parse(e.ts))} ${e.canh_bao}`),
    `Lỗi vòng lặp (${loi.size} loại):`, ...[...loi].map(([k, v]) => `  ${v.n}× ${gio(Date.parse(v.dau))} → ${gio(Date.parse(v.cuoi))} ${k}`),
    `Tin chậm (${cham.length}/${tins.length}) — nhận trễ > ${phut(nhanTre)}′ hoặc xong > ${phut(xongTre)}′:`,
    ...cham.map((t) => `  #${t.ma} ${t.ten} gửi ${gio(t.luc)} · nhận sau ${phut(t.tao_luc - t.luc)}′ · ${t.xong_luc ? `xong sau ${phut(t.xong_luc - t.luc)}′` : `CHƯA XONG (${t.trang_thai})`}${t.so_lan > 1 ? ` · ${t.so_lan} lần` : ""}${t.loi_cuoi ? ` · ${String(t.loi_cuoi).slice(0, 80)}` : ""}`),
  ];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const th = thuMucDichVu(), db = new DatabaseSync(th.csdl, { readOnly: true });
  const tins = db.prepare(`SELECT t.ma, t.ten, t.luc, v.tao_luc, v.xong_luc, v.so_lan, v.trang_thai, v.loi_cuoi
    FROM viec v JOIN tin t ON t.id = v.tin_id ORDER BY t.luc`).all().map((r) => ({ ...r }));
  db.close();
  const suKien = readdirSync(th.logs).filter((f) => /^dichvu-.*\.jsonl$/.test(f)).sort()
    .flatMap((f) => readFileSync(join(th.logs, f), "utf8").split("\n").flatMap((d) => { try { return [JSON.parse(d)] } catch { return [] } }));
  for (const d of gianDoan({ tins, suKien })) console.log(d);
  // Máy ngủ thì dịch vụ đứng mà nhật ký không có lỗi nào — xem lịch ngủ/thức của macOS.
  let ngu = [];
  try { ngu = execFileSync("pmset", ["-g", "log"], { encoding: "utf8", maxBuffer: 512 << 20 }).split("\n").filter((d) => /^\d{4}-\d{2}-\d{2} [\d:]+ [+-]\d{4} (Sleep|Wake) /.test(d)) } catch {}
  console.log(`Máy ngủ/thức (${ngu.length} lần, 30 lần cuối):`);
  for (const d of ngu.slice(-30)) console.log(`  ${d.replace(/\s+/g, " ").slice(0, 110)}`);
}
