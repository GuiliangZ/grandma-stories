// 手机本地存储（IndexedDB）：录音和文字先存在手机里，之后再同步到电脑。
window.StoryStore = (() => {
  const DB_NAME = 'grandma-stories';
  const STORE = 'stories';
  const VERSION = 1;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function run(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve(req ? req.result : undefined); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  }

  return {
    save: (story) => run('readwrite', (s) => s.put(story)),
    all: async () => {
      const list = (await run('readonly', (s) => s.getAll())) || [];
      return list.sort((a, b) => b.createdAt - a.createdAt);
    },
    remove: (id) => run('readwrite', (s) => s.delete(id)),
  };
})();
