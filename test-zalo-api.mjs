// Test gọi Zalo Bot API (fetch giả) — chạy: node test-zalo-api.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { taoApi, chiaDoan, docToken } from "./zalo/api.mjs";

const TOKEN = "123456789:SECRETabc-xyz";
const tra = (j, status = 200) => async () => ({ status, json: async () => j });

test("chiaDoan: ngắn giữ nguyên; dài cắt thành đoạn ≤ 2000, ưu tiên chỗ xuống dòng", () => {
  assert.deepEqual(chiaDoan("abc"), ["abc"])
  const dai = Array.from({ length: 300 }, (_, i) => `dòng số ${i} cho đủ dài`).join("\n")
  const d = chiaDoan(dai)
  assert.ok(d.length >= 3); assert.ok(d.every((x) => x.length <= 2000)); assert.equal(d.join("\n"), dai)
})

test("layCapNhat: 408 (không có tin) → []; một tin (object) → mảng 1 phần tử", async () => {
  assert.deepEqual(await taoApi({ token: TOKEN, fetchFn: tra({ ok: false, error_code: 408, description: "timeout" }) }).layCapNhat(), [])
  const u = { event_name: "message.text.received", message: { message_id: "m1" } }
  assert.deepEqual(await taoApi({ token: TOKEN, fetchFn: tra({ ok: true, result: u }) }).layCapNhat(), [u])
})

test("lỗi Zalo / lỗi mạng: có mã lỗi, KHÔNG lộ token", async () => {
  const a = taoApi({ token: TOKEN, fetchFn: tra({ ok: false, error_code: 401, description: "Unauthorized" }, 401) })
  await assert.rejects(a.goi("getMe"), (e) => e.code === 401 && !e.message.includes("SECRET"))
  const b = taoApi({ token: TOKEN, fetchFn: async (url) => { throw new Error(`connect ECONNREFUSED ${url}`) } })
  await assert.rejects(b.goi("getMe"), (e) => e.code === 0 && !e.message.includes("SECRET"))
})

test("guiChu: chữ 4500 ký tự → nhiều lần sendMessage đúng chat_id, mỗi đoạn ≤ 2000", async () => {
  const goi = []
  const a = taoApi({ token: TOKEN, fetchFn: async (url, o) => { goi.push({ url, body: JSON.parse(o.body) }); return { status: 200, json: async () => ({ ok: true, result: { message_id: `b${goi.length}`, date: 1 } }) } } })
  const kq = await a.guiChu("g1", "x".repeat(4500))
  assert.equal(goi.length, 3); assert.equal(kq.length, 3)
  assert.ok(goi.every((g) => g.url.endsWith("/sendMessage") && g.body.chat_id === "g1" && g.body.text.length <= 2000))
})

test("docToken: đọc ZALO_BOT_TOKEN trong .env; thiếu → lỗi rõ", () => {
  const d = mkdtempSync(join(tmpdir(), "zt-"))
  writeFileSync(join(d, ".env"), "ZALO_APP_ID=1\nZALO_BOT_TOKEN=abc:def\n")
  assert.equal(docToken(d), "abc:def")
  writeFileSync(join(d, ".env"), "ZALO_APP_ID=1\n")
  assert.throws(() => docToken(d), /ZALO_BOT_TOKEN/)
})
