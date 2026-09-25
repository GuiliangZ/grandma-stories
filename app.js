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
