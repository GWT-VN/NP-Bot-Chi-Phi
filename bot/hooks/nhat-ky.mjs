// Nhật ký lớp 2 của bot: một dòng JSONL mỗi lần gọi công cụ. KHÔNG ghi nội dung tin/câu trả lời, chỉ mã.
// Chạy trực tiếp = hook PostToolUse / PostToolUseFailure. Thư mục logs/ bị gitignore.
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const LOGS = join(dirname(fileURLToPath(import.meta.url)), '..', 'logs')

export function ghiNhatKy(dong) {
  mkdirSync(LOGS, { recursive: true })
  const ngay = new Date().toISOString().slice(0, 10)
  appendFileSync(join(LOGS, `cong-cu-${ngay}.jsonl`), JSON.stringify({ ts: new Date().toISOString(), ...dong }) + '\n')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (c) => { raw += c })
  process.stdin.on('end', () => {
    try {
      const e = JSON.parse(raw)
      const i = e.tool_input ?? {}
      ghiNhatKy({
        pha: e.hook_event_name === 'PostToolUseFailure' ? 'loi' : 'xong',
        tool: e.tool_name,
        chat_id: i.chat_id ?? i.channel ?? null,
        message_id: i.message_id ?? i.reply_to ?? null,
        ok: e.hook_event_name !== 'PostToolUseFailure',
      })
    } catch {}
    process.exit(0) // nhật ký hỏng không được làm hỏng lượt trả lời
  })
}
