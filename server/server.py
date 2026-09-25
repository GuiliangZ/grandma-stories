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
import notify
import transcribe

ROOT = pathlib.Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config.json"
if not CONFIG_PATH.exists():
    CONFIG_PATH.write_text((ROOT / "config.example.json").read_text(encoding="utf-8"), encoding="utf-8")
    print("已生成 config.json（照 config.example.json），请填识别引擎的密钥。")
CONFIG = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
STORIES = (ROOT / (CONFIG.get("stories_dir") or "../stories")).resolve()
STORIES.mkdir(parents=True, exist_ok=True)
notify.configure(CONFIG.get("notify") or {})
WEB = (ROOT.parent / "web").resolve()
LOGS = ROOT / "logs"
JOBS: "queue.Queue[pathlib.Path]" = queue.Queue()
INDEX: dict = {}          # id -> story dir
LOCK = threading.Lock()
USERS_PATH = STORIES / "users.json"


def load_users():
    try:
        return json.loads(USERS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []


def save_users(users):
    tmp = USERS_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(USERS_PATH)


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
    paths = list(STORIES.glob("*/*/meta.json")) + list(STORIES.glob("*/meta.json"))   # 按用户分目录；也兼容早期的单层目录
    for mp in paths:
        if "_deleted" in mp.parts:
            continue
        try:
            m = json.loads(mp.read_text(encoding="utf-8"))
            INDEX[m["id"]] = mp.parent
            if m.get("status") in ("pending", "working", "failed"):   # 重启服务时把没转成的都再试一次
                JOBS.put(mp.parent)
        except Exception:
            pass


def safe(s, n=64):
    return re.sub(r"[^A-Za-z0-9_-]", "", str(s))[:n] or "x"


def fs_name(s, n=40):
    """能当文件夹名的字符串：保留中文，去掉路径和系统不允许的符号。"""
    s = re.sub(r'[\\/:*?"<>|\r\n\t]', "", str(s or "")).strip().strip(".")
    return s[:n] or "x"


def user_name(uid, fallback=""):
    if uid in ("", "default", None):
        return "未分组"
    for u in load_users():
        if u["id"] == uid:
            return u["name"]
    return fallback or uid


def user_dir(uid, fallback_name=""):
    return STORIES / fs_name(user_name(uid, fallback_name), 20)


def story_dirname(meta):
    ts = time.localtime((meta.get("createdAt") or time.time() * 1000) / 1000)
    q = meta.get("question") or meta.get("questionId") or "q"
    tail = "_追问" if meta.get("followup") else ""
    return f"{time.strftime('%Y-%m-%d_%H%M', ts)}_{fs_name(q, 24)}{tail}"


def write_indexes():
    """每个用户目录下写 目录.md，根目录写 总览.md：一眼看出哪条录音是谁的、哪个问题。"""
    try:
        by_user = {}
        with LOCK:
            dirs = list(INDEX.values())
        for d in dirs:
            try:
                m = read_meta(d)
            except Exception:
                continue
            by_user.setdefault(d.parent, []).append((m, d))
        total = []
        for udir, items in sorted(by_user.items()):
            items.sort(key=lambda x: x[0].get("createdAt") or 0, reverse=True)
            lines = [f"# {udir.name} 的故事（{len(items)} 条）", "", "| 时间 | 问题 | 时长 | 状态 | 文字（开头） | 文件夹 |", "|---|---|---|---|---|---|"]
            for m, d in items:
                ts = time.strftime("%Y-%m-%d %H:%M", time.localtime((m.get("createdAt") or 0) / 1000))
                dur = int(m.get("duration") or 0)
                st = {"done": "已转写", "pending": "排队中", "working": "转写中", "failed": "失败"}.get(m.get("status"), m.get("status"))
                txt = (m.get("text") or "").replace("|", "｜").replace("\n", " ")[:40]
                lines.append(f"| {ts} | {m.get('question') or m.get('questionId')} | {dur // 60}分{dur % 60}秒 | {st} | {txt} | `{d.name}/` |")
            lines += ["", "每个文件夹里：audio.wav（录音）、transcript.txt（转写文字）、meta.json（详细信息）。", ""]
            (udir / "目录.md").write_text("\n".join(lines), encoding="utf-8")
            total.append((udir.name, len(items), items[0][0].get("createdAt") or 0))
        lines = ["# 奶奶的故事 · 总览", "", "按用户分文件夹，每个用户文件夹里有 `目录.md`；每条录音一个文件夹：`日期_问题/`。", "", "| 用户 | 录音数 | 最近一次 |", "|---|---|---|"]
        for name, n, last in sorted(total, key=lambda x: -x[2]):
            lines.append(f"| {name} | {n} | {time.strftime('%Y-%m-%d %H:%M', time.localtime(last / 1000)) if last else ''} |")
        lines += ["", "用户名单：users.json。删掉的录音在 _deleted/ 里，可以找回。", "后台管理：`python3 server/manage.py users | rename-user 旧名 新名 | delete-user 名字 | index`", ""]
        (STORIES / "总览.md").write_text("\n".join(lines), encoding="utf-8")
    except Exception as e:
        log("写目录失败", repr(e)[:120])


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
    base = story_dirname(meta)
    udir = user_dir(safe(meta.get("user") or "default"), str(meta.get("userName") or ""))
    udir.mkdir(parents=True, exist_ok=True)
    d = udir / base
    i = 2
    while d.exists() and (not (d / "meta.json").exists() or read_meta(d).get("id") != sid):
        d = udir / f"{base}_{i}"; i += 1
    d.mkdir(parents=True, exist_ok=True)
    ext = pathlib.Path(filename).suffix.lower() or ".wav"
    audio = d / f"audio{ext}"
    audio.write_bytes(data)
    m = {
        "id": sid,
        "user": safe(meta.get("user") or "default"), "userName": str(meta.get("userName") or "")[:40],
        "questionId": meta.get("questionId"), "question": meta.get("question"), "stage": meta.get("stage"),
        "createdAt": meta.get("createdAt"), "duration": meta.get("duration"),
        "clientText": meta.get("liveText") or meta.get("text") or "",
        "followup": str(meta.get("followup") or "")[:200], "parentId": str(meta.get("parentId") or "")[:80],
        "interrupted": bool(meta.get("interrupted")),
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
            write_indexes()
            threading.Thread(target=notify.on_story, args=(meta, d), daemon=True).start()
        except Exception as e:
            log("转写失败", d.name, repr(e)); traceback.print_exc()
            try:
                meta = read_meta(d); meta.update(status="failed", error=f"{type(e).__name__}: {e}"); write_meta(d, meta)
                write_indexes()
                threading.Thread(target=notify.on_story, args=(meta, d), daemon=True).start()
            except Exception:
                pass
        finally:
            JOBS.task_done()


class Handler(BaseHTTPRequestHandler):
    server_version = "GrandmaStories/1"

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code); self._cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)

    def _authed(self, level="full"):
        tok = CONFIG.get("token") or ""
        fam = CONFIG.get("family_token") or ""
        if not tok:
            return True
        q = parse_qs(urlparse(self.path).query)
        given = self.headers.get("X-Token") or q.get("token", [""])[0]
        if given == tok:
            return True
        return level == "family" and bool(fam) and given == fam

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_HEAD(self):
        self.send_response(200); self._cors(); self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            return self._json(200, {"ok": True, "provider": CONFIG.get("provider"), "stories": len(INDEX), "queue": JOBS.qsize()})
        if path.startswith("/api/"):
            if not self._authed("family"):
                return self._json(401, {"error": "bad token"})
            if path == "/api/users":
                return self._json(200, load_users())
            if path == "/api/stories":
                want = parse_qs(urlparse(self.path).query).get("user", [""])[0]
                items = []
                for d in sorted(INDEX.values(), reverse=True):
                    try:
                        m = read_meta(d)
                        if want and (m.get("user") or "default") != want:
                            continue
                        m["dir"] = d.name; items.append(m)
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
        m = re.match(r"^/api/stories/([A-Za-z0-9_-]+)/retranscribe$", path)
        if m:                                           # 家人页：重新转写这一条
            if not self._authed("family"):
                return self._json(401, {"error": "bad token"})
            d = INDEX.get(m.group(1))
            if not d:
                return self._json(404, {"error": "not found"})
            meta = read_meta(d); meta["status"] = "pending"; meta["error"] = ""; write_meta(d, meta)
            JOBS.put(d)
            return self._json(200, {"ok": True, "status": "pending"})
        if path == "/api/users":                       # 新建用户（同名就返回已有的）
            if not self._authed():
                return self._json(401, {"error": "bad token"})
            length = int(self.headers.get("Content-Length") or 0)
            try:
                body = json.loads(self.rfile.read(length).decode("utf-8")) if 0 < length <= 4096 else {}
            except Exception:
                body = {}
            name = " ".join(str(body.get("name") or "").split())[:12]
            if not name:
                return self._json(400, {"error": "name required"})
            with LOCK:
                users = load_users()
                for u in users:
                    if u["name"] == name:
                        return self._json(200, u)
                import secrets
                u = {"id": "u" + secrets.token_hex(4), "name": name, "createdAt": time.strftime("%Y-%m-%d %H:%M:%S")}
                users.append(u)
                save_users(users)
            log("新建用户", u["id"], name)
            return self._json(201, u)
        if path != "/api/stories":
            return self._json(404, {"error": "not found"})
        if not self._authed():
            return self._json(401, {"error": "bad token"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > 30 * 1024 * 1024:            # 10 分钟 WAV 约 19MB
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
        write_indexes()

    def do_PUT(self):
        """家人改错字：PUT /api/stories/<id>  {"text": "..."}。第一次改会把识别原文留在 asrText。"""
        path = urlparse(self.path).path
        m = re.match(r"^/api/stories/([A-Za-z0-9_-]+)$", path)
        if not m:
            return self._json(404, {"error": "not found"})
        if not self._authed("family"):
            return self._json(401, {"error": "bad token"})
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8")) if 0 < length <= 200000 else {}
        except Exception:
            body = {}
        d = INDEX.get(m.group(1))
        if not d:
            return self._json(404, {"error": "not found"})
        text = str(body.get("text") or "").strip()
        with LOCK:
            meta = read_meta(d)
            if "asrText" not in meta:
                meta["asrText"] = meta.get("text", "")
            meta["text"] = text
            meta["editedAt"] = time.strftime("%Y-%m-%d %H:%M:%S")
            write_meta(d, meta)
            (d / "transcript.txt").write_text(text + "\n", encoding="utf-8")
        write_indexes()
        log("文字已修改", d.name, f"{len(text)} 字")
        return self._json(200, {"ok": True, "id": meta["id"], "text": text})

    def do_DELETE(self):
        path = urlparse(self.path).path
        m = re.match(r"^/api/stories/([A-Za-z0-9_-]+)$", path)
        if not m:
            return self._json(404, {"error": "not found"})
        if not self._authed():
            return self._json(401, {"error": "bad token"})
        with LOCK:
            d = INDEX.pop(m.group(1), None)
        if d and d.exists():
            trash = STORIES / "_deleted"
            trash.mkdir(exist_ok=True)
            target, i = trash / d.name, 2
            while target.exists():
                target = trash / f"{d.name}_{i}"; i += 1
            d.rename(target)
            log("已删除（移到 _deleted，可找回）", d.name)
            write_indexes()
        return self._json(200, {"ok": True})

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
    write_indexes()
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
