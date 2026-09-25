"""音频小工具：确保是 16kHz 单声道 16bit WAV；按静音切段（有的引擎一次只收 60 秒）。只用标准库 + macOS 自带 afconvert。"""
import contextlib
import pathlib
import struct
import subprocess
import wave


def read_pcm(path):
    """读 WAV，返回 (channels, sampwidth, rate, pcm_bytes)。
    自己解析 RIFF：afconvert 出来的文件用 WAVE_FORMAT_EXTENSIBLE(65534)，Python 的 wave 模块不认。"""
    data = pathlib.Path(path).read_bytes()
    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError("not a WAV file")
    pos, fmt, pcm = 12, None, None
    while pos + 8 <= len(data):
        cid, size = data[pos:pos + 4], struct.unpack("<I", data[pos + 4:pos + 8])[0]
        body = data[pos + 8:pos + 8 + size]
        if cid == b"fmt ":
            tag, ch, rate, _br, _ba, bits = struct.unpack("<HHIIHH", body[:16])
            if tag == 65534 and len(body) >= 26:
                tag = struct.unpack("<H", body[24:26])[0]          # 扩展格式里的真正编码
            if tag != 1:
                raise ValueError(f"unsupported WAV encoding tag {tag}")
            fmt = (ch, bits // 8, rate)
        elif cid == b"data":
            pcm = body
        pos += 8 + size + (size & 1)
    if fmt is None or pcm is None:
        raise ValueError("WAV missing fmt/data chunk")
    return fmt[0], fmt[1], fmt[2], pcm


def wav_info(path):
    ch, sw, rate, pcm = read_pcm(path)
    return ch, sw, rate, len(pcm) // max(1, ch * sw)


def write_wav(path, pcm: bytes, rate=16000):
    with contextlib.closing(wave.open(str(path), "wb")) as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)


def ensure_wav16k(src: pathlib.Path) -> pathlib.Path:
    """返回一个 16kHz/单声道/16bit 标准 wav 的路径（可能就是 src 本身）。其他格式用 afconvert 转（webm 转不了）。"""
    src = pathlib.Path(src)
    if src.suffix.lower() == ".wav":
        try:
            ch, sw, rate, _ = wav_info(src)
            if ch == 1 and sw == 2 and rate == 16000:
                return src
        except Exception:
            pass
    tmp = src.with_name(src.stem + ".afconvert.wav")
    out = src.with_name(src.stem + ".16k.wav")
    subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", str(src), str(tmp)], check=True)
    _ch, _sw, _rate, pcm = read_pcm(tmp)          # afconvert 的头是扩展格式，重写成标准头
    write_wav(out, pcm, 16000)
    tmp.unlink()
    return out


def duration_seconds(path) -> float:
    _, _, rate, n = wav_info(path)
    return n / rate


def split_on_silence(path, max_seconds=55.0, min_seconds=20.0, frame_ms=30, silence_thresh=500):
    """把长 wav 切成 ≤max_seconds 的片段，尽量在静音处切。返回 [(start_sec, end_sec, bytes)]。"""
    ch, sw, rate, pcm = read_pcm(path)
    assert ch == 1 and sw == 2, "need mono 16-bit"
    frame = int(rate * frame_ms / 1000)
    nframes = len(pcm) // (frame * 2)
    energy = []
    for i in range(nframes):
        chunk = pcm[i * frame * 2:(i + 1) * frame * 2]
        vals = struct.unpack(f"<{len(chunk) // 2}h", chunk)
        energy.append(sum(abs(v) for v in vals) / max(1, len(vals)))
    segments, start = [], 0
    max_f, min_f = int(max_seconds * 1000 / frame_ms), int(min_seconds * 1000 / frame_ms)
    while start < nframes:
        end = min(start + max_f, nframes)
        if end < nframes:
            # 在 [start+min_f, end] 里找最安静的一帧来切
            lo = start + min_f
            quiet = min(range(lo, end), key=lambda i: energy[i]) if lo < end else end
            if energy[quiet] < silence_thresh:
                end = quiet
        a, b = start * frame * 2, end * frame * 2
        segments.append((start * frame / rate, end * frame / rate, pcm[a:b]))
        start = end
    return segments


def pcm_to_wav_bytes(pcm: bytes, rate=16000) -> bytes:
    import io
    buf = io.BytesIO()
    with contextlib.closing(wave.open(buf, "wb")) as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(pcm)
    return buf.getvalue()
