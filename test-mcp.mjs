// Test lớp vỏ MCP npso (lõi giả) — chạy: node test-mcp.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { taoServer } from "./mcp/npso.mjs";

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
  assert.equal(r.isError, true); assert.ok(!r.content[0].text.includes("SECRET9"))
})

test("schema chặn so_tien không phải số nguyên, loai lạ", async () => {
  const c = await noi({ ghiKhoan: async () => ({ ok: true }) })
  for (const a of [{ so_tien: 12.5 }, { loai: "chuyen" }]) {
    const r = await c.callTool({ name: "ghi_khoan", arguments: { chat_id: "1500000000000000900", message_id: "1500000000000000100", loai: "chi", so_tien: 1000, noi_dung: "x", hoa_don: "Không", nguon_quy: "Q", ...a } })
    assert.equal(r.isError, true, JSON.stringify(a))
  }
})
