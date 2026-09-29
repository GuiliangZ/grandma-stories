#!/usr/bin/env python3
"""备用通道：Cloudflare 隧道守护进程。

Tailscale Funnel 的公网 DNS 有时会被撤掉（2026-09 出现过），所以再开一条 Cloudflare 隧道。
隧道地址每次重启会变，这里负责：保持 cloudflared 运行 → 拿到新地址 → 写 backend.json（页面启动时读它找后端）
→ 推到 GitHub Pages → 通知你当前的直连地址。页面入口 https://guiliangz.github.io/grandma-stories/ 永远不变。
"""
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
PROJECT = ROOT.parent
LOGS = ROOT / "logs"; LOGS.mkdir(exist_ok=True)
CONFIG = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
PORT = int(CONFIG.get("port") or 8790)
FUNNEL = CONFIG.get("funnel_url") or "https://guiliangs-macbook-air.tail0b8d76.ts.net"
CF = os.environ.get("CLOUDFLARED") or str(pathlib.Path.home() / ".local" / "bin" / "cloudflared")
ENV = dict(os.environ, PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:" + str(pathlib.Path.home() / ".local/node/bin") + ":" + os.environ.get("PATH", ""))
URL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")


def log(*a):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


def healthy(url, tries=12):
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url + "/api/health", timeout=10) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(5)
    return False


def publish(url):
    data = {"servers": [url, FUNNEL], "updatedAt": time.strftime("%Y-%m-%d %H:%M:%S")}
    text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    (PROJECT / "web" / "backend.json").write_text(text, encoding="utf-8")
    deploy = PROJECT / "deploy"
    if (deploy / ".git").exists():
        (deploy / "backend.json").write_text(text, encoding="utf-8")
        for cmd in (["git", "add", "backend.json"], ["git", "commit", "-qm", f"backend {time.strftime('%Y-%m-%d %H:%M')}"], ["git", "push", "-q", "origin", "main"]):
            r = subprocess.run(cmd, cwd=deploy, env=ENV, capture_output=True, text=True, timeout=120)
            if r.returncode != 0 and "nothing to commit" not in (r.stdout + r.stderr):
                log("git 失败:", " ".join(cmd), (r.stderr or r.stdout).strip()[:200])
                return False
        log("已更新 GitHub 上的 backend.json →", url)
    return True


def notify(url):
    try:
        sys.path.insert(0, str(ROOT))
        import notify as N
        token = CONFIG.get("token") or ""
        N.configure(CONFIG.get("notify") or {})
        N._send("奶奶的故事：后端地址更新",
                f"固定入口（推荐，永远不变）：\nhttps://guiliangz.github.io/grandma-stories/?token={token}\n\n"
                f"当前直连地址（国内打不开 github.io 时用，重启后会变）：\n{url}/?token={token}")
    except Exception as e:
        log("通知失败", repr(e)[:120])


def main():
    last = ""
    while True:
        log("启动 cloudflared …")
        p = subprocess.Popen([CF, "tunnel", "--no-autoupdate", "--url", f"http://localhost:{PORT}"],
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=ENV)
        url = ""
        for line in p.stdout:
            if not url:
                m = URL_RE.search(line)
                if m:
                    url = m.group(0)
                    log("隧道地址:", url)
                    if healthy(url):
                        if url != last:
                            ok = publish(url)
                            notify(url)
                            last = url if ok else ""
                    else:
                        log("隧道地址不通，重启 cloudflared")
                        p.terminate()
            elif re.search(r"\bERR\b|failed", line):
                log("cloudflared:", line.strip()[:200])
        p.wait()
        log("cloudflared 退出，5 秒后重启")
        time.sleep(5)


if __name__ == "__main__":
    main()
