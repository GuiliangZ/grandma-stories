"""阿里云百炼（DashScope）语音识别 —— 官方文档明确列出支持四川话。
文档：https://help.aliyun.com/zh/model-studio/asr-model （语言列表）

config.json 里：
  "provider": "dashscope",
  "dashscope": {
    "api_key": "sk-...",                    # 百炼控制台 → API-KEY。北京 / 新加坡 / 美国 的 Key 不通用
    "model":   "paraformer-realtime-v2",    # 见下
    "region":  "beijing"                    # beijing | singapore | us
  }

两种模型：
  paraformer-realtime-v2  只在【北京】地域。本地文件直接流式识别，时长不限，四川话在 zh 里。
                          需要中国站阿里云账号（免费额度不用实名，超出后按量付费要实名）。
  qwen3-asr-flash         北京 / 新加坡 / 美国 都有。单次 ≤5 分钟 ≤10MB，程序会自动按静音切成 ≤4.5 分钟的段。
                          海外账号（alibabacloud.com，新加坡地域）也能开通，适合人在国外。
pip install dashscope
"""
import os
import pathlib
import tempfile
from http import HTTPStatus

import audio_tools

ENDPOINTS = {
    # (http, websocket)。新域名是 https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1，旧域名仍可用，这里用旧域名省得填 WorkspaceId
    "beijing":   ("https://dashscope.aliyuncs.com/api/v1",      "wss://dashscope.aliyuncs.com/api-ws/v1/inference"),
    "singapore": ("https://dashscope-intl.aliyuncs.com/api/v1", "wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference"),
    "us":        ("https://dashscope-us.aliyuncs.com/api/v1",   "wss://dashscope-us.aliyuncs.com/api-ws/v1/inference"),
}


def _setup(cfg):
    import dashscope
    key = cfg.get("api_key") or os.environ.get("DASHSCOPE_API_KEY")
    if not key:
        raise RuntimeError("dashscope.api_key 没填（config.json → dashscope.api_key）")
    dashscope.api_key = key
    region = (cfg.get("region") or "beijing").lower()
    if region not in ENDPOINTS:
        raise RuntimeError(f"dashscope.region 只能是 {list(ENDPOINTS)}，现在是 {region!r}")
    http_url, ws_url = ENDPOINTS[region]
    dashscope.base_http_api_url = http_url
    dashscope.base_websocket_api_url = ws_url
    return dashscope, region


def _paraformer_realtime(dashscope, model, wav_path):
    from dashscope.audio.asr import Recognition
    rec = Recognition(model=model, format="wav", sample_rate=16000, language_hints=["zh"], callback=None)
    result = rec.call(str(wav_path))
    if result.status_code != HTTPStatus.OK:
        raise RuntimeError(f"{model}: {result.status_code} {result.message}")
    sentences = result.get_sentence() or []
    return "".join(s.get("text", "") for s in sentences if isinstance(s, dict))


def _qwen_flash_once(dashscope, model, wav_path):
    messages = [{"role": "user", "content": [{"audio": "file://" + str(pathlib.Path(wav_path).resolve())}]}]
    resp = dashscope.MultiModalConversation.call(
        model=model, messages=messages, result_format="message",
        asr_options={"language": "zh", "enable_itn": False},   # zh 包含普通话、四川话、闽南语、吴语
    )
    if resp.status_code != HTTPStatus.OK:
        raise RuntimeError(f"{model}: {resp.status_code} {resp.code} {resp.message}")
    content = resp.output.choices[0].message.content
    if isinstance(content, list):
        return "".join(c.get("text", "") for c in content if isinstance(c, dict))
    return str(content)


def _qwen_flash(dashscope, model, wav_path):
    # 单次最多 5 分钟 / 10MB：超过就按静音切段，逐段识别再拼起来
    if audio_tools.duration_seconds(wav_path) <= 280:
        return _qwen_flash_once(dashscope, model, wav_path)
    texts = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, (a, b, pcm) in enumerate(audio_tools.split_on_silence(wav_path, max_seconds=270, min_seconds=120)):
            piece = pathlib.Path(tmp) / f"part{i:03d}.wav"
            piece.write_bytes(audio_tools.pcm_to_wav_bytes(pcm))
            texts.append(_qwen_flash_once(dashscope, model, piece))
    return "".join(texts)


def transcribe(wav_path, cfg):
    dashscope, region = _setup(cfg)
    model = cfg.get("model") or "paraformer-realtime-v2"
    if model.startswith("paraformer-realtime"):
        if region != "beijing":
            raise RuntimeError("paraformer-realtime-v2 只在北京地域提供；海外账号请把 model 改成 qwen3-asr-flash")
        return _paraformer_realtime(dashscope, model, wav_path)
    if model.startswith("qwen3-asr-flash"):
        return _qwen_flash(dashscope, model, wav_path)
    raise RuntimeError(f"不认识的 dashscope 模型：{model}")
