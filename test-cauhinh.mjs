// Test cấu hình chạy bot NP v2 (bot/, mac/) — chạy: node test-cauhinh.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
const doc = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const st = JSON.parse(doc("./bot/bot-settings.json"));
const allow = st.permissions.allow, deny = st.permissions.deny;

test("[Review Focus 5] bot NP dùng thư mục Discord RIÊNG, không đụng của Bắp", () => {
  const s = doc("./mac/start-bot.sh");
  assert.match(s, /export DISCORD_STATE_DIR="\$HOME\/\.claude\/channels\/discord-np"/);
  assert.ok(!/channels\/discord"/.test(s) && !/channels\/discord\//.test(s.replace(/discord-np/g, "")), "không được trỏ thư mục mặc định của Bắp");
  assert.match(doc("./mac/watchdog.sh"), /tmux has-session -t np\b/);
});

test("chỉ cho đúng công cụ cần: Discord (không edit), 5 lệnh npso, Read inbox NP", () => {
  for (const t of ["mcp__plugin_discord_discord__reply", "mcp__plugin_discord_discord__react", "mcp__plugin_discord_discord__fetch_messages",
    "mcp__plugin_discord_discord__download_attachment", "mcp__npso__kiem_tin", "mcp__npso__ghi_khoan", "mcp__npso__sua_khoan",
    "mcp__npso__doc_so", "mcp__npso__tin_chua_xu_ly"]) assert.ok(allow.includes(t), `thiếu allow ${t}`);
  assert.ok(allow.some((t) => /^Read\(\/\/Users\/\*\/\.claude\/channels\/discord-np\/inbox\/\*\*\)$/.test(t)));
  for (const t of ["Bash", "Edit", "Write", "WebFetch", "WebSearch", "Agent", "mcp__plugin_discord_discord__edit_message",
    "Read(**/.env*)", "Read(//Users/*/Bots/.secrets/**)", "Read(//Users/*/.claude/channels/discord/**)"]) assert.ok(deny.includes(t), `thiếu deny ${t}`);
});

test("start-bot: dontAsk vĩnh viễn, --tools Read, nạp npso, chạy trong bot/, prompt quét bù", () => {
  const s = doc("./mac/start-bot.sh");
  assert.match(s, /--permission-mode dontAsk/); assert.match(s, /--tools "Read"/);
  assert.match(s, /--mcp-config "\$DIR\/bot\/mcp\.json"/); assert.match(s, /cd "\$DIR\/bot"/); assert.match(s, /tin_chua_xu_ly/);
  const lenh = s.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n") // comment được phép nhắc tên cờ để giải thích
  assert.ok(!/--strict-mcp-config/.test(lenh), "cờ này tắt plugin Discord");
});

test("hook: tồn tại, cấu hình gọi theo $CLAUDE_PROJECT_DIR; CLAUDE.md bot có luật xác nhận + không xoá", () => {
  const cmds = Object.values(st.hooks).flat().flatMap((h) => h.hooks).map((h) => h.command);
  for (const c of cmds) { const m = c.match(/\$CLAUDE_PROJECT_DIR\/(hooks\/[\w-]+\.mjs)/); assert.ok(m, c); assert.ok(existsSync(new URL(`./bot/${m[1]}`, import.meta.url)), m[1]) }
  const c = doc("./bot/CLAUDE.md");
  for (const x of ["ghi_khoan", "xac_nhan_message_id", "kiem_tin", "tin_chua_xu_ly", "không xoá", "DỮ LIỆU"]) assert.ok(c.includes(x), x);
});

test("[review M10] start-bot xoá biến môi trường có thể đè token/access của NP", () => {
  assert.match(doc("./mac/start-bot.sh"), /unset DISCORD_BOT_TOKEN DISCORD_ACCESS_MODE/);
});

test("[review M1] scanner.mjs chạy trơn (không cờ) phải TỪ CHỐI — v2 không còn quét theo lịch, tránh nơi ghi thứ hai", async () => {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, ["scanner.mjs"], { cwd: (await import("node:url")).fileURLToPath(new URL(".", import.meta.url)), env: { ...process.env, DISCORD_BOT_TOKEN: "x" }, encoding: "utf8" });
  assert.notEqual(r.status, 0); assert.match(r.stdout + r.stderr, /v2/);
});

// Chạy thật 2026-10-06: prompt "Quét bù" truyền lúc khởi động tới TRƯỚC khi npso + plugin Discord kết nối → bot báo
// "chưa có công cụ", tin cũ không được quét. Phải chờ npso + plugin (bun) lên rồi mới gửi qua tmux.
test("[khởi động] Quét bù gửi SAU khi npso + plugin Discord đã chạy, không truyền thẳng làm prompt đầu", () => {
  const sb = doc("./mac/start-bot.sh")
  assert.match(sb, /tmux send-keys -t np/)
  assert.match(sb, /npso\.mjs/); assert.match(sb, /bun/)
  assert.doesNotMatch(sb, /--permission-mode dontAsk \\\n\s*"Quét bù/, "không được truyền Quét bù làm prompt đầu (tới trước MCP)")
})

// np-dichvu (2026-10-08): bot Zalo là dịch vụ nền launchd + claude -p (thay channel/tmux).
test("np-dichvu: lời dặn đủ công cụ + luật an toàn; launchd KeepAlive chạy dichvu/chinh.mjs, cần file bí mật; config zalo.nhomVanHanh + dichvu; hướng dẫn ghim", () => {
  const l = doc("./dichvu/loi-dan.md");
  for (const x of ["kiem_tin", "ghi_khoan", "sua_khoan", "doc_so", "tra_loi", "hoi_ve", "bo_hoi", "xac_nhan_message_id", "TRẢ LỜI CHO",
    "suy_ra", "ĐÃ GỬI Ở LẦN CHẠY TRƯỚC", "@Bot GWT CP #", "không xoá", "DỮ LIỆU"]) assert.ok(l.includes(x), x);
  // Chủ dự án 2026-10-08: câu nhắc trong nhóm đọc thấy dài → một câu ngắn, không markdown (Zalo hiện nguyên **), đuôi nhắc tag ngắn.
  for (const x of ["KHÔNG dùng markdown", "(nhớ tag @Bot)"]) assert.ok(l.includes(x), x);
  assert.doesNotMatch(l, /trả lời bắt đầu bằng @Bot GWT CP/, "đuôi nhắc cũ quá dài");
  // Khuôn ghim trong nhóm (chủ dự án 2026-10-08) — lời dặn bot và hướng dẫn ghim nói cùng một khuôn.
  for (const f of ["./dichvu/loi-dan.md", "./HUONG-DAN-ZALO.md"]) assert.ok(doc(f).includes("Thu/Chi - Số tiền - Nội dung - Tên quỹ"), f);
  // Nhóm thử 2026-10-08: "@Bot tóm tắt. Dũng bắt em làm gì" → Claude chọn im lặng (tái hiện 2/2) → chỉ có "Đã nhận #8.".
  for (const x of ["KHÔNG im lặng", "Mình chỉ ghi sổ chi phí"]) assert.ok(l.includes(x), x);
  // Zalo không chuyển album cho bot (đo 07/10 + 08/10) → 1 ảnh/khoản, ảnh khác thêm qua link thư mục trong tin ✅.
  for (const x of ["Zalo không chuyển album", "link trong tin ✅"]) assert.ok(l.includes(x), x);
  // Spec 2026-10-08-np-chung-tu: ảnh không còn là điều kiện ghi; khuôn có ngày; không còn "không có bill thì báo".
  for (const x of ["KHÔNG phải điều kiện để ghi", "Thu/Chi - Số tiền - Nội dung - Tên quỹ - Ngày", "sửa #N ngày"]) assert.ok(l.includes(x), x);
  assert.doesNotMatch(l, /không có bill thì báo/);
  for (const x of ["Thu/Chi - Số tiền - Nội dung - Tên quỹ - Ngày", "20:00", "sửa #5 ngày"]) assert.ok(doc("./HUONG-DAN-ZALO.md").includes(x), x);
  assert.ok(doc("./HUONG-DAN-ZALO.md").includes("link"), "hướng dẫn ghim nói cách thêm ảnh qua link");
  const s = doc("./mac/cai-dichvu.sh");
  assert.match(s, /com\.gwt\.np\.dichvu/); assert.match(s, /<key>KeepAlive<\/key><true\/>/); assert.match(s, /dichvu\/chinh\.mjs/); assert.match(s, /np-dichvu\.env/);
  assert.doesNotMatch(s.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n"), /tmux/, "dịch vụ không chạy tmux (comment được nhắc)");
  const cfg = JSON.parse(doc("./config.json"));
  assert.equal(cfg.zalo.tenBot, "Bot GWT CP"); assert.ok("nhomVanHanh" in cfg.zalo); assert.equal(cfg.dichvu.cong, 8790);
  assert.ok(Object.keys(cfg.channels).every((k) => /^\d+$/.test(k)), "channels chỉ chứa kênh Discord");
  for (const x of ["@Bot GWT CP", "1 ảnh", "#", "chưa thấy", "@Bot GWT CP #5"]) assert.ok(doc("./HUONG-DAN-ZALO.md").includes(x), x);
  for (const f of ["./mcp/npzalo.mjs", "./zalo/kho.mjs", "./bot-zalo/bot-settings.json", "./mac/start-bot-zalo.sh"]) assert.ok(!existsSync(new URL(f, import.meta.url)), `còn ${f}`);
});
