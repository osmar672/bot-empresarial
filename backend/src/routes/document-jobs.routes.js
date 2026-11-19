import { z } from "zod";
import { Router } from "express";
import { authenticate, adminOnly } from "../middlewares/auth.js";
import { asyncHandler } from "../middlewares/error.js";
import { many, one, transaction } from "../db/pool.js";
import { idSchema } from "../utils/validation.js";
import { HttpError } from "../utils/errors.js";
const router = Router();
router.use(authenticate, adminOnly);
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .parse(req.query.page || 1);
    const summary = await one(
      "SELECT COUNT(*) AS total,COALESCE(SUM(state IN ('queued','processing')),0) AS active FROM pb_document_jobs WHERE company_id=?",
      [req.companyId],
    );
    res.json({
      jobs: await many(
        "SELECT id,document_id,kind,state,name,progress,stage,error_message,created_at,finished_at FROM pb_document_jobs WHERE company_id=? ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET " +
          (page - 1) * 20,
        [req.companyId],
      ),
      page,
      ...summary,
    });
  }),
);
router.post(
  "/:id/retry",
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    await transaction(async (cx) => {
      await cx.execute("SELECT id FROM pb_companies WHERE id=? FOR UPDATE", [
        req.companyId,
      ]);
      const [jobs] = await cx.execute(
        "SELECT * FROM pb_document_jobs WHERE id=? AND company_id=? AND state='failed' FOR UPDATE",
        [id, req.companyId],
      );
      if (!jobs.length)
        throw new HttpError(
          404,
          "No hay un trabajo fallido que puedas reintentar",
        );
      const job = jobs[0];
      if (job.kind !== "upload" && !job.document_id)
        throw new HttpError(404, "El documento ya no existe");
      const [active] = await cx.execute(
        "SELECT id FROM pb_document_jobs WHERE company_id=? AND id<>? AND state IN ('queued','processing') AND (document_id=? OR (content_hash IS NOT NULL AND content_hash=?))",
        [req.companyId, id, job.document_id, job.content_hash],
      );
      if (active.length)
        throw new HttpError(409, "Ya hay un trabajo equivalente en curso");
      await cx.execute(
        "UPDATE pb_document_jobs SET state='queued',progress=0,stage='En cola para reintento',error_message=NULL,finished_at=NULL WHERE id=?",
        [id],
      );
    });
    res.status(202).json({ ok: true });
  }),
);
export default router;
