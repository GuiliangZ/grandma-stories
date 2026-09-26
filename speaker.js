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

  // 返回 true=放完 / 'missing'=文件不存在 / 'blocked'=浏览器不让放 / 'cancelled'
  function playFile(src) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (r) => { if (done) return; done = true; el.onended = el.onerror = el.onpause = null; cancelCurrent = null; resolve(r); };
      cancelCurrent = () => { el.pause(); finish('cancelled'); };
      el.onended = () => finish(true);
      el.onpause = () => finish(true);     // iPhone 打开麦克风时可能把它暂停掉，当作放完
      el.onerror = () => finish('missing');
      el.src = src;
      const p = el.play();
      if (p && p.catch) p.catch(() => finish('blocked'));
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
      let r = item.src ? await playFile(item.src) : 'missing';
      // 整套系统只用一种声音：只有语音文件确实不存在时才退到手机自带朗读；被浏览器拦住就保持安静
      if (r === 'missing' && item.text) r = await tts(item.text);
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
    question(q, opts = {}) { return enqueue({ src: q.audioUrl || (q.uiKey ? cfg.uiDir + q.uiKey + '.m4a' : cfg.questionDir + q.id + '.m4a'), text: q.text }, opts.clear === true); },
    stop,
    idle() { return playing ? new Promise((r) => idleResolvers.push(r)) : Promise.resolve(true); },
    // 等某次播报，但最多等 ms 毫秒
    wait(p, ms) { return Promise.race([p, new Promise((r) => setTimeout(() => r(true), ms))]); },
  };
  return api;
})();
