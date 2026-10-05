# Môi trường chung cho mọi script mac/ (launchd chạy với PATH tối thiểu, không đọc ~/.zshrc).
export PATH="/opt/homebrew/bin:$HOME/.local/bin:$HOME/.bun/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export LANG="en_US.UTF-8"
# Không nạp connector claude.ai vào phiên bot (giữ từ start-bot.ps1). KHÔNG dùng --strict-mcp-config: tắt luôn plugin Discord.
export ENABLE_CLAUDEAI_MCP_SERVERS=false
