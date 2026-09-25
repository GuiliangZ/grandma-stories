#!/usr/bin/env python3
"""奶奶的故事 · 电脑端接收服务（只用 Python 标准库）

  POST /api/stories            multipart：meta(JSON) + audio(文件) → 存到 stories/，排队转文字
  GET  /api/stories            所有故事的 meta
  GET  /api/stories/<id>       单个故事：status(pending/working/done/failed) + text
  GET  /api/health
  GET  /...                    顺便托管 ../web（本地测试用）

配置在 config.json（照 config.example.json 抄一份改）。用 run.sh 启动会顺便开 HTTPS 隧道。
"""
import json
import pathlib
import queue
import re
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import audio_tools
import transcribe

ROOT = pathlib.Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
if not CONFIG_PATH.exists():
    CONFIG_PATH.write_text((ROOT / "config.example.json").read_text(encoding="utf-8"), encoding="utf-8")
    print("已生成 config.json（照 config.example.json），请填识别引擎的密钥。")
CONFIG = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
STORIES = (ROOT / (CONFIG.get("stories_dir") or "../stories")).resolve()
STORIES.mkdir(parents=True, exist_ok=True)
WEB = (ROOT.parent / "web").resolve()
LOGS = ROOT / "logs"
JOBS: "queue.Queue[pathlib.Path]" = queue.Queue()
INDEX: dict = {}          # id -> story dir
LOCK = threading.Lock()


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def read_meta(d):
    for attempt in range(3):
        try:
            return json.loads((d / "meta.json").read_text(encoding="utf-8"))
        except (json.JSONDecodeError, FileNotFoundError):
            if attempt == 2:
                raise
            time.sleep(0.05)


def write_meta(d, meta):
    """先写临时文件再改名，读的一方永远看不到写了一半的文件。"""
    tmp = d / "meta.json.tmp"
    tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(d / "meta.json")


def load_index():
    for mp in STORIES.glob("*/meta.json"):
        try:
            m = json.loads(mp.read_text(encoding="utf-8"))
            INDEX[m["id"]] = mp.parent
            if m.get("status") in ("pending", "working", "failed"):   # 重启服务时把没转成的都再试一次
                JOBS.put(mp.parent)
        except Exception:
            pass


def safe(s, n=64):
    return re.sub(r"[^A-Za-z0-9_-]", "", str(s))[:n] or "x"


def parse_multipart(ctype: str, body: bytes):
    m = re.search(r'boundary="?([^";]+)"?', ctype)
    if not m:
        raise ValueError("no boundary")
    delim = b"--" + m.group(1).encode()
    fields, files = {}, {}
    for part in body.split(delim)[1:]:
        if part.startswith(b"--"):
            break
        if part.startswith(b"\r\n"):
            part = part[2:]
        head, _, data = part.partition(b"\r\n\r\n")
        if data.endswith(b"\r\n"):
            data = data[:-2]
        headers = {}
        for line in head.decode("utf-8", "replace").split("\r\n"):
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()
        cd = headers.get("content-disposition", "")
        name = re.search(r'name="([^"]*)"', cd)
        fn = re.search(r'filename="([^"]*)"', cd)
        name = name.group(1) if name else ""
        if fn:
            files[name] = (fn.group(1), data)
        else:
            fields[name] = data.decode("utf-8", "replace")
    return fields, files


def save_story(meta: dict, filename: str, data: bytes) -> pathlib.Path:
    sid = safe(meta.get("id") or int(time.time() * 1000))
    ts = time.localtime((meta.get("createdAt") or time.time() * 1000) / 1000)
    base = f"{time.strftime('%Y-%m-%d_%H%M', ts)}_{safe(meta.get('questionId') or 'q', 40)}"
    d = STORIES / base
    i = 2
    while d.exists() and (not (d / "meta.json").exists() or read_meta(d).get("id") != sid):
        d = STORIES / f"{base}_{i}"; i += 1
    d.mkdir(parents=True, exist_ok=True)
    ext = pathlib.Path(filename).suffix.lower() or ".wav"
    audio = d / f"audio{ext}"
    audio.write_bytes(data)
    m = {
        "id": sid,
        "questionId": meta.get("questionId"), "question": meta.get("question"), "stage": meta.get("stage"),
        "createdAt": meta.get("createdAt"), "duration": meta.get("duration"),
        "clientText": meta.get("liveText") or meta.get("text") or "",
        "audio": audio.name, "status": "pending", "text": "", "provider": CONFIG.get("provider"),
        "receivedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    write_meta(d, m)
    with LOCK:
        INDEX[sid] = d
    return d


def worker():
    while True:
        d = JOBS.get()
        try:
            meta = read_meta(d)
            meta["status"] = "working"; write_meta(d, meta)
            log("转写开始", d.name, "provider=", CONFIG.get("provider"))
            wav = audio_tools.ensure_wav16k(d / meta["audio"])
            text, last = None, None
            for attempt in range(3):                      # 网络抖动就重试，别轻易标失败
                try:
                    text = transcribe.transcribe(str(wav), CONFIG); break
                except Exception as e:
                    last = e; log("转写出错，重试", d.name, f"第{attempt + 1}次", repr(e)[:160])
                    time.sleep(5 * (attempt + 1))
            if text is None:
                raise last
            meta.update(status="done", text=text, provider=CONFIG.get("provider"),
                        transcribedAt=time.strftime("%Y-%m-%d %H:%M:%S"), error="")
            write_meta(d, meta)
            (d / "transcript.txt").write_text(text + "\n", encoding="utf-8")
            log("转写完成", d.name, f"{len(text)} 字")
        except Exception as e:
            log("转写失败", d.name, repr(e)); traceback.print_exc()
            try:
                meta = read_meta(d); meta.update(status="failed", error=f"{type(e).__name__}: {e}"); write_meta(d, meta)
            except Exception:
                pass
        finally:
            JOBS.task_done()


class Handler(BaseHTTPRequestHandler):
    server_version = "GrandmaStories/1"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code); self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)

    def _authed(self):
        tok = CONFIG.get("token") or ""
        if not tok:
            return True
        q = parse_qs(urlparse(self.path).query)
        return self.headers.get("X-Token") == tok or q.get("token", [""])[0] == tok

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_HEAD(self):
        self.send_response(200); self._cors(); self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return self._json(200, {"ok": True, "provider": CONFIG.get("provider"), "stories": len(INDEX), "queue": JOBS.qsize()})
        if path.startswith("/api/"):
            if not self._authed():
                return self._json(401, {"error": "bad token"})
            if path == "/api/stories":
                items = []
                for d in sorted(INDEX.values(), reverse=True):
                    try:
                        m = read_meta(d); m["dir"] = d.name; items.append(m)
                    except Exception:
                        pass
                return self._json(200, items)
            m = re.match(r"^/api/stories/([A-Za-z0-9_-]+)/audio$", path)
            if m:
                d = INDEX.get(m.group(1))
                if not d:
                    return self._json(404, {"error": "not found"})
                return self.send_file(d / read_meta(d)["audio"])
            m = re.match(r"^/api/stories/([A-Za-z0-9_-]+)$", path)
            if m:
                d = INDEX.get(m.group(1))
                if not d:
                    return self._json(200, {"id": m.group(1), "status": "missing"})
                meta = read_meta(d)
                return self._json(200, {"id": meta["id"], "status": meta["status"], "text": meta.get("text", ""), "error": meta.get("error", ""), "provider": meta.get("provider")})
            return self._json(404, {"error": "not found"})
        self.serve_static(path)

    def send_file(self, f: pathlib.Path):
        """回放录音：手机浏览器（尤其 iPhone）要求支持 Range，不然放不出来。"""
        import mimetypes
        if not f.is_file():
            return self._json(404, {"error": "not found"})
        size = f.stat().st_size
        ctype = mimetypes.guess_type(str(f))[0] or "application/octet-stream"
        start, end = 0, size - 1
        rng = self.headers.get("Range")
        m = re.match(r"bytes=(\d*)-(\d*)$", rng or "")
        if m and (m.group(1) or m.group(2)):
            if m.group(1):
                start = int(m.group(1)); end = int(m.group(2)) if m.group(2) else size - 1
            else:
                start = max(0, size - int(m.group(2)))
            end = min(end, size - 1)
            if start > end:
                self.send_response(416); self.send_header("Content-Range", f"bytes */{size}"); self.end_headers(); return
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        self._cors()
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Cache-Control", "private, max-age=3600")
        self.end_headers()
        with open(f, "rb") as fh:
            fh.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = fh.read(min(65536, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk); remaining -= len(chunk)

    def serve_static(self, path):
        rel = path.lstrip("/") or "index.html"
        f = (WEB / rel).resolve()
        if not str(f).startswith(str(WEB)) or not f.is_file():
            return self._json(404, {"error": "not found"})
        import mimetypes
        ctype = mimetypes.guess_type(str(f))[0] or "application/octet-stream"
        data = f.read_bytes()
        self.send_response(200); self._cors()
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") or ctype.endswith("javascript") else ""))
        self.send_header("Content-Length", str(len(data)))
        # 页面和脚本一律不缓存：微信 iOS 会把脚本缓存住甚至缓存坏的，导致"找不到 StoryStore"这类错
        self.send_header("Cache-Control", "no-store, must-revalidate" if f.suffix in (".html", ".js", ".css") else "public, max-age=86400")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/client-log":                  # 手机端的错误上报，不要口令，只收 4KB
            length = int(self.headers.get("Content-Length") or 0)
            if 0 < length <= 4096:
                raw = self.rfile.read(length).decode("utf-8", "replace")
                try:
                    j = json.loads(raw)
                    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} [{j.get('kind')}] {j.get('detail')} | {j.get('ua')} | {j.get('url')}"
                except Exception:
                    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} [raw] {raw[:600]}"
                LOGS.mkdir(exist_ok=True)
                with open(LOGS / "client.log", "a", encoding="utf-8") as fh:
                    fh.write(line + "\n")
                log("手机上报", line[:200])
            return self._json(204 if False else 200, {"ok": True})
        if path != "/api/stories":
            return self._json(404, {"error": "not found"})
        if not self._authed():
            return self._json(401, {"error": "bad token"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 200 * 1024 * 1024:
            return self._json(413, {"error": "bad length"})
        body = self.rfile.read(length)
        try:
            fields, files = parse_multipart(self.headers.get("Content-Type", ""), body)
            meta = json.loads(fields.get("meta") or "{}")
            if "audio" not in files:
                return self._json(400, {"error": "no audio"})
            filename, data = files["audio"]
        except Exception as e:
            return self._json(400, {"error": f"bad upload: {e}"})
        if not meta.get("id"):
            meta["id"] = str(int(time.time() * 1000))
        sid = safe(meta["id"])
        existing = INDEX.get(sid)
        if existing and read_meta(existing).get("status") in ("done", "working", "pending"):
            m = read_meta(existing)
            return self._json(200, {"id": sid, "status": m["status"], "dup": True})
        d = save_story(meta, filename, data)
        log("收到录音", d.name, f"{len(data) // 1024} KB", (meta.get("question") or "")[:20])
        self._json(201, {"id": sid, "status": "pending"})
        JOBS.put(d)                                    # 先答复手机，再排队转写

    def log_message(self, fmt, *args):
        msg = fmt % args
        if "/api/stories/" in msg and "/audio" not in msg:      # 轮询太多，不刷屏
            return
        log(self.address_string(), msg)


def main():
    try:
        import subprocess
        subprocess.run([sys.executable, str(ROOT.parent / "make_bundle.py")], check=True, timeout=30)
    except Exception as e:
        log("生成 bundle.js 失败（继续用现有的）", repr(e)[:120])
    load_index()
    threading.Thread(target=worker, daemon=True).start()
    port = int(CONFIG.get("port") or 8790)
    httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    log(f"服务已启动：http://localhost:{port}/  故事存在 {STORIES}  识别引擎 = {CONFIG.get('provider')}  排队 {JOBS.qsize()}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
