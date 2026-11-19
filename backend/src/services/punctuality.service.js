import { many, one } from "../db/pool.js";
const DAY = 86400000;
const dayOf = (date) =>
  new Date(new Date(date).getTime() - 6 * 3600000).toISOString().slice(0, 10);
const utcStart = (day, time) =>
  new Date(day + "T" + String(time).slice(0, 8) + "-06:00");
const weekday = (day) =>
  ((new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7) + 1;
const previous = (day) =>
  new Date(new Date(day + "T12:00:00Z").getTime() - DAY)
    .toISOString()
    .slice(0, 10);
export function expectedShift(days, checkedIn) {
  const date = new Date(checkedIn),
    day = dayOf(date),
    today = days.find((s) => s.day_of_week === weekday(day)),
    prior = days.find((s) => s.day_of_week === weekday(previous(day)));
  if (
    prior?.state === "laboral" &&
    prior.start_time &&
    prior.end_time &&
    prior.end_time < prior.start_time &&
    date <= utcStart(day, prior.end_time)
  )
    return utcStart(previous(day), prior.start_time);
  return today?.state === "laboral" && today.start_time
    ? utcStart(day, today.start_time)
    : null;
}
export async function recordPunctuality(cx, { companyId, userId, entryId }) {
  const [[entry]] = await cx.execute(
    "SELECT checked_in_at FROM pb_attendance WHERE id=? AND company_id=? AND user_id=?",
    [entryId, companyId, userId],
  );
  const [days] = await cx.execute(
    "SELECT day_of_week,start_time,end_time,state,updated_at FROM pb_work_schedules WHERE company_id=? AND user_id=?",
    [companyId, userId],
  );
  const expected = expectedShift(days, entry.checked_in_at);
  if(expected){const assigned=days.find(d=>d.day_of_week===weekday(dayOf(expected)));if(assigned?.updated_at&&new Date(assigned.updated_at)>expected)return;const [holidays]=await cx.execute('SELECT id FROM pb_holidays WHERE company_id=? AND day=?',[companyId,dayOf(expected)]);if(holidays.length)return;}
  if (expected)
    await cx.execute(
      "INSERT INTO pb_attendance_punctuality(attendance_id,user_id,company_id,expected_at,is_punctual) VALUES (?,?,?,?,?)",
      [
        entryId,
        userId,
        companyId,
        expected,
        new Date(entry.checked_in_at) <= expected,
      ],
    );
}
export function calculateStreak({
  days,
  entries,
  vacations = [],
  now = new Date(),
}) {
  const today = dayOf(now),
    first = new Date(today + "T12:00:00Z").getTime() - 364 * DAY;
  const records = new Map();
  for (const entry of entries) {
    const day = dayOf(entry.expected_at || entry.checked_in_at);
    if (
      !records.has(day) ||
      new Date(entry.checked_in_at) < new Date(records.get(day).checked_in_at)
    )
      records.set(day, entry);
  }
  let current = 0,
    best = 0,
    onTimeDays = 0,
    evaluatedDays = 0;
  const recent = [];
  for (let i = 0; i < 365; i++) {
    const day = new Date(first + i * DAY).toISOString().slice(0, 10),
      entry = records.get(day),
      shift = days.find((s) => s.day_of_week === weekday(day));
    if (vacations.some((v) => day >= v.start_date && day <= v.end_date))
      continue;
    let expected = entry?.expected_at
      ? new Date(entry.expected_at)
      : shift?.state === "laboral" && shift.start_time
        ? utcStart(day, shift.start_time)
        : null;
    if (!expected) continue;
    // Do not apply today's schedule retroactively to dates before it was assigned/edited.
    if (
      !entry?.expected_at &&
      (!shift.updated_at || new Date(shift.updated_at) > expected)
    ) {
      current = 0;
      continue;
    }
    if (day === today && !entry && new Date(now) <= expected) continue;
    const punctual =
      entry &&
      (entry.expected_at
        ? Boolean(entry.is_punctual)
        : new Date(entry.checked_in_at) <= expected);
    evaluatedDays++;
    if (punctual) {
      current++;
      onTimeDays++;
      best = Math.max(best, current);
    } else current = 0;
    recent.push({ date: day, punctual: Boolean(punctual) });
  }
  return {
    current,
    best,
    onTimeDays,
    evaluatedDays,
    configured:
      days.some((d) => d.state === "laboral" && d.start_time) ||
      entries.some((e) => e.expected_at),
    periodDays: 365,
    recent: recent.slice(-7),
  };
}
export async function getPunctuality(companyId, userId) {
  const [days, entries, vacations, clock, holidays] = await Promise.all([
    many(
      "SELECT day_of_week,start_time,end_time,state,updated_at FROM pb_work_schedules WHERE company_id=? AND user_id=?",
      [companyId, userId],
    ),
    many(
      "SELECT a.checked_in_at,p.expected_at,p.is_punctual FROM pb_attendance a LEFT JOIN pb_attendance_punctuality p ON p.attendance_id=a.id AND p.company_id=a.company_id AND p.user_id=a.user_id WHERE a.company_id=? AND a.user_id=? AND a.checked_in_at>=UTC_TIMESTAMP()-INTERVAL 366 DAY ORDER BY a.checked_in_at",
      [companyId, userId],
    ),
    many(
      "SELECT DATE_FORMAT(start_date,'%Y-%m-%d') AS start_date,DATE_FORMAT(end_date,'%Y-%m-%d') AS end_date FROM pb_vacation_requests WHERE company_id=? AND user_id=? AND status='approved'",
      [companyId, userId],
    ),
    one("SELECT UTC_TIMESTAMP(3) AS now"),
    many("SELECT DATE_FORMAT(day,'%Y-%m-%d') AS day FROM pb_holidays WHERE company_id=?",[companyId]),
  ]);
  return calculateStreak({ days, entries, vacations:[...vacations,...holidays.map(h=>({start_date:h.day,end_date:h.day}))], now: clock.now });
}
