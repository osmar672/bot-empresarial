import fs from "node:fs/promises";
import { createWriteStream, createReadStream } from "node:fs";
import path from "node:path";
import {
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip, createGunzip } from "node:zlib";
import mysql from "mysql2/promise";
import { env } from "../config/env.js";
import { run, one } from "../db/pool.js";
import cron from "node-cron";
const MAGIC = Buffer.from("LUMA_BACKUP_V1\n");
export function backupConfiguration() {
  return {
    enabled: process.env.BACKUP_ENABLED === "true",
    keyConfigured: /^[a-f0-9]{64}$/i.test(
      process.env.BACKUP_ENCRYPTION_KEY || "",
    ),
    schedule: process.env.BACKUP_CRON || "15 3 * * *",
    scheduleValid: cron.validate(process.env.BACKUP_CRON || "15 3 * * *"),
    retention: Math.max(
      1,
      Math.min(90, Number(process.env.BACKUP_RETENTION_DAYS) || 14),
    ),
  };
}
async function* dumpDatabase(cx) {
  yield "SET FOREIGN_KEY_CHECKS=0;\n";
  const [tables] = await cx.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' AND LEFT(TABLE_NAME,3)='pb_' ORDER BY TABLE_NAME",
  );
  for (const { TABLE_NAME: table } of tables) {
    if (!/^pb_[a-zA-Z0-9_]+$/.test(table)) throw new Error("UNSAFE_TABLE_NAME");
    const [definition] = await cx.query("SHOW CREATE TABLE `" + table + "`");
    yield definition[0]["Create Table"].replace(
      "CREATE TABLE ",
      "CREATE TABLE IF NOT EXISTS ",
    ) + ";\n";
    const [keys] = await cx.query(
      "SHOW INDEX FROM `" + table + "` WHERE Key_name='PRIMARY'",
    );
    const order = keys
      .sort((a, b) => a.Seq_in_index - b.Seq_in_index)
      .map((k) => "`" + k.Column_name.replace(/`/g, "``") + "`")
      .join(",");
    const [fields]=await cx.query('SHOW COLUMNS FROM `'+table+'`');
    const writable=fields.filter(field=>!/(?:VIRTUAL|STORED) GENERATED/.test(String(field.Extra))).map(field=>'`'+field.Field.replace(/`/g,'``')+'`').join(',');
    let offset = 0;
    while (true) {
      const [rows] = await cx.query(
        "SELECT "+writable+" FROM `" +
          table +
          "`" +
          (order ? " ORDER BY " + order : "") +
          " LIMIT 250 OFFSET " +
          offset,
      );
      if (!rows.length) break;
      const columns = Object.keys(rows[0]);
      for (const row of rows) {
        const values = columns.map((c) => {
          const value = row[c];
          return cx.escape(
            value && typeof value === "object" && !Buffer.isBuffer(value)
              ? JSON.stringify(value)
              : value,
          );
        });
        yield "INSERT INTO `" +
          table +
          "` (" +
          columns.map((c) => "`" + c.replace(/`/g, "``") + "`").join(",") +
          ") VALUES (" +
          values.join(",") +
          ");\n";
      }
      offset += rows.length;
    }
  }
  yield "SET FOREIGN_KEY_CHECKS=1;\n";
}
export async function createDatabaseBackup() {
  const config = backupConfiguration();
  if (!config.keyConfigured)
    throw new Error(
      "Configura BACKUP_ENCRYPTION_KEY con 64 caracteres hexadecimales",
    );
  const directory = path.resolve(
      env.backendDir,
      process.env.BACKUP_DIRECTORY || "backups",
    ),
    id = randomUUID(),
    filename =
      "luma-" +
      new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      id +
      ".sql.gz.enc",
    file = path.join(directory, filename),
    partial = file + ".partial";
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const cx = await mysql.createConnection({ ...env.db, dateStrings: true });
  let locked = false,partialCreated=false;
  try {
    const [[lock]] = await cx.query(
      "SELECT GET_LOCK(CONCAT(DATABASE(),':backup-worker'),0) AS acquired",
    );
    if (lock.acquired !== 1) throw new Error("BACKUP_ALREADY_RUNNING");
    locked = true;
    await run("INSERT INTO pb_backup_runs(id,state) VALUES (?,'running')", [
      id,
    ]);
    await cx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await cx.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
    const iv = randomBytes(12),
      cipher = createCipheriv(
        "aes-256-gcm",
        Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, "hex"),
        iv,
      );
    await fs.writeFile(partial, Buffer.concat([MAGIC, iv]), {
      mode: 0o600,
      flag: "wx",
    });
    partialCreated=true;
    await pipeline(
      Readable.from(dumpDatabase(cx)),
      createGzip(),
      cipher,
      createWriteStream(partial, { flags: "a", mode: 0o600 }),
    );
    await fs.appendFile(partial, cipher.getAuthTag());
    await cx.commit();
    await fs.rename(partial, file);
    await run(
      "UPDATE pb_backup_runs SET state='done',filename=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
      [filename, id],
    );
    for (const entry of await fs.readdir(directory)) {
      if (!/^luma-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.sql\.gz\.enc$/.test(entry)) continue;
      const target = path.join(directory, entry),
        stat = await fs.stat(target);
      if (Date.now() - stat.mtimeMs > config.retention * 86400000)
        await fs.unlink(target);
    }
    return { filename };
  } catch (error) {
    await cx.rollback().catch(() => {});
    if(partialCreated)await fs.unlink(partial).catch(() => {});
    await run(
      "UPDATE pb_backup_runs SET state='failed',error_code=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
      [
        /^[A-Z_0-9]+$/.test(error.code || "") ? error.code : "BACKUP_FAILED",
        id,
      ],
    ).catch(() => {});
    throw error;
  } finally {
    if (locked)
      await cx
        .query("SELECT RELEASE_LOCK(CONCAT(DATABASE(),':backup-worker'))")
        .catch(() => {});
    await cx.end();
  }
}
export async function readDatabaseBackup(file, output = null) {
  if (!backupConfiguration().keyConfigured)
    throw new Error("Falta BACKUP_ENCRYPTION_KEY");
  const handle = await fs.open(file, "r");
  let head, tag, size;
  try {
    size = (await handle.stat()).size;
    if (size < MAGIC.length + 28)
      throw new Error("Archivo de respaldo incompleto");
    head = Buffer.alloc(MAGIC.length + 12);
    tag = Buffer.alloc(16);
    await handle.read(head, 0, head.length, 0);
    await handle.read(tag, 0, 16, size - 16);
  } finally {
    await handle.close();
  }
  if (!head.subarray(0, MAGIC.length).equals(MAGIC))
    throw new Error("Formato de respaldo inválido");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, "hex"),
    head.subarray(MAGIC.length),
  );
  decipher.setAuthTag(tag);
  let bytes = 0;
  const outputPartial=output?output+"."+randomUUID()+".partial":null;
  const sink = output
    ? createWriteStream(outputPartial, { flags: "wx", mode: 0o600 })
    : new Writable({
        write(chunk, _encoding, callback) {
          bytes += chunk.length;
          callback();
        },
      });
  try {
    await pipeline(
      createReadStream(file, { start: head.length, end: size - 17 }),
      decipher,
      createGunzip(),
      sink,
    );
    if (output) {
      try {
        await fs.access(output);
        throw new Error("El archivo de salida ya existe");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      await fs.link(outputPartial, output);
      await fs.unlink(outputPartial);
    }
    return { verified: true, bytes };
  } catch (error) {
    if (outputPartial) await fs.unlink(outputPartial).catch(() => {});
    throw error;
  }
}
export function startBackupJob() {
  const config = backupConfiguration();
  if (!config.enabled) return () => {};
  if (!config.keyConfigured || !cron.validate(config.schedule)) {
    console.error(
      "Respaldos desactivados: revisa BACKUP_ENCRYPTION_KEY y BACKUP_CRON.",
    );
    return () => {};
  }
  const task = cron.schedule(
    config.schedule,
    () =>
      createDatabaseBackup().catch(() =>
        console.error(
          "Falló el respaldo automático; revisa el almacenamiento y permisos.",
        ),
      ),
    { timezone: "America/Costa_Rica", noOverlap: true },
  );
  return () => task.stop();
}
