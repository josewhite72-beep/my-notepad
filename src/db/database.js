let db;

export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('cuaderno', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('notes')) {
        const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
        noteStore.createIndex('updatedAt', 'updatedAt');
        noteStore.createIndex('createdAt', 'createdAt');
      }

      if (!db.objectStoreNames.contains('events')) {
        const eventStore = db.createObjectStore('events', { keyPath: 'id' });
        eventStore.createIndex('startAt', 'startAt');
        eventStore.createIndex('reminderAt', 'reminderAt');
      }
    };
  });
}

export function getDB() {
  return db;
}

// Ayudante genérico para una petición dentro de una transacción
export function run(storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction([storeName], mode);
    const request = fn(tx.objectStore(storeName));
    let result;
    if (request) request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
