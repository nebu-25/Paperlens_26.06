import { STORAGE_KEY } from '../constants';
import type { Paper, ReviewNote } from '../types';

const DB_NAME = 'paperlens-local-cache';
const DB_VERSION = 1;
const SNAPSHOT_STORE = 'snapshots';
const TEXT_STORE = 'paperTexts';
const FALLBACK_PREFIX = 'paperlens:cache:v2:';

export type LocalReviewSnapshot = {
  library?: Record<string, Paper>;
  notes?: Record<string, ReviewNote>;
  activeId?: string | null;
  dirtyIds?: string[];
  textDirtyIds?: string[];
  deletedIds?: string[];
};

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window && Boolean(window.indexedDB);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) db.createObjectStore(SNAPSHOT_STORE);
      if (!db.objectStoreNames.contains(TEXT_STORE)) db.createObjectStore(TEXT_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function fallbackKey(accountKey: string): string {
  return `${FALLBACK_PREFIX}${accountKey}`;
}

function fallbackTextsKey(accountKey: string): string {
  return `${FALLBACK_PREFIX}${accountKey}:texts`;
}

function textKey(accountKey: string, paperId: string): string {
  return `${accountKey}:${paperId}`;
}

function splitSnapshot(snapshot: LocalReviewSnapshot): {
  snapshotWithoutText: LocalReviewSnapshot;
  texts: Record<string, string>;
} {
  const texts: Record<string, string> = {};
  const library = Object.fromEntries(
    Object.entries(snapshot.library ?? {}).map(([id, paper]) => {
      if (paper.text) texts[id] = paper.text;
      return [id, { ...paper, text: '' }];
    }),
  );
  return {
    snapshotWithoutText: { ...snapshot, library },
    texts,
  };
}

function mergeTexts(
  snapshot: LocalReviewSnapshot | null,
  texts: Record<string, string>,
): LocalReviewSnapshot | null {
  if (!snapshot?.library) return snapshot;
  return {
    ...snapshot,
    library: Object.fromEntries(
      Object.entries(snapshot.library).map(([id, paper]) => [
        id,
        { ...paper, text: paper.text || texts[id] || '' },
      ]),
    ),
  };
}

async function readIndexedSnapshot(accountKey: string): Promise<LocalReviewSnapshot | null> {
  const db = await openDb();
  try {
    const snapshotTx = db.transaction(SNAPSHOT_STORE, 'readonly');
    const snapshot = await requestToPromise<LocalReviewSnapshot | undefined>(
      snapshotTx.objectStore(SNAPSHOT_STORE).get(accountKey),
    );
    await transactionDone(snapshotTx);
    if (!snapshot) return null;

    const textTx = db.transaction(TEXT_STORE, 'readonly');
    const keys = await requestToPromise<IDBValidKey[]>(textTx.objectStore(TEXT_STORE).getAllKeys());
    const prefix = `${accountKey}:`;
    const textIds = keys.filter((key) => typeof key === 'string' && key.startsWith(prefix)) as string[];
    const entries = await Promise.all(
      textIds.map(async (key) => {
        const value = await requestToPromise<string | undefined>(textTx.objectStore(TEXT_STORE).get(key));
        return [key.slice(prefix.length), value ?? ''] as const;
      }),
    );
    await transactionDone(textTx);
    return mergeTexts(snapshot, Object.fromEntries(entries));
  } finally {
    db.close();
  }
}

async function writeIndexedSnapshot(accountKey: string, snapshot: LocalReviewSnapshot): Promise<void> {
  const { snapshotWithoutText, texts } = splitSnapshot(snapshot);
  const db = await openDb();
  try {
    const tx = db.transaction([SNAPSHOT_STORE, TEXT_STORE], 'readwrite');
    tx.objectStore(SNAPSHOT_STORE).put(snapshotWithoutText, accountKey);
    const textStore = tx.objectStore(TEXT_STORE);
    const existingKeys = await requestToPromise<IDBValidKey[]>(textStore.getAllKeys());
    const prefix = `${accountKey}:`;
    for (const key of existingKeys) {
      if (typeof key === 'string' && key.startsWith(prefix) && !(key.slice(prefix.length) in texts)) {
        textStore.delete(key);
      }
    }
    for (const [id, text] of Object.entries(texts)) {
      textStore.put(text, textKey(accountKey, id));
    }
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

async function deleteIndexedSnapshot(accountKey: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction([SNAPSHOT_STORE, TEXT_STORE], 'readwrite');
    tx.objectStore(SNAPSHOT_STORE).delete(accountKey);
    const textStore = tx.objectStore(TEXT_STORE);
    const keys = await requestToPromise<IDBValidKey[]>(textStore.getAllKeys());
    const prefix = `${accountKey}:`;
    for (const key of keys) {
      if (typeof key === 'string' && key.startsWith(prefix)) textStore.delete(key);
    }
    await transactionDone(tx);
  } finally {
    db.close();
  }
}

function readFallbackSnapshot(accountKey: string): LocalReviewSnapshot | null {
  const raw = window.localStorage.getItem(fallbackKey(accountKey));
  if (!raw) return null;
  const snapshot = JSON.parse(raw) as LocalReviewSnapshot;
  const texts = JSON.parse(window.localStorage.getItem(fallbackTextsKey(accountKey)) ?? '{}') as Record<string, string>;
  return mergeTexts(snapshot, texts);
}

function writeFallbackSnapshot(accountKey: string, snapshot: LocalReviewSnapshot): void {
  const { snapshotWithoutText, texts } = splitSnapshot(snapshot);
  window.localStorage.setItem(fallbackKey(accountKey), JSON.stringify(snapshotWithoutText));
  window.localStorage.setItem(fallbackTextsKey(accountKey), JSON.stringify(texts));
}

function deleteFallbackSnapshot(accountKey: string): void {
  window.localStorage.removeItem(fallbackKey(accountKey));
  window.localStorage.removeItem(fallbackTextsKey(accountKey));
}

export async function readLocalReviewCache(accountKey: string): Promise<LocalReviewSnapshot | null> {
  try {
    if (canUseIndexedDb()) {
      const snapshot = await readIndexedSnapshot(accountKey);
      if (snapshot) return snapshot;
    }
  } catch {
    /* fall through to localStorage */
  }
  try {
    return readFallbackSnapshot(accountKey);
  } catch {
    return null;
  }
}

export async function writeLocalReviewCache(accountKey: string, snapshot: LocalReviewSnapshot): Promise<void> {
  if (canUseIndexedDb()) {
    try {
      await writeIndexedSnapshot(accountKey, snapshot);
      deleteFallbackSnapshot(accountKey);
      return;
    } catch {
      /* fall through to localStorage */
    }
  }
  writeFallbackSnapshot(accountKey, snapshot);
}

export async function clearLocalReviewCache(accountKey: string): Promise<void> {
  if (canUseIndexedDb()) {
    try {
      await deleteIndexedSnapshot(accountKey);
    } catch {
      /* also clear fallback below */
    }
  }
  deleteFallbackSnapshot(accountKey);
}

export function readLegacyLocalReviewCache(): LocalReviewSnapshot | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalReviewSnapshot) : null;
  } catch {
    return null;
  }
}

export function clearLegacyLocalReviewCache(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
