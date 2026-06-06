// One-off: apply prisma/init.sql to Neon over HTTPS (443), bypassing blocked 5432.
// On a normal machine just use `npm run db:push` instead — this is the sandbox workaround.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const conn = env.DIRECT_URL || env.DATABASE_URL;
const sql = neon(conn);

const raw = readFileSync(new URL("../prisma/init.sql", import.meta.url), "utf8");
const statements = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`Applying ${statements.length} DDL statements to Neon over HTTPS…`);
let ok = 0;
for (const stmt of statements) {
  try {
    await sql.query(stmt);
    ok++;
  } catch (e) {
    console.error(`FAIL @${ok + 1}: ${stmt.slice(0, 70)}…\n  -> ${e.message}`);
    process.exit(1);
  }
}

const tables = await sql.query(
  "select table_name from information_schema.tables where table_schema='public' order by table_name"
);
console.log(`\n✅ ${ok}/${statements.length} statements applied.`);
console.log(`Tables now in public:`, tables.map((t) => t.table_name).join(", "));
