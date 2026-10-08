#!/usr/bin/env node
// Chương trình `claude` GIẢ cho test đầu cuối np-dichvu: đọc --mcp-config như claude thật, gọi công cụ qua MCP HTTP theo
// kịch bản trong `kich-ban.json` ở thư mục chạy (mỗi lần chạy lấy một kịch bản), ghi lại gói ngữ cảnh nhận được, in JSON
// như `claude -p --output-format json`. Kịch bản: { loai: "goi", goi: [{ ten, doi }] } | { loai: "im_lang" } | { loai: "loi" }.
// "$TIN" = message_id tin mới, "$KHOAN" = message_id khoản ở dòng "TRẢ LỜI CHO".
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const a = process.argv.slice(2), lay = (c) => a[a.indexOf(c) + 1];
const nguCanh = lay("-p"), np = JSON.parse(lay("--mcp-config")).mcpServers.np;
const ds = existsSync("kich-ban.json") ? JSON.parse(readFileSync("kich-ban.json", "utf8")) : [];
const kb = ds.shift() ?? { loai: "im_lang" };
writeFileSync("kich-ban.json", JSON.stringify(ds));
writeFileSync(`ngu-canh-${Date.now()}.txt`, nguCanh);
if (kb.loai === "loi") { process.stderr.write("lỗi giả"); process.exit(1) }
const tin = /message_id (\d+)/.exec(nguCanh)?.[1] ?? "", khoan = /TRẢ LỜI CHO .*?message_id (\d+)/.exec(nguCanh)?.[1] ?? "";
const thay = (v) => JSON.parse(JSON.stringify(v).replaceAll("$TIN", tin).replaceAll("$KHOAN", khoan));
const ketQua = [];
if (kb.loai === "goi") {
  const c = new Client({ name: "claude-gia", version: "1" });
  await c.connect(new StreamableHTTPClientTransport(new URL(np.url), { requestInit: { headers: np.headers } }));
  for (const g of kb.goi) ketQua.push((await c.callTool({ name: g.ten, arguments: thay(g.doi) })).content[0].text);
  await c.close();
}
process.stdout.write(JSON.stringify({ type: "result", subtype: "success", is_error: false, num_turns: ketQua.length + 1, result: ketQua.join("\n") }) + "\n");
