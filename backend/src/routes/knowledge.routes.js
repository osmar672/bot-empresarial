import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authenticate, adminOnly } from "../middlewares/auth.js";
import { asyncHandler } from "../middlewares/error.js";
import { many, transaction } from "../db/pool.js";
import { HttpError } from "../utils/errors.js";
import { idSchema, documentAccessSchema } from "../utils/validation.js";
import { audit, notifyDocument } from "../services/activity.service.js";
import { splitText } from "../rag/chunk.js";
import { embed, embeddingModel } from "../services/embedding.service.js";
import { eligibleQuestion } from "../services/knowledgeReview.service.js";
import { questionRefusal } from "../utils/access.js";
const router = Router();
router.use(authenticate, adminOnly);
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        status: z
          .enum(["pending", "published", "dismissed"])
          .default("pending"),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .strict()
      .parse(req.query);
    res.json({
      items: await many(
        `SELECT g.*, (SELECT COUNT(*) FROM pb_knowledge_askers a WHERE a.gap_id=g.id) AS people FROM pb_knowledge_gaps g WHERE g.company_id=? AND g.status=? ORDER BY people DESC,g.created_at LIMIT 20 OFFSET ${(q.page - 1) * 20}`,
        [req.companyId, q.status],
      ),
    });
  }),
);
router.post(
  "/:id/publish",
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id),
      data = z
        .object({
          answer: z.string().trim().min(30).max(12000),
          source: z
            .string()
            .url()
            .max(1000)
            .refine(
              (u) => new URL(u).protocol === "https:",
              "Usa una fuente HTTPS",
            ),
          allowedRoles: documentAccessSchema.shape.allowedRoles,
        })
        .strict()
        .parse(req.body);
    if (questionRefusal(data.answer))
      throw new HttpError(
        400,
        "La respuesta contiene instrucciones no admitidas",
      );
    await transaction(async (cx) => {
      const [[plan]] = await cx.execute(
        "SELECT p.max_documents FROM pb_companies c JOIN pb_plans p ON p.id=c.plan_id WHERE c.id=? FOR UPDATE",
        [req.companyId],
      );
      const [[gap]] = await cx.execute(
        "SELECT * FROM pb_knowledge_gaps WHERE id=? AND company_id=? FOR UPDATE",
        [id, req.companyId],
      );
      if (!gap) throw new HttpError(404, "Pregunta no encontrada");
      if (gap.status !== "pending")
        throw new HttpError(409, "La pregunta ya fue revisada");
      if (!eligibleQuestion(gap.question))
        throw new HttpError(
          400,
          "Solo se admite información empresarial o legal",
        );
      const [[count]] = await cx.execute(
        "SELECT COUNT(*) AS n FROM pb_knowledge_askers WHERE gap_id=?",
        [id],
      );
      if (count.n < 2)
        throw new HttpError(
          409,
          "Se requieren al menos dos personas distintas para promover esta pregunta",
        );
      const [[docs]] = await cx.execute(
        "SELECT COUNT(*) AS n FROM pb_documents WHERE company_id=?",
        [req.companyId],
      );
      if (plan.max_documents > 0 && docs.n >= plan.max_documents)
        throw new HttpError(429, "Límite de documentos alcanzado");
      const documentId = randomUUID(),
        text =
          gap.question +
          "\n\n" +
          data.answer +
          "\n\nFuente revisada: " +
          data.source,
        pieces = splitText(text),
        vectors = await embed(pieces, "document");
      await cx.execute(
        "INSERT INTO pb_documents(id,company_id,name,source,mime_type,allowed_roles,state,chunk_count,indexed_at) VALUES (?,?,?,'upload','text/plain',?,'indexado',?,UTC_TIMESTAMP(3))",
        [
          documentId,
          req.companyId,
          "Respuesta revisada · " + gap.question.slice(0, 160),
          JSON.stringify(data.allowedRoles),
          pieces.length,
        ],
      );
      for (let i = 0; i < pieces.length; i++)
        await cx.execute(
          "INSERT INTO pb_chunks(id,company_id,document_id,chunk_index,content,embedding,embedding_model) VALUES (?,?,?,?,?,?,?)",
          [
            randomUUID(),
            req.companyId,
            documentId,
            i,
            pieces[i],
            JSON.stringify(vectors[i]),
            embeddingModel(),
          ],
        );
      await cx.execute(
        "UPDATE pb_knowledge_gaps SET status='published',answer=?,source_url=?,allowed_roles=?,document_id=?,reviewer_id=? WHERE id=?",
        [
          data.answer,
          data.source,
          JSON.stringify(data.allowedRoles),
          documentId,
          req.user.id,
          id,
        ],
      );
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "knowledge.published",
          targetType: "knowledge",
          targetId: id,
          detail: { documentId, source: data.source },
        },
        cx,
      );
      await notifyDocument(req.companyId, documentId, cx);
    });
    res.json({ ok: true });
  }),
);
router.post(
  "/:id/dismiss",
  asyncHandler(async (req, res) => {
    await transaction(async (cx) => {
      const [[gap]] = await cx.execute(
        "SELECT document_id FROM pb_knowledge_gaps WHERE id=? AND company_id=? FOR UPDATE",
        [idSchema.parse(req.params.id), req.companyId],
      );
      if (!gap) throw new HttpError(404, "Pregunta no encontrada");
      if (gap.document_id)
        await cx.execute(
          "DELETE FROM pb_documents WHERE id=? AND company_id=?",
          [gap.document_id, req.companyId],
        );
      await cx.execute(
        "UPDATE pb_knowledge_gaps SET status='dismissed',reviewer_id=? WHERE id=?",
        [req.user.id, req.params.id],
      );
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "knowledge.withdrawn",
          targetType: "knowledge",
          targetId: req.params.id,
        },
        cx,
      );
    });
    res.json({ ok: true });
  }),
);
export default router;
