/**
 * Minimal migration runner.
 *
 *   npm run db:migrate
 *
 * Applies every .sql file in supabase/migrations in lexical order, inside a
 * transaction, and records applied files in _pocket_migrations.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");

// Load .env without adding a dependency (Node 20.6+).
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(root, file));
  } catch {
    /* file not present */
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const dir = path.join(root, "supabase/migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

await sql`
  create table if not exists _pocket_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )
`;

for (const file of files) {
  const [existing] = await sql`select 1 from _pocket_migrations where name = ${file}`;
  if (existing) {
    console.log(`skip  ${file}`);
    continue;
  }

  const body = await readFile(path.join(dir, file), "utf8");
  const statements = body
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  process.stdout.write(`apply ${file} ... `);
  try {
    await sql.begin(async (tx) => {
      for (const statement of statements) {
        await tx.unsafe(statement);
      }
    });
    await sql`insert into _pocket_migrations (name) values (${file})`;
    console.log("ok");
  } catch (error) {
    console.log("failed");
    console.error(error);
    await sql.end({ timeout: 5 });
    process.exit(1);
  }
}

await sql.end({ timeout: 5 });
console.log("\nDatabase is up to date.");
