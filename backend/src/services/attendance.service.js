import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { one, many, run, transaction } from '../db/pool.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/errors.js';

export const TIMEZONE = 'America/Costa_Rica';

export const INCIDENT_TYPES = {
  incapacidad_medica: 'Incapacidad médica',
  cita_medica: 'Cita médica',
  emergencia_medica: 'Emergencia médica',
  fallecimiento_familiar: 'Fallecimiento de un familiar',
  emergencia_familiar: 'Emergencia familiar grave',
  accidente: 'Accidente',
  fuerza_mayor: 'Problema de fuerza mayor',
  otro: 'Otra circunstancia excepcional'
};

export const ATTENDANCE_STATUSES = {
  a_tiempo: 'A tiempo',
  tarde: 'Tarde',
  tarde_justificada: 'Tarde justificada',
  ausencia: 'Ausencia',
  ausencia_justificada: 'Ausencia justificada',
  justificacion_pendiente: 'Justificación pendiente',
  jornada_incompleta: 'Jornada incompleta'
};

export const canReview = role => role === 'admin' || role === 'rrhh' || role.startsWith('rrhh_');

/**
 * Valida la firma binaria real (magic bytes) de un comprobante subido (PDF, PNG, JPG/JPEG).
 */
export async function validateFileSignature(filePath, originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  const handle = await fs.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(8);
    const { bytesRead } = await handle.read(buf, 0, 8, 0);
    if (bytesRead < 4) {
      throw new HttpError(415, 'El archivo adjunto está vacío o dañado.');
    }

    const isPdf = buf.slice(0, 5).toString('ascii') === '%PDF-';
    const isPng =
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47;
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

    if (ext === '.pdf' && isPdf) return 'application/pdf';
    if (ext === '.png' && isPng) return 'image/png';
    if ((ext === '.jpg' || ext === '.jpeg') && isJpeg) return 'image/jpeg';

    throw new HttpError(
      415,
      'El contenido real del archivo no coincide con un formato válido (PDF, PNG, JPG o JPEG).'
    );
  } finally {
    await handle.close();
  }
}

/**
 * Obtiene fecha y hora actual en Costa Rica y día de la semana (1=Lunes .. 7=Domingo).
 */
export function getCostaRicaDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const dateStr = `${map.year}-${map.month}-${map.day}`;
  const timeStr = `${map.hour}:${map.minute}:${map.second}`;

  const dayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, weekday: 'short' });
  const weekdayShort = dayFormatter.format(date);
  const weekdayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const dayOfWeek = weekdayMap[weekdayShort] || 1;

  return { dateStr, timeStr, dayOfWeek };
}

/**
 * Compara dos cadenas de tiempo 'HH:MM:SS' considerando minutos de tolerancia.
 * Retorna true si checkIn <= scheduledStart + toleranceMinutes.
 */
export function isCheckInOnTime(checkInTimeStr, scheduledStartTimeStr, toleranceMinutes = 0) {
  if (!scheduledStartTimeStr) return true;
  const parseSeconds = str => {
    const [h, m, s] = str.split(':').map(Number);
    return (h * 3600) + (m * 60) + (s || 0);
  };
  const checkInSec = parseSeconds(checkInTimeStr);
  const scheduledSec = parseSeconds(scheduledStartTimeStr);
  const limitSec = scheduledSec + (toleranceMinutes * 60);

  return checkInSec <= limitSec;
}

/**
 * Obtiene la configuración de tolerancia para una empresa.
 */
export async function getCompanyAttendanceSettings(companyId) {
  const row = await one('SELECT tolerance_minutes, timezone FROM pb_attendance_settings WHERE company_id = ?', [companyId]);
  return {
    toleranceMinutes: Number(row?.tolerance_minutes || 0),
    timezone: row?.timezone || TIMEZONE
  };
}

/**
 * Actualiza la tolerancia de entrada para una empresa (con auditoría).
 */
export async function updateCompanyAttendanceSettings(companyId, actorId, { toleranceMinutes }) {
  const prev = await getCompanyAttendanceSettings(companyId);
  const tolerance = Math.max(0, Math.min(60, Number(toleranceMinutes || 0)));

  await run(
    `INSERT INTO pb_attendance_settings (company_id, tolerance_minutes, timezone, updated_by, updated_at)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE tolerance_minutes = VALUES(tolerance_minutes), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)`,
    [companyId, tolerance, TIMEZONE, actorId]
  );

  await logAttendanceAudit({
    companyId,
    actorUserId: actorId,
    action: 'update_attendance_settings',
    entityType: 'pb_attendance_settings',
    entityId: companyId,
    previousValue: prev,
    newValue: { toleranceMinutes: tolerance, timezone: TIMEZONE },
    reason: `Tolerancia actualizada a ${tolerance} minutos`
  });

  return { toleranceMinutes: tolerance, timezone: TIMEZONE };
}

/**
 * Registra una acción en la tabla de auditoría.
 */
export async function logAttendanceAudit({
  companyId,
  actorUserId,
  action,
  entityType,
  entityId,
  previousValue = null,
  newValue = null,
  reason = null
}) {
  const id = randomUUID();
  await run(
    `INSERT INTO pb_attendance_audit (id, company_id, actor_user_id, action, entity_type, entity_id, previous_value, new_value, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
    [
      id,
      companyId,
      actorUserId,
      action,
      entityType,
      entityId,
      previousValue ? JSON.stringify(previousValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      reason
    ]
  );
  return id;
}

/**
 * Consulta el historial de auditoría y decisiones de la empresa.
 */
export async function getAttendanceAuditLog(companyId, { limit = 50 } = {}) {
  const logs = await many(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.previous_value, a.new_value,
            a.reason, a.created_at, u.name AS actor_name, u.email AS actor_email, u.role AS actor_role
     FROM pb_attendance_audit a
     JOIN pb_users u ON u.id = a.actor_user_id
     WHERE a.company_id = ?
     ORDER BY a.created_at DESC
     LIMIT ?`,
    [companyId, Number(limit)]
  );
  return { logs };
}

/**
 * Consulta el horario programado para un usuario en una fecha específica (o hoy).
 */
export async function getUserScheduleForDate(companyId, userId, date = new Date()) {
  const { dateStr, timeStr, dayOfWeek } = getCostaRicaDateParts(date);
  const schedule = await one(
    `SELECT id, day_of_week, day_name, start_time, end_time, break_start_time, break_end_time, state, shift_name
     FROM pb_work_schedules
     WHERE company_id = ? AND user_id = ? AND day_of_week = ?`,
    [companyId, userId, dayOfWeek]
  );

  return {
    dateStr,
    timeStr,
    dayOfWeek,
    schedule: schedule || null
  };
}

/**
 * Registra la entrada (check-in) determinando automáticamente puntualidad y horario.
 */
export async function checkInEmployee(req) {
  const companyId = req.companyId;
  const userId = req.user.id;

  return transaction(async cx => {
    // Bloquear concurrencia a nivel de usuario
    const [users] = await cx.execute(
      'SELECT id, role FROM pb_users WHERE id = ? AND company_id = ? FOR UPDATE',
      [userId, companyId]
    );
    if (!users.length) throw new HttpError(401, 'Usuario no encontrado');

    const [open] = await cx.execute(
      'SELECT id FROM pb_attendance WHERE company_id = ? AND user_id = ? AND checked_in_at IS NOT NULL AND checked_out_at IS NULL FOR UPDATE',
      [companyId, userId]
    );
    if (open.length) {
      throw new HttpError(409, 'Ya tienes una entrada registrada. Marca la salida antes de iniciar otra jornada.');
    }

    const { dateStr, timeStr, dayOfWeek } = getCostaRicaDateParts();

    // Obtener horario programado para el día de hoy
    const [schedules] = await cx.execute(
      `SELECT id, start_time, end_time, state, shift_name
       FROM pb_work_schedules
       WHERE company_id = ? AND user_id = ? AND day_of_week = ?`,
      [companyId, userId, dayOfWeek]
    );
    const schedule = schedules[0] || null;

    // Obtener tolerancia
    const [settings] = await cx.execute(
      'SELECT tolerance_minutes FROM pb_attendance_settings WHERE company_id = ?',
      [companyId]
    );
    const tolerance = Number(settings[0]?.tolerance_minutes || 0);

    let punctuality = 'no_aplica';
    let attendanceStatus = 'a_tiempo';
    let scheduledStart = null;
    let scheduledEnd = null;
    let scheduleId = null;

    if (schedule) {
      scheduleId = schedule.id;
      scheduledStart = schedule.start_time;
      scheduledEnd = schedule.end_time;

      if (schedule.state === 'laboral' && schedule.start_time) {
        const onTime = isCheckInOnTime(timeStr, schedule.start_time, tolerance);
        punctuality = onTime ? 'a_tiempo' : 'tarde';
        attendanceStatus = onTime ? 'a_tiempo' : 'tarde';
      }
    }

    const id = randomUUID();
    await cx.execute(
      `INSERT INTO pb_attendance (
         id, company_id, user_id, checked_in_at, work_date,
         schedule_id, scheduled_start_time, scheduled_end_time,
         punctuality_status, attendance_status, created_at
       ) VALUES (?, ?, ?, UTC_TIMESTAMP(3), ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
      [
        id,
        companyId,
        userId,
        dateStr,
        scheduleId,
        scheduledStart,
        scheduledEnd,
        punctuality,
        attendanceStatus
      ]
    );

    return {
      ok: true,
      id,
      punctualityStatus: punctuality,
      attendanceStatus,
      scheduledStartTime: scheduledStart,
      scheduledEndTime: scheduledEnd,
      checkInTime: timeStr,
      workDate: dateStr
    };
  });
}

/**
 * Registra la salida (check-out) con duración de jornada.
 */
export async function checkOutEmployee(req, entryId = null) {
  const companyId = req.companyId;
  const userId = req.user.id;

  return transaction(async cx => {
    const [users] = await cx.execute(
      'SELECT id FROM pb_users WHERE id = ? AND company_id = ? FOR UPDATE',
      [userId, companyId]
    );
    if (!users.length) throw new HttpError(401, 'Usuario no encontrado');

    const [open] = await cx.execute(
      'SELECT id, checked_in_at, work_date FROM pb_attendance WHERE company_id = ? AND user_id = ? AND checked_in_at IS NOT NULL AND checked_out_at IS NULL FOR UPDATE',
      [companyId, userId]
    );
    if (!open.length) {
      throw new HttpError(409, 'No tienes una jornada abierta. Primero debes marcar la entrada.');
    }

    const currentOpen = open[0];
    if (entryId && entryId !== currentOpen.id) {
      throw new HttpError(409, 'La jornada cambió en otra ventana. Actualiza la vista y confirma de nuevo la salida.');
    }

    await cx.execute(
      `UPDATE pb_attendance
       SET checked_out_at = UTC_TIMESTAMP(3),
           duration_seconds = TIMESTAMPDIFF(SECOND, checked_in_at, UTC_TIMESTAMP(3)),
           updated_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND company_id = ? AND user_id = ? AND checked_out_at IS NULL`,
      [currentOpen.id, companyId, userId]
    );

    return {
      ok: true,
      id: currentOpen.id
    };
  });
}

/**
 * Obtiene el estado actual de la jornada, marcaciones recientes y horario de hoy.
 */
export async function getAttendanceCurrentState(companyId, userId) {
  const params = [companyId, userId];
  const { dayOfWeek } = getCostaRicaDateParts();

  const [openEntry, entries, clock, schedule, settings] = await Promise.all([
    one(
      `SELECT a.id, a.checked_in_at, a.work_date, a.scheduled_start_time, a.scheduled_end_time,
              a.punctuality_status, a.attendance_status, s.shift_name
       FROM pb_attendance a
       LEFT JOIN pb_work_schedules s ON s.id = a.schedule_id
       WHERE a.company_id = ? AND a.user_id = ? AND a.checked_in_at IS NOT NULL AND a.checked_out_at IS NULL`,
      params
    ),
    many(
      `SELECT a.id, a.checked_in_at, a.checked_out_at, a.work_date,
              a.scheduled_start_time, a.scheduled_end_time,
              a.punctuality_status, a.attendance_status,
              TIMESTAMPDIFF(SECOND, a.checked_in_at, COALESCE(a.checked_out_at, UTC_TIMESTAMP(3))) AS duration_seconds,
              s.shift_name
       FROM pb_attendance a
       LEFT JOIN pb_work_schedules s ON s.id = a.schedule_id
       WHERE a.company_id = ? AND a.user_id = ? AND a.checked_in_at IS NOT NULL
       ORDER BY a.checked_in_at DESC, a.id DESC
       LIMIT 30`,
      params
    ),
    one('SELECT UTC_TIMESTAMP(3) AS server_time'),
    one(
      `SELECT id, day_of_week, day_name, start_time, end_time, break_start_time, break_end_time, state, shift_name
       FROM pb_work_schedules
       WHERE company_id = ? AND user_id = ? AND day_of_week = ?`,
      [companyId, userId, dayOfWeek]
    ),
    getCompanyAttendanceSettings(companyId)
  ]);

  return {
    openEntry: openEntry || null,
    entries: entries || [],
    serverTime: clock.server_time,
    todaySchedule: schedule || null,
    settings
  };
}

/**
 * Consulta el historial de marcaciones del usuario con filtros y estado de justificaciones.
 */
export async function getAttendanceHistory(companyId, userId, { from, to, weekday, status, page = 1, pageSize = 20 }) {
  const clauses = ['a.company_id = ?', 'a.user_id = ?'];
  const params = [companyId, userId];

  if (from) {
    clauses.push('COALESCE(a.work_date, DATE(DATE_SUB(a.checked_in_at, INTERVAL 6 HOUR))) >= ?');
    params.push(from);
  }
  if (to) {
    clauses.push('COALESCE(a.work_date, DATE(DATE_SUB(a.checked_in_at, INTERVAL 6 HOUR))) <= ?');
    params.push(to);
  }
  if (weekday !== undefined && weekday !== '') {
    clauses.push('WEEKDAY(DATE_SUB(COALESCE(a.checked_in_at, CONVERT_TZ(CONCAT(a.work_date," 12:00:00"),"-06:00","+00:00")), INTERVAL 6 HOUR)) = ?');
    params.push(Number(weekday));
  }
  if (status) {
    clauses.push('a.attendance_status = ?');
    params.push(status);
  }

  const where = clauses.join(' AND ');
  const totalRow = await one(`SELECT COUNT(*) AS total FROM pb_attendance a WHERE ${where}`, params);
  const total = Number(totalRow?.total || 0);

  const offset = (page - 1) * pageSize;
  const entries = await many(
    `SELECT a.id, a.work_date, a.checked_in_at, a.checked_out_at,
            a.scheduled_start_time, a.scheduled_end_time,
            a.punctuality_status, a.attendance_status,
            a.duration_seconds, a.is_demo,
            s.shift_name,
            j.id AS justification_id, j.status AS justification_status,
            j.incident_type AS justification_incident_type,
            j.review_comment AS justification_review_comment
     FROM pb_attendance a
     LEFT JOIN pb_work_schedules s ON s.id = a.schedule_id
     LEFT JOIN pb_attendance_justifications j ON j.attendance_id = a.id
     WHERE ${where}
     ORDER BY COALESCE(a.work_date, DATE(DATE_SUB(a.checked_in_at, INTERVAL 6 HOUR))) DESC, a.checked_in_at DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return {
    entries: entries.map(entry => {
      // Si está sin marcar salida y la fecha de jornada es anterior a hoy, indicar jornada incompleta
      const isPastDay = entry.work_date && entry.work_date < getCostaRicaDateParts().dateStr;
      let effectiveStatus = entry.attendance_status;
      if (!entry.checked_out_at && entry.checked_in_at && isPastDay && effectiveStatus === 'a_tiempo') {
        effectiveStatus = 'jornada_incompleta';
      }
      return {
        ...entry,
        attendance_status: effectiveStatus,
        duration_seconds: entry.duration_seconds != null
          ? entry.duration_seconds
          : (entry.checked_in_at && entry.checked_out_at
            ? Math.floor((new Date(entry.checked_out_at) - new Date(entry.checked_in_at)) / 1000)
            : null)
      };
    }),
    total,
    page: Number(page),
    pageSize
  };
}

/**
 * Presenta una justificación con o sin comprobante adjunto.
 */
export async function submitJustification({
  companyId,
  userId,
  attendanceId = null,
  incidentType,
  incidentDate,
  incidentTime = null,
  startDate,
  endDate = null,
  description,
  comments = null,
  file = null
}) {
  let verifiedMime = null;
  if (file) {
    verifiedMime = await validateFileSignature(file.path, file.originalname);
  }

  return transaction(async cx => {
    let attendance = null;
    if (attendanceId) {
      const [rows] = await cx.execute(
        'SELECT id, attendance_status, punctuality_status FROM pb_attendance WHERE id = ? AND company_id = ? AND user_id = ? FOR UPDATE',
        [attendanceId, companyId, userId]
      );
      if (!rows.length) throw new HttpError(404, 'Marcación de asistencia no encontrada');
      attendance = rows[0];
    } else if (incidentDate) {
      // Si no se especificó attendanceId, buscar si existe una marcación o ausencia en esa fecha
      const [rows] = await cx.execute(
        `SELECT id, attendance_status, punctuality_status
         FROM pb_attendance
         WHERE company_id = ? AND user_id = ? AND (
           work_date = ? OR DATE(DATE_SUB(checked_in_at, INTERVAL 6 HOUR)) = ?
         )
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [companyId, userId, incidentDate, incidentDate]
      );
      if (rows.length) {
        attendance = rows[0];
      } else {
        // Crear registro de jornada asociada en estado justificacion_pendiente para trazabilidad
        const dateObj = new Date(incidentDate + 'T12:00:00Z');
        const { dayOfWeek } = getCostaRicaDateParts(dateObj);
        const [schedRows] = await cx.execute(
          'SELECT id, start_time, end_time FROM pb_work_schedules WHERE company_id = ? AND user_id = ? AND day_of_week = ?',
          [companyId, userId, dayOfWeek]
        );
        const sched = schedRows[0] || null;
        const newAttId = randomUUID();
        await cx.execute(
          `INSERT INTO pb_attendance (
             id, company_id, user_id, checked_in_at, checked_out_at,
             work_date, schedule_id, scheduled_start_time, scheduled_end_time,
             punctuality_status, attendance_status, created_at
           ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, 'no_aplica', 'justificacion_pendiente', UTC_TIMESTAMP(3))`,
          [newAttId, companyId, userId, incidentDate, sched?.id || null, sched?.start_time || null, sched?.end_time || null]
        );
        attendance = { id: newAttId, attendance_status: 'justificacion_pendiente', punctuality_status: 'no_aplica' };
      }
    }

    const id = randomUUID();
    let docPath = null;
    let docOriginalName = null;
    let docMime = null;
    let docSize = null;

    if (file) {
      docOriginalName = path.basename(file.originalname).slice(0, 255);
      docMime = verifiedMime || file.mimetype;
      docSize = file.size;
      const stored = `${randomUUID()}${path.extname(docOriginalName).toLowerCase()}`;
      const dir = path.join(env.backendDir, 'uploads', 'justifications');
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      await fs.copyFile(file.path, path.join(dir, stored));
      docPath = stored;
    }

    await cx.execute(
      `INSERT INTO pb_attendance_justifications (
         id, company_id, user_id, attendance_id, incident_type,
         incident_date, incident_time, start_date, end_date,
         description, document_filename, document_original_name,
         document_mimetype, document_size_bytes, document_path,
         comments, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', UTC_TIMESTAMP(3))`,
      [
        id,
        companyId,
        userId,
        attendance?.id || null,
        incidentType,
        incidentDate,
        incidentTime || null,
        startDate,
        endDate || null,
        description,
        docPath,
        docOriginalName,
        docMime,
        docSize,
        docPath,
        comments || null
      ]
    );

    if (attendance && attendance.attendance_status !== 'justificacion_pendiente') {
      await cx.execute(
        `UPDATE pb_attendance
         SET attendance_status = 'justificacion_pendiente', updated_at = UTC_TIMESTAMP(3)
         WHERE id = ? AND company_id = ?`,
        [attendance.id, companyId]
      );
    }

    await cx.execute(
      `INSERT INTO pb_attendance_audit (id, company_id, actor_user_id, action, entity_type, entity_id, previous_value, new_value, reason, created_at)
       VALUES (?, ?, ?, 'submit_justification', 'pb_attendance_justifications', ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
      [
        randomUUID(),
        companyId,
        userId,
        id,
        attendance ? JSON.stringify({ attendance_status: attendance.attendance_status }) : null,
        JSON.stringify({ status: 'pending', incidentType, incidentDate, hasDocument: !!docPath }),
        description.slice(0, 500)
      ]
    );

    return { ok: true, id, attendanceId: attendance?.id || null, status: 'pending' };
  });
}

/**
 * Revisa una justificación (aprobar, rechazar o solicitar información). Solo personal de RRHH o Administración.
 */
export async function reviewJustification({
  companyId,
  reviewerUser,
  justificationId,
  status,
  reviewComment = ''
}) {
  if (!canReview(reviewerUser.role)) {
    throw new HttpError(403, 'No tienes permisos de Recursos Humanos o Administración para revisar justificaciones.');
  }

  if (!['approved', 'rejected', 'info_required'].includes(status)) {
    throw new HttpError(400, 'Estado de revisión inválido');
  }

  return transaction(async cx => {
    const [rows] = await cx.execute(
      `SELECT j.id, j.user_id, j.attendance_id, j.status, j.incident_type,
              a.checked_in_at, a.punctuality_status, a.attendance_status
       FROM pb_attendance_justifications j
       LEFT JOIN pb_attendance a ON a.id = j.attendance_id
       WHERE j.id = ? AND j.company_id = ? FOR UPDATE`,
      [justificationId, companyId]
    );

    if (!rows.length) throw new HttpError(404, 'Justificación no encontrada');
    const just = rows[0];

    // Protección anti auto-revisión
    if (just.user_id === reviewerUser.id) {
      throw new HttpError(403, 'Otra persona de Recursos Humanos o Administración debe revisar tu justificación.');
    }

    await cx.execute(
      `UPDATE pb_attendance_justifications
       SET status = ?, review_comment = ?, reviewer_id = ?, reviewed_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND company_id = ?`,
      [status, reviewComment, reviewerUser.id, justificationId, companyId]
    );

    // Actualizar situación administrativa de la asistencia vinculada si existe
    if (just.attendance_id) {
      let newAttendanceStatus = just.attendance_status;
      const isAbsence = !just.checked_in_at;

      if (status === 'approved') {
        if (isAbsence) {
          newAttendanceStatus = 'ausencia_justificada';
        } else if (just.punctuality_status === 'tarde' || just.attendance_status === 'tarde' || just.attendance_status === 'justificacion_pendiente') {
          newAttendanceStatus = 'tarde_justificada';
        } else {
          newAttendanceStatus = 'a_tiempo';
        }
      } else if (status === 'rejected') {
        if (isAbsence) {
          newAttendanceStatus = 'ausencia';
        } else if (just.punctuality_status === 'tarde') {
          newAttendanceStatus = 'tarde';
        } else {
          newAttendanceStatus = 'a_tiempo';
        }
      } else if (status === 'info_required') {
        newAttendanceStatus = 'justificacion_pendiente';
      }

      await cx.execute(
        `UPDATE pb_attendance
         SET attendance_status = ?, updated_at = UTC_TIMESTAMP(3)
         WHERE id = ? AND company_id = ?`,
        [newAttendanceStatus, just.attendance_id, companyId]
      );
    }

    await logAttendanceAudit({
      companyId,
      actorUserId: reviewerUser.id,
      action: `review_justification_${status}`,
      entityType: 'pb_attendance_justifications',
      entityId: justificationId,
      previousValue: { status: just.status, attendance_status: just.attendance_status },
      newValue: { status, reviewComment },
      reason: reviewComment || `Justificación ${status}`
    });

    return { ok: true, status };
  });
}

/**
 * Consulta listado de incidencias y asistencias de toda la empresa para el Panel de RRHH.
 */
export async function getCompanyAttendanceDashboard(companyId, {
  search,
  email,
  from,
  to,
  weekday,
  status,
  incidentType,
  page = 1,
  limit = 25
}) {
  const clauses = ['a.company_id = ?'];
  const params = [companyId];

  if (search) {
    clauses.push('(u.name LIKE ? OR u.email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (email) {
    clauses.push('u.email LIKE ?');
    params.push(`%${email}%`);
  }
  if (from) {
    clauses.push('COALESCE(a.work_date, DATE(DATE_SUB(a.checked_in_at, INTERVAL 6 HOUR))) >= ?');
    params.push(from);
  }
  if (to) {
    clauses.push('COALESCE(a.work_date, DATE(DATE_SUB(a.checked_in_at, INTERVAL 6 HOUR))) <= ?');
    params.push(to);
  }
  if (weekday !== undefined && weekday !== '') {
    clauses.push('WEEKDAY(DATE_SUB(COALESCE(a.checked_in_at, CONVERT_TZ(CONCAT(a.work_date," 12:00:00"),"-06:00","+00:00")), INTERVAL 6 HOUR)) = ?');
    params.push(Number(weekday));
  }
  if (status) {
    clauses.push('a.attendance_status = ?');
    params.push(status);
  }
  if (incidentType) {
    clauses.push('j.incident_type = ?');
    params.push(incidentType);
  }

  const where = clauses.join(' AND ');

  // Métricas generales de la compañía
  const statsRows = await many(
    `SELECT a.attendance_status, COUNT(*) AS count
     FROM pb_attendance a
     WHERE a.company_id = ?
     GROUP BY a.attendance_status`,
    [companyId]
  );
  const stats = {
    a_tiempo: 0,
    tarde: 0,
    tarde_justificada: 0,
    ausencia: 0,
    ausencia_justificada: 0,
    justificacion_pendiente: 0,
    jornada_incompleta: 0
  };
  for (const r of statsRows) {
    if (stats[r.attendance_status] !== undefined) {
      stats[r.attendance_status] = Number(r.count);
    }
  }

  const totalRow = await one(
    `SELECT COUNT(*) AS total
     FROM pb_attendance a
     JOIN pb_users u ON u.id = a.user_id AND u.company_id = a.company_id
     LEFT JOIN pb_attendance_justifications j ON j.attendance_id = a.id
     WHERE ${where}`,
    params
  );
  const total = Number(totalRow?.total || 0);

  const offset = (Number(page) - 1) * Number(limit);
  const records = await many(
    `SELECT a.id, a.user_id, u.name AS employee_name, u.email AS employee_email,
            a.work_date, a.checked_in_at, a.checked_out_at,
            a.scheduled_start_time, a.scheduled_end_time,
            a.punctuality_status, a.attendance_status,
            a.duration_seconds, a.is_demo,
            s.shift_name,
            j.id AS justification_id, j.status AS justification_status,
            j.incident_type, j.description AS justification_description,
            j.comments AS justification_comments,
            j.document_path, j.document_original_name,
            j.review_comment, j.reviewed_at,
            rev.name AS reviewer_name
     FROM pb_attendance a
     JOIN pb_users u ON u.id = a.user_id AND u.company_id = a.company_id
     LEFT JOIN pb_work_schedules s ON s.id = a.schedule_id
     LEFT JOIN pb_attendance_justifications j ON j.attendance_id = a.id
     LEFT JOIN pb_users rev ON rev.id = j.reviewer_id
     WHERE ${where}
     ORDER BY COALESCE(a.work_date, DATE(DATE_SUB(a.checked_in_at, INTERVAL 6 HOUR))) DESC, a.checked_in_at DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset]
  );

  return {
    records,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)) || 1,
    stats
  };
}

/**
 * Consulta solicitudes de justificaciones de la empresa (o de un usuario específico).
 */
export async function getCompanyJustifications(companyId, { status, userId, page = 1, limit = 50 } = {}) {
  const clauses = ['j.company_id = ?'];
  const params = [companyId];

  if (userId) {
    clauses.push('j.user_id = ?');
    params.push(userId);
  }
  if (status) {
    clauses.push('j.status = ?');
    params.push(status);
  }

  const where = clauses.join(' AND ');
  const offset = (Number(page) - 1) * Number(limit);

  const justifications = await many(
    `SELECT j.id, j.user_id, u.name AS employee_name, u.email AS employee_email,
            j.attendance_id, j.incident_type, j.incident_date, j.incident_time,
            j.start_date, j.end_date, j.description, j.comments,
            j.document_path, j.document_original_name, j.document_mimetype, j.document_size_bytes,
            j.status, j.review_comment, j.reviewed_at, j.created_at,
            a.work_date, a.scheduled_start_time, a.checked_in_at, a.punctuality_status,
            rev.name AS reviewer_name
     FROM pb_attendance_justifications j
     JOIN pb_users u ON u.id = j.user_id AND u.company_id = j.company_id
     LEFT JOIN pb_attendance a ON a.id = j.attendance_id
     LEFT JOIN pb_users rev ON rev.id = j.reviewer_id
     WHERE ${where}
     ORDER BY (j.status = 'pending') DESC, j.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset]
  );

  return { justifications };
}

/**
 * Detecta ausencias en una fecha programada para colaboradores con turno laboral que no marcaron entrada.
 */
export async function detectAbsencesForDate({ companyId, targetDate, isDemo = false }) {
  const dateObj = new Date(targetDate + 'T12:00:00Z');
  const { dayOfWeek } = getCostaRicaDateParts(dateObj);

  // Obtener colaboradores con turno laboral ese día
  const scheduledUsers = await many(
    `SELECT s.id AS schedule_id, s.user_id, s.start_time, s.end_time
     FROM pb_work_schedules s
     JOIN pb_users u ON u.id = s.user_id AND u.company_id = s.company_id
     WHERE s.company_id = ? AND s.day_of_week = ? AND s.state = 'laboral' AND u.role != 'admin'`,
    [companyId, dayOfWeek]
  );

  let detectedCount = 0;

  await transaction(async cx => {
    for (const item of scheduledUsers) {
      // 1. Verificar si ya tiene marcación registrada para esa fecha
      const [existing] = await cx.execute(
        `SELECT id FROM pb_attendance
         WHERE company_id = ? AND user_id = ? AND (
           work_date = ? OR DATE(DATE_SUB(checked_in_at, INTERVAL 6 HOUR)) = ?
         )`,
        [companyId, item.user_id, targetDate, targetDate]
      );
      if (existing.length) continue;

      // 2. Verificar si tiene vacación aprobada en esa fecha
      const [vacation] = await cx.execute(
        `SELECT id FROM pb_vacation_requests
         WHERE company_id = ? AND user_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?`,
        [companyId, item.user_id, targetDate, targetDate]
      );
      if (vacation.length) continue;

      // 3. Verificar si tiene justificación aprobada para esa fecha
      const [justification] = await cx.execute(
        `SELECT id FROM pb_attendance_justifications
         WHERE company_id = ? AND user_id = ? AND status = 'approved' AND start_date <= ? AND COALESCE(end_date, start_date) >= ?`,
        [companyId, item.user_id, targetDate, targetDate]
      );
      const attendanceStatus = justification.length ? 'ausencia_justificada' : 'ausencia';

      const id = randomUUID();
      await cx.execute(
        `INSERT INTO pb_attendance (
           id, company_id, user_id, checked_in_at, checked_out_at,
           work_date, schedule_id, scheduled_start_time, scheduled_end_time,
           punctuality_status, attendance_status, is_demo, created_at
         ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, 'no_aplica', ?, ?, UTC_TIMESTAMP(3))`,
        [
          id,
          companyId,
          item.user_id,
          targetDate,
          item.schedule_id,
          item.start_time,
          item.end_time,
          attendanceStatus,
          isDemo ? 1 : 0
        ]
      );
      detectedCount++;
    }
  });

  return { targetDate, detectedCount };
}
