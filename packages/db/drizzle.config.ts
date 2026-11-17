import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "../../supabase/migrations",
  strict: false,
  verbose: true,
});
