import { randomUUID } from 'node:crypto';
import { one, many, run, transaction } from '../db/pool.js';
import { HttpError } from '../utils/errors.js';

export const DAYS_OF_WEEK = [
  { day: 1, name: 'lunes', label: 'Lunes' },
  { day: 2, name: 'martes', label: 'Martes' },
  { day: 3, name: 'miércoles', label: 'Miércoles' },
  { day: 4, name: 'jueves', label: 'Jueves' },
  { day: 5, name: 'viernes', label: 'Viernes' },
  { day: 6, name: 'sábado', label: 'Sábado' },
  { day: 7, name: 'domingo', label: 'Domingo' }
];

export const SHIFT_TEMPLATES = [
  // Turnos de mañana
  {
    category: 'mañana',
    name: 'Mañana (06:00 - 14:00)',
    startTime: '06:00:00',
    endTime: '14:00:00',
    breakStart: '10:00:00',
    breakEnd: '10:45:00'
  },
  {
    category: 'mañana',
    name: 'Mañana (07:00 - 15:00)',
    startTime: '07:00:00',
    endTime: '15:00:00',
    breakStart: '11:00:00',
    breakEnd: '11:45:00'
  },
  {
    category: 'mañana',
    name: 'Mañana (08:00 - 16:00)',
    startTime: '08:00:00',
    endTime: '16:00:00',
    breakStart: '12:00:00',
    breakEnd: '12:45:00'
  },

  // Turnos diurnos (jornada partida con almuerzo)
  {
    category: 'diurno',
    name: 'Diurno (08:00 - 17:00)',
    startTime: '08:00:00',
    endTime: '17:00:00',
    breakStart: '12:00:00',
    breakEnd: '13:00:00'
  },
  {
    category: 'diurno',
    name: 'Diurno (09:00 - 18:00)',
    startTime: '09:00:00',
    endTime: '18:00:00',
    breakStart: '13:00:00',
    breakEnd: '14:00:00'
  },
  {
    category: 'diurno',
    name: 'Diurno (10:00 - 19:00)',
    startTime: '10:00:00',
    endTime: '19:00:00',
    breakStart: '14:00:00',
    breakEnd: '15:00:00'
  },

  // Turnos de tarde
  {
    category: 'tarde',
    name: 'Tarde (12:00 - 20:00)',
    startTime: '12:00:00',
    endTime: '20:00:00',
    breakStart: '16:00:00',
    breakEnd: '16:45:00'
  },
  {
    category: 'tarde',
    name: 'Tarde (13:00 - 21:00)',
    startTime: '13:00:00',
    endTime: '21:00:00',
    breakStart: '17:00:00',
    breakEnd: '17:45:00'
  },
  {
    category: 'tarde',
    name: 'Tarde (14:00 - 22:00)',
    startTime: '14:00:00',
    endTime: '22:00:00',
    breakStart: '18:00:00',
    breakEnd: '18:45:00'
  }
];

export const REST_PATTERNS = [
  { name: 'Sábado y Domingo', days: [6, 7], label: 'Sáb, Dom' },
  { name: 'Domingo', days: [7], label: 'Dom' },
  { name: 'Domingo y Lunes', days: [7, 1], label: 'Dom, Lun' },
  { name: 'Lunes y Martes', days: [1, 2], label: 'Lun, Mar' }
];

/**
 * Valida la coherencia temporal de un turno laboral.
 */
export function validateShiftCoherence(shift) {
  if (shift.state === 'descanso') return true;
  if (!shift.startTime || !shift.endTime) {
    throw new Error('Un turno laboral requiere hora de entrada y hora de salida.');
  }
  if (shift.endTime <= shift.startTime) {
    throw new Error(`Hora de salida (${shift.endTime}) debe ser posterior a la de entrada (${shift.startTime}).`);
  }
  if (shift.breakStart && shift.breakEnd) {
    if (shift.breakEnd <= shift.breakStart) {
      throw new Error(`Fin de descanso (${shift.breakEnd}) debe ser posterior al inicio (${shift.breakStart}).`);
    }
    if (shift.breakStart < shift.startTime || shift.breakEnd > shift.endTime) {
      throw new Error('El intervalo de descanso debe estar dentro de la jornada laboral.');
    }
  }
  return true;
}

/**
 * Genera horarios laborales aleatorios para los colaboradores de una empresa.
 * @param {object} options
 * @param {string} options.companyId ID de la empresa
 * @param {boolean} [options.overwrite=false] Si es true, reemplaza horarios previos
 * @param {string} [options.targetUserId] ID opcional de colaborador individual
 */
export async function generateCompanySchedules({ companyId, overwrite = false, targetUserId = null }) {
  if (!companyId) throw new HttpError(400, 'Identificador de compañía requerido');

  // 1. Obtener colaboradores de la empresa (excluyendo admin para asignación de turnos operativos)
  let userQuery = 'SELECT id, name, email, role FROM pb_users WHERE company_id = ?';
  const queryParams = [companyId];
  if (targetUserId) {
    userQuery += ' AND id = ?';
    queryParams.push(targetUserId);
  } else {
    userQuery += ' AND role != "admin"';
  }
  userQuery += ' ORDER BY created_at ASC, id ASC';

  const collaborators = await many(userQuery, queryParams);
  if (!collaborators.length) {
    return {
      companyId,
      totalCollaborators: 0,
      generated: 0,
      skipped: 0,
      totalSchedulesCreated: 0,
      message: 'No se encontraron colaboradores para asignar horarios.'
    };
  }

  // 2. Comprobar colaboradores que ya tienen horarios registrados
  const existingUserRows = await many(
    'SELECT DISTINCT user_id FROM pb_work_schedules WHERE company_id = ?',
    [companyId]
  );
  const existingUserIds = new Set(existingUserRows.map(r => r.user_id));

  let generatedCount = 0;
  let skippedCount = 0;
  let totalRecordsCreated = 0;

  // Realizar inserciones en bloques dentro de una transacción para alto rendimiento e integridad ACID
  await transaction(async cx => {
    for (let i = 0; i < collaborators.length; i++) {
      const user = collaborators[i];
      const hasSchedule = existingUserIds.has(user.id);

      if (hasSchedule && !overwrite) {
        skippedCount++;
        continue;
      }

      if (hasSchedule && overwrite) {
        await cx.execute('DELETE FROM pb_work_schedules WHERE company_id = ? AND user_id = ?', [
          companyId,
          user.id
        ]);
      }

      // Asignación pseudo-aleatoria balanceada de turno y descanso
      // Usamos una combinación determinista con índice + id para variedad pero estabilidad
      const shiftIndex = (i + user.id.charCodeAt(0) + user.id.charCodeAt(user.id.length - 1)) % SHIFT_TEMPLATES.length;
      const patternIndex = (i * 3 + user.id.charCodeAt(1)) % REST_PATTERNS.length;

      const shift = SHIFT_TEMPLATES[shiftIndex];
      const restPattern = REST_PATTERNS[patternIndex];
      const restDaysSet = new Set(restPattern.days);

      // Validar coherencia del turno antes de insertar
      validateShiftCoherence({
        state: 'laboral',
        startTime: shift.startTime,
        endTime: shift.endTime,
        breakStart: shift.breakStart,
        breakEnd: shift.breakEnd
      });

      // Crear los 7 registros de la semana (Lunes a Domingo)
      for (const day of DAYS_OF_WEEK) {
        const isRest = restDaysSet.has(day.day);
        const recordId = randomUUID();

        const state = isRest ? 'descanso' : 'laboral';
        const startTime = isRest ? null : shift.startTime;
        const endTime = isRest ? null : shift.endTime;
        const breakStart = isRest ? null : shift.breakStart;
        const breakEnd = isRest ? null : shift.breakEnd;
        const shiftName = isRest ? 'Descanso' : shift.name;

        await cx.execute(
          `INSERT INTO pb_work_schedules (
            id, company_id, user_id, day_of_week, day_name,
            start_time, end_time, break_start_time, break_end_time,
            state, shift_name, is_random
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          ON DUPLICATE KEY UPDATE
            day_name = VALUES(day_name),
            start_time = VALUES(start_time),
            end_time = VALUES(end_time),
            break_start_time = VALUES(break_start_time),
            break_end_time = VALUES(break_end_time),
            state = VALUES(state),
            shift_name = VALUES(shift_name),
            is_random = 1,
            updated_at = NOW(3)`,
          [
            recordId,
            companyId,
            user.id,
            day.day,
            day.name,
            startTime,
            endTime,
            breakStart,
            breakEnd,
            state,
            shiftName
          ]
        );
        totalRecordsCreated++;
      }

      // Sincronizar resumen en pb_employee_profiles si la tabla existe
      await cx.execute(
        `INSERT INTO pb_employee_profiles (user_id, company_id, work_schedule, rest_days)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           work_schedule = VALUES(work_schedule),
           rest_days = VALUES(rest_days)`,
        [user.id, companyId, shift.name, restPattern.name]
      ).catch(() => {});

      generatedCount++;
    }
  });

  return {
    companyId,
    totalCollaborators: collaborators.length,
    generated: generatedCount,
    skipped: skippedCount,
    totalSchedulesCreated: totalRecordsCreated,
    message: `Se generaron horarios para ${generatedCount} colaborador(es) (${totalRecordsCreated} jornadas semanales).`
  };
}

/**
 * Consulta de horarios de una empresa con filtros y paginación.
 */
export async function getCompanySchedules(companyId, {
  dayOfWeek = null,
  shiftName = null,
  state = null,
  userId = null,
  search = null,
  page = 1,
  limit = 25
} = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.max(1, Math.min(100, parseInt(limit, 10) || 25));
  const offset = (p - 1) * l;

  const conditions = ['s.company_id = ?'];
  const params = [companyId];

  if (userId) {
    conditions.push('s.user_id = ?');
    params.push(userId);
  }

  if (dayOfWeek !== null && dayOfWeek !== undefined && dayOfWeek !== '') {
    conditions.push('s.day_of_week = ?');
    params.push(Number(dayOfWeek));
  }

  if (shiftName) {
    conditions.push('s.shift_name LIKE ?');
    params.push(`%${shiftName}%`);
  }

  if (state) {
    conditions.push('s.state = ?');
    params.push(state);
  }

  if (search) {
    conditions.push('(u.name LIKE ? OR u.email LIKE ?)');
    const term = `%${search.trim()}%`;
    params.push(term, term);
  }

  const whereClause = conditions.join(' AND ');

  const countRow = await one(
    `SELECT COUNT(*) AS total 
     FROM pb_work_schedules s
     JOIN pb_users u ON u.id = s.user_id AND u.company_id = s.company_id
     WHERE ${whereClause}`,
    params
  );

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / l));
  const currentPage = Math.min(p, totalPages);

  const schedules = await many(
    `SELECT 
       s.id, s.company_id, s.user_id, s.day_of_week, s.day_name,
       s.start_time, s.end_time, s.break_start_time, s.break_end_time,
       s.state, s.shift_name, s.is_random, s.created_at, s.updated_at,
       u.name AS user_name, u.email AS user_email, u.role AS user_role
     FROM pb_work_schedules s
     JOIN pb_users u ON u.id = s.user_id AND u.company_id = s.company_id
     WHERE ${whereClause}
     ORDER BY u.name ASC, s.day_of_week ASC
     LIMIT ? OFFSET ?`,
    [...params, l, offset]
  );

  return {
    schedules,
    page: currentPage,
    limit: l,
    total,
    totalPages
  };
}

/**
 * Consulta los horarios de los 7 días de la semana para un colaborador específico.
 */
export async function getUserWeeklySchedule(companyId, userId) {
  const user = await one(
    'SELECT id, name, email, role FROM pb_users WHERE id = ? AND company_id = ?',
    [userId, companyId]
  );
  if (!user) throw new HttpError(404, 'Colaborador no encontrado en esta empresa');

  const days = await many(
    `SELECT 
       id, day_of_week, day_name, start_time, end_time,
       break_start_time, break_end_time, state, shift_name, is_random, updated_at
     FROM pb_work_schedules
     WHERE company_id = ? AND user_id = ?
     ORDER BY day_of_week ASC`,
    [companyId, userId]
  );

  return {
    user,
    hasSchedule: days.length > 0,
    days
  };
}

/**
 * Resumen y estadísticas de horarios laborales para una empresa.
 */
export async function getScheduleSummary(companyId) {
  const [totalCollaboratorsRow, scheduledUsersRow, totalSchedulesRow] = await Promise.all([
    one('SELECT COUNT(*) AS total FROM pb_users WHERE company_id = ? AND role != "admin"', [companyId]),
    one('SELECT COUNT(DISTINCT user_id) AS total FROM pb_work_schedules WHERE company_id = ?', [companyId]),
    one('SELECT COUNT(*) AS total FROM pb_work_schedules WHERE company_id = ?', [companyId])
  ]);

  const byShift = await many(
    `SELECT 
       CASE 
         WHEN shift_name LIKE '%Mañana%' THEN 'Mañana'
         WHEN shift_name LIKE '%Diurno%' THEN 'Diurno'
         WHEN shift_name LIKE '%Tarde%' THEN 'Tarde'
         WHEN state = 'descanso' THEN 'Descanso'
         ELSE 'Otro'
       END AS shift_group,
       COUNT(*) AS count
     FROM pb_work_schedules
     WHERE company_id = ?
     GROUP BY shift_group`,
    [companyId]
  );

  const byDayLaboral = await many(
    `SELECT day_of_week, day_name, 
       SUM(CASE WHEN state = 'laboral' THEN 1 ELSE 0 END) AS active_workers,
       SUM(CASE WHEN state = 'descanso' THEN 1 ELSE 0 END) AS resting_workers
     FROM pb_work_schedules
     WHERE company_id = ?
     GROUP BY day_of_week, day_name
     ORDER BY day_of_week ASC`,
    [companyId]
  );

  return {
    companyId,
    totalCollaborators: Number(totalCollaboratorsRow?.total || 0),
    collaboratorsWithSchedule: Number(scheduledUsersRow?.total || 0),
    totalScheduleRecords: Number(totalSchedulesRow?.total || 0),
    byShift,
    byDayLaboral
  };
}
