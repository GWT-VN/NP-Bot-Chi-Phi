// Test parser sổ chi phí NP — chạy: node test-parser.mjs (exit 0 = đạt, 1 = hỏng). Chép từ bản gốc @da1b637.
// Mỗi ca gắn nhãn FIX-* = bản sửa mà ca đó bảo vệ. Gỡ fix → ca đó PHẢI hỏng (red-green).
import { parseEntry, detectHoaDon, route, repText, phanLoaiReply, nenRep } from "./scanner.mjs";

// MẶC ĐỊNH hasDirectImg:true cho mọi ca — từ 2026-08-14 khoản phải kèm ảnh chứng từ mới ghi (xem nhóm ẢNH-*),
// nên hình dạng "khoản thật" là CÓ ảnh. Ca nào muốn kiểm chính luật ảnh thì tự truyền hasDirectImg:false.
const P = (t) => {
  const o = typeof t === "string" ? { content: t } : t;
  const r = parseEntry({ content: o.content, date: "2026-07-15", images: [], hasDirectImg: o.hasDirectImg ?? true });
  return r.skip ? (r.silent ? "SILENT" : "WARN") : r.amount;
};

// Cấu hình kênh THẬT (chép từ channels.json) — route() chỉ đọc cfg + _books, không đụng mạng.
// Kênh NP = luồng tiền tố của kênh chị Trang. Giữ TÊN biến CFG_TRANG để các mảng ca chép nguyên từ bản gốc.
const CFG_TRANG = { name: "new-projects", route: "fund", book: "np", loaiTuTienTo: true };
// Ca của quỹ chị Hiền KHÔNG áp cho NP. Giữ nguyên trong mảng (diff với bản gốc thẳng hàng) nhưng LỌC BỎ lúc chạy.
const CFG_HIEN_CHI = { hien: true };
const laNP = (row) => !row.some((x) => x && x.hien);
// `t` là chuỗi content, HOẶC object { content, images } khi ca cần ảnh (vd ảnh bill không số).
const item = (cfg, t) => {
  const o = typeof t === "string" ? { content: t } : t;
  // hasDirectImg mặc định TRUE (xem chú thích ở P): ca truyền `images` tự nó đã là "có ảnh"; ca muốn kiểm
  // luật thiếu-ảnh truyền hasDirectImg:false tường minh.
  return { content: o.content, date: "2026-07-15", images: o.images ?? [], hasDirectImg: o.hasDirectImg ?? true,
    cfg, authorId: "123", author: "Nhân viên" };
};
// Trả tên TAB được ghi vào, hoặc "WARN-parse" / "WARN-route:<mã lý do>" nếu không ghi (⚠️ + rep).
// CỐ Ý assert cả LÝ DO, không gộp thành "WARN" trơn: ca ROUTE-hd-mơ-hồ kênh Trang xanh kể cả khi tin ⚠️ vì
// lý do KHÁC (vd thiếu tiền tố 'thu:'/'chi:') chứ không phải vì hóa đơn → lưới thủng, ca không kiểm cái nó khai.
// Mã lý do = phần trước dấu ':' của reason (route đã tự đặt tiền tố: "hóa đơn khai chưa rõ" · "kênh Trang" · …).
const R = (cfg, t) => {
  const it = item(cfg, t);
  const p = parseEntry(it);
  if (p.skip) return "WARN-parse";
  const rt = route(it, p);
  return rt.skip ? `WARN-route:${rt.reason.split(":")[0]}` : rt.tab;
};
// Câu kết BẮT BUỘC của mọi tin rep.
const TAIL = "Sửa thẳng tin này trong vòng 7 ngày là bot tự ghi sổ, không cần gửi lại.";
// Đi từ tin → route → repText: reason lấy TỪ route (không chép chuỗi) nên ca này bắt được cả lỗi
// lệch tiền tố giữa reason và repText — lệch là rơi vào `else how = reason`, nhổ chữ kỹ thuật vào mặt người dùng.
const REP = (cfg, t) => {
  const it = item(cfg, t);
  const p = parseEntry(it);
  const rt = p.skip ? p : route(it, p);
  if (!rt.skip) return "KHÔNG-⚠️";
  const txt = repText(it.authorId, rt.reason);
  if (txt.includes(rt.reason)) return "NHỔ-CHỮ-KỸ-THUẬT";
  if (!txt.endsWith(TAIL)) return "THIẾU-CÂU-KẾT";
  return "OK";
};

// [nhãn, đầu vào, mong đợi]
const CASES = [
  // ── Nền: 1 số tiền, không được đổi hành vi ──
  ["base", "Mua mực in 350k", 350000],
  ["base", "Mua đồ 350.000", 350000],
  ["base", "Mua đồ 1tr5", 1500000],
  ["base", "Mua đồ 720.000đồng", 720000],
  ["base", "Nạp quỹ 1 tỷ", 1000000000],
  ["base", "Mua đồ 2m", 2000000],
  // Số TRẦN + không ảnh = tin trò chuyện → im (luật MONEY_ANY chặn SĐT/STK bị đọc thành tiền).
  ["base", { content: "Mua đồ 350000", hasDirectImg: false }, "SILENT"],
  ["base", "Mua 3 hộp giá 250k", 250000],

  // ── FIX-A: lookahead chữ Việt cho đuôi "đ" ("2 đơn" ≠ 2đ, "2 mét" ≠ 2 triệu) ──
  ["FIX-A", "Ship 2 đơn 45.000đ", 45000],
  ["FIX-A", "Mua 2 mét vải 350k", 350000],

  // ── FIX-G: dấu cách KHÔNG ngăn nghìn — "a02 106k" từng gom thành "02 106" = 2106đ (tin thật) ──
  ["FIX-G", "Em mua thêm keo để dán cảm biển tủ a02 106k ạ", 106000],
  ["FIX-G", "Mua tủ 02 106k", 106000],
  ["FIX-G", "Mua keo tủ a02 106.000đ", 106000],

  // ── FIX-B: BỎ gộp trùng — số lặp lại là khoản thật, không phải trùng ──
  ["FIX-B", "Em xin duyệt tiền ăn trưa 23: 130k 25: 130k 27: 130k", "WARN"],
  ["FIX-B", "30/3: 130k 31/3: 130k", "WARN"],

  // ── FIX-C: ≥2 số + có "tổng" → lấy số tổng (câu thật từ kênh cũ) ──
  ["FIX-C", "Em xin duyệt chi phí thuê stu tổng 985k đã cọc 250k còn 735k (bên stu lấy 730k) ạ", 985000],
  ["FIX-C", "Lắp máy CTS20 Hải Phòng: 300k công + 100k van, tổng 400k", 400000],
  ["FIX-C", "Xe xuống Hạ Long đi 340k về 280k, tổng cộng 620k", 620000],

  // ── FIX-D: dùng pick.amount (số tổng) chứ KHÔNG phải found.amount (số điểm cao nhất) ──
  // Bẫy: thành phần có đuôi "đ" nên thắng điểm, tổng thì không → nếu trả found.amount sẽ ra 300000.
  ["FIX-D", "Lắp máy 300.000đ công + 100k van, tổng 400k", 400000],
  ["FIX-D", "Mua hàng giảm từ 500k, tổng 400k", 400000],

  // ── Nhiều số KHÔNG có "tổng" → ⚠️, bot KHÔNG tự cộng, KHÔNG tự chọn (câu thật) ──
  ["no-guess", "Em xin duyệt chi phí xe xuống Hạ Long đi 340k về 280k ạ .", "WARN"],
  ["no-guess", "Em xin duyệt chi phí lắp máy CTS20 ở Hải Phòng: 300k công + 100k van khoá cấp", "WARN"],
  ["no-guess", "Em xin duyệt chi phí nạp tiền vào số 033. Nạp 200.000đ nhưng thực tế nạp 196.000đ", "WARN"],
  ["no-guess", "Mua đồ 350k, ship 250.000đ", "WARN"],

  // ── THIẾU-nội-dung (11/08/2026): tin CHỈ có số tiền, không diễn giải → ⚠️, KHÔNG ghi bừa dòng
  //    "(không rõ nội dung)". Ca thật: khoản van giảm áp bị tách tin — mô tả+ảnh ⚠️ (thiếu số),
  //    "210k" trơ một tin. Chặn để nửa số tiền cũng ⚠️ rõ, buộc gộp số+nội dung vào MỘT tin. ──
  ["THIẾU-nội-dung", "210k", "WARN"],
  ["THIẾU-nội-dung", "500.000đ", "WARN"],
  ["THIẾU-nội-dung", "1tr5", "WARN"],
  // Chiều ngược: CÓ mô tả (dù ngắn) đi kèm số → vẫn ghi như cũ, KHÔNG đoán "ngắn quá là thiếu".
  ["THIẾU-nội-dung-contrast", "vật tư van giảm áp 3c 210k", 210000],
  ["THIẾU-nội-dung-contrast", "Mua đồ 350k", 350000],
];

// [nhãn, đầu vào, mong đợi] cho detectHoaDon — 3 trạng thái: "Có" · "Không" · "mơ hồ".
const HD_CASES = [
  // ── HD-khẳng-định: chữ "có" NGAY TRƯỚC, không bị phủ định → Có ──
  ["HD-khẳng-định", "mua mực 25k có hóa đơn", "Có"],
  ["HD-khẳng-định", "Mua bánh 100k, đã có hóa đơn", "Có"],
  ["hd", "Mua mực in 720.000đ (Từ quỹ TM c Trang cầm, có hoá đơn)", "Có"],
  ["hd", "<@123> có HĐ em nhé, pancake 350k", "Có"],

  // ── HD-có-động-từ: "có" bị 1–2 ĐỘNG TỪ trong danh sách hẹp chen giữa vẫn là khẳng định rõ.
  //    Ca thật 29/07/2026 (tin 1531862203400192102): người gõ khai đúng ý "đã có hóa đơn" mà bot xếp
  //    mơ hồ chỉ vì chữ "xuất" đứng chen — khoản 11 triệu treo, không phải lỗi người gõ.
  ["HD-có-động-từ", "Chi Hoàn lại cho anh Minh Tita Art thanh toán lõi lọc có xuất hđ - 11.085.000đ", "Có"],
  ["HD-có-động-từ", "Mua mực 25k có lấy hóa đơn", "Có"],
  ["HD-có-động-từ", "Mua mực 25k có nhận hóa đơn", "Có"],
  ["HD-có-động-từ", "Mua mực 25k có đính kèm hóa đơn", "Có"],
  ["HD-có-động-từ", "Mua mực 25k có đủ hóa đơn", "Có"],
  // Phủ định vẫn THẮNG dù có động từ chen — xét phủ định trước là bất biến, đừng đảo.
  ["HD-có-động-từ-phủ-định", "Mua mực 25k chưa có xuất hđ", "Không"],
  ["HD-có-động-từ-phủ-định", "Mua giấy 350k không có lấy hóa đơn", "Không"],
  // ── HD-có-động-từ-KHÔNG-nới-bừa: động từ NGOÀI danh sách → vẫn mơ hồ. Đây là hàng rào giữ lại đúng
  //    ca mất tiền của luật cũ: chỉ cần đổi thành "có nằm trong 3 chữ trước" là hai ca dưới thành "Có"
  //    + ✅ im lặng → khoản KHÔNG bill vào mục "CÓ-HĐ chưa hoàn" → công ty hoàn tiền cho khoản không có bill.
  ["HD-có-động-từ-KHÔNG-nới-bừa", "Mua bánh 100k có mua hàng, hóa đơn về sau", "mơ hồ"],
  ["HD-có-động-từ-KHÔNG-nới-bừa", "Mua bánh 100k có hỏi rồi, hóa đơn về sau", "mơ hồ"],
  ["HD-có-động-từ-KHÔNG-nới-bừa", "Mua bánh 100k có dặn shop, hóa đơn chưa lấy", "mơ hồ"],

  // ── HD-phủ-định: phủ định trong ≤3 chữ trước → Không. BẪY: "không có hóa đơn" CHỨA "có hóa đơn"
  //    → phải xét phủ định TRƯỚC khẳng định, nếu không ra "Có" = lỗi ngược chiều (mất khoản chờ hoàn ứng).
  ["HD-phủ-định", "Mua giấy 350k không có hóa đơn", "Không"],
  ["HD-phủ-định", "Mua giấy 350k chưa lấy hóa đơn", "Không"],
  ["FIX-F", "nhóm này đổi thành xin duyệt chi phí ko hđ 350k", "Không"],
  ["FIX-F", "Mua giấy 350k chưa xuất hoá đơn", "Không"],
  ["FIX-F", "Mua giấy 350k không xuất hóa đơn", "Không"],

  // ── HD-không-nhắc: mặc định Không ──
  ["hd", "Mua giấy 15.000đ", "Không"],
  ["hd", "Mua màn hình HD 350k", "Không"],
  ["hd", "Mua giấy 350k", "Không"],

  // ── HD-mơ-hồ: nhắc "hóa đơn"/"hđ" ở MỌI dạng khác → không đoán, route ⚠️ hỏi lại.
  //    Luật CŨ ("nhắc là Có") đọc hết nhóm này thành Có + ✅ im lặng → khoản KHÔNG có hóa đơn lọt vào mục
  //    "CÓ-HĐ chưa hoàn" của báo cáo → công ty đòi hoàn tiền cho khoản không có bill.
  ["HD-mơ-hồ", "Mua bánh 100k, quên xin hóa đơn", "mơ hồ"],
  ["HD-mơ-hồ", "Mua mực in 720.000đ, hóa đơn để quên ở cửa hàng", "mơ hồ"],
  ["HD-mơ-hồ", "hóa đơn 500k", "mơ hồ"],
  ["HD-mơ-hồ", "Mua bánh 100k, đang chờ hóa đơn", "mơ hồ"],
  ["HD-mơ-hồ", "Mua bánh 100k, hóa đơn về sau", "mơ hồ"],
  // Phủ định đứng SAU / ở quá xa → KHÔNG còn bị đọc thành "Có" (biên đo được của luật cũ), nhưng cũng
  // không đủ rõ để kết luận "Không" → mơ hồ, hỏi lại.
  ["HD-mơ-hồ", "Mua bánh 100k, hóa đơn chưa lấy", "mơ hồ"],
  ["HD-mơ-hồ", "Mua bánh 100k, không kịp đi xin hóa đơn", "mơ hồ"],
  // Dạng TRẦN (nhắc suông, không "có"/không phủ định). LUẬT ĐỔI: cũ = "Có" (nhãn FIX-E), nay = mơ hồ.
  ["HD-mơ-hồ", "Nạp 200.000đ nhưng thực tế nạp 196.000đ. Đã nhận được hoá đơn", "mơ hồ"],
  ["HD-mơ-hồ", "16/5/2026 Hoá đơn mua bánh sn Hoà 350k", "mơ hồ"],
  // Nhắc NHIỀU lần mà không cùng một nghĩa → không đoán bên nào thắng.
  ["HD-mơ-hồ", "Mua mực 25k có hóa đơn, hóa đơn về sau", "mơ hồ"],

  // ── HD-trần-không-phủ-quyết (Dũng chốt 2026-08-14): lần nhắc TRỐNG TRƠN ("xuất hđ") KHÔNG được phủ quyết
  //    một lần khai RÕ "có hóa đơn" trong cùng tin. Ca THẬT: DPLinh gõ "…324k xuất hđ ạ. Có Hóa đơn", đã SỬA
  //    tin đúng như lời bot dặn mà vẫn ⚠️ → khoản treo vĩnh viễn, bot dặn một đằng chấm một nẻo.
  ["HD-trần-không-phủ-quyết", "Chị ơi hỗ trợ em tiền nhà nghỉ vs a 324k xuất hđ ạ. Có Hóa đơn", "Có"],
  ["HD-trần-không-phủ-quyết", "Mua mực 25k hóa đơn 500k, có hóa đơn", "Có"],
  // Một mình lần nhắc TRẦN thì VẪN mơ hồ — không có lời khai rõ nào để mà bảo vệ.
  ["HD-trần-một-mình-vẫn-mơ-hồ", "324k xuất hđ ạ", "mơ hồ"],
  ["HD-trần-một-mình-vẫn-mơ-hồ", "hóa đơn 500k", "mơ hồ"],
  // ── HD-treo-VẪN-phủ-quyết: lần nhắc có dấu hiệu hóa đơn CHƯA CẦM ĐƯỢC thì vẫn thắng lời khai rõ (đây là
  //    mâu thuẫn THẬT). Đây là hàng rào giữ lại ca mất tiền — nới hỏng chỗ này là khoản không bill vào mục
  //    "CÓ-HĐ chưa hoàn". Quét từ treo ở CẢ HAI phía chỗ nhắc.
  ["HD-treo-VẪN-phủ-quyết", "Mua mực 25k có hóa đơn, hóa đơn gửi bổ sung", "mơ hồ"],
  ["HD-treo-VẪN-phủ-quyết", "Mua mực 25k có hóa đơn, hóa đơn tuần tới", "mơ hồ"],
  ["HD-treo-VẪN-phủ-quyết", "Mua mực 25k có hóa đơn, đang chờ hóa đơn", "mơ hồ"],
  ["HD-treo-VẪN-phủ-quyết", "Mua mực 25k có hóa đơn, hóa đơn chưa lấy", "mơ hồ"],
  ["HD-treo-VẪN-phủ-quyết", "Mua mực 25k có hóa đơn, quên xin hóa đơn", "mơ hồ"],
  // Phủ định vẫn thắng tuyệt đối, kể cả khi tin có cụm khai rõ (mâu thuẫn → hỏi lại).
  ["HD-phủ-định-vẫn-thắng", "Mua mực 25k có hóa đơn nhưng ko hđ đâu", "mơ hồ"],

  // ── HD-dấu-câu: dấu câu DÍNH chữ, thiếu đúng 1 dấu cách. Không có ca nào phủ → lỗi sống sót qua cả TDD.
  //    Cũ: split(/\s+/) TRƯỚC rồi mới strip dấu câu → "350k,không" là MỘT token, strip ra "350kkhông",
  //    NEG_WORD không khớp → rơi xuống nhánh `before[last] === "có"` → "Có" + ✅ IM LẶNG. Khoản KHÔNG có bill
  //    lọt vào mục "CÓ-HĐ chưa hoàn" của DM → công ty hoàn tiền cho khoản không hề có hóa đơn. Tệ hơn: bản
  //    ghim dạy chính cụm "không có hóa đơn" làm lối thoát an toàn → người làm ĐÚNG lời dặn, thiếu 1 dấu
  //    cách, mất tiền, không một cảnh báo. Nay: strip dấu câu TRƯỚC khi split (dấu câu → dấu cách).
  ["HD-dấu-câu", "Mua giấy 350k,không có hóa đơn", "Không"],
  ["HD-dấu-câu", "Mua giấy 350k.Không có hóa đơn", "Không"],
  ["HD-dấu-câu", "Mua giấy 350k-không có hóa đơn", "Không"],
  // Dấu câu unicode (nằm NGOÀI lớp \wà-ỹ nên cũng phải thành dấu cách): en dash · em dash · ba chấm.
  ["HD-dấu-câu", "Mua giấy 350k–không có hóa đơn", "Không"],
  ["HD-dấu-câu", "Mua giấy 350k—không có hóa đơn", "Không"],
  ["HD-dấu-câu", "Mua giấy 350k…không có hóa đơn", "Không"],
  ["HD-dấu-câu", "Mua giấy 350k (chưa lấy hóa đơn)", "Không"],
  // Chiều ngược: dấu câu dính chữ KHÔNG được biến khẳng định rõ thành "mơ hồ" (ồn, ma sát đúng cụm bản ghim dạy).
  ["HD-dấu-câu", "Mua mực 25k,có hóa đơn", "Có"],
  ["HD-dấu-câu", "Mua mực 25k (có hóa đơn)", "Có"],
  // Gạch dưới NẰM TRONG \w → lớp [^\wà-ỹ\s] KHÔNG strip nó, "_không" trượt NEG_WORD → "Có" (y hệt lỗi dấu
  // câu ở trên, cùng chế độ mất tiền). Không phải chuyện lý thuyết: `_x_` là cú pháp IN NGHIÊNG của Discord.
  // → lớp giữ chữ phải đánh vần [0-9a-zà-ỹ], KHÔNG mượn \w.
  ["HD-gạch-dưới", "Mua giấy 350k _không có hóa đơn_", "Không"],
  ["HD-gạch-dưới", "Mua giấy 350k __không có hóa đơn__", "Không"],
  ["HD-gạch-dưới", "Mua mực 25k *có hóa đơn*", "Có"],
];

// [nhãn, đầu vào, quy mong đợi ("CONFLICT" nếu phải ⚠️)]
const QUY_CASES = [
  ["QUY-khai", "Mua mực in 720k tạm ứng", "tamung"],
  ["QUY-khai", "Mua giấy 350k sổ tiền mặt", "tienmat"],
  ["QUY-hd", "Mua mực in 720k có hóa đơn", "tamung"],
  ["QUY-hd", "Mua mực in 720k có HĐ", "tamung"],
  ["QUY-hd", "Mua giấy 350k không có hóa đơn", "tienmat"],
  ["QUY-hd", "Mua giấy 350k ko hđ", "tienmat"],
  ["QUY-mặc-định", "Mua giấy 350k", "tienmat"],
  ["QUY-mặc-định", "Nước uống + đồ vặt văn phòng 180.000đ", "tienmat"],
  ["QUY-TM-trần", "Chi từ quỹ TM 350k", "tienmat"],
  ["QUY-TM-trần", "Chị cho em xin ứng thêm quỹ TM 5tr", "tienmat"],
  ["QUY-mâu-thuẫn", "Mua mực in 720k sổ tiền mặt có hóa đơn", "CONFLICT"],
  ["QUY-mâu-thuẫn", "Mua giấy 350k tạm ứng không hóa đơn", "CONFLICT"],
  // Hóa đơn khai MƠ HỒ không được kích hoạt lớp A. route() đã chặn "mơ hồ" TRƯỚC khi gọi detectQuy nên
  // nhánh này không tới trong luồng thật (ca route ở ROUTE_CASES) — ca dưới canh chính lớp A: nó phải đọc
  // `hd === "Có"`, không phải `hd !== "Không"`. Viết lỏng thành `!== "Không"` là "mơ hồ" lại trượt vào
  // Sổ tạm ứng y như luật cũ, lần này còn im lặng hơn vì route tưởng đã lọc sạch.
  ["QUY-hd-mơ-hồ", "Mua giấy 350k, đã nhận hoá đơn", "tienmat"],

  // ── QUY-không-bắt-nhầm: "tâm"/"tiên" là từ tiếng Việt ĐÚNG chính tả, độc lập, thông dụng — không phải
  // biến thể gõ sai của "tạm"/"tiền". Lớp ký tự KHÔNG được nới thêm â/ê vì sẽ đọc nhầm các câu này (xem
  // báo cáo lùi commit 254c8f4 — 5 phản ví dụ chứng minh nới lớp ký tự gây regression nặng hơn lỗi nó vá).
  ["QUY-không-bắt-nhầm", "Chi phí quảng cáo trung tâm ứng dụng 2tr", "tienmat"],
  ["QUY-không-bắt-nhầm", "Quan tâm ứng viên tuyển dụng 350k", "tienmat"],
  ["QUY-không-bắt-nhầm", "Yên tâm ứng trước 350k", "tienmat"],
  ["QUY-không-bắt-nhầm", "Mua giấy 350k, ưu tiên mặt hàng có hóa đơn", "tamung"],
  ["QUY-không-bắt-nhầm", "Thuê ưu tiên mặt bằng 5tr có hóa đơn", "tamung"],

  // ── QUY-lỗ-hổng-đã-biết: lỗ hổng CỐ Ý CHẤP NHẬN. Gõ sai dấu Telex rơi phím tone cuối ("tiền"→"tiên",
  // "tạm"→"tâm") khiến bot KHÔNG nhận ra lời khai quỹ, và rơi về xử lý mặc định/một-chiều thay vì đúng ý
  // người gõ. Từng thử vá bằng cách nới lớp ký tự ([aạ]→[aạâ], [eề]→[eềê]) ở commit 254c8f4, nhưng bản vá
  // đó bắt nhầm CẢ tiếng Việt viết ĐÚNG chính tả ("trung tâm ứng dụng", "thuê mặt bằng" — xem nhóm
  // QUY-không-bắt-nhầm ở trên), tức đổi lỗ hổng hiếm-cần-gõ-sai lấy lỗi phổ biến-với-từ-đúng. Đã lùi vá.
  // → Chấp nhận: gõ sai dấu thì bot có thể đọc nhầm quỹ (cần ⚠️ tay soát lại), đổi lấy việc không đọc
  // nhầm câu tiếng Việt đúng chính tả.
  ["QUY-lỗ-hổng-đã-biết", "Mua mực in 720k tiên mặt có hóa đơn", "tamung"],
  ["QUY-lỗ-hổng-đã-biết", "Mua giấy 350k tâm ứng", "tienmat"],
];

// [nhãn, cfg kênh, đầu vào, tab mong đợi | "WARN"] — end-to-end parseEntry → route.
const ROUTE_CASES = [
  // ── ROUTE-hd-mơ-hồ: hóa đơn khai chưa rõ → KHÔNG ghi ở CẢ HAI kênh. Kênh Trang không tách quỹ nhưng
  //    VẪN ghi cột Hóa đơn → cũng phải chặn (2 ca hỏng có thật, đo bằng code, ở task-10-brief).
  ["ROUTE-hd-mơ-hồ", CFG_TRANG, "chi: Mua mực in 720.000đ, hóa đơn để quên ở cửa hàng", "WARN-route:hóa đơn khai chưa rõ"],
  ["ROUTE-hd-mơ-hồ", CFG_HIEN_CHI, "Mua bánh 100k, quên xin hóa đơn", "WARN-route:hóa đơn khai chưa rõ"],
  // ── ROUTE-dấu-câu: end-to-end của HD-dấu-câu — đây là chế độ hỏng THẬT (tab sai + ✅ im lặng), không chỉ
  //    lệch giá trị detectHoaDon. "Sổ tạm ứng" ở 3 ca dưới = khoản không bill bị đòi hoàn tiền.
  ["ROUTE-dấu-câu", CFG_HIEN_CHI, "Mua giấy 350k,không có hóa đơn", "Sổ tiền mặt"],
  ["ROUTE-dấu-câu", CFG_HIEN_CHI, "Mua giấy 350k.Không có hóa đơn", "Sổ tiền mặt"],
  ["ROUTE-dấu-câu", CFG_HIEN_CHI, "Mua giấy 350k-không có hóa đơn", "Sổ tiền mặt"],
  ["ROUTE-dấu-câu", CFG_HIEN_CHI, "Mua mực 25k,có hóa đơn", "Sổ tạm ứng"],
  // ── Khai RÕ thì vẫn ghi như cũ — canh chiều ngược lại: siết quá tay là mất khoản chờ hoàn ứng.
  ["ROUTE-khai-rõ", CFG_HIEN_CHI, "Mua mực in 720.000đ có hóa đơn", "Sổ tạm ứng"],
  ["ROUTE-khai-rõ", CFG_HIEN_CHI, "Mua giấy 350k không có hóa đơn", "Sổ tiền mặt"],
  ["ROUTE-khai-rõ", CFG_HIEN_CHI, "Mua giấy 350k", "Sổ tiền mặt"],
  ["ROUTE-khai-rõ", CFG_TRANG, "chi: Mua vật tư đóng gói 800.000đ có hóa đơn", "Sổ chi phí"],
  ["ROUTE-khai-rõ", CFG_TRANG, "chi: Ship hàng cho khách 45.000đ", "Sổ chi phí"],
  // ── ROUTE-tiền-tố-trần (nới 16/07, người dùng chốt): kênh Trang chỉ cần "thu"/"chi" ĐẦU tin, ":" tùy chọn ──
  ["ROUTE-tiền-tố-trần", CFG_TRANG, "chi Mua vật tư đóng gói 800.000đ", "Sổ chi phí"],
  ["ROUTE-tiền-tố-trần", CFG_TRANG, "thu tiền khách trả đơn hàng 500k", "Sổ chi phí"],
  ["ROUTE-tiền-tố-trần", CFG_TRANG, "Chi mua thùng giấy 80k", "Sổ chi phí"],
  // "Chi phí …" cũng ăn — đúng hướng (chi phí LÀ khoản chi); diễn giải mất chữ "Chi" là đánh đổi chấp nhận.
  ["ROUTE-tiền-tố-trần", CFG_TRANG, "Chi phí ship hàng 45k", "Sổ chi phí"],
  // Chữ DÍNH LIỀN mở đầu bằng thu/chi KHÔNG phải tiền tố — vẫn ⚠️ thiếu tiền tố như cũ.
  ["ROUTE-tiền-tố-KHÔNG-bắt-nhầm", CFG_TRANG, "chiều nay mua đồ 50k", "WARN-route:thiếu tiền tố"],
  ["ROUTE-tiền-tố-KHÔNG-bắt-nhầm", CFG_TRANG, "thuê xe chở hàng 500k", "WARN-route:thiếu tiền tố"],
  ["ROUTE-tiền-tố-KHÔNG-bắt-nhầm", CFG_TRANG, "thua độ trả 50k", "WARN-route:thiếu tiền tố"],
];

// ── TIENTO: dạng trần CHỈ kênh loaiTuTienTo được ăn. Kênh Hiền phải GIỮ NGUYÊN chữ "Chi phí"/"Thu"
// trong Diễn giải — nới chung cho mọi kênh là cắt mất chữ đầu của diễn giải, sai âm thầm.
// [nhãn, cfg, đầu vào, loai mong đợi (null = không tiền tố), diễn giải mong đợi]
const TIENTO_CASES = [
  ["TIENTO-hiền-giữ-diễn-giải", CFG_HIEN_CHI, "Chi phí điện nước 200k", null, "Chi phí điện nước"],
  ["TIENTO-hiền-giữ-diễn-giải", CFG_HIEN_CHI, "Thu tiền khách lẻ 500k", null, "Thu tiền khách lẻ"],
  ["TIENTO-trang-trần", CFG_TRANG, "thu tiền khách 500k", "thu", "tiền khách"],
  ["TIENTO-trang-cũ-vẫn-chạy", CFG_TRANG, "chi: Ship hàng 45k", "chi", "Ship hàng"],
];

// ── NGÀY-đầu-tin + GHICHÚ-ngoặc (Dũng chốt 2026-08-13) ───────────────────────────────────────────────
// (1) Tin ghi RÕ ngày ở đầu ("Ngày 6/8: chi …") → dùng ngày đó làm NGÀY GD (ghi bù khoản cũ). Chỉ khi có
//     dấu hiệu cố ý (chữ "ngày" / dấu ":" / có năm) — KHÔNG nuốt phân số "1/2 thùng" làm ngày.
// (2) Ngoặc () → TÁCH sang cột Ghi chú, TRỪ khi ngoặc là TOÀN BỘ mô tả (giữ nguyên để Diễn giải không rỗng).
// [nhãn, cfg, msgDate, input, {ngay, loai, noiDung, ghiChu}]
const DATE_CASES = [
  // Case THẬT trong ảnh (kênh Trang, chị Trang ghi bù 6/8, nhắn 13/8): tự vào sổ, KHÔNG cần sửa tin.
  ["NGÀY-ảnh-screenshot", CFG_TRANG, "2026-08-13", "Ngày 6/8: Chi 490.000đ nạp tiền cho sđt 0989898066 của sales (có hoá đơn)",
    { ngay: "06/08/2026", loai: "chi", noiDung: "nạp tiền cho sđt 0989898066 của sales", ghiChu: "có hoá đơn" }],
  ["NGÀY-không-chữ-Ngày-có-dấu-2-chấm", CFG_TRANG, "2026-08-13", "6/8: chi nạp thẻ 200k", { ngay: "06/08/2026", loai: "chi", noiDung: "nạp thẻ", ghiChu: "" }],
  ["NGÀY-có-năm-tường-minh", CFG_TRANG, "2026-08-13", "Ngày 06/08/2025: chi mua sơn 300k", { ngay: "06/08/2025", loai: "chi", noiDung: "mua sơn", ghiChu: "" }],
  ["NGÀY-suy-năm-lùi-khi-tương-lai", CFG_TRANG, "2026-01-02", "Ngày 30/12: chi tất niên 500k", { ngay: "30/12/2025", loai: "chi", noiDung: "tất niên", ghiChu: "" }],
  // Phân số SAU tiền tố, KHÔNG có dấu hiệu ngày → giữ ngày nhắn tin (không mất "1/2" thì càng tốt, nhưng ít
  // nhất KHÔNG được nhận nhầm làm ngày GD).
  ["NGÀY-phân-số-giữ-ngày-nhắn", CFG_TRANG, "2026-07-15", "chi 1/2 thùng sơn 500k", { ngay: "15/07/2026", loai: "chi", noiDung: "thùng sơn", ghiChu: "" }],
  // Ngoặc là TOÀN BỘ mô tả → GIỮ trong Diễn giải, KHÔNG để trống, KHÔNG rơi "thiếu nội dung".
  ["GHICHÚ-ngoặc-toàn-bộ-giữ", CFG_TRANG, "2026-07-15", "chi 500k (mua bút)", { ngay: "15/07/2026", loai: "chi", noiDung: "(mua bút)", ghiChu: "" }],
  ["GHICHÚ-ngoặc-tách", CFG_TRANG, "2026-07-15", "chi mua mực 250k (có hoá đơn)", { ngay: "15/07/2026", loai: "chi", noiDung: "mua mực", ghiChu: "có hoá đơn" }],
  ["GHICHÚ-ngoặc-Hiền", CFG_HIEN_CHI, "2026-07-15", "Sửa máy lạnh 800k (bảo hành 3 tháng)", { ngay: "15/07/2026", loai: null, noiDung: "Sửa máy lạnh", ghiChu: "bảo hành 3 tháng" }],
];

// ── NGÀY-báo-cáo: reportDayDMY(now, dateArg) — "ngày vừa xong", KHÔNG phải "ngày trên đồng hồ" ───────
// Vì sao: cron GitHub trễ 1-2 tiếng CÓ HỆ THỐNG (đo 15/07: 1h11 · 1h21 · 1h54). Lượt cuối ngày trễ qua
// nửa đêm → todayDMY thành ngày mới → mọi dòng sổ mang ngày cũ → DM báo "Thu 0đ · Chi 0đ" trong khi cả
// ngày có giao dịch, mà job vẫn XANH. Đã xảy ra thật 00:18 ngày 16/07 (3 giao dịch, báo cáo in 0đ cả 3 quỹ).
// Luật: chạy trong 00:00–05:59 giờ VN ⇒ chắc chắn là lượt cuối ngày bị trễ ⇒ báo cáo cho NGÀY HÔM TRƯỚC.
// Date dựng bằng giờ MÁY (new Date(y,m,d,h,mi)) và hàm đọc bằng giờ máy → khớp nhau ở mọi TZ; production
// ép TZ=Asia/Ho_Chi_Minh trong workflow nên giờ máy = giờ VN.
// [nhãn, Date giả, dateArg, DD/MM/YYYY mong đợi]
const DAY_CASES = [
  // Ca THẬT đã xảy ra: cron 22:30 VN + trễ ~2h = chạy 00:30 hôm sau.
  ["NGÀY-trễ-qua-nửa-đêm", new Date(2026, 6, 16, 0, 30), undefined, "15/07/2026"],
  ["NGÀY-biên-trong", new Date(2026, 6, 16, 5, 59), undefined, "15/07/2026"],
  // Đúng 6h là KHÔNG lùi — biên ngoài.
  ["NGÀY-biên-ngoài", new Date(2026, 6, 16, 6, 0), undefined, "16/07/2026"],
  // Lượt chạy đúng giờ (cron mới 20:30 VN, trễ ~1h30 → ~22:00): không được lùi.
  ["NGÀY-đúng-giờ", new Date(2026, 6, 16, 22, 0), undefined, "16/07/2026"],
  ["NGÀY-đúng-giờ", new Date(2026, 6, 16, 20, 30), undefined, "16/07/2026"],
  ["NGÀY-đúng-giờ", new Date(2026, 6, 16, 23, 59), undefined, "16/07/2026"],
  // Qua THÁNG — dễ sai nhất: report.mjs còn lấy monthOf(todayDMY) để tính số liệu tháng.
  ["NGÀY-qua-tháng", new Date(2026, 7, 1, 0, 30), undefined, "31/07/2026"],
  ["NGÀY-qua-tháng", new Date(2026, 2, 1, 0, 30), undefined, "28/02/2026"], // tháng 2 không nhuận
  // Qua NĂM.
  ["NGÀY-qua-năm", new Date(2027, 0, 1, 0, 30), undefined, "31/12/2026"],
  // --date= gõ tay THẮNG guard tuyệt đối — cả khi đang ở khung 00:00–05:59 lẫn khi không.
  ["NGÀY-date-arg-thắng", new Date(2026, 6, 16, 0, 30), "10/07/2026", "10/07/2026"],
  ["NGÀY-date-arg-thắng", new Date(2026, 6, 16, 22, 0), "10/07/2026", "10/07/2026"],
];

// [nhãn, cfg kênh, đầu vào, "OK"] — tin ⚠️ phải rep bằng hướng dẫn cho người, không phải chuỗi reason kỹ thuật.
const REP_CASES = [
  ["REP-hd-mơ-hồ", CFG_HIEN_CHI, "Mua bánh 100k, quên xin hóa đơn", "OK"],
  // Kênh Trang cũng rep — trước đây REP_CASES chỉ có kênh Hiền, không ai canh nhánh này.
  ["REP-hd-mơ-hồ", CFG_TRANG, "chi: Mua mực in 720.000đ, hóa đơn để quên ở cửa hàng", "OK"],
  ["REP-thiếu-tiền-tố", CFG_TRANG, "Mua mực in 720.000đ", "OK"],
  // Lý do MỚI (thiếu cả tiền tố lẫn số tiền) cũng phải có hướng dẫn riêng, không được nhổ chuỗi
  // reason kỹ thuật vào mặt người gõ — đó là điều REP() bắt.
  ["REP-trang-thiếu-cả-hai", CFG_TRANG, "Ship hàng cho khách 45000", "OK"],
  // Lý do MỚI "thiếu nội dung" (tin chỉ có số) phải có hướng dẫn riêng (gõ nội dung + số cùng tin),
  // không nhổ chuỗi reason kỹ thuật vào mặt người gõ.
  ["REP-thiếu-nội-dung", CFG_HIEN_CHI, "210k", "OK"],
];

// ── IMLANG: kênh nào được quyền IM, kênh nào không ──────────────────────────
// End-to-end parseEntry → route, chỉ hỏi MỘT câu: bot có lên tiếng không.
//   "SILENT" = im hoàn toàn (không ⚠️, không rep, không log) · "WARN" = ⚠️ + rep · "GHI" = vào sổ.
// Vì sao nhóm này tồn tại: nhánh im lặng của parseEntry lấy `hasImg || loai` làm tín hiệu "đáng nhắc",
// mà `loai` CHÍNH LÀ tiền tố thu/chi. Kênh Trang bắt buộc tiền tố (1 tab chứa cả 2 hướng) → thiếu tiền tố
// là vi phạm quy tắc kênh, đáng kêu to nhất, nhưng lại thành lý do để bot im. Tin thật rơi vào đây biến
// mất KHÔNG DẤU VẾT: người gõ không thấy ⚠️, người vận hành không thấy log (chỉ cộng vào số "bỏ qua").
const W = (cfg, t) => {
  const it = item(cfg, t);
  const p = parseEntry(it);
  if (p.skip) return p.silent ? "SILENT" : "WARN";
  return route(it, p).skip ? "WARN" : "GHI";
};
// [nhãn, cfg, đầu vào, mong đợi]
const IMLANG_CASES = [
  // ── Kênh Trang, thiếu tiền tố (Dũng chốt 2026-08-04, nới §6): CÓ số nghi là tiền → vẫn ⚠️ (giao dịch quên
  // tiền tố, đừng để biến mất — lỗi 29/07); KHÔNG số nào → tin giao tiếp/hướng dẫn của chị Trang → IM. ──
  ["IMLANG-trang-thiếu-tiền-tố-số-trần→cảnh-báo", CFG_TRANG, "Ship hàng cho khách 45000", "WARN"], // 45000 = 5 chữ số → nghi là tiền
  ["IMLANG-trang-thiếu-tiền-tố-số-đúng→cảnh-báo", CFG_TRANG, "Ship hàng cho khách 45.000đ", "WARN"], // route "thiếu tiền tố"
  // Tin GIAO TIẾP/HƯỚNG DẪN không số → IM (ca thật đang bị ⚠️ oan — chị Trang dặn cách gửi bill):
  ["IMLANG-trang-hướng-dẫn-không-số→im", CFG_TRANG, { content: "Gửi vào đây ảnh và tin nhắn trong cùng 1 câu rõ ràng", hasDirectImg: false }, "SILENT"],
  ["IMLANG-trang-chat-không-số→im", CFG_TRANG, { content: "Chuyển khoản lô hàng cho anh Quang", hasDirectImg: false }, "SILENT"],
  // NHƯNG tin KÈM ẢNH (ảnh bill + caption thuần chữ, quên số + tiền tố) = nộp chứng từ → vẫn ⚠️, KHÔNG im:
  // ảnh là tín hiệu giao dịch mạnh, bot không đọc ảnh nên phải nhắc gõ số, kẻo khoản biến mất qua "cửa ảnh".
  ["IMLANG-trang-ảnh-không-số→cảnh-báo", CFG_TRANG, { content: "Bill ship hàng", images: [{ url: "x", name: "bill.jpg" }] }, "WARN"],
  // Có tiền tố nhưng số gõ trơn → vẫn ⚠️ như cũ (nhánh "không thấy số tiền"), không được đổi thành im.
  ["IMLANG-trang-có-tiền-tố-số-trần", CFG_TRANG, "chi Ship hàng cho khách 45000", "WARN"],
  ["IMLANG-trang-có-tiền-tố-thiếu-số", CFG_TRANG, "chi Ship hàng cho khách", "WARN"],
  // Đủ tiền tố + số hợp lệ → vẫn ghi bình thường. Canh chiều ngược: siết quá tay là chặn cả khoản đúng.
  ["IMLANG-trang-đủ→ghi", CFG_TRANG, "chi Ship hàng cho khách 45.000đ", "GHI"],
  ["IMLANG-trang-đủ→ghi", CFG_TRANG, "thu tiền khách trả đơn hàng 500k", "GHI"],

  // ── Ghi chú CÓ CHỦ ĐÍCH: tin MỞ ĐẦU bằng "note"/"ghi chú" → BỎ QUA im lặng, KỂ CẢ khi có số tiền. Kênh
  // Trang có HAI đường im (tin không-số-không-ảnh ở trên, và ghi-chú-có-chủ-đích đây); an toàn vì phải
  // gõ rõ marker ở ĐẦU tin — khác hẳn lỗi vô ý "quên tiền tố + số trơn". Ca thật: tin "note tiền vào ra" của Trang.
  ["IMLANG-trang-note-đầu-tin-có-tiền→im", CFG_TRANG, "note tiền vào ra ko phải thu chi, tổng 16.055.200đ", "SILENT"],
  ["IMLANG-trang-ghi-chú-đầu-tin→im", CFG_TRANG, "ghi chú: hoàn ứng cho anh Quang tháng 8", "SILENT"],
  ["IMLANG-trang-ghi-chu-không-dấu→im", CFG_TRANG, "ghi chu tổng hợp chi hộ 2tr", "SILENT"],
  // Marker phải ĐỨNG RIÊNG ở đầu: "notebook" dính liền KHÔNG phải marker → theo luật cũ (thiếu tiền tố → ⚠️).
  ["IMLANG-trang-notebook-không-phải-marker→cảnh-báo", CFG_TRANG, "notebook mua cho VP 500.000đ", "WARN"],
  // Marker short-circuit CẢ kênh Hiền: có số tiền hợp lệ mà mở đầu "note" → vẫn im (không thì sẽ GHI).
  ["IMLANG-hiền-note-đầu-tin-có-tiền→im", CFG_HIEN_CHI, "note mai mua đồ 350.000đ cho VP", "SILENT"],

  // ── Cụm "không ghi sổ" ở BẤT KỲ đâu (không cần marker đầu tin) → bỏ qua im. Ca THẬT của chị Trang: cụm nằm
  // GIỮA tin, trong ngoặc. Người ghi khoản thật không viết cụm này nên dò free-text ở đây an toàn.
  ["IMLANG-trang-ca-thật-ko-ghi-sổ-giữa-tin→im", CFG_TRANG, "Trả giúp anh Quang (chỉ là note tiền vào ra ko phải thu chi, ko ghi sổ), tổng 16.055.200đ", "SILENT"],
  ["IMLANG-trang-không-ghi-sổ-có-dấu→im", CFG_TRANG, "Hoàn lại các khoản chi hộ tháng 6, tổng 2tr, không ghi sổ nhé", "SILENT"],
  ["IMLANG-hiền-khỏi-ghi-vào-sổ→im", CFG_HIEN_CHI, "Đối trừ nội bộ 500.000đ, khỏi ghi vào sổ", "SILENT"],
  // CHỐNG TRÙNG NHẦM: tin có CẢ "sổ" lẫn "ghi" nhưng KHÔNG phải cụm phủ định → vẫn ghi bình thường.
  ["IMLANG-trang-mua-sổ-ghi-chép-không-đụng-opt-out→ghi", CFG_TRANG, "chi mua sổ ghi chép văn phòng 120.000đ", "GHI"],

  // ── Kênh Hiền: GIỮ NGUYÊN luật cũ. Tiền tố ở đây không bắt buộc (hướng lấy từ cấu hình kênh) nên
  // thiếu nó chẳng mất gì; còn luật "số trần không phải tiền" là thứ chặn SĐT/STK/mã GD/ngày bị đọc
  // thành tiền (xem MONEY_ANY). Nới nhánh im lặng ra cả kênh Hiền = mở lại đúng cái cửa đó.
  ["IMLANG-hiền-số-trần-vẫn-im", CFG_HIEN_CHI, { content: "Mua đồ 350000", hasDirectImg: false }, "SILENT"],
  ["IMLANG-hiền-chat-vẫn-im", CFG_HIEN_CHI, { content: "Vâng chị em nhận rồi ạ", hasDirectImg: false }, "SILENT"],
  ["IMLANG-hiền-sđt-vẫn-im", CFG_HIEN_CHI, { content: "Số của anh Quang 0989123456", hasDirectImg: false }, "SILENT"],
  ["IMLANG-hiền-số-đúng→ghi", CFG_HIEN_CHI, "Mua đồ 350.000đ", "GHI"],

  // ── THIẾU-nội-dung: tin chỉ-toàn-số ở kênh fund → ⚠️ (không ghi dòng rác). Chiều ngược: có mô tả → ghi. ──
  ["THIẾU-nội-dung-hiền-chỉ-số→cảnh-báo", CFG_HIEN_CHI, "210k", "WARN"],
  ["THIẾU-nội-dung-hiền-có-mô-tả→ghi", CFG_HIEN_CHI, "van giảm áp 3c 210k", "GHI"],
  ["THIẾU-nội-dung-trang-chi-chỉ-số→cảnh-báo", CFG_TRANG, "chi 45k", "WARN"],
  ["THIẾU-nội-dung-trang-chi-có-mô-tả→ghi", CFG_TRANG, "chi ship hàng 45k", "GHI"],

  // ── USD ($/usd): subscription nước ngoài không có giá VND → dòng memo (Dũng chốt 2026-08-14). Đủ tiền tố
  //    (Trang) / kênh Hiền → GHI; thiếu tiền tố (Trang) → ⚠️ như mọi khoản; chỉ có số $ không mô tả → ⚠️ thiếu nội dung. ──
  ["USD-trang-đủ→ghi", CFG_TRANG, "chi ChatGPT Plus $20", "GHI"],
  ["USD-hiền→ghi", CFG_HIEN_CHI, "Netflix Premium $10.99", "GHI"],
  ["USD-trang-thiếu-tiền-tố→cảnh-báo", CFG_TRANG, "ChatGPT Plus $20", "WARN"],
  ["USD-chỉ-số-$-không-mô-tả→cảnh-báo", CFG_HIEN_CHI, "$20", "WARN"],
  // ≥2 số $ mà KHÔNG có "tổng" → ⚠️, bot không tự cộng (giống VND).
  ["USD-nhiều-$-không-tổng→cảnh-báo", CFG_TRANG, "chi Gói A $10 và Gói B $15", "WARN"],
];

// ── USD: khoản ghi bằng $/usd → dòng MEMO end-to-end (parseEntry → route → row). Kiểm: Thu/Chi cột F/G TRỐNG
//    (Tồn quỹ không đổi), số $ nằm ở cột Ghi chú (idx 12) kèm "(chưa quy VND)", tab đúng. Bot KHÔNG bịa tỷ giá. ──
// row của buildFundRow: [0]STT [1]Ngày [2]Diễn giải [3]Người [4]HĐ [5]Thu [6]Chi [7]Tồn [8]ĐãHoàn … [12]Ghi chú
// [nhãn, cfg, input, { tab, loai, noiDung, usd(số), gc(chuỗi Ghi chú) }]
const USD_CASES = [
  ["USD-trang-chi", CFG_TRANG, "chi ChatGPT Plus $20", { tab: "Sổ chi phí", loai: "chi", noiDung: "ChatGPT Plus", usd: 20, gc: "$20 (chưa quy VND)" }],
  ["USD-trang-thu", CFG_TRANG, "thu khách trả gói SaaS $150", { tab: "Sổ chi phí", loai: "thu", noiDung: "khách trả gói SaaS", usd: 150, gc: "$150 (chưa quy VND)" }],
  ["USD-hiền-thập-phân", CFG_HIEN_CHI, "Netflix Premium $10.99", { tab: "Sổ tiền mặt", loai: "chi", noiDung: "Netflix Premium", usd: 10.99, gc: "$10.99 (chưa quy VND)" }],
  // Phẩy = ngăn nghìn (chuẩn Mỹ, NGƯỢC VND): "$1,200" = 1200, KHÔNG phải 1,2.
  ["USD-nghìn-phẩy", CFG_HIEN_CHI, "Mua license Adobe $1,200", { tab: "Sổ tiền mặt", loai: "chi", noiDung: "Mua license Adobe", usd: 1200, gc: "$1,200 (chưa quy VND)" }],
  ["USD-hậu-tố-usd", CFG_HIEN_CHI, "Gia hạn domain 15 usd", { tab: "Sổ tiền mặt", loai: "chi", noiDung: "Gia hạn domain", usd: 15, gc: "15 usd (chưa quy VND)" }],
  ["USD-ký-hiệu-sau", CFG_HIEN_CHI, "Vps thuê tháng 8 20$", { tab: "Sổ tiền mặt", loai: "chi", noiDung: "Vps thuê tháng 8", usd: 20, gc: "20$ (chưa quy VND)" }],
  // Ngoặc () vẫn tách sang Ghi chú, nối SAU cờ $ bằng "; ".
  ["USD-kèm-ngoặc", CFG_TRANG, "chi Spotify $5 (gói gia đình)", { tab: "Sổ chi phí", loai: "chi", noiDung: "Spotify", usd: 5, gc: "$5 (chưa quy VND); gói gia đình" }],
  // ≥2 số $ + đúng 1 cụm "tổng" → lấy số TỔNG (giống nhánh VND). Diễn giải được donDauThua() dọn sạch
  // dấu nối mồ côi + chữ "tổng" cụt nghĩa còn lại sau khi nhấc token số đi (trước ra "combo + tổng").
  ["USD-nhiều-$-có-tổng→lấy-tổng", CFG_TRANG, "chi combo $10 + $15 tổng $25", { tab: "Sổ chi phí", loai: "chi", noiDung: "combo", usd: 25, gc: "$25 (chưa quy VND)" }],
  // Ca THẬT 14/08/2026 (khoản Supabase): trước khi có donDauThua, Diễn giải ghi vào sổ là "Gói Pro Supabase
  // - + - Tổng" — rác dấu nối + chữ "tổng" cụt nghĩa. Khoá lại hình dạng sạch.
  ["USD-dọn-dấu-thừa-ca-thật", CFG_TRANG, "chi Gói Pro Supabase - $20 + $14.85 - Tổng $34.85 (Project GWT)",
    { tab: "Sổ chi phí", loai: "chi", noiDung: "Gói Pro Supabase", usd: 34.85, gc: "$34.85 (chưa quy VND); Project GWT" }],
];

// ── ẢNH: khoản phải kèm ẢNH ĐÍNH TRỰC TIẾP trong CÙNG tin mới ghi (Dũng chốt 2026-08-14) ─────────────
// Sinh ra từ ca THẬT 14/08/2026 kênh sổ-chi-chị-Hiền: Tuyết Trang nhắn DPLinh "nhớ gửi lại ko nó ko vào sổ /
// bị tách 2 tin nữa 210k ra tin riêng" — tin META (nói VỀ khoản) nhưng có "210k" nên bot GHI THÀNH KHOẢN CHI
// 210k → dòng ma trong sổ. Ảnh bill là thứ phân biệt khoản THẬT với nói-về-khoản: bàn bạc thì không đính bill.
// "BOQUA" = 📷 (bot thấy, thiếu ảnh nên cố ý không ghi, không rep; trước 18/08 là ❌) · "WARN" = ⚠️ + rep ·
// "GHI" = vào sổ · "SILENT" = im hẳn.
const X = (cfg, t) => {
  const it = item(cfg, t);
  const p = parseEntry(it);
  if (p.skip) return p.boQua ? "BOQUA" : (p.silent ? "SILENT" : "WARN");
  return route(it, p).skip ? "WARN" : "GHI";
};
// [nhãn, cfg, đầu vào, mong đợi]
const ANH_CASES = [
  // ── Ca THẬT (ảnh chụp Dũng gửi): tin dặn dò có nhắc "210k", KHÔNG ảnh → 📷, KHÔNG được ghi thành khoản.
  //    Cụm "ko vào sổ" ở đây KHÔNG khớp opt-out (regex đòi chữ "ghi": "ko GHI sổ") → chính luật ảnh phải đỡ.
  ["ẢNH-ca-thật-tin-dặn-dò", CFG_HIEN_CHI, { content: "@DPLinh nhớ gửi lại ko nó ko vào sổ\nbị tách 2 tin nữa 210k ra tin riêng", hasDirectImg: false }, "BOQUA"],
  // Khoản trông rất "thật" (đủ mô tả + số) nhưng thiếu ảnh → vẫn 📷. Đây là chỗ luật mới siết nhất.
  ["ẢNH-khoản-đủ-chữ-thiếu-ảnh", CFG_HIEN_CHI, { content: "Mua mực in văn phòng 720.000đ", hasDirectImg: false }, "BOQUA"],
  ["ẢNH-trang-đủ-tiền-tố-thiếu-ảnh", CFG_TRANG, { content: "chi Ship hàng cho khách 45.000đ", hasDirectImg: false }, "BOQUA"],
  ["ẢNH-usd-thiếu-ảnh", CFG_TRANG, { content: "chi ChatGPT Plus $20", hasDirectImg: false }, "BOQUA"],
  // ── CHIỀU NGƯỢC (canh siết-quá-tay): có ảnh thì mọi thứ chạy y như cũ.
  ["ẢNH-có-ảnh→ghi", CFG_HIEN_CHI, "Mua mực in văn phòng 720.000đ", "GHI"],
  ["ẢNH-có-ảnh-trang→ghi", CFG_TRANG, "chi Ship hàng cho khách 45.000đ", "GHI"],
  ["ẢNH-có-ảnh-usd→ghi", CFG_TRANG, "chi ChatGPT Plus $20", "GHI"],
  // Có ảnh nhưng THIẾU số → vẫn ⚠️ như cũ (bill thật quên gõ số). Luật ảnh KHÔNG được nuốt nhánh này.
  ["ẢNH-có-ảnh-thiếu-số→vẫn-⚠️", CFG_TRANG, { content: "Bill ship hàng", images: [{ url: "x" }] }, "WARN"],
  // Tin trò chuyện (không tiền, không ảnh) vẫn IM — 📷 chỉ dành cho tin CÓ nhắc tiền, không phải mọi tin.
  ["ẢNH-chat-không-tiền-vẫn-im", CFG_HIEN_CHI, { content: "Vâng chị em nhận rồi ạ", hasDirectImg: false }, "SILENT"],
  // Opt-out "ghi chú/không ghi sổ" vẫn thắng TRƯỚC luật ảnh → im hẳn (📷 ở đây là mắng oan người cố ý ghi chú).
  ["ẢNH-opt-out-vẫn-im-không-phải-📷", CFG_TRANG, { content: "note tiền vào ra ko phải thu chi, tổng 16.055.200đ", hasDirectImg: false }, "SILENT"],
];

// ── NENREP: có được rep tin này không ────────────────────────────────────────
// Luật CŨ "đã rep rồi thì thôi" (`if (w.wasRepped) continue`) đúng khi lý do KHÔNG đổi, sai khi đổi:
// người sửa xong lỗi A thì lộ lỗi B, bot im → tin rep cũ vẫn dạy lỗi A ("thiếu số tiền") trong khi
// chướng ngại thật đã thành B ("hóa đơn mơ hồ"). Người gõ làm đúng lời dặn mà tin vẫn ⚠️, không ai
// nói vì sao → khoản treo vĩnh viễn. Ca THẬT: tin 1531862203400192102 ngày 29/07/2026.
// [nhãn, đầu vào, mong đợi]
const NENREP_CASES = [
  ["NENREP-chưa-rep", { wasRepped: false, repReason: "", reason: "không thấy số tiền" }, true],
  ["NENREP-cùng-lý-do→im", { wasRepped: true, repReason: "không thấy số tiền", reason: "không thấy số tiền" }, false],
  ["NENREP-lý-do-đổi→rep-lại", { wasRepped: true, repReason: "không thấy số tiền", reason: "hóa đơn khai chưa rõ: …" }, true],
  // Dòng _rep CŨ (2 cột, chưa có Reason) → repReason "" → rep lại ĐÚNG MỘT LẦN để tin rep khớp lý do
  // hiện hành, sau đó cột C có giá trị nên lượt sau im. Không vá là các tin đang treo mãi mãi lệch.
  ["NENREP-dòng-cũ-không-reason→rep-lại", { wasRepped: true, repReason: "", reason: "không thấy số tiền" }, true],
];

// ── REPLY: reply = KHÔNG BAO GIỜ giao dịch. phanLoaiReply → 3 nhánh:
//   "dinh"    = payer + ảnh + có tin gốc → đính chứng từ.
//   "canhbao" = reply trông-như-khoản (số tiền / ảnh / tiền tố) → ⚠️ nhắc gửi tin mới.
//   "imlang"  = reply trò chuyện (không dấu hiệu khoản) → bỏ qua im lặng.
const KHAC = "999";
const REF = { id: "1000", content: "chi Mua vật tư 480k", authorId: KHAC };
const ANH = [{ url: "u", ct: "image/png", name: "a.png" }];
const rep = (over) => ({ replyToId: "1000", authorId: KHAC, images: [], refItem: REF, content: "", cfg: CFG_TRANG, ...over });
// [nhãn, item, nhánh mong đợi] — NP không có nhánh "đính chứng từ": reply có ảnh vẫn chỉ là ⚠️ "gửi tin mới".
const REPLY_CASES = [
  ["REPLY-có-tiền→cảnh-báo", rep({ content: "chi thêm vé xe 50k" }), "canhbao"],
  ["REPLY-trò-chuyện→im", rep({ content: "Vâng chị" }), "imlang"],
  ["REPLY-ảnh-không-tiền→cảnh-báo", rep({ images: ANH }), "canhbao"],
  ["REPLY-ảnh-kèm-tiền→cảnh-báo", rep({ images: ANH, content: "đã chuyển 480k" }), "canhbao"],
];
// Tin rep của nhánh cảnh báo: KHÔNG được có câu kết "sửa thẳng tin này" (sửa reply vô ích) và phải bảo gửi TIN MỚI.
const REPLY_REP = repText("123", "reply không tính là khoản");

// ── NP: cụm "hoá đơn đỏ" đúng như bản ghim kênh New Projects ──────────────────
const NP_HD_CASES = [
  ["NP-hđ-đỏ-có", "chi Mua vật tư 1.250.000đ có hoá đơn đỏ", "Có"],
  ["NP-hđ-đỏ-có-dấu-kiểu-cũ", "chi Mua vật tư 1.250.000đ có hóa đơn đỏ", "Có"],
  ["NP-hđ-đỏ-không", "chi Mua vật tư 1.250.000đ không có hoá đơn đỏ", "Không"],
  ["NP-hđ-mặc-định-không", "chi Mua vật tư 1.250.000đ", "Không"],
  ["NP-hđ-đỏ-treo", "chi Mua vật tư 1.250.000đ hoá đơn đỏ gửi sau", "mơ hồ"],
  // LỖ ĐÃ BIẾT, cố ý không vá (spec §3): "VAT" không được hiểu là có hoá đơn.
  ["NP-VAT-lỗ-đã-biết", "chi Mua vật tư 1.250.000đ có VAT", "Không"],
];

let pass = 0;
const fails = [];
for (const [tag, input, want] of CASES) {
  const got = P(input);
  if (got === want) pass++;
  else fails.push({ tag, input, want, got });
}
for (const [tag, input, want] of HD_CASES) {
  const got = detectHoaDon(input);
  if (got === want) pass++;
  else fails.push({ tag, input, want, got });
}
for (const [tag, input, want] of NP_HD_CASES) {
  const got = detectHoaDon(input);
  if (got === want) pass++;
  else fails.push({ tag, input, want, got });
}
// NP end-to-end: tin chuẩn của bản ghim → đúng tab, 10 cột, HĐ "Có", số ở cột Chi.
{
  const it = item(CFG_TRANG, "chi Mua vật tư mẫu 1.250.000đ có hoá đơn đỏ");
  const p = parseEntry(it);
  const rt = p.skip ? p : route(it, p);
  const got = rt.skip ? `SKIP:${rt.reason}` : `${rt.tab}|${rt.row.length}|${rt.row[4]}|${rt.row[5]}|${rt.row[6]}`;
  const want = "Sổ chi phí|10|Có||1250000";
  if (got === want) pass++; else fails.push({ tag: "NP-e2e-tin-chuẩn", input: it.content, want, got });
}

for (const [tag, cfg, input, want] of ROUTE_CASES.filter(laNP)) {
  const got = R(cfg, input);
  if (got === want) pass++;
  else fails.push({ tag, input, want, got });
}
for (const [tag, cfg, input, want] of REP_CASES.filter(laNP)) {
  const got = REP(cfg, input);
  if (got === want) pass++;
  else fails.push({ tag, input, want, got });
}
for (const [tag, cfg, input, wantLoai, wantDesc] of TIENTO_CASES.filter(laNP)) {
  const p = parseEntry(item(cfg, input));
  const got = p.skip ? "SKIP" : `${p.loai}|${p.noiDung}`;
  const want = `${wantLoai}|${wantDesc}`;
  if (got === want) pass++;
  else fails.push({ tag, input, want, got });
}
for (const [tag, cfg, msgDate, input, exp] of DATE_CASES.filter(laNP)) {
  const p = parseEntry({ content: input, date: msgDate, images: [], hasDirectImg: true, cfg, authorId: "123", author: "Nhân viên" });
  const got = p.skip ? `SKIP:${p.reason?.split("—")[0]?.split(":")[0]?.trim()}` : `${p.ngay}|${p.loai}|${p.noiDung}|${p.ghiChu}`;
  const want = `${exp.ngay}|${exp.loai}|${exp.noiDung}|${exp.ghiChu}`;
  if (got === want) pass++;
  else fails.push({ tag, input, want, got });
}
for (const [tag, cfg, input, want] of IMLANG_CASES.filter(laNP)) {
  const got = W(cfg, input);
  if (got === want) pass++;
  else fails.push({ tag, input, want, got });
}
for (const [tag, cfg, input, exp] of USD_CASES.filter(laNP)) {
  const it = item(cfg, input);
  const p = parseEntry(it);
  let got;
  if (p.skip) got = `SKIP:${p.reason?.split(/[:—]/)[0]?.trim()}`;
  else {
    const rt = route(it, p);
    if (rt.skip) got = `WARN-route:${rt.reason.split(":")[0]}`;
    else {
      const tien = rt.row[5] === "" && rt.row[6] === "" ? "Thu/Chi-trống" : `Thu=${rt.row[5]}/Chi=${rt.row[6]}`;
      // rt.loai = hướng THỰC ghi sổ (kênh Hiền lấy từ cấu hình kênh, kênh Trang từ tiền tố) — không phải p.loai.
      got = `${rt.tab}|${rt.loai}|${p.noiDung}|$${p.usd?.amount}|${tien}|${rt.row[9]}`;
    }
  }
  const want = `${exp.tab}|${exp.loai}|${exp.noiDung}|$${exp.usd}|Thu/Chi-trống|${exp.gc}`;
  if (got === want) pass++;
  else fails.push({ tag, input, want, got });
}
for (const [tag, cfg, input, want] of ANH_CASES.filter(laNP)) {
  const got = X(cfg, input);
  if (got === want) pass++;
  else fails.push({ tag, input: typeof input === "string" ? input : input.content, want, got });
}
for (const [tag, input, want] of NENREP_CASES) {
  const got = nenRep(input);
  if (got === want) pass++;
  else fails.push({ tag, input: `${input.wasRepped ? "đã rep" : "chưa rep"} cũ="${input.repReason}" mới="${input.reason}"`, want, got });
}
for (const [tag, it, want] of REPLY_CASES) {
  const got = phanLoaiReply(it);
  if (got === want) pass++;
  else fails.push({ tag, input: `ảnh:${it.images.length} "${String(it.content).slice(0, 26)}"`, want, got });
}
for (const [tag, cond, want] of [
  ["repReply-không-có-đuôi-sửa-tin", !REPLY_REP.includes("Sửa thẳng tin này"), true],
  ["repReply-bảo-gửi-tin-mới", REPLY_REP.includes("TIN NHẮN MỚI"), true],
  // Tin rep HẾT HẠN: có ⌛, KHÔNG có đuôi "sửa trong 7 ngày" (đã hết hạn), bảo gửi TIN MỚI.
  ["repHếtHạn-có-⌛", repText("123", "quá hạn sửa").includes("⌛"), true],
  ["repHếtHạn-không-đuôi-sửa-tin", !repText("123", "quá hạn sửa").includes("Sửa thẳng tin này"), true],
  ["repHếtHạn-bảo-gửi-tin-mới", repText("123", "quá hạn sửa").includes("TIN NHẮN MỚI"), true],
  // Forward (ảnh của tin khác) + caption thuần chữ, không số → BỎ QUA IM (không ⚠️ oan). hasDirectImg:false.
  ["forward-ảnh-không-số→im", (() => { const r = parseEntry({ content: "Đây có khoản này c ạ, nếu c chỉnh lại có hóa đơn thì viết ngoài ngoặc", images: [{ url: "x" }], hasDirectImg: false, cfg: CFG_TRANG, date: "2026-07-15" }); return !!(r.skip && r.silent); })(), true],
  // Ảnh ĐÍNH TRỰC TIẾP + caption thuần chữ, không số → vẫn ⚠️ (nộp bill quên số). hasDirectImg:true.
  ["ảnh-trực-tiếp-không-số→⚠️", (() => { const r = parseEntry({ content: "Đây có khoản này c ạ", images: [{ url: "x" }], hasDirectImg: true, cfg: CFG_TRANG, date: "2026-07-15" }); return !!(r.skip && !r.silent); })(), true],
]) {
  if (cond === want) pass++;
  else fails.push({ tag, input: tag, want, got: cond });
}

const total = pass + fails.length; // đếm theo ca THỰC chạy (đã lọc ca Hiền)
for (const f of fails) console.log(`HỎNG [${f.tag}] "${f.input.slice(0, 56)}"\n     mong=${f.want}  thực=${f.got}`);
console.log(`\n${pass}/${total} đạt${fails.length ? ` · ${fails.length} HỎNG (${[...new Set(fails.map((f) => f.tag))].join(", ")})` : ""}`);
process.exit(fails.length ? 1 : 0);
