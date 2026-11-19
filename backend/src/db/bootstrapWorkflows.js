import fs from "node:fs/promises";
import { pool } from "./pool.js";
export async function ensureWorkflows() {
  const sql = await fs.readFile(
    new URL(
      "../../../database/migrations/012_workflows_trust.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const statement of sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await pool.query(statement);
}
