// Test chạy claude -p (chương trình giả) — chạy: node test-dv-claude.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lenhClaude, chayClaude } from "./dichvu/claude.mjs";

const d = mkdtempSync(join(tmpdir(), "cl-"));
const gia = (ten, than) => { const f = join(d, ten); writeFileSync(f, `#!/usr/bin/env node\n${than}\n`); chmodSync(f, 0o755); return f };
const chay = (f, o = {}) => chayClaude({ chuongTrinh: f, args: [], env: { PATH: process.env.PATH }, cwd: d, thoiGianMs: 3000, ...o });

test("lenhClaude: KHÔNG --bare (chỉ nhận API key, đo 2026-10-08), không nạp settings, chỉ Read thư mục ảnh (đường tuyệt đối '//'), MCP HTTP 127.0.0.1 + Bearer, strict, dontAsk, json, không lưu phiên", () => {
  const a = lenhClaude({ nguCanh: "NGỮ CẢNH", loiDan: "LỜI DẶN", model: "claude-sonnet-5-5", maxTurns: 12, cong: 8790, token: "tk", thuMucAnh: "/Users/x/anh" })
  const sau = (c) => a[a.indexOf(c) + 1]
  assert.equal(sau("-p"), "NGỮ CẢNH"); assert.equal(sau("--system-prompt"), "LỜI DẶN"); assert.equal(sau("--tools"), "Read")
  for (const c of ["--strict-mcp-config", "--no-session-persistence"]) assert.ok(a.includes(c), c)
  assert.ok(!a.includes("--bare"), "--bare không đọc token gói claude.ai"); assert.equal(sau("--setting-sources"), "")
  assert.equal(sau("--permission-mode"), "dontAsk"); assert.equal(sau("--output-format"), "json"); assert.equal(sau("--max-turns"), "12")
  assert.deepEqual(sau("--allowedTools").split(","), ["mcp__np__kiem_tin", "mcp__np__ghi_khoan", "mcp__np__sua_khoan", "mcp__np__doc_so", "mcp__np__tra_loi", "Read(//Users/x/anh/**)"])
  assert.deepEqual(JSON.parse(sau("--mcp-config")), { mcpServers: { np: { type: "http", url: "http://127.0.0.1:8790/mcp", headers: { Authorization: "Bearer tk" } } } })
})

test("phân loại: xong / hết lượt / chạm giới hạn gói / lỗi đăng nhập / lỗi khác / không có chương trình", async () => {
  assert.deepEqual(await chay(gia("ok.cjs", `process.stdout.write(JSON.stringify({type:"result",subtype:"success",is_error:false,num_turns:3,result:"x"}))`)), { ok: true, kieu: "xong", luot: 3, maThoat: 0 })
  assert.equal((await chay(gia("luot.cjs", `process.stdout.write(JSON.stringify({type:"result",subtype:"error_max_turns",is_error:true}));process.exit(1)`))).kieu, "het_luot")
  assert.equal((await chay(gia("han.cjs", `process.stderr.write("Claude usage limit reached");process.exit(1)`))).kieu, "gioi_han")
  assert.equal((await chay(gia("dn.cjs", `process.stderr.write("Invalid API key · Please run /login");process.exit(1)`))).kieu, "dang_nhap")
  const k = await chay(gia("loi.cjs", `process.stderr.write("boom");process.exit(2)`))
  assert.equal(k.kieu, "loi"); assert.match(k.loi, /boom/)
  assert.equal((await chay(join(d, "khong-co"))).kieu, "loi")
})

test("[Review Focus] quá giờ → giết CẢ nhóm tiến trình (cả tiến trình con), không để mồ côi", async () => {
  const pidFile = join(d, "con.pid")
  const f = gia("treo.cjs", `const {spawn}=require("node:child_process");const c=spawn(process.execPath,["-e","setTimeout(()=>{},60000)"],{stdio:"ignore"});require("node:fs").writeFileSync(${JSON.stringify(pidFile)},String(c.pid));setTimeout(()=>{},60000)`)
  assert.equal((await chay(f, { thoiGianMs: 800 })).kieu, "qua_gio")
  await new Promise((r) => setTimeout(r, 200))
  assert.throws(() => process.kill(Number(readFileSync(pidFile, "utf8")), 0), /ESRCH/)
})

test("huỷ (dịch vụ tắt) → giết tiến trình, kieu 'huy'; đã huỷ từ trước → không chạy", async () => {
  const f = gia("cham.cjs", `setTimeout(()=>{},60000)`)
  const ac = new AbortController(); setTimeout(() => ac.abort(), 200)
  assert.equal((await chay(f, { signal: ac.signal })).kieu, "huy")
  assert.equal((await chay(f, { signal: AbortSignal.abort() })).kieu, "huy")
})
