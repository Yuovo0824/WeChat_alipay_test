// Creates the SQLite database and applies every migration in order.
//
// Prisma's migration engine does not work on Node 24, so migrations are plain
// SQL applied with node:sqlite. This script is idempotent: already-applied
// migrations are recorded in `_manual_migrations` and skipped.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = path.join(process.cwd(), "prisma", "dev.db");
const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

if (!fs.existsSync(MIGRATIONS_DIR)) {
  console.error(`No migrations found at ${MIGRATIONS_DIR}`);
  process.exit(1);
}

const dirs = fs
  .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

if (dirs.length === 0) {
  console.error("No migration directories found");
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS "_manual_migrations" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const applied = new Set(
  db.prepare(`SELECT "name" FROM "_manual_migrations"`).all().map((r) => r.name)
);

let appliedCount = 0;
for (const name of dirs) {
  if (applied.has(name)) {
    console.log(`skip   ${name} (already applied)`);
    continue;
  }
  const file = path.join(MIGRATIONS_DIR, name, "migration.sql");
  if (!fs.existsSync(file)) {
    console.warn(`skip   ${name} (no migration.sql)`);
    continue;
  }
  const sql = fs.readFileSync(file, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  db.exec("BEGIN");
  try {
    for (const stmt of statements) db.exec(stmt + ";");
    db.prepare(`INSERT INTO "_manual_migrations" ("name") VALUES (?)`).run(name);
    db.exec("COMMIT");
    appliedCount += 1;
    console.log(`apply  ${name}`);
  } catch (e) {
    db.exec("ROLLBACK");
    // A pre-existing database (e.g. restored from a backup) already has the
    // schema but no bookkeeping table. Treat "already exists" as applied.
    if (/already exists/i.test(e.message)) {
      db.prepare(`INSERT OR IGNORE INTO "_manual_migrations" ("name") VALUES (?)`).run(name);
      console.log(`adopt  ${name} (schema already present)`);
      continue;
    }
    console.error(`failed ${name}: ${e.message}`);
    db.close();
    process.exit(1);
  }
}

const tables = db
  .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
  .all()
  .map((r) => r.name);

db.close();

console.log(`\nDatabase ready at prisma/dev.db (${appliedCount} migration(s) applied)`);
console.log(`Tables: ${tables.join(", ")}`);
