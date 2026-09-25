"""把一段 16kHz 单声道 WAV 转成文字。按 config.json 里的 provider 分发到 providers/ 下的实现。"""
import importlib

PROVIDERS = {
    "dashscope": "providers.dashscope_asr",   # 阿里云百炼（支持四川话）
    "baidu":     "providers.baidu_asr",       # 百度 dev_pid=1837 四川话模型
    "whisper":   "providers.whisper_local",   # 本地离线，只认普通话
}


def transcribe(wav_path: str, config: dict) -> str:
    provider = (config.get("provider") or "none").strip()
    if provider == "none":
        return ""
    if provider not in PROVIDERS:
        raise RuntimeError(f"config.json 里的 provider 只能是 {['none', *PROVIDERS]}，现在是 {provider!r}")
    mod = importlib.import_module(PROVIDERS[provider])
    text = mod.transcribe(wav_path, config.get(provider) or {})
    return (text or "").strip()
