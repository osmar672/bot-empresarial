import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { one, many, run, transaction, pool } from './pool.js';
import { env } from '../config/env.js';
import { getCostaRicaDateParts } from '../services/attendance.service.js';

export async function seedAttendanceDemoData(targetCompanyName = 'Rockstar') {
  // 1. Obtener la compañía
  let company = await one('SELECT id, name FROM pb_companies WHERE name = ?', [targetCompanyName]);
  if (!company) {
    company = await one('SELECT c.id, c.name FROM pb_companies c JOIN pb_users u ON u.company_id = c.id GROUP BY c.id ORDER BY COUNT(*) DESC LIMIT 1');
  }
  if (!company) {
    console.log('No se encontró ninguna compañía para generar datos de demostración.');
    return { ok: false, error: 'No company found' };
  }

  const companyId = company.id;
  console.log(`Generando datos de demostración de asistencia para compañía: "${company.name}" (${companyId})`);

  // 2. Obtener administrador / revisor
  const admin = await one('SELECT id, name, email FROM pb_users WHERE company_id = ? AND role = "admin" LIMIT 1', [companyId]);
  if (!admin) {
    console.log('No se encontró un usuario administrador para la compañía.');
    return { ok: false, error: 'No admin found' };
  }

  // 3. Limpiar datos de demostración anteriores de manera segura
  await run('DELETE FROM pb_attendance_justifications WHERE company_id = ? AND is_demo = TRUE', [companyId]);
  await run('DELETE FROM pb_attendance WHERE company_id = ? AND is_demo = TRUE', [companyId]);

  // 4. Crear comprobante de demostración seguro
  const dir = path.join(env.backendDir, 'uploads', 'justifications');
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const demoFileName = `demo_comprobante_${randomUUID().slice(0, 8)}.pdf`;
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

  // 5. Obtener colaboradores con horarios asignados
  const collaborators = await many(
    `SELECT u.id, u.name, u.email
     FROM pb_users u
     WHERE u.company_id = ? AND u.role != 'admin'
     ORDER BY u.created_at ASC, u.id ASC
     LIMIT 40`,
    [companyId]
  );

  if (!collaborators.length) {
    console.log('No se encontraron colaboradores en la compañía.');
    return { ok: false, error: 'No collaborators found' };
  }

  const { dateStr: todayDateStr } = getCostaRicaDateParts();

  // Fechas históricas para los datos de demo (últimos 10 días laborables)
  const pastDates = [];
  for (let i = 1; i <= 10; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const parts = getCostaRicaDateParts(d);
    // Tomar días lunes a viernes para consistencia de turnos laborales
    if (parts.dayOfWeek >= 1 && parts.dayOfWeek <= 5) {
      pastDates.push({ dateStr: parts.dateStr, dayOfWeek: parts.dayOfWeek, date: d });
    }
  }

  let counts = {
    a_tiempo: 0,
    tarde: 0,
    tarde_justificada: 0,
    justificacion_pendiente: 0,
    tarde_rechazada: 0,
    ausencia: 0,
    ausencia_justificada: 0,
    jornada_incompleta: 0
  };

  await transaction(async cx => {
    for (let cIdx = 0; cIdx < collaborators.length; cIdx++) {
      const user = collaborators[cIdx];
      // Obtener horarios asignados del colaborador
      const [userSchedules] = await cx.execute(
        'SELECT id, day_of_week, start_time, end_time, state FROM pb_work_schedules WHERE company_id = ? AND user_id = ?',
        [companyId, user.id]
      );
      const scheduleByDay = new Map(userSchedules.map(s => [s.day_of_week, s]));

      // Asignar perfiles de comportamiento a los colaboradores
      // Distribuir equitativamente entre los diferentes casos de prueba
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
          // 1. A TIEMPO: Llegó 5 a 10 minutos antes
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
          counts.a_tiempo++;
        }
        else if (profileCategory === 1) {
          // 2. TARDE: Llegó 25 minutos tarde, sin justificación
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
          counts.tarde++;
        }
        else if (profileCategory === 2 && dIdx === 0) {
          // 3. TARDE CON JUSTIFICACIÓN MÉDICA APROBADA (Tarde justificada)
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

          const justId = randomUUID();
          await cx.execute(
            `INSERT INTO pb_attendance_justifications (
               id, company_id, user_id, attendance_id, incident_type,
               incident_date, incident_time, start_date, end_date,
               description, document_filename, document_original_name,
               document_mimetype, document_size_bytes, document_path,
               status, reviewer_id, reviewed_at, review_comment, is_demo, created_at
             ) VALUES (?, ?, ?, ?, 'cita_medica', ?, ?, ?, ?, ?, ?, 'comprobante_cita_medica_demo.pdf', 'application/pdf', 1024, ?, 'approved', ?, UTC_TIMESTAMP(3), 'Comprobante médico verificado y aprobado por Recursos Humanos', TRUE, UTC_TIMESTAMP(3))`,
            [justId, companyId, user.id, attId, dateStr, `${inH}:${inM}:00`, dateStr, dateStr, 'Asistencia a cita médica programada en clínica local. Se adjunta constancia médica de atención.', demoFileName, demoFileName, admin.id]
          );
          counts.tarde_justificada++;
        }
        else if (profileCategory === 3 && dIdx === 0) {
          // 4. TARDE CON JUSTIFICACIÓN PENDIENTE
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

          const justId = randomUUID();
          await cx.execute(
            `INSERT INTO pb_attendance_justifications (
               id, company_id, user_id, attendance_id, incident_type,
               incident_date, incident_time, start_date, end_date,
               description, document_filename, document_original_name,
               document_mimetype, document_size_bytes, document_path,
               status, is_demo, created_at
             ) VALUES (?, ?, ?, ?, 'fuerza_mayor', ?, ?, ?, ?, ?, ?, 'constancia_averia_vial_demo.pdf', 'application/pdf', 1024, ?, 'pending', TRUE, UTC_TIMESTAMP(3))`,
            [justId, companyId, user.id, attId, dateStr, `${inH}:${inM}:00`, dateStr, dateStr, 'Cierre total de vía por accidente de tránsito. Se presentó reporte vial como respaldo.', demoFileName, demoFileName]
          );
          counts.justificacion_pendiente++;
        }
        else if (profileCategory === 4 && dIdx === 0) {
          // 5. TARDE CON JUSTIFICACIÓN RECHAZADA
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

          const justId = randomUUID();
          await cx.execute(
            `INSERT INTO pb_attendance_justifications (
               id, company_id, user_id, attendance_id, incident_type,
               incident_date, incident_time, start_date, end_date,
               description, status, reviewer_id, reviewed_at, review_comment, is_demo, created_at
             ) VALUES (?, ?, ?, ?, 'otro', ?, ?, ?, ?, ?, 'rejected', ?, UTC_TIMESTAMP(3), 'Motivo insuficiente según política de puntualidad de la empresa.', TRUE, UTC_TIMESTAMP(3))`,
            [justId, companyId, user.id, attId, dateStr, `${inH}:${inM}:00`, dateStr, dateStr, 'Problemas personales con vehículo sin comprobante justificativo.', admin.id]
          );
          counts.tarde_rechazada++;
        }
        else if (profileCategory === 5 && dIdx === 0) {
          // 6. AUSENCIA JUSTIFICADA: No registró entrada, pero tiene justificación médica aprobada
          await cx.execute(
            `INSERT INTO pb_attendance (
               id, company_id, user_id, checked_in_at, checked_out_at,
               work_date, schedule_id, scheduled_start_time, scheduled_end_time,
               punctuality_status, attendance_status, duration_seconds, is_demo, created_at
             ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, 'no_aplica', 'ausencia_justificada', 0, TRUE, UTC_TIMESTAMP(3))`,
            [attId, companyId, user.id, dateStr, schedule.id, startTime, endTime]
          );

          const justId = randomUUID();
          await cx.execute(
            `INSERT INTO pb_attendance_justifications (
               id, company_id, user_id, attendance_id, incident_type,
               incident_date, incident_time, start_date, end_date,
               description, document_filename, document_original_name,
               document_mimetype, document_size_bytes, document_path,
               status, reviewer_id, reviewed_at, review_comment, is_demo, created_at
             ) VALUES (?, ?, ?, ?, 'incapacidad_medica', ?, '08:00:00', ?, ?, ?, ?, 'boleta_incapacidad_demo.pdf', 'application/pdf', 1024, ?, 'approved', ?, UTC_TIMESTAMP(3), 'Incapacidad médica oficial validada por Recursos Humanos', TRUE, UTC_TIMESTAMP(3))`,
            [justId, companyId, user.id, attId, dateStr, dateStr, dateStr, 'Incapacidad médica de 1 día emitida por médico de cabecera.', demoFileName, demoFileName, admin.id]
          );
          counts.ausencia_justificada++;
        }
        else if (profileCategory === 6 && dIdx === 0) {
          // 7. AUSENCIA NO JUSTIFICADA
          await cx.execute(
            `INSERT INTO pb_attendance (
               id, company_id, user_id, checked_in_at, checked_out_at,
               work_date, schedule_id, scheduled_start_time, scheduled_end_time,
               punctuality_status, attendance_status, duration_seconds, is_demo, created_at
             ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, 'no_aplica', 'ausencia', 0, TRUE, UTC_TIMESTAMP(3))`,
            [attId, companyId, user.id, dateStr, schedule.id, startTime, endTime]
          );
          counts.ausencia++;
        }
        else if (profileCategory === 7 && dIdx === 0) {
          // 8. JORNADA INCOMPLETA: Marcó entrada hace 2 días y nunca marcó salida
          const checkInAt = `${dateStr} ${String(sH).padStart(2, '0')}:${String(sM).padStart(2, '0')}:00`;
          await cx.execute(
            `INSERT INTO pb_attendance (
               id, company_id, user_id, checked_in_at, checked_out_at,
               work_date, schedule_id, scheduled_start_time, scheduled_end_time,
               punctuality_status, attendance_status, duration_seconds, is_demo, created_at
             ) VALUES (?, ?, ?, CONVERT_TZ(?,"-06:00","+00:00"), NULL, ?, ?, ?, ?, 'a_tiempo', 'jornada_incompleta', NULL, TRUE, UTC_TIMESTAMP(3))`,
            [attId, companyId, user.id, checkInAt, dateStr, schedule.id, startTime, endTime]
          );
          counts.jornada_incompleta++;
        }
      }
    }
  });

  console.log('Datos de demostración generados con éxito:');
  console.log(counts);

  return {
    ok: true,
    company: company.name,
    counts
  };
}

// Ejecución directa si se invoca por CLI
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
