#!/usr/bin/env node
// THỬ NGHIỆM (nhánh thu-album-message-id, chủ dự án 2026-10-08): Zalo Bot API có lệnh nào KHÔNG ghi trong tài liệu để lấy ảnh
// của một tin album theo message_id không? Tài liệu chỉ có getMe/getUpdates/…/sendMessage — đoán là KHÔNG, thử để chắc.
// An toàn: chỉ gọi tên lệnh kiểu ĐỌC (không send/forward/copy — không gửi gì vào nhóm), KHÔNG gọi getUpdates (không giành tin
// của dịch vụ đang chạy), KHÔNG in token, chỉ in KHOÁ của kết quả (không in nội dung).
// Chạy (không cần checkout nhánh): node thu-album.mjs [chat_id] [message_id]
//   không truyền → lấy tin mới nhất KHÔNG có ảnh của nhóm đoàn trong ~/Bots/np-dichvu/np.sqlite (tin album chỉ tới phần chữ).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const NHOM = "zgr-ed6cf9b895d77c8925c6";
const tep = process.env.NP_BI_MAT || join(homedir(), "Bots", ".secrets", "np-dichvu.env");
const token = /^ZALO_BOT_TOKEN=(.+)$/m.exec(readFileSync(tep, "utf8"))?.[1]?.trim();
if (!token) { console.error(`không thấy ZALO_BOT_TOKEN trong ${tep}`); process.exit(1) }
const goc = process.env.ZALO_API_GOC || "https://bot-api.zaloplatforms.com";

let [chat, msg] = process.argv.slice(2);
if (!msg) {
  const db = new DatabaseSync(process.env.NP_CSDL || join(homedir(), "Bots", "np-dichvu", "np.sqlite"));
  const r = db.prepare("SELECT chat_id, msg_goc, ma, luc, noi_dung FROM tin WHERE chat_id=? AND la_bot=0 AND anh_tt='khong_co' ORDER BY luc DESC LIMIT 1").get(chat || NHOM);
  db.close();
  if (!r) { console.error("không có tin nào không ảnh trong nhóm — truyền chat_id message_id bằng tay"); process.exit(1) }
  [chat, msg] = [r.chat_id, r.msg_goc];
  console.log(`tin thử: #${r.ma} lúc ${new Date(r.luc).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} — "${String(r.noi_dung).slice(0, 30)}…"`);
}

async function goi(lenh, than) {
  try {
    const r = await fetch(`${goc}/bot${token}/${lenh}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(than), signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => null);
    const kq = j?.result;
    return `HTTP ${r.status} · ok=${j?.ok} · ${j?.ok ? `kết quả: ${kq && typeof kq === "object" ? Object.keys(kq).join(",") : typeof kq}${JSON.stringify(kq ?? "").includes("http") ? " · CÓ LINK" : ""}` : `lỗi ${j?.error_code ?? "?"}: ${String(j?.description ?? "").slice(0, 90)}`}`;
  } catch (e) { return `không gọi được (${e?.name === "TimeoutError" ? "hết giờ" : "lỗi mạng"})` }
}

console.log(`đối chứng getMe → ${await goi("getMe", {})}`);
const LENH = ["getMessage", "getMessages", "getMessageById", "getChatMessage", "getChatMessages", "getChatHistory", "getHistory",
  "getConversation", "getConversationHistory", "getFile", "getMedia", "getPhoto", "getPhotos", "getAlbum", "getAttachments", "getChat"];
for (const lenh of LENH) {
  for (const than of [{ chat_id: chat, message_id: msg }, { message_id: msg }]) {
    console.log(`${lenh}(${Object.keys(than).join(",")}) → ${await goi(lenh, than)}`);
  }
}
