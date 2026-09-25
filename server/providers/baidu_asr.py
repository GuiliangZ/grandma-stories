"""百度智能云 · 短语音识别标准版 —— dev_pid=1837 是官方的「四川话模型」。
文档：https://cloud.baidu.com/doc/SPEECH/s/Jlbxdezuf （dev_pid 表：1837 | 四川话 | 四川话模型 | 有标点）

config.json 里：
  "provider": "baidu",
  "baidu": { "api_key": "...", "secret_key": "...", "dev_pid": 1837 }
密钥：百度智能云控制台 → 语音技术 → 应用列表 → 创建应用，拿 API Key / Secret Key。
需要百度智能云账号并完成实名认证；四川话个人认证有 3 万次免费额度（长期有效）。

限制：每次请求 ≤60 秒、16kHz 16bit 单声道。程序会把长录音按静音切成 ≤55 秒的段，逐段识别再拼起来。
只用标准库，不用 pip 装东西。
"""
import base64
import json
import os
import time
import urllib.parse
import urllib.request
import uuid

import audio_tools

TOKEN_URL = "https://aip.baidubce.com/oauth/2.0/token"
ASR_URL = "https://vop.baidu.com/server_api"
_token = {"value": None, "expires_at": 0}

ERRORS = {
    3300: "输入参数不正确", 3301: "音频质量过差", 3302: "鉴权失败（Key/Secret 不对，或额度、并发超限）",
    3303: "百度服务器繁忙", 3304: "并发超限", 3305: "当日调用量超限", 3307: "识别服务错误",
    3308: "音频过长（>60s）", 3309: "音频数据问题", 3310: "音频文件过大", 3311: "采样率不对（要 16000）",
    3312: "音频格式不对",
}


def _post_json(url, obj, timeout=60):
    data = json.dumps(obj).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def get_token(cfg):
    if _token["value"] and time.time() < _token["expires_at"] - 3600:
        return _token["value"]
    ak = cfg.get("api_key") or os.environ.get("BAIDU_API_KEY")
    sk = cfg.get("secret_key") or os.environ.get("BAIDU_SECRET_KEY")
    if not ak or not sk:
        raise RuntimeError("baidu.api_key / secret_key 没填（config.json → baidu）")
    q = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": ak, "client_secret": sk})
    req = urllib.request.Request(TOKEN_URL + "?" + q, data=b"", method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        j = json.loads(r.read().decode("utf-8"))
    if "access_token" not in j:
        raise RuntimeError(f"百度取 token 失败：{j.get('error')} {j.get('error_description')}")
    _token.update(value=j["access_token"], expires_at=time.time() + int(j.get("expires_in", 2592000)))
    return _token["value"]


def recognize_pcm(pcm: bytes, cfg) -> str:
    """pcm: ≤60 秒的 16kHz 16bit 单声道原始数据。"""
    body = {
        "format": "pcm", "rate": 16000, "channel": 1,
        "cuid": cfg.get("cuid") or f"grandma-{uuid.getnode():x}",
        "token": get_token(cfg),
        "dev_pid": int(cfg.get("dev_pid") or 1837),      # 1837 = 四川话
        "speech": base64.b64encode(pcm).decode("ascii"),
        "len": len(pcm),                                 # base64 之前的字节数
    }
    for attempt in range(3):
        res = _post_json(ASR_URL, body)
        err = res.get("err_no", 0)
        if err == 0:
            return "".join(res.get("result") or [])
        if err in (3303, 3304) and attempt < 2:          # 繁忙/并发：歇一下重试
            time.sleep(2 + attempt * 3)
            continue
        if err == 3301:                                  # 这一段太安静/听不清，跳过
            return ""
        raise RuntimeError(f"百度识别失败 err_no={err} {ERRORS.get(err, '')} {res.get('err_msg', '')}")
    return ""


def transcribe(wav_path, cfg):
    texts = []
    for _a, _b, pcm in audio_tools.split_on_silence(wav_path, max_seconds=55, min_seconds=20):
        if len(pcm) < 16000 * 2 * 0.5:                    # 不到半秒的碎片不送
            continue
        texts.append(recognize_pcm(pcm, cfg))
    return "".join(texts)
