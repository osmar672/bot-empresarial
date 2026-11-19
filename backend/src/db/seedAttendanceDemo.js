import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { one, many, run, transaction, pool } from './pool.js';
import { env } from '../config/env.js';
import { getCostaRicaDateParts } from '../services/attendance.service.js';
import { DAYS_OF_WEEK, generateCompanySchedules } from '../services/schedule.service.js';

async function ensureUserHasSchedule(companyId, userId) {
  const existing = await many(
    'SELECT id, day_of_week, start_time, end_time, state FROM pb_work_schedules WHERE company_id = ? AND user_id = ?',
    [companyId, userId]
  );
  if (existing.length === 7) return existing;

  // Asignar turno Diurno (08:00 - 17:00) de Lunes a Viernes y descanso Sábado y Domingo
  await run('DELETE FROM pb_work_schedules WHERE company_id = ? AND user_id = ?', [companyId, userId]);
  for (const d of DAYS_OF_WEEK) {
    const isRest = d.day === 6 || d.day === 7;
    await run(
      `INSERT INTO pb_work_schedules (
         id, company_id, user_id, day_of_week, day_name,
         start_time, end_time, break_start_time, break_end_time,
         state, shift_name, is_random
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        randomUUID(),
        companyId,
        userId,
        d.day,
        d.name,
        isRest ? null : '08:00:00',
        isRest ? null : '17:00:00',
        isRest ? null : '12:00:00',
        isRest ? null : '13:00:00',
        isRest ? 'descanso' : 'laboral',
        isRest ? 'Descanso' : 'Diurno (08:00 - 17:00)'
      ]
    );
  }
  return many(
    'SELECT id, day_of_week, start_time, end_time, state FROM pb_work_schedules WHERE company_id = ? AND user_id = ?',
    [companyId, userId]
  );
}

export async function seedAttendanceDemoData(targetCompanyName = null) {
  const companies = targetCompanyName
    ? await many('SELECT id, name FROM pb_companies WHERE name = ?', [targetCompanyName])
    : await many('SELECT id, name FROM pb_companies ORDER BY created_at ASC');

  if (!companies.length) {
    console.log('No se encontró ninguna compañía para generar datos de demostración.');
    return { ok: false, error: 'No company found' };
  }

  // Crear comprobante PDF de demostración seguro
  const dir = path.join(env.backendDir, 'uploads', 'justifications');
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const demoFileName = 'demo_comprobante_institucional.pdf';
  const demoFilePath = path.join(dir, demoFileName);

  const demoPdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 200 >> stream
BT
/F1 14 Tf
50 720 Td
(COMPROBANTE MEDICO DE DEMOSTRACION - POLICYBOT) Tj
0 -30 Td
(Documento de prueba generado exclusivamente para validar el modulo de asistencias.) Tj
0 -20 Td
(No representa un certificado oficial real.) Tj
ET
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000497 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
570
%%EOF`;

  await fs.writeFile(demoFilePath, Buffer.from(demoPdfContent, 'utf8'));

  // Fechas históricas para los datos de demo (últimos 14 días laborables Lunes a Viernes)
  const pastDates = [];
  for (let i = 1; i <= 18; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const parts = getCostaRicaDateParts(d);
    if (parts.dayOfWeek >= 1 && parts.dayOfWeek <= 5) {
      pastDates.push({ dateStr: parts.dateStr, dayOfWeek: parts.dayOfWeek, date: d });
    }
  }

  const totalCounts = {
    a_tiempo: 0,
    tarde: 0,
    tarde_justificada: 0,
    justificacion_pendiente: 0,
    tarde_rechazada: 0,
    ausencia: 0,
    ausencia_justificada: 0,
    jornada_incompleta: 0
  };

  for (const company of companies) {
    const companyId = company.id;
    console.log(`Generando datos de demostración de asistencia para compañía: "${company.name}" (${companyId})`);

    // Asegurar que los colaboradores tengan horarios generados
    await generateCompanySchedules({ companyId, overwrite: false });

    const admin = await one('SELECT id, name, email FROM pb_users WHERE company_id = ? AND role = "admin" LIMIT 1', [companyId]);
    if (!admin) continue;

    // Asegurar que el administrador también tenga horario asignado para sus propias marcaciones
    const adminSchedules = await ensureUserHasSchedule(companyId, admin.id);
    const adminSchedByDay = new Map(adminSchedules.map(s => [s.day_of_week, s]));

    // Si el administrador o algún usuario tiene marcaciones reales sin work_date o schedule_id, completarlas sin alterar su hora real
    const realEntries = await many(
      'SELECT id, user_id, checked_in_at FROM pb_attendance WHERE company_id = ? AND is_demo = FALSE AND work_date IS NULL AND checked_in_at IS NOT NULL',
      [companyId]
    );
    for (const re of realEntries) {
      const parts = getCostaRicaDateParts(new Date(re.checked_in_at));
      const sched = await one(
        'SELECT id, start_time, end_time FROM pb_work_schedules WHERE company_id = ? AND user_id = ? AND day_of_week = ?',
        [companyId, re.user_id, parts.dayOfWeek]
      );
      await run(
        `UPDATE pb_attendance
         SET work_date = ?, schedule_id = ?, scheduled_start_time = ?, scheduled_end_time = ?
         WHERE id = ?`,
        [parts.dateStr, sched?.id || null, sched?.start_time || '08:00:00', sched?.end_time || '17:00:00', re.id]
      );
    }

    // Limpiar datos de demostración anteriores de manera segura (solo is_demo = TRUE)
    await run('DELETE FROM pb_attendance_justifications WHERE company_id = ? AND is_demo = TRUE', [companyId]);
    await run('DELETE FROM pb_attendance WHERE company_id = ? AND is_demo = TRUE', [companyId]);

    const collaborators = await many(
      `SELECT u.id, u.name, u.email
       FROM pb_users u
       WHERE u.company_id = ? AND u.role != 'admin'
       ORDER BY u.created_at ASC, u.id ASC
       LIMIT 40`,
      [companyId]
    );

    const reviewerId = collaborators[0]?.id || admin.id;

    await transaction(async cx => {
      // A. Generar historial de demostración completo para el propio usuario Admin (para que vea todos los estados en Mi perfil)
      const adminCases = [
        'a_tiempo',
        'tarde_justificada',
        'justificacion_pendiente',
        'tarde',
        'ausencia_justificada',
        'tarde_rechazada',
        'ausencia',
        'a_tiempo'
      ];

      for (let idx = 0; idx < Math.min(adminCases.length, pastDates.length); idx++) {
        const caseType = adminCases[idx];
        const { dateStr, dayOfWeek } = pastDates[idx];
        const schedule = adminSchedByDay.get(dayOfWeek);
        if (!schedule) continue;

        // Evitar duplicar si ya tiene una marcación real en esa fecha
        const [realOnDate] = await cx.execute(
          'SELECT id FROM pb_attendance WHERE company_id = ? AND user_id = ? AND work_date = ?',
          [companyId, admin.id, dateStr]
        );
        if (realOnDate.length) continue;

        const startTime = schedule.start_time || '08:00:00';
        const endTime = schedule.end_time || '17:00:00';
        const attId = randomUUID();

        if (caseType === 'a_tiempo') {
          await cx.execute(
            `INSERT INTO pb_attendance (
               id, company_id, user_id, checked_in_at, checked_out_at,
               work_date, schedule_id, scheduled_start_time, scheduled_end_time,
               punctuality_status, attendance_status, duration_seconds, is_demo, created_at
             ) VALUES (?, ?, ?, CONVERT_TZ(?,"-06:00","+00:00"), CONVERT_TZ(?,"-06:00","+00:00"), ?, ?, ?, ?, 'a_tiempo', 'a_tiempo', 32700, TRUE, UTC_TIMESTAMP(3))`,
            [attId, companyId, admin.id, `${dateStr} 07:55:00`, `${dateStr} 17:00:00`, dateStr, schedule.id, startTime, endTime]
          );
          totalCounts.a_tiempo++;
        } else if (caseType === 'tarde') {
          await cx.execute(
            `INSERT INTO pb_attendance (
               id, company_id, user_id, checked_in_at, checked_out_at,
               work_date, schedule_id, scheduled_start_time, scheduled_end_time,
               punctuality_status, attendance_status, duration_seconds, is_demo, created_at
             ) VALUES (?, ?, ?, CONVERT_TZ(?,"-06:00","+00:00"), CONVERT_TZ(?,"-06:00","+00:00"), ?, ?, ?, ?, 'tarde', 'tarde', 31320, TRUE, UTC_TIMESTAMP(3))`,
            [attId, companyId, admin.id, `${dateStr} 08:18:00`, `${dateStr} 17:00:00`, dateStr, schedule.id, startTime, endTime]
          );
          totalCounts.tarde++;
        } else if (caseType === 'tarde_justificada') {
          await cx.execute(
            `INSERT INTO pb_attendance (
               id, company_id, user_id, checked_in_at, checked_out_at,
               work_date, schedule_id, scheduled_start_time, scheduled_end_time,
               punctuality_status, attendance_status, duration_seconds, is_demo, created_at
             ) VALUES (?, ?, ?, CONVERT_TZ(?,"-06:00","+00:00"), CONVERT_TZ(?,"-06:00","+00:00"), ?, ?, ?, ?, 'tarde', 'tarde_justificada', 29700, TRUE, UTC_TIMESTAMP(3))`,
            [attId, companyId, admin.id, `${dateStr} 08:45:00`, `${dateStr} 17:00:00`, dateStr, schedule.id, startTime, endTime]
          );
          await cx.execute(
            `INSERT INTO pb_attendance_justifications (
               id, company_id, user_id, attendance_id, incident_type,
               incident_date, incident_time, start_date, end_date,
               description, document_filename, document_original_name,
               document_mimetype, document_size_bytes, document_path,
               status, reviewer_id, reviewed_at, review_comment, is_demo, created_at
             ) VALUES (?, ?, ?, ?, 'cita_medica', ?, '08:45:00', ?, ?, ?, ?, 'comprobante_cita_medica_demo.pdf', 'application/pdf', 1024, ?, 'approved', ?, UTC_TIMESTAMP(3), 'Comprobante médico verificado y aprobado por Recursos Humanos', TRUE, UTC_TIMESTAMP(3))`,
            [randomUUID(), companyId, admin.id, attId, dateStr, dateStr, dateStr, 'Cita médica de control matutino con comprobante de asistencia.', demoFileName, demoFileName, reviewerId]
          );
          totalCounts.tarde_justificada++;
        } else if (caseType === 'justificacion_pendiente') {
          await cx.execute(
            `INSERT INTO pb_attendance (
               id, company_id, user_id, checked_in_at, checked_out_at,
               work_date, schedule_id, scheduled_start_time, scheduled_end_time,
               punctuality_status, attendance_status, duration_seconds, is_demo, created_at
             ) VALUES (?, ?, ?, CONVERT_TZ(?,"-06:00","+00:00"), CONVERT_TZ(?,"-06:00","+00:00"), ?, ?, ?, ?, 'tarde', 'justificacion_pendiente', 30600, TRUE, UTC_TIMESTAMP(3))`,
            [attId, companyId, admin.id, `${dateStr} 08:30:00`, `${dateStr} 17:00:00`, dateStr, schedule.id, startTime, endTime]
          );
          await cx.execute(
            `INSERT INTO pb_attendance_justifications (
               id, company_id, user_id, attendance_id, incident_type,
               incident_date, incident_time, start_date, end_date,
               description, document_filename, document_original_name,
               document_mimetype, document_size_bytes, document_path,
               status, is_demo, created_at
             ) VALUES (?, ?, ?, ?, 'fuerza_mayor', ?, '08:30:00', ?, ?, ?, ?, 'reporte_fuerza_mayor_demo.pdf', 'application/pdf', 1024, ?, 'pending', TRUE, UTC_TIMESTAMP(3))`,
            [randomUUID(), companyId, admin.id, attId, dateStr, dateStr, dateStr, 'Cierre de carretera principal por colisión; se adjunta constancia.', demoFileName, demoFileName]
          );
          totalCounts.justificacion_pendiente++;
        } else if (caseType === 'tarde_rechazada') {
          await cx.execute(
            `INSERT INTO pb_attendance (
               id, company_id, user_id, checked_in_at, checked_out_at,
               work_date, schedule_id, scheduled_start_time, scheduled_end_time,
               punctuality_status, attendance_status, duration_seconds, is_demo, created_at
             ) VALUES (?, ?, ?, CONVERT_TZ(?,"-06:00","+00:00"), CONVERT_TZ(?,"-06:00","+00:00"), ?, ?, ?, ?, 'tarde', 'tarde', 30300, TRUE, UTC_TIMESTAMP(3))`,
            [attId, companyId, admin.id, `${dateStr} 08:35:00`, `${dateStr} 17:00:00`, dateStr, schedule.id, startTime, endTime]
          );
          await cx.execute(
            `INSERT INTO pb_attendance_justifications (
               id, company_id, user_id, attendance_id, incident_type,
               incident_date, incident_time, start_date, end_date,
               description, status, reviewer_id, reviewed_at, review_comment, is_demo, created_at
             ) VALUES (?, ?, ?, ?, 'otro', ?, '08:35:00', ?, ?, ?, 'rejected', ?, UTC_TIMESTAMP(3), 'No se adjuntó comprobante de respaldo requerido.', TRUE, UTC_TIMESTAMP(3))`,
            [randomUUID(), companyId, admin.id, attId, dateStr, dateStr, dateStr, 'Tráfico habitual en hora pico sin incidente extraordinario.', reviewerId]
          );
          totalCounts.tarde_rechazada++;
        } else if (caseType === 'ausencia_justificada') {
          await cx.execute(
            `INSERT INTO pb_attendance (
               id, company_id, user_id, checked_in_at, checked_out_at,
               work_date, schedule_id, scheduled_start_time, scheduled_end_time,
               punctuality_status, attendance_status, duration_seconds, is_demo, created_at
             ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, 'no_aplica', 'ausencia_justificada', 0, TRUE, UTC_TIMESTAMP(3))`,
            [attId, companyId, admin.id, dateStr, schedule.id, startTime, endTime]
          );
          await cx.execute(
            `INSERT INTO pb_attendance_justifications (
               id, company_id, user_id, attendance_id, incident_type,
               incident_date, incident_time, start_date, end_date,
               description, document_filename, document_original_name,
               document_mimetype, document_size_bytes, document_path,
               status, reviewer_id, reviewed_at, review_comment, is_demo, created_at
             ) VALUES (?, ?, ?, ?, 'incapacidad_medica', ?, '08:00:00', ?, ?, ?, ?, 'incapacidad_medica_demo.pdf', 'application/pdf', 1024, ?, 'approved', ?, UTC_TIMESTAMP(3), 'Incapacidad médica validada por Recursos Humanos.', TRUE, UTC_TIMESTAMP(3))`,
            [randomUUID(), companyId, admin.id, attId, dateStr, dateStr, dateStr, 'Incapacidad médica de 1 día con comprobante adjunto.', demoFileName, demoFileName, reviewerId]
          );
          totalCounts.ausencia_justificada++;
        } else if (caseType === 'ausencia') {
          await cx.execute(
            `INSERT INTO pb_attendance (
               id, company_id, user_id, checked_in_at, checked_out_at,
               work_date, schedule_id, scheduled_start_time, scheduled_end_time,
               punctuality_status, attendance_status, duration_seconds, is_demo, created_at
             ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, 'no_aplica', 'ausencia', 0, TRUE, UTC_TIMESTAMP(3))`,
            [attId, companyId, admin.id, dateStr, schedule.id, startTime, endTime]
          );
          totalCounts.ausencia++;
        }
      }

      // B. Generar registros variados para los colaboradores de la compañía
      for (let cIdx = 0; cIdx < collaborators.length; cIdx++) {
        const user = collaborators[cIdx];
        const [userSchedules] = await cx.execute(
          'SELECT id, day_of_week, start_time, end_time, state FROM pb_work_schedules WHERE company_id = ? AND user_id = ?',
          [companyId, user.id]
        );
        const scheduleByDay = new Map(userSchedules.map(s => [s.day_of_week, s]));
        const profileCategory = cIdx % 8;

        for (let dIdx = 0; dIdx < Math.min(pastDates.length, 5); dIdx++) {
          const { dateStr, dayOfWeek } = pastDates[dIdx];
          const schedule = scheduleByDay.get(dayOfWeek);
          if (!schedule || schedule.state !== 'laboral' || !schedule.start_time) continue;

          const startTime = schedule.start_time;
          const endTime = schedule.end_time || '17:00:00';
          const [sH, sM] = startTime.split(':').map(Number);
          const [eH, eM] = endTime.split(':').map(Number);
          const attId = randomUUID();

          if (profileCategory === 0 || (profileCategory > 4 && dIdx > 1)) {
            const inH = String(sM >= 10 ? sH : Math.max(0, sH - 1)).padStart(2, '0');
            const inM = String(sM >= 10 ? sM - 10 : 50).padStart(2, '0');
            const checkInAt = `${dateStr} ${inH}:${inM}:00`;
            const checkOutAt = `${dateStr} ${String(eH).padStart(2, '0')}:${String(eM + 5).padStart(2, '0')}:00`;

            await cx.execute(
              `INSERT INTO pb_attendance (
                 id, company_id, user_id, checked_in_at, checked_out_at,
                 work_date, schedule_id, scheduled_start_time, scheduled_end_time,
                 punctuality_status, attendance_status, duration_seconds, is_demo, created_at
               ) VALUES (?, ?, ?, CONVERT_TZ(?,"-06:00","+00:00"), CONVERT_TZ(?,"-06:00","+00:00"), ?, ?, ?, ?, 'a_tiempo', 'a_tiempo', 28800, TRUE, UTC_TIMESTAMP(3))`,
              [attId, companyId, user.id, checkInAt, checkOutAt, dateStr, schedule.id, startTime, endTime]
            );
            totalCounts.a_tiempo++;
          } else if (profileCategory === 1) {
            const inH = String(sM + 25 >= 60 ? sH + 1 : sH).padStart(2, '0');
            const inM = String((sM + 25) % 60).padStart(2, '0');
            const checkInAt = `${dateStr} ${inH}:${inM}:00`;
            const checkOutAt = `${dateStr} ${String(eH).padStart(2, '0')}:${String(eM).padStart(2, '0')}:00`;

            await cx.execute(
              `INSERT INTO pb_attendance (
                 id, company_id, user_id, checked_in_at, checked_out_at,
                 work_date, schedule_id, scheduled_start_time, scheduled_end_time,
                 punctuality_status, attendance_status, duration_seconds, is_demo, created_at
               ) VALUES (?, ?, ?, CONVERT_TZ(?,"-06:00","+00:00"), CONVERT_TZ(?,"-06:00","+00:00"), ?, ?, ?, ?, 'tarde', 'tarde', 27300, TRUE, UTC_TIMESTAMP(3))`,
              [attId, companyId, user.id, checkInAt, checkOutAt, dateStr, schedule.id, startTime, endTime]
            );
            totalCounts.tarde++;
          } else if (profileCategory === 2 && dIdx === 0) {
            const inH = String(sM + 45 >= 60 ? sH + 1 : sH).padStart(2, '0');
            const inM = String((sM + 45) % 60).padStart(2, '0');
            const checkInAt = `${dateStr} ${inH}:${inM}:00`;
            const checkOutAt = `${dateStr} ${String(eH).padStart(2, '0')}:${String(eM).padStart(2, '0')}:00`;

            await cx.execute(
              `INSERT INTO pb_attendance (
                 id, company_id, user_id, checked_in_at, checked_out_at,
                 work_date, schedule_id, scheduled_start_time, scheduled_end_time,
                 punctuality_status, attendance_status, duration_seconds, is_demo, created_at
               ) VALUES (?, ?, ?, CONVERT_TZ(?,"-06:00","+00:00"), CONVERT_TZ(?,"-06:00","+00:00"), ?, ?, ?, ?, 'tarde', 'tarde_justificada', 26100, TRUE, UTC_TIMESTAMP(3))`,
              [attId, companyId, user.id, checkInAt, checkOutAt, dateStr, schedule.id, startTime, endTime]
            );

            await cx.execute(
              `INSERT INTO pb_attendance_justifications (
                 id, company_id, user_id, attendance_id, incident_type,
                 incident_date, incident_time, start_date, end_date,
                 description, document_filename, document_original_name,
                 document_mimetype, document_size_bytes, document_path,
                 status, reviewer_id, reviewed_at, review_comment, is_demo, created_at
               ) VALUES (?, ?, ?, ?, 'cita_medica', ?, ?, ?, ?, ?, ?, 'comprobante_cita_medica_demo.pdf', 'application/pdf', 1024, ?, 'approved', ?, UTC_TIMESTAMP(3), 'Comprobante médico verificado y aprobado por Recursos Humanos', TRUE, UTC_TIMESTAMP(3))`,
              [randomUUID(), companyId, user.id, attId, dateStr, `${inH}:${inM}:00`, dateStr, dateStr, 'Asistencia a cita médica programada en clínica local. Se adjunta constancia médica de atención.', demoFileName, demoFileName, admin.id]
            );
            totalCounts.tarde_justificada++;
          } else if (profileCategory === 3 && dIdx === 0) {
            const inH = String(sM + 30 >= 60 ? sH + 1 : sH).padStart(2, '0');
            const inM = String((sM + 30) % 60).padStart(2, '0');
            const checkInAt = `${dateStr} ${inH}:${inM}:00`;
            const checkOutAt = `${dateStr} ${String(eH).padStart(2, '0')}:${String(eM).padStart(2, '0')}:00`;

            await cx.execute(
              `INSERT INTO pb_attendance (
                 id, company_id, user_id, checked_in_at, checked_out_at,
                 work_date, schedule_id, scheduled_start_time, scheduled_end_time,
                 punctuality_status, attendance_status, duration_seconds, is_demo, created_at
               ) VALUES (?, ?, ?, CONVERT_TZ(?,"-06:00","+00:00"), CONVERT_TZ(?,"-06:00","+00:00"), ?, ?, ?, ?, 'tarde', 'justificacion_pendiente', 27000, TRUE, UTC_TIMESTAMP(3))`,
              [attId, companyId, user.id, checkInAt, checkOutAt, dateStr, schedule.id, startTime, endTime]
            );

            await cx.execute(
              `INSERT INTO pb_attendance_justifications (
                 id, company_id, user_id, attendance_id, incident_type,
                 incident_date, incident_time, start_date, end_date,
                 description, document_filename, document_original_name,
                 document_mimetype, document_size_bytes, document_path,
                 status, is_demo, created_at
               ) VALUES (?, ?, ?, ?, 'fuerza_mayor', ?, ?, ?, ?, ?, ?, 'constancia_averia_vial_demo.pdf', 'application/pdf', 1024, ?, 'pending', TRUE, UTC_TIMESTAMP(3))`,
              [randomUUID(), companyId, user.id, attId, dateStr, `${inH}:${inM}:00`, dateStr, dateStr, 'Cierre total de vía por accidente de tránsito. Se presentó reporte vial como respaldo.', demoFileName, demoFileName]
            );
            totalCounts.justificacion_pendiente++;
          } else if (profileCategory === 4 && dIdx === 0) {
            const inH = String(sM + 40 >= 60 ? sH + 1 : sH).padStart(2, '0');
            const inM = String((sM + 40) % 60).padStart(2, '0');
            const checkInAt = `${dateStr} ${inH}:${inM}:00`;
            const checkOutAt = `${dateStr} ${String(eH).padStart(2, '0')}:${String(eM).padStart(2, '0')}:00`;

            await cx.execute(
              `INSERT INTO pb_attendance (
                 id, company_id, user_id, checked_in_at, checked_out_at,
                 work_date, schedule_id, scheduled_start_time, scheduled_end_time,
                 punctuality_status, attendance_status, duration_seconds, is_demo, created_at
               ) VALUES (?, ?, ?, CONVERT_TZ(?,"-06:00","+00:00"), CONVERT_TZ(?,"-06:00","+00:00"), ?, ?, ?, ?, 'tarde', 'tarde', 26400, TRUE, UTC_TIMESTAMP(3))`,
              [attId, companyId, user.id, checkInAt, checkOutAt, dateStr, schedule.id, startTime, endTime]
            );

            await cx.execute(
              `INSERT INTO pb_attendance_justifications (
                 id, company_id, user_id, attendance_id, incident_type,
                 incident_date, incident_time, start_date, end_date,
                 description, status, reviewer_id, reviewed_at, review_comment, is_demo, created_at
               ) VALUES (?, ?, ?, ?, 'otro', ?, ?, ?, ?, ?, 'rejected', ?, UTC_TIMESTAMP(3), 'Motivo insuficiente según política de puntualidad de la empresa.', TRUE, UTC_TIMESTAMP(3))`,
              [randomUUID(), companyId, user.id, attId, dateStr, `${inH}:${inM}:00`, dateStr, dateStr, 'Problemas personales con vehículo sin comprobante justificativo.', admin.id]
            );
            totalCounts.tarde_rechazada++;
          } else if (profileCategory === 5 && dIdx === 0) {
            await cx.execute(
              `INSERT INTO pb_attendance (
                 id, company_id, user_id, checked_in_at, checked_out_at,
                 work_date, schedule_id, scheduled_start_time, scheduled_end_time,
                 punctuality_status, attendance_status, duration_seconds, is_demo, created_at
               ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, 'no_aplica', 'ausencia_justificada', 0, TRUE, UTC_TIMESTAMP(3))`,
              [attId, companyId, user.id, dateStr, schedule.id, startTime, endTime]
            );

            await cx.execute(
              `INSERT INTO pb_attendance_justifications (
                 id, company_id, user_id, attendance_id, incident_type,
                 incident_date, incident_time, start_date, end_date,
                 description, document_filename, document_original_name,
                 document_mimetype, document_size_bytes, document_path,
                 status, reviewer_id, reviewed_at, review_comment, is_demo, created_at
               ) VALUES (?, ?, ?, ?, 'incapacidad_medica', ?, '08:00:00', ?, ?, ?, ?, 'boleta_incapacidad_demo.pdf', 'application/pdf', 1024, ?, 'approved', ?, UTC_TIMESTAMP(3), 'Incapacidad médica oficial validada por Recursos Humanos', TRUE, UTC_TIMESTAMP(3))`,
              [randomUUID(), companyId, user.id, attId, dateStr, dateStr, dateStr, 'Incapacidad médica de 1 día emitida por médico de cabecera.', demoFileName, demoFileName, admin.id]
            );
            totalCounts.ausencia_justificada++;
          } else if (profileCategory === 6 && dIdx === 0) {
            await cx.execute(
              `INSERT INTO pb_attendance (
                 id, company_id, user_id, checked_in_at, checked_out_at,
                 work_date, schedule_id, scheduled_start_time, scheduled_end_time,
                 punctuality_status, attendance_status, duration_seconds, is_demo, created_at
               ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, 'no_aplica', 'ausencia', 0, TRUE, UTC_TIMESTAMP(3))`,
              [attId, companyId, user.id, dateStr, schedule.id, startTime, endTime]
            );
            totalCounts.ausencia++;
          } else if (profileCategory === 7 && dIdx === 0) {
            const [hasOpen] = await cx.execute(
              'SELECT id FROM pb_attendance WHERE company_id = ? AND user_id = ? AND checked_in_at IS NOT NULL AND checked_out_at IS NULL',
              [companyId, user.id]
            );
            if (!hasOpen.length) {
              const checkInAt = `${dateStr} ${String(sH).padStart(2, '0')}:${String(sM).padStart(2, '0')}:00`;
              await cx.execute(
                `INSERT INTO pb_attendance (
                   id, company_id, user_id, checked_in_at, checked_out_at,
                   work_date, schedule_id, scheduled_start_time, scheduled_end_time,
                   punctuality_status, attendance_status, duration_seconds, is_demo, created_at
                 ) VALUES (?, ?, ?, CONVERT_TZ(?,"-06:00","+00:00"), NULL, ?, ?, ?, ?, 'a_tiempo', 'jornada_incompleta', NULL, TRUE, UTC_TIMESTAMP(3))`,
                [attId, companyId, user.id, checkInAt, dateStr, schedule.id, startTime, endTime]
              );
              totalCounts.jornada_incompleta++;
            }
          }
        }
      }
    });
  }

  console.log('Datos de demostración generados con éxito para todas las compañías:', totalCounts);
  return {
    ok: true,
    companies: companies.map(c => c.name),
    counts: totalCounts
  };
}

if (process.argv[1]?.endsWith('seedAttendanceDemo.js')) {
  try {
    const result = await seedAttendanceDemoData();
    console.log('Resultado del seed:', result);
    process.exit(0);
  } catch (err) {
    console.error('Error al generar seed de demostración:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
