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
while true; do
  claude --channels plugin:discord@claude-plugins-official --model claude-sonnet-5-5 \
    --tools "Read" \
    --add-dir "$INBOX" \
    --settings "$DIR/bot/bot-settings.json" \
    --mcp-config "$DIR/bot/mcp.json" \
    --permission-mode dontAsk \
    "Quét bù: gọi tin_chua_xu_ly rồi xử lý từng tin theo CLAUDE.md. Sau đó chờ tin mới."
  echo "$(date '+%F %T') bot NP thoát (mã $?), chạy lại sau 15s..."
  sleep 15
done
