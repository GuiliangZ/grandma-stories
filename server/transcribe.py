"""把一段 16kHz 单声道 WAV 转成文字。按 config.json 里的 provider 分发到 providers/ 下的实现。"""
import importlib


def transcribe(wav_path: str, config: dict) -> str:
    provider = (config.get("provider") or "none").strip()
    if provider == "none":
        return ""
    mod = importlib.import_module(f"providers.{provider}")
    text = mod.transcribe(wav_path, config.get(provider) or {})
    return (text or "").strip()
