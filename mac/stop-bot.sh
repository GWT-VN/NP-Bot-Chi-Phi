#!/bin/zsh
# Tắt hẳn bot NP: gỡ watchdog trước (không thì 10 phút sau nó mở lại), rồi đóng tmux "np". Bật lại: zsh mac/cai-launchd.sh
DIR="${0:A:h:h}"
source "$DIR/mac/env.sh"
launchctl bootout "gui/$(id -u)/com.gwt.np.watchdog" 2>/dev/null
tmux kill-session -t np 2>/dev/null
echo "Đã tắt bot NP (watchdog gỡ, tmux np đóng)."
