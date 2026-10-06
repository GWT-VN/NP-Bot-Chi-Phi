#!/bin/zsh
# Vòng lặp chạy bot NP v2 (Claude Code + plugin Discord) trên Mac mini, BÊN TRONG tmux "np" do watchdog.sh mở.
# Đừng chạy tay từ SSH: SSH không mở được Keychain nên claude không đăng nhập được.
# Khoá quyền (spec v2 §7): --tools Read (chỉ để xem ảnh bill trong inbox), --settings bot/bot-settings.json (allow đúng
# Discord + 5 lệnh npso, deny Bash/Write/Web…, hook chặn mention/file), --permission-mode dontAsk VĨNH VIỄN.
# Thư mục Discord RIÊNG (DISCORD_STATE_DIR): token + access.json của NP, tách hẳn ~/.claude/channels/discord của Bắp.
DIR="${0:A:h:h}"
source "$DIR/mac/env.sh"
# Plugin Discord ưu tiên biến môi trường thật hơn file .env → biến sót (vd trong ~/.zshenv) sẽ đè token/access của NP.
unset DISCORD_BOT_TOKEN DISCORD_ACCESS_MODE
export DISCORD_STATE_DIR="$HOME/.claude/channels/discord-np"
INBOX="$DISCORD_STATE_DIR/inbox"
mkdir -p "$INBOX"
# MCP npso: sinh file mỗi lần start để đường dẫn tuyệt đối luôn đúng máy (file gitignore). Không --strict-mcp-config.
print -r -- "{\"mcpServers\":{\"npso\":{\"command\":\"node\",\"args\":[\"$DIR/mcp/npso.mjs\"],\"env\":{\"DISCORD_STATE_DIR\":\"$DISCORD_STATE_DIR\"}}}}" > "$DIR/bot/mcp.json"
cd "$DIR/bot"
QUET_BU="Quét bù: gọi tin_chua_xu_ly rồi xử lý từng tin theo CLAUDE.md. Sau đó chờ tin mới."
# Gửi "Quét bù" khi MCP npso + plugin Discord (bun) của claude này ĐÃ chạy. Truyền thẳng làm prompt đầu thì tới trước
# lúc MCP kết nối → bot báo "chưa có công cụ" và bỏ quét (đo 2026-10-06). Chờ tối đa 5 phút; +15s cho công cụ đăng ký.
gui_quet_bu() {
  local cl i
  for i in {1..60}; do
    sleep 5
    cl=$(pgrep -P $$ -x claude | head -1)   # $$ = shell chính (zsh giữ nguyên trong subshell) → claude của vòng này
    [[ -n $cl ]] && pgrep -P "$cl" -f "npso.mjs" >/dev/null && pgrep -P "$cl" bun >/dev/null || continue
    sleep 15; tmux send-keys -t np "$QUET_BU" Enter; return
  done
}
while true; do
  gui_quet_bu &
  claude --channels plugin:discord@claude-plugins-official --model claude-sonnet-5-5 \
    --tools "Read" \
    --add-dir "$INBOX" \
    --settings "$DIR/bot/bot-settings.json" \
    --mcp-config "$DIR/bot/mcp.json" \
    --permission-mode dontAsk
  echo "$(date '+%F %T') bot NP thoát (mã $?), chạy lại sau 15s..."
  sleep 15
done
