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

/** A copy of the migrations folder that stops after the `tag` migration. */
function migrationsUpTo(tag: string) {
  const folder = tempDir();
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8"),
  );
  const entries: { tag: string }[] = journal.entries.slice(
    0,
    journal.entries.findIndex((entry: { tag: string }) => entry.tag === tag) +
      1,
  );
  mkdirSync(join(folder, "meta"));
  writeFileSync(
    join(folder, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries }),
  );
  for (const entry of entries) {
    cpSync(
      join(migrationsFolder, `${entry.tag}.sql`),
      join(folder, `${entry.tag}.sql`),
    );
  }
  return folder;
}

it("migrates a database that already holds data", () => {
  const dataDir = tempDir();
  const old = openDatabase(dataDir, migrationsUpTo("0000_init")).$client;
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
  sqlite.exec(`
    insert into book_file (id, book_id, format, path, size, sha256, upload_sha256, created_at)
      values ('f1', 'b1', 'epub', 'Herbert, Frank/Dune.epub', 1, 'a', 'a', 0);
  `);
  expect(sqlite.prepare("select is_protected from book_file").all()).toEqual([
    { is_protected: 0 },
  ]);
  expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  sqlite.close();
});

it("adds the built-in genres to a library that already has books", () => {
  const dataDir = tempDir();
  const old = openDatabase(
    dataDir,
    migrationsUpTo("0003_stiff_the_stranger"),
  ).$client;
  old.exec(`
    insert into book (id, title, authors, sort_key, created_at, updated_at)
      values ('b1', 'Dune', '["Frank Herbert"]', 'Herbert, Frank', 0, 0);
    insert into copy (id, book_id, created_at) values ('c1', 'b1', 0);
  `);
  old.close();

  const sqlite = openDatabase(dataDir).$client;

  expect(sqlite.prepare("select title, genre_id from book").all()).toEqual([
    { title: "Dune", genre_id: null },
  ]);
  const genres = sqlite
    .prepare("select key, name from genre order by key")
    .all() as { key: string; name: string | null }[];
  expect(genres).toHaveLength(24);
  expect(genres.every((genre) => genre.name === null)).toBe(true);
  expect(genres.map((genre) => genre.key)).toContain("travel-guide");
  sqlite.close();
});
