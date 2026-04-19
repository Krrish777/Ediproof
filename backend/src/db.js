import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, "..", "ediproof.db");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    kind         TEXT NOT NULL,
    token_id     INTEGER,
    tx_hash      TEXT,
    actor        TEXT,
    institution  TEXT,
    created_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
  CREATE INDEX IF NOT EXISTS idx_events_institution ON events(institution);
  CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
`);

export const insertEvent = db.prepare(`
  INSERT INTO events (kind, token_id, tx_hash, actor, institution, created_at)
  VALUES (@kind, @tokenId, @txHash, @actor, @institution, @createdAt)
`);

export const selectStats = db.prepare(`
  SELECT
    SUM(CASE WHEN kind = 'issued'   THEN 1 ELSE 0 END) AS totalIssued,
    SUM(CASE WHEN kind = 'revoked'  THEN 1 ELSE 0 END) AS totalRevoked,
    SUM(CASE WHEN kind = 'reissued' THEN 1 ELSE 0 END) AS totalReissued,
    SUM(CASE WHEN kind = 'verified' THEN 1 ELSE 0 END) AS totalVerified,
    COUNT(DISTINCT institution) AS institutions
  FROM events
`);

export const selectActivity = db.prepare(`
  SELECT id, kind, token_id AS tokenId, tx_hash AS txHash,
         actor, institution, created_at AS createdAt
  FROM events
  ORDER BY created_at DESC
  LIMIT ?
`);

export const selectByInstitution = db.prepare(`
  SELECT
    institution AS address,
    COUNT(*) AS issuedCount,
    MAX(created_at) AS lastActive
  FROM events
  WHERE institution = ? AND kind = 'issued'
  GROUP BY institution
`);

console.log(`[db] opened ${DB_PATH}`);
