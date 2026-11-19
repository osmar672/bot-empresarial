import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { createGzip } from "node:zlib";
import { createCipheriv } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { pool, run } from "../backend/src/db/pool.js";
import {
  uploadExternalBackup,
  verifyExternalBackup,
} from "../backend/src/services/externalBackup.service.js";
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "luma-offsite-test-")),
  filename = "luma-test-" + randomUUID() + ".sql.gz.enc",
  largeFilename = "luma-large-" + randomUUID() + ".sql.gz.enc",
  parts = new Map(),
  objects = new Map();
let tamper = false;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost"),
    key = url.pathname;
  if (req.method === "POST" && url.searchParams.has("uploads")) {
    res.writeHead(200, { "Content-Type": "application/xml" });
    res.end(
      "<InitiateMultipartUploadResult><Bucket>private-test</Bucket><Key>" +
        key +
        "</Key><UploadId>local-test</UploadId></InitiateMultipartUploadResult>",
    );
    return;
  }
  if (req.method === "POST" && url.searchParams.has("uploadId")) {
    for await (const _chunk of req) {
    }
    objects.set(
      key,
      Buffer.concat(
        [...parts.entries()].sort((a, b) => a[0] - b[0]).map((p) => p[1]),
      ),
    );
    res.writeHead(200, { "Content-Type": "application/xml" });
    res.end(
      "<CompleteMultipartUploadResult><Location>http://localhost</Location><Bucket>private-test</Bucket><Key>" +
        key +
        '</Key><ETag>"test"</ETag></CompleteMultipartUploadResult>',
    );
    return;
  }
  if (req.method === "PUT") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (url.searchParams.has("partNumber"))
      parts.set(
        Number(url.searchParams.get("partNumber")),
        Buffer.concat(chunks),
      );
    else objects.set(key, Buffer.concat(chunks));
    res.writeHead(200, { ETag: '"test"' });
    res.end();
  } else if (req.method === "GET" && objects.has(key)) {
    const b = Buffer.from(objects.get(key));
    if (tamper) b[35] ^= 1;
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": b.length,
    });
    res.end(b);
  } else {
    res.writeHead(404);
    res.end();
  }
});
server.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
try {
  delete process.env.AWS_PROFILE;
  delete process.env.AWS_DEFAULT_PROFILE;
  Object.assign(process.env, {
    BACKUP_EXTERNAL_PROVIDER: "s3",
    BACKUP_EXTERNAL_BUCKET: "private-test",
    BACKUP_EXTERNAL_PREFIX: "luma",
    BACKUP_S3_ENDPOINT: "http://127.0.0.1:" + server.address().port,
    BACKUP_S3_REGION: "us-east-1",
    BACKUP_S3_PATH_STYLE: "true",
    AWS_ACCESS_KEY_ID: "test-local",
    AWS_SECRET_ACCESS_KEY: "test-local-secret",
    BACKUP_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  });
  const file = path.join(dir, filename),
    iv = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, "hex"),
      iv,
    );
  await fs.writeFile(
    file,
    Buffer.concat([Buffer.from("LUMA_BACKUP_V1\n"), iv]),
    { mode: 0o600 },
  );
  await pipeline(
    Readable.from(["CREATE TABLE IF NOT EXISTS `pb_test` (id INT);\n"]),
    createGzip(),
    cipher,
    createWriteStream(file, { flags: "a" }),
  );
  await fs.appendFile(file, cipher.getAuthTag());
  assert.equal((await uploadExternalBackup(file)).state, "verified");
  assert.equal(objects.size, 1);
  assert.deepEqual([...objects.values()][0], await fs.readFile(file));
  const downloaded = path.join(dir, "recovered.enc");
  await verifyExternalBackup({ filename, output: downloaded });
  assert.deepEqual(await fs.readFile(downloaded), await fs.readFile(file));
  await assert.rejects(() =>
    verifyExternalBackup({ filename, output: downloaded }),
  );
  const large = path.join(dir, largeFilename),
    iv2 = randomBytes(12),
    c2 = createCipheriv(
      "aes-256-gcm",
      Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, "hex"),
      iv2,
    );
  await fs.writeFile(
    large,
    Buffer.concat([Buffer.from("LUMA_BACKUP_V1\n"), iv2]),
    { mode: 0o600 },
  );
  await pipeline(
    Readable.from([randomBytes(6 * 1024 * 1024).toString("base64")]),
    createGzip(),
    c2,
    createWriteStream(large, { flags: "a" }),
  );
  await fs.appendFile(large, c2.getAuthTag());
  assert.equal((await uploadExternalBackup(large)).state, "verified");
  assert.ok(parts.size >= 2);
  assert.deepEqual(
    objects.get("/private-test/luma/" + largeFilename),
    await fs.readFile(large),
  );
  process.env.BACKUP_EXTERNAL_PREFIX = "invalid..prefix";
  assert.equal((await uploadExternalBackup(file)).state, "failed");
  process.env.BACKUP_EXTERNAL_PREFIX = "luma";
  tamper = true;
  await assert.rejects(() => verifyExternalBackup({ filename }));
  await assert.rejects(() =>
    verifyExternalBackup({ filename: "../bad.sql.gz.enc" }),
  );
  console.log(
    "PASS: S3 adapter upload/download to local test server, exact encrypted bytes preserved, GCM verification and tampering rejection. Real external storage not configured or contacted.",
  );
} finally {
  await run("DELETE FROM pb_external_backup_checks WHERE filename IN (?,?)", [
    filename,
    largeFilename,
  ]);
  await fs.rm(dir, { recursive: true, force: true });
  await new Promise((r) => server.close(r));
  await pool.end();
}
