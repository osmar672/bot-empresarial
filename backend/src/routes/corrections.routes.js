import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authenticate } from "../middlewares/auth.js";
import { asyncHandler } from "../middlewares/error.js";
import { many, transaction } from "../db/pool.js";
import { HttpError } from "../utils/errors.js";
import { idSchema } from "../utils/validation.js";
import { canReview } from "./vacations.routes.js";
import {
  audit,
  notify,
  notifyReviewers,
} from "../services/activity.service.js";
import { recordPunctuality } from "../services/punctuality.service.js";
const router = Router();
router.use(authenticate);
const sameTime = (a, b) =>
  (a == null && b == null) ||
  (a != null && b != null && new Date(a).getTime() === new Date(b).getTime());
router.get(
  "/",
  asyncHandler(async (req, res) =>
    res.json({
      requests: await many(
        "SELECT * FROM pb_attendance_corrections WHERE company_id=? AND user_id=? ORDER BY created_at DESC LIMIT 50",
        [req.companyId, req.user.id],
      ),
    }),
  ),
);
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = z
        .object({
          attendanceId: z.string().uuid().nullable().default(null),
          start: z.string().datetime({ offset: true }),
          end: z.string().datetime({ offset: true }),
          reason: z.string().trim().min(10).max(2000),
        })
        .strict()
        .parse(req.body),
      start = new Date(data.start),
      end = new Date(data.end),
      id = randomUUID();
    if (end <= start || end - start > 86400000)
      throw new HttpError(
        400,
        "La jornada corregida debe durar entre 1 segundo y 24 horas.",
      );
    await transaction(async (cx) => {
      await cx.execute(
        "SELECT id FROM pb_users WHERE id=? AND company_id=? FOR UPDATE",
        [req.user.id, req.companyId],
      );
      const [[clock]] = await cx.query("SELECT UTC_TIMESTAMP(3) AS now");
      if (end > new Date(clock.now))
        throw new HttpError(400, "No puedes proponer marcaciones futuras");
      let original = null;
      if (data.attendanceId) {
        const [rows] = await cx.execute(
          "SELECT * FROM pb_attendance WHERE id=? AND company_id=? AND user_id=?",
          [data.attendanceId, req.companyId, req.user.id],
        );
        original = rows[0];
        if (!original) throw new HttpError(404, "Jornada no encontrada");
      }
      const [pending] = await cx.execute(
        "SELECT id FROM pb_attendance_corrections WHERE company_id=? AND user_id=? AND status='pending' AND (attendance_id=? OR (proposed_in<? AND proposed_out>?))",
        [req.companyId, req.user.id, data.attendanceId, end, start],
      );
      if (pending.length)
        throw new HttpError(
          409,
          "Ya hay una corrección pendiente para esa jornada o intervalo",
        );
      const [overlap] = await cx.execute(
        "SELECT id FROM pb_attendance WHERE company_id=? AND user_id=? AND (? IS NULL OR id<>?) AND checked_in_at<? AND COALESCE(checked_out_at,UTC_TIMESTAMP(3))>?",
        [
          req.companyId,
          req.user.id,
          data.attendanceId,
          data.attendanceId,
          end,
          start,
        ],
      );
      if (overlap.length)
        throw new HttpError(
          409,
          "La propuesta coincide con otra jornada registrada",
        );
      await cx.execute(
        "INSERT INTO pb_attendance_corrections(id,company_id,user_id,attendance_id,original_in,original_out,proposed_in,proposed_out,reason) VALUES (?,?,?,?,?,?,?,?,?)",
        [
          id,
          req.companyId,
          req.user.id,
          data.attendanceId,
          original?.checked_in_at ?? null,
          original?.checked_out_at ?? null,
          start,
          end,
          data.reason,
        ],
      );
      await notifyReviewers(
        {
          companyId: req.companyId,
          exclude: req.user.id,
          title: "Corrección de asistencia pendiente",
          body: req.user.name + " solicita revisar una jornada.",
          entityId: id,
        },
        cx,
      );
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "attendance.correction_requested",
          targetType: "correction",
          targetId: id,
        },
        cx,
      );
    });
    res.status(201).json({ id });
  }),
);
router.patch(
  "/:id/review",
  asyncHandler(async (req, res) => {
    if (!canReview(req.user.role))
      throw new HttpError(403, "Solo RH puede revisar correcciones");
    const id = idSchema.parse(req.params.id),
      data = z
        .object({
          status: z.enum(["approved", "rejected"]),
          comment: z.string().trim().min(5).max(1000),
        })
        .strict()
        .parse(req.body);
    await transaction(async (cx) => {
      const [pre] = await cx.execute(
        "SELECT user_id FROM pb_attendance_corrections WHERE id=? AND company_id=?",
        [id, req.companyId],
      );
      if (!pre.length) throw new HttpError(404, "Corrección no encontrada");
      await cx.execute(
        "SELECT id FROM pb_users WHERE id=? AND company_id=? FOR UPDATE",
        [pre[0].user_id, req.companyId],
      );
      const [[item]] = await cx.execute(
        "SELECT * FROM pb_attendance_corrections WHERE id=? AND company_id=? FOR UPDATE",
        [id, req.companyId],
      );
      if (item.user_id === req.user.id)
        throw new HttpError(403, "Otra persona debe revisar tu corrección");
      if (item.status !== "pending")
        throw new HttpError(409, "La corrección ya fue resuelta");
      let entryId = item.attendance_id;
      if (data.status === "approved") {
        if (item.original_in && !entryId)
          throw new HttpError(409, "La jornada original fue eliminada");
        if (entryId) {
          const [[current]] = await cx.execute(
            "SELECT checked_in_at,checked_out_at FROM pb_attendance WHERE id=? AND company_id=? AND user_id=? FOR UPDATE",
            [entryId, req.companyId, item.user_id],
          );
          if (
            !current ||
            !sameTime(current.checked_in_at, item.original_in) ||
            !sameTime(current.checked_out_at, item.original_out)
          )
            throw new HttpError(
              409,
              "La jornada cambió después de la solicitud. Rechaza esta propuesta y solicita una nueva.",
            );
        }
        const [overlap] = await cx.execute(
          "SELECT id FROM pb_attendance WHERE company_id=? AND user_id=? AND (? IS NULL OR id<>?) AND checked_in_at<? AND COALESCE(checked_out_at,UTC_TIMESTAMP(3))>?",
          [
            req.companyId,
            item.user_id,
            entryId,
            entryId,
            item.proposed_out,
            item.proposed_in,
          ],
        );
        if (overlap.length)
          throw new HttpError(409, "La corrección se superpone a otra jornada");
        if (entryId)
          await cx.execute(
            "UPDATE pb_attendance SET checked_in_at=?,checked_out_at=? WHERE id=? AND company_id=?",
            [item.proposed_in, item.proposed_out, entryId, req.companyId],
          );
        else {
          entryId = randomUUID();
          await cx.execute(
            "INSERT INTO pb_attendance(id,company_id,user_id,checked_in_at,checked_out_at) VALUES (?,?,?,?,?)",
            [
              entryId,
              req.companyId,
              item.user_id,
              item.proposed_in,
              item.proposed_out,
            ],
          );
        }
        await cx.execute(
          "DELETE FROM pb_attendance_punctuality WHERE attendance_id=?",
          [entryId],
        );
        await recordPunctuality(cx, {
          companyId: req.companyId,
          userId: item.user_id,
          entryId,
        });
      }
      await cx.execute(
        "UPDATE pb_attendance_corrections SET status=?,attendance_id=?,reviewer_id=?,review_comment=?,reviewed_at=UTC_TIMESTAMP(3) WHERE id=?",
        [data.status, entryId, req.user.id, data.comment, id],
      );
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "attendance.correction_" + data.status,
          targetType: "correction",
          targetId: id,
          detail: {
            original: { in: item.original_in, out: item.original_out },
            proposed: { in: item.proposed_in, out: item.proposed_out },
            comment: data.comment,
          },
        },
        cx,
      );
      await notify(
        {
          companyId: req.companyId,
          userId: item.user_id,
          title: "RH respondió tu corrección de asistencia",
          body: "Consulta la decisión en Mi perfil.",
          target: "profile",
          entityId: id,
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
    await transaction(async (cx) => {
      const [[item]] = await cx.execute(
        "SELECT status FROM pb_attendance_corrections WHERE id=? AND company_id=? AND user_id=? FOR UPDATE",
        [idSchema.parse(req.params.id), req.companyId, req.user.id],
      );
      if (!item) throw new HttpError(404, "Corrección no encontrada");
      if (item.status !== "pending")
        throw new HttpError(
          409,
          "Solo puedes cancelar una corrección pendiente",
        );
      await cx.execute(
        "UPDATE pb_attendance_corrections SET status='cancelled',reviewed_at=UTC_TIMESTAMP(3) WHERE id=?",
        [req.params.id],
      );
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "attendance.correction_cancelled",
          targetType: "correction",
          targetId: req.params.id,
        },
        cx,
      );
    });
    res.json({ ok: true });
  }),
);
export default router;
