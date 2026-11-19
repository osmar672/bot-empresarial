import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middlewares/auth.js";
import { asyncHandler } from "../middlewares/error.js";
import { many, one } from "../db/pool.js";
import { canReview } from "./vacations.routes.js";
import { HttpError } from "../utils/errors.js";
const router = Router();
router.use(authenticate, (req, _res, next) =>
  canReview(req.user.role)
    ? next()
    : next(
        new HttpError(
          403,
          "Solo RH o Administración pueden consultar el panel",
        ),
      ),
);
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        search: z.string().trim().max(120).default(""),
      })
      .parse(req.query);
    const clock = await one(
        "SELECT DATE_FORMAT(UTC_TIMESTAMP()-INTERVAL 6 HOUR,'%Y-%m-%d') AS today,TIME(UTC_TIMESTAMP()-INTERVAL 6 HOUR) AS now_time,WEEKDAY(UTC_TIMESTAMP()-INTERVAL 6 HOUR)+1 AS weekday",
      ),
      company = req.companyId;
    const holiday = Boolean(
      await one("SELECT id FROM pb_holidays WHERE company_id=? AND day=?", [
        company,
        clock.today,
      ]),
    );
    const pending = await one(
      "SELECT COUNT(*) AS pending FROM pb_vacation_requests WHERE company_id=? AND status='pending'",
      [company],
    );
    const joins = `FROM pb_users u LEFT JOIN pb_employee_profiles p ON p.user_id=u.id AND p.company_id=u.company_id LEFT JOIN pb_work_schedules s ON s.user_id=u.id AND s.company_id=u.company_id AND s.day_of_week=? LEFT JOIN (SELECT user_id,MIN(checked_in_at) AS first_in FROM pb_attendance WHERE company_id=? AND DATE(checked_in_at-INTERVAL 6 HOUR)=? GROUP BY user_id) a ON a.user_id=u.id`;
    const fields = `u.id,u.name,u.email,u.role,p.job_title,p.department,p.vacation_days,s.state AS schedule_state,s.start_time,s.end_time,s.updated_at AS schedule_updated_at,a.first_in,(SELECT p2.is_punctual FROM pb_attendance_punctuality p2 JOIN pb_attendance a2 ON a2.id=p2.attendance_id WHERE p2.user_id=u.id AND p2.company_id=u.company_id AND a2.checked_in_at=a.first_in LIMIT 1) AS recorded_punctual,EXISTS(SELECT 1 FROM pb_vacation_requests v WHERE v.company_id=u.company_id AND v.user_id=u.id AND v.status='approved' AND ? BETWEEN v.start_date AND v.end_date) AS on_vacation`;
    const all = await many(
      `SELECT ${fields} ${joins} WHERE u.company_id=? ORDER BY u.name`,
      [clock.today, clock.weekday, company, clock.today, company],
    );
    const classified = all.map((u) => {
      let status = "Sin horario";
      if (u.on_vacation) status = "De vacaciones";
      else if (holiday || u.schedule_state === "descanso") status = "Descanso";
      else if (u.start_time) {
        if (u.first_in) {
          const local = new Date(new Date(u.first_in).getTime() - 6 * 3600000)
            .toISOString()
            .slice(11, 19);
          status =
            u.recorded_punctual != null
              ? u.recorded_punctual
                ? "Puntual"
                : "Tarde"
              : u.schedule_updated_at &&
                  new Date(u.schedule_updated_at) > new Date(u.first_in)
                ? "Horario actualizado"
                : local <= u.start_time
                  ? "Puntual"
                  : "Tarde";
        } else
          status =
            u.schedule_updated_at &&
            new Date(u.schedule_updated_at) >
              new Date(clock.today + "T" + u.start_time + "-06:00")
              ? "Horario actualizado"
              : clock.now_time > u.start_time
                ? "Sin entrada"
                : "Por iniciar";
      }
      return { ...u, today_status: status };
    });
    const filtered = classified.filter((u) =>
        (u.name + " " + u.email + " " + (u.department || ""))
          .toLocaleLowerCase("es")
          .includes(q.search.toLocaleLowerCase("es")),
      ),
      page = Math.min(q.page, Math.max(1, Math.ceil(filtered.length / 20)));
    res.json({
      today: clock.today,
      holiday,
      page,
      total: filtered.length,
      people: filtered.slice((page - 1) * 20, page * 20),
      summary: {
        people: all.length,
        pending: pending.pending,
        punctual: classified.filter((u) => u.today_status === "Puntual").length,
        late: classified.filter((u) => u.today_status === "Tarde").length,
        withoutEntry: classified.filter((u) => u.today_status === "Sin entrada")
          .length,
        onVacation: classified.filter((u) => u.on_vacation).length,
        vacationDays: all.reduce((n, u) => n + Number(u.vacation_days || 0), 0),
      },
    });
  }),
);
export default router;
