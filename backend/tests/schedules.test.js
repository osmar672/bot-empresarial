import {csrfFetch as fetch} from '../../scripts/helpers/csrf-fetch.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { pool, one, many, run } from '../src/db/pool.js';
import {
  generateCompanySchedules,
  getCompanySchedules,
  getUserWeeklySchedule,
  getScheduleSummary,
  SHIFT_TEMPLATES,
  validateShiftCoherence
} from '../src/services/schedule.service.js';

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

test('1. Validación de coherencia horaria en plantillas de turnos', () => {
  for (const shift of SHIFT_TEMPLATES) {
    assert.doesNotThrow(() => {
      validateShiftCoherence({
        state: 'laboral',
        startTime: shift.startTime,
        endTime: shift.endTime,
        breakStart: shift.breakStart,
        breakEnd: shift.breakEnd
      });
    }, `El turno ${shift.name} debe tener horarios coherentes`);

    assert.ok(shift.endTime > shift.startTime, `Salida posterior a entrada en ${shift.name}`);
    if (shift.breakStart && shift.breakEnd) {
      assert.ok(shift.breakEnd > shift.breakStart, `Fin de descanso posterior a inicio en ${shift.name}`);
      assert.ok(shift.breakStart >= shift.startTime, `Descanso inicia tras entrada en ${shift.name}`);
      assert.ok(shift.breakEnd <= shift.endTime, `Descanso termina antes de salida en ${shift.name}`);
    }
  }
});

test('2. Rechazo de turnos incoherentes', () => {
  assert.throws(() => {
    validateShiftCoherence({
      state: 'laboral',
      startTime: '16:00:00',
      endTime: '08:00:00'
    });
  }, /posterior a la de entrada/);

  assert.throws(() => {
    validateShiftCoherence({
      state: 'laboral',
      startTime: '08:00:00',
      endTime: '17:00:00',
      breakStart: '14:00:00',
      breakEnd: '13:00:00'
    });
  }, /Fin de descanso/);
});

test('3. Generación y persistencia de horarios en MySQL para colaboradores de Rockstar', async () => {
  const company = await one("SELECT id, name FROM pb_companies WHERE name = 'Rockstar'");
  assert.ok(company, 'Debe existir la empresa Rockstar');

  // Comprobar registros persistentes en pb_work_schedules
  const countRow = await one(
    'SELECT COUNT(*) AS total FROM pb_work_schedules WHERE company_id = ?',
    [company.id]
  );
  const total = Number(countRow?.total || 0);
  assert.ok(total >= 3500, `Debe haber al menos 3500 jornadas (500 colabs * 7 días), encontrados: ${total}`);

  // Cada colaborador debe tener exactamente 7 registros (días 1 al 7)
  const userDays = await many(
    `SELECT user_id, COUNT(*) AS days_count 
     FROM pb_work_schedules 
     WHERE company_id = ? 
     GROUP BY user_id 
     LIMIT 50`,
    [company.id]
  );
  assert.ok(userDays.length > 0);
  assert.ok(userDays.every(u => Number(u.days_count) === 7), 'Todos los colaboradores deben tener exactamente 7 días');
});

test('4. Diversidad de combinaciones aleatorias en la empresa', async () => {
  const company = await one("SELECT id FROM pb_companies WHERE name = 'Rockstar'");
  assert.ok(company);

  const summary = await getScheduleSummary(company.id);
  assert.ok(summary.collaboratorsWithSchedule >= 500);

  const shiftGroups = new Set(summary.byShift.map(s => s.shift_group));
  assert.ok(shiftGroups.has('Mañana'), 'Debe existir el grupo de turno Mañana');
  assert.ok(shiftGroups.has('Diurno'), 'Debe existir el grupo de turno Diurno');
  assert.ok(shiftGroups.has('Tarde'), 'Debe existir el grupo de turno Tarde');
  assert.ok(shiftGroups.has('Descanso'), 'Debe existir el grupo de Descanso');

  // Variación en días de descanso y laborales
  assert.equal(summary.byDayLaboral.length, 7, 'Debe contener los 7 días de la semana');
  assert.ok(summary.byDayLaboral.some(d => d.resting_workers > 0), 'Debe haber colaboradores descansando');
  assert.ok(summary.byDayLaboral.some(d => d.active_workers > 0), 'Debe haber colaboradores laborando');
});

test('5. Coherencia en registros almacenados en MySQL', async () => {
  const company = await one("SELECT id FROM pb_companies WHERE name = 'Rockstar'");
  assert.ok(company);

  // Comprobar que en jornadas laborales: start_time < end_time
  const invalidLaboral = await many(
    `SELECT id, user_id, day_name, start_time, end_time 
     FROM pb_work_schedules 
     WHERE company_id = ? AND state = 'laboral' AND (end_time <= start_time OR start_time IS NULL OR end_time IS NULL)`,
    [company.id]
  );
  assert.equal(invalidLaboral.length, 0, 'No deben existir jornadas laborales con horas incoherentes o nulas');

  // Comprobar que en días de descanso: horas son NULL
  const invalidRest = await many(
    `SELECT id, user_id, day_name 
     FROM pb_work_schedules 
     WHERE company_id = ? AND state = 'descanso' AND (start_time IS NOT NULL OR end_time IS NOT NULL)`,
    [company.id]
  );
  assert.equal(invalidRest.length, 0, 'En días de descanso las horas laborales deben ser nulas');
});

test('6. No existen duplicaciones por colaborador y día', async () => {
  const company = await one("SELECT id FROM pb_companies WHERE name = 'Rockstar'");
  assert.ok(company);

  const dupes = await many(
    `SELECT user_id, day_of_week, COUNT(*) AS count 
     FROM pb_work_schedules 
     WHERE company_id = ? 
     GROUP BY user_id, day_of_week 
     HAVING count > 1`,
    [company.id]
  );
  assert.equal(dupes.length, 0, 'No deben existir duplicaciones para el mismo colaborador y día');
});

test('7. API /api/schedules/summary entrega métricas de la empresa autenticada', async () => {
  const apiUrl = await getBase();
  const company = await one("SELECT id FROM pb_companies WHERE name = 'Rockstar'");
  const admin = await one("SELECT id FROM pb_users WHERE company_id = ? AND role = 'admin'", [company.id]);
  assert.ok(admin);

  const token = jwt.sign({ sub: admin.id }, env.jwtSecret, { expiresIn: '1h', issuer: 'policybot' });
  const cookie = `policybot_session=${token}`;

  const res = await fetch(`${apiUrl}/schedules/summary`, {
    headers: { Cookie: cookie }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.summary);
  assert.equal(data.summary.companyId, company.id);
  assert.ok(data.summary.totalScheduleRecords >= 3500);
  assert.ok(Array.isArray(data.summary.byShift));
});

test('8. API /api/schedules/user/:userId consulta horario semanal de un colaborador', async () => {
  const apiUrl = await getBase();
  const company = await one("SELECT id FROM pb_companies WHERE name = 'Rockstar'");
  const admin = await one("SELECT id FROM pb_users WHERE company_id = ? AND role = 'admin'", [company.id]);
  const colab = await one("SELECT id FROM pb_users WHERE company_id = ? AND role != 'admin' LIMIT 1", [company.id]);
  assert.ok(admin && colab);

  const token = jwt.sign({ sub: admin.id }, env.jwtSecret, { expiresIn: '1h', issuer: 'policybot' });
  const cookie = `policybot_session=${token}`;

  const res = await fetch(`${apiUrl}/schedules/user/${colab.id}`, {
    headers: { Cookie: cookie }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.user);
  assert.equal(data.user.id, colab.id);
  assert.equal(data.days.length, 7);
  assert.equal(data.hasSchedule, true);
});

test('9. API /api/schedules/my permite al colaborador consultar su propio horario', async () => {
  const apiUrl = await getBase();
  const company = await one("SELECT id FROM pb_companies WHERE name = 'Rockstar'");
  const colab = await one("SELECT id FROM pb_users WHERE company_id = ? AND role != 'admin' LIMIT 1", [company.id]);
  assert.ok(colab);

  const token = jwt.sign({ sub: colab.id }, env.jwtSecret, { expiresIn: '1h', issuer: 'policybot' });
  const cookie = `policybot_session=${token}`;

  const res = await fetch(`${apiUrl}/schedules/my`, {
    headers: { Cookie: cookie }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.user.id, colab.id);
  assert.equal(data.days.length, 7);
});

test('10. Aislamiento estricto multiempresa en horarios laborales', async () => {
  const apiUrl = await getBase();

  // Obtener admin de Logística Pacífico
  const logistica = await one("SELECT id FROM pb_companies WHERE name = 'Logística Pacífico'");
  const logisticaAdmin = await one("SELECT id FROM pb_users WHERE company_id = ? AND role = 'admin'", [logistica.id]);
  assert.ok(logistica && logisticaAdmin);

  // Obtener colaborador de Rockstar
  const rockstar = await one("SELECT id FROM pb_companies WHERE name = 'Rockstar'");
  const rockstarColab = await one("SELECT id FROM pb_users WHERE company_id = ? AND role != 'admin' LIMIT 1", [rockstar.id]);
  assert.ok(rockstarColab);

  const token = jwt.sign({ sub: logisticaAdmin.id }, env.jwtSecret, { expiresIn: '1h', issuer: 'policybot' });
  const cookie = `policybot_session=${token}`;

  // Logística Pacífico intenta consultar el horario del colaborador de Rockstar
  const res = await fetch(`${apiUrl}/schedules/user/${rockstarColab.id}`, {
    headers: { Cookie: cookie }
  });
  assert.equal(res.status, 404, 'Debe devolver 404 y denegar acceso a horarios de colaboradores de otra empresa');

  // Logística Pacífico consulta sus propios horarios: no debe ver ningún registro de Rockstar
  const listRes = await fetch(`${apiUrl}/schedules`, {
    headers: { Cookie: cookie }
  });
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.ok(listData.schedules.every(s => s.company_id === logistica.id), 'Ningún horario debe pertenecer a otra empresa');
});

test('11. Idempotencia en la generación: no sobrescribe sin bandera overwrite', async () => {
  const company = await one("SELECT id FROM pb_companies WHERE name = 'Rockstar'");
  assert.ok(company);

  const before = await one('SELECT COUNT(*) AS total FROM pb_work_schedules WHERE company_id = ?', [company.id]);

  // Ejecutar sin overwrite
  const result = await generateCompanySchedules({
    companyId: company.id,
    overwrite: false
  });
  assert.equal(result.generated, 0, 'No debe generar si ya existen y overwrite es false');
  assert.ok(result.skipped >= 500, 'Debe omitir los colaboradores que ya tienen horario');

  const after = await one('SELECT COUNT(*) AS total FROM pb_work_schedules WHERE company_id = ?', [company.id]);
  assert.equal(Number(before.total), Number(after.total), 'El conteo en MySQL debe permanecer intacto');
});

test.after(async () => {
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
  await pool.end();
});
