#!/usr/bin/env node
// Scanner sổ chi phí kênh New Projects (THUẦN NODE — chạy GitHub Actions). Spec: docs/superpowers/specs/2026-10-05-np-bot-chi-phi-design.md
// Chép rút gọn từ GWT-Admin-Portal bots/xet-duyet-chi-phi/scanner.mjs@da1b637 — CHỈ luồng tiền tố thu/chi (kênh chị
// Trang). Giữ nguyên tên hàm/cấu trúc để `diff` với bản gốc còn đọc được khi đối chiếu bản vá.
// Quét tin chưa ghi → PARSE số tiền + nội dung TỪ CHỮ (không đọc ảnh) → 1 sổ 1 tab → lưu ảnh Drive → react ✅/⚠️/📷/⌛.
//   node scanner.mjs [--days=7|--all|--since=YYYY-MM-DD] [--limit=N] [--dry] [--nhac-lai]
//   node scanner.mjs --requet=<msgId|link>[,…] · --xoadong=<dòng>:<sốtiền>[:<DD/MM/YYYY>] · --suadong=<dòng>:<msgId>
// CÚ PHÁP TIN: `thu`/`chi` ĐẦU tin (bắt buộc) · số tiền có đ/k/tr hoặc dấu chấm nghìn · "có hoá đơn (đỏ)" → Có,
// không nhắc → Không, nhắc lấp lửng → ⚠️ · ảnh trong CÙNG tin (thiếu → 📷) · NGÀY = ngày nhắn tin (trừ "Ngày 6/8: …").

import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as books from "./books.mjs";
import * as drive from "./drive.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = DIR; // repo phẳng: config.json, credentials.json, token.json nằm cùng thư mục
process.chdir(ROOT);

function loadEnv() {
  try {
    for (const line of readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  } catch {}
}
loadEnv();

// v2: token bot NP nằm ở thư mục Discord riêng (DISCORD_STATE_DIR, mặc định ~/.claude/channels/discord-np/.env).
if (!process.env.DISCORD_BOT_TOKEN) {
  try {
    const f = path.join(process.env.DISCORD_STATE_DIR || path.join(process.env.HOME || "", ".claude", "channels", "discord-np"), ".env");
    const m = /^DISCORD_BOT_TOKEN=(.+)$/m.exec(readFileSync(f, "utf8"));
    if (m) process.env.DISCORD_BOT_TOKEN = m[1].trim();
  } catch {}
}
const TOKEN = process.env.DISCORD_BOT_TOKEN;
let _drive = null;
const driveOf = () => (_drive ||= drive.getDrive());
const API = "https://discord.com/api/v10";
const H = { headers: { Authorization: `Bot ${TOKEN}` } };

const args = process.argv.slice(2);
const all = args.includes("--all");
const dry = args.includes("--dry");
// --requet=<msgId>[,<msgId>]: chấm lại tin CỤ THỂ theo luật hiện tại + dọn dấu (xem requetPhase). Chạy RIÊNG,
// không kèm quét/mirror/report — đây là lệnh sửa chữa chạy tay, không phải bước trong cron.
// Nhận CẢ id trần LẪN link tin Discord (…/channels/<guild>/<channel>/<msgId>) — "Sao chép liên kết tin nhắn"
// ai cũng bấm được, còn "Sao chép ID" phải bật Chế độ nhà phát triển. Lấy cụm SỐ CUỐI của chuỗi.
const requetIds = (args.find((a) => a.startsWith("--requet=")) || "").split("=").slice(1).join("=")
  .split(",").map((s) => (String(s).trim().match(/(\d{5,})\s*$/) || [])[1]).filter(Boolean);
// --xoadong=<book>:<tabKey>:<dòng>:<sốtiền>[:<DD/MM/YYYY>] — xoá 1 dòng ghi nhầm (xem books.xoaDongSo).
// KHÔNG dấu cách trong cờ: workflow truyền $ARGS TRẦN (không nháy kép) nên chuỗi có dấu cách sẽ bị cắt thành
// nhiều tham số — đó là lý do đối chiếu bằng SỐ TIỀN + NGÀY chứ không bằng diễn giải.
const xoaDongArg = (args.find((a) => a.startsWith("--xoadong=")) || "").split("=").slice(1).join("=").trim();
// --suadong=<book>:<tabKey>:<dòng>:<msgId> — ĐỌC LẠI tin gốc, parse bằng luật HIỆN TẠI rồi ghi đè Diễn giải +
// Ghi chú của dòng đó. Dùng khi tiền ghi ĐÚNG nhưng chữ xấu (rác dấu, thiếu ghi chú) — khỏi xoá rồi ghi lại.
const suaDongArg = (args.find((a) => a.startsWith("--suadong=")) || "").split("=").slice(1).join("=").trim();
// Lượt 20:30 (workflow truyền --nhac-lai): tin ⚠️ chưa sửa được ĐẨY lại xuống đáy kênh 1 lần/ngày. Bản gốc gắn việc
// này vào "lượt có báo cáo" (!noReport); NP không có báo cáo nên dùng cờ riêng.
const nhacLaiLuot = args.includes("--nhac-lai");
// Mặc định 7 ngày, KHỚP lời hứa trong tin rep ("sửa thẳng tin này trong vòng 7 ngày"). Cửa sổ lọc theo
// m.timestamp = giờ TẠO tin, không phải giờ sửa: để nhỏ hơn thì tin ⚠️ sửa muộn đã rơi khỏi cửa sổ → bot
// không đọc lại → làm đúng lời bot dặn mà tiền vẫn không vào sổ. (2026-08-13 từng nới tạm 14 để VỚT một tin
// cũ ~7 ngày rồi trả về 7 — muốn vớt tin cũ hơn thì chạy tay `--days=N`, đừng đổi mặc định.)
const days = Number((args.find((a) => a.startsWith("--days=")) || "").split("=")[1] || 7);
const limit = Number((args.find((a) => a.startsWith("--limit=")) || "").split("=")[1] || 0);
const sinceArg = (args.find((a) => a.startsWith("--since=")) || "").split("=")[1] || "";
const sinceISO = sinceArg ? new Date(`${sinceArg}T00:00:00+07:00`).toISOString() : "";

const MAX_IMG_BYTES = 4_500_000, MAX_IMG_PER_MSG = 5;
// Trần trang khi phân trang Discord (mỗi trang 100 tin) — chặn vòng lặp vô hạn nếu API trả lỗi. 20 trang =
// 2000 tin, thừa sức cho cửa sổ 7 ngày + dải ân hạn ở kênh sổ quỹ (kể cả khi chạy tay --days lớn hơn); chạm
// trần chỉ xảy ra khi có sự cố → log cảnh báo.
const MAX_PAGES = 20;
// DẢI ÂN HẠN: fetch RỘNG hơn cửa ghi (days) thêm GRACE_DAYS ngày, CHỈ để dò tin ⚠️ vừa QUÁ HẠN sửa mà dán ⌛
// (bot không thấy tin ngoài cửa ghi thì không đóng dấu được). Tin trong dải ân hạn KHÔNG được ghi sổ — chỉ đánh
// dấu hết hạn. ⌛ = "quá hạn sửa, bot không tự ghi nữa"; EXPIRED_MARKER = reason để tin rep chỉ đổi MỘT lần.
const GRACE_DAYS = 7;
const EXPIRED_EMOJI = "⌛";
const EXPIRED_MARKER = "quá hạn sửa";
// 📷 = "tin có nhắc tiền nhưng KHÔNG kèm ảnh chứng từ → bot cố ý bỏ qua, không ghi". Khác ⚠️ (chưa vào sổ,
// cần SỬA) và khác không-dấu (tin trò chuyện): 📷 nói "bot ĐÃ thấy, thiếu ảnh nên không ghi" — người gõ nhìn
// dấu là biết ngay cần đính ảnh, khỏi tưởng bot sót. Không rep kèm: đây là ca RẤT thường (mọi tin bàn bạc có
// số tiền), rep mỗi tin là spam kênh. Xem THIEU_ANH trong parseEntry.
// Đổi ❌ → 📷 (Dũng chốt 2026-08-18): ❌ đọc như "sai/bị từ chối" làm người chat bâng quơ tưởng bị mắng;
// 📷 nhẹ hơn và TỰ giải thích lý do (thiếu ảnh). LEGACY_BOQUA_EMOJI để gỡ dấu ❌ đời cũ còn treo trên tin.
const BOQUA_EMOJI = "📷";
const LEGACY_BOQUA_EMOJI = "❌";
const THIEU_ANH = "thiếu ảnh chứng từ — khoản phải kèm ảnh bill trong CÙNG tin thì bot mới ghi sổ";
const SUPPORTED_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function logLine(s) {
  try { mkdirSync(path.join(ROOT, "logs"), { recursive: true }); } catch {}
  try { appendFileSync(path.join(ROOT, "logs", "scanner.log"), `[${new Date().toISOString()}] ${s}\n`); } catch {}
  console.log(s);
}
function die(m) { logLine("LỖI: " + m); process.exit(1); }

const vnd = (n) => (Number(n) || 0).toLocaleString("vi-VN");

// ── Discord helpers ──────────────────────────────────────────────────────────
const isImg = (a) => (a.content_type || "").startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(a.filename || "");
const atts = (m) => { const r = [...(m.attachments || [])]; for (const sn of m.message_snapshots || []) r.push(...((sn.message && sn.message.attachments) || [])); return r; };
const content = (m) => m.content || ((m.message_snapshots || [])[0] || {}).message?.content || "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Đổi reaction của CHÍNH BOT (PUT thêm / DELETE gỡ). RETRY 429 theo retry_after — TRƯỚC đây coi 429 = bỏ qua
// im lặng nên reaction RỚT khi bị rate-limit: ca thật 2026-08-13, bot rep "hết hạn" xong mà ⚠️ KHÔNG gỡ và ⌛
// KHÔNG lên vì cả hai lệnh reaction dính 429 (chạy nhiều lượt liên tiếp). 404 khi DELETE = reaction đã không
// còn = thành công. Ném lỗi CHỈ sau khi hết lượt retry → caller thấy được (react log ✗; unreact nuốt êm).
// 401/403 khi react/reply = bot MẤT QUYỀN (Add Reactions / Send Messages) hoặc token hỏng — lỗi CẤU HÌNH, không phải
// lỗi tạm. Không làm đỏ thì sổ vẫn ghi mà không ai thấy ✅/⚠️ → người gửi lại → ghi trùng, job xanh (review cuối nhánh).
function danhDauLoiQuyen(status) { if (status === 401 || status === 403) process.exitCode = 1; }
async function reactFetch(method, channelId, messageId, emoji) {
  const url = `${API}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`;
  const ten = method === "PUT" ? "react" : "unreact";
  for (let i = 0; i < 5; i++) {
    const r = await fetch(url, { method, headers: { Authorization: `Bot ${TOKEN}` } });
    if (r.status === 429) { const d = await r.json().catch(() => ({})); logLine(`  ⏳ 429 ${ten} ${emoji} ${messageId} — chờ ${d.retry_after ?? 1}s rồi thử lại`); await sleep((d.retry_after ?? 1) * 1000 + 100); continue; }
    if (r.ok || (method === "DELETE" && r.status === 404)) return;
    danhDauLoiQuyen(r.status);
    throw new Error(`${ten} ${r.status}`);
  }
  throw new Error(`${ten} ${emoji} ${messageId}: 429 quá 5 lần`);
}
export async function react(channelId, messageId, emoji) { return reactFetch("PUT", channelId, messageId, emoji); }
// TRẢ VỀ id tin rep vừa tạo — caller lưu vào _rep!B để sau này XOÁ đúng tin đó. Không trả id là
// không bao giờ xoá được rep, và tin rep "CHƯA vào sổ" sẽ treo lại nói dối sau khi khoản đã ✅.
// 429 → "" (giữ nguyên hành vi cũ: không ném), rep coi như không có id → bỏ qua bước xoá về sau.
export async function reply(channelId, messageId, text) {
  const r = await fetch(`${API}/channels/${channelId}/messages`, {
    method: "POST", headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: text, message_reference: { message_id: messageId }, allowed_mentions: { parse: ["users"] } }),
  });
  if (!r.ok) { if (r.status === 429) return ""; danhDauLoiQuyen(r.status); throw new Error(`reply ${r.status}`); }
  return String((await r.json().catch(() => ({})))?.id || "");
}
async function unreact(channelId, messageId, emoji) { return reactFetch("DELETE", channelId, messageId, emoji); }
// CHỈ dùng để xoá tin do CHÍNH BOT tạo (tin rep) — Discord luôn cho bot xoá tin của mình, không cần
// quyền Manage Messages. 404 = THÀNH CÔNG (ai đó xoá tay rồi, kết quả mong muốn đã có); 429 = bỏ qua,
// lượt sau xoá — cùng cách unreact đang làm. Chỉ được gọi với id lấy TỪ _rep!B, không bao giờ đoán id.
export async function deleteMessage(channelId, messageId) {
  const r = await fetch(`${API}/channels/${channelId}/messages/${messageId}`, { method: "DELETE", headers: { Authorization: `Bot ${TOKEN}` } });
  if (!r.ok && r.status !== 404 && r.status !== 429) throw new Error(`deleteMessage ${r.status}`);
}

// ── Config (config.json) ─────────────────────────────────────────────────────
// NP có ĐÚNG 1 sổ + kênh khai trong config.json. Dựng lại hình dạng CHANS/BOOKS của bản gốc để phần còn lại của
// scanner (buildWorklist, scanPhase, requetPhase) giữ nguyên chữ. Mọi kênh đều là luồng tiền tố (loaiTuTienTo).
const CFG = JSON.parse(readFileSync(path.join(DIR, "config.json"), "utf8"));
const PERSONS = CFG.persons || {};
const BOOKS = { np: { label: CFG.book.label, sheetId: CFG.book.sheetId, folderId: CFG.book.folderId, tabs: { default: CFG.book.tab } } };
const CHANS = Object.fromEntries(Object.entries(CFG.channels || {}).map(([id, c]) =>
  [id, { name: c.name, route: "fund", book: "np", loaiTuTienTo: true }]));
// Khoá nào là KÊNH: id Discord toàn chữ số + giá trị có `route` (giữ từ bản gốc).
const laKenh = (k, v) => /^\d+$/.test(k) && v && typeof v === "object" && !!v.route;

// Dựng 1 work item từ tin Discord thô. TÁCH RA để buildWorklist (lượt quét) và requetPhase (--requet) dùng
// CHUNG: hai nơi tự dựng item là sớm muộn lệch field (vd quên hasDirectImg) → lệnh chẩn đoán phán một đằng,
// lượt quét thật làm một nẻo, mà không có gì báo. Trả null nếu tin rỗng hẳn (không chữ, không ảnh).
export function dungItem(m, chanId, c, { expired = false, rep = null } = {}) {
  const imgs = atts(m).filter(isImg).slice(0, MAX_IMG_PER_MSG);
  // Ảnh ĐÍNH TRỰC TIẾP (m.attachments) mới là "người này NỘP chứng từ"; ảnh tin FORWARD (message_snapshots)
  // là trích dẫn tin khác — xem chú thích ở parseEntry/THIEU_ANH.
  const hasDirectImg = (m.attachments || []).some(isImg);
  const text = content(m);
  if (!String(text).trim() && !imgs.length) return null;
  const mr = m.message_reference;
  const replyToId = (mr && mr.message_id && mr.type !== 1) ? String(mr.message_id) : "";
  let refItem = null;
  const ref = m.referenced_message;
  if (replyToId && ref && ref.id) {
    const refImgs = atts(ref).filter(isImg).slice(0, MAX_IMG_PER_MSG);
    refItem = {
      id: String(ref.id), channelId: chanId, channel: c.name, cfg: c, book: c.book,
      date: ngayVN(ref.timestamp),
      authorId: ref.author?.id, author: ref.author?.global_name || ref.author?.username || "",
      content: content(ref),
      images: refImgs.map((a) => ({ url: a.url, ct: a.content_type || "", name: a.filename || "" })),
      hasDirectImg: (ref.attachments || []).some(isImg),
    };
  }
  return {
    id: String(m.id), channelId: chanId, channel: c.name, cfg: c,
    book: c.book, expired, hasDirectImg,
    wasRepped: !!rep, repMsgId: rep?.repMsgId || "", repReason: rep?.reason || "",
    date: ngayVN(m.timestamp),
    authorId: m.author?.id, author: m.author?.global_name || m.author?.username || "",
    content: text, images: imgs.map((a) => ({ url: a.url, ct: a.content_type || "", name: a.filename || "" })),
    replyToId, refItem,
  };
}

// Chưa bật Message Content Intent → Discord trả tin người (trừ tin @bot) RỖNG HẲN: không chữ, không ảnh, không embed.
// Không chặn thì bot bỏ qua im lặng MỌI tin (dungItem trả null) — kênh trông như không ai gửi gì, job xanh.
// ≥3 tin người mà tin nào cũng rỗng hẳn → gần như chắc chắn thiếu intent.
export function nghiThieuIntent(msgs) {
  const nguoi = (msgs || []).filter((m) => !m.author?.bot);
  // Thiếu intent, Discord xoá CẢ content, attachments, embeds (kể cả trong snapshot tin forward). Tin còn ảnh/embed
  // hay snapshot còn chữ/ảnh = intent ĐANG BẬT → không được tính là "rỗng" (3 ảnh trơn không chữ mà dừng cả bot là oan).
  const coGi = (x) => !!(String(x?.content || "").trim() || (x?.attachments || []).length || (x?.embeds || []).length);
  const rongHan = (m) => !coGi(m) && !(m.message_snapshots || []).some((sn) => coGi(sn?.message));
  return nguoi.length >= 3 && nguoi.every(rongHan);
}

// Đọc 1 trang tin. KHÁC bản gốc: bản gốc nuốt mọi lỗi (`catch { continue; }`, batch không phải mảng → break) nên token
// sai / bot chưa vào kênh ra "0 tin", job vẫn XANH. Bot mới dựng là đúng lúc dễ sai mấy thứ đó nhất → phải NÉM.
async function layTrang(url, tenKenh) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(url, H);
    if (r.status === 429) { const d = await r.json().catch(() => ({})); await sleep((d.retry_after ?? 1) * 1000 + 100); continue; }
    if (!r.ok) throw new Error(`Discord ${r.status} khi đọc kênh ${tenKenh} — kiểm DISCORD_BOT_TOKEN, bot đã được mời vào kênh, có quyền View Channel + Read Message History`);
    const batch = await r.json();
    if (!Array.isArray(batch)) throw new Error(`Discord trả dữ liệu lạ khi đọc kênh ${tenKenh}`);
    return batch;
  }
  throw new Error(`Discord 429 quá 5 lần khi đọc kênh ${tenKenh}`);
}

// Ngày ghi sổ = ngày nhắn THEO GIỜ VN. Discord trả timestamp UTC; cắt chuỗi `slice(0,10)` như bản gốc thì tin gửi
// 00:00–06:59 VN bị ghi LÙI một ngày (mùng 1 rơi sang tháng trước — sai cả folder Drive lẫn Tổng hợp). TZ của
// workflow không cứu được phép cắt chuỗi. Trả "YYYY-MM-DD" (sv-SE in đúng khuôn ISO).
export function ngayVN(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts || "").slice(0, 10) : d.toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
}
// Nạp danh sách tin ĐÃ GHI (_state!D) cho mỗi sổ. KHÁC bản gốc: lỗi đọc (429/5xx — hai bot dùng chung hạn mức Sheets
// của ai@gwt.vn) phải NÉM. Bản gốc coi lỗi = "sổ trống" → mọi tin ✅ trong cửa sổ 7 ngày bị ghi LẠI, job vẫn xanh.
export async function napDaGhi(loader, BOOKS_) {
  const seen = {};
  for (const [bk, b] of Object.entries(BOOKS_)) seen[bk] = await loader(b.sheetId);
  return seen;
}

async function buildWorklist() {
  // Dedup theo FILE, không theo quỹ: 1 file = 1 _state, mà quỹ chỉ biết được SAU khi parse.
  const seen = await napDaGhi(books.loadProcessed, BOOKS); // lỗi đọc → NÉM, không ghi trùng
  const repped = {}; // bk → Map<msgId, {repMsgId, reason}>. Chuỗi "" = dòng _rep cũ (chưa lưu cột đó).
  for (const [bk, b] of Object.entries(BOOKS)) { try { repped[bk] = await books.loadRepped(b.sheetId); } catch { repped[bk] = new Map(); } }
  // recordFloor = sàn CỬA GHI (days): tin cũ hơn KHÔNG tự ghi. fetchFloor = sàn FETCH, lùi thêm GRACE_DAYS để
  // còn thấy tin vừa quá hạn mà dán ⌛. --all/--since không có khái niệm "hết hạn" → hai sàn bằng nhau.
  const recordFloor = sinceISO || new Date(Date.now() - days * 86400000).toISOString();
  const fetchFloor = (all || sinceISO) ? recordFloor : new Date(Date.now() - (days + GRACE_DAYS) * 86400000).toISOString();
  const work = [];
  for (const [id, c] of Object.entries(CHANS)) {
    if (!laKenh(id, c)) continue;
    const bk = c.book;
    // PHÂN TRANG: Discord trả tối đa 100 tin/lần → lấy tiếp bằng con trỏ `before` cho tới khi CHẠM SÀN cửa sổ
    // (--days) hoặc hết tin. Trước đây fetch 1 lần (trần 100): chạm trần thì bỏ sót tin cũ trong cửa sổ — tin
    // ⚠️ sửa muộn trôi khỏi tầm, im lặng không vào sổ. Trần cứng MAX_PAGES chặn vòng lặp vô hạn khi API lỗi.
    const msgs = [];
    let before = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = before ? `?limit=100&before=${before}` : "?limit=100";
      const batch = await layTrang(`${API}/channels/${id}/messages${q}`, c.name);
      if (!batch.length) break;
      msgs.push(...batch);
      before = batch[batch.length - 1].id;
      // Discord trả MỚI→CŨ: tin cuối batch đã cũ hơn sàn FETCH → mọi trang sau còn cũ hơn nữa → dừng.
      if (batch.length < 100 || (!all && String(batch[batch.length - 1].timestamp) < fetchFloor)) break;
      if (page === MAX_PAGES - 1) logLine(`⚠ ${c.name} vượt ${MAX_PAGES} trang (~${MAX_PAGES * 100} tin) — dừng, có thể còn sót; quét --all nếu cần`);
    }
    if (nghiThieuIntent(msgs))
      throw new Error(`Mọi tin người trong kênh ${c.name} đều rỗng chữ — gần như chắc chắn bot CHƯA BẬT Message Content Intent (Discord Developer Portal → Bot → Privileged Gateway Intents). Dừng, không ⚠️ oan.`);
    if (!msgs.length) continue;
    for (const m of msgs) {
      if (m.author?.bot) continue;
      if (!all && String(m.timestamp) < fetchFloor) continue;
      if (seen[bk]?.has(String(m.id))) continue;
      // Trong dải ân hạn (đã quá cửa ghi nhưng còn trong fetch) → đánh dấu để pha "hết hạn" dán ⌛, KHÔNG ghi sổ.
      const expired = !all && !sinceISO && String(m.timestamp) < recordFloor;
      // Tin ghim = bảng quy tắc kênh (chứa ví dụ số tiền) → KHÔNG phải giao dịch. Bỏ qua im lặng
      // với người nhắn (không react), nhưng ghi log: nếu lỡ ghim nhầm tin giao dịch thật thì còn truy ra.
      if (m.pinned) { logLine(`  📌 BỎ QUA tin ghim ${c.name} ${m.id} (${m.author?.global_name || m.author?.username || ""}) — coi là nội quy kênh`); continue; }
      // Reply → replyToId + refItem; FORWARD (message_reference.type===1) KHÔNG phải reply. Xem dungItem.
      const it = dungItem(m, id, c, { expired, rep: repped[bk]?.get(String(m.id)) || null });
      if (!it) continue;                                   // tin rỗng hẳn → bỏ
      work.push(it);
    }
  }
  work.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  return work;
}

// ── Tải ảnh (chỉ để LƯU DRIVE làm bằng chứng — không đọc) ────────────────────
async function fetchImageBuffer(img) {
  const r = await fetch(img.url);
  if (!r.ok) return null;
  let mime = (r.headers.get("content-type") || img.ct || "").split(";")[0].trim().toLowerCase();
  if (!SUPPORTED_MIME.has(mime)) {
    if (/\.png$/i.test(img.name)) mime = "image/png";
    else if (/\.(jpe?g)$/i.test(img.name)) mime = "image/jpeg";
    else if (/\.webp$/i.test(img.name)) mime = "image/webp";
    else if (/\.gif$/i.test(img.name)) mime = "image/gif";
    else return null;
  }
  const buffer = Buffer.from(await r.arrayBuffer());
  if (buffer.length > MAX_IMG_BYTES) return null;
  const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" }[mime] || ".jpg";
  return { buffer, mime, name: img.name || `anh${ext}` };
}

// ── Parse SỐ TIỀN từ chữ (thuần node) ────────────────────────────────────────
// Chấp nhận: 500000 · 500.000 · 1.500.000 · 500k · 1tr · 1tr5 · 1.5tr · 2m · 1 tỷ.
export function parseMoney(str) {
  const s = String(str).trim().toLowerCase().replace(/đồng|vnđ|vnd|đ/g, "").trim();
  let m;
  if ((m = s.match(/^(\d+)(?:[.,](\d+))?\s*(?:tr|triệu)\s*(\d+)?/))) { // 1tr · 1tr5 · 1.5tr · 2tr500
    const dec = m[2] || m[3] || "";
    return Math.round(Number(m[1]) * 1e6 + (dec ? Number("0." + dec) * 1e6 : 0));
  }
  if ((m = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:tỷ|ty)/)))
    return Math.round(parseFloat(m[1].replace(",", ".")) * 1e9);
  if ((m = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:k|nghìn|nghin|ngàn|ngan)/)))
    return Math.round(parseFloat(m[1].replace(",", ".")) * 1e3);
  if ((m = s.match(/^(\d+(?:[.,]\d+)?)\s*m\b/)))
    return Math.round(parseFloat(m[1].replace(",", ".")) * 1e6);
  if ((m = s.match(/^(\d[\d.,\s]*)/))) {
    const n = Number(m[1].replace(/[.,\s]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}
// Tìm SỐ TIỀN ở BẤT KỲ đâu, CHỈ nhận số có "dấu hiệu tiền": đuôi đ/₫/vnđ/vnd · hậu tố k/tr/m/tỷ (không dính
// chữ Việt) · dấu chấm/cách ngăn nghìn. → SĐT/STK/mã GD/ngày tự loại. Nhiều số → ưu tiên có đuôi đ, rồi lớn nhất.
// Lookahead "không dính chữ Việt" áp cho CẢ đuôi tiền tệ lẫn hậu tố: "2 đơn" / "2 mét" không phải 2đ / 2 triệu.
// DẤU CÁCH KHÔNG phải ngăn nghìn (chỉ dấu chấm): "tủ a02 106k" từng bị gom thành số "02 106" = 2.106đ và
// vứt mất đuôi "k" — ghi sai gấp 50 lần mà vẫn ✅. Quét 286 tin thật: không ai gõ "1 500 000", nên cấm
// dấu cách là thuần lợi. Vẫn cho cách GIỮA số và đuôi ("500 k", "1 tỷ", "500 vnđ").
const MONEY_ANY = /(\d[\d.,]*\d|\d)\s*(?:(?:(đ|₫|vnđ|vnd)|(tr(?:iệu)?\d*|triệu|k|nghìn|nghin|ngàn|ngan|m|tỷ|ty))(?![a-zA-ZÀ-ỹ]))?/gi;
// Trả thêm `vals` = các MỨC TIỀN KHÁC NHAU tìm thấy (đã gộp trùng: "350k" và "350.000đ" = 1 mức).
// KHÔNG gộp trùng: "ăn trưa 23: 130k, 25: 130k" = 2 khoản thật, không phải 1 số lặp lại.
// `totals` = số đứng ngay sau chữ "tổng" → nhiều số mà có đúng 1 tổng thì lấy tổng (xem parseEntry).
const TOTAL_BEFORE = /(?:tổng|tổng\s+cộng|tất\s+cả)\s*(?:là|:|=)?\s*$/i;
export function extractAmount(text) {
  let best = null; const vals = []; const totals = [];
  for (const m of String(text).matchAll(MONEY_ANY)) {
    const cur = m[2], mag = m[3];
    const hasSep = /\d\.\d{3}(?!\d)/.test(m[1]);
    if (!cur && !mag && !hasSep) continue;
    const val = parseMoney(m[0].trim());
    if (val == null || val <= 0) continue;
    const hit = { amount: val, index: m.index, len: m[0].length, score: (cur ? 1e15 : 0) + val };
    vals.push(val);
    if (TOTAL_BEFORE.test(String(text).slice(0, m.index))) totals.push(hit);
    if (!best || hit.score > best.score) best = hit;
  }
  return best ? { ...best, vals, totals } : null;
}

// ── Số tiền NGOẠI TỆ: đô la ($ / usd) ────────────────────────────────────────
// Subscription nước ngoài (ChatGPT, Netflix…) chỉ có giá USD, không có giá VND. Bot KHÔNG tự quy đổi — không
// bịa tỷ giá (Dũng chốt 2026-08-14): chỉ NHẬN RA số $, dựng một dòng MEMO (Thu/Chi để trống → Tồn quỹ không
// đổi, số $ xuống cột Ghi chú), kế toán điền VND thật sau khi có sao kê thẻ. Chỉ nhận ký hiệu RÕ: "$20" ·
// "$19.99" · "$1,000" · "20$" · "20 usd" · "usd 20". Chuẩn Mỹ: PHẨY = ngăn nghìn, CHẤM = thập phân (NGƯỢC VND).
// (?![a-zA-ZÀ-ỹ]) sau "usd" chặn "usdt" (crypto) và chữ dính liền. KHÔNG bắt "đô" trần (trùng tiếng Việt).
// GIỚI HẠN đã biết: "$1.000" (chấm + đúng 3 số) khớp dấu-hiệu-nghìn của MONEY_ANY → đọc thành 1.000đ, KHÔNG
// vào nhánh $. Người gõ USD hàng nghìn nên dùng phẩy "$1,000". Nhánh $ chỉ chạy khi extractAmount KHÔNG thấy VND.
const USD_ANY = /(?:\$\s*(\d[\d.,]*\d|\d)|(\d[\d.,]*\d|\d)\s*(?:\$|usd)(?![a-zA-ZÀ-ỹ]))/i;
function parseUsd(numStr) {
  const n = Number(String(numStr).replace(/,/g, "")); // phẩy = ngăn nghìn; chấm = thập phân
  return Number.isFinite(n) && n > 0 ? n : null;
}
// Tìm MỌI số $ trong tin (giống extractAmount cho VND): `vals` = các số tìm được, `totals` = số $ đứng NGAY
// sau chữ "tổng" (TOTAL_BEFORE dùng chung). ≥2 số $ → parseEntry đòi đúng 1 "tổng" (bot KHÔNG tự cộng/chọn —
// cộng bừa "$10 + $15 = $25" hay chọn bừa số đầu đều sai). `best` = số $ ĐẦU tiên (mặc định khi chỉ 1 số).
export function extractUsd(text) {
  const s = String(text);
  let best = null; const vals = []; const totals = [];
  for (const m of s.matchAll(new RegExp(USD_ANY.source, "gi"))) {
    const val = parseUsd(m[1] ?? m[2]);
    if (val == null) continue;
    const hit = { raw: m[0].trim(), amount: val, index: m.index, len: m[0].length };
    vals.push(val);
    if (TOTAL_BEFORE.test(s.slice(0, m.index))) totals.push(hit);
    if (!best) best = hit;
  }
  return best ? { ...best, vals, totals } : null;
}

// Từ chuỗi ĐÃ BỎ token số tiền → { noiDung, ncc, ghiChu }. Dùng CHUNG cho nhánh VND lẫn nhánh $:
//   • NCC tách sau dấu "|"; • phần trong ngoặc () → cột Ghi chú, CHỈ khi bỏ ngoặc ra vẫn còn chữ (§4 —
//     ngoặc là TOÀN BỘ mô tả "(mua bút)" thì giữ nguyên, không để Diễn giải rỗng). Nhiều ngoặc nối bằng "; ".
// Dọn RÁC do việc nhấc token số tiền ra khỏi câu để lại: "Gói Pro Supabase - $20 + $14.85 - Tổng $34.85"
// bỏ hết số $ thành "Gói Pro Supabase - + - Tổng" (ca thật 14/08/2026). Hai loại rác:
//   • CHUỖI DẤU NỐI MỒ CÔI (2 dấu trở lên dính nhau sau khi số biến mất) → gộp thành 1 dấu cách. Đòi ≥2 dấu
//     nên KHÔNG đụng gạch nối trong chữ ("Wi-Fi", "A-25") — chỗ đó chỉ có 1 dấu.
//   • Chữ "tổng / tổng cộng / tất cả" ĐỨNG CUỐI: số mà nó dẫn vào đã bị nhấc đi nên nó thành cụt nghĩa.
//     CHỈ cắt ở CUỐI câu — "tổng" giữa câu vẫn có nghĩa ("tổng kho", "tổng hợp vật tư").
function donDauThua(s) {
  return String(s)
    .replace(/(?:\s*[-–—+·,;]\s*){2,}/g, " ")
    .replace(/\s*(?:tổng\s*cộng|tổng|tất\s*cả)\s*[:=]?\s*$/i, "")
    .replace(/[\s\-–—+·,;:|.]+$/, "")
    .replace(/\s{2,}/g, " ").trim();
}

function moTaTuText(raw) {
  let noiDung = donDauThua(String(raw).replace(/\s{2,}/g, " ").trim())
    .replace(/^[\s\-:–|.]+/, "").replace(/[\s\-:–|]+$/, "").trim();
  let ncc = "";
  if (noiDung.includes("|")) { const p = noiDung.split("|"); noiDung = p[0].trim(); ncc = p.slice(1).join("|").trim(); }
  let ghiChu = "";
  if (noiDung.includes("(")) {
    const notes = [];
    const sansParen = noiDung.replace(/\(([^)]*)\)/g, (_, g) => { const t = g.trim(); if (t) notes.push(t); return " "; })
      .replace(/\s{2,}/g, " ").replace(/^[\s\-:–|.]+/, "").replace(/[\s\-:–|.]+$/, "").trim();
    // Dọn LẦN NỮA sau khi nhấc ngoặc đi: chữ "tổng" cụt nghĩa có thể nãy giờ chưa ở cuối câu vì còn ngoặc
    // đứng sau ("… - Tổng $34.85 (Project GWT)" → bỏ số + bỏ ngoặc mới lòi ra "Tổng" ở cuối). Ca thật Supabase.
    if (sansParen && notes.length) { noiDung = donDauThua(sansParen); ghiChu = notes.join("; "); }
  }
  return { noiDung, ncc, ghiChu };
}

// Hóa đơn = 3 trạng thái: "Có" · "Không" · "mơ hồ". KHAI RÕ mới tính, mơ hồ thì route ⚠️ hỏi lại.
//   • không nhắc "hóa đơn"/"hđ" gì cả                                  → "Không" (mặc định)
//   • nhắc + PHỦ ĐỊNH rõ trong ≤3 chữ trước ("không có hóa đơn" ·
//     "chưa lấy hóa đơn" · "ko hđ" · "chưa xuất hoá đơn")              → "Không"
//   • nhắc + KHẲNG ĐỊNH rõ: chữ NGAY TRƯỚC là "có", không bị phủ định  → "Có"
//   • nhắc ở MỌI dạng khác ("quên xin hóa đơn" · "hóa đơn 500k" ·
//     "đang chờ hóa đơn" · "hóa đơn chưa lấy")                         → "mơ hồ"
// Luật CŨ ("nhắc ở dạng khẳng định = Có") đọc cả nhóm mơ hồ thành Có + ✅ im lặng → khoản KHÔNG có hóa đơn
// lọt vào mục "CÓ-HĐ chưa hoàn" của báo cáo → công ty đòi hoàn tiền cho khoản không có bill. Bot không đọc
// hiểu câu văn, chỉ dò chữ — nên khi không rõ thì HỎI LẠI, không đoán chiều nào.
// BẪY: chuỗi "không có hóa đơn" CHỨA "có hóa đơn" → xét PHỦ ĐỊNH TRƯỚC khẳng định. Ngược lại là ra "Có" —
// lỗi ngược chiều, mất khoản chờ hoàn ứng.
// KHÔNG bắt "hd" trần (đụng "video HD", "màn HD") — muốn báo Có thì gõ có dấu: hđ / hóa đơn.
const NEG_WORD = /^(không|ko|k|kh|chẳng|chưa|đéo|éo)$/;
// Động từ được phép chen giữa "có" và chỗ nhắc hóa đơn mà VẪN tính là khẳng định rõ:
// "có xuất hđ" · "có lấy hóa đơn" · "có đính kèm hóa đơn". Người ta khai đúng ý nhưng bot cũ đòi chữ
// "có" dán sát nên xếp mơ hồ → khoản treo (ca thật 29/07/2026: tin 11.085.000đ kênh Trang).
// DANH SÁCH ĐÓNG, và mọi chữ chen giữa đều phải nằm trong đó. TUYỆT ĐỐI KHÔNG đổi thành "có nằm đâu đó
// trong 3 chữ trước": "có mua hàng, hóa đơn về sau" sẽ thành "Có" + ✅ im lặng — đúng ca mất tiền mà luật
// "nhắc là Có" từng gây (khoản KHÔNG bill vào mục CÓ-HĐ chưa hoàn → công ty hoàn tiền cho khoản không có bill).
// Không thêm "xin"/"hỏi"/"dặn": "có xin hóa đơn" = đã ĐI XIN, chưa chắc đã lấy được.
const HD_VERB = /^(xuất|lấy|nhận|kèm|đính|đủ)$/;
// Một nguồn duy nhất cho "tin có nhắc hóa đơn" (bản gốc dùng CHUNG với detectQuy — NP đã bỏ detectQuy). Trước đây chép lặp 2
// chỗ: thêm biến thể ở một chỗ mà quên chỗ kia là nhánh "HĐ bị phủ định" im lặng ngừng bắt.
const HD_MENTION_SRC = "(?:hóa\\s*đơn|hoá\\s*đơn|hđ)(?![a-zà-ỹ])";
const MENTIONS_HD = new RegExp(HD_MENTION_SRC);
// Chia "mơ hồ" làm 2 loại (Dũng chốt 2026-08-14, sau ca DPLinh "…324k xuất hđ ạ. Có Hóa đơn" bị ⚠️ oan):
//   • TREO — quanh chỗ nhắc có từ chỉ hóa đơn CHƯA CẦM ĐƯỢC ("về sau", "chưa", "đang chờ", "quên", "gửi bổ
//     sung"…). Đây là mâu thuẫn THẬT với lời khai "có hóa đơn" → GIỮ quyền phủ quyết.
//   • TRẦN — nhắc trống trơn ("xuất hđ", "hóa đơn 500k"): không khẳng định, cũng không nói đang chờ. Nó KHÔNG
//     mang thông tin gì nên KHÔNG được phủ quyết một lần khai rõ "có hóa đơn" ở chỗ khác trong cùng tin.
// Vì sao cần: người gõ làm ĐÚNG lời bot dặn (thêm cụm "có hóa đơn") mà tin vẫn ⚠️ → khoản treo vĩnh viễn,
// bot dặn một đằng chấm một nẻo. Luật vẫn ĐÒI cụm "có hóa đơn" rõ ràng — KHÔNG phải nới thành "nhắc là Có".
// Danh sách cố ý RỘNG: thừa một từ → bot hỏi lại (tốn 1 vòng); thiếu một từ → ghi nhầm "Có" → mất tiền.
// KHÔNG có "xuất" (bare "xuất hđ" phải là TRẦN — đúng ca cần sửa) và không có "lấy" (đã là HD_VERB khẳng định).
const HD_TREO = /^(về|sau|chưa|chờ|đợi|đang|quên|hẹn|mai|mốt|sẽ|thiếu|bổ|sung|tới|nợ|xin|gửi)$/;
const tachChu = (s) => String(s).replace(/[^0-9a-zà-ỹ\s]/gi, " ").trim().split(/\s+/).filter(Boolean);
export function detectHoaDon(text) {
  // NFC: gõ Unicode TỔ HỢP (Unikey "tổ hợp") tách dấu khỏi chữ → regex "hoá đơn" không khớp → "Không" im lặng.
  const t = String(text || "").normalize("NFC").toLowerCase();
  const re = new RegExp(HD_MENTION_SRC, "g"); // tạo mới mỗi lần gọi: regex /g/ dùng chung sẽ nhớ lastIndex
  const seen = new Set();
  let m;
  while ((m = re.exec(t))) {
    // Strip dấu câu TRƯỚC khi split, và thay bằng DẤU CÁCH (không phải chuỗi rỗng) — dấu câu là ranh giới chữ.
    // Cũ: split(/\s+/) trước rồi mới strip từng token → "350k,không" là MỘT token, strip ra "350kkhông",
    // NEG_WORD không khớp → rơi xuống nhánh `before[last] === "có"` → "Có" + ✅ im lặng, tức khoản KHÔNG có bill
    // vào mục "CÓ-HĐ chưa hoàn" → công ty hoàn tiền cho khoản không hề có hóa đơn. Người gõ ĐÚNG cụm bản ghim
    // dạy ("không có hóa đơn") mà thiếu 1 dấu cách là mất tiền, không một cảnh báo. Xem nhóm test HD-dấu-câu.
    // Lớp giữ chữ đánh vần thẳng [0-9a-zà-ỹ] (à-ỹ = U+00E0–U+1EF9, phủ cả đ/ă/ơ), loại mọi dấu câu kể cả
    // unicode (– — … · nằm NGOÀI U+1EF9). CỐ Ý không mượn \w: \w CHỨA gạch dưới → "_không" sống sót nguyên
    // token, trượt NEG_WORD, ra "Có" — mà "_x_" là cú pháp in nghiêng của Discord. Xem nhóm test HD-gạch-dưới.
    // ĐÂY LÀ XỬ LÝ DẤU CÂU — không phải nới lớp ký tự DẤU để bắt chữ gõ sai dấu ("tiên mặt"/"tâm ứng"):
    // việc đó đã thử ở 254c8f4 và bị LÙI ở e6c6bb7. Đừng nhầm hai thứ.
    const before = tachChu(t.slice(0, m.index));
    const tail = before.slice(-3);
    // Phủ định xét TRƯỚC — bất biến, đừng đảo (xem BẪY ở đầu khối).
    if (tail.some((w) => NEG_WORD.test(w))) seen.add("Không");
    else {
      // Khẳng định = có chữ "có" trong 3 chữ cuối VÀ mọi chữ giữa nó với chỗ nhắc đều là HD_VERB.
      // "có" đứng sát → mảng giữa rỗng → .every() trả true → giữ nguyên hành vi cũ, không nới gì thêm.
      const iCo = tail.lastIndexOf("có");
      if (iCo >= 0 && tail.slice(iCo + 1).every((w) => HD_VERB.test(w))) seen.add("Có");
      else {
        // Không rõ → TREO hay TRẦN? Quét từ chờ-đợi ở CẢ HAI PHÍA: "đang chờ hóa đơn" để từ ở TRƯỚC,
        // "hóa đơn về sau" để ở SAU. Thiếu một phía là sót đúng nửa số ca.
        const after = tachChu(t.slice(m.index + m[0].length)).slice(0, 3);
        seen.add([...tail, ...after].some((w) => HD_TREO.test(w)) ? "treo" : "tran");
      }
    }
  }
  if (!seen.size) return "Không";
  // Khai RÕ "có hóa đơn" ở đâu đó trong tin, KHÔNG lần nào phủ định, KHÔNG lần nào nói hóa đơn còn treo
  // → kết luận "Có". Lần nhắc TRẦN ("xuất hđ") không mang thông tin nên không phủ quyết được lời khai rõ.
  if (seen.has("Có") && !seen.has("Không") && !seen.has("treo")) return "Có";
  // Còn lại giữ nguyên luật cũ: gộp treo/trần về "mơ hồ", không thuần nhất một nghĩa thì không đoán bên nào thắng.
  const gop = new Set([...seen].map((x) => (x === "treo" || x === "tran") ? "mơ hồ" : x));
  return gop.size === 1 ? [...gop][0] : "mơ hồ";
}

// Dựng ngày giao dịch DD/MM/YYYY từ ngày người dùng GÕ ở ĐẦU tin. Suy NĂM: có năm (2/4 số) thì theo; không
// có → năm của ngày nhắn tin, và nếu ngày suy ra ở TƯƠNG LAI so với ngày nhắn (vd nhắn 2/1 mà ghi "30/12")
// thì lùi 1 năm — khoản ghi bù luôn ở QUÁ KHỨ, không thể tương lai.
function ngayTuTin(d, mo, yy, msgDate) {
  const base = new Date(msgDate);
  const pad = (n) => String(n).padStart(2, "0");
  let year = base.getFullYear();
  if (yy) year = yy.length <= 2 ? 2000 + Number(yy) : Number(yy);
  else if (new Date(year, mo - 1, d).getTime() > base.getTime() + 86400000) year -= 1;
  return `${pad(d)}/${pad(mo)}/${year}`;
}

// ── Parse 1 tin → {amount, loai?, hoaDon, ngay, noiDung, ncc, ghiChu} | {skip, silent, reason} ──
export function parseEntry(item) {
  let text = String(item.content || "").normalize("NFC").replace(/<@[!&]?\d+>|<#\d+>|<a?:\w+:\d+>|https?:\/\/\S+/g, " ").trim();
  // Ghi chú CÓ CHỦ ĐÍCH → BỎ QUA im lặng: KHÔNG ⚠️, KHÔNG rep, KHÔNG ghi sổ, kể cả khi tin có số tiền. Đây là
  // một đường IM của kênh Trang (cạnh nhánh "tin không có số nghi là tiền" bên dưới, §6). Hai dấu hiệu, dấu nào cũng đủ:
  //   (a) MARKER đầu tin: mở đầu bằng "note" / "ghi chú" (cả dạng không dấu "ghi chu"). (?![a-zà-ỹ]) chặn chữ
  //       dính liền ("notebook", "ghi chút nữa").
  //   (b) CÂU LỆNH rõ ràng ở BẤT KỲ đâu: "không/ko/khỏi/đừng/miễn … ghi (vào/lên) sổ" (ca thật: "…ko ghi sổ" của
  //       chị Trang, viết giữa tin). Dò free-text ở đây AN TOÀN vì người ghi khoản THẬT không bao giờ viết cụm
  //       "không ghi sổ" trong tin — cụm này TỰ NÓ là lời từ chối ghi, khác hẳn token số trơn dễ trùng mà §6 lo.
  // Cả hai an toàn vì đều là dấu hiệu người dùng CỐ Ý phát, không phải lỗi vô ý "quên tiền tố + số trơn".
  const laMarkerGhiChu = /^\s*(?:note|ghi\s*ch[uú])(?![a-zà-ỹ])/i.test(text);
  const laLenhKhongGhiSo = /(?:không|ko|kg|khỏi|đừng|miễn)\s+(?:phải\s+|cần\s+)?ghi\s+(?:vào\s+|lên\s+)?sổ/i.test(text);
  if (laMarkerGhiChu || laLenhKhongGhiSo)
    return { skip: true, silent: true, reason: "ghi chú có chủ đích ('note'/'ghi chú' đầu tin, hoặc cụm 'không ghi sổ') — không ghi sổ" };
  // Tín hiệu "nộp chứng từ" = ảnh ĐÍNH TRỰC TIẾP, KHÔNG tính ảnh của tin forward (trích dẫn tin khác). Fallback
  // về images.length khi hasDirectImg chưa set (test cũ truyền thẳng images = coi như ảnh trực tiếp).
  const hasImg = item.hasDirectImg ?? ((item.images || []).length > 0);
  // Ngày giao dịch: MẶC ĐỊNH = ngày nhắn tin (§4). NGOẠI LỆ (Dũng chốt 2026-08-13): tin GHI RÕ ngày ở ĐẦU
  // ("Ngày 6/8: chi …" · "6/8: chi …" · "06/08/2025: …") → dùng ĐÚNG ngày đó làm ngày phát sinh, để ghi bù
  // khoản CŨ (đã quá cửa sửa) mà sổ vẫn đúng ngày. Chỉ nhận khi có DẤU HIỆU CỐ Ý (chữ "ngày" / có năm / dấu
  // ":" hoặc "-" sau ngày) — KHÔNG nuốt phân số "1/2 thùng" làm ngày. Ngày phải hợp lệ (D≤31, M≤12).
  let ngay = books.toDMY(item.date);
  const dmLead = text.match(/^\s*(ng[àa]y\s*[:：]?\s*)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*([-:：.])?\s+/i);
  if (dmLead) {
    const d = +dmLead[2], mo = +dmLead[3];
    const coDauHieu = !!dmLead[1] || !!dmLead[4] || !!dmLead[5]; // chữ "ngày" · có năm · dấu ngăn sau ngày
    if (coDauHieu && d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
      ngay = ngayTuTin(d, mo, dmLead[4], item.date);
      text = text.slice(dmLead[0].length);
    }
  }
  let loai = null;
  // Tiền tố thu/chi đầu tin (SAU ngày-đầu-tin nếu có). Kênh loaiTuTienTo (Trang) ăn cả dạng TRẦN "thu <chữ>"
  // — người dùng chốt 16/07: khỏi cần ":". (?![a-zà-ỹ]) chặn chữ dính liền (chiều/thuê/thua). KHÔNG nới cho
  // kênh khác: kênh Hiền mà cắt tiền tố là "Chi phí điện 200k" mất chữ "Chi" khỏi Diễn giải, sai âm thầm —
  // kênh Hiền giữ luật cũ: chỉ ăn khi có ":" hoặc ngay sau là SỐ (tránh nuốt "Chi phí").
  const pm = text.match(
    item.cfg?.loaiTuTienTo
      ? /^\s*(thu|chi)(?![a-zà-ỹ])(?:\s*[:：]\s*|\s+|(?=\d))/i
      : /^\s*(thu|chi)\b\s*(?:[:：]\s*|(?=\d))/i
  );
  if (pm) { loai = pm[1].toLowerCase(); text = text.slice(pm[0].length); }
  // Ngày lỡ gõ SAU tiền tố ("chi 1/2 thùng") — gỡ khỏi Nội dung nhưng KHÔNG dùng làm ngày (dễ là phân số).
  const dm = text.match(/^\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b\s*[-:]?\s*/);
  if (dm) text = text.slice(dm[0].length);
  const hoaDon = detectHoaDon(item.content || "");
  const found = extractAmount(text);
  if (!found) {
    // Kênh loaiTuTienTo (Trang) — sổ 1 tab chứa CẢ thu lẫn chi nên tiền tố là BẮT BUỘC, thiếu nó
    // route() không có hướng để ghi. Phải chặn ở ĐÂY, trước nhánh im lặng bên dưới: nhánh đó lấy
    // `loai` (chính là tiền tố) làm tín hiệu "đáng nhắc", nên ở kênh này nó nuốt đúng cái lỗi cần báo.
    // Người gõ theo phản xạ thường quên tiền tố VÀ gõ số trơn ("45000") cùng lúc → trúng cả hai cửa →
    // tin biến mất KHÔNG DẤU VẾT: không ⚠️, không rep, không log (chỉ cộng vào số "bỏ qua" của lượt chạy).
    // Không nới nhánh im lặng cho kênh Hiền: ở đó tiền tố không bắt buộc, mà luật "số trần không phải
    // tiền" là thứ chặn SĐT/STK/mã GD bị đọc thành tiền (xem MONEY_ANY). Nhóm test IMLANG canh cả hai chiều.
    // Kênh Trang, KHÔNG tiền tố (Dũng chốt 2026-08-04 — nới §6): tách hai ca theo có/không SỐ NGHI LÀ TIỀN.
    //   • CÓ số nghi là tiền (chuỗi ≥4 chữ số liền, kể cả gõ TRƠN "45000" mà extractAmount bỏ vì thiếu đ/k)
    //     → vẫn ⚠️: đây là giao dịch quên tiền tố + sai định dạng số, đừng để biến mất (đúng lỗi 29/07).
    //   • KHÔNG số nào → tin GIAO TIẾP/HƯỚNG DẪN của chị Trang (vd "Gửi bill vào đây…", "gửi ảnh + tin cùng
    //     1 câu") → BỎ QUA im lặng, không ⚠️/rep. Vì chị Trang hay hướng dẫn cách gửi bill trong kênh này.
    // "số tiền đọc được" (extractAmount) đòi đuôi đ/k/dấu chấm nghìn; số trơn không đọc được NHƯNG vẫn là
    // dấu hiệu giao dịch nên phải ⚠️, khác hẳn tin thuần chữ. Năm/ngày 4 số lọt vào nhánh ⚠️ là chấp nhận
    // được (thà thừa một ⚠️ hiếm còn hơn nuốt mất một khoản).
    // `hasImg` cũng ở phía ⚠️: tin KÈM ẢNH (ảnh bill + caption thuần chữ, quên số + tiền tố) là một lần NỘP
    // CHỨNG TỪ — tín hiệu giao dịch mạnh hơn cả số trơn, KHÔNG phải hướng dẫn. Bot không đọc ảnh nên phải ⚠️
    // nhắc gõ số, không thì khoản biến mất qua "cửa ảnh" (đúng lỗi §6, chỉ khác lối vào).
    // Khoản ghi bằng ĐÔ LA ($/usd) — subscription nước ngoài không có giá VND (Dũng chốt 2026-08-14). $ LÀ tiền,
    // chỉ là ngoại tệ → xử lý TRƯỚC các nhánh "thiếu số tiền". Kênh Trang: tiền tố thu/chi VẪN bắt buộc (có $ mà
    // thiếu tiền tố → ⚠️ như mọi khoản, không đoán hướng). Có tiền tố (hoặc kênh Hiền) → dựng dòng memo bên dưới.
    const usd = extractUsd(text);
    if (item.cfg?.loaiTuTienTo && !loai)
      return (/\d{4,}/.test(text) || hasImg || usd)
        ? { skip: true, silent: false, reason: usd ? "thiếu tiền tố: có số $ nhưng không có 'thu'/'chi' đầu tin" : "thiếu cả tiền tố lẫn số tiền đọc được" }
        : { skip: true, silent: true, reason: "tin giao tiếp/hướng dẫn (không tiền tố, không số, không ảnh) — bỏ qua im lặng" };
    // $ có mặt (kênh Trang đã qua guard tiền tố ở trên) → dòng MEMO: Thu/Chi để trống, số $ vào Ghi chú, ✅ đã nhận.
    if (usd) {
      if (!hasImg) return { skip: true, silent: true, boQua: true, reason: THIEU_ANH };
      // ≥2 số $ trong 1 tin → KHÔNG tự cộng/chọn (y như nhánh VND): cần đúng 1 cụm "tổng <$>" thì lấy số tổng.
      let pick = usd;
      if (usd.vals.length > 1) {
        if (usd.totals.length !== 1)
          return { skip: true, silent: false, reason: `thấy ${usd.vals.length} số $ ($${usd.vals.join(" · $")}) — thêm "tổng <số>" hoặc tách thành từng tin` };
        pick = usd.totals[0];
      }
      const { noiDung, ncc, ghiChu } = moTaTuText(text.replace(new RegExp(USD_ANY.source, "gi"), " "));
      if (!noiDung && !ncc)
        return { skip: true, silent: false, reason: "thiếu nội dung — tin chỉ có số $, gõ kèm nội dung khoản trong cùng tin" };
      const usdNote = `${pick.raw} (chưa quy VND)`;
      return { amount: 0, loai, hoaDon, ngay, noiDung: noiDung || "(không rõ nội dung)", ncc,
        ghiChu: ghiChu ? `${usdNote}; ${ghiChu}` : usdNote, usd: pick };
    }
    if (hasImg || loai) return { skip: true, silent: false, reason: "không thấy số tiền — thêm 'đ' hoặc dấu chấm ngăn nghìn (vd 720.000đ)" };
    return { skip: true, silent: true, reason: "không phải giao dịch (không có số tiền)" };
  }
  // ĐẾN ĐÂY = tin CÓ số tiền đọc được. Luật CHỨNG TỪ (Dũng chốt 2026-08-14): khoản phải kèm ẢNH ĐÍNH TRỰC TIẾP
  // trong CÙNG tin thì mới ghi sổ; không ảnh → 📷 bỏ qua IM LẶNG (không ⚠️, không rep, không ghi).
  // Vì sao: tin META bàn về khoản ("nhớ gửi lại ko nó ko vào sổ / bị tách 2 tin nữa 210k ra tin riêng" —
  // ca thật 14/08/2026 kênh sổ-chi-chị-Hiền) có nhắc số tiền nhưng KHÔNG phải giao dịch, mà luật cũ ghi
  // thẳng thành khoản chi 210k → sổ có dòng ma. Ảnh bill là thứ phân biệt "khoản THẬT" với "nói VỀ khoản":
  // người ta bàn bạc thì không đính bill. Đây cũng đúng quy định nghiệp vụ (§0b: mỗi giao dịch phải có ảnh).
  // ĐÁNH ĐỔI CỐ Ý: khoản thật gửi TÁCH (ảnh một tin, chữ+số một tin) sẽ bị 📷 — Dũng chốt "ảnh + số phải
  // CÙNG 1 tin", không gộp theo người+ngày. Người gửi phải gộp lại; 📷 hiện rõ nên không mất im lặng.
  // Chiều ngược (có ảnh, thiếu số) KHÔNG đụng: vẫn ⚠️ nhắc gõ số như cũ — đó là bill thật quên số.
  if (!hasImg) return { skip: true, silent: true, boQua: true, reason: THIEU_ANH };
  // ≥2 số tiền trong 1 tin → KHÔNG tự cộng và KHÔNG tự chọn. Bot cộng bừa là sai: "tổng 985k đã cọc 250k
  // còn 735k" cộng ra 2,7tr; chọn bừa cũng sai (số có đuôi "đ" thắng, kể cả khi nhỏ hơn) → khoản kia biến
  // mất khỏi sổ mà người gửi tưởng đã ghi đủ. Cách duy nhất an toàn: NGƯỜI gõ tổng, bot lấy đúng số đó.
  let pick = found;
  if (found.vals.length > 1) {
    if (found.totals.length !== 1)
      return { skip: true, silent: false, reason: `thấy ${found.vals.length} số tiền (${found.vals.map((v) => vnd(v) + "đ").join(" · ")}) — thêm "tổng <số>" hoặc tách thành từng tin` };
    pick = found.totals[0]; // các số còn lại ở lại phần Diễn giải làm giải trình
  }
  // Bỏ token số tiền khỏi chữ (splice theo index) → mô tả/NCC/ghi chú. Tách ngoặc () sang Ghi chú (§4) nằm
  // trong moTaTuText — dùng CHUNG với nhánh $. Luật skip "(… ko ghi sổ)" đã chặn ở ĐẦU hàm nên không lọt tới đây.
  const { noiDung, ncc, ghiChu } = moTaTuText(text.slice(0, pick.index) + " " + text.slice(pick.index + pick.len));
  // Tin CHỈ có số tiền, KHÔNG diễn giải → ⚠️ "thiếu nội dung", KHÔNG ghi. Ca thật (11/08/2026, van giảm áp):
  // khoản bị TÁCH TIN — mô tả + ảnh ở một tin (⚠️ thiếu số), số tiền trơ ở tin khác ("210k"). Trước đây tin
  // "210k" vẫn vào sổ thành dòng diễn giải "(không rõ nội dung)" = RÁC, mà lại là NỬA của một khoản đã ⚠️ ở
  // tin kia → sổ có một dòng vô nghĩa còn khoản thật thì kẹt. Chặn để CẢ nửa số tiền cũng ⚠️ rõ ràng, buộc
  // người gõ gộp số + nội dung vào MỘT tin (xem repText). Chỉ chặn khi diễn giải RỖNG HẲN (và không có NCC sau
  // dấu "|") — mô tả dù chỉ một chữ vẫn ghi, KHÔNG đoán "ngắn quá là thiếu".
  if (!noiDung && !ncc)
    return { skip: true, silent: false, reason: "thiếu nội dung — tin chỉ có số tiền, gõ kèm nội dung khoản trong cùng tin" };
  return { amount: pick.amount, loai, hoaDon, ngay, noiDung: noiDung || "(không rõ nội dung)", ncc, ghiChu };
}

// ── Định tuyến ───────────────────────────────────────────────────────────────
function personName(item) { return PERSONS[item.authorId] || item.author || ""; }

// Trả { book, quy, tab, loai, row, emoji, summary } | { skip, reason }. link = folder Drive chứng từ ("" nếu chưa lưu/dry).
export function route(item, p, link = "") {
  const c = item.cfg;
  const amount = p.amount, ngay = p.ngay, desc = p.noiDung, nguoi = personName(item);
  if (c.route !== "fund") return { skip: true, reason: `route không hỗ trợ: ${c.route}` };
  const b = BOOKS[c.book];
  if (!b) return { skip: true, reason: `chưa cấu hình sổ '${c.book}'` };
  // Sổ 1 tab chứa CẢ thu lẫn chi → tiền tố BẮT BUỘC, không đoán hướng (chủ dự án chốt 2026-10-05).
  if (!p.loai) return { skip: true, reason: "thiếu tiền tố: không có 'thu'/'chi' đầu tin" };
  const loai = p.loai;
  // Hoá đơn khai MƠ HỒ ("hoá đơn gửi sau") → KHÔNG ghi, hỏi lại. Bot không đoán Có/Không.
  if (p.hoaDon === "mơ hồ")
    return { skip: true, reason: "hóa đơn khai chưa rõ: tin có nhắc 'hóa đơn' nhưng không rõ là có hay không" };
  const tab = b.tabs.default;
  const hoaDon = p.hoaDon || "Không";
  const row = books.buildFundRow({ loai, ngay, dienGiai: desc, nguoi, hoaDon, amount, link, ghiChu: p.ghiChu });
  // Khoản $ (memo): amount=0 → buildFundRow để trống CẢ Thu lẫn Chi; số $ đã nằm ở Ghi chú.
  const tien = p.usd ? `${p.usd.raw} (chưa quy VND)` : `${vnd(amount)}đ`;
  return { book: c.book, quy: null, tab, loai, row, emoji: "✅", summary: `${loai.toUpperCase()} ${tien} · ${b.label}/${tab} · HĐ:${hoaDon} · ${nguoi} · ${desc}` };
}

// ── Reply = KHÔNG BAO GIỜ là giao dịch (luật sổ tiền) ─────────────────────────
// Chỉ tin GỐC mới là khoản. Bản gốc có nhánh "người thanh toán reply ảnh = chứng từ" (quỹ chị Hiền) — NP không có.
//   "canhbao" — reply TRÔNG NHƯ một khoản (số tiền / ảnh / tiền tố) → ⚠️ nhắc gửi TIN MỚI.
//   "imlang"  — reply trò chuyện → bỏ qua im lặng.
export function phanLoaiReply(item) {
  const rp = parseEntry(item);
  // `boQua` (thiếu ảnh) vẫn tính là "trông như khoản": reply không bao giờ vào sổ nên câu nhắc là "gửi TIN MỚI".
  return rp.silent && !rp.boQua ? "imlang" : "canhbao";
}

// ── Có được rep tin này không ────────────────────────────────────────────────
// Luật cũ là "đã rep rồi thì thôi" — đúng khi lý do KHÔNG đổi (không mắng lại người ta mỗi ngày),
// nhưng sai khi lý do ĐỔI: sửa xong lỗi A thì lộ lỗi B, bot im, tin rep cũ vẫn đang dạy lỗi A đã hết.
// Người gõ làm đúng y lời dặn mà tin vẫn ⚠️, không ai nói vì sao → khoản treo vĩnh viễn (ca thật:
// tin 1531862203400192102 kênh Trang, 29/07/2026 — 10:15 "thiếu số tiền", 10:19 đã thành "hóa đơn mơ hồ").
// repReason "" = dòng _rep CŨ (2 cột, chưa có Reason) → rep lại ĐÚNG MỘT LẦN cho khớp lý do hiện hành,
// sau đó cột C có giá trị nên im. THUẦN để test.
export function nenRep({ wasRepped, repReason = "", reason = "" }) {
  if (!wasRepped) return true;
  return repReason !== reason;
}

const REP_TAIL = "\nSửa thẳng tin này trong vòng 7 ngày là bot tự ghi sổ, không cần gửi lại.";
export function repText(authorId, reason) {
  const who = authorId ? `<@${authorId}> ` : "";
  // Reply KHÔNG bao giờ là giao dịch → KHÔNG dùng câu kết "sửa thẳng tin này" (sửa reply vô ích); phải gửi TIN MỚI.
  if (reason.startsWith("reply không tính"))
    return `${who}⚠️ **Reply này KHÔNG vào sổ.** Bot chỉ ghi tin gốc, không ghi tin trả lời.\n`
      + `Nếu đây là khoản mới, gửi **một TIN NHẮN MỚI** (đừng reply) — ghi rõ số tiền + nội dung.`;
  // HẾT HẠN: tin ⚠️ quá cửa sửa → bot không tự ghi nữa. KHÔNG dùng câu kết "sửa trong 7 ngày" (đã hết hạn, sửa
  // tin cũ vô ích) — phải gửi TIN MỚI. Dùng ⌛ khớp reaction bot vừa dán.
  if (reason.startsWith(EXPIRED_MARKER))
    return `${who}⌛ **Khoản này đã quá hạn sửa** — bot sẽ không tự ghi nữa.\n`
      + `Nếu vẫn cần ghi, gửi **một TIN NHẮN MỚI** (số tiền + nội dung), đừng sửa tin cũ.`;
  let how;
  // Thiếu CẢ HAI thì dặn cả hai trong một lần — dặn lẻ thì người ta sửa xong cái này lại vấp cái kia,
  // mất thêm một lượt cron mới biết. Nhánh này phải đứng TRƯỚC nhánh "kênh Trang" trơn bên dưới.
  // Thứ tự quan trọng: "thiếu cả tiền tố" phải đứng TRƯỚC "thiếu tiền tố" (startsWith).
  if (reason.startsWith("thiếu cả tiền tố")) how = "Kênh này **chỉ ghi khoản thu/chi**, mỗi tin cần đủ **2 thứ**:\n"
    + "1. Chữ `thu` hoặc `chi` ở **đầu** tin.\n"
    + "2. Số tiền có `đ` hoặc `k` — gõ trơn `45000` bot không đọc được.\n"
    + "VD: `chi Mua vật tư mẫu 1.250.000đ`";
  else if (reason.startsWith("thiếu tiền tố")) how = "Kênh này cần chữ `thu` hoặc `chi` ở **đầu** tin.\nVD: `chi Mua vật tư mẫu 1.250.000đ`";
  else if (reason.startsWith("hóa đơn khai chưa rõ")) how = "Tin có nhắc *hoá đơn* nhưng không rõ là **có** hay **không** — bot không đoán.\nKhoản **có** hoá đơn đỏ → ghi đúng cụm `có hoá đơn đỏ`.\nKhoản **không** có → đừng nhắc chữ `hoá đơn`, hoặc ghi `không có hoá đơn`.";
  else if (reason.startsWith("thấy")) how = "Mỗi tin chỉ 1 khoản. Nếu là **một** khoản gồm nhiều phần, thêm `tổng <số>`.\nVD: `Lắp máy 300k công + 100k van, tổng 400k`";
  else if (reason.startsWith("không thấy số tiền")) how = "Bot **không đọc ảnh** — số tiền phải gõ bằng chữ, có `đ` hoặc `k`.\nVD: `45.000đ` · `45k`. Gõ trơn `45000` bot bỏ qua.";
  else if (reason.startsWith("thiếu nội dung")) how = "Tin này **chỉ có số tiền**, chưa có nội dung khoản.\nGõ **nội dung + số tiền trong CÙNG một tin** (đừng tách rời).\nVD: `vật tư van giảm áp 3c 210k`";
  else how = reason;
  return `${who}⚠️ **Khoản này CHƯA vào sổ.**\n${how}${REP_TAIL}`;
}

// ── Bước quét ────────────────────────────────────────────────────────────────
async function scanPhase() {
  await books.kiemTraLocale(BOOKS.np.sheetId); // ném nếu Sheet không ở vi_VN — dừng TRƯỚC khi ghi ngày sai
  let work = await buildWorklist();
  if (limit && work.length > limit) work = work.slice(0, limit);
  logLine(`Tìm thấy ${work.length} tin cần xét (chưa ghi).`);
  if (!work.length) return;

  const perBook = {}; const warns = [];
  // Tin NAY bị BỎ QUA IM LẶNG nhưng TRƯỚC ĐÂY từng bị ⚠️ (wasRepped) — vd tin hướng dẫn của chị Trang từng
  // bị ⚠️ theo luật cũ, nay khớp nhánh im lặng. Nhánh silent chỉ `continue` nên ⚠️+rep cũ treo lại thành
  // "báo sai" (§6 ghi rõ là nợ "chưa làm"). Gom ở đây để pha dọn gỡ ⚠️ + xoá tin rep của chính bot.
  const staleClears = [];
  // Tin đã QUÁ CỬA SỬA (expired) mà từng bị ⚠️ (wasRepped) → pha "hết hạn": gỡ ⚠️, dán ⌛, đổi rep sang "quá
  // hạn". Chỉ tin wasRepped mới đóng dấu (tin thuần chat quá hạn thì kệ). KHÔNG ghi sổ tin expired.
  const expiredWarns = [];
  // Tin CÓ số tiền nhưng KHÔNG kèm ảnh chứng từ → dán 📷, không ghi, không rep (xem THIEU_ANH).
  const xBoQua = [];
  let manualCount = 0, chatSkip = 0, writeCount = 0;
  for (const item of work) {
    // Đã quá cửa sửa → KHÔNG ghi. Chỉ tin TỪNG ⚠️ (wasRepped) mới xử lý, và phải PHÂN LOẠI LẠI: nay là chat im
    // lặng → DỌN sạch (gỡ ⚠️ + xoá rep, KHÔNG ⌛ — tránh dán "quá hạn sửa" lên tin vốn không phải khoản, vd tin
    // hướng dẫn của chị Trang từng bị ⚠️ theo luật cũ); còn là khoản lỗi (⚠️) hoặc sửa-hợp-lệ-nhưng-trễ → ⌛.
    // Tin CHƯA từng ⚠️ → không đụng (không ai để ý, dán ⌛ chỉ tạo nhiễu).
    if (item.expired) {
      if (item.wasRepped) {
        const conWarn = item.replyToId
          ? phanLoaiReply(item) !== "imlang"
          : (() => { const pe = parseEntry(item); return !(pe.skip && pe.silent); })();
        (conWarn ? expiredWarns : staleClears).push(item);
      }
      continue;
    }
    // Reply KHÔNG BAO GIỜ là giao dịch. Payer+ảnh → đính chứng từ; reply trông-như-khoản → ⚠️ nhắc gửi tin
    // mới; reply trò chuyện → bỏ qua im lặng.
    if (item.replyToId) {
      const loaiRep = phanLoaiReply(item);
      if (loaiRep === "canhbao") {
        warns.push({ channelId: item.channelId, id: item.id, authorId: item.authorId, book: item.book, wasRepped: item.wasRepped, repMsgId: item.repMsgId, repReason: item.repReason, reason: "reply không tính là khoản" });
        manualCount++;
      } else { chatSkip++; if (item.wasRepped) staleClears.push(item); }
      continue;
    }
    const p = parseEntry(item);
    if (p.skip) {
      // 📷 thiếu ảnh chứng từ: bỏ qua nhưng ĐÁNH DẤU (khác chatSkip im hoàn toàn). Tin từng bị ⚠️ theo luật
      // cũ (đã ghi/đã mắng) thì dọn luôn ⚠️+rep ở pha 📷 — không để hai dấu mâu thuẫn treo cùng một tin.
      if (p.boQua) { chatSkip++; xBoQua.push(item); continue; }
      if (p.silent) { chatSkip++; if (item.wasRepped) staleClears.push(item); continue; }
      logLine(`  ⚠️ BỎ QUA ${item.channel} ${item.id} (${item.author}): ${p.reason}`);
      manualCount++; warns.push({ channelId: item.channelId, id: item.id, authorId: item.authorId, book: item.book, wasRepped: item.wasRepped, repMsgId: item.repMsgId, repReason: item.repReason, reason: p.reason }); continue;
    }
    let rt = route(item, p);
    if (rt.skip) { logLine(`  ⚠️ BỎ QUA ${item.channel} ${item.id} (${item.author}): ${rt.reason}`); manualCount++; warns.push({ channelId: item.channelId, id: item.id, authorId: item.authorId, book: item.book, wasRepped: item.wasRepped, repMsgId: item.repMsgId, repReason: item.repReason, reason: rt.reason }); continue; }
    // Lưu ảnh chứng từ vào folder QUỸ theo quỹ → tháng → Thu/Chi → giao dịch. Chỉ khi chạy thật.
    if (!dry && (item.images || []).length) {
      const b = BOOKS[rt.book];
      if (b?.folderId) {
        const buffers = [];
        for (const img of item.images) { const buf = await fetchImageBuffer(img).catch(() => null); if (buf) buffers.push(buf); }
        if (buffers.length) {
          try {
            const link = await drive.archiveTransaction(driveOf(), b.folderId, { quy: rt.quy, loai: rt.loai, dmy: p.ngay, msgId: item.id, desc: p.noiDung, buffers });
            if (link) rt = route(item, p, link); // dựng lại dòng kèm link Drive
          } catch (e) { logLine(`  ⚠️ Lưu Drive lỗi (vẫn ghi sổ, link trống): ${e?.message ?? e}`); }
        }
      }
    }
    // Khóa gom = book + tab: 1 file giờ ghi được vào 2 tab trong CÙNG một lần chạy (kênh chi Hiền có cả
    // khoản có HĐ lẫn không HĐ). Gom theo book thôi là trộn 2 tab vào 1 commit → ghi sai sổ.
    const key = `${rt.book}|${rt.tab}`;
    (perBook[key] ||= { book: rt.book, tab: rt.tab, rows: [], msgIds: [], reactions: [] });
    perBook[key].rows.push(rt.row); perBook[key].msgIds.push(item.id);
    // React gom THEO CÙNG KHÓA với rows: ✅ chỉ được thả SAU khi commit của đúng khóa này thành công.
    // Bất biến: ✅ = đã ghi sổ. Gom toàn cục là nói dối khi 1 trong 2 commit của cùng file hỏng.
    perBook[key].reactions.push({ channelId: item.channelId, id: item.id, emoji: rt.emoji, wasRepped: item.wasRepped, repMsgId: item.repMsgId });
    writeCount++;
    logLine(`  ${rt.emoji} ${rt.summary}  [${item.channel}/${item.author}]`);
  }

  logLine(`Kết quả: ${writeCount} ghi · ${manualCount} cần xử lý tay · ${chatSkip} bỏ qua (không phải giao dịch)${staleClears.length ? ` · ${staleClears.length} dọn báo sai (nay im lặng)` : ""}${expiredWarns.length ? ` · ${expiredWarns.length} hết hạn (⌛)` : ""}${xBoQua.length ? ` · ${xBoQua.length} thiếu ảnh (📷)` : ""}.`);

  // ── Pha DỌN "báo sai": tin nay bị BỎ QUA IM LẶNG mà trước từng bị ⚠️ → gỡ ⚠️ + xoá tin rep của bot ──
  // Chạy ở CẢ dry (chỉ log) lẫn thật. Idempotent: unreact/deleteMessage coi 404 = đã gỡ/xoá rồi = thành công,
  // nên chạy lại nhiều lượt vô hại (tin còn trong cửa sổ --days sẽ được thử lại tới khi trôi khỏi 7 ngày;
  // KHÔNG đụng _state/_rep — không đoán, không mark processed để tin sửa-thành-khoản sau vẫn ghi được).
  // Chỉ xoá repMsgId lấy TỪ _rep!B (buildWorklist gắn sẵn), tuyệt đối không đoán id.
  for (const s of staleClears) {
    if (dry) { logLine(`  🧹 [DRY] sẽ gỡ ⚠️ + xoá rep ${s.repMsgId || "(dòng _rep cũ, không có id)"} của tin ${s.id} (${s.author}) — nay bỏ qua im lặng`); continue; }
    try { await unreact(s.channelId, s.id, "⚠️"); } catch {}
    if (s.repMsgId) {
      try { await deleteMessage(s.channelId, s.repMsgId); logLine(`  🧹 dọn báo sai: gỡ ⚠️ + xoá rep ${s.repMsgId} của tin ${s.id} (${s.author}) — nay bỏ qua im lặng`); }
      catch (e) { logLine(`✗ xoá rep ${s.repMsgId} (tin ${s.id}): ${e.message}`); }
    } else logLine(`  🧹 dọn báo sai: gỡ ⚠️ ${s.id} (${s.author}) — dòng _rep cũ không có id tin rep, xoá rep cần làm tay`);
  }

  // ── Pha 📷 THIẾU ẢNH: tin có số tiền nhưng không kèm ảnh chứng từ → dán 📷, KHÔNG ghi, KHÔNG rep.
  // Chạy ở CẢ dry (log) lẫn thật. KHÔNG mark _state (y như mọi tin chưa xử lý): Discord không cho thêm ảnh khi sửa
  // tin, nên người gõ phải GỬI TIN MỚI kèm ảnh — tin 📷 không nằm trong _state/sổ nên không ghi trùng. Hệ quả chấp nhận: còn trong cửa sổ --days thì mỗi lượt thử react lại — react
  // trùng vô hại (Discord bỏ qua), và tự dừng khi tin trôi khỏi 7 ngày.
  // Tin từng bị ⚠️ theo luật CŨ (đã rep "chưa vào sổ") → gỡ ⚠️ + xoá rep: nay bot cố ý không ghi, để rep cũ
  // treo lại là dạy sai (người ta sẽ sửa số tiền mãi mà vẫn không vào sổ vì thiếu thứ khác — cái ảnh).
  for (const x of xBoQua) {
    if (dry) { logLine(`  📷 [DRY] sẽ dán 📷 tin ${x.id} (${x.author}) — có số tiền nhưng không kèm ảnh chứng từ${x.wasRepped ? " + gỡ ⚠️/xoá rep cũ" : ""}`); continue; }
    if (x.wasRepped) {
      try { await unreact(x.channelId, x.id, "⚠️"); } catch {}
      if (x.repMsgId) {
        try { await deleteMessage(x.channelId, x.repMsgId); }
        catch (e) { logLine(`✗ xoá rep ${x.repMsgId} (tin ${x.id}): ${e.message}`); }
      }
    }
    // Dọn dấu ❌ đời cũ (trước 2026-08-18) còn treo trên tin — idempotent, 404 = đã sạch.
    try { await unreact(x.channelId, x.id, LEGACY_BOQUA_EMOJI); } catch {}
    try { await react(x.channelId, x.id, BOQUA_EMOJI); logLine(`  📷 ${x.id} (${x.author}) — có số tiền nhưng không kèm ảnh chứng từ, không ghi sổ`); }
    catch (e) { logLine(`✗ react 📷 ${x.id}: ${e.message}`); }
  }

  // ── Pha HẾT HẠN: tin ⚠️ đã QUÁ cửa sửa (recordFloor) nhưng còn trong dải ân hạn → gỡ ⚠️, dán ⌛, đổi tin rep
  // sang "quá hạn, gửi tin mới". Chạy ở CẢ dry (log) lẫn thật. KHÔNG mark _state (để chạy tay --days=N vẫn VỚT
  // lại được). Idempotent: react ⌛ trùng vô hại; rep chỉ đổi khi reason CHƯA phải EXPIRED_MARKER → không mắng
  // lại mỗi lượt. Chỉ xoá repMsgId lấy TỪ _rep!B (buildWorklist gắn sẵn), tuyệt đối không đoán id.
  for (const w of expiredWarns) {
    const b = BOOKS[w.book];
    if (dry) { logLine(`  ⌛ [DRY] sẽ gỡ ⚠️ + dán ⌛${w.repReason === EXPIRED_MARKER ? "" : ' + đổi rep "quá hạn"'} cho tin ${w.id} (${w.author})`); continue; }
    try { await unreact(w.channelId, w.id, "⚠️"); } catch {}
    try { await react(w.channelId, w.id, EXPIRED_EMOJI); } catch (e) { logLine(`✗ react ⌛ ${w.id}: ${e.message}`); }
    if (w.repReason === EXPIRED_MARKER) continue;      // đã đổi rep "quá hạn" ở lượt trước → thôi, chỉ giữ ⌛
    if (!b) { logLine(`  ⌛ ${w.id}: book '${w.book}' chưa cấu hình — đã dán ⌛, không đổi được rep`); continue; }
    try {
      if (w.repMsgId) {
        try { await deleteMessage(w.channelId, w.repMsgId); }
        catch (e) { logLine(`✗ xoá rep cũ ${w.repMsgId} (tin ${w.id}): ${e.message}`); }
      }
      const repMsgId = await reply(w.channelId, w.id, repText(w.authorId, EXPIRED_MARKER));
      await books.markRepped(b.sheetId, [{ msgId: w.id, repMsgId, reason: EXPIRED_MARKER }]);
      logLine(`  ⌛ hết hạn ${w.id} (${w.author}) → gỡ ⚠️, dán ⌛, đổi rep "quá hạn"`);
    } catch (e) { logLine(`✗ đổi rep hết hạn ${w.id}: ${e.message}`); }
  }

  if (dry) { logLine("[DRY] không ghi/react/lưu Drive (pha dọn báo sai + 📷 thiếu ảnh + hết hạn ở trên chỉ mô phỏng)."); return; }

  for (const d of Object.values(perBook)) {
    const b = BOOKS[d.book];
    try {
      const r = await books.commit({ sheetId: b.sheetId, tab: d.tab, rows: d.rows, msgIds: d.msgIds });
      logLine(`commit ${b.label} / ${d.tab}: ` + JSON.stringify(r.written));
    } catch (e) {
      // Commit hỏng (tab bị đổi tên tay, mất quyền, Sheets 5xx…) → dòng KHÔNG vào sổ và msgId KHÔNG vào
      // _state. Tin thuộc khóa này vì thế KHÔNG được ✅ và KHÔNG bị gỡ ⚠️ — để lượt sau quét lại thật.
      logLine(`✗ commit ${d.book}/${d.tab} lỗi — ${d.reactions.length} tin KHÔNG được ✅ (giữ nguyên ⚠️ nếu có), lượt sau quét lại: ` + (e?.message ?? e));
      process.exitCode = 1;
      continue;
    }
    for (const rc of d.reactions) {
      // Tin từng bị rep, nay đã sửa đúng và ĐÃ commit vào sổ → dọn SẠCH cả hai dấu vết "chưa ghi":
      // gỡ ⚠️ VÀ xoá tin rep. Để rep lại là nói dối — nó ghi "Khoản này CHƯA vào sổ" ngay dưới một
      // khoản đã ✅; người lướt kênh đọc rep sẽ gửi lại tin mới → bot ghi 2 dòng → tiền gấp đôi.
      // Xoá SAU commit thành công (nhánh này chỉ chạy khi commit không ném) — bất biến ✅ = đã ghi sổ.
      if (rc.wasRepped) {
        try { await unreact(rc.channelId, rc.id, "⚠️"); logLine(`  🧹 gỡ ⚠️ ${rc.id} (đã sửa đúng)`); } catch {}
        // Dòng _rep CŨ chỉ có cột A → không biết tin rep nào là của khoản này → BỎ QUA êm.
        // Tuyệt đối không suy/đoán id: đoán sai là xoá nhầm tin của người thật.
        if (rc.repMsgId) {
          try { await deleteMessage(rc.channelId, rc.repMsgId); logLine(`  🗑️ xoá rep ${rc.repMsgId} của tin ${rc.id}`); }
          catch (e) { logLine(`✗ xoá rep ${rc.repMsgId} (tin ${rc.id}): ${e.message}`); }
        } else logLine(`  ↷ tin ${rc.id}: dòng _rep cũ không lưu id tin rep — bỏ qua bước xoá, rep cần gỡ tay`);
      }
      try { await react(rc.channelId, rc.id, rc.emoji); } catch (e) { logLine(`✗ react ${rc.id}: ${e.message}`); }
    }
  }
  for (const w of warns) {
    try { await react(w.channelId, w.id, "⚠️"); } catch (e) { logLine(`✗ react ${w.id}: ${e.message}`); }
    // Không có book → lỗi CẤU HÌNH, không phải lỗi người gõ: rep cũng vô ích (sửa tin không cứu được),
    // mà markRepped lại ném TypeError vì thiếu sheetId → _rep không ghi → rep lại mỗi ngày, vĩnh viễn.
    // Chỉ ⚠️ + báo người vận hành. Tin rep dành riêng cho lỗi người gõ sửa được.
    const b = BOOKS[w.book];
    if (!b) { logLine(`✗ book '${w.book}' chưa cấu hình trong _books — không rep tin ${w.id}, cần sửa channels.json`); continue; }
    // Chưa rep, hoặc lý do ĐỔI → phải rep (tin rep cũ đang dạy chướng ngại đã hết). Cùng lý do → mặc định im,
    // không mắng lại mỗi lượt.
    const reasonChanged = nenRep(w);
    // NHẮC LẠI 1 LẦN/NGÀY (Dũng chốt 2026-08-13): cùng lý do mà tin vẫn ⚠️ chưa sửa → ở lượt BÁO CÁO cuối ngày
    // (cờ --nhac-lai, tức 20:30) ĐẨY tin nhắc xuống đáy kênh (xoá rep cũ + gửi lại) để chị Trang/Hiền theo dõi; các
    // lượt 11:00/15:00 (không có cờ --nhac-lai) vẫn IM. Cần repMsgId để đẩy — dòng _rep cũ 2 cột không có id thì để im.
    const nhacLai = !reasonChanged && nhacLaiLuot && w.wasRepped && w.repMsgId;
    if (!reasonChanged && !nhacLai) continue;
    try {
      // Xoá tin rep CŨ trước khi gửi tin mới — để hai hướng dẫn khác nhau không treo cạnh nhau (khi lý do đổi),
      // và để MỖI khoản chỉ còn ĐÚNG MỘT tin nhắc, luôn tươi ở đáy kênh (khi nhắc lại). Xoá hỏng (429/mất tin)
      // không được chặn tin mới: thà thừa một tin rep cũ còn hơn im luôn. Chỉ xoá id lấy TỪ _rep!B, không đoán.
      if (w.wasRepped && w.repMsgId) {
        try { await deleteMessage(w.channelId, w.repMsgId); logLine(`  🗑️ xoá rep cũ ${w.repMsgId} của tin ${w.id} (${reasonChanged ? "lý do đã đổi" : "đẩy nhắc cuối ngày"})`); }
        catch (e) { logLine(`✗ xoá rep cũ ${w.repMsgId} (tin ${w.id}): ${e.message}`); }
      }
      // Lưu id tin rep + LÝ DO ngay cạnh msgId: id để xoá đúng tin về sau, lý do để lượt sau biết có đổi.
      const repMsgId = await reply(w.channelId, w.id, repText(w.authorId, w.reason));
      await books.markRepped(b.sheetId, [{ msgId: w.id, repMsgId, reason: w.reason }]);
      logLine(`  ✉️ ${reasonChanged ? "rep" : "nhắc lại"} ${w.id}${w.wasRepped && reasonChanged ? " (lý do đổi)" : ""}${repMsgId ? ` → tin rep ${repMsgId}` : " (không lấy được id tin rep — sẽ không xoá được tự động)"}`);
    } catch (e) { logLine(`✗ rep ${w.id}: ${e.message}`); }
  }
}

// ── --requet=<msgId>[,<msgId>]: CHẤM LẠI một tin CỤ THỂ theo luật HIỆN TẠI ────────────────────────────
// Sinh ra 2026-08-14: luật mới (bắt buộc ảnh chứng từ) chỉ áp cho tin CHƯA xử lý — tin đã bị ghi nhầm theo
// luật CŨ thì nằm trong `_state` nên lượt quét thường KHÔNG bao giờ đụng lại, dấu ✅ + dòng sai treo vĩnh viễn
// (ca thật: tin dặn dò "…210k…" của Tuyết Trang đã ✅ và đã vào sổ chi chị Hiền).
// Lệnh này BỎ QUA `_state` để chấm lại đúng 1 tin, rồi DỌN DẤU trên Discord cho khớp phán quyết mới.
//
// 🔴 CỐ Ý KHÔNG LÀM 2 việc:
//  1. KHÔNG xoá dòng trong Google Sheet. Xoá dòng sổ tiền là thao tác không lùi được, lại đụng công thức Tồn
//     quỹ cộng dồn — để NGƯỜI làm, bot chỉ IN RA đúng dòng nào cần xoá (dựng lại bằng cách chấm tin với
//     hasDirectImg=true, tức tái hiện y dòng mà luật cũ đã ghi).
//  2. KHÔNG gỡ msgId khỏi `_state`. Còn trong _state = bot sẽ KHÔNG ghi lại tin này lần nữa → xoá dòng tay
//     xong không sợ lượt sau nó mọc lại. (Muốn tin được ghi lại thì sửa tin cho hợp lệ rồi xoá dòng _state tay.)
// Tìm 1 tin theo id trong các kênh đã cấu hình (Discord không có API tra tin theo id toàn server).
// Dùng chung --requet và --suadong.
async function timTinTheoId(msgId) {
  for (const [cid, c] of Object.entries(CHANS)) {
    if (!laKenh(cid, c)) continue;
    let r;
    try { r = await fetch(`${API}/channels/${cid}/messages/${msgId}`, H); } catch (e) { logLine(`✗ ${msgId} @${c.name}: ${e?.message ?? e}`); continue; }
    if (r.status === 404) continue;                        // không thuộc kênh này
    if (!r.ok) { logLine(`✗ ${msgId} @${c.name}: HTTP ${r.status}`); continue; }
    return { m: await r.json(), cid, c };
  }
  return null;
}

async function requetPhase(ids) {
  const seen = {}, repped = {};
  for (const [bk, b] of Object.entries(BOOKS)) {
    try { seen[bk] = await books.loadProcessed(b.sheetId); } catch { seen[bk] = new Set(); }
    try { repped[bk] = await books.loadRepped(b.sheetId); } catch { repped[bk] = new Map(); }
  }
  for (const msgId of ids) {
    const found = await timTinTheoId(msgId);
    if (!found) { logLine(`✗ ${msgId}: KHÔNG thấy trong kênh nào đã cấu hình (id sai? tin đã xoá? bot không ở kênh đó?)`); continue; }
    const { m, cid, c } = found;
    const bk = c.book;
    const daGhi = seen[bk]?.has(String(msgId)) || false;
    // Quá CỬA SỬA (--days, mặc định 7) → dù phán quyết là WARN thì lượt quét thật cũng KHÔNG ghi nữa (chỉ dán
    // ⌛). Không nói ra thì người đọc tưởng "sửa tin là vào sổ" rồi sửa vô ích — đúng bẫy mà ⌛ sinh ra để tránh.
    const recordFloor = sinceISO || new Date(Date.now() - days * 86400000).toISOString();
    const expired = !all && String(m.timestamp) < recordFloor;
    const it = dungItem(m, cid, c, { expired, rep: repped[bk]?.get(String(msgId)) || null });
    if (!it) { logLine(`✗ ${msgId}: tin rỗng (không chữ, không ảnh)`); continue; }

    // Chấm theo ĐÚNG luật lượt quét thật (dùng chung parseEntry/route/phanLoaiReply — không chép logic).
    let verdict, chiTiet = "";
    if (it.replyToId) {
      const lr = phanLoaiReply(it);
      verdict = lr === "canhbao" ? "WARN" : "SILENT";
      chiTiet = `reply (${lr})`;
    } else {
      const p = parseEntry(it);
      if (p.skip) { verdict = p.boQua ? "BOQUA" : (p.silent ? "SILENT" : "WARN"); chiTiet = p.reason; }
      else {
        const rt = route(it, p);
        if (rt.skip) { verdict = "WARN"; chiTiet = rt.reason; } else { verdict = "GHI"; chiTiet = rt.summary; }
      }
    }
    logLine(`\n── ${msgId} · ${c.name} · ${it.author} · ${it.date}${daGhi ? " · ĐÃ TRONG _state (đã từng ghi sổ)" : " · chưa ghi"}`);
    logLine(`   nội dung: ${String(it.content).replace(/\s+/g, " ").slice(0, 120)}`);
    logLine(`   ảnh đính trực tiếp: ${it.hasDirectImg ? "CÓ" : "KHÔNG"}${it.wasRepped ? ` · từng rep (${it.repMsgId || "không có id"})` : ""}`);
    logLine(`   ➜ PHÁN QUYẾT theo luật hiện tại: ${verdict} — ${chiTiet}`);
    if (expired) logLine(`   ⌛ TIN ĐÃ QUÁ CỬA SỬA (${days} ngày): lượt quét thật sẽ KHÔNG ghi dù sửa đúng — cần gửi TIN MỚI (hoặc chạy tay --days=N lớn hơn để vớt).`);

    // Tin đã ghi theo luật cũ mà nay KHÔNG được ghi → in ra ĐÚNG dòng đang nằm trong sổ để người xoá tay.
    if (daGhi && (verdict === "BOQUA" || verdict === "SILENT")) {
      const p2 = parseEntry({ ...it, hasDirectImg: true });   // tái hiện phán quyết CŨ (khi chưa đòi ảnh)
      const rt2 = p2.skip ? null : route(it, p2);
      const b = BOOKS[bk];
      logLine(`   🔴 DÒNG SAI ĐANG NẰM TRONG SỔ — cần XOÁ TAY (bot cố ý không tự xoá dòng sổ tiền):`);
      logLine(`      file: ${b?.label ?? bk}${rt2 && !rt2.skip ? ` · tab: ${rt2.tab}` : " · tab: (không dựng lại được, tìm theo ngày+số tiền)"}`);
      if (rt2 && !rt2.skip) logLine(`      dòng: Ngày ${p2.ngay} · ${rt2.loai.toUpperCase()} ${vnd(p2.amount)}đ · Người ${personName(it)} · "${p2.noiDung}"`);
      logLine(`      (msgId vẫn giữ trong _state → xoá dòng xong bot KHÔNG ghi lại tin này.)`);
    }

    if (dry) { logLine(`   [DRY] sẽ ${verdict === "BOQUA" ? "gỡ ✅/⚠️, xoá rep, dán 📷" : verdict === "SILENT" ? "gỡ ✅/⚠️, xoá rep" : "KHÔNG đụng dấu"}`); continue; }
    if (verdict === "BOQUA" || verdict === "SILENT") {
      for (const e of ["✅", "⚠️", LEGACY_BOQUA_EMOJI]) { try { await unreact(cid, msgId, e); } catch {} }
      if (it.repMsgId) {
        try { await deleteMessage(cid, it.repMsgId); logLine(`   🗑️ xoá tin rep ${it.repMsgId}`); }
        catch (e) { logLine(`   ✗ xoá rep ${it.repMsgId}: ${e.message}`); }
      }
      if (verdict === "BOQUA") {
        try { await react(cid, msgId, BOQUA_EMOJI); logLine(`   📷 đã gỡ ✅/⚠️ và dán 📷`); }
        catch (e) { logLine(`   ✗ react 📷: ${e.message}`); }
      } else logLine(`   🧹 đã gỡ ✅/⚠️ (tin trò chuyện — không dán dấu gì)`);
    } else logLine(`   ↷ không đụng dấu (phán quyết ${verdict} — lượt quét thường lo tiếp).`);
  }
}

// ── Main (CHỈ chạy khi gọi trực tiếp từ CLI — import an toàn) ─────────────────
// MỌI lỗi đặt process.exitCode = 1 → workflow ĐỎ → GitHub gửi email. Bản gốc nuốt lỗi quét ("vẫn báo cáo") vì còn
// DM báo cáo làm kênh báo; NP không có DM, workflow đỏ là kênh báo lỗi DUY NHẤT.
if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  (async () => {
    // v2 KHÔNG còn quét theo lịch (bot NP ghi sổ qua MCP npso). Chạy trơn = nơi ghi thứ hai (dòng thiếu Nguồn quỹ/Mã tin,
    // rep ⚠️ lạc) → từ chối. Chỉ còn các lệnh sửa tay cho người quản lý (review M1, 2026-10-05).
    if (!xoaDongArg && !suaDongArg && !requetIds.length) {
      console.error("scanner.mjs v2: chỉ còn lệnh sửa tay --xoadong / --suadong / --requet. Ghi sổ do bot NP (MCP npso) làm.");
      process.exit(2);
    }
    if (!TOKEN && (suaDongArg || requetIds.length)) die("Thiếu DISCORD_BOT_TOKEN (~/.claude/channels/discord-np/.env)");
    const b = BOOKS.np, tab = b.tabs.default;
    if (!b.sheetId) die("config.json chưa có book.sheetId — chạy setup.mjs trước");
    if (!Object.keys(CHANS).length) die("config.json chưa khai kênh nào trong channels");
    // --xoadong=<dòng>:<sốtiền>[:<DD/MM/YYYY>] — xoá 1 dòng ghi nhầm. NP 1 sổ 1 tab nên khỏi khai book/tab như bản gốc.
    // Đối chiếu SỐ TIỀN (+ ngày) trước khi xoá để không xoá nhầm dòng khi ai đó đã chèn/xoá tay.
    if (xoaDongArg) {
      const [rowS, tienS, ngayS] = xoaDongArg.split(":");
      const rowNum = Number(rowS), expectAmount = Number(tienS);
      if (!Number.isInteger(rowNum) || rowNum < 2) die(`--xoadong: số dòng không hợp lệ '${rowS}' (dòng 1 là tiêu đề)`);
      if (!Number.isFinite(expectAmount) || expectAmount <= 0) die(`--xoadong: thiếu/sai số tiền đối chiếu '${tienS}' — BẮT BUỘC để không xoá nhầm dòng`);
      logLine(`=== Xoá dòng ${rowNum} · ${b.label}/${tab} · đối chiếu ${vnd(expectAmount)}đ${ngayS ? ` · ngày ${ngayS}` : ""}${dry ? " (DRY)" : ""} ===`);
      try {
        const r = await books.xoaDongSo({ sheetId: b.sheetId, tab, rowNum, expectAmount, expectDMY: ngayS || null, dry });
        logLine(r.dry ? `   [DRY] KHỚP — sẽ xoá: ${r.mota}` : `   🗑️ ĐÃ XOÁ dòng ${r.rowNum}: ${r.mota}`);
      } catch (e) { logLine(`   ✗ ${e?.message ?? e}`); process.exitCode = 1; }
      return;
    }
    // --suadong=<dòng>:<msgId> — đọc lại tin gốc, parse theo luật HIỆN TẠI, ghi đè Diễn giải + Ghi chú (tiền giữ nguyên).
    if (suaDongArg) {
      const [rowS, msgId] = suaDongArg.split(":");
      const rowNum = Number(rowS);
      if (!Number.isInteger(rowNum) || rowNum < 2 || !/^\d{5,}$/.test(msgId || "")) die("--suadong: cần <dòng>:<msgId> (id số, không phải link)");
      logLine(`=== Sửa chữ dòng ${rowNum} · ${b.label}/${tab} · theo tin ${msgId}${dry ? " (DRY)" : ""} ===`);
      const found = await timTinTheoId(msgId);
      if (!found) { logLine(`   ✗ không thấy tin ${msgId} trong kênh đã cấu hình`); process.exitCode = 1; return; }
      const it = dungItem(found.m, found.cid, found.c);
      const p = it ? parseEntry(it) : { skip: true, reason: "tin rỗng" };
      if (p.skip) { logLine(`   ✗ tin nay KHÔNG parse ra khoản (${p.reason}) — dừng.`); process.exitCode = 1; return; }
      const rt = route(it, p);
      if (rt.skip) { logLine(`   ✗ tin nay không route được (${rt.reason}) — dừng.`); process.exitCode = 1; return; }
      try {
        const r = await books.suaDongSo({ sheetId: b.sheetId, tab, rowNum, expectDMY: p.ngay, dienGiai: p.noiDung, ghiChu: p.ghiChu || "", dry });
        logLine(`   cũ : "${r.cu.dienGiai}" | ghi chú: "${r.cu.ghiChu}"`);
        logLine(`   mới: "${r.moi.dienGiai}" | ghi chú: "${r.moi.ghiChu}"`);
        logLine(r.dry ? "   [DRY] khớp ngày — sẽ ghi đè 2 ô trên." : `   ✏️ ĐÃ SỬA dòng ${r.rowNum}`);
      } catch (e) { logLine(`   ✗ ${e?.message ?? e}`); process.exitCode = 1; }
      return;
    }
    // --requet chạy RIÊNG: chấm lại đúng mấy tin được nêu rồi dừng (lệnh sửa chữa chạy tay).
    if (requetIds.length) {
      logLine(`=== Chấm lại ${requetIds.length} tin theo luật hiện tại${dry ? " (DRY)" : ""} ===`);
      try { await requetPhase(requetIds); } catch (e) { logLine("✗ requet lỗi: " + (e?.message ?? e)); process.exitCode = 1; }
      return;
    }
    logLine(`=== Scanner NP chạy (${sinceISO ? `since=${sinceArg}` : `days=${all ? "all" : days}`}${limit ? `, limit=${limit}` : ""}${dry ? ", DRY" : ""}${nhacLaiLuot ? ", nhắc lại" : ""}) ===`);
    try { await scanPhase(); } catch (e) { logLine("✗ Bước quét lỗi: " + (e?.message ?? e)); process.exitCode = 1; }
    logLine(process.exitCode ? "=== Xong — CÓ LỖI (workflow sẽ đỏ) ===" : "=== Xong ===");
  })();
}
