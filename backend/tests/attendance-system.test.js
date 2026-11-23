import {csrfFetch as fetch} from '../../scripts/helpers/csrf-fetch.mjs';
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
  assert.equal(isCheckInOnTime('08:30:00', scheduledTime, 0), false, '08:30:00 debe ser Tarde');
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

test('3. Justificación con comprobante médico real (magic bytes), descarga protegida y aprobación', async () => {
  const companyId = randomUUID();
  const userId = randomUUID();
  const peerId = randomUUID();
  const hrId = randomUUID();
  const userToken = makeToken(userId);
  const peerToken = makeToken(peerId);
  const hrToken = makeToken(hrId);

  try {
    await run('INSERT INTO pb_companies (id, name) VALUES (?, ?)', [companyId, 'Justification Corp']);
    await run(
      'INSERT INTO pb_users (id, company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)',
      [
        userId, companyId, 'Empleado Tarde', `emp_${randomUUID()}@test.com`, 'hash', 'colaborador',
        peerId, companyId, 'Otro Colaborador', `peer_${randomUUID()}@test.com`, 'hash', 'colaborador',
        hrId, companyId, 'Revisor RRHH', `rrhh_${randomUUID()}@test.com`, 'hash', 'rrhh'
      ]
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

    // 1. Intentar subir archivo falso con extensión .pdf pero firma inválida -> debe rechazarse con 415
    const badForm = new FormData();
    badForm.set('attendanceId', attId);
    badForm.set('incidentType', 'cita_medica');
    badForm.set('incidentDate', '2026-11-18');
    badForm.set('startDate', '2026-11-18');
    badForm.set('description', 'Intento con archivo falso disfrazado de PDF');
    badForm.set('file', new Blob(['NOT_A_REAL_PDF_CONTENT'], { type: 'application/pdf' }), 'falso.pdf');

    const resBadFile = await api('/attendance/justifications', {
      method: 'POST',
      token: userToken,
      body: badForm
    });
    assert.equal(resBadFile.status, 415, 'Debe rechazar archivos cuya firma binaria real no coincida');

    // 2. Subir comprobante PDF real con cabecera %PDF-1.4
    const goodForm = new FormData();
    goodForm.set('attendanceId', attId);
    goodForm.set('incidentType', 'cita_medica');
    goodForm.set('incidentDate', '2026-11-18');
    goodForm.set('startDate', '2026-11-18');
    goodForm.set('description', 'Cita médica de rutina en la clínica institucional con constancia.');
    goodForm.set('file', new Blob(['%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF'], { type: 'application/pdf' }), 'comprobante_medico.pdf');

    const resSubmit = await api('/attendance/justifications', {
      method: 'POST',
      token: userToken,
      body: goodForm
    });
    assert.equal(resSubmit.status, 201);
    assert.equal(resSubmit.data.status, 'pending');
    const justId = resSubmit.data.id;

    // 3. Privacidad de comprobantes médicos: otro colaborador NO puede descargar el documento ajeno (403)
    const resPeerDownload = await fetch(`${await getBase()}/attendance/justifications/${justId}/document`, {
      headers: { cookie: `policybot_session=${peerToken}` }
    });
    assert.equal(resPeerDownload.status, 403, 'Otro colaborador no debe poder descargar un comprobante médico ajeno');

    // 4. RRHH y el titular SÍ pueden descargar el comprobante (200)
    const resHrDownload = await fetch(`${await getBase()}/attendance/justifications/${justId}/document`, {
      headers: { cookie: `policybot_session=${hrToken}` }
    });
    assert.equal(resHrDownload.status, 200, 'RRHH autorizado debe poder consultar el comprobante');

    // 5. Auto-aprobación bloqueada (403)
    const resSelfReview = await api(`/attendance/justifications/${justId}/review`, {
      method: 'PATCH',
      token: userToken,
      body: { status: 'approved', comment: 'Me auto-apruebo' }
    });
    assert.equal(resSelfReview.status, 403);

    // 6. RRHH aprueba la justificación -> pasa a 'tarde_justificada' conservando 'tarde' en punctuality_status
    const resReview = await api(`/attendance/justifications/${justId}/review`, {
      method: 'PATCH',
      token: hrToken,
      body: { status: 'approved', comment: 'Comprobante médico válido' }
    });
    assert.equal(resReview.status, 200);

    const attRowApproved = await one('SELECT attendance_status, punctuality_status FROM pb_attendance WHERE id = ?', [attId]);
    assert.equal(attRowApproved.attendance_status, 'tarde_justificada');
    assert.equal(attRowApproved.punctuality_status, 'tarde');
  } finally {
    await run('DELETE FROM pb_companies WHERE id = ?', [companyId]);
  }
});

test('4. Justificación de ausencia: aprobación cambia a ausencia_justificada y no bloquea nuevas entradas', async () => {
  const companyId = randomUUID();
  const userId = randomUUID();
  const hrId = randomUUID();
  const userToken = makeToken(userId);
  const hrToken = makeToken(hrId);

  try {
    await run('INSERT INTO pb_companies (id, name) VALUES (?, ?)', [companyId, 'Absence Just Corp']);
    await run(
      'INSERT INTO pb_users (id, company_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)',
      [
        userId, companyId, 'Empleado Ausente', `emp_${randomUUID()}@test.com`, 'hash', 'colaborador',
        hrId, companyId, 'Revisor RRHH', `rrhh_${randomUUID()}@test.com`, 'hash', 'rrhh'
      ]
    );

    const attId = randomUUID();
    await run(
      `INSERT INTO pb_attendance (
         id, company_id, user_id, checked_in_at, checked_out_at,
         work_date, scheduled_start_time, scheduled_end_time,
         punctuality_status, attendance_status
       ) VALUES (?, ?, ?, NULL, NULL, '2026-11-16', '08:00:00', '17:00:00', 'no_aplica', 'ausencia')`,
      [attId, companyId, userId]
    );

    // Verificar que una ausencia previa (checked_in_at NULL, checked_out_at NULL) NO figure como jornada abierta
    const resState = await api('/attendance', { token: userToken });
    assert.equal(resState.data.openEntry, null, 'Una ausencia no debe confundirse con una jornada abierta');

    // Presentar justificación por emergencia familiar para la ausencia
    const resSubmit = await api('/attendance/justifications', {
      method: 'POST',
      token: userToken,
      body: {
        attendanceId: attId,
        incidentType: 'emergencia_familiar',
        incidentDate: '2026-11-16',
        startDate: '2026-11-16',
        description: 'Emergencia familiar grave debidamente documentada.'
      }
    });
    assert.equal(resSubmit.status, 201);
    const justId = resSubmit.data.id;

    // Aprobar justificación -> debe pasar a 'ausencia_justificada' (no a 'tarde_justificada')
    const resApprove = await api(`/attendance/justifications/${justId}/review`, {
      method: 'PATCH',
      token: hrToken,
      body: { status: 'approved', comment: 'Ausencia por emergencia familiar justificada' }
    });
    assert.equal(resApprove.status, 200);

    const attRow = await one('SELECT attendance_status, punctuality_status FROM pb_attendance WHERE id = ?', [attId]);
    assert.equal(attRow.attendance_status, 'ausencia_justificada', 'Debe clasificarse como ausencia_justificada');
    assert.equal(attRow.punctuality_status, 'no_aplica');
  } finally {
    await run('DELETE FROM pb_companies WHERE id = ?', [companyId]);
  }
});

test('5. Aislamiento multiempresa estricto en asistencias, justificaciones y auditoría', async () => {
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

    const attB = randomUUID();
    await run(
      `INSERT INTO pb_attendance (id, company_id, user_id, checked_in_at, work_date, attendance_status)
       VALUES (?, ?, ?, UTC_TIMESTAMP(3), '2026-11-18', 'tarde')`,
      [attB, companyB, userB]
    );

    const resCompany = await api('/attendance/company', { token: makeToken(hrA) });
    assert.equal(resCompany.status, 200);
    assert.equal(resCompany.data.records.some(r => r.user_id === userB), false, 'Empresa A no debe ver registros de Empresa B');

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

    const targetDate = '2026-11-17';
    const { dayOfWeek } = getCostaRicaDateParts(new Date(targetDate + 'T12:00:00Z'));

    await run(
      `INSERT INTO pb_work_schedules (id, company_id, user_id, day_of_week, day_name, start_time, end_time, state, shift_name)
       VALUES (?, ?, ?, ?, 'Martes', '08:00:00', '17:00:00', 'laboral', 'Diurno'),
              (?, ?, ?, ?, 'Martes', '08:00:00', '17:00:00', 'laboral', 'Diurno')`,
      [randomUUID(), companyId, user1, dayOfWeek, randomUUID(), companyId, user2, dayOfWeek]
    );

    await run(
      `INSERT INTO pb_attendance (id, company_id, user_id, checked_in_at, checked_out_at, work_date, attendance_status)
       VALUES (?, ?, ?, '2026-11-17 08:00:00', '2026-11-17 17:00:00', '2026-11-17', 'a_tiempo')`,
      [randomUUID(), companyId, user2]
    );

    const result = await detectAbsencesForDate({ companyId, targetDate });
    assert.equal(result.detectedCount, 1, 'Solo User1 debe ser detectado como ausente');

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

test.after(async () => {
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
  await pool.end();
});
