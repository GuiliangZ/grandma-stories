// 用 Web Audio 直接采样，边录边降到 16kHz 单声道，停止时拼成 WAV。
// 这样安卓/苹果录出来的都是同一种格式，语音识别引擎（四川话模型）直接就能用，电脑上也不需要 ffmpeg。
window.WavRecorder = (() => {
  const TARGET = 16000;
  let ctx = null, stream = null, source = null, processor = null, mute = null;
  let chunks = [], leftover = null, capturing = false, inputRate = TARGET, samples = 0;
  let drained = 0, onInterrupted = null;

  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.AudioContext || window.webkitAudioContext));
  }
  // 必须在用户点按里同步调用（iPhone 要求），之后整个会话复用
  function ensureContext() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    try { ctx = new AC({ sampleRate: TARGET }); } catch (_) { ctx = new AC(); }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function push(input) {
    const buf = leftover && leftover.length ? concat(leftover, input) : input;
    const ratio = inputRate / TARGET;
    const outLen = Math.floor(buf.length / ratio);
    const out = new Int16Array(outLen);
    let i = 0;
    for (let o = 0; o < outLen; o++) {
      const next = Math.round((o + 1) * ratio);
      let sum = 0, n = 0;
      for (; i < next && i < buf.length; i++) { sum += buf[i]; n++; }
      const v = n ? sum / n : 0;
      out[o] = v < 0 ? Math.max(-1, v) * 0x8000 : Math.min(1, v) * 0x7FFF;
    }
    leftover = buf.subarray(i);
    chunks.push(out);
    samples += outLen;
  }
  function concat(a, b) { const c = new Float32Array(a.length + b.length); c.set(a); c.set(b, a.length); return c; }

  async function open() {
    ensureContext();
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    inputRate = ctx.sampleRate;
    // 来电话、被别的 App 抢走麦克风、iPhone 锁屏：轨道会结束或 AudioContext 变成 interrupted，通知上层赶紧把讲到的存下来
    const track = stream.getAudioTracks()[0];
    if (track) track.onended = () => { if (capturing && onInterrupted) onInterrupted('track-ended'); };
    ctx.onstatechange = () => { if (capturing && ctx.state !== 'running' && onInterrupted) onInterrupted('audiocontext-' + ctx.state); };
    source = ctx.createMediaStreamSource(stream);
    processor = ctx.createScriptProcessor(4096, 1, 1);
    mute = ctx.createGain();
    mute.gain.value = 0;             // 不然麦克风会从喇叭放出来
    processor.onaudioprocess = (e) => { if (capturing) push(new Float32Array(e.inputBuffer.getChannelData(0))); };
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);
  }
  function start() { chunks = []; leftover = null; samples = 0; drained = 0; capturing = true; }
  // 把上次 drain 之后新采到的块交出去（用来每隔几秒存草稿）
  function drain() { const out = chunks.slice(drained); drained = chunks.length; return out; }
  function pause() { capturing = false; }
  function resume() { capturing = true; }
  function close() {
    capturing = false;
    try { if (processor) { processor.onaudioprocess = null; processor.disconnect(); } if (source) source.disconnect(); if (mute) mute.disconnect(); } catch (_) {}
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = source = processor = mute = null;
  }
  function stop() {
    capturing = false;
    const blob = encodeWav(chunks, samples, TARGET);
    close();
    return blob;
  }
  function cancel() { close(); chunks = []; samples = 0; }
  function encodeWav(parts, n, rate) {
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    const out = new Int16Array(buf, 44);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return new Blob([buf], { type: 'audio/wav' });
  }
  return { supported, ensureContext, open, start, pause, resume, stop, cancel, drain, encodeWav,
    seconds: () => samples / TARGET, isCapturing: () => capturing,
    onInterrupted: (cb) => { onInterrupted = cb; } };
})();
