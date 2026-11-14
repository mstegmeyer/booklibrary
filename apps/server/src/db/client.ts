import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { migrationsFolder } from "../config.ts";
import * as schema from "./schema.ts";

export function openDatabase(dataDir: string) {
  const sqlite = new Database(join(dataDir, "library.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle({ client: sqlite, schema });
  migrate(db, { migrationsFolder });
  return db;
}

export type Db = ReturnType<typeof openDatabase>;
