(() => {
  'use strict';

  // ====== 可以改的设置 ======
  const CONFIG = {
    name: '奶奶',                 // 称呼
    serverUrl: '',                // 以后填电脑上服务器的地址，如 'http://192.168.1.10:8000'；留空就只存在手机里
    questionAudioDir: 'audio/q/', // 提前在电脑上生成的问题语音（make_question_audio.py）
  };
  // 网址后面加 ?demo 进入演示模式：不用麦克风，模拟录音和转文字，方便在电脑上看界面
  const DEMO = new URLSearchParams(location.search).has('demo');

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const promptAudio = $('#prompt-audio');
  const playbackAudio = $('#playback-audio');

  const state = {
    stories: [], current: null,
    recorder: null, stream: null, chunks: [], blob: null,
    seconds: 0, timer: null, recording: false,
    recognition: null, transcript: '', sessionFinal: '', interim: '',
    wakeLock: null, demoTimer: null, playUrl: null,
  };

  // ====== 页面切换 / 弹窗 ======
  function show(name) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    window.scrollTo(0, 0);
  }
  function ask(title, text, okLabel, cancelLabel) {
    return new Promise((resolve) => {
      $('#modal-title').textContent = title;
      $('#modal-text').textContent = text;
      const ok = $('#modal-ok');
      const cancel = $('#modal-cancel');
      ok.textContent = okLabel || '知道了';
      cancel.hidden = !cancelLabel;
      cancel.textContent = cancelLabel || '';
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
  const extOf = (mime) => (/mp4|aac|m4a/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : 'webm');

  // ====== 把问题读出来：优先放电脑生成的语音，没有就用手机自带的朗读 ======
  let voices = [];
  function loadVoices() { if ('speechSynthesis' in window) voices = speechSynthesis.getVoices(); }
  loadVoices();
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = loadVoices;

  function speakTTS(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.8;
    const v = voices.find((x) => /zh[-_]CN/i.test(x.lang)) || voices.find((x) => /^zh/i.test(x.lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }
  function stopSpeaking() {
    promptAudio.pause();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
  function speakQuestion(q) {
    stopSpeaking();
    promptAudio.src = CONFIG.questionAudioDir + q.id + '.m4a';
    const p = promptAudio.play();
    if (p && p.catch) p.catch(() => speakTTS(q.text));
  }

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
    speakQuestion(q);
  }

  // ====== 录音 ======
  function pickMime() {
    if (!window.MediaRecorder) return '';
    return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus']
      .find((m) => MediaRecorder.isTypeSupported(m)) || '';
  }
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

  async function startRecording() {
    stopSpeaking();
    const q = state.current;
    const recBtn = $('#btn-record');
    state.chunks = []; state.blob = null;
    state.transcript = ''; state.sessionFinal = ''; state.interim = '';

    if (!DEMO) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        showMessage('这个手机暂时不能录音', '请让家人帮忙看看，换个方式打开');
        return;
      }
      recBtn.disabled = true;
      recBtn.textContent = '正在打开麦克风…';
      try {
        state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        showMessage('没有听到声音', '请允许使用麦克风，然后再按一次「开始讲」');
        return;
      } finally {
        recBtn.disabled = false;
        recBtn.textContent = '🎙️ 按这里，开始讲';
      }
      const mime = pickMime();
      state.recorder = new MediaRecorder(state.stream, mime ? { mimeType: mime } : undefined);
      state.recorder.ondataavailable = (e) => { if (e.data && e.data.size) state.chunks.push(e.data); };
      state.recorder.onstop = () => {
        state.blob = new Blob(state.chunks, { type: state.recorder.mimeType || mime || 'audio/webm' });
        if (state.stream) { state.stream.getTracks().forEach((t) => t.stop()); state.stream = null; }
        openReview();
      };
      state.recorder.start(1000);
    }

    state.recording = true;
    $('#rec-question').textContent = q.text;
    renderTranscript($('#rec-transcript'), '', '（您说的话会一句一句显示在这里）');
    state.seconds = 0;
    renderTimer();
    state.timer = setInterval(() => { state.seconds++; renderTimer(); }, 1000);
    startRecognition();
    keepScreenOn();
    show('recording');
  }

  function stopRecording() {
    if (!state.recording) return;
    state.recording = false;
    clearInterval(state.timer);
    stopRecognition();
    releaseScreen();
    if (DEMO) { state.blob = silentWav(Math.max(1, state.seconds)); openReview(); return; }
    if (state.recorder && state.recorder.state !== 'inactive') state.recorder.stop();
  }

  async function cancelRecording() {
    const yes = await ask('这段不要了？', '不保存，回到问题重新来', '不要了', '继续讲');
    if (!yes) return;
    state.recording = false;
    clearInterval(state.timer);
    stopRecognition();
    releaseScreen();
    if (state.recorder && state.recorder.state !== 'inactive') { state.recorder.onstop = null; state.recorder.stop(); }
    if (state.stream) { state.stream.getTracks().forEach((t) => t.stop()); state.stream = null; }
    openQuestion(state.current);
  }

  // ====== 实时转文字（手机支持就显示；不支持就等电脑整理） ======
  const DEMO_LINES = [
    '那时候我才十八岁，在镇上的纺织厂上班。',
    '他是隔壁村的，每个星期骑自行车来厂里送货。',
    '有一次下大雨，他把雨衣给了我，自己淋着回去了。',
    '后来他妈妈托人来说亲，我们就这么认识了。',
  ];
  function startDemoTranscript() {
    let i = 0;
    state.demoTimer = setInterval(() => {
      if (i >= DEMO_LINES.length) return;
      state.transcript += DEMO_LINES[i++];
      renderTranscript($('#rec-transcript'), state.transcript, '');
    }, 2500);
  }
  function startRecognition() {
    if (DEMO) { startDemoTranscript(); return; }
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

  // ====== 回放 / 保存 ======
  function stopPlayback() {
    playbackAudio.pause();
    try { playbackAudio.currentTime = 0; } catch (_) {}
  }
  function setupPlayer(btn, blob) {
    stopPlayback();
    if (state.playUrl) { URL.revokeObjectURL(state.playUrl); state.playUrl = null; }
    if (!blob) { btn.hidden = true; return; }
    btn.hidden = false;
    state.playUrl = URL.createObjectURL(blob);
    playbackAudio.src = state.playUrl;
    btn.textContent = '▶️ 听一听';
    btn.onclick = () => {
      if (playbackAudio.paused) {
        playbackAudio.play().then(() => { btn.textContent = '⏸️ 暂停'; })
          .catch(() => showMessage('放不出来', '这个手机放不了这段录音'));
      } else {
        playbackAudio.pause();
        btn.textContent = '▶️ 继续听';
      }
    };
    playbackAudio.onended = () => { btn.textContent = '▶️ 再听一遍'; };
  }
  function openReview() {
    const q = state.current;
    $('#rv-stage').textContent = '关于' + q.stage;
    $('#rv-question').textContent = q.text;
    $('#rv-duration').textContent = '（' + fmtDuration(state.seconds) + '）';
    renderTranscript($('#rv-transcript'), state.transcript, '文字还在整理中，保存以后电脑会自动整理好。');
    setupPlayer($('#btn-play'), state.blob);
    show('review');
  }
  async function saveStory() {
    const q = state.current;
    const btn = $('#btn-save');
    btn.disabled = true;
    const story = {
      id: String(Date.now()),
      questionId: q.id, question: q.text, stage: q.stage,
      text: state.transcript.trim(),
      createdAt: Date.now(), duration: state.seconds,
      mimeType: state.blob ? state.blob.type : '',
      audio: state.blob,
    };
    story.filename = `${fmtFileDate(story.createdAt)}_${q.id}.${extOf(story.mimeType)}`;
    try {
      await StoryStore.save(story);
      state.stories = await StoryStore.all();
    } catch (e) {
      btn.disabled = false;
      showMessage('没存上', '手机存不下这段录音，请让家人看看');
      return;
    }
    btn.disabled = false;
    uploadStory(story);
    stopPlayback();
    show('saved');
  }
  // 以后接电脑上的服务器：POST 一个 multipart 表单，meta 是 JSON，audio 是录音文件
  function uploadStory(story) {
    if (!CONFIG.serverUrl) return;
    const fd = new FormData();
    const { audio, ...meta } = story;
    fd.append('meta', JSON.stringify(meta));
    if (audio) fd.append('audio', audio, story.filename);
    fetch(CONFIG.serverUrl.replace(/\/$/, '') + '/api/stories', { method: 'POST', body: fd }).catch(() => {});
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
      b.innerHTML = '<span class="card-arrow">›</span><div class="card-q"></div><div class="card-meta"></div>';
      b.querySelector('.card-q').textContent = s.question;
      b.querySelector('.card-meta').textContent = `${fmtDate(s.createdAt)} · ${fmtDuration(s.duration)}`;
      b.onclick = () => openDetail(s);
      box.appendChild(b);
    });
  }
  function openDetail(s) {
    $('#dt-stage').textContent = '关于' + s.stage;
    $('#dt-question').textContent = s.question;
    $('#dt-meta').textContent = `${fmtDate(s.createdAt)} · ${fmtDuration(s.duration)}`;
    renderTranscript($('#dt-transcript'), s.text, '这段还没有整理成文字。');
    setupPlayer($('#btn-detail-play'), s.audio);
    show('detail');
  }

  // 演示模式用的一段静音 wav，让「听一听」按钮也能试
  function silentWav(seconds) {
    const rate = 8000, n = rate * seconds;
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
    $('#btn-list').onclick = () => { renderList(); show('list'); };
    $('#btn-q-home').onclick = () => { stopSpeaking(); renderHome(); show('home'); };
    $('#btn-replay').onclick = () => speakQuestion(state.current);
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
    try { state.stories = await StoryStore.all(); } catch (_) { state.stories = []; }
    renderHome();
    show('home');
  }
  init();
})();
