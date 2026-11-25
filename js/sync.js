/*
 * Family sharing without a server.
 *
 * A share file is a normal JSON export that a family member hands to another
 * phone (AirDrop, Files, Messages, email). Importing one MERGES it instead of
 * replacing: records are matched by id, a newer edit wins, and deletions travel
 * as tombstones so a record removed on one phone is not resurrected by the
 * other. Nothing is uploaded anywhere: the exchange is a file you move.
 *
 * That is deliberately not live sync. Real-time sync between phones needs an
 * account and a secure backend, which this version does not include.
 */

import * as db from './db.js';
import { data, materializeRecurring } from './state.js';

export const SHARE_STORES = [
  'profiles',
  'categories',
  'payees',
  'transactions',
  'expected',
  'loans',
  'lendings',
  'accounts',
  'assets',
];

export function buildShareFile() {
  const payload = {
    app: 'family-finance',
    kind: 'family-share',
    version: db.DB_VERSION,
    exportedAt: new Date().toISOString(),
    familyName: data.settings.familyName || '',
    deviceName: data.settings.deviceName || '',
    data: {},
  };
  SHARE_STORES.forEach((store) => {
    payload.data[store] = (data[store] || [])
      .filter((record) => !record.demo)
      .map((record) => (store === 'accounts' ? { ...record, iban: '' } : record));
  });
  payload.data.tombstones = (data.tombstones || []).slice();
  return payload;
}

function normalise(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/* People, categories and stores are matched by name, so the same person typed
 * on two phones becomes one profile instead of two. */
function buildIdentityMap(store, incomingList, keyFn) {
  const localByKey = new Map();
  (data[store] || []).forEach((record) => {
    const key = keyFn(record);
    if (key && !localByKey.has(key)) localByKey.set(key, record.id);
  });
  const map = new Map();
  incomingList.forEach((record) => {
    const key = keyFn(record);
    const localId = key ? localByKey.get(key) : null;
    if (localId && localId !== record.id) map.set(record.id, localId);
  });
  return map;
}

export async function mergeShareFile(payload) {
  if (!payload || payload.app !== 'family-finance' || payload.kind !== 'family-share' || !payload.data) {
    throw new Error('not-a-share-file');
  }
  const incoming = payload.data;
  const summary = { added: 0, updated: 0, removed: 0, same: 0 };

  const mapping = {
    profiles: buildIdentityMap('profiles', incoming.profiles || [], (r) => normalise(r.name)),
    categories: buildIdentityMap('categories', incoming.categories || [], (r) => `${r.kind}|${normalise(r.name)}`),
    payees: buildIdentityMap('payees', incoming.payees || [], (r) => normalise(r.name)),
  };

  const localId = (store, id) => (mapping[store] ? mapping[store].get(id) || id : id);

  const remapRecord = (store, record) => {
    const next = { ...record, id: localId(store, record.id) };
    if (next.profileId) next.profileId = localId('profiles', next.profileId);
    if (next.categoryId) next.categoryId = localId('categories', next.categoryId);
    if (next.payeeId) next.payeeId = localId('payees', next.payeeId);
    return next;
  };

  /* Tombstones are keyed "store:recordId" on both phones. */
  const localTombstones = new Map(
    (data.tombstones || []).map((t) => [`${t.store}:${t.recordId}`, t]),
  );
  const incomingTombstones = (incoming.tombstones || [])
    .filter((t) => t && SHARE_STORES.includes(t.store) && t.recordId)
    .map((t) => ({ ...t, recordId: localId(t.store, t.recordId) }));

  /* 1. Deletions first, so a merged addition cannot bring a deleted record back. */
  for (const tombstone of incomingTombstones) {
    const key = `${tombstone.store}:${tombstone.recordId}`;
    const stamp = tombstone.deletedAt || '';
    const known = localTombstones.get(key);
    if (!known || stamp > (known.deletedAt || '')) {
      const next = { id: key, store: tombstone.store, recordId: tombstone.recordId, deletedAt: stamp };
      localTombstones.set(key, next);
      data.tombstones = (data.tombstones || []).filter((t) => t.id !== key).concat(next);
      await db.put('tombstones', next);
    }
    const bucket = data[tombstone.store] || [];
    const record = bucket.find((item) => item.id === tombstone.recordId);
    if (record && (record.updatedAt || '') <= stamp) {
      await db.remove(tombstone.store, record.id);
      data[tombstone.store] = bucket.filter((item) => item.id !== record.id);
      summary.removed += 1;
    }
  }

  /* 2. Additions and updates. */
  for (const store of SHARE_STORES) {
    const list = (incoming[store] || [])
      .filter((record) => record && record.id)
      .map((record) => remapRecord(store, record));
    if (!list.length) continue;
    const bucket = data[store] || [];
    const index = new Map(bucket.map((record) => [record.id, record]));
    const toWrite = [];

    list.forEach((record) => {
      const existing = index.get(record.id);
      const tombstone = localTombstones.get(`${store}:${record.id}`);
      if (tombstone && (record.updatedAt || '') <= (tombstone.deletedAt || '')) {
        summary.same += 1;
        return;
      }
      if (!existing) {
        index.set(record.id, record);
        toWrite.push(record);
        summary.added += 1;
        return;
      }
      if ((record.updatedAt || '') > (existing.updatedAt || '')) {
        /* Share files carry no IBAN; keep the one this phone already has. */
        const next = store === 'accounts' && !record.iban && existing.iban
          ? { ...record, iban: existing.iban }
          : record;
        index.set(record.id, next);
        toWrite.push(next);
        summary.updated += 1;
        return;
      }
      summary.same += 1;
    });

    if (!toWrite.length) continue;
    await db.putMany(store, toWrite);
    const replaced = new Set(toWrite.map((record) => record.id));
    data[store] = [...bucket.filter((record) => !replaced.has(record.id)), ...toWrite];
  }

  await materializeRecurring();
  return summary;
}
