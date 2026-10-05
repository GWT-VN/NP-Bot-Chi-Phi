// Test tầng ghi sổ NP (offline, không mạng) — chạy: node test-books.mjs (exit 0 = đạt).
import assert from "node:assert/strict";
import { buildFundRow, localizeRows, laLocaleVi, viTriMaTin } from "./books.mjs";

let n = 0;
const t = (ten, fn) => { fn(); n++; console.log("  ✓ " + ten); };

t("dòng chi có hoá đơn đỏ: 12 cột A–L (Nguồn quỹ F, Mã tin L), Chi có số, Thu trống", () => {
  const r = buildFundRow({ loai: "chi", ngay: "2026-10-05", dienGiai: "Mua vật tư mẫu", nguoi: "Lan", hoaDon: "Có", nguonQuy: "Quỹ công ty", amount: 1250000, link: "https://drive/x", ghiChu: "dự án X", maTin: "1500" });
  assert.equal(r.length, 12);
  assert.deepEqual([r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[9], r[10], r[11]],
    ["=ROW()-1", "05/10/2026", "Mua vật tư mẫu", "Lan", "Có", "Quỹ công ty", "", 1250000, "https://drive/x", "dự án X", "1500"]);
});
t("dòng chi không khai hoá đơn → mặc định Không", () => {
  const r = buildFundRow({ loai: "chi", ngay: "2026-10-05", dienGiai: "Ship", amount: 45000 });
  assert.equal(r[4], "Không");
});
t("dòng thu: Hoá đơn '—', Thu có số, Chi trống", () => {
  const r = buildFundRow({ loai: "thu", ngay: "2026-10-05", dienGiai: "Hoàn cọc", amount: 2000000, hoaDon: "Có" });
  assert.equal(r[4], "—"); assert.equal(r[6], 2000000); assert.equal(r[7], "");
});
t("cột Tồn (I) = Σthu(G) − Σchi(H), dấu ngăn theo locale vi (;)", () => {
  const [row] = localizeRows([buildFundRow({ loai: "chi", ngay: "2026-10-05", dienGiai: "x", amount: 1 })], ";");
  assert.equal(row[8], "=SUM($G$2:INDEX($G:$G;ROW()))-SUM($H$2:INDEX($H:$H;ROW()))");
});
t("viTriMaTin: tìm dòng theo msgId ở cột L (không theo số dòng), bỏ dòng tiêu đề", () => {
  assert.equal(viTriMaTin([["Mã tin"], ["111"], [], ["222"]], "222"), 4);
  assert.equal(viTriMaTin([["Mã tin"], ["111"]], "999"), null);
});
t("laLocaleVi: chỉ nhận vi", () => {
  assert.equal(laLocaleVi("vi_VN"), true);
  assert.equal(laLocaleVi("vi"), true);
  assert.equal(laLocaleVi("en_US"), false);
  assert.equal(laLocaleVi(""), false);
  assert.equal(laLocaleVi(undefined), false);
});
console.log(`\n${n} test đạt`);
