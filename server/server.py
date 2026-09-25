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
JOBS: "queue.Queue[pathlib.Path]" = queue.Queue()
INDEX: dict = {}          # id -> story dir
LOCK = threading.Lock()


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def read_meta(d):
    return json.loads((d / "meta.json").read_text(encoding="utf-8"))


def write_meta(d, meta):
    (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def load_index():
    for mp in STORIES.glob("*/meta.json"):
        try:
            m = json.loads(mp.read_text(encoding="utf-8"))
            INDEX[m["id"]] = mp.parent
            if m.get("status") in ("pending", "working"):
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
            text = transcribe.transcribe(str(wav), CONFIG)
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
            m = re.match(r"^/api/stories/([A-Za-z0-9_-]+)$", path)
            if m:
                d = INDEX.get(m.group(1))
                if not d:
                    return self._json(200, {"id": m.group(1), "status": "missing"})
                meta = read_meta(d)
                return self._json(200, {"id": meta["id"], "status": meta["status"], "text": meta.get("text", ""), "error": meta.get("error", ""), "provider": meta.get("provider")})
            return self._json(404, {"error": "not found"})
        self.serve_static(path)

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
        self.send_header("Content-Length", str(len(data))); self.send_header("Cache-Control", "no-cache"); self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        path = urlparse(self.path).path
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
        sid = safe(meta.get("id") or "")
        existing = INDEX.get(sid)
        if existing and read_meta(existing).get("status") in ("done", "working", "pending"):
            m = read_meta(existing)
            return self._json(200, {"id": sid, "status": m["status"], "dup": True})
        d = save_story(meta, filename, data)
        JOBS.put(d)
        log("收到录音", d.name, f"{len(data) // 1024} KB", (meta.get("question") or "")[:20])
        return self._json(201, {"id": read_meta(d)["id"], "status": "pending"})

    def log_message(self, fmt, *args):
        if "/api/stories/" in fmt % args:      # 轮询太多，不刷屏
            return
        log(self.address_string(), fmt % args)


def main():
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
