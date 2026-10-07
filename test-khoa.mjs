// Test khoá liên tiến trình (lib/khoa.mjs) — chạy: node test-khoa.mjs. Vì sao: bot Discord và bot Zalo là 2 tiến trình cùng
// dựng cây chứng từ Drive (đếm thư mục con rồi +1, liệt kê rồi mới tạo) — ghi cùng lúc thì trùng số "NN." / trùng thư mục.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { voiKhoa } from "./lib/khoa.mjs";

const khoaMoi = () => join(mkdtempSync(join(tmpdir(), "khoa-")), "drive.lock");
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));

test("hai việc cùng khoá trong một tiến trình chạy LẦN LƯỢT, không chồng nhau", async () => {
  const k = khoaMoi(), vet = []
  const viec = (ten) => voiKhoa(k, async () => { vet.push(`${ten}+`); await ngu(50); vet.push(`${ten}-`); return ten })
  assert.deepEqual(await Promise.all([viec("a"), viec("b")]), ["a", "b"])
  assert.ok(["a+,a-,b+,b-", "b+,b-,a+,a-"].includes(vet.join()), vet.join())
})

test("khoá giữ được giữa HAI tiến trình (bot Discord + bot Zalo)", async () => {
  const k = khoaMoi()
  const con = spawn(process.execPath, ["--input-type=module", "-e",
    `const { voiKhoa } = await import(${JSON.stringify(new URL("./lib/khoa.mjs", import.meta.url).href)}); await voiKhoa(${JSON.stringify(k)}, async () => { process.stdout.write("giu\\n"); await new Promise((r) => setTimeout(r, 400)); process.stdout.write("nha\\n") })`])
  let ra = ""; con.stdout.on("data", (d) => { ra += d })
  while (!ra.includes("giu")) await ngu(10)
  const t0 = Date.now()
  await voiKhoa(k, async () => { assert.ok(ra.includes("nha"), "tiến trình kia còn giữ khoá mà bên này đã vào") })
  assert.ok(Date.now() - t0 >= 250)
})

test("việc lỗi vẫn nhả khoá; khoá bỏ lại quá hạn (tiến trình chết giữa chừng) bị phá; chờ quá lâu → lỗi rõ", async () => {
  const k = khoaMoi()
  await assert.rejects(voiKhoa(k, async () => { throw new Error("Drive 500") }), /Drive 500/)
  assert.equal(await voiKhoa(k, async () => 1), 1)
  mkdirSync(k); const cu = new Date(Date.now() - 10 * 60e3); utimesSync(k, cu, cu)
  assert.equal(await voiKhoa(k, async () => 2, { quaHan: 60_000 }), 2)
  mkdirSync(k)
  await assert.rejects(voiKhoa(k, async () => 3, { cho: 200 }), /khoá/)
})

test("thư mục cha của khoá chưa có (máy mới) → tự tạo, không làm hỏng việc lưu chứng từ", async () => {
  const k = join(mkdtempSync(join(tmpdir(), "khoa-")), "chua", "co", "drive.lock")
  assert.equal(await voiKhoa(k, async () => "ok"), "ok")
})
