import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authenticate } from "../middlewares/auth.js";
import { asyncHandler } from "../middlewares/error.js";
import { one, many, transaction } from "../db/pool.js";
import { HttpError } from "../utils/errors.js";
import { idSchema } from "../utils/validation.js";
import { canReview } from "./vacations.routes.js";
import {
  audit,
  notify,
  notifyReviewers,
} from "../services/activity.service.js";
const router = Router();
router.use(authenticate);
const localTime = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .refine(
    (v) => Number(v.slice(0, 2)) < 24 && Number(v.slice(3)) < 60,
    "Hora inválida",
  );
export function permissionInterval({ startDate, endDate, startTime, endTime }) {
  const start = new Date(startDate + "T" + startTime + ":00-06:00"),
    end = new Date(endDate + "T" + endTime + ":00-06:00"),
    minutes = (end - start) / 60000;
  if (
    !Number.isFinite(minutes) ||
    !Number.isInteger(minutes) ||
    minutes <= 0 ||
    minutes > 1440
  )
    throw new HttpError(
      400,
      "El permiso debe durar entre 1 minuto y 24 horas; revisa las fechas y horas.",
    );
  return { start, end, minutes };
}
router.get(
  "/",
  asyncHandler(async (req, res) =>
    res.json({
      requests: await many(
        "SELECT id,category,starts_at,ends_at,minutes,reason,status,review_comment,created_at FROM pb_permission_requests WHERE company_id=? AND user_id=? ORDER BY created_at DESC,id DESC LIMIT 50",
        [req.companyId, req.user.id],
      ),
    }),
  ),
);
router.get(
  "/review",
  asyncHandler(async (req, res) => {
    if (!canReview(req.user.role))
      throw new HttpError(403, "Solo RH puede revisar permisos");
    res.json({
      requests: await many(
        'SELECT p.id,p.user_id,u.name,u.email,p.category,p.starts_at,p.ends_at,p.minutes,p.reason,p.status,p.review_comment,p.created_at FROM pb_permission_requests p JOIN pb_users u ON u.id=p.user_id AND u.company_id=p.company_id WHERE p.company_id=? ORDER BY (p.status="pending") DESC,p.created_at DESC LIMIT 100',
        [req.companyId],
      ),
    });
  }),
);
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = z
        .object({
          category: z.enum(["medical", "personal", "other"]),
          startDate: z.string().date(),
          endDate: z.string().date(),
          startTime: localTime,
          endTime: localTime,
          reason: z.string().trim().min(10).max(2000),
        })
        .strict()
        .parse(req.body),
      { start, end, minutes } = permissionInterval(data),
      id = randomUUID();
    await transaction(async (cx) => {
      await cx.execute(
        "SELECT id FROM pb_users WHERE id=? AND company_id=? FOR UPDATE",
        [req.user.id, req.companyId],
      );
      const [[clock]] = await cx.query("SELECT UTC_TIMESTAMP(3) AS now");
      if (start < new Date(clock.now))
        throw new HttpError(
          400,
          "El inicio del permiso no puede estar en el pasado.",
        );
      const [overlap] = await cx.execute(
        "SELECT id FROM pb_permission_requests WHERE company_id=? AND user_id=? AND status IN ('pending','approved') AND starts_at<? AND ends_at>?",
        [req.companyId, req.user.id, end, start],
      );
      if (overlap.length)
        throw new HttpError(
          409,
          "Ya tienes un permiso pendiente o aprobado que coincide con ese horario.",
        );
      const [vacations] = await cx.execute(
        "SELECT id FROM pb_vacation_requests WHERE company_id=? AND user_id=? AND status='approved' AND start_date<=? AND end_date>=?",
        [
          req.companyId,
          req.user.id,
          new Date(end.getTime() - 1 - 6 * 3600000).toISOString().slice(0, 10),
          data.startDate,
        ],
      );
      if (vacations.length)
        throw new HttpError(
          409,
          "Ese intervalo coincide con tus vacaciones aprobadas.",
        );
      await cx.execute(
        "INSERT INTO pb_permission_requests(id,company_id,user_id,category,starts_at,ends_at,minutes,reason) VALUES (?,?,?,?,?,?,?,?)",
        [
          id,
          req.companyId,
          req.user.id,
          data.category,
          start,
          end,
          minutes,
          data.reason,
        ],
      );
      await notifyReviewers(
        {
          companyId: req.companyId,
          exclude: req.user.id,
          title: "Nuevo permiso por horas",
          body:
            req.user.name + " solicita un permiso de " + minutes + " minutos.",
          target: "hr",
          entityId: id,
        },
        cx,
      );
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "permissions.requested",
          targetType: "permission",
          targetId: id,
          detail: { minutes },
        },
        cx,
      );
    });
    res.status(201).json({ id, status: "pending", minutes });
  }),
);
router.patch(
  "/:id/review",
  asyncHandler(async (req, res) => {
    if (!canReview(req.user.role))
      throw new HttpError(403, "Solo RH puede revisar permisos");
    const id = idSchema.parse(req.params.id),
      data = z
        .object({
          status: z.enum(["approved", "rejected"]),
          comment: z.string().trim().max(1000).default(""),
        })
        .strict()
        .parse(req.body);
    await transaction(async (cx) => {
      const [pre] = await cx.execute(
        "SELECT user_id FROM pb_permission_requests WHERE id=? AND company_id=?",
        [id, req.companyId],
      );
      if (!pre.length) throw new HttpError(404, "Permiso no encontrado");
      await cx.execute(
        "SELECT id FROM pb_users WHERE id=? AND company_id=? FOR UPDATE",
        [pre[0].user_id, req.companyId],
      );
      const [rows] = await cx.execute(
        "SELECT * FROM pb_permission_requests WHERE id=? AND company_id=? FOR UPDATE",
        [id, req.companyId],
      );
      const item = rows[0];
      if (item.user_id === req.user.id)
        throw new HttpError(403, "Otra persona de RH debe revisar tu permiso.");
      if (item.status !== "pending")
        throw new HttpError(409, "El permiso ya fue revisado o cancelado.");
      if (data.status === "approved") {
        const [v] = await cx.execute(
          "SELECT id FROM pb_vacation_requests WHERE company_id=? AND user_id=? AND status='approved' AND start_date<=DATE(?-INTERVAL 6 HOUR-INTERVAL 1 MICROSECOND) AND end_date>=DATE(?-INTERVAL 6 HOUR)",
          [req.companyId, item.user_id, item.ends_at, item.starts_at],
        );
        if (v.length)
          throw new HttpError(
            409,
            "El permiso coincide con vacaciones aprobadas.",
          );
      }
      await cx.execute(
        "UPDATE pb_permission_requests SET status=?,review_comment=?,reviewer_id=?,reviewed_at=UTC_TIMESTAMP(3) WHERE id=? AND company_id=?",
        [data.status, data.comment, req.user.id, id, req.companyId],
      );
      await notify(
        {
          companyId: req.companyId,
          userId: item.user_id,
          kind: "hr",
          title:
            data.status === "approved"
              ? "Permiso por horas aprobado"
              : "Permiso por horas rechazado",
          body: "RH respondió tu solicitud. Revisa el detalle en Mi perfil.",
          target: "profile",
          entityId: id,
        },
        cx,
      );
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "permissions." + data.status,
          targetType: "permission",
          targetId: id,
        },
        cx,
      );
    });
    res.json({ ok: true });
  }),
);
router.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const id = idSchema.parse(req.params.id);
    await transaction(async (cx) => {
      const [rows] = await cx.execute(
        "SELECT status FROM pb_permission_requests WHERE id=? AND company_id=? AND user_id=? FOR UPDATE",
        [id, req.companyId, req.user.id],
      );
      if (!rows.length) throw new HttpError(404, "Permiso no encontrado");
      if (rows[0].status !== "pending")
        throw new HttpError(409, "Solo puedes cancelar un permiso pendiente");
      await cx.execute(
        "UPDATE pb_permission_requests SET status='cancelled',reviewed_at=UTC_TIMESTAMP(3) WHERE id=?",
        [id],
      );
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "permissions.cancelled",
          targetType: "permission",
          targetId: id,
        },
        cx,
      );
    });
    res.json({ ok: true });
  }),
);
export default router;
