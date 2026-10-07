#!/bin/zsh
# Tắt hẳn bot NP-Zalo: gỡ watchdog Zalo trước (không thì 10 phút sau nó mở lại), rồi đóng tmux "npz". Bot Discord không bị đụng.
# Bật lại: zsh mac/cai-launchd-zalo.sh
DIR="${0:A:h:h}"
source "$DIR/mac/env.sh"
launchctl bootout "gui/$(id -u)/com.gwt.np.zalo.watchdog" 2>/dev/null
tmux kill-session -t npz 2>/dev/null
echo "Đã tắt bot NP-Zalo (watchdog Zalo gỡ, tmux npz đóng)."
