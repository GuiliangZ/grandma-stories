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
  const authHeaders = () => (CONFIG.serverToken ? { 'X-Token': CONFIG.serverToken } : {});
  const IN_WECHAT = /MicroMessenger/i.test(navigator.userAgent);
  const MAX_PER_SESSION = 3;               // 一次打开讲满这么多段就提示歇一歇

  // 把手机上出的错发给电脑记着，方便远程排查（不带口令也能发，只记几百字）
  const errStr = (e) => (e && (e.name ? e.name + ': ' : '') + (e.message || String(e))) || 'unknown';
  const reported = {};
  function report(kind, detail) {
    try {
      if (!CONFIG.serverUrl) return;
      const key = kind + '|' + String(detail || '').slice(0, 40);
      if (reported[key] && Date.now() - reported[key] < 5 * 60 * 1000) return;
      reported[key] = Date.now();
      const body = JSON.stringify({ kind, detail: String(detail || '').slice(0, 600), ua: navigator.userAgent,
        url: location.href.replace(/token=[^&]+/, 'token=***'), at: new Date().toISOString() });
      fetch(serverBase() + '/api/client-log', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
    } catch (_) {}
  }
  window.addEventListener('error', (e) => report('js-error', (e.message || '') + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', (e) => report('promise-rejection', e.reason && (e.reason.stack || e.reason.message || e.reason)));

  // 跨境网络：每个请求都有超时，免得一个卡住的连接把同步永远堵死
  function fetchT(url, opts, ms) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    return fetch(url, Object.assign({}, opts, { signal: ctl.signal })).finally(() => clearTimeout(t));
  }

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const playbackAudio = $('#playback-audio');
  Speaker.configure({ uiDir: CONFIG.uiAudioDir, questionDir: CONFIG.questionAudioDir, phrases: window.UI_PHRASES || {} });

  const state = {
    user: null,                                  // {id, name}：当前是谁在用
    stories: [], current: null, currentFollowup: '', followupIndex: 0, detailId: null,
    blob: null, seconds: 0, timer: null, recording: false, paused: false,
    recognition: null, transcript: '', sessionFinal: '', interim: '',
    wakeLock: null, demoTimer: null, playUrl: null, draftTimer: null,
    sessionCount: 0, asked: {}, parentByQuestion: {}, lastSavedId: null,
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
  const questionById = (id) => (window.QUESTIONS || []).find((q) => q.id === id);

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

  // ====== 用户：第一次打开先选人 / 新建名字；所有录音都归到这个人名下 ======
  function loadUser() { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch (_) { return null; } }
  function saveUser(u) { try { localStorage.setItem('user', JSON.stringify(u)); } catch (_) {} }
  function localUsers() { try { return JSON.parse(localStorage.getItem('users') || '[]'); } catch (_) { return []; } }
  function rememberLocalUser(u) { const list = localUsers().filter((x) => x.id !== u.id); list.unshift(u); try { localStorage.setItem('users', JSON.stringify(list)); } catch (_) {} }
  async function fetchUsers() {
    if (!CONFIG.serverUrl) return localUsers();
    try {
      const r = await fetchT(serverBase() + '/api/users', { headers: authHeaders() }, 15000);
      if (r.ok) return await r.json();
    } catch (_) {}
    return localUsers();
  }
  async function createUser(name) {
    if (CONFIG.serverUrl) {
      try {
        const r = await fetchT(serverBase() + '/api/users', { method: 'POST', body: JSON.stringify({ name }), headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()) }, 15000);
        if (r.ok) return await r.json();
        report('create-user-failed', 'HTTP ' + r.status);
      } catch (e) { report('create-user-failed', errStr(e)); }
    }
    let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;   // 电脑没连上：先在手机上建一个
    return { id: 'u' + h.toString(16), name };
  }
  async function showUserScreen() {
    Speaker.stop();
    const box = $('#user-list');
    box.innerHTML = '';
    show('user');
    const users = await fetchUsers();
    $('#user-empty').hidden = users.length > 0;
    users.forEach((u) => {
      const b = document.createElement('button');
      b.className = 'card user'; b.type = 'button'; b.textContent = u.name; b.dataset.say = 'hello';
      b.onclick = () => selectUser(u);
      box.appendChild(b);
    });
  }
  async function selectUser(u) {
    state.user = u;
    saveUser(u);
    rememberLocalUser(u);
    state.asked = {}; state.parentByQuestion = {}; state.sessionCount = 0;
    $$('.name').forEach((el) => { el.textContent = u.name; });
    $('#home-user').textContent = '现在是：' + u.name;
    try { state.stories = await StoryStore.all(u.id); } catch (e) { state.stories = []; report('idb-open-failed', errStr(e)); }
    renderHome();
    show('home');
    refreshFromServer().then(() => renderHome());
    syncSoon(1000);
    checkDraft();
  }
  async function submitNewUser() {
    const input = $('#user-name-input');
    const name = (input.value || '').trim().replace(/\s+/g, ' ');
    const err = $('#user-name-error');
    if (!name) { err.textContent = '请先输入名字'; input.focus(); return; }
    if (name.length > 12) { err.textContent = '名字太长了，12 个字以内'; return; }
    err.textContent = '';
    const btn = $('#btn-user-create'); btn.disabled = true;
    const u = await createUser(name);
    btn.disabled = false;
    input.value = '';
    selectUser(u);
  }

  // ====== 选问题：没讲过的在前，「换一个问题」跳过的排到最后，都讲过了就从头再来 ======
  function skippedSet() { try { return new Set(JSON.parse(localStorage.getItem('skipped:' + (state.user ? state.user.id : '')) || '[]')); } catch (_) { return new Set(); } }
  function markSkipped(id) { const s = skippedSet(); s.add(id); try { localStorage.setItem('skipped:' + (state.user ? state.user.id : ''), JSON.stringify([...s])); } catch (_) {} }
  function nextQuestion(after) {
    const list = window.QUESTIONS;
    const done = new Set(state.stories.map((s) => s.questionId));
    const skipped = skippedSet();
    const start = after ? (list.findIndex((q) => q.id === after.id) + 1) % list.length : 0;
    const ordered = [];
    for (let i = 0; i < list.length; i++) ordered.push(list[(start + i) % list.length]);
    return ordered.find((q) => !done.has(q.id) && !skipped.has(q.id))
      || ordered.find((q) => !done.has(q.id))
      || ordered[0];
  }
  function openQuestion(q) {
    state.current = q;
    state.currentFollowup = '';
    const done = state.stories.filter((s) => s.questionId === q.id).length;
    const total = window.QUESTIONS.length;
    const answered = new Set(state.stories.map((s) => s.questionId)).size;
    $('#q-stage').textContent = '关于' + q.stage;
    $('#q-progress').textContent = answered ? `已经讲了 ${answered} 个，还有 ${total - answered} 个没讲` : '请听问题：';
    $('#q-text').textContent = q.text;
    $('#q-answered').hidden = !done;
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
  let wakeReported = false;
  async function keepScreenOn() {
    try {
      if (navigator.wakeLock) state.wakeLock = await navigator.wakeLock.request('screen');
      else if (!wakeReported) { wakeReported = true; report('no-wakelock', 'screen may lock during recording'); }
    } catch (_) {}
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
    const feedback = Speaker.last;                 // 「开始录音了，请讲」/「好，接着讲」正在播
    state.blob = null; state.transcript = ''; state.sessionFinal = ''; state.interim = '';

    if (!DEMO) {
      if (!WavRecorder.supported()) { micUnavailable(); return; }
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
    $('#rec-question').textContent = state.currentFollowup || q.text;
    renderTranscript($('#rec-transcript'), '', '（您说的话会一句一句显示在这里）');
    state.seconds = 0;
    renderTimer();
    state.timer = setInterval(() => { if (!state.paused) { state.seconds = DEMO ? state.seconds + 1 : Math.floor(WavRecorder.seconds()); renderTimer(); } }, 1000);
    startRecognition();
    keepScreenOn();
    startDraftSaving();
    show('recording');
  }

  function finishCapture() {
    state.recording = false; state.paused = false;
    clearInterval(state.timer);
    clearInterval(state.draftTimer);
    stopRecognition();
    releaseScreen();
  }
  // 「讲完了」：先停录、立刻存到手机，再说话；上传放到后台
  function stopRecording() {
    if (!state.recording) return;
    finishCapture();
    state.blob = DEMO ? silentWav(Math.max(1, state.seconds)) : WavRecorder.stop();
    if (!DEMO) state.seconds = Math.max(1, Math.round(WavRecorder.seconds()));
    Speaker.say('stop');
    saveStory({});
  }
  // 来电话、锁屏、切到别的 App、被别的 App 抢走麦克风：把讲到的存下来，不丢
  function handleInterruption(why) {
    if (!state.recording) return;
    report('recording-interrupted', why);
    finishCapture();
    state.blob = DEMO ? silentWav(Math.max(1, state.seconds)) : WavRecorder.stop();
    if (!DEMO) state.seconds = Math.max(1, Math.round(WavRecorder.seconds()));
    saveStory({ interrupted: true });
  }
  WavRecorder.onInterrupted(handleInterruption);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (state.recording) handleInterruption('page-hidden'); }
    else syncSoon(500);
  });
  window.addEventListener('pagehide', () => { if (state.recording) handleInterruption('pagehide'); });

  // ====== 草稿：录音时每 10 秒把采到的声音存进手机，页面被杀也能找回 ======
  function startDraftSaving() {
    clearInterval(state.draftTimer);
    if (DEMO) return;
    const info = { user: state.user ? state.user.id : '', userName: state.user ? state.user.name : '',
      questionId: state.current.id, question: state.current.text, stage: state.current.stage,
      followup: state.currentFollowup || '', startedAt: Date.now() };
    state.draftTimer = setInterval(async () => {
      if (!state.recording) return;
      const parts = WavRecorder.drain();
      if (!parts.length) return;
      try { await StoryStore.appendDraft(info, parts); } catch (e) { clearInterval(state.draftTimer); report('draft-failed', errStr(e)); }
    }, 10000);
  }
  async function checkDraft() {
    let d = null;
    try { d = await StoryStore.loadDraft(); } catch (_) { return; }
    if (!d || !d.parts || !d.parts.length) return;
    if (state.user && d.user && d.user !== state.user.id) return;      // 别人的草稿不动
    const n = d.parts.reduce((a, b) => a + b.byteLength, 0) / 2;
    if (n < 16000 * 3) { try { await StoryStore.clearDraft(); } catch (_) {} return; }
    const yes = await ask('上次讲到一半的故事还在', `${d.question || ''}（约 ${fmtDuration(Math.round(n / 16000))}）要存下来吗？`, '存下来', '不要了', 'save', 'discard');
    Speaker.say('draft_found');
    if (!yes) { try { await StoryStore.clearDraft(); } catch (_) {} return; }
    const chunks = d.parts.map((b) => new Int16Array(b));
    state.blob = WavRecorder.encodeWav(chunks, n, 16000);
    state.seconds = Math.round(n / 16000);
    state.current = questionById(d.questionId) || { id: d.questionId || 'draft', text: d.question || '未知问题', stage: d.stage || '' };
    state.currentFollowup = d.followup || '';
    state.transcript = '';
    await saveStory({ interrupted: true, fromDraft: true });
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

  // ====== 保存：先存手机（存不了也先留在内存），马上进「存好了」页；上传在后台做 ======
  async function saveStory(opts) {
    const q = state.current;
    const parentId = state.currentFollowup ? (state.parentByQuestion[q.id] || '') : '';
    const story = {
      id: (state.user ? state.user.id + '-' : '') + String(Date.now()),
      user: state.user ? state.user.id : '', userName: state.user ? state.user.name : '',
      questionId: q.id, question: q.text, stage: q.stage,
      followup: state.currentFollowup || '', followupIndex: state.currentFollowup ? state.followupIndex : 0, parentId,
      interrupted: !!opts.interrupted,
      text: state.transcript.trim(), liveText: state.transcript.trim(), serverText: '',
      serverStatus: 'none', uploaded: false,
      createdAt: Date.now(), duration: state.seconds,
      mimeType: state.blob ? state.blob.type : 'audio/wav', audio: state.blob,
    };
    story.filename = `${fmtFileDate(story.createdAt)}_${q.id}.wav`;
    let localOk = false;
    try { await StoryStore.save(story); localOk = true; }
    catch (e) { report('idb-save-failed', errStr(e)); }
    try { await StoryStore.clearDraft(); } catch (_) {}
    state.stories = state.stories.filter((x) => x.id !== story.id);
    state.stories.unshift(story);                       // 存不进手机也先留在内存里
    if (!state.currentFollowup) state.parentByQuestion[q.id] = story.id;
    state.asked[q.id] = (state.asked[q.id] || 0) + (state.currentFollowup ? 1 : 0);
    state.sessionCount += 1;
    state.lastSavedId = story.id;
    renderSaved(story, localOk);
    stopPlayback();
    show('saved');
    syncSoon(0);                                        // 后台上传
    if (!localOk && !CONFIG.serverUrl) showMessage('没存上', '手机存不下这段录音，请让家人看看');
  }
  function renderSaved(story, localOk) {
    const q = state.current;
    $('#sv-stage').textContent = '关于' + q.stage;
    $('#sv-duration').textContent = '（' + fmtDuration(story.duration) + '）';
    $('#saved-note').textContent = story.interrupted ? '刚才被打断了，讲到的已经存好了。' : (CONFIG.serverUrl ? '正在传到电脑…' : (localOk ? '已经存在手机里' : ''));
    setupPlayer($('#btn-play-saved'), story.audio);
    // 追问：这个问题还有没问过的追问、这次打开还没讲满，就接着问
    const fus = q.followups || [];
    const idx = state.asked[q.id] || 0;
    const enough = state.sessionCount >= MAX_PER_SESSION;
    const fu = (!enough && idx < fus.length) ? fus[idx] : '';
    state.followupIndex = idx + 1;
    $('#sv-followup-label').hidden = !fu;
    $('#sv-followup').textContent = fu || (enough ? '今天讲得够多了，歇一歇吧。' : '');
    $('#btn-continue').hidden = !fu;
    $('#btn-home-2').textContent = enough ? '🏠 今天讲得够多了，歇一歇' : '🏠 今天先到这里';
    $('#btn-home-2').dataset.say = enough ? 'enough' : 'bye';
    if (story.interrupted) Speaker.say('interrupted', { clear: false });
    if (fu) { Speaker.say('well_done', { clear: false }); Speaker.question({ id: q.id + '-f' + (idx + 1), text: fu }); }
    else if (enough) Speaker.say('enough', { clear: false });
    state.pendingFollowup = fu;
  }
  function continueStory() {
    if (!state.pendingFollowup) return;
    state.currentFollowup = state.pendingFollowup;
    startRecording();
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
      const mb = audio ? audio.size / 1048576 : 0;
      const r = await fetchT(serverBase() + '/api/stories', { method: 'POST', body: fd, headers: authHeaders() }, 30000 + 30000 * mb);
      if (!r.ok) report('upload-failed', 'HTTP ' + r.status);
      return r.ok;
    } catch (e) { report('upload-failed', errStr(e)); return false; }
  }
  async function fetchStatus(id) {
    try {
      const r = await fetchT(serverBase() + '/api/stories/' + encodeURIComponent(id), { headers: authHeaders() }, 20000);
      return r.ok ? await r.json() : null;
    } catch (_) { return null; }
  }
  function pendingDeletes() { try { return JSON.parse(localStorage.getItem('pendingDeletes') || '[]'); } catch (_) { return []; } }
  function setPendingDeletes(list) { try { localStorage.setItem('pendingDeletes', JSON.stringify(list)); } catch (_) {} }
  async function deleteOnServer(id) {
    if (!CONFIG.serverUrl) return true;
    try {
      const r = await fetchT(serverBase() + '/api/stories/' + encodeURIComponent(id), { method: 'DELETE', headers: authHeaders() }, 20000);
      return r.ok || r.status === 404;
    } catch (e) { report('delete-failed', errStr(e)); return false; }
  }
  async function flushPendingDeletes() {
    const list = pendingDeletes();
    if (!list.length || !CONFIG.serverUrl) return;
    const left = [];
    for (const id of list) { if (!(await deleteOnServer(id))) left.push(id); }
    setPendingDeletes(left);
  }
  async function syncNow() {
    if (syncing || !CONFIG.serverUrl) return;
    syncing = true;
    let again = 0;
    try {
      await flushPendingDeletes();
      for (const s of state.stories) {
        if (!s.uploaded) {
          if (await uploadStory(s)) { s.uploaded = true; s.serverStatus = 'pending'; try { await StoryStore.save(s); } catch (_) {} refreshStoryViews(s); }
          else { again = Math.max(again, 30000); continue; }
        }
        if (s.serverStatus === 'pending') {
          const r = await fetchStatus(s.id);
          if (r && r.status === 'done') {
            s.serverStatus = 'done'; s.serverText = r.text || '';
            if (s.serverText) s.text = s.serverText;
            try { await StoryStore.save(s); } catch (_) {} refreshStoryViews(s);
          } else if (r && r.status === 'failed') {
            s.serverStatus = 'failed'; s.serverError = r.error || '';
            try { await StoryStore.save(s); } catch (_) {} refreshStoryViews(s);
          } else if (r && r.status === 'missing') {
            s.uploaded = false; try { await StoryStore.save(s); } catch (_) {} again = Math.max(again, 5000);
          } else {
            again = Math.max(again, 5000);
          }
        }
      }
    } catch (_) {} finally { syncing = false; }
    if (again) syncSoon(again);
  }
  async function refreshFromServer() {
    if (!CONFIG.serverUrl || !state.user) return false;
    let remote = [];
    try {
      const r = await fetchT(serverBase() + '/api/stories?user=' + encodeURIComponent(state.user.id), { headers: authHeaders() }, 20000);
      if (!r.ok) return false;
      remote = await r.json();
    } catch (_) { return false; }
    let changed = false;
    const skip = new Set(pendingDeletes());
    for (const m of remote) {
      if (!m || !m.id || skip.has(m.id)) continue;
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
        id: m.id, user: m.user || '', userName: m.userName || '', questionId: m.questionId, question: m.question || '', stage: m.stage || '',
        followup: m.followup || '', interrupted: !!m.interrupted,
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
    if (active.id === 'screen-saved' && state.lastSavedId === s.id && !s.interrupted) {
      $('#saved-note').textContent = s.uploaded ? (s.serverStatus === 'done' ? '已经传到电脑，文字也整理好了' : '已经传到电脑上了') : '正在传到电脑…';
    }
    if (active.id === 'screen-detail' && state.detailId === s.id) openDetail(s, true);
    if (active.id === 'screen-list') renderList();
  }
  function statusLine(s) {
    if (s.serverStatus === 'done') return '';
    if (s.serverStatus === 'pending') return '电脑正在整理文字（四川话识别）…';
    if (s.serverStatus === 'failed') return '文字整理没成功，家人会在电脑上处理。';
    if (!CONFIG.serverUrl) return '';
    return '还没传到电脑，连上网以后会自动上传。';
  }

  // ====== 删除已保存的录音：手机上删掉，电脑上移到 _deleted（可找回）======
  async function deleteStory(s) {
    const yes = await ask('真的要删掉这段吗？', '删掉以后手机上就没有了', '删掉', '不删，留着', 'deleted', 'keep');
    if (!yes) return;
    stopPlayback();
    try { await StoryStore.remove(s.id); } catch (_) {}
    state.stories = state.stories.filter((x) => x.id !== s.id);
    if (!(await deleteOnServer(s.id))) setPendingDeletes([...new Set([...pendingDeletes(), s.id])]);
    renderHome();
    renderList();
    show('list');
  }

  // ====== 讲过的故事 ======
  function renderHome() {
    const n = state.stories.length;
    $('#home-count').textContent = n ? `已经讲了 ${n} 段故事` : '还没有开始讲，今天就开始吧';
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
      b.querySelector('.card-q').textContent = s.followup ? `${s.question} — ${s.followup}` : s.question;
      const st = s.serverStatus === 'pending' ? ' · 文字整理中' : (s.text ? '' : ' · 还没有文字');
      b.querySelector('.card-meta').textContent = `${fmtDate(s.createdAt)} · ${fmtDuration(s.duration)}${st}`;
      b.onclick = () => openDetail(s);
      box.appendChild(b);
    });
  }
  function openDetail(s, silent) {
    state.detailId = s.id;
    $('#dt-stage').textContent = '关于' + s.stage;
    $('#dt-question').textContent = s.followup ? `${s.question}（追问：${s.followup}）` : s.question;
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

  // 网址后面加 ?reset：清空这部手机上存的故事（电脑上的不受影响），口令保留
  async function resetLocal() {
    try { await new Promise((r) => { const q = indexedDB.deleteDatabase('grandma-stories'); q.onsuccess = q.onerror = q.onblocked = () => r(); }); } catch (_) {}
    try {
      const keep = { serverUrl: localStorage.getItem('serverUrl'), serverToken: localStorage.getItem('serverToken') };
      localStorage.clear();
      Object.entries(keep).forEach(([k, v]) => { if (v) localStorage.setItem(k, v); });
    } catch (_) {}
    const clean = new URL(location.href);
    clean.searchParams.delete('reset'); clean.searchParams.delete('token');
    location.replace(clean.toString());
  }

  // ====== 按钮 ======
  function bind() {
    $('#btn-start').onclick = () => openQuestion(nextQuestion(null));
    $('#btn-switch-user').onclick = showUserScreen;
    $('#btn-user-new').onclick = () => { $('#user-name-error').textContent = ''; show('user-new'); setTimeout(() => $('#user-name-input').focus(), 300); };
    $('#btn-user-new-back').onclick = showUserScreen;
    $('#btn-user-create').onclick = submitNewUser;
    $('#user-name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitNewUser(); } });
    $('#btn-list').onclick = () => { renderList(); show('list'); refreshFromServer().then((c) => { if (c) renderList(); }); };
    $('#btn-q-home').onclick = () => { renderHome(); show('home'); };
    $('#btn-replay').onclick = () => Speaker.question(state.current);
    $('#btn-record').onclick = startRecording;
    $('#btn-skip').onclick = () => { markSkipped(state.current.id); openQuestion(nextQuestion(state.current)); };
    $('#btn-stop').onclick = stopRecording;
    $('#btn-continue').onclick = continueStory;
    $('#btn-next').onclick = () => openQuestion(nextQuestion(state.current));
    $('#btn-home-2').onclick = () => { stopPlayback(); renderHome(); show('home'); };
    $('#btn-saved-home').onclick = () => { stopPlayback(); renderHome(); show('home'); };
    $('#btn-list-back').onclick = () => { stopPlayback(); renderHome(); show('home'); };
    $('#btn-detail-back').onclick = () => { stopPlayback(); renderList(); show('list'); };
    $('#btn-detail-delete').onclick = () => { const s = state.stories.find((x) => x.id === state.detailId); if (s) deleteStory(s); };
  }

  async function init() {
    if (params.has('reset')) { await resetLocal(); return; }
    $$('.name').forEach((el) => { el.textContent = CONFIG.name; });
    if (DEMO) {
      const b = document.createElement('div');
      b.className = 'demo-badge';
      b.textContent = '演示模式';
      document.body.appendChild(b);
    }
    bind();
    // ?user=<id>&name=<名字>：家人给奶奶的链接可以直接指定她，不用选人
    if (params.has('user') && params.has('name')) { await selectUser({ id: params.get('user'), name: params.get('name') }); return; }
    const u = loadUser();
    if (u && u.id) { await selectUser(u); }
    else { showUserScreen(); }
  }
  init();
})();
