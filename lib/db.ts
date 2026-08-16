import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "homelab-disaster-sim.db"));
db.pragma("journal_mode = WAL");
// next build eşzamanlı olarak birden fazla worker'da bu modülü import edip aynı dosyayı açabiliyor —
// busy_timeout olmadan bu SQLITE_BUSY ile anında patlar; bunun yerine kilidin açılmasını bekler.
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS local_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    lastSnapshot TEXT,
    lastSnapshotAt TEXT,
    lastError TEXT,
    truenasApiUrl TEXT,
    truenasApiKey TEXT,
    truenasBackupData TEXT,
    truenasError TEXT
  )
`);
db.prepare("INSERT OR IGNORE INTO local_state (id) VALUES (1)").run();

db.exec(`
  CREATE TABLE IF NOT EXISTS external_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tool TEXT NOT NULL,
    pathPrefix TEXT NOT NULL,
    markerPath TEXT NOT NULL,
    expectedIntervalHours INTEGER NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

export type ExternalBackupRow = {
  id: number;
  name: string;
  tool: string;
  pathPrefix: string;
  markerPath: string;
  expectedIntervalHours: number;
  createdAt: string;
};

export function listExternalBackups(): ExternalBackupRow[] {
  return db.prepare("SELECT * FROM external_backups ORDER BY id ASC").all() as ExternalBackupRow[];
}

export function createExternalBackup(input: {
  name: string;
  tool: string;
  pathPrefix: string;
  markerPath: string;
  expectedIntervalHours: number;
}) {
  const stmt = db.prepare(
    "INSERT INTO external_backups (name, tool, pathPrefix, markerPath, expectedIntervalHours) VALUES (@name, @tool, @pathPrefix, @markerPath, @expectedIntervalHours)"
  );
  const result = stmt.run(input);
  return db.prepare("SELECT * FROM external_backups WHERE id = ?").get(result.lastInsertRowid) as ExternalBackupRow;
}

export function deleteExternalBackup(id: number) {
  db.prepare("DELETE FROM external_backups WHERE id = ?").run(id);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS excluded_pools (
    pool TEXT PRIMARY KEY,
    excludedAt TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

export function listExcludedPools(): string[] {
  return (db.prepare("SELECT pool FROM excluded_pools").all() as { pool: string }[]).map((r) => r.pool);
}

export function excludePool(pool: string) {
  db.prepare("INSERT OR IGNORE INTO excluded_pools (pool) VALUES (?)").run(pool);
}

export function includePool(pool: string) {
  db.prepare("DELETE FROM excluded_pools WHERE pool = ?").run(pool);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS excluded_datasets (
    dataset TEXT PRIMARY KEY,
    excludedAt TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

export function listExcludedDatasets(): string[] {
  return (db.prepare("SELECT dataset FROM excluded_datasets").all() as { dataset: string }[]).map((r) => r.dataset);
}

export function excludeDataset(dataset: string) {
  db.prepare("INSERT OR IGNORE INTO excluded_datasets (dataset) VALUES (?)").run(dataset);
}

export function includeDataset(dataset: string) {
  db.prepare("DELETE FROM excluded_datasets WHERE dataset = ?").run(dataset);
}

export type LocalState = {
  id: number;
  lastSnapshot: string | null;
  lastSnapshotAt: string | null;
  lastError: string | null;
  truenasApiUrl: string | null;
  truenasApiKey: string | null;
  truenasBackupData: string | null;
  truenasError: string | null;
};

export function getLocalState(): LocalState {
  return db.prepare("SELECT * FROM local_state WHERE id = 1").get() as LocalState;
}

export function saveSnapshot(snapshotJson: string) {
  db.prepare(
    "UPDATE local_state SET lastSnapshot = ?, lastSnapshotAt = datetime('now'), lastError = NULL WHERE id = 1"
  ).run(snapshotJson);
}

export function saveError(error: string) {
  db.prepare("UPDATE local_state SET lastError = ? WHERE id = 1").run(error);
}

export function saveTrueNasConfig(apiUrl: string | null, apiKey: string | null) {
  db.prepare("UPDATE local_state SET truenasApiUrl = ?, truenasApiKey = ? WHERE id = 1").run(apiUrl, apiKey);
}

export function saveTrueNasBackupData(dataJson: string) {
  db.prepare("UPDATE local_state SET truenasBackupData = ?, truenasError = NULL WHERE id = 1").run(dataJson);
}

export function saveTrueNasError(error: string) {
  db.prepare("UPDATE local_state SET truenasError = ? WHERE id = 1").run(error);
}

export default db;
