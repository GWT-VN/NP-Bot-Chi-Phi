// Test lớp vỏ MCP npso (lõi giả) — chạy: node test-mcp.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { taoServer, tabCuaKenh } from "./mcp/npso.mjs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

async function noi(loi) {
  const [a, b] = InMemoryTransport.createLinkedPair()
  await taoServer(loi).connect(a)
  const c = new Client({ name: "t", version: "1" }); await c.connect(b); return c
}

test("liệt kê đúng 5 lệnh, KHÔNG có lệnh xoá", async () => {
  const c = await noi({})
  const ten = (await c.listTools()).tools.map((t) => t.name).sort()
  assert.deepEqual(ten, ["doc_so", "ghi_khoan", "kiem_tin", "sua_khoan", "tin_chua_xu_ly"])
  assert.ok(!ten.some((t) => /xoa|delete/.test(t)))
})

test("ghi_khoan bị từ chối → isError, có lý do để Claude hỏi lại", async () => {
  const c = await noi({ ghiKhoan: async () => ({ ok: false, ly_do: "cần tin xác nhận của người gửi trước khi ghi", thieu: ["quy"] }) })
  const r = await c.callTool({ name: "ghi_khoan", arguments: { chat_id: "1500000000000000900", message_id: "1500000000000000100", loai: "chi", so_tien: 1000, noi_dung: "x", hoa_don: "Không", nguon_quy: "Quỹ công ty" } })
  assert.equal(r.isError, true); assert.match(r.content[0].text, /xác nhận/); assert.match(r.content[0].text, /quy/)
})

test("lỗi hạ tầng (Sheets) → isError, không lộ token", async () => {
  const c = await noi({ ghiKhoan: async () => { throw new Error("Sheets 503 https://x?access_token=SECRET9") } })
  const r = await c.callTool({ name: "ghi_khoan", arguments: { chat_id: "1500000000000000900", message_id: "1500000000000000100", loai: "chi", so_tien: 1000, noi_dung: "x", hoa_don: "Không", nguon_quy: "Q" } })
  // nguon_quy được bỏ trống (chưa có danh sách quỹ) — schema không được chặn trước khi tới lõi
  const r2 = await c.callTool({ name: "ghi_khoan", arguments: { chat_id: "1500000000000000900", message_id: "1500000000000000100", loai: "chi", so_tien: 1000, noi_dung: "x", hoa_don: "Không" } })
  assert.doesNotMatch(r2.content[0].text, /nguon_quy/)
  assert.equal(r.isError, true); assert.ok(!r.content[0].text.includes("SECRET9"))
})

test("schema chặn so_tien không phải số nguyên, loai lạ", async () => {
  const c = await noi({ ghiKhoan: async () => ({ ok: true }) })
  for (const a of [{ so_tien: 12.5 }, { loai: "chuyen" }]) {
    const r = await c.callTool({ name: "ghi_khoan", arguments: { chat_id: "1500000000000000900", message_id: "1500000000000000100", loai: "chi", so_tien: 1000, noi_dung: "x", hoa_don: "Không", nguon_quy: "Q", ...a } })
    assert.equal(r.isError, true, JSON.stringify(a))
  }
})

// Nhiều kênh (2026-10-06): mỗi kênh một tab trong cùng file Sổ chi phí New Projects.
test("tabCuaKenh: kênh có tab riêng → tab đó; không khai tab → book.tab; kênh lạ / không có tab nào → lỗi", () => {
  const cfg = { book: { tab: "Sổ chi phí" }, channels: { "1": { name: "a", tab: "Chi phí chung" }, "2": { name: "b" } } }
  assert.equal(tabCuaKenh(cfg, "1"), "Chi phí chung")
  assert.equal(tabCuaKenh(cfg, "2"), "Sổ chi phí")
  assert.throws(() => tabCuaKenh(cfg, "9"), /không phải kênh/)
  assert.throws(() => tabCuaKenh({ book: {}, channels: { "2": {} } }, "2"), /tab/)
})

// Zalo (2026-10-07): server npzalo tự tạo McpServer (có capability channel) và chat_id là mã nhóm chữ-số.
test("taoServer nhận McpServer + schema chat_id riêng; mặc định chat_id vẫn chỉ số", async () => {
  const [a, b] = InMemoryTransport.createLinkedPair()
  const s = new McpServer({ name: "x", version: "1" })
  const tra = taoServer({ kiemTin: async () => ({ ok: true }) }, { s, idKenh: z.string().regex(/^[A-Za-z0-9._-]{4,64}$/) })
  assert.equal(tra, s)
  await s.connect(a); const c = new Client({ name: "t", version: "1" }); await c.connect(b)
  const r = await c.callTool({ name: "kiem_tin", arguments: { chat_id: "6ede9afa66b88fe6d6a9", message_id: "1750316131602000" } })
  assert.notEqual(r.isError, true, r.content[0].text)
  const c2 = await noi({ kiemTin: async () => ({ ok: true }) })
  const r2 = await c2.callTool({ name: "kiem_tin", arguments: { chat_id: "6ede9afa66b88fe6d6a9", message_id: "1750316131602000" } })
  assert.equal(r2.isError, true)
})

// Review 2026-10-07 (M3): bot Discord + bot Zalo là 2 tiến trình cùng dựng cây chứng từ Drive → phải đi qua CÙNG một khoá.
test("lưu chứng từ Drive đi qua khoá liên tiến trình dùng chung (KHOA_DRIVE) — cả 2 bot dùng taoCoreThat này", async () => {
  const { KHOA_DRIVE } = await import("./mcp/npso.mjs")
  assert.match(KHOA_DRIVE, /np-drive\.lock$/)
  const nguon = (await import("node:fs")).readFileSync(new URL("./mcp/npso.mjs", import.meta.url), "utf8")
  assert.match(nguon, /voiKhoa\(KHOA_DRIVE, \(\) => drive\.luuChungTu\(/)
})
