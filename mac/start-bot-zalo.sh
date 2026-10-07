#!/bin/zsh
# Vòng lặp chạy bot NP-Zalo (Claude Code + channel tự viết npzalo) trên Mac mini, BÊN TRONG tmux "npz" do watchdog-zalo.sh
# mở. Tách hẳn bot Discord (tmux "np"). Đừng chạy tay từ SSH: SSH không mở được Keychain nên claude không đăng nhập được.
# - Channel tự viết chưa nằm trong allowlist của research preview → phải dùng --dangerously-load-development-channels; cờ
#   này hiện hộp cảnh báo MỖI lần khởi động → bam_qua_canh_bao tự chọn "I am using this for local development" (số của
#   dòng đó do mac/chon-canh-bao.sh đọc từ màn hình, không đoán "1").
# - MCP_PROTOCOL_NEGOTIATION=legacy: channel bắt tay theo bản MCP 2026-07-28 thì Claude Code không đăng ký làm channel.
# - Khoá quyền như bot Discord: --tools Read (chỉ để xem ảnh bill trong inbox), --settings bot-zalo/bot-settings.json,
#   --permission-mode dontAsk VĨNH VIỄN. KHÔNG nạp plugin Discord.
DIR="${0:A:h:h}"
source "$DIR/mac/env.sh"
export ZALO_STATE_DIR="$HOME/.claude/channels/zalo-np"
export MCP_PROTOCOL_NEGOTIATION=legacy
mkdir -p "$ZALO_STATE_DIR/inbox"
print -r -- "{\"mcpServers\":{\"npzalo\":{\"command\":\"node\",\"args\":[\"$DIR/mcp/npzalo.mjs\"],\"env\":{\"ZALO_STATE_DIR\":\"$ZALO_STATE_DIR\"}}}}" > "$DIR/bot-zalo/mcp.json"
cd "$DIR/bot-zalo"
QUET_BU="Quét bù: gọi tin_chua_xu_ly rồi xử lý từng tin theo CLAUDE.md. Sau đó chờ tin mới."
bam_qua_canh_bao() {
  local i so
  for i in {1..36}; do
    sleep 5
    so=$(tmux capture-pane -p -t npz 2>/dev/null | zsh "$DIR/mac/chon-canh-bao.sh")
    [[ -z $so ]] && continue
    tmux send-keys -t npz -l "$so"; sleep 2
    [[ -n $(tmux capture-pane -p -t npz | zsh "$DIR/mac/chon-canh-bao.sh") ]] && tmux send-keys -t npz C-m
    return
  done
}
ghi() { print -r -- "$(date '+%F %T') $*" >> "$DIR/logs/watchdog-zalo.log" }
# Gửi "Quét bù" khi server npzalo của claude này ĐÃ chạy (truyền thẳng làm prompt đầu thì tới trước lúc MCP kết nối).
gui_quet_bu() {
  local cl i
  for i in {1..60}; do
    sleep 5
    cl=$(pgrep -P $$ -x claude | head -1)
    [[ -n $cl ]] && pgrep -P "$cl" -f "npzalo.mjs" >/dev/null || continue
    sleep 15; tmux send-keys -t npz -l "$QUET_BU"; sleep 1; tmux send-keys -t npz C-m; return
  done
}
mkdir -p "$DIR/logs"
nhanh=0
while true; do
  bam_qua_canh_bao &
  gui_quet_bu &
  luc=$SECONDS
  claude --dangerously-load-development-channels server:npzalo --model claude-sonnet-5-5 \
    --tools "Read" \
    --add-dir "$ZALO_STATE_DIR/inbox" \
    --settings "$DIR/bot-zalo/bot-settings.json" \
    --mcp-config "$DIR/bot-zalo/mcp.json" \
    --permission-mode dontAsk
  ma=$?; chay=$(( SECONDS - luc ))
  echo "$(date '+%F %T') bot NP-Zalo thoát (mã $ma) sau ${chay}s, chạy lại sau 15s..."
  ghi "bot NP-Zalo thoát (mã $ma) sau ${chay}s"
  # Thoát < 60s nhiều lần liền = kẹt (vd hộp cảnh báo bị chọn Exit, đăng nhập hỏng) — watchdog không thấy vì claude luôn "trẻ".
  if (( chay < 60 )); then (( nhanh++ )); else nhanh=0; fi
  (( nhanh >= 3 )) && ghi "KẸT: claude thoát liên tục ($nhanh lần < 60s) — tmux attach -t npz để xem"
  sleep 15
done
