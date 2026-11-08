// Bandeja de lo compartido desde otras apps (la llena sw.js)
const INBOX_DB = 'cuaderno-inbox';

function openInbox() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(INBOX_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('items')) {
        req.result.createObjectStore('items', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await openInbox();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('items', mode);
      const req = fn(tx.objectStore('items'));
      let result;
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getInboxItems() {
  const items = await run('readonly', store => store.getAll());
  return (items || []).sort((a, b) => a.createdAt - b.createdAt);
}

export function removeInboxItem(id) {
  return run('readwrite', store => store.delete(id));
}
