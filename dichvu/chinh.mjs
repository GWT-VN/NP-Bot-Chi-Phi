#!/usr/bin/env node
// Dịch vụ nền np-dichvu (spec 2026-10-08): launchd giữ sống (mac/cai-dichvu.sh). Một bản chạy duy nhất — giữ cổng MCP cố
// định; bản thứ hai không giữ được cổng thì thoát. Các vòng: nhận Zalo (long-poll) · worker (một việc/lúc) · hộp thư · bảo trì.
//   node dichvu/chinh.mjs              chạy dịch vụ (cần ~/Bots/.secrets/np-dichvu.env)
//   node dichvu/chinh.mjs --kiem-tra   in tình trạng (việc, gửi, lần nhận Zalo, nhóm chưa khai, cảnh báo) — không cần bí mật
//   node dichvu/chinh.mjs --gui-mau <chat_id>   bot gửi tin mẫu cú pháp vào nhóm đã khai, để trưởng nhóm GHIM
import { readFileSync, appendFileSync, mkdirSync, readdirSync, statSync, rmSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { moCsdl, taoKhoTin, nguonTinSoCore, datMoc, layMoc } from "./csdl.mjs";
import { taoAdapterZalo, xuLyLo } from "./zalo.mjs";
import { taoHopThu, taoCanhBao } from "./hop-thu.mjs";
import { lenhClaude, chayClaude } from "./claude.mjs";
import { taoCongCu } from "./cong-cu.mjs";
import { taoHangDoi } from "./hang-doi.mjs";
import { taoCoreThat } from "../mcp/npso.mjs";
import { taoApi } from "../zalo/api.mjs";

export const MAC_DINH_DICH_VU = { cong: 8790, model: "claude-sonnet-5-5", maxTurns: 12, thoiGianToiDaGiay: 240 };
const ngayVN = (t) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });

/** File KEY=VALUE (bỏ dòng trống / '#'). Thiếu khoá bắt buộc → lỗi nêu tên khoá, không in giá trị. */
export function docBiMat(file, batBuoc = ["ZALO_BOT_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN"]) {
  const ra = {};
  for (const dong of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(dong);
    if (m) ra[m[1]] = m[2];
  }
  const thieu = batBuoc.filter((k) => !ra[k]);
  if (thieu.length) throw new Error(`thiếu ${thieu.join(", ")} trong ${file}`);
  return ra;
}

export function thuMucDichVu(env = process.env) {
  const goc = env.NP_DICHVU_DIR || join(homedir(), "Bots", "np-dichvu");
  return { goc, csdl: join(goc, "np.sqlite"), anh: join(goc, "anh"), saoLuu: join(goc, "sao-luu"), chay: join(goc, "chay"), logs: join(goc, "logs"),
    cauHinhClaude: join(goc, "claude-cfg") };
}
export const fileBiMat = (env = process.env) => env.NP_BI_MAT || join(homedir(), "Bots", ".secrets", "np-dichvu.env");

/** config.json → cấu hình dịch vụ: nhóm Zalo thành `channels` cho so-core (kênh Discord không lọt vào); dichvu có mặc định. */
export function cauHinhDichVu(tat) {
  const z = tat.zalo || {};
  return { ...tat, channels: z.groups || {}, tenBot: z.tenBot || "", nhomVanHanh: z.nhomVanHanh || null, dichvu: { ...MAC_DINH_DICH_VU, ...(tat.dichvu || {}) } };
}

export const che = (s) => String(s).replace(/(Bearer\s+)[\w.~+/-]+=*/gi, "$1***").replace(/\b(token|key|secret)=[^&\s"]+/gi, "$1=***").replace(/sk-ant-[\w-]+/g, "sk-ant-***");

/** Nhật ký JSON từng dòng — CHỈ mã (việc, tin, nhóm, kiểu kết thúc), không nội dung tin, không bí mật. Không bao giờ ném lỗi. */
export function taoNhatKy(thuMuc, { now = Date.now } = {}) {
  return (suKien) => {
    try {
      const t = now();
      mkdirSync(thuMuc, { recursive: true });
      appendFileSync(join(thuMuc, `dichvu-${ngayVN(t)}.jsonl`), che(JSON.stringify({ ts: new Date(t).toISOString(), ...suKien })) + "\n");
    } catch {}
  };
}

export function taoBaoTri({ db, thuMuc, now = Date.now, giuSaoLuu = 14, giuNgay = 30 }) {
  return {
    /** Mỗi ngày một bản sao nhất quán (VACUUM INTO), giữ `giuSaoLuu` bản mới nhất. Đã có bản hôm nay → null. */
    saoLuu() {
      const file = join(thuMuc.saoLuu, `np-${ngayVN(now())}.sqlite`);
      if (existsSync(file)) return null;
      mkdirSync(thuMuc.saoLuu, { recursive: true });
      db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
      const ds = readdirSync(thuMuc.saoLuu).filter((f) => /^np-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort();
      for (const f of ds.slice(0, -giuSaoLuu)) rmSync(join(thuMuc.saoLuu, f));
      return file;
    },
    /** Ảnh tạm và nhật ký quá `giuNgay` ngày (chứng từ chính thức đã ở Drive). Trả số tệp đã xoá. */
    donCu() {
      let xoa = 0;
      for (const d of [thuMuc.anh, thuMuc.logs]) {
        let ds = [];
        try { ds = readdirSync(d) } catch { continue }
        for (const f of ds) { const p = join(d, f); try { if (now() - statSync(p).mtimeMs > giuNgay * 86400e3) { rmSync(p); xoa++ } } catch {} }
      }
      return xoa;
    },
  };
}

/** Tình trạng dịch vụ cho `--kiem-tra`. */
export function tomTat(db, now = Date.now()) {
  const dem = (bang) => Object.fromEntries(db.prepare(`SELECT trang_thai AS k, COUNT(*) AS n FROM ${bang} GROUP BY trang_thai`).all().map((r) => [r.k, r.n]));
  const phut = (luc) => (luc == null ? null : Math.round((now - luc) / 60e3));
  const cu = db.prepare("SELECT MIN(sau_luc) AS t FROM viec WHERE trang_thai='cho'").get()?.t ?? null;
  const moc = (tien) => db.prepare("SELECT khoa, luc, ghi_chu FROM moc WHERE khoa LIKE ? ORDER BY luc DESC").all(`${tien}%`);
  return {
    viec: dem("viec"), gui: dem("gui"),
    viec_qua_han_phut: cu != null && cu < now ? phut(cu) : 0,
    nhan_zalo_cach_phut: phut(layMoc(db, "nhan_zalo_ok")), claude_ok_cach_phut: phut(layMoc(db, "claude_ok")),
    nhom_chua_khai: moc("nhom_la:").map((r) => ({ chat_id: r.khoa.slice("nhom_la:".length), lan_cuoi_phut: phut(r.luc), ...JSON.parse(r.ghi_chu || "{}") })),
    canh_bao_gan_day: moc("canh_bao:").slice(0, 10).map((r) => ({ khoa: r.khoa.slice("canh_bao:".length), cach_phut: phut(r.luc) })),
  };
}

/** Tin mẫu cú pháp để trưởng nhóm GHIM (chủ dự án 2026-10-08). Zalo không cho đặt chữ mẫu mờ trong ô nhập (sendMessage chỉ có
 *  chat_id / text / parse_mode / text_styles), nên bot gửi tin mẫu: phần cú pháp in nghiêng + chữ nhỏ (Zalo không có màu xám). */
export function tinMau(cfg) {
  const mau = ["Thu/Chi - Số tiền - Nội dung - Tên quỹ", "VD: Chi - 50k - Nước khách - Tiền mặt"];
  const quy = (cfg.quy || []).map((q) => q.ten.replace(/^GWT - /, "")).join(" · ");
  const text = [`📌 Báo chi phí: 1 ảnh bill, chú thích bắt đầu bằng tag @${cfg.zalo?.tenBot || "Bot"}`, ...mau, ...(quy ? [`Quỹ: ${quy}`] : [])].join("\n");
  return { text, text_styles: mau.map((d) => ({ start: text.indexOf(d), len: d.length, st: ["i", "f_13"] })) }; // chỉ số JS = UTF-16 như Zalo
}

export async function taoDichVu({ cfgTat, biMat, thuMuc, api, loiDan, chuongTrinhClaude = "claude", taiFn = fetch, now = Date.now,
  taoCore = (cfg, nguonTin) => taoCoreThat({ cfg, nguonTin }) }) {
  const cfg = cauHinhDichVu(cfgTat);
  for (const d of [thuMuc.anh, thuMuc.chay, thuMuc.logs, thuMuc.saoLuu]) mkdirSync(d, { recursive: true });
  const db = moCsdl(thuMuc.csdl);
  const nhatKy = taoNhatKy(thuMuc.logs, { now });
  const kho = taoKhoTin(db, { tenBot: cfg.tenBot });
  const core = await taoCore(cfg, nguonTinSoCore(kho));
  let canhBao = null;
  const hopThu = taoHopThu({ db, kho, api, nhatKy, baoLoi: (k, s) => canhBao.bao(k, s), now });
  canhBao = taoCanhBao({ db, hopThu, nhomVanHanh: cfg.nhomVanHanh, nhatKy, now });
  const congCu = taoCongCu({ core, kho, hopThu, canhBao, nhatKy });
  const adapter = taoAdapterZalo({ db, kho, nhom: cfg.channels, nhomVanHanh: cfg.nhomVanHanh, thuMucAnh: thuMuc.anh, taiFn, nhatKy, now });
  const ac = new AbortController();
  let cong = null;
  const chay = ({ nguCanh, token }) => chayClaude({ chuongTrinh: chuongTrinhClaude,
    args: lenhClaude({ nguCanh, loiDan, model: cfg.dichvu.model, maxTurns: cfg.dichvu.maxTurns, cong, token, thuMucAnh: thuMuc.anh }),
    // Thư mục cấu hình Claude RIÊNG, trống: không CLAUDE.md / plugin / hook / memory / đăng nhập của máy (thay --bare, vốn
    // không đọc token gói claude.ai). Đăng nhập chỉ bằng token setup-token.
    env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: "en_US.UTF-8", CLAUDE_CONFIG_DIR: thuMuc.cauHinhClaude,
      CLAUDE_CODE_OAUTH_TOKEN: biMat.CLAUDE_CODE_OAUTH_TOKEN },
    cwd: thuMuc.chay, thoiGianMs: cfg.dichvu.thoiGianToiDaGiay * 1000, signal: ac.signal });
  const hangDoi = taoHangDoi({ db, kho, core, congCu, hopThu, canhBao, nhom: cfg.channels, tenBot: cfg.tenBot,
    dsQuy: (cfg.quy || []).map((x) => x.ten), chay, nhatKy, now });
  const baoTri = taoBaoTri({ db, thuMuc, now });
  let dung = false;
  const vong = [];
  let loDangXuLy = Promise.resolve();
  const ngu = async (ms) => { const het = Date.now() + ms; while (!dung && Date.now() < het) await new Promise((r) => setTimeout(r, Math.min(100, het - Date.now()))) };
  const lap = async (ten, buoc, nghi) => {
    while (!dung) {
      let co = false;
      try { co = await buoc() } catch (e) { nhatKy({ vong: ten, loi: String(e?.message ?? e).slice(0, 200) }) }
      if (!co) await ngu(nghi);
    }
  };
  return {
    db, kho,
    async batDau({ cong: c = cfg.dichvu.cong } = {}) {
      cong = await congCu.nghe(c); // bản thứ hai: EADDRINUSE → main thoát
      hangDoi.khoiPhuc();
      datMoc(db, "nhan_zalo_ok", now()); // Zalo hỏng ngay từ đầu vẫn bị cảnh báo sau 5 phút
      await adapter.taiAnhConDo();
      // Vòng long-poll KHÔNG vào `vong`: nó có thể treo tới 30s chờ Zalo, tắt thì không chờ nó (cờ `dung` chặn trước khi chạm
      // CSDL) — chỉ chờ lô tin đang xử lý dở (`loDangXuLy`).
      lap("nhan", async () => {
        const ds = await api.layCapNhat();
        if (dung) return true;
        loDangXuLy = xuLyLo(ds, adapter.nhan, nhatKy);
        await loDangXuLy;
        datMoc(db, "nhan_zalo_ok", now());
        return true;
      }, 5000);
      vong.push(lap("viec", hangDoi.chayMot, 1000));
      vong.push(lap("gui", hopThu.guiMot, 500));
      vong.push(lap("bao_tri", async () => { baoTri.saoLuu(); baoTri.donCu(); canhBao.kiemDinhKy({ tokenNgayTao: biMat.CLAUDE_TOKEN_NGAY_TAO }); return false }, 600_000));
      nhatKy({ khoi_dong: true, cong });
      return cong;
    },
    async dung() {
      dung = true;
      ac.abort(); // giết lượt Claude đang chạy; việc về 'cho', lần sau chạy lại
      await congCu.dong();
      // Chờ hết lượt việc / lượt gửi / lô tin đang dở rồi mới đóng CSDL — đóng giữa chừng thì tin đã tới nhóm mà CSDL không ghi,
      // bật lại gửi trùng (review cuối I1). Lâu nhất ≈ 15s (giờ chờ sendMessage); launchd chờ 20s trước khi SIGKILL.
      await Promise.allSettled([...vong, loDangXuLy]);
      db.close();
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const GOC = dirname(dirname(fileURLToPath(import.meta.url)));
  const thuMuc = thuMucDichVu();
  if (process.argv.includes("--kiem-tra")) {
    const db = moCsdl(thuMuc.csdl);
    console.log(JSON.stringify(tomTat(db), null, 2));
    db.close();
    process.exit(0);
  }
  if (process.argv.includes("--gui-mau")) {
    const chat = process.argv[process.argv.indexOf("--gui-mau") + 1], cfgTat = JSON.parse(readFileSync(join(GOC, "config.json"), "utf8"));
    if (!Object.prototype.hasOwnProperty.call(cfgTat.zalo?.groups || {}, chat)) { console.error(`nhóm "${chat}" chưa khai trong config.json zalo.groups`); process.exit(1) }
    const api = taoApi({ token: docBiMat(fileBiMat(), ["ZALO_BOT_TOKEN"]).ZALO_BOT_TOKEN, ...(process.env.ZALO_API_GOC ? { goc: process.env.ZALO_API_GOC } : {}) });
    await api.goi("sendMessage", { chat_id: chat, ...tinMau(cfgTat) });
    console.log("đã gửi tin mẫu — trong Zalo giữ tin đó, chọn Ghim");
    process.exit(0);
  }
  const biMat = docBiMat(fileBiMat());
  const cfgTat = JSON.parse(readFileSync(join(GOC, "config.json"), "utf8"));
  const loiDan = readFileSync(join(GOC, "dichvu", "loi-dan.md"), "utf8");
  const api = taoApi({ token: biMat.ZALO_BOT_TOKEN, ...(process.env.ZALO_API_GOC ? { goc: process.env.ZALO_API_GOC } : {}) });
  const dv = await taoDichVu({ cfgTat, biMat, thuMuc, api, loiDan, chuongTrinhClaude: process.env.NP_CLAUDE || "claude" });
  try { await dv.batDau() }
  catch (e) { console.error(e?.code === "EADDRINUSE" ? "cổng MCP đang bị một bản np-dichvu khác giữ — thoát" : `không khởi động được: ${e?.message ?? e}`); process.exit(1) }
  const tat = async () => { await dv.dung(); process.exit(0) };
  process.on("SIGTERM", tat);
  process.on("SIGINT", tat);
}
