#!/bin/zsh
# Cài (hoặc cài lại) lịch launchd của bot NP-Zalo: com.gwt.np.zalo.watchdog — lúc đăng nhập + mỗi 10 phút giữ tmux "npz"
# sống. Tách riêng com.gwt.np.watchdog (bot Discord). Gỡ: zsh mac/cai-launchd-zalo.sh go
DIR="${0:A:h:h}"
LA="$HOME/Library/LaunchAgents"; U="gui/$(id -u)"; N=com.gwt.np.zalo.watchdog
mkdir -p "$LA" "$DIR/logs"
launchctl bootout "$U/$N" 2>/dev/null
if [[ $1 == go ]]; then rm -f "$LA/$N.plist"; echo "Đã gỡ $N."; exit 0; fi
print -r -- "<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\"><dict>
  <key>Label</key><string>$N</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$DIR/mac/watchdog-zalo.sh</string></array>
  <key>StartInterval</key><integer>600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$DIR/logs/$N.log</string>
  <key>StandardErrorPath</key><string>$DIR/logs/$N.log</string>
</dict></plist>" > "$LA/$N.plist"
plutil -lint "$LA/$N.plist" >/dev/null || { echo "plist hỏng"; exit 1 }
launchctl bootstrap "$U" "$LA/$N.plist" && echo "đã nạp $N"
