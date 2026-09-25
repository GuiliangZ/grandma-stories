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
    async all(userId) {
      const list = (await run('readonly', (s) => s.getAll())) || [];
      return list.map(hydrate).filter((r) => !userId || r.user === userId).sort((a, b) => b.createdAt - a.createdAt);
    },
    remove: (id) => run('readwrite', (s) => s.delete(id)),
  };
})();
