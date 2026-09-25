#!/bin/bash
# 启动电脑端服务，并通过 Tailscale Funnel 给它一个固定的 HTTPS 公网地址（免费、不用域名）。
# 奶奶只需要这一个地址：页面和录音上传都走它。Ctrl+C 退出（Funnel 转发会保留，下次启动直接可用）。
#
# 第一次使用前（只做一次）：
#   1. 装 Tailscale：  brew install --cask tailscale-app   （会要 Mac 密码），或 App Store 搜 Tailscale
#   2. 打开 Tailscale.app 登录你的账号
#   3. 跑本脚本；第一次会打印一个链接，点开在 Tailscale 后台启用 HTTPS 证书 + Funnel，再跑一次就通了
cd "$(dirname "$0")"
[ -f config.json ] || cp config.example.json config.json
PORT=$(python3 -c "import json;print(json.load(open('config.json')).get('port',8790))")
TOKEN=$(python3 -c "import json;print(json.load(open('config.json')).get('token',''))")

TS=""
for c in "$(command -v tailscale 2>/dev/null)" /Applications/Tailscale.app/Contents/MacOS/Tailscale /opt/homebrew/bin/tailscale; do
  [ -n "$c" ] && [ -x "$c" ] && { TS="$c"; break; }
done

python3 server.py &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1

if [ -z "$TS" ]; then
  echo
  echo "✗ 没找到 Tailscale。先装：brew install --cask tailscale-app  （或 App Store），登录后再跑一次。"
  echo "  现在只在本机可用：http://localhost:$PORT/?demo"
  wait $SRV; exit
fi

if ! "$TS" status >/dev/null 2>&1; then
  echo
  echo "✗ Tailscale 还没登录/没运行。打开 Tailscale.app 登录后再跑一次。"
  wait $SRV; exit
fi

# --bg：转发规则常驻在 Tailscale 里，重启电脑也在
if ! out=$("$TS" funnel --bg "$PORT" 2>&1); then
  echo
  echo "✗ 开 Funnel 失败："
  echo "$out"
  echo "  第一次通常需要在 Tailscale 后台启用 HTTPS 证书和 Funnel（上面输出里会有链接），启用后再跑一次。"
  wait $SRV; exit
fi

HOST=$("$TS" status --json 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))")
echo
echo "✓ 服务在跑，Funnel 已开。奶奶用这个地址（固定不变，页面和上传都走它）："
echo "    https://$HOST/"
[ -n "$TOKEN" ] && echo "  第一次打开用这个（带口令，手机会记住）：https://$HOST/?token=$TOKEN"
echo "  演示版：https://$HOST/?demo"
echo "  查看 Funnel 状态：$TS funnel status    关闭：$TS funnel --bg off"
echo
wait $SRV
