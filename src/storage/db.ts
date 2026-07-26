const DB_NAME = 'campionatore';
const DB_VERSION = 1;
const SAMPLES_STORE = 'samples';
const PAD_ASSIGNMENTS_STORE = 'padAssignments';

export interface SampleRecord {
  id: string;
  name: string;
  blob: Blob;
  createdAt: number;
}

export interface PadAssignment {
  padIndex: number;
  sampleId: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SAMPLES_STORE)) {
        db.createObjectStore(SAMPLES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(PAD_ASSIGNMENTS_STORE)) {
        db.createObjectStore(PAD_ASSIGNMENTS_STORE, { keyPath: 'padIndex' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDatabase();
  return dbPromise;
}

function runRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return getDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = run(tx.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

export function saveSample(sample: SampleRecord): Promise<void> {
  return runRequest(SAMPLES_STORE, 'readwrite', (store) => store.put(sample)).then(() => undefined);
}

export function getSample(id: string): Promise<SampleRecord | undefined> {
  return runRequest(SAMPLES_STORE, 'readonly', (store) => store.get(id));
}

export function getAllSamples(): Promise<SampleRecord[]> {
  return runRequest(SAMPLES_STORE, 'readonly', (store) => store.getAll());
}

export function assignPadSample(padIndex: number, sampleId: string): Promise<void> {
  return runRequest(PAD_ASSIGNMENTS_STORE, 'readwrite', (store) => store.put({ padIndex, sampleId })).then(
    () => undefined
  );
}

export function getAllPadAssignments(): Promise<PadAssignment[]> {
  return runRequest(PAD_ASSIGNMENTS_STORE, 'readonly', (store) => store.getAll());
}
