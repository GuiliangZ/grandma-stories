"""服务端语音合成：和 make_question_audio.py 同一个声音（Qwen3-TTS 四川话 Sunny），给用户自己加的问题生成语音。"""
import json
import pathlib
import subprocess
import tempfile
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent
_ds = None


def _setup():
    global _ds
    if _ds is not None:
        return _ds
    import dashscope
    cfg = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))["dashscope"]
    dashscope.api_key = cfg["api_key"]
    region = {"beijing": "cn-beijing", "singapore": "ap-southeast-1", "us": "us-east-1"}[cfg.get("region", "beijing")]
    ws = cfg.get("workspace_id") or ""
    dashscope.base_http_api_url = (f"https://{ws}.{region}.maas.aliyuncs.com/api/v1" if ws else
                                   {"cn-beijing": "https://dashscope.aliyuncs.com/api/v1", "ap-southeast-1": "https://dashscope-intl.aliyuncs.com/api/v1"}[region])
    _ds = dashscope
    return dashscope


def synth(text: str, out_m4a: pathlib.Path, voice: str = "Sunny") -> bool:
    try:
        ds = _setup()
        r = ds.MultiModalConversation.call(model="qwen3-tts-flash", text=text, voice=voice, language_type="Chinese", stream=False)
        if r.status_code != 200:
            raise RuntimeError(f"qwen-tts {r.status_code} {r.code} {r.message}")
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            with urllib.request.urlopen(r.output.audio["url"], timeout=60) as resp:
                tmp.write(resp.read())
            tmp_path = pathlib.Path(tmp.name)
        out_m4a.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", str(tmp_path), str(out_m4a)], check=True, timeout=60, capture_output=True)
        tmp_path.unlink(missing_ok=True)
        return True
    except Exception as e:
        print("tts 失败:", repr(e)[:160], flush=True)
        return False
