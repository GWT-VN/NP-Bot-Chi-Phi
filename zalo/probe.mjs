// Phép thử Zalo Bot cho NP Chi Phí: long-poll getUpdates, in NGUYÊN payload để xem Zalo gửi gì trong nhóm.
// Token đọc từ ~/.claude/channels/zalo-np/.env (ZALO_BOT_TOKEN=...), không in ra màn hình.
// Chạy: node zalo/probe.mjs   (Ctrl+C để dừng). Payload ghi thêm vào ~/.claude/channels/zalo-np/probe.jsonl — NGOÀI repo,
// vì chứa tin thật của nhóm.
// Vì sao có file này (2026-10-07): trước khi chuyển bot sang Zalo cần đo 3 điều tài liệu Zalo không nói rõ — bot vào nhóm
// được chưa, tin "@Bot + ảnh bill" có tới không, và tin trả lời (quote) có mang ID tin được trả lời không.
import { readFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const dir = join(homedir(), ".claude", "channels", "zalo-np");
const env = readFileSync(join(dir, ".env"), "utf8");
const token = /^ZALO_BOT_TOKEN=(.+)$/m.exec(env)?.[1]?.trim();
if (!token) throw new Error("thiếu ZALO_BOT_TOKEN trong ~/.claude/channels/zalo-np/.env");

const out = join(dir, "probe.jsonl");
const goi = async (fn, body) => {
  const r = await fetch(`https://bot-api.zaloplatforms.com/bot${token}/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(45_000),
  });
  return r.json();
};

const me = await goi("getMe");
console.log("getMe:", JSON.stringify(me));
const wh = await goi("getWebhookInfo");
console.log("getWebhookInfo:", JSON.stringify(wh));
console.log(`Đang chờ tin (ghi vào ${out}) — nhắn thử trong nhóm: @bot + ảnh bill, ảnh gửi rời, trả lời (quote) tin của bot...`);

for (;;) {
  try {
    const u = await goi("getUpdates", { timeout: "30" });
    if (u?.ok && u.result && (!Array.isArray(u.result) || u.result.length)) {
      const dong = { luc: new Date().toISOString(), payload: u };
      console.log(JSON.stringify(dong, null, 2));
      appendFileSync(out, JSON.stringify(dong) + "\n");
    } else if (!u?.ok && u?.error_code !== 408) {
      console.log("lỗi:", JSON.stringify(u));
      await new Promise((r) => setTimeout(r, 5000));
    }
  } catch (e) {
    if (e.name !== "TimeoutError") console.log("lỗi mạng:", e.message);
  }
}
