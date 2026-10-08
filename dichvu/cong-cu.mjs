// Cổng công cụ MCP HTTP trong dịch vụ np-dichvu (spec 2026-10-08 §Gọi Claude). Mỗi việc một token riêng: token → việc → NHÓM.
// Công cụ KHÔNG nhận chat_id — tin bị cài lệnh cũng không khiến Claude ghi/gửi sang nhóm khác. Lệnh sổ chạy ngay trong dịch vụ
// nên chỉ MỘT tiến trình ghi Sheet/Drive cho Zalo (khoá Drive còn tạm vì bot Discord cũ — bỏ ở giai đoạn 2).
import http from "node:http";
import { randomBytes } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const ID_TIN = z.string().regex(/^\d{5,25}$/);
const tra = (kq) => ({ content: [{ type: "text", text: JSON.stringify(kq, null, 1) }], ...(kq?.ok === false ? { isError: true } : {}) });
const boc = (fn, khiLoi = () => {}) => async (a) => {
  try { return tra(await fn(a)) }
  catch (e) {
    khiLoi(e);
    return { content: [{ type: "text", text: `Lỗi hệ thống: ${String(e?.message ?? e).slice(0, 300)}. Có thể đã ghi một phần — gọi kiem_tin xem khoản đã vào sổ chưa trước khi thử lại; KHÔNG đoán.` }], isError: true };
  }
};

export function taoCongCu({ core, kho, hopThu, canhBao = { bao: () => {} }, nhatKy = () => {} }) {
  const phien = new Map(); // token → { viec_id, chat_id }

  function dangKy(s, { viec_id, chat_id }) {
    const bao = (noi_dung) => hopThu.xepGui({ chat_id, noi_dung, viec_id, loai: "da_ghi" });
    const cuaNhom = (id) => { const t = kho.lay(id); return t && t.chat_id === chat_id && !t.la_bot ? t : null };
    // Sheet/Drive ném lỗi khi ghi/sửa → người quản lý phải biết (spec §Vận hành), khoá theo nhóm để không lặp.
    const loiSo = (e) => canhBao.bao(`so_loi:${chat_id}`, `Ghi sổ lỗi ở nhóm ${chat_id}: ${String(e?.message ?? e).slice(0, 150)}`);
    s.registerTool("kiem_tin", { description: "Đọc lại 1 tin trong nhóm và chạy bộ đọc luật (chỉ tham chiếu): đã ghi sổ chưa, danh sách quỹ, gợi ý thiếu gì.",
      inputSchema: { message_id: ID_TIN } }, boc((a) => core.kiemTin({ chat_id, ...a })));
    s.registerTool("ghi_khoan", { description: "Ghi 1 khoản vào sổ theo giá trị BẠN chốt (đủ 5 ý: thu/chi, số tiền, ảnh, hoá đơn, quỹ). Đã hỏi và người gửi trả lời → xac_nhan_message_id = tin trả lời đó. Thành công thì dịch vụ tự báo ✅ trong nhóm.",
      inputSchema: { message_id: ID_TIN, loai: z.enum(["thu", "chi"]), so_tien: z.number().int().positive(), noi_dung: z.string().min(1).max(300),
        hoa_don: z.enum(["Có", "Không", "Chờ xuất"]), nguon_quy: z.string().max(60).optional(), ghi_chu: z.string().max(300).optional(),
        xac_nhan_message_id: ID_TIN.optional(), ngay: z.string().regex(/^\d{1,2}\/\d{1,2}\/\d{4}$/).optional() } },
    boc(async (a) => {
      const kq = await core.ghiKhoan({ chat_id, ...a });
      if (!kq?.ok) return kq;
      const m = kho.lay(a.message_id), anhLoi = (kq.canh_bao || []).some((x) => /ảnh/.test(x));
      bao(String(kq.da_ghi || "").startsWith("khoản này đã có") ? `✅ #${m?.ma} đã có trong sổ`
        : `✅ #${m?.ma} ${m?.ten || ""} · ${kq.da_ghi}${anhLoi ? " (chưa lưu được ảnh chứng từ — người quản lý kiểm tra)" : ""}`);
      if (anhLoi) canhBao.bao(`anh_loi:${a.message_id}`, `Khoản #${m?.ma} (nhóm ${chat_id}) đã ghi sổ nhưng chưa lưu được ảnh chứng từ lên Drive — kiểm tra.`);
      return { ...kq, da_bao_nhom: "dịch vụ đã tự báo ✅ trong nhóm — KHÔNG trả lời thêm" };
    }, loiSo));
    s.registerTool("sua_khoan", { description: "Sửa khoản ĐÃ ghi theo yêu cầu của CHÍNH người gửi khoản (yeu_cau_message_id = tin yêu cầu). Sửa số tiền thì kèm loai.",
      inputSchema: { message_id: ID_TIN, yeu_cau_message_id: ID_TIN, noi_dung: z.string().min(1).max(300).optional(), loai: z.enum(["thu", "chi"]).optional(),
        so_tien: z.number().int().positive().optional(), hoa_don: z.enum(["Có", "Không", "Chờ xuất"]).optional(), nguon_quy: z.string().max(60).optional() } },
    boc(async (a) => {
      const kq = await core.suaKhoan({ chat_id, ...a });
      if (kq?.ok) { const m = kho.lay(a.message_id); bao(`✏️ Đã sửa #${m?.ma} theo yêu cầu của ${m?.ten || "người gửi"}`) }
      return kq;
    }, loiSo));
    s.registerTool("doc_so", { description: "Đọc sổ của nhóm này (chỉ đọc): các dòng + tổng thu/chi, lọc theo ngày dd/mm/yyyy và loai.",
      inputSchema: { tu_ngay: z.string().optional(), den_ngay: z.string().optional(), loai: z.enum(["thu", "chi"]).optional() } },
    boc((a) => core.docSo({ chat_id, ...a })));
    s.registerTool("tra_loi", { description: "Gửi 1 tin vào nhóm của việc này. HỎI LẠI về một khoản → hoi_ve = message_id khoản đó. Chốt một khoản đang hỏi mà KHÔNG ghi sổ → bo_hoi = message_id khoản đó.",
      inputSchema: { text: z.string().min(1).max(6000), hoi_ve: ID_TIN.optional(), bo_hoi: ID_TIN.optional() } },
    boc(async ({ text, hoi_ve, bo_hoi }) => {
      for (const [ten, id] of [["hoi_ve", hoi_ve], ["bo_hoi", bo_hoi]]) if (id && !cuaNhom(id)) return { ok: false, ly_do: `${ten} phải là message_id một tin người dùng trong nhóm này` };
      hopThu.xepGui({ chat_id, noi_dung: text, hoi_ve: hoi_ve ?? null, viec_id, loai: "tra_loi" });
      if (bo_hoi) kho.boHoi(bo_hoi);
      return { ok: true };
    }));
  }

  // MCP Streamable HTTP không trạng thái: mỗi POST một McpServer gắn với việc của token (đo với SDK 1.32, 2026-10-08).
  const may = http.createServer(async (req, res) => {
    try {
      if (req.url !== "/mcp") { res.writeHead(404).end(); return }
      const p = phien.get(/^Bearer (\S+)$/.exec(req.headers.authorization || "")?.[1]);
      if (!p) { nhatKy({ cong_cu: "tu_choi_token" }); res.writeHead(401).end(); return }
      if (req.method !== "POST") { res.writeHead(405).end(); return }
      const s = new McpServer({ name: "np", version: "1.0.0" });
      dangKy(s, p);
      const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => { t.close(); s.close() });
      await s.connect(t);
      let body = "";
      for await (const c of req) body += c;
      await t.handleRequest(req, res, body ? JSON.parse(body) : undefined);
    } catch (e) {
      nhatKy({ cong_cu_loi: String(e?.message ?? e).slice(0, 200) });
      if (!res.headersSent) res.writeHead(500).end();
    }
  });

  return {
    moPhien: ({ id, chat_id }) => { const token = randomBytes(32).toString("hex"); phien.set(token, { viec_id: id, chat_id: String(chat_id) }); return token },
    dongPhien: (token) => { phien.delete(token) },
    nghe: (cong) => new Promise((ok, loi) => { may.once("error", loi); may.listen(cong, "127.0.0.1", () => ok(may.address().port)) }),
    dong: () => new Promise((ok) => { may.closeAllConnections?.(); may.close(() => ok()) }),
  };
}
