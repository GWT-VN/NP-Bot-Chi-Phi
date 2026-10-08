#!/bin/zsh
# Cài (hoặc cài lại) dịch vụ nền np-dichvu: launchd com.gwt.np.dichvu — KeepAlive (chết là bật lại), RunAtLoad (đăng nhập là
# chạy). Thay tmux + watchdog của bản channel (spec 2026-10-08 §Vận hành). Gỡ: zsh mac/cai-dichvu.sh go
# Cập nhật code: git pull && npm ci && launchctl kickstart -k gui/$(id -u)/com.gwt.np.dichvu
DIR="${0:A:h:h}"
source "$DIR/mac/env.sh"
LA="$HOME/Library/LaunchAgents"; U="gui/$(id -u)"; N=com.gwt.np.dichvu
GOC_DV="${NP_DICHVU_DIR:-$HOME/Bots/np-dichvu}"
mkdir -p "$LA" "$GOC_DV/logs"
launchctl bootout "$U/$N" 2>/dev/null
if [[ $1 == go ]]; then rm -f "$LA/$N.plist"; echo "Đã gỡ $N."; exit 0; fi
NODE=$(command -v node) || { echo "không thấy node trong PATH"; exit 1 }
[[ -f "$HOME/Bots/.secrets/np-dichvu.env" ]] || { echo "thiếu ~/Bots/.secrets/np-dichvu.env (ZALO_BOT_TOKEN, CLAUDE_CODE_OAUTH_TOKEN, CLAUDE_TOKEN_NGAY_TAO)"; exit 1 }
print -r -- "<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\"><dict>
  <key>Label</key><string>$N</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/dichvu/chinh.mjs</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$PATH</string><key>LANG</key><string>en_US.UTF-8</string></dict>
  <key>KeepAlive</key><true/>
  <key>RunAtLoad</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$GOC_DV/logs/launchd.log</string>
  <key>StandardErrorPath</key><string>$GOC_DV/logs/launchd.log</string>
</dict></plist>" > "$LA/$N.plist"
plutil -lint "$LA/$N.plist" >/dev/null || { echo "plist hỏng"; exit 1 }
launchctl bootstrap "$U" "$LA/$N.plist" && echo "đã nạp $N — xem tình trạng: node $DIR/dichvu/chinh.mjs --kiem-tra"
