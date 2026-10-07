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

const stz = JSON.parse(doc("./bot-zalo/bot-settings.json"));
test("bot Zalo: đúng 7 công cụ npzalo + Read inbox Zalo; KHÔNG nạp plugin Discord; giữ mọi chặn của bot Discord", () => {
  const allowZ = stz.permissions.allow, denyZ = stz.permissions.deny;
  for (const t of ["tra_loi", "tai_anh", "kiem_tin", "ghi_khoan", "sua_khoan", "doc_so", "tin_chua_xu_ly"]) assert.ok(allowZ.includes(`mcp__npzalo__${t}`), t);
  assert.ok(allowZ.includes("Read(//Users/*/.claude/channels/zalo-np/inbox/**)"));
  assert.ok(!allowZ.some((t) => /discord|npso__/.test(t)), "bot Zalo không được dùng công cụ Discord / npso");
  assert.equal(stz.enabledPlugins["discord@claude-plugins-official"], false);
  for (const t of deny) assert.ok(denyZ.includes(t), `thiếu deny ${t}`);
  assert.ok(denyZ.includes("mcp__plugin_discord_discord"));
});

test("bot Zalo: hook nhật ký trỏ file có thật; CLAUDE.md có luật xác nhận + tra_loi_khoan + không xoá; hướng dẫn ghim; config zalo", () => {
  const cmds = Object.values(stz.hooks).flat().flatMap((h) => h.hooks).map((h) => h.command);
  assert.ok(cmds.length > 0);
  for (const c of cmds) { const m = c.match(/\$CLAUDE_PROJECT_DIR\/\.\.\/(bot\/hooks\/[\w-]+\.mjs)/); assert.ok(m, c); assert.ok(existsSync(new URL(`./${m[1]}`, import.meta.url)), m[1]) }
  const c = doc("./bot-zalo/CLAUDE.md");
  for (const x of ["ghi_khoan", "xac_nhan_message_id", "tra_loi_khoan", "hoi_ve", "kiem_tin", "tin_chua_xu_ly", "tai_anh", "không xoá", "DỮ LIỆU",
    "bo_hoi", "tra_loi_kieu", "@Bot GWT CP #"]) assert.ok(c.includes(x), x);  // review I1/I2: Reply suy ra cần soát, gỡ ❓, gửi lại ảnh kèm #N
  const h = doc("./HUONG-DAN-ZALO.md");
  for (const x of ["@Bot GWT CP", "1 ảnh", "#", "chưa thấy", "@Bot GWT CP #5"]) assert.ok(h.includes(x), x);
  const cfg = JSON.parse(doc("./config.json"));
  assert.equal(cfg.zalo?.tenBot, "Bot GWT CP"); assert.equal(typeof cfg.zalo?.groups, "object");
  assert.ok(Object.keys(cfg.channels).every((k) => /^\d+$/.test(k)), "channels chỉ chứa kênh Discord");
  assert.match(doc("./.gitignore"), /^bot-zalo\/mcp\.json$/m);
});

test("start-bot-zalo: dev-channel npzalo, bắt tay MCP kiểu cũ, dontAsk, --tools Read, chạy trong bot-zalo, KHÔNG nạp channel Discord, tự bấm qua cảnh báo, quét bù sau khi npzalo lên", () => {
  const s = doc("./mac/start-bot-zalo.sh");
  assert.match(s, /--dangerously-load-development-channels server:npzalo/);
  assert.match(s, /export MCP_PROTOCOL_NEGOTIATION=legacy/);
  assert.match(s, /--permission-mode dontAsk/); assert.match(s, /--tools "Read"/);
  assert.match(s, /cd "\$DIR\/bot-zalo"/); assert.match(s, /--mcp-config "\$DIR\/bot-zalo\/mcp\.json"/);
  assert.match(s, /local development/); assert.match(s, /tmux send-keys -t npz/); assert.match(s, /npzalo\.mjs/); assert.match(s, /tin_chua_xu_ly/);
  const lenh = s.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n").replace(/--dangerously-load-development-channels/g, "");
  assert.ok(!/--channels/.test(lenh), "bot Zalo không được nạp channel Discord");
  assert.match(doc("./mac/watchdog-zalo.sh"), /tmux has-session -t npz\b/);
  assert.match(doc("./mac/watchdog-zalo.sh"), /ZALO_BOT_TOKEN/);
  assert.match(doc("./mac/cai-launchd-zalo.sh"), /com\.gwt\.np\.zalo\.watchdog/);
  assert.match(doc("./mac/stop-bot-zalo.sh"), /tmux kill-session -t npz/);
  assert.doesNotMatch(doc("./mac/stop-bot-zalo.sh"), /kill-session -t np\b(?!z)/, "tắt bot Zalo không được tắt bot Discord");
});

// Review 2026-10-07 (M2): dò "local development" ở BẤT KỲ đâu trên màn hình thì một tin Zalo / câu trả lời có cụm đó cũng
// làm script gõ phím vào phiên; và nếu thứ tự lựa chọn khác, bấm "1" là chọn Exit → bot thoát liên tục không ai biết.
test("[M2] chon-canh-bao.sh: chỉ nhận DÒNG LỰA CHỌN có số + đúng câu, in đúng số của dòng đó; chữ trùng ở chỗ khác → không bấm", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url"); // URL.pathname giữ "%20" của "Coding Agent" → zsh không thấy file
  const chon = (man, f = fileURLToPath(new URL("./mac/chon-canh-bao.sh", import.meta.url))) => spawnSync("zsh", [f], { input: man, encoding: "utf8" }).stdout.trim();
  assert.equal(chon("  WARNING: Loading development channels\n  ❯ 1. I am using this for local development\n    2. Exit\n"), "1");
  assert.equal(chon("    1. Exit\n  ❯ 2. I am using this for local development\n"), "2");
  assert.equal(chon("← npzalo: Quỳnh: I am using this for local development haha\n> "), "");
  assert.equal(chon("Channels (experimental) messages from server:npzalo inject directly\n> "), "");
});

test("[M2] start-bot-zalo: bấm theo chon-canh-bao.sh; mỗi lần claude thoát ghi log, thoát liên tục thì ghi KẸT", () => {
  const s = doc("./mac/start-bot-zalo.sh");
  assert.match(s, /chon-canh-bao\.sh/);
  assert.match(s, /watchdog-zalo\.log/); assert.match(s, /thoát liên tục/);
  assert.doesNotMatch(s, /grep -q "local development"/, "không dò cụm chữ ở bất kỳ đâu trên màn hình nữa");
});
