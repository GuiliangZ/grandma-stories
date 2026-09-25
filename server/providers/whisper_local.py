"""本地离线转写（faster-whisper）。只认普通话，四川话会错很多，只当没有网络时的兜底。
pip install faster-whisper   第一次会下载模型（small 约 500MB）。"""
_model = None


def transcribe(wav_path, cfg):
    global _model
    from faster_whisper import WhisperModel
    if _model is None:
        _model = WhisperModel(cfg.get("model") or "small", device="cpu", compute_type="int8")
    segments, _info = _model.transcribe(
        wav_path, language="zh", beam_size=5, vad_filter=True,
        initial_prompt="以下是普通话的对话记录，用简体中文。",
    )
    return "".join(seg.text for seg in segments)
