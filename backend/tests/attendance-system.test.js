import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { pool, one, many, run } from '../src/db/pool.js';
import {
  isCheckInOnTime,
  getCostaRicaDateParts,
  getCompanyAttendanceSettings,
  updateCompanyAttendanceSettings,
  detectAbsencesForDate
} from '../src/services/attendance.service.js';

let server;
let base;

async function getBase() {
  if (!server) {
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  }
  return base;
}

function makeToken(userId) {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: '1h', issuer: 'policybot' });
}

async function api(path, options = {}) {
  const url = (await getBase()) + path;
  const headers = { ...(options.headers || {}) };
  if (options.token) {
    headers.cookie = `policybot_session=${options.token}`;
  }
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, { ...options, headers });
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data, headers: res.headers };
}

test('1. Prueba de puntualidad: evaluación estricta de horas y tolerancia', () => {
  const scheduledTime = '08:00:00';

  // Tolerancia 0 minutos
  assert.equal(isCheckInOnTime('07:55:00', scheduledTime, 0), true, '07:55 debe ser A tiempo para horario 08:00');
  assert.equal(isCheckInOnTime('08:00:00', scheduledTime, 0), true, '08:00:00 exacto debe ser A tiempo para horario 08:00');
  assert.equal(isCheckInOnTime('08:00:01', scheduledTime, 0), false, '08:00:01 debe ser Tarde con tolerancia 0');
  assert.equal(isCheckInOnTime('08:01:00', scheduledTime, 0), false, '08:01:00 debe ser Tarde');
  assert.equal(isCheckInOnTime('08:07:00', scheduledTime, 0), false, '08:07:00 debe ser Tarde');
  assert.equal(isCheckInOnTime('08:35:00', scheduledTime, 0), false, '08:35:00 debe ser Tarde');

  // Tolerancia configurable (ej. 10 minutos)
  assert.equal(isCheckInOnTime('08:05:00', scheduledTime, 10), true, '08:05 con 10 min de tolerancia debe ser A tiempo');
  assert.equal(isCheckInOnTime('08:10:00', scheduledTime, 10), true, '08:10:00 con 10 min de tolerancia debe ser A tiempo');
  assert.equal(isCheckInOnTime('08:10:01', scheduledTime, 10), false, '08:10:01 con 10 min de tolerancia debe ser Tarde');
});

test('2. Ciclo completo de marcación, determinación de puntualidad y salida', async () => {
  const companyId = randomUUID();
  const userId = randomUUID();
  const token = makeToken(userId);

  try {
    await run('INSERT INTO pb_companies (id, name) VALUES (?, ?)', [companyId, 'Test Attendance Corp']);
    await run(
      'INSERT INTO pb_users (id, company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, companyId, 'Colaborador Test', `colab_${randomUUID()}@test.com`, 'hash', 'colaborador']
    );

    // Asignar horario laboral para el día de hoy
    const { dayOfWeek } = getCostaRicaDateParts();
    await run(
      `INSERT INTO pb_work_schedules (id, company_id, user_id, day_of_week, day_name, start_time, end_time, state, shift_name)
       VALUES (?, ?, ?, ?, 'hoy', '08:00:00', '17:00:00', 'laboral', 'Diurno')`,
      [randomUUID(), companyId, userId, dayOfWeek]
    );

    // 1. Marcar entrada
    const resIn = await api('/attendance/in', { method: 'POST', token, body: {} });
    assert.equal(resIn.status, 201);
    assert.ok(resIn.data.id);
    assert.ok(resIn.data.punctualityStatus);
    assert.ok(resIn.data.attendanceStatus);
    assert.equal(resIn.data.scheduledStartTime, '08:00:00');

    // 2. Verificar que no se puede marcar doble entrada
    const resDuplicateIn = await api('/attendance/in', { method: 'POST', token, body: {} });
    assert.equal(resDuplicateIn.status, 409);

    // 3. Consultar estado actual
    const resCurrent = await api('/attendance', { token });
    assert.equal(resCurrent.status, 200);
    assert.ok(resCurrent.data.openEntry);
    assert.equal(resCurrent.data.openEntry.id, resIn.data.id);
    assert.ok(resCurrent.data.todaySchedule);

    // 4. Marcar salida
    const resOut = await api('/attendance/out', { method: 'POST', token, body: { entryId: resIn.data.id } });
    assert.equal(resOut.status, 200);
    assert.ok(resOut.data.ok);

    // 5. Verificar que ya no hay jornada abierta
    const resAfterOut = await api('/attendance', { token });
    assert.equal(resAfterOut.data.openEntry, null);
    assert.equal(resAfterOut.data.entries.length, 1);
    assert.ok(resAfterOut.data.entries[0].checked_out_at);
  } finally {
    await run('DELETE FROM pb_companies WHERE id = ?', [companyId]);
  }
});

test('3. Presentación y aprobación de justificación médica con comprobante', async () => {
  const companyId = randomUUID();
  const userId = randomUUID();
  const hrId = randomUUID();
  const userToken = makeToken(userId);
  const hrToken = makeToken(hrId);

  try {
    await run('INSERT INTO pb_companies (id, name) VALUES (?, ?)', [companyId, 'Justification Corp']);
    await run(
      'INSERT INTO pb_users (id, company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, companyId, 'Empleado Tarde', `emp_${randomUUID()}@test.com`, 'hash', 'colaborador']
    );
    await run(
      'INSERT INTO pb_users (id, company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
      [hrId, companyId, 'Revisor RRHH', `rrhh_${randomUUID()}@test.com`, 'hash', 'rrhh']
    );

    // Crear una marcación con estado 'tarde'
    const attId = randomUUID();
    await run(
      `INSERT INTO pb_attendance (
         id, company_id, user_id, checked_in_at, checked_out_at,
         work_date, scheduled_start_time, scheduled_end_time,
         punctuality_status, attendance_status
       ) VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), '2026-11-18', '08:00:00', '17:00:00', 'tarde', 'tarde')`,
      [attId, companyId, userId]
    );

    // 1. Colaborador presenta justificación
    const resSubmit = await api('/attendance/justifications', {
      method: 'POST',
      token: userToken,
      body: {
        attendanceId: attId,
        incidentType: 'cita_medica',
        incidentDate: '2026-11-18',
        startDate: '2026-11-18',
        description: 'Cita médica de rutina en la clínica institucional con constancia.'
      }
    });
    assert.equal(resSubmit.status, 201);
    assert.equal(resSubmit.data.status, 'pending');
    const justId = resSubmit.data.id;

    // Verificar que la asistencia pasó a 'justificacion_pendiente'
    const attRowPending = await one('SELECT attendance_status, punctuality_status FROM pb_attendance WHERE id = ?', [attId]);
    assert.equal(attRowPending.attendance_status, 'justificacion_pendiente');
    assert.equal(attRowPending.punctuality_status, 'tarde', 'La puntualidad original debe seguir siendo tarde');

    // 2. Intentar auto-aprobar la justificación (debe ser rechazado con 403)
    const resSelfReview = await api(`/attendance/justifications/${justId}/review`, {
      method: 'PATCH',
      token: userToken,
      body: { status: 'approved', comment: 'Me auto-apruebo' }
    });
    assert.equal(resSelfReview.status, 403, 'El colaborador no debe poder auto-aprobarse');

    // 3. RRHH aprueba la justificación
    const resReview = await api(`/attendance/justifications/${justId}/review`, {
      method: 'PATCH',
      token: hrToken,
      body: { status: 'approved', comment: 'Comprobante médico válido' }
    });
    assert.equal(resReview.status, 200);

    // 4. Verificar que la asistencia se actualizó a 'tarde_justificada'
    const attRowApproved = await one('SELECT attendance_status, punctuality_status FROM pb_attendance WHERE id = ?', [attId]);
    assert.equal(attRowApproved.attendance_status, 'tarde_justificada');
    assert.equal(attRowApproved.punctuality_status, 'tarde', 'Conserva registro histórico de que llegó tarde');

    // 5. Verificar registro de auditoría
    const auditRow = await one(
      'SELECT action, actor_user_id FROM pb_attendance_audit WHERE entity_id = ? AND action = "review_justification_approved"',
      [justId]
    );
    assert.ok(auditRow, 'Debe existir registro en auditoría');
    assert.equal(auditRow.actor_user_id, hrId);
  } finally {
    await run('DELETE FROM pb_companies WHERE id = ?', [companyId]);
  }
});

test('4. Rechazo de justificación y conservación del estado original', async () => {
  const companyId = randomUUID();
  const userId = randomUUID();
  const hrId = randomUUID();
  const userToken = makeToken(userId);
  const hrToken = makeToken(hrId);

  try {
    await run('INSERT INTO pb_companies (id, name) VALUES (?, ?)', [companyId, 'Reject Corp']);
    await run(
      'INSERT INTO pb_users (id, company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, companyId, 'Empleado Rechazado', `emp_${randomUUID()}@test.com`, 'hash', 'colaborador']
    );
    await run(
      'INSERT INTO pb_users (id, company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
      [hrId, companyId, 'Revisor RRHH', `rrhh_${randomUUID()}@test.com`, 'hash', 'rrhh']
    );

    const attId = randomUUID();
    await run(
      `INSERT INTO pb_attendance (
         id, company_id, user_id, checked_in_at, checked_out_at,
         work_date, scheduled_start_time, scheduled_end_time,
         punctuality_status, attendance_status
       ) VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), '2026-11-18', '08:00:00', '17:00:00', 'tarde', 'tarde')`,
      [attId, companyId, userId]
    );

    const resSubmit = await api('/attendance/justifications', {
      method: 'POST',
      token: userToken,
      body: {
        attendanceId: attId,
        incidentType: 'otro',
        incidentDate: '2026-11-18',
        startDate: '2026-11-18',
        description: 'Me quedé dormido y no sonó la alarma.'
      }
    });
    const justId = resSubmit.data.id;

    // Rechazar justificación
    const resReject = await api(`/attendance/justifications/${justId}/review`, {
      method: 'PATCH',
      token: hrToken,
      body: { status: 'rejected', comment: 'Motivo no contemplado en política de asistencia.' }
    });
    assert.equal(resReject.status, 200);

    const attRow = await one('SELECT attendance_status, punctuality_status FROM pb_attendance WHERE id = ?', [attId]);
    assert.equal(attRow.attendance_status, 'tarde', 'El estado de asistencia debe volver a tarde');
    assert.equal(attRow.punctuality_status, 'tarde');
  } finally {
    await run('DELETE FROM pb_companies WHERE id = ?', [companyId]);
  }
});

test('5. Aislamiento multiempresa estricto en asistencias y justificaciones', async () => {
  const companyA = randomUUID();
  const companyB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const hrA = randomUUID();

  try {
    await run('INSERT INTO pb_companies (id, name) VALUES (?, ?), (?, ?)', [companyA, 'Empresa A', companyB, 'Empresa B']);
    await run(
      'INSERT INTO pb_users (id, company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)',
      [
        userA, companyA, 'User A', `usera_${randomUUID()}@a.com`, 'hash', 'colaborador',
        hrA, companyA, 'HR A', `hra_${randomUUID()}@a.com`, 'hash', 'rrhh',
        userB, companyB, 'User B', `userb_${randomUUID()}@b.com`, 'hash', 'colaborador'
      ]
    );

    // Crear marcación para Empresa B
    const attB = randomUUID();
    await run(
      `INSERT INTO pb_attendance (id, company_id, user_id, checked_in_at, work_date, attendance_status)
       VALUES (?, ?, ?, UTC_TIMESTAMP(3), '2026-11-18', 'tarde')`,
      [attB, companyB, userB]
    );

    // HR de Empresa A consulta panel de compañía (no debe ver a User B)
    const resCompany = await api('/attendance/company', { token: makeToken(hrA) });
    assert.equal(resCompany.status, 200);
    assert.equal(resCompany.data.records.some(r => r.user_id === userB), false, 'Empresa A no debe ver registros de Empresa B');

    // User A intenta justificar una marcación de Empresa B
    const resHijack = await api('/attendance/justifications', {
      method: 'POST',
      token: makeToken(userA),
      body: {
        attendanceId: attB,
        incidentType: 'accidente',
        incidentDate: '2026-11-18',
        startDate: '2026-11-18',
        description: 'Intento de vincular marcación ajena'
      }
    });
    assert.equal(resHijack.status, 404, 'No puede vincular marcaciones de otra compañía');
  } finally {
    await run('DELETE FROM pb_companies WHERE id IN (?, ?)', [companyA, companyB]);
  }
});

test('6. Detección controlada de ausencias para jornadas laborales programadas', async () => {
  const companyId = randomUUID();
  const user1 = randomUUID();
  const user2 = randomUUID();

  try {
    await run('INSERT INTO pb_companies (id, name) VALUES (?, ?)', [companyId, 'Absence Corp']);
    await run(
      'INSERT INTO pb_users (id, company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)',
      [
        user1, companyId, 'User Ausente', `abs1_${randomUUID()}@test.com`, 'hash', 'colaborador',
        user2, companyId, 'User Presente', `abs2_${randomUUID()}@test.com`, 'hash', 'colaborador'
      ]
    );

    const targetDate = '2026-11-17'; // Fecha pasada
    const { dayOfWeek } = getCostaRicaDateParts(new Date(targetDate + 'T12:00:00Z'));

    // Asignar turnos a ambos
    await run(
      `INSERT INTO pb_work_schedules (id, company_id, user_id, day_of_week, day_name, start_time, end_time, state, shift_name)
       VALUES (?, ?, ?, ?, 'Martes', '08:00:00', '17:00:00', 'laboral', 'Diurno'),
              (?, ?, ?, ?, 'Martes', '08:00:00', '17:00:00', 'laboral', 'Diurno')`,
      [randomUUID(), companyId, user1, dayOfWeek, randomUUID(), companyId, user2, dayOfWeek]
    );

    // User2 sí marcó asistencia ese día
    await run(
      `INSERT INTO pb_attendance (id, company_id, user_id, checked_in_at, checked_out_at, work_date, attendance_status)
       VALUES (?, ?, ?, '2026-11-17 08:00:00', '2026-11-17 17:00:00', '2026-11-17', 'a_tiempo')`,
      [randomUUID(), companyId, user2]
    );

    // Ejecutar detección de ausencias
    const result = await detectAbsencesForDate({ companyId, targetDate });
    assert.equal(result.detectedCount, 1, 'Solo User1 debe ser detectado como ausente');

    // Verificar en la BD
    const absenceRow = await one(
      'SELECT user_id, attendance_status, work_date FROM pb_attendance WHERE company_id = ? AND user_id = ? AND work_date = ?',
      [companyId, user1, targetDate]
    );
    assert.ok(absenceRow);
    assert.equal(absenceRow.attendance_status, 'ausencia');
  } finally {
    await run('DELETE FROM pb_companies WHERE id = ?', [companyId]);
  }
});
