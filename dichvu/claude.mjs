// Chạy `claude -p --bare` cho MỘT việc (spec 2026-10-08 §Gọi Claude). Đường dẫn chương trình truyền vào được — test dùng
// chương trình giả. Mỗi lần chạy là một nhóm tiến trình riêng: quá giờ / dịch vụ tắt thì giết cả nhóm, không để mồ côi.
import { spawn } from "node:child_process";

const CONG_CU = ["kiem_tin", "ghi_khoan", "sua_khoan", "doc_so", "tra_loi"].map((t) => `mcp__np__${t}`);

export function lenhClaude({ nguCanh, loiDan, model, maxTurns, cong, token, thuMucAnh }) {
  const mcp = { mcpServers: { np: { type: "http", url: `http://127.0.0.1:${cong}/mcp`, headers: { Authorization: `Bearer ${token}` } } } };
  return ["-p", nguCanh, "--bare", "--model", model, "--system-prompt", loiDan,
    // Quy tắc quyền cho đường dẫn tuyệt đối viết "//" ở đầu (Read(//Users/...)).
    "--tools", "Read", "--add-dir", thuMucAnh, "--allowedTools", [...CONG_CU, `Read(/${thuMucAnh}/**)`].join(","),
    // ponytail: token việc nằm trong tham số dòng lệnh (ps của cùng user thấy được); chỉ sống trong lúc việc chạy, chỉ nghe 127.0.0.1.
    "--mcp-config", JSON.stringify(mcp), "--strict-mcp-config", "--permission-mode", "dontAsk",
    "--max-turns", String(maxTurns), "--output-format", "json", "--no-session-persistence"];
}

export function phanLoai({ maThoat, stdout, stderr, quaGio }) {
  if (quaGio) return { ok: false, kieu: "qua_gio" };
  let j = null;
  try { j = JSON.parse(String(stdout).trim().split("\n").pop()) } catch {}
  if (maThoat === 0 && j?.subtype === "success" && !j.is_error) return { ok: true, kieu: "xong", luot: j.num_turns ?? null };
  const chu = `${j?.result ?? ""} ${stderr}`;
  if (/rate.?limit|usage limit|limit (reached|exceeded)/i.test(chu)) return { ok: false, kieu: "gioi_han" };
  if (/\b401\b|unauthori[sz]ed|authentication|invalid.{0,20}(token|api key)|oauth token|\/login/i.test(chu)) return { ok: false, kieu: "dang_nhap" };
  if (j?.subtype === "error_max_turns") return { ok: false, kieu: "het_luot" };
  return { ok: false, kieu: "loi", loi: chu.trim().slice(0, 300) || `mã thoát ${maThoat}` };
}

export function chayClaude({ chuongTrinh = "claude", args, env, cwd, thoiGianMs, signal = null }) {
  return new Promise((xong) => {
    if (signal?.aborted) return xong({ ok: false, kieu: "huy" });
    const p = spawn(chuongTrinh, args, { env, cwd, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "", quaGio = false, huy = false;
    const giet = () => { try { process.kill(-p.pid, "SIGKILL") } catch {} };
    const khiHuy = () => { huy = true; giet() };
    const hen = setTimeout(() => { quaGio = true; giet() }, thoiGianMs);
    signal?.addEventListener("abort", khiHuy, { once: true });
    const ket = (kq) => { clearTimeout(hen); signal?.removeEventListener("abort", khiHuy); xong(kq) };
    p.stdout.on("data", (c) => { out += c });
    p.stderr.on("data", (c) => { err += c });
    p.on("error", (e) => ket({ ok: false, kieu: "loi", loi: `không chạy được ${chuongTrinh}: ${e.code || e.message}` }));
    p.on("close", (ma) => ket(huy ? { ok: false, kieu: "huy" } : { ...phanLoai({ maThoat: ma, stdout: out, stderr: err, quaGio }), maThoat: ma }));
  });
}
