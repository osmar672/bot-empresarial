import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authenticate } from "../middlewares/auth.js";
import { asyncHandler } from "../middlewares/error.js";
import { many, one, transaction } from "../db/pool.js";
import { canReview } from "./vacations.routes.js";
import { HttpError } from "../utils/errors.js";
import { idSchema } from "../utils/validation.js";
import { audit } from "../services/activity.service.js";
const router = Router();
router.use(authenticate);
router.get(
  "/people",
  asyncHandler(async (req, res) => {
    if (!canReview(req.user.role))
      throw new HttpError(
        403,
        "Solo RH puede consultar los horarios del equipo",
      );
    res.json({
      people: await many(
        "SELECT id,name FROM pb_users WHERE company_id=? ORDER BY name LIMIT 1000",
        [req.companyId],
      ),
    });
  }),
);
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        from: z.string().date(),
        to: z.string().date(),
        userId: z.string().uuid().optional(),
      })
      .strict()
      .parse(req.query);
    const span = (new Date(q.to) - new Date(q.from)) / 86400000;
    if (span < 0 || span > 92)
      throw new HttpError(400, "Selecciona un intervalo de hasta 93 días");
    const selected = q.userId || req.user.id;
    if (selected !== req.user.id && !canReview(req.user.role))
      throw new HttpError(403, "Solo puedes consultar tu propio turno");
    if (
      !(await one("SELECT id FROM pb_users WHERE id=? AND company_id=?", [
        selected,
        req.companyId,
      ]))
    )
      throw new HttpError(404, "Colaborador no encontrado");
    const holidays = await many(
      "SELECT id,DATE_FORMAT(day,'%Y-%m-%d') AS day,title FROM pb_holidays WHERE company_id=? AND day BETWEEN ? AND ? ORDER BY day",
      [req.companyId, q.from, q.to],
    );
    const vacations = await many(
      "SELECT v.id,v.user_id,u.name,DATE_FORMAT(v.start_date,'%Y-%m-%d') AS start_date,DATE_FORMAT(v.end_date,'%Y-%m-%d') AS end_date,v.status FROM pb_vacation_requests v JOIN pb_users u ON u.id=v.user_id AND u.company_id=v.company_id WHERE v.company_id=? AND v.start_date<=? AND v.end_date>=? AND v.status IN ('pending','approved') AND (v.status='approved' OR v.user_id=? OR ?=1) ORDER BY v.start_date,u.name",
      [
        req.companyId,
        q.to,
        q.from,
        req.user.id,
        canReview(req.user.role) ? 1 : 0,
      ],
    );
    const schedule = await many(
      "SELECT day_of_week,start_time,end_time,state FROM pb_work_schedules WHERE company_id=? AND user_id=? ORDER BY day_of_week",
      [req.companyId, selected],
    );
    res.json({
      holidays,
      vacations,
      schedule,
      selectedUser: selected,
      canManage: canReview(req.user.role),
    });
  }),
);
router.post(
  "/holidays",
  asyncHandler(async (req, res) => {
    if (!canReview(req.user.role))
      throw new HttpError(403, "Solo RH puede gestionar feriados");
    const data = z
        .object({
          day: z.string().date(),
          title: z.string().trim().min(3).max(120),
        })
        .strict()
        .parse(req.body),
      id = randomUUID();
    await transaction(async (cx) => {
      await cx.execute(
        "INSERT INTO pb_holidays(id,company_id,day,title,created_by) VALUES (?,?,?,?,?)",
        [id, req.companyId, data.day, data.title, req.user.id],
      );
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "calendar.holiday_created",
          targetType: "holiday",
          targetId: id,
          detail: data,
        },
        cx,
      );
    });
    res.status(201).json({ id });
  }),
);
router.delete(
  "/holidays/:id",
  asyncHandler(async (req, res) => {
    if (!canReview(req.user.role))
      throw new HttpError(403, "Solo RH puede gestionar feriados");
    const id = idSchema.parse(req.params.id);
    await transaction(async (cx) => {
      const [rows] = await cx.execute(
        "SELECT title FROM pb_holidays WHERE id=? AND company_id=? FOR UPDATE",
        [id, req.companyId],
      );
      if (!rows.length) throw new HttpError(404, "Feriado no encontrado");
      await cx.execute("DELETE FROM pb_holidays WHERE id=? AND company_id=?", [
        id,
        req.companyId,
      ]);
      await audit(
        {
          companyId: req.companyId,
          actorId: req.user.id,
          action: "calendar.holiday_deleted",
          targetType: "holiday",
          targetId: id,
          detail: { title: rows[0].title },
        },
        cx,
      );
    });
    res.json({ ok: true });
  }),
);
export default router;
