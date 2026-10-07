#!/bin/zsh
# Giữ bot NP-Zalo sống (tmux "npz"). launchd com.gwt.np.zalo.watchdog gọi lúc đăng nhập + mỗi 10 phút. Tách hẳn watchdog
# Discord — lỗi bên Zalo không được kéo theo bot Discord.
#   - Chưa có ZALO_BOT_TOKEN → không mở (ghi log).
#   - Chưa có tmux "npz" → mở, chạy start-bot-zalo.sh.
#   - claude chạy > 2 phút mà server npzalo chưa lên → KẸT ở hộp thoại (trust thư mục lần đầu / cảnh báo dev-channel không
#     tự bấm qua được) → chỉ ghi log; người vận hành `tmux attach -t npz` để trả lời (Ctrl+B rồi D để thoát).
DIR="${0:A:h:h}"
source "$DIR/mac/env.sh"
Z="$HOME/.claude/channels/zalo-np"
mkdir -p "$DIR/logs"
ghi() { print -r -- "$(date '+%F %T') $*" >> "$DIR/logs/watchdog-zalo.log" }
giay() { local t=${1// /} d=0; [[ $t == *-* ]] && { d=${t%%-*}; t=${t#*-} }; local -a p=(${(s.:.)t})
  (( ${#p} == 2 )) && p=(0 $p); print $(( d*86400 + 10#${p[1]}*3600 + 10#${p[2]}*60 + 10#${p[3]} )) }

# Ảnh bill tạm (tai_anh) quá 7 ngày — chứng từ CHÍNH THỨC đã nằm trên Drive.
find "$Z/inbox" -type f -mtime +7 -delete 2>/dev/null
grep -q '^ZALO_BOT_TOKEN=' "$Z/.env" 2>/dev/null || { ghi "chưa có ZALO_BOT_TOKEN trong $Z/.env — không mở bot Zalo"; exit 0 }
if ! tmux has-session -t npz 2>/dev/null; then
  if tmux new-session -d -s npz -c "$DIR" "$DIR/mac/start-bot-zalo.sh" 2>>"$DIR/logs/watchdog-zalo.log"; then ghi "mở tmux npz"; exit 0; fi
  ghi "LỖI: không mở được tmux npz (xem dòng lỗi ngay trên)"; exit 1
fi
pane=$(tmux list-panes -t npz -F '#{pane_pid}' | head -1)
cl=$(pgrep -P "$pane" -x claude | head -1)
[[ -z $cl ]] && exit 0                            # start-bot-zalo.sh đang chờ 15s giữa hai lần chạy
pgrep -P "$cl" -f "npzalo.mjs" >/dev/null && exit 0  # server npzalo đã lên
(( $(giay "$(ps -o etime= -p $cl)") < 120 )) && exit 0
ghi "KẸT: claude $cl chạy > 2 phút mà server npzalo chưa lên — tmux attach -t npz để xem/trả lời hộp thoại"
