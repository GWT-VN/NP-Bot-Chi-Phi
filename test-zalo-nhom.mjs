// Test liệt kê nhóm Zalo chưa khai — chạy: node test-zalo-nhom.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { nhomChuaKhai } from "./zalo/nhom.mjs";

test("gộp nhóm chưa khai từ bo-qua.jsonl + probe.jsonl, bỏ nhóm đã khai, bỏ tin riêng", () => {
  const bo = [{ ts: "2026-10-07T10:00:00Z", bo: "nhóm chưa khai", chat_id: "gA", nguoi: "Thuỷ", vi_du: "@Bot chi 50k" },
    { ts: "2026-10-07T10:01:00Z", bo: "tin riêng", nguoi: "X" }, { ts: "2026-10-07T10:02:00Z", bo: "nhóm chưa khai", chat_id: "gDaKhai" }]
  const probe = [{ luc: "2026-10-07T09:00:00Z", payload: { ok: true, result: { message: { chat: { id: "gT", chat_type: "GROUP" }, from: { display_name: "Dũng" }, text: "@Bot GWT CP test" } } } },
    { luc: "2026-10-07T09:01:00Z", payload: { ok: true, result: { message: { chat: { id: "u1", chat_type: "PRIVATE" } } } } }]
  const ra = nhomChuaKhai(bo, probe, { gDaKhai: {} })
  assert.deepEqual(ra.map((x) => x.chat_id).sort(), ["gA", "gT"])
  assert.equal(ra.find((x) => x.chat_id === "gT").nguoi, "Dũng")
})
