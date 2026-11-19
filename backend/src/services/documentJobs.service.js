import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { env } from "../config/env.js";
import { pool, one, many, run, transaction } from "../db/pool.js";
import {
  createDocument,
  indexDocument,
  reindexExisting,
} from "./documents.service.js";
import { extractFile } from "./extraction.service.js";
import { HttpError } from "../utils/errors.js";
import { audit, notify, notifyDocument } from "./activity.service.js";
export async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
const location = (file) =>
  path.join(env.backendDir, "uploads", path.basename(file));
export async function enqueueDocument({
  companyId,
  userId,
  name,
  mime,
  allowedRoles,
  tempPath,
  size,
  documentId = null,
}) {
  const hash = await hashFile(tempPath),
    storage = randomUUID(),
    id = randomUUID();
  await fs.mkdir(path.dirname(location(storage)), {
    recursive: true,
    mode: 0o700,
  });
  await fs.copyFile(tempPath, location(storage));
  try {
    return await transaction(async (cx) => {
      await cx.execute("SELECT id FROM pb_companies WHERE id=? FOR UPDATE", [
        companyId,
      ]);
      const [duplicate] = await cx.execute(
        "SELECT document_id FROM pb_document_assets WHERE company_id=? AND content_hash=?",
        [companyId, hash],
      );
      const [queued] = await cx.execute(
        "SELECT id FROM pb_document_jobs WHERE company_id=? AND content_hash=? AND state IN ('queued','processing')",
        [companyId, hash],
      );
      if (duplicate.length || queued.length)
        throw new HttpError(
          409,
          "Este archivo ya está guardado o en proceso de carga en tu empresa.",
        );
      if (documentId) {
        const [docs] = await cx.execute(
          "SELECT source FROM pb_documents WHERE id=? AND company_id=? FOR UPDATE",
          [documentId, companyId],
        );
        if (!docs.length) throw new HttpError(404, "Documento no encontrado");
        if (docs[0].source === "drive")
          throw new HttpError(
            409,
            "Actualiza los documentos de Drive en su carpeta de origen.",
          );
        const [active] = await cx.execute(
          "SELECT id FROM pb_document_jobs WHERE document_id=? AND state IN ('queued','processing')",
          [documentId],
        );
        if (active.length)
          throw new HttpError(
            409,
            "Este documento ya tiene una operación en curso",
          );
      }
      await cx.execute(
        "INSERT INTO pb_document_jobs(id,company_id,user_id,document_id,kind,name,mime_type,storage_path,size_bytes,content_hash,allowed_roles) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        [
          id,
          companyId,
          userId,
          documentId,
          documentId ? "replace" : "upload",
          name,
          mime,
          storage,
          size,
          hash,
          JSON.stringify(allowedRoles),
        ],
      );
      return { id, state: "queued", name };
    });
  } catch (error) {
    await fs.unlink(location(storage)).catch(() => {});
    throw error;
  }
}
export async function enqueueReindex(companyId, userId, documentId) {
  return transaction(async (cx) => {
    await cx.execute("SELECT id FROM pb_companies WHERE id=? FOR UPDATE", [
      companyId,
    ]);
    const [docs] = await cx.execute(
      "SELECT name FROM pb_documents WHERE id=? AND company_id=?",
      [documentId, companyId],
    );
    if (!docs.length) throw new HttpError(404, "Documento no encontrado");
    const [active] = await cx.execute(
      "SELECT id FROM pb_document_jobs WHERE document_id=? AND company_id=? AND state IN ('queued','processing')",
      [documentId, companyId],
    );
    if (active.length)
      throw new HttpError(
        409,
        "Este documento ya tiene una operación en curso",
      );
    const id = randomUUID();
    await cx.execute(
      "INSERT INTO pb_document_jobs(id,company_id,user_id,document_id,kind,name) VALUES (?,?,?,?,'reindex',?)",
      [id, companyId, userId, documentId, docs[0].name],
    );
    return { id, state: "queued" };
  });
}
async function progress(job, value, stage) {
  await run(
    "UPDATE pb_document_jobs SET progress=?,stage=?,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND state='processing'",
    [value, stage, job.id],
  );
}
export async function processDocumentJob(job) {
  try {
    await progress(job, 5, "Leyendo documento");
    if (job.kind === "reindex") {
      const original = await one(
        "SELECT storage_path,mime_type FROM pb_documents WHERE id=? AND company_id=?",
        [job.document_id, job.company_id],
      );
      if (!original) throw new HttpError(404, "El documento fue eliminado");
      if (original.storage_path) {
        const text = await extractFile(
          await fs.readFile(location(original.storage_path)),
          original.mime_type,
        );
        await indexDocument(job.company_id, job.document_id, text, {
          onProgress: (ratio) =>
            progress(
              job,
              30 + Math.floor(ratio * 65),
              "Reindexando fragmentos",
            ),
        });
      } else await reindexExisting(job.company_id, job.document_id);
      await run(
        "UPDATE pb_document_jobs SET state='done',progress=100,stage='Reindexado',finished_at=UTC_TIMESTAMP(3) WHERE id=?",
        [job.id],
      );
    } else {
      if (!job.storage_path)
        throw new Error("Archivo de trabajo no disponible");
      const text = await extractFile(
        await fs.readFile(location(job.storage_path)),
        job.mime_type,
      );
      await progress(job, 30, "Texto extraído. Preparando índice");
      let documentId = job.document_id;
      if (!documentId) {
        if (job.kind === "replace")
          throw new HttpError(404, "El documento fue eliminado");
        documentId = await createDocument({
          companyId: job.company_id,
          name: job.name,
          mime: job.mime_type,
          allowedRoles:
            typeof job.allowed_roles === "string"
              ? JSON.parse(job.allowed_roles)
              : job.allowed_roles,
        });
        await run("UPDATE pb_document_jobs SET document_id=? WHERE id=?", [
          documentId,
          job.id,
        ]);
        job.document_id = documentId;
      }
      await indexDocument(job.company_id, documentId, text, {
        onProgress: (ratio) =>
          progress(job, 35 + Math.floor(ratio * 60), "Indexando fragmentos"),
        onIndexed: async (cx) => {
          const [old] = await cx.execute(
            "SELECT storage_path,name,mime_type,size_bytes,allowed_roles FROM pb_documents WHERE id=? AND company_id=? FOR UPDATE",
            [documentId, job.company_id],
          );
          const [conflict] = await cx.execute(
            "SELECT document_id FROM pb_document_assets WHERE company_id=? AND content_hash=? AND document_id<>?",
            [job.company_id, job.content_hash, documentId],
          );
          if (conflict.length)
            throw new HttpError(
              409,
              "El contenido ya está publicado en otro documento de tu empresa.",
            );
          const [[version]] = await cx.execute(
            "SELECT COALESCE(MAX(version),0) AS current FROM pb_document_versions WHERE document_id=? AND company_id=?",
            [documentId, job.company_id],
          );
          let current = Number(version.current);
          // Preserve the original of a document uploaded before version tracking was available.
          if (
            current === 0 &&
            old[0]?.storage_path &&
            old[0].storage_path !== job.storage_path
          ) {
            const oldHash = await hashFile(location(old[0].storage_path));
            await cx.execute(
              "INSERT INTO pb_document_versions(id,company_id,document_id,version,name,mime_type,storage_path,size_bytes,content_hash) VALUES (?,?,?,1,?,?,?,?,?)",
              [
                randomUUID(),
                job.company_id,
                documentId,
                old[0].name,
                old[0].mime_type,
                old[0].storage_path,
                old[0].size_bytes || 0,
                oldHash,
              ],
            );
            current = 1;
          }
          await cx.execute(
            "INSERT INTO pb_document_versions(id,company_id,document_id,version,name,mime_type,storage_path,size_bytes,content_hash,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [
              randomUUID(),
              job.company_id,
              documentId,
              current + 1,
              job.name,
              job.mime_type,
              job.storage_path,
              job.size_bytes,
              job.content_hash,
              job.user_id,
            ],
          );
          await cx.execute(
            "INSERT INTO pb_document_assets(document_id,company_id,content_hash) VALUES (?,?,?) ON DUPLICATE KEY UPDATE content_hash=VALUES(content_hash)",
            [documentId, job.company_id, job.content_hash],
          );
          await cx.execute(
            "UPDATE pb_documents SET name=?,mime_type=?,storage_path=?,size_bytes=? WHERE id=? AND company_id=?",
            [
              job.name,
              job.mime_type,
              job.storage_path,
              job.size_bytes,
              documentId,
              job.company_id,
            ],
          );
          await cx.execute(
            "UPDATE pb_document_jobs SET state='done',progress=100,stage='Disponible para consultas',finished_at=UTC_TIMESTAMP(3) WHERE id=?",
            [job.id],
          );
          await audit(
            {
              companyId: job.company_id,
              actorId: job.user_id,
              action:
                job.kind === "replace"
                  ? "documents.version_uploaded"
                  : "documents.uploaded",
              targetType: "document",
              targetId: documentId,
              detail: { name: job.name, version: current + 1 },
            },
            cx,
          );
        },
      });
    }
    if (job.user_id && job.kind === "reindex")
      await notify({
        companyId: job.company_id,
        userId: job.user_id,
        title: "Documento listo",
        body: job.name + " ya está disponible para consultas.",
        kind: "document",
        target: "documents",
        entityId: job.document_id,
      }).catch(() => {});
  } catch (error) {
    const message = String(
      error.status
        ? error.message
        : "No se pudo procesar el documento. Reintenta o consulta el registro del servidor.",
    ).slice(0, 350);
    await run(
      "UPDATE pb_document_jobs SET state='failed',stage='Requiere atención',error_message=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?",
      [message, job.id],
    );
    if (job.user_id)
      await notify({
        companyId: job.company_id,
        userId: job.user_id,
        title: "No se pudo procesar un archivo",
        body:
          job.name + ". Revisa el seguimiento de documentos para reintentar.",
        kind: "info",
        target: "documents",
        entityId: job.id,
      });
    console.error(
      "Error de trabajo de documento",
      job.id,
      error.code || error.message,
    );
  }
}
export async function runDocumentQueue({ limit = 5, companyId = null } = {}) {
  const cx = await pool.getConnection();
  let locked = false;
  try {
    const [[lock]] = await cx.query(
      "SELECT GET_LOCK(CONCAT(DATABASE(),':document-worker'),0) AS acquired",
    );
    if (lock.acquired !== 1) return;
    locked = true;
    // The named lock guarantees no other worker is alive for this database.
    await cx.execute(
      "UPDATE pb_document_jobs SET state='queued',stage='Recuperado tras reinicio',progress=0 WHERE state='processing'" +
        (companyId ? " AND company_id=?" : ""),
      companyId ? [companyId] : [],
    );
    const legacy = await many(
      "SELECT d.id,d.company_id,d.name,d.mime_type,d.storage_path,d.size_bytes,d.created_at FROM pb_documents d LEFT JOIN pb_document_assets a ON a.document_id=d.id WHERE d.storage_path IS NOT NULL AND a.document_id IS NULL" +
        (companyId ? " AND d.company_id=?" : "") +
        " LIMIT 5",
      companyId ? [companyId] : [],
    );
    for (const doc of legacy) {
      try {
        const hash = await hashFile(location(doc.storage_path));
        await transaction(async (db) => {
          await db.execute(
            "INSERT IGNORE INTO pb_document_assets(document_id,company_id,content_hash) VALUES (?,?,?)",
            [doc.id, doc.company_id, hash],
          );
          const [[v]] = await db.execute(
            "SELECT COUNT(*) AS count FROM pb_document_versions WHERE document_id=?",
            [doc.id],
          );
          if (!v.count)
            await db.execute(
              "INSERT INTO pb_document_versions(id,company_id,document_id,version,name,mime_type,storage_path,size_bytes,content_hash,created_at) VALUES (?,?,?,1,?,?,?,?,?,?)",
              [
                randomUUID(),
                doc.company_id,
                doc.id,
                doc.name,
                doc.mime_type,
                doc.storage_path,
                doc.size_bytes || 0,
                hash,
                doc.created_at,
              ],
            );
        });
      } catch {
        /* Missing originals remain visible in document status; do not block other jobs. */
      }
    }
    for (let i = 0; i < limit; i++) {
      const job = await one(
        "SELECT * FROM pb_document_jobs WHERE state='queued'" +
          (companyId ? " AND company_id=?" : "") +
          " ORDER BY created_at,id LIMIT 1",
        companyId ? [companyId] : [],
      );
      if (!job) break;
      await run(
        "UPDATE pb_document_jobs SET state='processing',error_message=NULL,finished_at=NULL WHERE id=? AND state='queued'",
        [job.id],
      );
      await processDocumentJob(job);
    }
  } finally {
    if (locked)
      await cx
        .query("SELECT RELEASE_LOCK(CONCAT(DATABASE(),':document-worker'))")
        .catch(() => {});
    cx.release();
  }
}
export function startDocumentWorker() {
  let running = null,
    stopped = false;
  const tick = () => {
    if (stopped || running) return;
    running = runDocumentQueue()
      .catch((e) => console.error("Cola de documentos:", e.code || e.message))
      .finally(() => (running = null));
  };
  const timer = setInterval(tick, 2000);
  timer.unref();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await running;
  };
}
