// node --test bot/hooks/chan-discord.test.mjs : hook PreToolUse của bot NP (chép khuôn Bắp; NP được tải ảnh bill).
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { xet } from './chan-discord.mjs'
const R = 'mcp__plugin_discord_discord__reply'
const HOOK = fileURLToPath(new URL('./chan-discord.mjs', import.meta.url))
const chay = (s) => spawnSync(process.execPath, [HOOK], { input: s, encoding: 'utf8' }).status
test('đính kèm file, mention, sửa tin bị chặn', () => {
  assert.ok(xet({ tool_name: R, tool_input: { text: 'x', files: ['/Users/gwtai/Bots/.secrets/np-google-token.json'] } }))
  for (const t of ['<@123>', '<@&4>', '@everyone', '@here']) assert.ok(xet({ tool_name: R, tool_input: { text: t } }), t)
  assert.ok(xet({ tool_name: 'mcp__plugin_discord_discord__edit_message', tool_input: {} }))
})
test('NP ĐƯỢC tải ảnh bill để đọc; câu hỏi lại bình thường đi qua', () => {
  assert.equal(xet({ tool_name: 'mcp__plugin_discord_discord__download_attachment', tool_input: { chat_id: '1', message_id: '2' } }), null)
  assert.equal(xet({ tool_name: R, tool_input: { text: 'Ghi **chi 1.200.000đ** từ Quỹ công ty, không hoá đơn đỏ, đúng không?' } }), null)
})
test('chạy thật: exit 2 khi chặn, 0 khi qua, 2 khi input hỏng', () => {
  assert.equal(chay(JSON.stringify({ tool_name: R, tool_input: { text: 'x', files: ['a'] } })), 2)
  assert.equal(chay(JSON.stringify({ tool_name: R, tool_input: { text: 'ok' } })), 0)
  assert.equal(chay('{hỏng'), 2)
})
