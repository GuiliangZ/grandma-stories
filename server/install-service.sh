#!/bin/bash
# 把 server.py 装成开机自启、崩了自动拉起的常驻服务（LaunchAgent，只对当前用户）。
# 配合 `tailscale funnel --bg 8790`（run.sh 已做过一次就一直在），电脑重启后奶奶照样能用。
#   安装：./install-service.sh        卸载：./install-service.sh uninstall
set -e
cd "$(dirname "$0")"
LABEL=com.grandma-stories.server
PLIST=$HOME/Library/LaunchAgents/$LABEL.plist
PY=""
for c in "$(command -v python3)" "$HOME/miniconda3/envs/fuck-env/bin/python3" /opt/homebrew/bin/python3 /usr/bin/python3; do
  [ -n "$c" ] && [ -x "$c" ] && "$c" -c 'import dashscope' 2>/dev/null && { PY="$c"; break; }
done
[ -n "$PY" ] || { echo "没找到装了 dashscope 的 python3，先 pip install dashscope"; exit 1; }
if [ "$1" = "uninstall" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"; echo "已卸载 $LABEL"
  launchctl unload "$HOME/Library/LaunchAgents/com.grandma-stories.backup.plist" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/com.grandma-stories.backup.plist"; echo "已卸载每日备份"; exit
fi
mkdir -p "$HOME/Library/LaunchAgents" logs
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/usr/bin/caffeinate</string><string>-i</string><string>$PY</string><string>$(pwd)/server.py</string></array>
  <key>WorkingDirectory</key><string>$(pwd)</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$(pwd)/logs/server.log</string>
  <key>StandardErrorPath</key><string>$(pwd)/logs/server.log</string>
</dict></plist>
PL
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "已安装并启动 $LABEL（日志：$(pwd)/logs/server.log）"

# 每天 03:00 备份到 iCloud Drive（只增不删）
BPLIST=$HOME/Library/LaunchAgents/com.grandma-stories.backup.plist
cat > "$BPLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.grandma-stories.backup</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$(pwd)/backup.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>0</integer></dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$(pwd)/logs/backup.log</string>
  <key>StandardErrorPath</key><string>$(pwd)/logs/backup.log</string>
</dict></plist>
PL
launchctl unload "$BPLIST" 2>/dev/null || true
launchctl load "$BPLIST"
echo "已安装每日备份 com.grandma-stories.backup（日志：$(pwd)/logs/backup.log）"
echo "记得开一次 Funnel（只需一次）：tailscale funnel --bg $(python3 -c "import json;print(json.load(open('config.json')).get('port',8790))")"
