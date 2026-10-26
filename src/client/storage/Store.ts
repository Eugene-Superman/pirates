const DB_NAME = 'pirate-game';
const DB_VERSION = 1;
const TABLE = 'kv';
const LOCAL_PREFIX = 'pirate-game.'; // localStorage keys: the fallback, and where settings were kept before
const FLUSH_DELAY = 400; // milliseconds: writes within this are sent to the database together

/** What the browser keeps for us, by key */
export type StoreKey = 'save' | 'hud' | 'tracker' | 'sound' | 'view' | 'log' | 'lang';
const KEYS: readonly StoreKey[] = ['save', 'hud', 'tracker', 'sound', 'view', 'log', 'lang'];

function request<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.addEventListener('success', () => resolve(req.result));
    req.addEventListener('error', () => reject(req.error ?? new Error('IndexedDB request failed')));
  });
}

function openDatabase() {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.addEventListener('upgradeneeded', () => {
    if (!req.result.objectStoreNames.contains(TABLE)) req.result.createObjectStore(TABLE);
  });
  return request(req);
}

function readLocal(key: StoreKey): unknown {
  try {
    const text = localStorage.getItem(LOCAL_PREFIX + key);
    return text === null ? undefined : (JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
}

function writeLocal(key: StoreKey, value: unknown) {
  try {
    localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
  } catch {
    // Full or blocked: kept for this session only
  }
}

/** One key of the store, for a part of the client that keeps one thing (its settings) and needs no more */
export interface Slot {
  get(): unknown;
  set(value: unknown): void;
}

/**
 * The browser's memory of the game until there is a server: the player's progress and every setting, by key. It is
 * IndexedDB when the browser allows it (a private window may not), localStorage otherwise, and memory alone when
 * neither works. Everything is read once at the start (`open`), so `get` is instant; `set` changes the copy in memory
 * and writes it a moment later, a few keys together. `flush` writes at once: when the page is hidden or closed
 */
export class Store {
  private readonly values = new Map<StoreKey, unknown>();
  private readonly dirty = new Set<StoreKey>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The last write, till it is done */
  private writing: Promise<void> = Promise.resolve();
  private readonly db: IDBDatabase | null;

  private constructor(db: IDBDatabase | null) {
    this.db = db;
  }

  /** Opens the database and reads every key; settings kept in localStorage before are carried over */
  static async open(): Promise<Store> {
    let db: IDBDatabase | null = null;
    try {
      db = await openDatabase();
    } catch (error) {
      console.warn('IndexedDB unavailable, keeping the game in localStorage', error);
    }
    const store = new Store(db);
    let kept: unknown[] = KEYS.map(() => undefined);
    if (db) {
      try {
        const table = db.transaction(TABLE).objectStore(TABLE);
        kept = await Promise.all(KEYS.map((key) => request<unknown>(table.get(key))));
      } catch (error) {
        console.warn('IndexedDB read failed', error);
      }
    }
    KEYS.forEach((key, i) => {
      let value = kept[i];
      // Not in the database yet: what localStorage had (the fallback's, or an older version's settings)
      if (value === undefined) {
        value = readLocal(key);
        if (value !== undefined && db) store.dirty.add(key);
      }
      if (value !== undefined) store.values.set(key, value);
    });
    store.schedule();
    return store;
  }

  get(key: StoreKey): unknown {
    return this.values.get(key);
  }

  /** One key, for a part that keeps only that */
  slot(key: StoreKey): Slot {
    return { get: () => this.get(key), set: (value) => this.set(key, value) };
  }

  /** Keeps a value: plain data (what JSON can hold), so the localStorage fallback keeps it the same */
  set(key: StoreKey, value: unknown) {
    this.values.set(key, value);
    this.dirty.add(key);
    this.schedule();
  }

  /** Forgets everything kept but the language: a new game on the next start, in the same language */
  clear() {
    for (const key of KEYS) {
      if (key === 'lang') continue;
      this.values.delete(key);
      this.dirty.add(key);
      try {
        localStorage.removeItem(LOCAL_PREFIX + key);
      } catch {
        // Nothing to remove there
      }
    }
    this.flush();
  }

  /** Writes what changed now. Called when the page is hidden: a write started then still finishes */
  flush() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.dirty.size === 0) return;
    const keys = [...this.dirty];
    this.dirty.clear();
    if (!this.db) {
      for (const key of keys) {
        const value = this.values.get(key);
        if (value === undefined) continue;
        writeLocal(key, value);
      }
      this.writing = Promise.resolve();
      return;
    }
    try {
      const transaction = this.db.transaction(TABLE, 'readwrite');
      this.writing = new Promise<void>((resolve) => {
        for (const end of ['complete', 'error', 'abort']) transaction.addEventListener(end, () => resolve());
      });
      const table = transaction.objectStore(TABLE);
      for (const key of keys) {
        const value = this.values.get(key);
        if (value === undefined) table.delete(key);
        else table.put(value, key);
      }
    } catch (error) {
      // The database went away (closed by the browser): localStorage keeps it instead
      console.warn('IndexedDB write failed, keeping the game in localStorage', error);
      for (const key of keys) writeLocal(key, this.values.get(key));
    }
  }

  /** Resolves when the last write is done: before the page reloads */
  written(): Promise<void> {
    return this.writing;
  }

  private schedule() {
    if (this.timer !== null || this.dirty.size === 0) return;
    this.timer = setTimeout(() => this.flush(), FLUSH_DELAY);
  }
}
