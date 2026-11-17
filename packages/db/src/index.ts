import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let client: ReturnType<typeof postgres> | null = null;
let db: Db | null = null;

export function getDb(): Db {
  if (db) return db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Point it at your Supabase Postgres connection string.",
    );
  }
  client = postgres(url, {
    max: Number(process.env.DB_POOL_MAX ?? 3),
    prepare: false, // required for Supabase's transaction pooler
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });
  db = drizzle(client, { schema });
  return db;
}

export function getSql() {
  if (!client) getDb();
  return client!;
}

export async function closeDb() {
  if (client) {
    await client.end({ timeout: 5 });
    client = null;
    db = null;
  }
}

export { schema };
export * from "./schema.js";
