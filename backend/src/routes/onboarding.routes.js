import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authenticate } from "../middlewares/auth.js";
import { asyncHandler } from "../middlewares/error.js";
import { one, many, transaction } from "../db/pool.js";
import { canReview } from "./vacations.routes.js";
import { HttpError } from "../utils/errors.js";
import { idSchema } from "../utils/validation.js";
import {
  audit,
  notify,
  notifyReviewers,
} from "../services/activity.service.js";
const router = Router();
router.use(authenticate);
const requireHR = (req) => {
  if (!canReview(req.user.role))
    throw new HttpError(403, "Solo RH puede gestionar el ingreso");
};
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        review: z.enum(["true", "false"]).default("false"),
        page: z.coerce.number().int().min(1).max(10000).default(1),
      })
      .strict()
      .parse(req.query);
    const review = q.review === "true";
    if (review) requireHR(req);
    const where = "t.company_id=?" + (review ? "" : " AND t.user_id=?"),
      args = [req.companyId, ...(review ? [] : [req.user.id])];
    const items = await many(
      "SELECT t.*,u.name,u.email FROM pb_onboarding_tasks t JOIN pb_users u ON u.id=t.user_id AND u.company_id=t.company_id WHERE " +
        where +
        ' ORDER BY (t.state="submitted") DESC,t.due_date IS NULL,t.due_date,t.created_at DESC,t.id LIMIT 51 OFFSET ' +
        (q.page - 1) * 50,
      args,
    );
    const summary = await one(
      "SELECT COUNT(*) AS total,COALESCE(SUM(t.state='completed'),0) AS completed FROM pb_onboarding_tasks t WHERE " +
        where,
      args,
    );
    res.json({
      items: items.slice(0, 50),
      hasMore: items.length > 50,
      summary,
    });
  }),
);
router.post(
  "/",
  asyncHandler(async (req, res) => {
    requireHR(req);
    const data = z
        .object({
          userId: z.string().uuid(),
          title: z.string().trim().min(3).max(200),
          category: z.enum(["document", "training", "task"]),
          description: z.string().trim().min(5).max(2000),
          link: z
            .string()
            .url()
            .max(1000)
            .refine((u) => new URL(u).protocol === "https:", "Usa HTTPS")
            .nullable()
            .default(null),
          dueDate: z.string().date().nullable().default(null),
        })
        .strict()
        .parse(req.body),
      id = randomUUID();
    await transaction(async (cx) => {
      const [[user]] = await cx.execute(
        "SELECT id FROM pb_users WHERE id=? AND company_id=?",
        [data.userId, req.companyId],
      );
      if (!user) throw new HttpError(404, "Colaborador no encontrado");
      await cx.execute(
        "INSERT INTO pb_onboarding_tasks(id,company_id,user_id,title,category,description,link,due_date,created_by) VALUES (?,?,?,?,?,?,?,?,?)",
        [
          id,
          req.companyId,
          data.userId,
          data.title,
          data.category,
          data.description,
          data.link,
          data.dueDate,
          req.user.id,
        ],
      );
      await notify(
        {
          companyId: req.companyId,
          userId: data.userId,
          title: "Nueva tarea de bienvenida",
          body: "Revisa tu lista de ingreso en Mi perfil.",
          entityId: id,
        },
        cx,
      );
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "onboarding.assigned",
          targetType: "onboarding",
          targetId: id,
        },
        cx,
      );
    });
    res.status(201).json({ id });
  }),
);
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id),
      { action } = z
        .object({ action: z.enum(["submit", "complete", "reopen"]) })
        .strict()
        .parse(req.body);
    await transaction(async (cx) => {
      const [[task]] = await cx.execute(
        "SELECT * FROM pb_onboarding_tasks WHERE id=? AND company_id=? FOR UPDATE",
        [id, req.companyId],
      );
      if (!task) throw new HttpError(404, "Tarea no encontrada");
      if (action === "submit") {
        if (task.user_id !== req.user.id)
          throw new HttpError(
            403,
            "Solo el colaborador puede entregar su tarea",
          );
        if (task.state !== "pending")
          throw new HttpError(409, "La tarea ya fue entregada");
        await cx.execute(
          "UPDATE pb_onboarding_tasks SET state='submitted',submitted_at=UTC_TIMESTAMP(3) WHERE id=?",
          [id],
        );
        await notifyReviewers(
          {
            companyId: req.companyId,
            exclude: req.user.id,
            title: "Tarea de ingreso entregada",
            body: "Revisa las entregas del colaborador en Ingreso.",
            entityId: id,
          },
          cx,
        );
      } else {
        requireHR(req);
        if (task.user_id === req.user.id)
          throw new HttpError(403, "Otra persona de RH debe validar tu tarea");
        if (action === "complete" && task.state !== "submitted")
          throw new HttpError(
            409,
            "Primero el colaborador debe entregar la tarea",
          );
        await cx.execute(
          "UPDATE pb_onboarding_tasks SET state=?,completed_by=?,completed_at=" +
            (action === "complete" ? "UTC_TIMESTAMP(3)" : "NULL") +
            " WHERE id=?",
          [
            action === "complete" ? "completed" : "pending",
            action === "complete" ? req.user.id : null,
            id,
          ],
        );
        await notify(
          {
            companyId: req.companyId,
            userId: task.user_id,
            title:
              action === "complete"
                ? "Tarea de ingreso validada"
                : "Tarea de ingreso reabierta",
            body: "Consulta tu lista de bienvenida.",
            entityId: id,
          },
          cx,
        );
      }
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "onboarding." + action,
          targetType: "onboarding",
          targetId: id,
        },
        cx,
      );
    });
    res.json({ ok: true });
  }),
);
export default router;
