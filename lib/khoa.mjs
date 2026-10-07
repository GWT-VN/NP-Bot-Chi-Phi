// Khoá liên tiến trình bằng mkdir (nguyên tử trên cùng máy). Vì sao (review 2026-10-07, M3): bot Discord và bot Zalo là HAI
// tiến trình cùng dựng cây chứng từ Drive — drive.mjs đếm thư mục con rồi +1 ("NN.") và liệt kê rồi mới tạo thư mục tháng —
// ghi cùng lúc thì trùng số / trùng thư mục. Chạy việc Drive dưới cùng một khoá thì lần lượt.
// Khoá bỏ lại quá `quaHan` (tiến trình chết giữa chừng) bị phá; chờ quá `cho` thì báo lỗi rõ thay vì treo.
import { mkdirSync, rmdirSync, statSync } from "node:fs";
import { dirname } from "node:path";

const ngu = (ms) => new Promise((r) => setTimeout(r, ms));

export async function voiKhoa(duong, viec, { cho = 120_000, quaHan = 300_000 } = {}) {
  const batDau = Date.now();
  for (;;) {
    try { mkdirSync(duong); break }
    catch (e) {
      if (e.code === "ENOENT") { mkdirSync(dirname(duong), { recursive: true }); continue } // máy mới: chưa có thư mục cha
      if (e.code !== "EEXIST") throw e;
      try { if (Date.now() - statSync(duong).mtimeMs > quaHan) { rmdirSync(duong); continue } } catch { continue } // vừa được nhả
      if (Date.now() - batDau > cho) throw new Error(`chờ khoá ${duong} quá ${Math.round(cho / 1000)}s — tiến trình khác đang ghi Drive`);
      await ngu(50 + Math.random() * 100);
    }
  }
  try { return await viec() } finally { try { rmdirSync(duong) } catch {} }
}
