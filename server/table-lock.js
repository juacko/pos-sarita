const LOCKS = new Map();
const LOCK_TIMEOUT_MS = 10000;

function acquireTableLock(tableId, meseroId) {
  return new Promise((resolve, reject) => {
    const existing = LOCKS.get(tableId);
    if (existing) {
      if (existing.meseroId === meseroId) {
        return resolve();
      }
      if (Date.now() - existing.timestamp > LOCK_TIMEOUT_MS) {
        LOCKS.delete(tableId);
      } else {
        return reject({
          error: 'Mesa siendo modificada por otro usuario',
          code: 'LOCKED',
          holder: existing.meseroId
        });
      }
    }
    LOCKS.set(tableId, { meseroId, timestamp: Date.now() });
    resolve();
  });
}

function releaseTableLock(tableId) {
  LOCKS.delete(tableId);
}

function getTableLock(tableId) {
  const lock = LOCKS.get(tableId);
  if (lock && Date.now() - lock.timestamp > LOCK_TIMEOUT_MS) {
    LOCKS.delete(tableId);
    return null;
  }
  return lock || null;
}

module.exports = { acquireTableLock, releaseTableLock, getTableLock };
