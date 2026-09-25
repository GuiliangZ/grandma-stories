#!/usr/bin/env python3
"""用 macOS 自带的中文语音（默认「婷婷」）生成两组语音：
  问题       web/questions.js   → web/audio/q/<id>.m4a
  按键反馈   web/ui-phrases.js  → web/audio/ui/<key>.m4a

用法：
    python3 make_question_audio.py            # 用 Tingting
    python3 make_question_audio.py Meijia     # 换别的声音（say -v '?' 可以看有哪些）
改了 questions.js / ui-phrases.js 之后重新跑一遍即可（没变的不会重做）。
"""
import hashlib
import json
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parent
site = root / "web" if (root / "web" / "questions.js").exists() else root   # 源码目录用 web/，发布目录是平铺的
voice = sys.argv[1] if len(sys.argv) > 1 else "Tingting"


def load_js(name, opener, closer):
    src = (site / name).read_text(encoding="utf-8")
    return json.loads(src[src.index(opener): src.rindex(closer) + 1])


def make(text, target):
    stamp = target.with_suffix(".txt")
    key = f"{voice}|{text}"
    if target.exists() and stamp.exists() and stamp.read_text(encoding="utf-8") == key:
        return False
    tmp = target.with_suffix(".aiff")
    # say 直接输出 m4a 是无压缩的 PCM，安卓/Chrome 放不了，所以先出 aiff 再用 afconvert 压成 AAC
    subprocess.run(["say", "-v", voice, "-r", "150", "-o", str(tmp), text], check=True)
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
for key, text in phrases.items():
    if make(text, outu / f"{key}.m4a"):
        n += 1; print("✓ 按键", key, text)
print(f"完成：新生成 {n} 条；问题 {len(questions)} 条在 {outq}，按键 {len(phrases)} 条在 {outu}")
