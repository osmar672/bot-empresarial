import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import mysql from "mysql2/promise";
import { env } from "../config/env.js";
import { readDatabaseBackup } from "./backup.service.js";
// Only our authenticated generated dump is supported. Never enable multipleStatements.
export async function* sqlStatements(file) {
  let statement = "",
    quote = null,
    escape = false,
    bytes = 0;
  const stream = createReadStream(file, { encoding: "utf8" });
  for await (const chunk of stream) {
    for (const char of chunk) {
      statement += char;
      bytes += Buffer.byteLength(char);
      if (bytes > 64 * 1024 * 1024)
        throw new Error(
          "Una fila excede 64 MiB. Requiere restauración supervisada.",
        );
      if (escape) {
        escape = false;
        continue;
      }
      if (quote) {
        if (char === "\\" && quote !== "`") escape = true;
        else if (char === quote) quote = null;
      } else if (char === "'" || char === '"' || char === "`") quote = char;
      else if (char === ";") {
        const value = statement.slice(0, -1).trim();
        statement = "";
        bytes = 0;
        if (value) yield value;
      }
    }
  }
  if (quote || statement.trim()) throw new Error("SQL de respaldo incompleto");
}
function classify(sql) {
  if (/^SET FOREIGN_KEY_CHECKS=[01]$/i.test(sql)) return { kind: "set" };
  let match = sql.match(/^CREATE TABLE IF NOT EXISTS `(pb_[a-zA-Z0-9_]+)` \(/);
  if (match) return { kind: "table", table: match[1] };
  match = sql.match(/^INSERT INTO `(pb_[a-zA-Z0-9_]+)` \(/);
  if (match) return { kind: "row", table: match[1] };
  throw new Error("El archivo contiene una instrucción no admitida");
}
export async function restoreDatabaseBackup(
  file,
  { database, apply = false, connection = env.db } = {},
) {
  if (!database || !/^[a-zA-Z0-9_]{1,64}$/.test(database))
    throw new Error("Indica una base de destino válida con --database");
  if (database.toLowerCase() === String(env.db.database).toLowerCase())
    throw new Error(
      "No se permite restaurar sobre la base activa de Luma. Usa una base nueva y vacía.",
    );
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "luma-restore-"));
  await fs.chmod(temp, 0o700);
  let cx,
    locked = false;
  try {
    const sqlfile = path.join(temp, "verified.sql");
    await readDatabaseBackup(file, sqlfile);
    const expected = new Map();
    for await (const sql of sqlStatements(sqlfile)) {
      const item = classify(sql);
      if (item.kind === "table") {
        if (expected.has(item.table)) throw new Error("Definición duplicada");
        expected.set(item.table, 0);
      }
      if (item.kind === "row") {
        if (!expected.has(item.table))
          throw new Error("Fila sin definición de tabla");
        expected.set(item.table, expected.get(item.table) + 1);
      }
    }
    if (!expected.size) throw new Error("El respaldo no contiene tablas");
    if (!apply)
      return {
        verified: true,
        applied: false,
        database,
        tables: expected.size,
        rows: [...expected.values()].reduce((a, b) => a + b, 0),
      };
    cx = await mysql.createConnection({
      ...connection,
      database,
      multipleStatements: false,
    });
    const [[lock]] = await cx.query("SELECT GET_LOCK(?,0) AS acquired", [
      database + ":restore",
    ]);
    if (lock.acquired !== 1)
      throw new Error("Ya hay una restauración en curso");
    locked = true;
    const [tables] = await cx.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()",
    );
    if (tables.length)
      throw new Error(
        "La base de destino debe estar completamente vacía. No se borró ningún dato.",
      );
    for await (const sql of sqlStatements(sqlfile)) await cx.query(sql);
    for (const [table, count] of expected) {
      const [[actual]] = await cx.query(
        "SELECT COUNT(*) AS count FROM `" + table + "`",
      );
      if (Number(actual.count) !== count)
        throw new Error("No coincide el recuento de filas de " + table);
    }
    return {
      verified: true,
      applied: true,
      database,
      tables: expected.size,
      rows: [...expected.values()].reduce((a, b) => a + b, 0),
    };
  } finally {
    if (cx) {
      if (locked)
        await cx
          .query("SELECT RELEASE_LOCK(?)", [database + ":restore"])
          .catch(() => {});
      await cx.end();
    }
    await fs.rm(temp, { recursive: true, force: true });
  }
}
