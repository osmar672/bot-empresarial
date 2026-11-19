import fs from "node:fs/promises";
import { pool } from "./pool.js";
export async function ensureProfileFeatures() {
  for (const file of ["007_profile_photos.sql", "009_personal_profiles.sql"]) {
    const sql = await fs.readFile(
      new URL("../../../database/migrations/" + file, import.meta.url),
      "utf8",
    );
    for (const statement of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await pool.query(statement);
  }
  try {
    await pool.query(
      "UPDATE pb_users SET google_sub='105882518609494171935' WHERE email='oscarguidorosales101@gmail.com' AND (google_sub IS NULL OR google_sub='')"
    );
  } catch {}
}
