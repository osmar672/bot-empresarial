import fs from "node:fs/promises";
import { constants } from "node:fs";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { google } from "googleapis";
import cron from "node-cron";
import { env } from "../config/env.js";
import { run, one } from "../db/pool.js";
import { readDatabaseBackup } from "./backup.service.js";
export function externalBackupConfiguration() {
  const provider = process.env.BACKUP_EXTERNAL_PROVIDER || "none",
    bucket = process.env.BACKUP_EXTERNAL_BUCKET || "";
  return {
    provider,
    configured: ["s3", "gcs"].includes(provider) && !!bucket,
    verifySchedule: process.env.BACKUP_EXTERNAL_VERIFY_CRON || "30 4 * * 0",
  };
}
function objectName(filename) {
  if (!/^luma-[a-zA-Z0-9.-]+\.sql\.gz\.enc$/.test(filename))
    throw new Error("INVALID_BACKUP_NAME");
  const prefix = (process.env.BACKUP_EXTERNAL_PREFIX || "luma").replace(
    /^\/+|\/+$/g,
    "",
  );
  if (!/^[a-zA-Z0-9_/-]*$/.test(prefix) || prefix.split("/").includes(".."))
    throw new Error("INVALID_BACKUP_PREFIX");
  return (prefix ? prefix + "/" : "") + filename;
}
function s3() {
  const endpoint = process.env.BACKUP_S3_ENDPOINT;
  if (endpoint) {
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" &&
      !(
        env.nodeEnv !== "production" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      throw new Error("S3_ENDPOINT_REQUIRES_HTTPS");
  }
  return new S3Client({
    region:
      process.env.BACKUP_S3_REGION || process.env.AWS_REGION || "us-east-1",
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: process.env.BACKUP_S3_PATH_STYLE === "true",
  });
}
function gcs() {
  return google.storage({
    version: "v1",
    auth: new google.auth.GoogleAuth({
      keyFile: path.resolve(env.backendDir, env.googleCredentials),
      scopes: ["https://www.googleapis.com/auth/devstorage.read_write"],
    }),
  });
}
async function sha(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function download(provider, key, target) {
  const bucket = process.env.BACKUP_EXTERNAL_BUCKET;
  if (provider === "s3") {
    const client = s3();
    try {
      const result = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      await pipeline(
        result.Body,
        createWriteStream(target, { flags: "wx", mode: 0o600 }),
      );
    } finally {
      client.destroy();
    }
  } else if (provider === "gcs") {
    const result = await gcs().objects.get(
      { bucket, object: key, alt: "media" },
      { responseType: "stream" },
    );
    await pipeline(
      result.data,
      createWriteStream(target, { flags: "wx", mode: 0o600 }),
    );
  } else throw new Error("EXTERNAL_PROVIDER_NOT_CONFIGURED");
}
export async function verifyExternalBackup({
  filename,
  provider = externalBackupConfiguration().provider,
  key = objectName(filename),
  expectedHash = null,
  output = null,
} = {}) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "luma-remote-check-"));
  await fs.chmod(temp, 0o700);
  try {
    const file = path.join(temp, "download.enc");
    await download(provider, key, file);
    if (expectedHash && (await sha(file)) !== expectedHash)
      throw new Error("REMOTE_CHECKSUM_MISMATCH");
    await readDatabaseBackup(file);
    if (output)
      await fs.copyFile(file, path.resolve(output), constants.COPYFILE_EXCL);
    await run(
      "INSERT INTO pb_external_backup_checks(id,filename,provider,object_key,state) VALUES (?,?,?,?,'verified')",
      [randomUUID(), filename, provider, key],
    );
    return { state: "verified" };
  } catch (error) {
    await run(
      "INSERT INTO pb_external_backup_checks(id,filename,provider,object_key,state,error_code) VALUES (?,?,?,?,'failed','REMOTE_VERIFICATION_FAILED')",
      [randomUUID(), filename, provider, key],
    ).catch(() => {});
    throw new Error(
      "No se pudo descargar y verificar la copia externa. Revisa almacenamiento, permisos y clave de respaldo.",
    );
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
export async function uploadExternalBackup(file) {
  const config = externalBackupConfiguration();
  if (!config.configured) return { state: "not_configured" };
  const filename = path.basename(file),
    bucket = process.env.BACKUP_EXTERNAL_BUCKET;
  let key = filename;
  try {
    key = objectName(filename);
    const hash = await sha(file);
    if (config.provider === "s3") {
      const client = s3();
      try {
        await new Upload({
          client,
          params: {
            Bucket: bucket,
            Key: key,
            Body: createReadStream(file),
            ContentType: "application/octet-stream",
            Metadata: { sha256: hash },
          },
          queueSize: 2,
          partSize: 5 * 1024 * 1024,
          leavePartsOnError: false,
        }).done();
      } finally {
        client.destroy();
      }
    } else
      await gcs().objects.insert({
        bucket,
        name: key,
        requestBody: { metadata: { sha256: hash } },
        media: {
          mimeType: "application/octet-stream",
          body: createReadStream(file),
        },
      });
    return await verifyExternalBackup({
      filename,
      provider: config.provider,
      key,
      expectedHash: hash,
    });
  } catch {
    await run(
      "INSERT INTO pb_external_backup_checks(id,filename,provider,object_key,state,error_code) VALUES (?,?,?,?,'failed','REMOTE_UPLOAD_OR_CHECK_FAILED')",
      [randomUUID(), filename, config.provider, key],
    ).catch(() => {});
    return { state: "failed" };
  }
}
export function startExternalVerification() {
  const config = externalBackupConfiguration();
  if (!config.configured) return () => {};
  if (!cron.validate(config.verifySchedule)) {
    console.error("Revisa BACKUP_EXTERNAL_VERIFY_CRON");
    return () => {};
  }
  const task = cron.schedule(
    config.verifySchedule,
    async () => {
      const row = await one(
        "SELECT filename,provider,object_key FROM pb_external_backup_checks WHERE state='verified' AND provider=? ORDER BY verified_at DESC LIMIT 1",
        [config.provider],
      );
      if (row)
        await verifyExternalBackup({
          filename: row.filename,
          provider: row.provider,
          key: row.object_key,
        });
    },
    { timezone: "America/Costa_Rica", noOverlap: true },
  );
  return () => task.stop();
}
