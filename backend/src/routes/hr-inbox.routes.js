import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middlewares/auth.js";
import { asyncHandler } from "../middlewares/error.js";
import { many, transaction } from "../db/pool.js";
import { HttpError } from "../utils/errors.js";
import { canReview } from "./vacations.routes.js";
import { idSchema } from "../utils/validation.js";
import { notifyReviewers, audit } from "../services/activity.service.js";
const router = Router();
router.use(authenticate, (req, _res, next) =>
  canReview(req.user.role)
    ? next()
    : next(new HttpError(403, "Solo RH puede acceder a esta bandeja")),
);
const tables = {
  vacation: "pb_vacation_requests",
  permission: "pb_permission_requests",
  correction: "pb_attendance_corrections",
};
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        kind: z
          .enum(["all", "vacation", "permission", "correction"])
          .default("all"),
        status: z
          .enum(["pending", "approved", "rejected", "cancelled"])
          .default("pending"),
        search: z.string().trim().max(100).default(""),
        page: z.coerce.number().int().min(1).max(10000).default(1),
        older: z.coerce.number().int().min(0).max(365).default(0),
      })
      .strict()
      .parse(req.query);
    const parts = Object.entries(tables)
      .filter(([kind]) => q.kind === "all" || q.kind === kind)
      .map(
        ([kind, table]) =>
          `SELECT r.id,r.user_id,u.name,u.email,r.reason,r.status,r.created_at,r.review_comment,'${kind}' AS kind,${kind === "vacation" ? "DATE_FORMAT(r.start_date,'%Y-%m-%d')" : "DATE_FORMAT(" + (kind === "permission" ? "r.starts_at" : "r.proposed_in") + "-INTERVAL 6 HOUR,'%Y-%m-%d %H:%i')"} AS start,${kind === "vacation" ? "DATE_FORMAT(r.end_date,'%Y-%m-%d')" : "DATE_FORMAT(" + (kind === "permission" ? "r.ends_at" : "r.proposed_out") + "-INTERVAL 6 HOUR,'%Y-%m-%d %H:%i')"} AS end FROM ${table} r JOIN pb_users u ON u.id=r.user_id AND u.company_id=r.company_id WHERE r.company_id=? AND r.status=? AND r.created_at<=UTC_TIMESTAMP(3)-INTERVAL ? DAY AND (u.name LIKE ? OR u.email LIKE ?)`,
      );
    const args = parts.flatMap(() => [
        req.companyId,
        q.status,
        q.older,
        "%" + q.search + "%",
        "%" + q.search + "%",
      ]),
      rows = await many(
        "SELECT * FROM (" +
          parts.join(" UNION ALL ") +
          ") tasks ORDER BY created_at,id LIMIT 21 OFFSET " +
          (q.page - 1) * 20,
        args,
      );
    res.json({ items: rows.slice(0, 20), hasMore: rows.length > 20 });
  }),
);
router.post(
  "/:kind/:id/remind",
  asyncHandler(async (req, res) => {
    const kind = z
        .enum(["vacation", "permission", "correction"])
        .parse(req.params.kind),
      id = idSchema.parse(req.params.id);
    await transaction(async (cx) => {
      await cx.execute("SELECT id FROM pb_companies WHERE id=? FOR UPDATE", [
        req.companyId,
      ]);
      const [[item]] = await cx.execute(
        "SELECT user_id,status FROM " +
          tables[kind] +
          " WHERE id=? AND company_id=?",
        [id, req.companyId],
      );
      if (!item) throw new HttpError(404, "Solicitud no encontrada");
      if (item.status !== "pending")
        throw new HttpError(409, "La solicitud ya fue resuelta");
      const [[prior]] = await cx.execute(
        "SELECT last_sent_at>UTC_TIMESTAMP()-INTERVAL 24 HOUR AS recent FROM pb_hr_reminders WHERE company_id=? AND kind=? AND request_id=?",
        [req.companyId, kind, id],
      );
      if (prior?.recent)
        throw new HttpError(
          429,
          "Ya se envió un recordatorio en las últimas 24 horas",
        );
      await cx.execute(
        "INSERT INTO pb_hr_reminders(company_id,kind,request_id,last_sent_at) VALUES (?,?,?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE last_sent_at=UTC_TIMESTAMP(3)",
        [req.companyId, kind, id],
      );
      await notifyReviewers(
        {
          companyId: req.companyId,
          exclude: item.user_id,
          title: "Recordatorio: solicitud pendiente",
          body: "Hay una solicitud que requiere revisión en la bandeja de RH.",
          entityId: id,
        },
        cx,
      );
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "hr.reminded",
          targetType: kind,
          targetId: id,
        },
        cx,
      );
    });
    res.json({ ok: true });
  }),
);
export default router;
