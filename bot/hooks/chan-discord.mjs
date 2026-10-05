// Hook PreToolUse cho công cụ Discord của bot NP (nạp qua bot/bot-settings.json). Chép khuôn hook của Bắp, khác:
//   - NP ĐƯỢC download_attachment (đọc ảnh bill để lấy/đối chiếu số tiền) — Bắp thì bị chặn.
//   - Bỏ luật "giả khuôn câu trả lời ERP" (NP không trả lời kiến thức ERP).
// Chặn: đính kèm file (plugin tự đọc file trên máy, lách deny Read — vd file token), mention (ping người/role/
// @everyone), sửa tin đã gửi. FAIL-CLOSED: input hỏng hay hook tự lỗi đều exit 2.
import { pathToFileURL } from 'node:url'
import { ghiNhatKy } from './nhat-ky.mjs'

const MENTION = /<@|@everyone|@here/i

export function xet(e) {
  if (!e || typeof e !== 'object' || typeof e.tool_name !== 'string') return 'input hook không hợp lệ'
  const t = e.tool_name
  if (t.endsWith('__edit_message')) return 'bot không được sửa tin đã gửi'
  if (t.endsWith('__reply')) {
    const i = e.tool_input
    if (!i || typeof i !== 'object') return 'input reply không hợp lệ'
    if (i.files != null && !(Array.isArray(i.files) && i.files.length === 0)) return 'không được đính kèm file'
    if (MENTION.test(String(i.text ?? ''))) return 'không được mention người, role, @everyone hay @here'
  }
  return null
}

function chan(lyDo, e) {
  try { ghiNhatKy({ pha: 'pre', tool: e?.tool_name, chat_id: e?.tool_input?.chat_id, chan: lyDo }) } catch {}
  process.stderr.write(`Bị chặn: ${lyDo}.\n`)
  process.exit(2)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (c) => { raw += c })
  process.stdin.on('end', () => {
    let e
    try { e = JSON.parse(raw) } catch { chan('input hook không đọc được') }
    try { const lyDo = xet(e); if (lyDo) chan(lyDo, e); process.exit(0) } catch (err) { chan(`hook lỗi: ${err?.message ?? err}`, e) }
  })
}
