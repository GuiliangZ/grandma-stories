#!/usr/bin/env python3
"""用 macOS 自带的中文语音（默认「婷婷」）把每个问题读成 m4a，放到 web/audio/q/ 里。

用法：
    python3 make_question_audio.py            # 用 Tingting
    python3 make_question_audio.py Meijia     # 换别的声音（say -v '?' 可以看有哪些）
改了 web/questions.js 之后重新跑一遍即可。
"""
import json
import pathlib
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parent
site = root / "web" if (root / "web" / "questions.js").exists() else root   # 源码目录用 web/，发布目录是平铺的
src = (site / "questions.js").read_text(encoding="utf-8")
questions = json.loads(src[src.index("["): src.rindex("]") + 1])

out = site / "audio" / "q"
out.mkdir(parents=True, exist_ok=True)
voice = sys.argv[1] if len(sys.argv) > 1 else "Tingting"

for q in questions:
    target = out / f"{q['id']}.m4a"
    tmp = out / f"{q['id']}.aiff"
    # say 直接输出 m4a 是无压缩的 PCM，安卓/Chrome 放不了，所以先出 aiff 再用 afconvert 压成 AAC
    subprocess.run(["say", "-v", voice, "-r", "150", "-o", str(tmp), q["text"]], check=True)
    subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", str(tmp), str(target)], check=True)
    tmp.unlink()
    print("✓", target.name, q["text"])
print(f"完成：{len(questions)} 条语音已生成到 {out}")
