#!/bin/zsh
# Giữ bot NP sống. launchd (com.gwt.np.watchdog) gọi lúc đăng nhập + mỗi 10 phút.
#   - Chưa có tmux "np"            → mở mới, chạy start-bot.sh.
#   - claude đang chạy + plugin lên → không làm gì.
#   - claude chạy > 2 phút mà plugin Discord (bun) chưa lên → KẸT ở hộp thoại (thường là hỏi trust thư mục).
#     Windows mở lại bằng cửa sổ HIỆN cho người trả lời; Mac không có cửa sổ cho tmux nền, mở lại cũng kẹt y vậy →
#     KHÔNG tắt, chỉ ghi log: người vận hành `tmux attach -t np` để trả lời (Ctrl+B rồi D để thoát mà bot vẫn chạy).
DIR="${0:A:h:h}"
source "$DIR/mac/env.sh"
mkdir -p "$DIR/logs"
ghi() { print -r -- "$(date '+%F %T') $*" >> "$DIR/logs/watchdog.log" }
giay() { local t=${1// /} d=0; [[ $t == *-* ]] && { d=${t%%-*}; t=${t#*-} }; local -a p=(${(s.:.)t})
  (( ${#p} == 2 )) && p=(0 $p); print $(( d*86400 + 10#${p[1]}*3600 + 10#${p[2]}*60 + 10#${p[3]} )) }

# Dọn ảnh bill tạm (plugin tải về để Claude xem) quá 7 ngày — chứng từ CHÍNH THỨC đã nằm trên Drive. Ổ Mac mini còn ít chỗ.
find "$HOME/.claude/channels/discord-np/inbox" -type f -mtime +7 -delete 2>/dev/null
if ! tmux has-session -t np 2>/dev/null; then
  if tmux new-session -d -s np -c "$DIR" "$DIR/mac/start-bot.sh" 2>>"$DIR/logs/watchdog.log"; then ghi "mở tmux np"; exit 0; fi
  ghi "LỖI: không mở được tmux np (chưa cài tmux? xem dòng lỗi ngay trên)"; exit 1
fi
pane=$(tmux list-panes -t np -F '#{pane_pid}' | head -1)
cl=$(pgrep -P "$pane" -x claude | head -1)
[[ -z $cl ]] && exit 0                       # start-bot.sh đang chờ 15s giữa hai lần chạy
pgrep -P "$cl" bun >/dev/null && exit 0      # plugin Discord đã lên
(( $(giay "$(ps -o etime= -p $cl)") < 120 )) && exit 0
ghi "KẸT: claude $cl chạy > 2 phút mà plugin Discord chưa lên — tmux attach -t np để xem/trả lời hộp thoại"
