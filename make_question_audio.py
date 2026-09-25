#!/usr/bin/env python3
"""生成语音：问题（含追问）和按键反馈。
  web/questions.js   → web/audio/q/<id>.m4a、<id>-f1.m4a、<id>-f2.m4a（追问）
  web/ui-phrases.js  → web/audio/ui/<key>.m4a

用法：
    python3 make_question_audio.py                 # 默认：qwen:Sunny（阿里云 Qwen-TTS 四川话女声，用 server/config.json 里的 key）
    python3 make_question_audio.py Tingting        # macOS 自带普通话（离线）
    python3 make_question_audio.py qwen:Cherry     # 换别的 Qwen 音色
没变的不会重做（按「声音|文字」记在旁边的 .txt 里）。
"""
import json
import pathlib
import subprocess
import sys
import urllib.request

root = pathlib.Path(__file__).resolve().parent
site = root / "web" if (root / "web" / "questions.js").exists() else root
voice = sys.argv[1] if len(sys.argv) > 1 else "qwen:Sunny"


def load_js(name, opener, closer):
    src = (site / name).read_text(encoding="utf-8")
    return json.loads(src[src.index(opener): src.rindex(closer) + 1])


def synth_say(text, aiff):
    subprocess.run(["say", "-v", voice, "-r", "150", "-o", str(aiff), text], check=True)


_ds = None
def synth_qwen(text, out_wav):
    """Qwen3-TTS（四川话音色 Sunny 等）。需要 server/config.json 里的 dashscope key（新加坡/北京地域都行）。"""
    global _ds
    import dashscope
    if _ds is None:
        cfg = json.loads((root / "server" / "config.json").read_text(encoding="utf-8"))["dashscope"]
        dashscope.api_key = cfg["api_key"]
        region = {"beijing": "cn-beijing", "singapore": "ap-southeast-1", "us": "us-east-1"}[cfg.get("region", "beijing")]
        ws = cfg.get("workspace_id") or ""
        dashscope.base_http_api_url = (f"https://{ws}.{region}.maas.aliyuncs.com/api/v1" if ws else
                                       {"cn-beijing": "https://dashscope.aliyuncs.com/api/v1", "ap-southeast-1": "https://dashscope-intl.aliyuncs.com/api/v1"}[region])
        _ds = dashscope
    qv = voice.split(":", 1)[1]
    r = _ds.MultiModalConversation.call(model="qwen3-tts-flash", text=text, voice=qv, language_type="Chinese", stream=False)
    if r.status_code != 200:
        raise RuntimeError(f"qwen-tts {r.status_code} {r.code} {r.message}")
    url = r.output.audio["url"]
    with urllib.request.urlopen(url, timeout=60) as resp:
        out_wav.write_bytes(resp.read())


def make(text, target):
    stamp = target.with_suffix(".txt")
    key = f"{voice}|{text}"
    if target.exists() and stamp.exists() and stamp.read_text(encoding="utf-8") == key:
        return False
    tmp = target.with_suffix(".tmp.wav" if voice.startswith("qwen:") else ".aiff")
    if voice.startswith("qwen:"):
        synth_qwen(text, tmp)
    else:
        synth_say(text, tmp)
    # afconvert 压成 AAC（say 直接输出的 m4a 是无压缩 PCM，安卓放不了）
    subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", str(tmp), str(target)], check=True)
    tmp.unlink()
    stamp.write_text(key, encoding="utf-8")
    return True


questions = load_js("questions.js", "[", "]")
phrases = load_js("ui-phrases.js", "{", "}")
outq = site / "audio" / "q"; outq.mkdir(parents=True, exist_ok=True)
outu = site / "audio" / "ui"; outu.mkdir(parents=True, exist_ok=True)

n = 0
for q in questions:
    if make(q["text"], outq / f"{q['id']}.m4a"):
        n += 1; print("✓ 问题", q["id"], q["text"])
    for i, fu in enumerate(q.get("followups") or [], 1):
        if make(fu, outq / f"{q['id']}-f{i}.m4a"):
            n += 1; print("✓ 追问", f"{q['id']}-f{i}", fu)
for key, text in phrases.items():
    if make(text, outu / f"{key}.m4a"):
        n += 1; print("✓ 按键", key, text)
print(f"完成：新生成 {n} 条（声音：{voice}）；问题 {len(questions)} 条在 {outq}，按键 {len(phrases)} 条在 {outu}")
