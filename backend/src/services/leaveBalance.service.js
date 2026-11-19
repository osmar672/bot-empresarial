import { randomUUID } from "node:crypto";
import { one, many, transaction } from "../db/pool.js";
import { HttpError } from "../utils/errors.js";
import { audit } from "./activity.service.js";
export const defaultLeavePolicy = () => ({
  automatic: false,
  count_mode: "schedule",
  weekdays: [1, 2, 3, 4, 5],
});
export async function leavePolicy(companyId, cx = null) {
  const sql =
    "SELECT automatic,count_mode,weekdays FROM pb_leave_policy WHERE company_id=?";
  const row = cx
    ? (await cx.execute(sql, [companyId]))[0][0]
    : await one(sql, [companyId]);
  if (!row) return defaultLeavePolicy();
  return {
    ...row,
    automatic: Boolean(row.automatic),
    weekdays:
      typeof row.weekdays === "string"
        ? JSON.parse(row.weekdays)
        : row.weekdays,
  };
}
export function countWorkingDays(start, end, { weekdays, holidays = [] }) {
  const first = new Date(start + "T12:00:00Z"),
    last = new Date(end + "T12:00:00Z"),
    span = (last - first) / 86400000;
  if (!Number.isInteger(span) || span < 0 || span > 365)
    throw new HttpError(400, "El intervalo debe ser de hasta 366 días");
  const excluded = new Set(holidays),
    working = new Set(weekdays),
    dates = [];
  for (let i = 0; i <= span; i++) {
    const date = new Date(first.getTime() + i * 86400000),
      day = date.toISOString().slice(0, 10),
      weekday = ((date.getUTCDay() + 6) % 7) + 1;
    if (working.has(weekday) && !excluded.has(day)) dates.push(day);
  }
  return { days: dates.length, dates };
}
export async function businessDays(companyId, userId, start, end, cx = null) {
  const policy = await leavePolicy(companyId, cx);
  let weekdays = policy.weekdays;
  const query = async (sql, args) =>
    cx ? (await cx.execute(sql, args))[0] : many(sql, args);
  if (policy.count_mode === "schedule") {
    const schedule = await query(
      "SELECT day_of_week,state FROM pb_work_schedules WHERE company_id=? AND user_id=?",
      [companyId, userId],
    );
    if (new Set(schedule.map((s) => s.day_of_week)).size !== 7)
      throw new HttpError(
        409,
        "RH debe asignar el horario semanal completo o configurar los días laborables de la empresa.",
      );
    weekdays = schedule
      .filter((s) => s.state === "laboral")
      .map((s) => s.day_of_week);
  }
  const holidays = await query(
    "SELECT DATE_FORMAT(day,'%Y-%m-%d') AS day FROM pb_holidays WHERE company_id=? AND day BETWEEN ? AND ?",
    [companyId, start, end],
  );
  return {
    ...countWorkingDays(start, end, {
      weekdays,
      holidays: holidays.map((h) => h.day),
    }),
    policy,
  };
}
export async function debitVacation(
  cx,
  { companyId, userId, requestId, start, end, actorId },
) {
  const policy = await leavePolicy(companyId, cx);
  if (!policy.automatic) return null;
  const result = await businessDays(companyId, userId, start, end, cx);
  if (!result.days)
    throw new HttpError(
      400,
      "La solicitud no incluye días laborables según la regla configurada.",
    );
  const [profiles] = await cx.execute(
    "SELECT vacation_days FROM pb_employee_profiles WHERE company_id=? AND user_id=? FOR UPDATE",
    [companyId, userId],
  );
  if (!profiles.length || profiles[0].vacation_days == null)
    throw new HttpError(
      409,
      "RH debe registrar el saldo disponible antes de aprobar con descuento automático.",
    );
  const available = Number(profiles[0].vacation_days);
  if (available < result.days)
    throw new HttpError(
      409,
      "Saldo insuficiente: hay " +
        available +
        " días disponibles y esta solicitud requiere " +
        result.days +
        ".",
    );
  const balance = available - result.days;
  await cx.execute(
    "UPDATE pb_employee_profiles SET vacation_days=? WHERE company_id=? AND user_id=?",
    [balance, companyId, userId],
  );
  await cx.execute(
    "INSERT INTO pb_leave_ledger(id,company_id,user_id,request_id,kind,days_delta,balance_after,note,actor_id) VALUES (?,?,?,?,'debit',?,?,?,?)",
    [
      randomUUID(),
      companyId,
      userId,
      requestId,
      -result.days,
      balance,
      "Descuento de vacaciones aprobadas",
      actorId,
    ],
  );
  return { days: result.days, balance };
}
export async function setLeaveBalance(
  { companyId, userId, value, note, actorId },
  cx = null,
) {
  const apply = async (db) => {
    const [users] = await db.execute(
      "SELECT id FROM pb_users WHERE company_id=? AND id=? FOR UPDATE",
      [companyId, userId],
    );
    if (!users.length) throw new HttpError(404, "Colaborador no encontrado");
    const [profiles] = await db.execute(
      "SELECT vacation_days FROM pb_employee_profiles WHERE company_id=? AND user_id=? FOR UPDATE",
      [companyId, userId],
    );
    const old = profiles[0]?.vacation_days;
    await db.execute(
      "INSERT INTO pb_employee_profiles(user_id,company_id,vacation_days) VALUES (?,?,?) ON DUPLICATE KEY UPDATE vacation_days=VALUES(vacation_days)",
      [userId, companyId, value],
    );
    if (old == null || Number(old) !== value) {
      await db.execute(
        "INSERT INTO pb_leave_ledger(id,company_id,user_id,kind,days_delta,balance_after,note,actor_id) VALUES (?,?,?,?,?,?,?,?)",
        [
          randomUUID(),
          companyId,
          userId,
          old == null ? "opening" : "adjustment",
          value - Number(old || 0),
          value,
          note,
          actorId,
        ],
      );
      await audit(
        {
          companyId,
          actorId,
          action: "vacations.balance_adjusted",
          targetType: "user",
          targetId: userId,
          detail: { days: value, note },
        },
        db,
      );
    }
  };
  return cx ? apply(cx) : transaction(apply);
}
