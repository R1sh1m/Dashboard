import initSqlJs, { type Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { PointOfInterest } from '../types/telemetry';

const STORAGE_KEY = 'artemis-poi-database';

let databasePromise: Promise<Database> | null = null;
let writeQueue = Promise.resolve();

const getDatabase = async (): Promise<Database> => {
  if (!databasePromise) {
    databasePromise = initSqlJs({ locateFile: () => wasmUrl }).then((SQL) => {
      const stored = localStorage.getItem(STORAGE_KEY);
      const database = stored
        ? new SQL.Database(Uint8Array.from(atob(stored), (character) => character.charCodeAt(0)))
        : new SQL.Database();

      database.run(`
        CREATE TABLE IF NOT EXISTS points_of_interest (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          title TEXT NOT NULL,
          notes TEXT,
          timestamp INTEGER NOT NULL,
          meta TEXT
        )
      `);
      return database;
    }).catch((error) => {
      databasePromise = null;
      console.error('Failed to initialize the POI SQLite database.', error);
      throw error;
    });
  }
  return databasePromise;
};

const persistDatabase = (database: Database) => {
  const bytes = database.export();
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  localStorage.setItem(STORAGE_KEY, btoa(binary));
};

const enqueueWrite = (operation: (database: Database) => void): Promise<void> => {
  writeQueue = writeQueue.then(async () => {
    const database = await getDatabase();
    operation(database);
    persistDatabase(database);
  });
  return writeQueue;
};

export const poiDatabase = {
  async load(): Promise<PointOfInterest[]> {
    const database = await getDatabase();
    const result = database.exec(`
      SELECT id, category, lat, lng, title, notes, timestamp, meta
      FROM points_of_interest
      ORDER BY timestamp ASC
    `);
    const rows = result[0]?.values ?? [];
    return rows.map(([id, category, lat, lng, title, notes, timestamp, meta]) => ({
      id: String(id),
      category: String(category) as PointOfInterest['category'],
      lat: Number(lat),
      lng: Number(lng),
      title: String(title),
      ...(notes ? { notes: String(notes) } : {}),
      timestamp: Number(timestamp),
      ...(meta ? { meta: JSON.parse(String(meta)) } : {}),
    }));
  },

  save(poi: PointOfInterest): Promise<void> {
    return enqueueWrite((database) => {
      const statement = database.prepare(`
        INSERT OR REPLACE INTO points_of_interest
          (id, category, lat, lng, title, notes, timestamp, meta)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      statement.run([
        poi.id,
        poi.category,
        poi.lat,
        poi.lng,
        poi.title,
        poi.notes ?? null,
        poi.timestamp,
        poi.meta ? JSON.stringify(poi.meta) : null,
      ]);
      statement.free();
    });
  },

  delete(id: string): Promise<void> {
    return enqueueWrite((database) => {
      const statement = database.prepare('DELETE FROM points_of_interest WHERE id = ?');
      statement.run([id]);
      statement.free();
    });
  },
};
