/* 自动生成，不要手改：改 web/*.js 再跑 make_bundle.py  v=9b1b3640c9 */
/* ===== config.js ===== */
// ====== 这里是可以改的设置 ======
window.APP_CONFIG = {
  name: '奶奶',            // 称呼
  // 电脑上转写服务的 HTTPS 地址，例如 'https://xxxx.trycloudflare.com'（运行 server/run.sh 会打印）。
  // 也可以不改这里，直接在网址后面加 ?server=https://...&token=... 一次性设置，手机会记住。
  serverUrl: '',
  serverToken: '',
  questionAudioDir: 'audio/q/',   // 问题语音
  uiAudioDir: 'audio/ui/',        // 按键语音反馈
  liveCaptions: true,             // 手机支持时显示初步文字（普通话引擎，四川话不准；最终以电脑整理的为准）
};

/* ===== questions.js ===== */
// 问题库：想加、想改直接编辑这里（保持 JSON 格式），然后运行 make_question_audio.py 重新生成语音。
// id 只用英文和横线（会当文件名用）；stage 是阶段标签；text 是读给奶奶听、显示给奶奶看的问题。
window.QUESTIONS = [
  {"id": "childhood-home",    "stage": "童年",      "text": "您小时候住在哪里？家里是什么样子的？"},
  {"id": "childhood-home",    "stage": "童年",      "text": "您小时候家里有几口人？大院子里是怎么个情况？"},
  {"id": "parents",           "stage": "童年",      "text": "您的爸爸妈妈是什么样的人？您对您的爸爸妈妈还有什么样的映像？"},
  {"id": "parents",           "stage": "童年",      "text": "您的爸爸妈妈是怎么去世的？"},
  {"id": "childhood-happy",   "stage": "童年",      "text": "您小时候最满意最开心的一件事是什么？"},
  {"id": "childhood-food",    "stage": "童年",      "text": "小时候家里都吃些什么？您最爱吃什么？"},
  {"id": "school",            "stage": "童年",      "text": "您上过学吗？还记得学校里的事情吗？"},
  {"id": "siblings",          "stage": "童年",      "text": "您有几个兄弟姐妹？小时候你们常在一起做什么？"},
  {"id": "hometown",          "stage": "家乡",      "text": "您年轻的时候，那个时候棉竹是什么样子的？成都又是啥子样子的"},
  {"id": "festival",          "stage": "家乡",      "text": "小时候过年是怎么过的？"},
  {"id": "young-dream",       "stage": "年轻时候",  "text": "您年轻的时候，最大的心愿是什么？"},
  {"id": "first-job",         "stage": "年轻时候",  "text": "您以前是从什么时候开始下田干活的？能挣多少工分？"},
  {"id": "meet-husband",      "stage": "爱情和婚姻", "text": "您和您的丈夫是怎么认识的？"},
  {"id": "after-marriage",    "stage": "爱情和婚姻", "text": "你和你丈夫结婚以后，日子是怎么过的？过得怎么样？"},
  {"id": "wedding",           "stage": "爱情和婚姻", "text": "您结婚那天是什么样的？"},
  {"id": "marriage-life",     "stage": "爱情和婚姻", "text": "刚结婚的时候，你们的日子是怎么过的？"},
  {"id": "first-child",       "stage": "孩子",      "text": "第一个孩子大姐出生的时候，您是什么心情？有什么想法？当时家里情况怎么样？"},
  {"id": "second-child",       "stage": "孩子",      "text": "第二个孩子二姐出生的时候，您是什么心情？有什么想法？当时家里情况怎么样？"},
  {"id": "third-child",       "stage": "孩子",      "text": "第三个孩子龙儿子出生的时候，您是什么心情？有什么想法？当时家里情况怎么样？"},
  {"id": "raising-kids",      "stage": "孩子",      "text": "带孩子，孩子长大的那些年，最难忘的是什么？"},
  {"id": "hard-times",        "stage": "人生",      "text": "这辈子最辛苦的一段日子是什么时候？是怎么熬过来的？"},
  {"id": "proud",             "stage": "人生",      "text": "您这辈子最骄傲的一件事是什么？"},
  {"id": "unforgettable-day", "stage": "人生",      "text": "您最难忘的一天是哪一天？"},
  {"id": "advice",            "stage": "人生",      "text": "您最想对孙子孙女说的话是什么？"},
  {"id": "wish",              "stage": "人生",      "text": "您现在最大的心愿是什么？"},
  {"id": "regret",              "stage": "人生",      "text": "您现在最大的遗憾是什么？"}
];

/* ===== ui-phrases.js ===== */
// 每个按键按下去时读出来的话（键名 → 话）。改完运行 make_question_audio.py 重新生成 audio/ui/*.m4a
window.UI_PHRASES = {
  "start":     "好，我们开始讲故事",
  "list":      "这是您讲过的故事",
  "home":      "回到首页",
  "replay":    "再听一遍",
  "record":    "开始录音了，请讲",
  "skip":      "换一个问题",
  "stop":      "好，录好了",
  "cancel":    "这段不要了吗",
  "discard":   "好，这段不要了",
  "continue":  "好，继续讲",
  "play":      "放给您听",
  "pause":     "暂停了",
  "save":      "已经保存好了",
  "redo":      "好，重新讲一遍",
  "next":      "下一个问题",
  "bye":       "好，今天先到这里，谢谢您",
  "back":      "返回",
  "open":      "打开这个故事",
  "ok":        "好",
  "mic_error": "没有听到声音，请允许使用麦克风",
  "open_browser": "请点右上角的三个点，选在浏览器打开，再试一次"
};

/* ===== storage.js ===== */
// 手机本地存储（IndexedDB）：录音和文字先存在手机里，之后再同步到电脑。
// 录音以 ArrayBuffer 存（有的手机浏览器不肯把 Blob 存进 IndexedDB），读出来再拼回 Blob。
window.StoryStore = (() => {
  const DB_NAME = 'grandma-stories';
  const STORE = 'stories';
  const VERSION = 1;

  function open() {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, VERSION); } catch (e) { return reject(e); }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('indexedDB open failed'));
      req.onblocked = () => reject(new Error('indexedDB blocked'));
    });
  }

  async function run(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(STORE, mode); } catch (e) { db.close(); return reject(e); }
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error('indexedDB tx failed')); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('indexedDB tx aborted')); };
    });
  }

  function toBuffer(blob) {
    if (!blob) return Promise.resolve(null);
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(blob);
    });
  }
  function hydrate(rec) {
    if (!rec) return rec;
    const { audioBuf, ...rest } = rec;
    if (audioBuf && !rest.audio) rest.audio = new Blob([audioBuf], { type: rest.mimeType || 'audio/wav' });
    return rest;
  }

  return {
    async save(story) {
      const { audio, audioUrl, remote, ...rest } = story;
      const rec = { ...rest };
      if (audio) { rec.audioBuf = await toBuffer(audio); rec.mimeType = rec.mimeType || audio.type || 'audio/wav'; }
      return run('readwrite', (s) => s.put(rec));
    },
    async all() {
      const list = (await run('readonly', (s) => s.getAll())) || [];
      return list.map(hydrate).sort((a, b) => b.createdAt - a.createdAt);
    },
    remove: (id) => run('readwrite', (s) => s.delete(id)),
  };
})();

/* ===== speaker.js ===== */
// 语音播报：按键反馈 + 读问题。优先放电脑上预先生成的 m4a，放不了就用手机自带的朗读。
// 所有播报共用一个 <audio>，因为 iPhone 只允许在点按里"解锁"过的 audio 元素之后再自动播放。
window.Speaker = (() => {
  const el = document.getElementById('prompt-audio');
  let cfg = { uiDir: 'audio/ui/', questionDir: 'audio/q/', phrases: {} };
  let queue = [];
  let playing = false;
  let cancelCurrent = null;
  let idleResolvers = [];
  let voices = [];

  function loadVoices() { if ('speechSynthesis' in window) voices = speechSynthesis.getVoices(); }
  loadVoices();
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = loadVoices;

  function playFile(src) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (r) => { if (done) return; done = true; el.onended = el.onerror = el.onpause = null; cancelCurrent = null; resolve(r); };
      cancelCurrent = () => { el.pause(); finish('cancelled'); };
      el.onended = () => finish(true);
      el.onpause = () => finish(true);     // iPhone 打开麦克风时可能把它暂停掉，当作放完
      el.onerror = () => finish(false);
      el.src = src;
      const p = el.play();
      if (p && p.catch) p.catch(() => finish(false));
    });
  }
  function tts(text) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window) || !text) return resolve(false);
      let done = false;
      const finish = (r) => { if (done) return; done = true; cancelCurrent = null; resolve(r); };
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 0.8;
      const v = voices.find((x) => /zh[-_]CN/i.test(x.lang)) || voices.find((x) => /^zh/i.test(x.lang));
      if (v) u.voice = v;
      u.onend = () => finish(true);
      u.onerror = () => finish(false);
      cancelCurrent = () => { speechSynthesis.cancel(); finish('cancelled'); };
      speechSynthesis.speak(u);
      setTimeout(() => finish(false), 15000);   // 保险：别卡死
    });
  }
  async function run() {
    if (playing) return;
    playing = true;
    while (queue.length) {
      const item = queue.shift();
      let r = item.src ? await playFile(item.src) : false;
      if (r === false && item.text) r = await tts(item.text);
      item.done(r !== 'cancelled');
    }
    playing = false;
    idleResolvers.splice(0).forEach((f) => f(true));
  }
  function enqueue(item, clear) {
    if (clear) stop();
    return new Promise((resolve) => { queue.push({ ...item, done: resolve }); run(); });
  }
  function stop() { queue = []; if (cancelCurrent) cancelCurrent(); }

  const api = {
    last: Promise.resolve(true),   // 最近一次按键反馈的 Promise：放完 true，被别的按键打断 false
    configure(c) { cfg = { ...cfg, ...c }; },
    // 按键反馈：默认打断正在播的
    say(key, opts = {}) {
      const text = cfg.phrases[key] || '';
      const p = enqueue({ src: cfg.uiDir + key + '.m4a', text }, opts.clear !== false);
      api.last = p;
      return p;
    },
    // 读问题：默认排在按键反馈后面
    question(q, opts = {}) { return enqueue({ src: cfg.questionDir + q.id + '.m4a', text: q.text }, opts.clear === true); },
    stop,
    idle() { return playing ? new Promise((r) => idleResolvers.push(r)) : Promise.resolve(true); },
    // 等某次播报，但最多等 ms 毫秒
    wait(p, ms) { return Promise.race([p, new Promise((r) => setTimeout(() => r(true), ms))]); },
  };
  return api;
})();

/* ===== recorder.js ===== */
// 用 Web Audio 直接采样，边录边降到 16kHz 单声道，停止时拼成 WAV。
// 这样安卓/苹果录出来的都是同一种格式，语音识别引擎（四川话模型）直接就能用，电脑上也不需要 ffmpeg。
window.WavRecorder = (() => {
  const TARGET = 16000;
  let ctx = null, stream = null, source = null, processor = null, mute = null;
  let chunks = [], leftover = null, capturing = false, inputRate = TARGET, samples = 0;

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
    source = ctx.createMediaStreamSource(stream);
    processor = ctx.createScriptProcessor(4096, 1, 1);
    mute = ctx.createGain();
    mute.gain.value = 0;             // 不然麦克风会从喇叭放出来
    processor.onaudioprocess = (e) => { if (capturing) push(new Float32Array(e.inputBuffer.getChannelData(0))); };
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);
  }
  function start() { chunks = []; leftover = null; samples = 0; capturing = true; }
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
  return { supported, ensureContext, open, start, pause, resume, stop, cancel, seconds: () => samples / TARGET };
})();

/* ===== app.js ===== */
(() => {
  'use strict';

  // ====== 设置在 config.js 里改，不要改这里 ======
  const CONFIG = Object.assign({
    name: '奶奶', serverUrl: '', serverToken: '',
    questionAudioDir: 'audio/q/', uiAudioDir: 'audio/ui/', liveCaptions: true,
  }, window.APP_CONFIG || {});
  const params = new URLSearchParams(location.search);
  const DEMO = params.has('demo');          // ?demo 演示模式：不用麦克风
  try {                                     // ?server=https://...&token=... 一次性设置电脑服务器，手机会记住
    if (params.has('server')) localStorage.setItem('serverUrl', params.get('server').trim());
    if (params.has('token')) localStorage.setItem('serverToken', params.get('token').trim());
    CONFIG.serverUrl = localStorage.getItem('serverUrl') || CONFIG.serverUrl;
    CONFIG.serverToken = localStorage.getItem('serverToken') || CONFIG.serverToken;
  } catch (_) {}
  // 页面如果就是电脑上的 server.py 托管的（比如 Tailscale Funnel 地址），接口就在同一个地址下
  if (!CONFIG.serverUrl && !/github\.io$/.test(location.hostname) && /^https?:$/.test(location.protocol)) {
    CONFIG.serverUrl = location.origin;
  }
  const serverBase = () => CONFIG.serverUrl.replace(/\/$/, '');
  const IN_WECHAT = /MicroMessenger/i.test(navigator.userAgent);
  const authHeaders = () => (CONFIG.serverToken ? { 'X-Token': CONFIG.serverToken } : {});

  // 把手机上出的错发给电脑记着，方便远程排查（不带口令也能发，只记几百字）
  const errStr = (e) => (e && (e.name ? e.name + ': ' : '') + (e.message || String(e))) || 'unknown';
  function report(kind, detail) {
    try {
      if (!CONFIG.serverUrl) return;
      const body = JSON.stringify({ kind, detail: String(detail || '').slice(0, 600), ua: navigator.userAgent,
        url: location.href.replace(/token=[^&]+/, 'token=***'), at: new Date().toISOString() });
      fetch(serverBase() + '/api/client-log', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
    } catch (_) {}
  }
  window.addEventListener('error', (e) => report('js-error', (e.message || '') + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', (e) => report('promise-rejection', e.reason && (e.reason.stack || e.reason.message || e.reason)));

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const playbackAudio = $('#playback-audio');
  Speaker.configure({ uiDir: CONFIG.uiAudioDir, questionDir: CONFIG.questionAudioDir, phrases: window.UI_PHRASES || {} });

  const state = {
    stories: [], current: null, detailId: null,
    blob: null, seconds: 0, timer: null, recording: false, paused: false,
    recognition: null, transcript: '', sessionFinal: '', interim: '',
    wakeLock: null, demoTimer: null, playUrl: null,
  };

  // ====== 页面切换 / 弹窗 ======
  function show(name) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    window.scrollTo(0, 0);
  }
  function ask(title, text, okLabel, cancelLabel, sayOk, sayCancel) {
    return new Promise((resolve) => {
      $('#modal-title').textContent = title;
      $('#modal-text').textContent = text;
      const ok = $('#modal-ok');
      const cancel = $('#modal-cancel');
      ok.textContent = okLabel || '知道了';
      ok.dataset.say = sayOk || 'ok';
      cancel.hidden = !cancelLabel;
      cancel.textContent = cancelLabel || '';
      cancel.dataset.say = sayCancel || 'ok';
      ok.onclick = () => { $('#modal').hidden = true; resolve(true); };
      cancel.onclick = () => { $('#modal').hidden = true; resolve(false); };
      $('#modal').hidden = false;
    });
  }
  const showMessage = (title, text) => ask(title, text, '知道了');

  // ====== 小工具 ======
  const pad = (n) => String(n).padStart(2, '0');
  const fmtTime = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  const fmtDuration = (s) => (s >= 60 ? `${Math.floor(s / 60)}分${s % 60}秒` : `${s}秒`);
  const fmtDate = (ts) => new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  const fmtFileDate = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  };

  // ====== 每个按键的语音反馈：带 data-say 的按钮，点下去先读一句 ======
  let audioUnlocked = false;
  document.addEventListener('click', (e) => {
    if (!audioUnlocked) {            // 第一次点按顺便"解锁"回放用的 audio（iPhone 要求在点按里播过一次）
      audioUnlocked = true;
      try { playbackAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='; const p = playbackAudio.play(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
    }
    const b = e.target.closest('[data-say]');
    if (b && !b.disabled) Speaker.say(b.dataset.say);
  }, true);

  // ====== 选问题：先问没讲过的，都讲过了就从头再来 ======
  function nextQuestion(after) {
    const list = window.QUESTIONS;
    const done = new Set(state.stories.map((s) => s.questionId));
    const start = after ? (list.findIndex((q) => q.id === after.id) + 1) % list.length : 0;
    for (let i = 0; i < list.length; i++) {
      const q = list[(start + i) % list.length];
      if (!done.has(q.id)) return q;
    }
    return list[start];
  }
  function openQuestion(q) {
    state.current = q;
    $('#q-stage').textContent = '关于' + q.stage;
    $('#q-text').textContent = q.text;
    $('#q-answered').hidden = !state.stories.some((s) => s.questionId === q.id);
    show('question');
    Speaker.question(q);            // 排在按键反馈后面读
  }

  // ====== 录音 ======
  function renderTimer() { $('#rec-timer').textContent = fmtTime(state.seconds); }
  function renderTranscript(el, text, placeholder) {
    const t = (text || '').trim();
    el.textContent = t || placeholder;
    el.classList.toggle('empty', !t);
    el.scrollTop = el.scrollHeight;
  }
  async function keepScreenOn() {
    try { if (navigator.wakeLock) state.wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
  }
  function releaseScreen() {
    if (state.wakeLock) { state.wakeLock.release().catch(() => {}); state.wakeLock = null; }
  }

  // 微信里录不了音（老 iPhone、微信没给麦克风权限）：教她点右上角「···」在浏览器打开
  function micUnavailable(err) {
    report('mic-unavailable', (err ? errStr(err) : 'unsupported') + (IN_WECHAT ? ' (wechat)' : ''));
    if (IN_WECHAT) {
      Speaker.say('open_browser');
      showMessage('微信里录不了音', '请点右上角的「···」，选「在浏览器打开」，再按一次「开始讲」');
    } else if (err && /NotAllowed|Permission|denied/i.test(String(err && err.name) + String(err && err.message))) {
      Speaker.say('mic_error');
      showMessage('没有听到声音', '请允许使用麦克风，然后再按一次「开始讲」');
    } else {
      Speaker.say('mic_error');
      showMessage('这个手机暂时不能录音', '请让家人帮忙看看，换个浏览器打开');
    }
  }

  async function startRecording() {
    const q = state.current;
    const recBtn = $('#btn-record');
    const feedback = Speaker.last;                 // 「开始录音了，请讲」正在播
    state.blob = null; state.transcript = ''; state.sessionFinal = ''; state.interim = '';

    if (!DEMO) {
      if (!WavRecorder.supported()) {
        micUnavailable(); return;
      }
      WavRecorder.ensureContext();                 // 必须在点按里同步创建（iPhone 要求）
      recBtn.disabled = true;
      recBtn.textContent = '正在打开麦克风…';
      try {
        await WavRecorder.open();
      } catch (e) {
        micUnavailable(e); return;
      } finally {
        recBtn.disabled = false;
        recBtn.textContent = '🎙️ 按这里，开始讲';
      }
    }
    const ok = await Speaker.wait(feedback, 4000); // 等提示音放完再开始录，免得把提示音录进去
    if (ok === false) { if (!DEMO) WavRecorder.cancel(); return; }
    Speaker.stop();
    if (!DEMO) WavRecorder.start();

    state.recording = true; state.paused = false;
    $('#rec-question').textContent = q.text;
    renderTranscript($('#rec-transcript'), '', '（您说的话会一句一句显示在这里）');
    state.seconds = 0;
    renderTimer();
    state.timer = setInterval(() => { if (!state.paused) { state.seconds++; renderTimer(); } }, 1000);
    startRecognition();
    keepScreenOn();
    show('recording');
  }

  function finishCapture() {
    state.recording = false; state.paused = false;
    clearInterval(state.timer);
    stopRecognition();
    releaseScreen();
  }
  function stopRecording() {
    if (!state.recording) return;
    finishCapture();
    state.blob = DEMO ? silentWav(Math.max(1, state.seconds)) : WavRecorder.stop();   // 先停录，再说话
    Speaker.say('stop');
    openReview();
  }
  async function cancelRecording() {
    if (!state.recording) return;
    state.paused = true;                           // 弹窗期间先暂停，别把提示音录进去
    if (!DEMO) WavRecorder.pause();
    const yes = await ask('这段不要了？', '不保存，回到问题重新来', '不要了', '继续讲', 'discard', 'continue');
    if (!yes) { state.paused = false; if (!DEMO) WavRecorder.resume(); return; }
    finishCapture();
    if (!DEMO) WavRecorder.cancel();
    openQuestion(state.current);
  }

  // ====== 手机上的初步转文字（普通话引擎，四川话不准；只是给个即时反馈，最终以电脑整理的为准） ======
  const DEMO_LINES = [
    '那时候我才十八岁，在镇上的纺织厂上班。',
    '他是隔壁村的，每个星期骑自行车来厂里送货。',
    '有一次下大雨，他把雨衣给了我，自己淋着回去了。',
    '后来他妈妈托人来说亲，我们就这么认识了。',
  ];
  function startDemoTranscript() {
    let i = 0;
    state.demoTimer = setInterval(() => {
      if (i >= DEMO_LINES.length || state.paused) return;
      state.transcript += DEMO_LINES[i++];
      renderTranscript($('#rec-transcript'), state.transcript, '');
    }, 2500);
  }
  function startRecognition() {
    if (DEMO) { startDemoTranscript(); return; }
    if (!CONFIG.liveCaptions) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = 'zh-CN';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let final = '', interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += res[0].transcript; else interim += res[0].transcript;
      }
      state.sessionFinal = final;
      state.interim = interim;
      renderTranscript($('#rec-transcript'), state.transcript + final + interim, '');
    };
    r.onend = () => {
      if (state.recognition !== r) return;
      state.transcript += state.sessionFinal;
      state.sessionFinal = ''; state.interim = '';
      if (state.recording) { try { r.start(); } catch (_) {} }
    };
    r.onerror = () => {};
    state.recognition = r;
    try { r.start(); } catch (_) { state.recognition = null; }
  }
  function stopRecognition() {
    clearInterval(state.demoTimer);
    const r = state.recognition;
    state.recognition = null;
    state.transcript += state.sessionFinal + state.interim;
    state.sessionFinal = ''; state.interim = '';
    if (r) { try { r.stop(); } catch (_) {} }
  }

  // ====== 回放 ======
  function stopPlayback() {
    playbackAudio.pause();
    try { playbackAudio.currentTime = 0; } catch (_) {}
  }
  function setupPlayer(btn, src) {
    stopPlayback();
    if (state.playUrl) { URL.revokeObjectURL(state.playUrl); state.playUrl = null; }
    if (!src) { btn.hidden = true; return; }
    btn.hidden = false;
    if (typeof src === 'string') { playbackAudio.src = src; }
    else { state.playUrl = URL.createObjectURL(src); playbackAudio.src = state.playUrl; }
    btn.textContent = '▶️ 听一听';
    btn.onclick = async () => {
      if (playbackAudio.paused) {
        const ok = await Speaker.wait(Speaker.say('play'), 3000);   // 先说「放给您听」
        if (ok === false) return;
        playbackAudio.play().then(() => { btn.textContent = '⏸️ 暂停'; })
          .catch(() => showMessage('放不出来', '这个手机放不了这段录音'));
      } else {
        playbackAudio.pause();
        btn.textContent = '▶️ 继续听';
        Speaker.say('pause');
      }
    };
    playbackAudio.onended = () => { btn.textContent = '▶️ 再听一遍'; };
  }

  // ====== 录好了 / 保存 ======
  function openReview() {
    const q = state.current;
    $('#rv-stage').textContent = '关于' + q.stage;
    $('#rv-question').textContent = q.text;
    $('#rv-duration').textContent = '（' + fmtDuration(state.seconds) + '）';
    const has = !!state.transcript.trim();
    renderTranscript($('#rv-transcript'), state.transcript, '保存以后，电脑会把这段话整理成文字。');
    $('#rv-status').textContent = has ? '这是手机的初步识别，四川话可能不准；保存后电脑会重新整理。' : '';
    setupPlayer($('#btn-play'), state.blob);
    show('review');
  }
  async function saveStory() {
    const q = state.current;
    const btn = $('#btn-save');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '正在保存…';
    const story = {
      id: String(Date.now()),
      questionId: q.id, question: q.text, stage: q.stage,
      text: state.transcript.trim(), liveText: state.transcript.trim(), serverText: '',
      serverStatus: 'none', uploaded: false,
      createdAt: Date.now(), duration: state.seconds,
      mimeType: state.blob ? state.blob.type : 'audio/wav', audio: state.blob,
    };
    story.filename = `${fmtFileDate(story.createdAt)}_${q.id}.wav`;
    let localOk = false;
    try { await StoryStore.save(story); localOk = true; }
    catch (e) { report('idb-save-failed', errStr(e)); }
    state.stories = state.stories.filter((x) => x.id !== story.id);
    state.stories.unshift(story);                       // 存不进手机也先留在内存里
    let uploadOk = false;
    if (CONFIG.serverUrl) {
      uploadOk = await uploadStory(story);
      if (uploadOk) {
        story.uploaded = true; story.serverStatus = 'pending';
        if (localOk) { try { await StoryStore.save(story); } catch (_) {} }
      }
    }
    btn.disabled = false;
    btn.textContent = label;
    if (!localOk && !uploadOk) {
      showMessage('没存上', CONFIG.serverUrl ? '手机存不下，电脑也没连上。请检查网络，再按一次「保存」' : '手机存不下这段录音，请让家人看看');
      return;
    }
    $('#saved-note').textContent = uploadOk ? '已经传到电脑上了' : '先存在手机里，连上电脑后会自动传过去';
    stopPlayback();
    show('saved');
    syncSoon(3000);
  }

  // ====== 和电脑同步：上传录音，取回电脑整理好的文字 ======
  let syncTimer = null, syncing = false;
  function syncSoon(delay) { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, delay || 0); }
  async function uploadStory(s) {
    try {
      const fd = new FormData();
      const { audio, ...meta } = s;
      fd.append('meta', JSON.stringify(meta));
      if (audio) fd.append('audio', audio, s.filename);
      const r = await fetch(serverBase() + '/api/stories', { method: 'POST', body: fd, headers: authHeaders() });
      if (!r.ok) report('upload-failed', 'HTTP ' + r.status);
      return r.ok;
    } catch (e) { report('upload-failed', errStr(e)); return false; }
  }
  async function fetchStatus(id) {
    try {
      const r = await fetch(serverBase() + '/api/stories/' + encodeURIComponent(id), { headers: authHeaders() });
      return r.ok ? await r.json() : null;
    } catch (_) { return null; }
  }
  async function syncNow() {
    if (syncing || !CONFIG.serverUrl) return;
    syncing = true;
    let again = 0;
    try {
      for (const s of state.stories) {
        if (Date.now() - s.createdAt > 30 * 24 * 3600 * 1000) continue;
        if (!s.uploaded) {
          if (await uploadStory(s)) { s.uploaded = true; s.serverStatus = 'pending'; await StoryStore.save(s); refreshStoryViews(s); }
          else { again = Math.max(again, 30000); continue; }
        }
        if (s.serverStatus === 'pending') {
          const r = await fetchStatus(s.id);
          if (r && r.status === 'done') {
            s.serverStatus = 'done'; s.serverText = r.text || '';
            if (s.serverText) s.text = s.serverText;
            await StoryStore.save(s); refreshStoryViews(s);
          } else if (r && r.status === 'failed') {
            s.serverStatus = 'failed'; s.serverError = r.error || '';
            await StoryStore.save(s); refreshStoryViews(s);
          } else if (r && r.status === 'missing') {
            s.uploaded = false; await StoryStore.save(s); again = Math.max(again, 5000);
          } else {
            again = Math.max(again, 5000);
          }
        }
      }
    } catch (_) {} finally { syncing = false; }
    if (again) syncSoon(again);
  }
  async function refreshFromServer() {
    if (!CONFIG.serverUrl) return false;
    let remote = [];
    try {
      const r = await fetch(serverBase() + '/api/stories', { headers: authHeaders() });
      if (!r.ok) return false;
      remote = await r.json();
    } catch (_) { return false; }
    let changed = false;
    for (const m of remote) {
      if (!m || !m.id) continue;
      const local = state.stories.find((x) => x.id === m.id);
      if (local) {
        if (!local.uploaded) { local.uploaded = true; local.serverStatus = m.status === 'done' ? 'done' : (m.status === 'failed' ? 'failed' : 'pending'); changed = true; }
        if (m.status === 'done' && m.text && local.serverText !== m.text) {
          local.serverText = m.text; local.text = m.text; local.serverStatus = 'done'; changed = true;
          try { await StoryStore.save(local); } catch (_) {}
        }
        continue;
      }
      state.stories.push({
        id: m.id, questionId: m.questionId, question: m.question || '', stage: m.stage || '',
        createdAt: Number(m.createdAt) || 0, duration: Number(m.duration) || 0,
        text: m.text || m.clientText || '', serverText: m.text || '',
        serverStatus: m.status === 'done' ? 'done' : (m.status === 'failed' ? 'failed' : 'pending'),
        uploaded: true, remote: true,
        audioUrl: serverBase() + '/api/stories/' + encodeURIComponent(m.id) + '/audio' + (CONFIG.serverToken ? '?token=' + encodeURIComponent(CONFIG.serverToken) : ''),
      });
      changed = true;
    }
    if (changed) state.stories.sort((a, b) => b.createdAt - a.createdAt);
    return changed;
  }
  function refreshStoryViews(s) {
    const active = document.querySelector('.screen.active');
    if (!active) return;
    if (active.id === 'screen-detail' && state.detailId === s.id) openDetail(s, true);
    if (active.id === 'screen-list') renderList();
  }
  function statusLine(s) {
    if (s.serverStatus === 'done') return '';
    if (s.serverStatus === 'pending') return '电脑正在整理文字（四川话识别）…';
    if (s.serverStatus === 'failed') return '文字整理没成功，请让家人看看电脑上的记录。';
    if (!CONFIG.serverUrl) return '';
    return '还没传到电脑，连上网以后会自动上传。';
  }

  // ====== 讲过的故事 ======
  function renderHome() {
    const n = state.stories.length;
    $('#home-count').textContent = n ? `已经讲了 ${n} 个故事` : '还没有开始讲，今天就开始吧';
    $('#btn-list').textContent = n ? `📖 听听讲过的故事（${n}）` : '📖 听听讲过的故事';
  }
  function renderList() {
    const box = $('#story-list');
    box.innerHTML = '';
    $('#list-empty').hidden = state.stories.length > 0;
    state.stories.forEach((s) => {
      const b = document.createElement('button');
      b.className = 'card';
      b.type = 'button';
      b.dataset.say = 'open';
      b.innerHTML = '<span class="card-arrow">›</span><div class="card-q"></div><div class="card-meta"></div>';
      b.querySelector('.card-q').textContent = s.question;
      const st = s.serverStatus === 'pending' ? ' · 文字整理中' : (s.text ? '' : ' · 还没有文字');
      b.querySelector('.card-meta').textContent = `${fmtDate(s.createdAt)} · ${fmtDuration(s.duration)}${st}`;
      b.onclick = () => openDetail(s);
      box.appendChild(b);
    });
  }
  function openDetail(s, silent) {
    state.detailId = s.id;
    $('#dt-stage').textContent = '关于' + s.stage;
    $('#dt-question').textContent = s.question;
    $('#dt-meta').textContent = `${fmtDate(s.createdAt)} · ${fmtDuration(s.duration)}`;
    $('#dt-status').textContent = statusLine(s);
    renderTranscript($('#dt-transcript'), s.text, '这段还没有整理成文字。');
    if (!silent) setupPlayer($('#btn-detail-play'), s.audio || s.audioUrl);
    show('detail');
  }

  // 演示模式用的一段静音 wav，让「听一听」按钮也能试
  function silentWav(seconds) {
    const rate = 16000, n = rate * seconds;
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    return new Blob([buf], { type: 'audio/wav' });
  }

  // ====== 微信里：不让微信的「字体大小」设置再把页面放大，避免排版乱掉 ======
  (function lockWeChatFont() {
    function apply() {
      try {
        WeixinJSBridge.invoke('setFontSizeCallback', { fontSize: 0 });
        WeixinJSBridge.on('menu:setfont', () => WeixinJSBridge.invoke('setFontSizeCallback', { fontSize: 0 }));
      } catch (_) {}
    }
    if (typeof WeixinJSBridge === 'object') apply();
    else document.addEventListener('WeixinJSBridgeReady', apply, false);
  })();

  // ====== 按钮 ======
  function bind() {
    $('#btn-start').onclick = () => openQuestion(nextQuestion(null));
    $('#btn-list').onclick = () => { renderList(); show('list'); refreshFromServer().then((c) => { if (c) renderList(); }); };
    $('#btn-q-home').onclick = () => { renderHome(); show('home'); };
    $('#btn-replay').onclick = () => Speaker.question(state.current);
    $('#btn-record').onclick = startRecording;
    $('#btn-skip').onclick = () => openQuestion(nextQuestion(state.current));
    $('#btn-stop').onclick = stopRecording;
    $('#btn-cancel-rec').onclick = cancelRecording;
    $('#btn-save').onclick = saveStory;
    $('#btn-redo').onclick = () => { stopPlayback(); openQuestion(state.current); };
    $('#btn-next').onclick = () => openQuestion(nextQuestion(state.current));
    $('#btn-home-2').onclick = () => { renderHome(); show('home'); };
    $('#btn-list-back').onclick = () => { stopPlayback(); renderHome(); show('home'); };
    $('#btn-detail-back').onclick = () => { stopPlayback(); renderList(); show('list'); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncSoon(500); });
  }

  async function init() {
    $$('.name').forEach((el) => { el.textContent = CONFIG.name; });
    if (DEMO) {
      const b = document.createElement('div');
      b.className = 'demo-badge';
      b.textContent = '演示模式';
      document.body.appendChild(b);
    }
    bind();
    try { state.stories = await StoryStore.all(); } catch (e) { state.stories = []; report('idb-open-failed', errStr(e)); }
    renderHome();
    show('home');
    refreshFromServer().then(() => renderHome());
    syncSoon(1500);
  }
  init();
})();

