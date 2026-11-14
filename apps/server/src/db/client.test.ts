import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { migrationsFolder } from "../config.ts";
import { openDatabase } from "./client.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "book-library-migrate-"));
  dirs.push(dir);
  return dir;
}

/** A copy of the migrations folder that stops after the first migration. */
function firstMigrationOnly() {
  const folder = tempDir();
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8"),
  );
  const [first] = journal.entries;
  mkdirSync(join(folder, "meta"));
  writeFileSync(
    join(folder, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries: [first] }),
  );
  cpSync(
    join(migrationsFolder, `${first.tag}.sql`),
    join(folder, `${first.tag}.sql`),
  );
  return folder;
}

it("migrates a database that already holds data", () => {
  const dataDir = tempDir();
  const old = openDatabase(dataDir, firstMigrationOnly()).$client;
  old.exec(`
    insert into user (id, name, email, email_verified, created_at, updated_at)
      values ('u1', 'Mara', 'mara@example.net', 0, 0, 0);
    insert into book (id, title, authors, created_at, created_by, updated_at)
      values ('b1', 'Dune', '["Frank Herbert"]', 0, 'u1', 0);
    insert into copy (id, book_id, created_at, created_by)
      values ('c1', 'b1', 0, 'u1');
    insert into contact (id, name) values ('p1', 'Lena');
    insert into loan (id, direction, book_id, copy_id, contact_id, started_on)
      values ('l1', 'lent', 'b1', 'c1', 'p1', '2026-01-01');
    insert into reading (id, user_id, book_id, status, created_at, updated_at)
      values ('r1', 'u1', 'b1', 'read', 0, 0);
  `);
  old.close();

  const sqlite = openDatabase(dataDir).$client;

  expect(sqlite.prepare("select title from book").all()).toEqual([
    { title: "Dune" },
  ]);
  expect(sqlite.prepare("select copy_id from loan").all()).toEqual([
    { copy_id: "c1" },
  ]);
  expect(sqlite.prepare("select count(*) as n from copy").get()).toEqual({
    n: 1,
  });
  expect(sqlite.prepare("select count(*) as n from reading").get()).toEqual({
    n: 1,
  });
  expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  sqlite.close();
});
