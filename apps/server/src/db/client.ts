import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { migrationsFolder } from "../config.ts";
import * as schema from "./schema.ts";

export function openDatabase(dataDir: string, migrations = migrationsFolder) {
  const sqlite = new Database(join(dataDir, "library.db"));
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle({ client: sqlite, schema });
  // A migration that rebuilds a table drops the old one, which foreign keys
  // block as soon as other rows refer to it. SQLite ignores this pragma inside
  // the migrator's transaction, so it is switched off around the whole run.
  sqlite.pragma("foreign_keys = OFF");
  migrate(db, { migrationsFolder: migrations });
  if ((sqlite.pragma("foreign_key_check") as unknown[]).length > 0) {
    throw new Error("A migration left rows that break a foreign key");
  }
  sqlite.pragma("foreign_keys = ON");
  return db;
}

export type Db = ReturnType<typeof openDatabase>;
