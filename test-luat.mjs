// Test luật 1–5 của NP v2 (thuần) — chạy: node test-luat.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { nhanQuy, kiemLuat } from "./luat.mjs";

const QUY = [{ ten: "Quỹ công ty", goiTat: ["qct", "quỹ cty", "tiền công ty"] }, { ten: "Tiền cá nhân ứng", goiTat: ["tiền túi", "tự ứng"] }];
const KENH = { "900": { name: "new-projects" } };
const ANH = [{ url: "u", filename: "bill.jpg", content_type: "image/jpeg" }];
const tin = (content, o = {}) => ({ id: "1001", channel_id: "900", content, timestamp: "2026-10-05T03:00:00.000Z",
  author: { id: "77", username: "lan", global_name: "Lan" }, attachments: ANH, ...o });
const kl = (content, o) => kiemLuat(tin(content, o), { quy: QUY, channels: KENH });

test("nhanQuy: tên chuẩn, tên gọi tắt, không phân biệt hoa thường, NFD", () => {
  assert.deepEqual(nhanQuy("chi mua giấy 50k qct", QUY), { quy: "Quỹ công ty", soQuy: 1 });
  assert.deepEqual(nhanQuy("chi mua giấy 50k TIỀN TÚI", QUY), { quy: "Tiền cá nhân ứng", soQuy: 1 });
  assert.deepEqual(nhanQuy("chi 50k từ Quỹ công ty".normalize("NFD"), QUY), { quy: "Quỹ công ty", soQuy: 1 });
  assert.deepEqual(nhanQuy("chi 50k", QUY), { quy: null, soQuy: 0 });
  assert.deepEqual(nhanQuy("chi 50k qct một nửa, tiền túi một nửa", QUY), { quy: null, soQuy: 2 });
  assert.deepEqual(nhanQuy("chi 50k qcty", QUY), { quy: null, soQuy: 0 }); // dính chữ → không nhận nhầm
})

test("đúng đủ 5 luật → dung_luat, đủ trường", () => {
  const r = kl("chi Mua vật tư mẫu 1.250.000đ có hoá đơn đỏ, quỹ cty");
  assert.equal(r.dung_luat, true); assert.deepEqual(r.thieu, []);
  assert.equal(r.loai, "chi"); assert.equal(r.so_tien, 1250000); assert.equal(r.hoa_don, "Có"); assert.equal(r.nguon_quy, "Quỹ công ty");
  assert.equal(r.co_anh, true); assert.equal(r.ngay, "05/10/2026"); assert.match(r.noi_dung, /Mua vật tư mẫu/);
})

test("thiếu từng luật → đúng mã thiếu", () => {
  assert.deepEqual(kl("Mua vật tư 1.250.000đ qct").thieu, ["tien_to"]);
  assert.deepEqual(kl("chi Mua vật tư qct").thieu, ["so_tien"]);
  assert.deepEqual(kl("chi Vật tư 300k và công 200k qct").thieu, ["nhieu_so_tien"]);
  assert.deepEqual(kl("chi Mua vật tư 1.250.000đ qct", { attachments: [] }).thieu, ["anh"]);
  assert.deepEqual(kl("chi Mua vật tư 1.250.000đ hoá đơn gửi sau qct").thieu, ["hoa_don"]);
  assert.deepEqual(kl("chi Mua vật tư 1.250.000đ").thieu, ["quy"]);
  assert.deepEqual(kl("chi Mua vật tư 1.250.000đ qct và tiền túi").thieu, ["quy_mo_ho"]);
  assert.equal(kl("chi Mua vật tư 1.250.000đ").dung_luat, false);
})

test("thiếu nhiều luật cùng lúc → liệt kê đủ (Claude hỏi một lần)", () => {
  const r = kl("Mua vật tư 1.250.000đ", { attachments: [] });
  assert.deepEqual(r.thieu.sort(), ["anh", "quy", "tien_to"]);
})

test("tin ghi chú / không ghi sổ / trò chuyện → bo_qua, không phải khoản", () => {
  assert.equal(kl("note tổng tháng 16.055.200đ").bo_qua, true);
  assert.equal(kl("khoản này không ghi sổ nhé 500k").bo_qua, true);
  assert.equal(kl("Vâng chị em nhận rồi ạ", { attachments: [] }).bo_qua, true);
})

test("khoản $ → số tiền VND chưa có, phải xác nhận", () => {
  const r = kl("chi ChatGPT Plus $20 qct");
  assert.ok(r.thieu.includes("so_tien_usd")); assert.equal(r.dung_luat, false);
})
