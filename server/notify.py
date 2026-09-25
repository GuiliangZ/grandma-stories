"""新故事转写完成后通知家人：复用 ~/.claude/hooks/claude-notify.py 里的渠道（微信 OpenClaw / Server酱 / iMessage）。
10 分钟内的多条合并成一条；通知失败绝不影响录音和转写。config.json：
  "notify": {"enabled": true, "digest_minutes": 10, "attach_audio": true}
"""
import importlib.util
import json
import os
import pathlib
import subprocess
import threading
import time

HOOK = pathlib.Path.home() / ".claude" / "hooks" / "claude-notify.py"
_hook = None
_pending = []
_lock = threading.Lock()
_timer = None
_cfg = {}


def _load_hook():
    global _hook
    if _hook is None and HOOK.exists():
        spec = importlib.util.spec_from_file_location("claude_notify", HOOK)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _hook = mod
    return _hook


def configure(cfg):
    global _cfg
    _cfg = cfg or {}


def _to_m4a(wav):
    out = pathlib.Path(wav).with_suffix(".m4a")
    try:
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", str(wav), str(out)], check=True, timeout=120, capture_output=True)
        return out
    except Exception:
        return None


def _send(title, body, media=None):
    hook = _load_hook()
    if not hook:
        print("notify: 没找到 ~/.claude/hooks/claude-notify.py，跳过", flush=True)
        return
    env = hook.load_cfg()
    # 1) 微信（OpenClaw）：能带音频；奶奶讲完你在微信里直接听
    target = env.get("OPENCLAW_WEIXIN_TO")
    if target:
        try:
            exe = hook._openclaw_bin()
            penv = dict(os.environ); penv["PATH"] = os.path.dirname(exe) + os.pathsep + penv.get("PATH", "/usr/bin:/bin")
            cmd = [exe, "message", "send", "--json", "--channel", "openclaw-weixin", "--target", target, "-m", f"{title}\n{body}"]
            if media:
                cmd += ["--media", str(media)]
            res = subprocess.run(cmd, capture_output=True, text=True, env=penv, timeout=120)
            if '"deliveryStatus": "sent"' in res.stdout or ('"deliveryStatus"' in res.stdout and '"failed"' not in res.stdout):
                return "weixin"
        except Exception as e:
            print("notify weixin 失败:", repr(e)[:120], flush=True)
    # 2) Server酱（微信服务号推送，不受“15 分钟窗口”限制）
    if env.get("SERVERCHAN_SENDKEY"):
        try:
            hook.send_serverchan(env["SERVERCHAN_SENDKEY"], title, body); return "serverchan"
        except Exception as e:
            print("notify serverchan 失败:", repr(e)[:120], flush=True)
    # 3) iMessage 兜底
    if env.get("IMESSAGE_TO"):
        try:
            hook.send_imessage(env["IMESSAGE_TO"], title, body); return "imessage"
        except Exception as e:
            print("notify imessage 失败:", repr(e)[:120], flush=True)
    return None


def _flush():
    global _timer
    with _lock:
        items, _pending[:] = list(_pending), []
        _timer = None
    if not items:
        return
    lines, media = [], None
    for meta, d in items:
        who = meta.get("userName") or "奶奶"
        dur = int(meta.get("duration") or 0)
        q = meta.get("question") or ""
        if meta.get("followup"):
            q += f"（追问：{meta['followup']}）"
        if meta.get("status") == "done":
            lines.append(f"{who}｜{q}｜{dur // 60}分{dur % 60}秒\n{(meta.get('text') or '（没有识别出文字）')[:400]}")
        else:
            lines.append(f"{who}｜{q}｜转写失败：{(meta.get('error') or '')[:120]}")
        if media is None and _cfg.get("attach_audio", True) and meta.get("status") == "done" and d:
            media = _to_m4a(d / meta.get("audio", "audio.wav"))
    title = f"{items[0][0].get('userName') or '奶奶'}讲了{len(items)}个故事" if len(items) > 1 else f"{items[0][0].get('userName') or '奶奶'}讲了一个故事"
    via = _send(title, "\n\n".join(lines), media if len(items) == 1 else None)
    print(f"notify: {title} → {via or '所有渠道都失败'}", flush=True)
    if media:
        try: pathlib.Path(media).unlink()
        except Exception: pass


def on_story(meta, story_dir):
    """转写完成/失败时调用。合并 digest_minutes 内的多条。"""
    global _timer
    if not _cfg.get("enabled", False):
        return
    with _lock:
        _pending.append((dict(meta), pathlib.Path(story_dir)))
        if _timer is None:
            _timer = threading.Timer(max(0, float(_cfg.get("digest_minutes", 10))) * 60, _flush)
            _timer.daemon = True
            _timer.start()
