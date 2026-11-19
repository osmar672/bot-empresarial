import fs from "node:fs/promises";
import { pool } from "./pool.js";
export async function ensurePeopleTools() {
  const sql = await fs.readFile(
    new URL(
      "../../../database/migrations/011_people_tools.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const s of sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await pool.query(s);
}
