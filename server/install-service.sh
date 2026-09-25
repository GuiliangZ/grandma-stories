#!/bin/bash
# 把 server.py 装成开机自启、崩了自动拉起的常驻服务（LaunchAgent，只对当前用户）。
# 配合 `tailscale funnel --bg 8790`（run.sh 已做过一次就一直在），电脑重启后奶奶照样能用。
#   安装：./install-service.sh        卸载：./install-service.sh uninstall
set -e
cd "$(dirname "$0")"
LABEL=com.grandma-stories.server
PLIST=$HOME/Library/LaunchAgents/$LABEL.plist
PY=$(command -v python3)
if [ "$1" = "uninstall" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"; echo "已卸载 $LABEL"; exit
fi
mkdir -p "$HOME/Library/LaunchAgents" logs
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$PY</string><string>$(pwd)/server.py</string></array>
  <key>WorkingDirectory</key><string>$(pwd)</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$(pwd)/logs/server.log</string>
  <key>StandardErrorPath</key><string>$(pwd)/logs/server.log</string>
</dict></plist>
PL
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "已安装并启动 $LABEL（日志：$(pwd)/logs/server.log）"
echo "记得开一次 Funnel（只需一次）：tailscale funnel --bg $(python3 -c "import json;print(json.load(open('config.json')).get('port',8790))")"
