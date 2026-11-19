import { Router } from "express";
import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { authenticate, adminOnly } from "../middlewares/auth.js";
import { asyncHandler } from "../middlewares/error.js";
import { one, many, transaction } from "../db/pool.js";
import { HttpError } from "../utils/errors.js";
import { idSchema, documentAccessSchema } from "../utils/validation.js";
import { audit } from "../services/activity.service.js";
const router = Router();
router.use(authenticate);
const visibility =
  "e.company_id=? AND (?='admin' OR (d.id IS NOT NULL AND JSON_CONTAINS(d.allowed_roles,JSON_QUOTE(?)) AND JSON_CONTAINS(e.allowed_roles,JSON_QUOTE(?))))";
const args = (req) => [
  req.companyId,
  req.user.role,
  req.user.role,
  req.user.role,
];
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const items = await many(
      `SELECT e.id,e.title,e.revision,e.content_hash,e.created_at,a.accepted_at FROM pb_policy_editions e LEFT JOIN pb_documents d ON d.id=e.document_id AND d.company_id=e.company_id LEFT JOIN pb_policy_acceptances a ON a.edition_id=e.id AND a.user_id=? WHERE e.state='active' AND ${visibility} ORDER BY e.created_at DESC LIMIT 100`,
      [req.user.id, ...args(req)],
    );
    const history = await many(
      "SELECT e.title,e.revision,a.accepted_at,a.content_hash FROM pb_policy_acceptances a JOIN pb_policy_editions e ON e.id=a.edition_id AND e.company_id=a.company_id WHERE a.company_id=? AND a.user_id=? ORDER BY a.accepted_at DESC LIMIT 50",
      [req.companyId, req.user.id],
    );
    res.json({ items, history });
  }),
);
router.post(
  "/",
  adminOnly,
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        documentId: z.string().uuid(),
        allowedRoles: documentAccessSchema.shape.allowedRoles,
      })
      .strict()
      .parse(req.body);
    await transaction(async (cx) => {
      const [[doc]] = await cx.execute(
        "SELECT id,name,state FROM pb_documents WHERE id=? AND company_id=? FOR UPDATE",
        [data.documentId, req.companyId],
      );
      if (!doc) throw new HttpError(404, "Documento no encontrado");
      if (doc.state !== "indexado")
        throw new HttpError(
          409,
          "Espera a que el documento termine de indexarse",
        );
      const [chunks] = await cx.execute(
        "SELECT content FROM pb_chunks WHERE document_id=? AND company_id=? ORDER BY chunk_index",
        [doc.id, req.companyId],
      );
      if (!chunks.length)
        throw new HttpError(
          422,
          "No hay texto legible para presentar la política",
        );
      const content = chunks.map((c) => c.content).join("\n\n"),
        hash = createHash("sha256").update(content).digest("hex");
      const [[old]] = await cx.execute(
        "SELECT id FROM pb_policy_editions WHERE document_id=? AND company_id=? AND state='active' AND content_hash=?",
        [doc.id, req.companyId, hash],
      );
      if (old)
        throw new HttpError(
          409,
          "Esta versión ya está publicada para aceptación",
        );
      const [[version]] = await cx.execute(
        "SELECT COALESCE(MAX(version),1) AS n FROM pb_document_versions WHERE document_id=? AND company_id=?",
        [doc.id, req.companyId],
      );
      await cx.execute(
        "UPDATE pb_policy_editions SET state='retired' WHERE document_id=? AND company_id=?",
        [doc.id, req.companyId],
      );
      const id = randomUUID();
      await cx.execute(
        "INSERT INTO pb_policy_editions(id,company_id,document_id,title,revision,content_hash,content,allowed_roles,created_by) VALUES (?,?,?,?,?,?,?,?,?)",
        [
          id,
          req.companyId,
          doc.id,
          doc.name,
          "v" + version.n + " · " + hash.slice(0, 12),
          hash,
          content,
          JSON.stringify(data.allowedRoles),
          req.user.id,
        ],
      );
      await cx.execute(
        "INSERT IGNORE INTO pb_notifications(id,company_id,user_id,kind,title,body,target,entity_id,event_key) SELECT UUID(),u.company_id,u.id,'document','Política pendiente de lectura',d.name,'policies',?,? FROM pb_users u JOIN pb_documents d ON d.company_id=u.company_id WHERE d.id=? AND d.company_id=? AND (u.role='admin' OR (JSON_CONTAINS(d.allowed_roles,JSON_QUOTE(u.role)) AND JSON_CONTAINS(?,JSON_QUOTE(u.role))))",
        [
          id,
          "policy:" + id,
          doc.id,
          req.companyId,
          JSON.stringify(data.allowedRoles),
        ],
      );
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "policies.published",
          targetType: "policy",
          targetId: id,
          detail: { documentId: doc.id, hash },
        },
        cx,
      );
    });
    res.status(201).json({ ok: true });
  }),
);
router.get(
  "/receipts",
  adminOnly,
  asyncHandler(async (req, res) => {
    const { page } = z
      .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
      .strict()
      .parse(req.query);
    const items = await many(
      "SELECT e.title,e.revision,u.name,u.email,a.accepted_at,a.content_hash,a.statement FROM pb_policy_acceptances a JOIN pb_policy_editions e ON e.id=a.edition_id AND e.company_id=a.company_id JOIN pb_users u ON u.id=a.user_id AND u.company_id=a.company_id WHERE a.company_id=? ORDER BY a.accepted_at DESC,a.edition_id,a.user_id LIMIT 51 OFFSET " +
        (page - 1) * 50,
      [req.companyId],
    );
    res.json({ items: items.slice(0, 50), hasMore: items.length > 50 });
  }),
);
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const edition = await one(
      `SELECT e.* FROM pb_policy_editions e LEFT JOIN pb_documents d ON d.id=e.document_id AND d.company_id=e.company_id WHERE e.id=? AND ${visibility}`,
      [idSchema.parse(req.params.id), ...args(req)],
    );
    if (!edition) throw new HttpError(404, "Política no disponible");
    res.set("Cache-Control", "no-store").json({ edition });
  }),
);
router.post(
  "/:id/accept",
  asyncHandler(async (req, res) => {
    const data = z
      .object({
        hash: z.string().regex(/^[a-f0-9]{64}$/),
        accepted: z.literal(true),
      })
      .strict()
      .parse(req.body);
    await transaction(async (cx) => {
      const [[edition]] = await cx.execute(
        `SELECT e.id,e.content_hash,e.state FROM pb_policy_editions e LEFT JOIN pb_documents d ON d.id=e.document_id AND d.company_id=e.company_id WHERE e.id=? AND ${visibility} FOR UPDATE`,
        [idSchema.parse(req.params.id), ...args(req)],
      );
      if (!edition) throw new HttpError(404, "Política no disponible");
      if (edition.state !== "active" || edition.content_hash !== data.hash)
        throw new HttpError(
          409,
          "La política cambió. Abre la versión vigente antes de aceptar.",
        );
      const [result] = await cx.execute(
        "INSERT IGNORE INTO pb_policy_acceptances(edition_id,user_id,company_id,content_hash,statement) VALUES (?,?,?,?,?)",
        [
          edition.id,
          req.user.id,
          req.companyId,
          edition.content_hash,
          "Declaro haber leído y aceptado esta versión de la política.",
        ],
      );
      if (result.affectedRows)
        await audit(
          {
            companyId: req.companyId,
            actorId: req.user.id,
            action: "policies.accepted",
            targetType: "policy",
            targetId: edition.id,
            detail: { hash: edition.content_hash },
          },
          cx,
        );
    });
    res.json({ ok: true });
  }),
);
export default router;
