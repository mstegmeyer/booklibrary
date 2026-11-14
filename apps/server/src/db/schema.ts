import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

// Better Auth tables (core plus the admin plugin's fields). Better Auth works
// with Date objects, so these use timestamp_ms; the stored value is still
// integer milliseconds like everywhere else.

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  role: text("role"),
  banned: integer("banned", { mode: "boolean" }).default(false),
  banReason: text("ban_reason"),
  banExpires: integer("ban_expires", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// Domain tables: text UUID ids, integer millisecond timestamps, calendar dates
// as YYYY-MM-DD text.

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const timestamp = (name: string) =>
  integer(name)
    .notNull()
    .$defaultFn(() => Date.now());

export const bookFormats = ["paperback", "hardcover", "other"] as const;
export const loanDirections = ["lent", "borrowed"] as const;
export const readingStatuses = [
  "want",
  "reading",
  "read",
  "abandoned",
] as const;

export const book = sqliteTable(
  "book",
  {
    id: id(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    authors: text("authors", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    // "Eco, Umberto": the first author as the Library sorts by author.
    sortKey: text("sort_key").notNull().default(""),
    description: text("description"),
    pageCount: integer("page_count"),
    publishedYear: integer("published_year"),
    language: text("language"),
    coverPath: text("cover_path"),
    metadataSource: text("metadata_source"),
    createdAt: timestamp("created_at"),
    // Removing a user keeps the books and copies they added.
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => Date.now()),
  },
  (t) => [
    index("book_title_idx").on(t.title),
    index("book_created_at_idx").on(t.createdAt),
  ],
);

export const bookIdentifier = sqliteTable(
  "book_identifier",
  {
    id: id(),
    bookId: text("book_id")
      .notNull()
      .references(() => book.id, { onDelete: "cascade" }),
    isbn13: text("isbn13").notNull().unique(),
    label: text("label"),
  },
  (t) => [index("book_identifier_book_id_idx").on(t.bookId)],
);

export const location = sqliteTable(
  "location",
  {
    id: id(),
    parentId: text("parent_id").references((): AnySQLiteColumn => location.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("location_parent_id_idx").on(t.parentId, t.position)],
);

export const copy = sqliteTable(
  "copy",
  {
    id: id(),
    bookId: text("book_id")
      .notNull()
      .references(() => book.id, { onDelete: "restrict" }),
    locationId: text("location_id").references(() => location.id, {
      onDelete: "restrict",
    }),
    format: text("format", { enum: bookFormats }),
    note: text("note"),
    createdAt: timestamp("created_at"),
    // Removing a user keeps the books and copies they added.
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("copy_book_id_idx").on(t.bookId),
    index("copy_location_id_idx").on(t.locationId),
    check(
      "copy_format_check",
      sql`${t.format} in ('paperback', 'hardcover', 'other')`,
    ),
  ],
);

export const contact = sqliteTable(
  "contact",
  {
    id: id(),
    name: text("name").notNull(),
  },
  (t) => [index("contact_name_idx").on(t.name)],
);

export const loan = sqliteTable(
  "loan",
  {
    id: id(),
    direction: text("direction", { enum: loanDirections }).notNull(),
    bookId: text("book_id")
      .notNull()
      .references(() => book.id, { onDelete: "restrict" }),
    // A lent loan stays as history after its copy is removed.
    copyId: text("copy_id").references(() => copy.id, {
      onDelete: "set null",
    }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "restrict" }),
    startedOn: text("started_on").notNull(),
    endedOn: text("ended_on"),
    note: text("note"),
  },
  (t) => [
    index("loan_book_id_idx").on(t.bookId),
    index("loan_copy_id_idx").on(t.copyId),
    index("loan_contact_id_idx").on(t.contactId),
    index("loan_ended_on_idx").on(t.endedOn),
    check(
      "loan_direction_check",
      sql`${t.direction} = 'lent' or ${t.copyId} is null`,
    ),
  ],
);

export const reading = sqliteTable(
  "reading",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    bookId: text("book_id")
      .notNull()
      .references(() => book.id, { onDelete: "restrict" }),
    status: text("status", { enum: readingStatuses }).notNull(),
    startedOn: text("started_on"),
    endedOn: text("ended_on"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => Date.now()),
  },
  (t) => [
    index("reading_user_book_idx").on(t.userId, t.bookId, t.createdAt),
    index("reading_book_id_idx").on(t.bookId),
    check(
      "reading_status_check",
      sql`${t.status} in ('want', 'reading', 'read', 'abandoned')`,
    ),
  ],
);

export const readingProgress = sqliteTable(
  "reading_progress",
  {
    id: id(),
    readingId: text("reading_id")
      .notNull()
      .references(() => reading.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    page: integer("page").notNull(),
  },
  (t) => [index("reading_progress_reading_id_idx").on(t.readingId, t.date)],
);
