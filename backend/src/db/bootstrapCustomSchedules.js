import { pool, one, run, transaction } from './pool.js';
import { randomUUID } from 'node:crypto';

export async function ensureCustomScheduleColumns(db = pool) {
  const [cols] = await db.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pb_work_schedules'`
  );
  const existingCols = new Set(cols.map(c => c.COLUMN_NAME));
  if (!existingCols.has('break1_start_time')) {
    await db.query('ALTER TABLE pb_work_schedules ADD COLUMN break1_start_time TIME NULL');
  }
  if (!existingCols.has('break1_end_time')) {
    await db.query('ALTER TABLE pb_work_schedules ADD COLUMN break1_end_time TIME NULL');
  }
  if (!existingCols.has('lunch_start_time')) {
    await db.query('ALTER TABLE pb_work_schedules ADD COLUMN lunch_start_time TIME NULL');
  }
  if (!existingCols.has('lunch_end_time')) {
    await db.query('ALTER TABLE pb_work_schedules ADD COLUMN lunch_end_time TIME NULL');
  }
  if (!existingCols.has('break2_start_time')) {
    await db.query('ALTER TABLE pb_work_schedules ADD COLUMN break2_start_time TIME NULL');
  }
  if (!existingCols.has('break2_end_time')) {
    await db.query('ALTER TABLE pb_work_schedules ADD COLUMN break2_end_time TIME NULL');
  }
  if (!existingCols.has('timezone')) {
    await db.query("ALTER TABLE pb_work_schedules ADD COLUMN timezone VARCHAR(50) DEFAULT 'America/Costa_Rica'");
  }
  if (!existingCols.has('effective_date')) {
    await db.query('ALTER TABLE pb_work_schedules ADD COLUMN effective_date DATE NULL');
  }

  const [attCols] = await db.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pb_attendance'`
  );
  const existingAttCols = new Set(attCols.map(c => c.COLUMN_NAME));
  if (!existingAttCols.has('overtime_minutes')) {
    await db.query('ALTER TABLE pb_attendance ADD COLUMN overtime_minutes INT NULL DEFAULT 0');
  }
  if (!existingAttCols.has('overtime_status')) {
    await db.query("ALTER TABLE pb_attendance ADD COLUMN overtime_status ENUM('ninguno','solicitada','aprobada','rechazada') NOT NULL DEFAULT 'ninguno'");
  }
  if (!existingAttCols.has('overtime_reason')) {
    await db.query('ALTER TABLE pb_attendance ADD COLUMN overtime_reason VARCHAR(255) NULL');
  }
}

/**
 * Asigna y asegura el horario inicial de Oscar Guido en la base de datos:
 * Lunes a Viernes:
 *   Entrada: 07:00
 *   Primer descanso: 10:00 - 10:15
 *   Comida: 12:00 - 13:00
 *   Segundo descanso: 15:00 - 15:15
 *   Salida: 16:00
 * Sábado y Domingo: Descanso
 */
export async function ensureOscarCustomSchedule(db = pool) {
  const oscar = await one(
    "SELECT id, company_id FROM pb_users WHERE email = 'oscarguidorosales101@gmail.com'"
  );
  if (!oscar) return { updated: false, reason: 'user_not_found' };

  await ensureCustomScheduleColumns(db);

  const days = [
    { day: 1, name: 'lunes', state: 'laboral' },
    { day: 2, name: 'martes', state: 'laboral' },
    { day: 3, name: 'miércoles', state: 'laboral' },
    { day: 4, name: 'jueves', state: 'laboral' },
    { day: 5, name: 'viernes', state: 'laboral' },
    { day: 6, name: 'sábado', state: 'descanso' },
    { day: 7, name: 'domingo', state: 'descanso' }
  ];

  await transaction(async cx => {
    for (const d of days) {
      const isWork = d.state === 'laboral';
      await cx.execute(
        `INSERT INTO pb_work_schedules (
           id, company_id, user_id, day_of_week, day_name,
           start_time, end_time, break_start_time, break_end_time,
           break1_start_time, break1_end_time, lunch_start_time, lunch_end_time,
           break2_start_time, break2_end_time, timezone, effective_date,
           state, shift_name, is_random
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)
         ON DUPLICATE KEY UPDATE
           day_name = VALUES(day_name),
           start_time = VALUES(start_time),
           end_time = VALUES(end_time),
           break_start_time = VALUES(break_start_time),
           break_end_time = VALUES(break_end_time),
           break1_start_time = VALUES(break1_start_time),
           break1_end_time = VALUES(break1_end_time),
           lunch_start_time = VALUES(lunch_start_time),
           lunch_end_time = VALUES(lunch_end_time),
           break2_start_time = VALUES(break2_start_time),
           break2_end_time = VALUES(break2_end_time),
           timezone = VALUES(timezone),
           effective_date = VALUES(effective_date),
           state = VALUES(state),
           shift_name = VALUES(shift_name),
           is_random = FALSE,
           updated_at = UTC_TIMESTAMP(3)`,
        [
          randomUUID(),
          oscar.company_id,
          oscar.id,
          d.day,
          d.name,
          isWork ? '07:00:00' : null,
          isWork ? '16:00:00' : null,
          isWork ? '12:00:00' : null,
          isWork ? '13:00:00' : null,
          isWork ? '10:00:00' : null,
          isWork ? '10:15:00' : null,
          isWork ? '12:00:00' : null,
          isWork ? '13:00:00' : null,
          isWork ? '15:00:00' : null,
          isWork ? '15:15:00' : null,
          'America/Costa_Rica',
          '2026-11-19',
          d.state,
          isWork ? 'Personalizado Oscar (07:00 - 16:00)' : 'Descanso'
        ]
      );
    }
  });

  return { updated: true, userId: oscar.id, companyId: oscar.company_id };
}

/**
 * Asegura que las políticas generales y documentos de finanzas de la empresa
 * estén autorizados para lectura por los colaboradores de la compañía correspondiente.
 */
export async function ensureCompanyDocumentsAccess(db = pool) {
  // Solo se actualizan documentos que tengan roles restrictivos ['admin'] y correspondan a normativas generales o finanzas
  const keywords = [
    '%POL%', '%01_%', '%02_%', '%03_%', '%04_%', '%05_%', '%06_%',
    '%07_%', '%08_%', '%09_%', '%10_%', '%12_%', '%Derecho_Laboral%',
    '%Vacaciones%', '%Reembolso%', '%Jornada%', '%Teletrabajo%', '%Conducta%'
  ];

  const conditions = keywords.map(() => 'name LIKE ?').join(' OR ');
  await db.query(
    `UPDATE pb_documents 
     SET allowed_roles = JSON_ARRAY('admin', 'rrhh', 'colaborador', 'compras_auxiliar')
     WHERE (${conditions})`,
    keywords
  );
}

