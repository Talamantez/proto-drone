// IndexedDB persistence for missions and their event logs.
export const DB = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('protodrone', 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('missions')) db.createObjectStore('missions', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('events'))
        db.createObjectStore('events', { keyPath: 'id', autoIncrement: true }).createIndex('missionId', 'missionId');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (store, mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    putMission: m => tx('missions', 'readwrite', s => s.put(m)),
    getMission: id => tx('missions', 'readonly', s => s.get(id)),
    allMissions: () => tx('missions', 'readonly', s => s.getAll()),
    delMission: async id => {
      await tx('missions', 'readwrite', s => s.delete(id));
      const evs = await DB.events(id);
      await tx('events', 'readwrite', s => evs.forEach(e => s.delete(e.id)));
    },
    addEvent: e => tx('events', 'readwrite', s => s.add(e)),
    events: id => tx('events', 'readonly', s => s.index('missionId').getAll(id)),
  };
})();
