import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import mysql from "mysql2/promise";
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "luma-restore-test-")),
  name = "luma-restore-test-" + randomUUID(),
  password = randomBytes(24).toString("hex");
let root, pool;
try {
  const vars = path.join(dir, "docker.env");
  await fs.writeFile(vars, "MYSQL_ROOT_PASSWORD=" + password + "\n", {
    mode: 0o600,
  });
  execFileSync(
    "docker",
    [
      "run",
      "--detach",
      "--name",
      name,
      "--env-file",
      vars,
      "-p",
      "127.0.0.1::3306",
      "mysql:8.4",
    ],
    { stdio: "pipe" },
  );
  const inspection = JSON.parse(
      execFileSync("docker", ["inspect", name], { encoding: "utf8" }),
    )[0],
    port = Number(inspection.NetworkSettings.Ports["3306/tcp"][0].HostPort);
  for (let i = 0; i < 60; i++) {
    try {
      root = await mysql.createConnection({
        host: "127.0.0.1",
        port,
        user: "root",
        password,
      });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  assert.ok(root, "Disposable MySQL must be ready");
  await root.query("CREATE DATABASE luma_fixture");
  await root.query("CREATE DATABASE luma_restore");
  await root.query("CREATE DATABASE luma_corrupt");
  await root.query("USE luma_fixture");
  execFileSync(process.execPath, ["backend/src/db/migrate.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      MYSQL_HOST: "127.0.0.1",
      MYSQL_PORT: String(port),
      MYSQL_USER: "root",
      MYSQL_PASSWORD: password,
      MYSQL_DATABASE: "luma_fixture",
    },
    stdio: "pipe",
  });
  await root.query(
    "CREATE TABLE pb_restore_fixture(id INT PRIMARY KEY,content TEXT,meta JSON,image BLOB,created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),generated_value INT GENERATED ALWAYS AS (id+1) STORED)",
  );
  const text =
    "Vacaciones; 'comillas', `acentos`, barra \\ y saltos\nde línea: miércoles, atención.";
  await root.execute(
    "INSERT INTO pb_restore_fixture(id,content,meta,image) VALUES (?,?,?,?)",
    [
      7,
      text,
      JSON.stringify({ a: "ley; empresa", b: [1, 2] }),
      Buffer.from([0, 1, 255, 13, 10]),
    ],
  );
  Object.assign(process.env, {
    MYSQL_HOST: "127.0.0.1",
    MYSQL_PORT: String(port),
    MYSQL_USER: "root",
    MYSQL_PASSWORD: password,
    MYSQL_DATABASE: "luma_fixture",
    BACKUP_DIRECTORY: dir,
    BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  });
  const backups = await import("../backend/src/services/backup.service.js"),
    { restoreDatabaseBackup } = await import(
      "../backend/src/services/restore.service.js"
    );
  pool = (await import("../backend/src/db/pool.js")).pool;
  const backup = await backups.createDatabaseBackup(),
    file = path.join(dir, backup.filename),
    plan = await restoreDatabaseBackup(file, { database: "luma_restore" });
  assert.equal(plan.applied, false);
  assert.ok(plan.tables > 20);
  const result = await restoreDatabaseBackup(file, {
    database: "luma_restore",
    apply: true,
  });
  assert.equal(result.applied, true);
  assert.ok(result.rows > 100);
  const [[row]] = await root.query(
    "SELECT * FROM luma_restore.pb_restore_fixture",
  );
  assert.equal(row.content, text);
  assert.deepEqual(row.meta, { a: "ley; empresa", b: [1, 2] });
  assert.deepEqual(row.image, Buffer.from([0, 1, 255, 13, 10]));
  assert.equal(row.generated_value, 8);
  assert.ok(row.created_at);
  await assert.rejects(
    () =>
      restoreDatabaseBackup(file, { database: "luma_fixture", apply: true }),
    /base activa/,
  );
  await assert.rejects(
    () =>
      restoreDatabaseBackup(file, { database: "luma_restore", apply: true }),
    /completamente vacía/,
  );
  const corrupt = path.join(dir, "corrupt.enc"),
    bytes = await fs.readFile(file);
  bytes[45] ^= 1;
  await fs.writeFile(corrupt, bytes);
  await assert.rejects(() =>
    restoreDatabaseBackup(corrupt, { database: "luma_corrupt", apply: true }),
  );
  const [tables] = await root.query("SHOW TABLES FROM luma_corrupt");
  assert.equal(tables.length, 0);
  console.log(
    "PASS: actual encrypted backup and restore in isolated MySQL; text/JSON/binary/dates/generated columns preserved; active/nonempty targets and tampered backup rejected.",
  );
} finally {
  await pool?.end();
  await root?.end();
  try {
    execFileSync("docker", ["rm", "--force", name], { stdio: "pipe" });
  } catch {}
  await fs.rm(dir, { recursive: true, force: true });
}
