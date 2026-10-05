// Test đường LỖI phải kêu to (offline: fetch giả) — chạy: node test-loi.mjs (exit 0 = đạt).
// Review cuối nhánh: (1) đọc _state lỗi bị nuốt → ghi trùng cả cửa sổ 7 ngày, job xanh;
// (2) thiếu quyền react/reply (401/403) chỉ log → không ai thấy ✅, người gửi lại → ghi trùng, job xanh.
import assert from "node:assert/strict";
import { napDaGhi, reply, react } from "./scanner.mjs";

let n = 0;
const t = async (ten, fn) => { await fn(); n++; console.log("  ✓ " + ten); };
const traVe = (status, body = {}) => async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fetchGoc = globalThis.fetch;

await t("đọc _state lỗi → NÉM (không coi như sổ trống)", async () => {
  await assert.rejects(napDaGhi(async () => { throw new Error("Sheets 429"); }, { np: { sheetId: "x" } }), /Sheets 429/);
});
await t("đọc _state được → trả Set theo sổ", async () => {
  const r = await napDaGhi(async (id) => new Set([id + "-1"]), { np: { sheetId: "x" } });
  assert.deepEqual([...r.np], ["x-1"]);
});
for (const st of [401, 403]) {
  await t(`reply ${st} → ném + workflow đỏ`, async () => {
    process.exitCode = 0; globalThis.fetch = traVe(st);
    try { await assert.rejects(reply("c", "m", "x")); assert.equal(process.exitCode, 1); }
    finally { globalThis.fetch = fetchGoc; process.exitCode = 0; }
  });
  await t(`react ${st} → ném + workflow đỏ`, async () => {
    process.exitCode = 0; globalThis.fetch = traVe(st);
    try { await assert.rejects(react("c", "m", "✅")); assert.equal(process.exitCode, 1); }
    finally { globalThis.fetch = fetchGoc; process.exitCode = 0; }
  });
}
await t("reply 404 (tin gốc đã xoá) → ném nhưng KHÔNG đỏ", async () => {
  process.exitCode = 0; globalThis.fetch = traVe(404);
  try { await assert.rejects(reply("c", "m", "x")); assert.equal(process.exitCode, 0); }
  finally { globalThis.fetch = fetchGoc; process.exitCode = 0; }
});
console.log(`\n${n} test đạt`);
