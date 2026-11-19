import { Router } from 'express';
import multer from 'multer';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { authenticate } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/error.js';
import { HttpError } from '../utils/errors.js';
import { idSchema } from '../utils/validation.js';
import { env } from '../config/env.js';
import { one, run } from '../db/pool.js';
import { seedAttendanceDemoData } from '../db/seedAttendanceDemo.js';
import {
  canReview,
  checkInEmployee,
  checkOutEmployee,
  getAttendanceCurrentState,
  getAttendanceHistory,
  submitJustification,
  reviewJustification,
  getCompanyAttendanceDashboard,
  getCompanyJustifications,
  detectAbsencesForDate,
  getCompanyAttendanceSettings,
  updateCompanyAttendanceSettings,
  getAttendanceAuditLog,
  INCIDENT_TYPES
} from '../services/attendance.service.js';

const router = Router();
router.use(authenticate);
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const emptyBody = z.object({}).strict();
const checkOutBody = z.object({ entryId: z.string().uuid().optional() }).strict();

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }
});

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg']);

/**
 * Consulta el estado actual de la jornada, marcaciones recientes y horario de hoy.
 */
router.get('/', asyncHandler(async (req, res) => {
  const result = await getAttendanceCurrentState(req.companyId, req.user.id);
  res.json(result);
}));

/**
 * Consulta el historial de marcaciones del colaborador autenticado.
 */
router.get('/history', asyncHandler(async (req, res) => {
  const query = z.object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    weekday: z.coerce.number().int().min(0).max(6).optional(),
    status: z.string().optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1)
  }).strict().parse(req.query);

  if (query.from && query.to && query.from > query.to) {
    throw new HttpError(400, 'La fecha final debe ser posterior a la inicial');
  }

  const result = await getAttendanceHistory(req.companyId, req.user.id, {
    from: query.from,
    to: query.to,
    weekday: query.weekday,
    status: query.status,
    page: query.page,
    pageSize: 20
  });

  res.json(result);
}));

/**
 * Registra entrada (check-in) con determinación automática de puntualidad en el backend.
 */
router.post('/in', asyncHandler(async (req, res) => {
  emptyBody.parse(req.body || {});
  const result = await checkInEmployee(req);
  res.status(201).json(result);
}));

/**
 * Registra salida (check-out) con duración de jornada calculada por el servidor.
 */
router.post('/out', asyncHandler(async (req, res) => {
  const payload = checkOutBody.parse(req.body || {});
  const result = await checkOutEmployee(req, payload.entryId);
  res.json(result);
}));

/**
 * Consulta la configuración de asistencia y tolerancia de la compañía.
 */
router.get('/settings', asyncHandler(async (req, res) => {
  const settings = await getCompanyAttendanceSettings(req.companyId);
  res.json({ settings });
}));

/**
 * Actualiza la tolerancia de entrada para la compañía (solo RRHH o Administración).
 */
router.patch('/settings', asyncHandler(async (req, res) => {
  if (!canReview(req.user.role)) {
    throw new HttpError(403, 'Solo Recursos Humanos o Administración pueden configurar la tolerancia.');
  }
  const body = z.object({
    toleranceMinutes: z.number().int().min(0).max(60)
  }).strict().parse(req.body);

  const settings = await updateCompanyAttendanceSettings(req.companyId, req.user.id, body);
  res.json({ ok: true, settings });
}));

/**
 * Presenta una justificación con o sin comprobante adjunto.
 */
router.post('/justifications', upload.single('file'), asyncHandler(async (req, res) => {
  const file = req.file;
  try {
    if (file) {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        throw new HttpError(415, 'Solo se permiten comprobantes en formato PDF, PNG, JPG o JPEG.');
      }
    }

    const body = z.object({
      attendanceId: idSchema.optional().nullable(),
      incidentType: z.enum(Object.keys(INCIDENT_TYPES)),
      incidentDate: z.string().date(),
      incidentTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).optional().nullable(),
      startDate: z.string().date(),
      endDate: z.string().date().optional().nullable(),
      description: z.string().trim().min(5).max(3000),
      comments: z.string().trim().max(1000).optional().nullable()
    }).parse(req.body);

    const result = await submitJustification({
      companyId: req.companyId,
      userId: req.user.id,
      attendanceId: body.attendanceId || null,
      incidentType: body.incidentType,
      incidentDate: body.incidentDate,
      incidentTime: body.incidentTime || null,
      startDate: body.startDate,
      endDate: body.endDate || null,
      description: body.description,
      comments: body.comments || null,
      file
    });

    res.status(201).json(result);
  } finally {
    if (file) {
      await fs.unlink(file.path).catch(() => {});
    }
  }
}));

/**
 * Consulta las justificaciones propias del colaborador.
 */
router.get('/justifications/my', asyncHandler(async (req, res) => {
  const result = await getCompanyJustifications(req.companyId, {
    userId: req.user.id,
    status: req.query.status,
    page: req.query.page,
    limit: req.query.limit
  });
  res.json(result);
}));

/**
 * Consulta el historial de decisiones y auditoría de asistencia (solo RRHH o Administración).
 */
router.get('/audit', asyncHandler(async (req, res) => {
  if (!canReview(req.user.role)) {
    throw new HttpError(403, 'Solo Recursos Humanos o Administración pueden consultar el registro de auditoría.');
  }
  const result = await getAttendanceAuditLog(req.companyId, {
    limit: req.query.limit ? Number(req.query.limit) : 50
  });
  res.json(result);
}));

/**
 * Descarga protegida de un comprobante médico o justificación.
 */
router.get('/justifications/:id/document', asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const row = await one(
    `SELECT document_path, document_original_name, document_mimetype, user_id, company_id
     FROM pb_attendance_justifications
     WHERE id = ? AND company_id = ?`,
    [id, req.companyId]
  );

  if (!row || !row.document_path) {
    throw new HttpError(404, 'Comprobante no encontrado');
  }

  // Protección de privacidad: solo el titular del documento o RRHH/Admin de su empresa
  const isOwner = row.user_id === req.user.id;
  const isHR = canReview(req.user.role);
  if (!isOwner && !isHR) {
    throw new HttpError(403, 'No tienes permiso para acceder a este comprobante confidencial.');
  }

  const filePath = path.join(env.backendDir, 'uploads', 'justifications', path.basename(row.document_path));
  res.set('Content-Type', row.document_mimetype || 'application/octet-stream');
  return res.download(filePath, row.document_original_name || 'comprobante.pdf');
}));

/**
 * Consulta todas las justificaciones de la empresa para revisión de RRHH.
 */
router.get('/justifications/review', asyncHandler(async (req, res) => {
  if (!canReview(req.user.role)) {
    throw new HttpError(403, 'Solo Recursos Humanos o Administración pueden revisar justificaciones.');
  }
  const result = await getCompanyJustifications(req.companyId, {
    status: req.query.status,
    page: req.query.page,
    limit: req.query.limit
  });
  res.json(result);
}));

/**
 * Revisa una justificación (aprobar o rechazar). Solo RRHH o Administración.
 */
router.patch('/justifications/:id/review', asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const body = z.object({
    status: z.enum(['approved', 'rejected', 'info_required']),
    comment: z.string().trim().max(1000).default('')
  }).strict().parse(req.body);

  const result = await reviewJustification({
    companyId: req.companyId,
    reviewerUser: req.user,
    justificationId: id,
    status: body.status,
    reviewComment: body.comment
  });

  res.json(result);
}));

/**
 * Panel de Recursos Humanos: Asistencias e incidencias de toda la empresa con métricas.
 */
router.get('/company', asyncHandler(async (req, res) => {
  if (!canReview(req.user.role)) {
    throw new HttpError(403, 'Solo Recursos Humanos o Administración pueden consultar las asistencias de la empresa.');
  }

  const result = await getCompanyAttendanceDashboard(req.companyId, {
    search: req.query.search,
    email: req.query.email,
    from: req.query.from,
    to: req.query.to,
    weekday: req.query.weekday,
    status: req.query.status,
    incidentType: req.query.incident_type,
    page: req.query.page,
    limit: req.query.limit
  });

  res.json(result);
}));

/**
 * Ejecuta la detección controlada de ausencias para una fecha programada.
 */
router.post('/absences/detect', asyncHandler(async (req, res) => {
  if (!canReview(req.user.role)) {
    throw new HttpError(403, 'Solo Recursos Humanos o Administración pueden ejecutar la detección de ausencias.');
  }
  const body = z.object({
    date: z.string().date().optional()
  }).strict().parse(req.body || {});

  const targetDate = body.date || new Date().toISOString().slice(0, 10);
  const result = await detectAbsencesForDate({
    companyId: req.companyId,
    targetDate
  });

  res.json({ ok: true, result });
}));

/**
 * Genera datos de demostración de asistencia para la empresa autenticada. Solo admin/RRHH.
 */
router.post('/demo/seed', asyncHandler(async (req, res) => {
  if (!canReview(req.user.role)) throw new HttpError(403, 'Solo administradores o RRHH pueden generar datos de prueba.');
  const result = await seedAttendanceDemoData(req.user.company_name);
  res.json({ ok: true, result });
}));

/**
 * Elimina los datos de demostración de la empresa autenticada de forma controlada. Solo admin/RRHH.
 */
router.delete('/demo/clean', asyncHandler(async (req, res) => {
  if (!canReview(req.user.role)) throw new HttpError(403, 'Solo administradores o RRHH pueden limpiar datos de prueba.');
  const [justResult, attResult] = await Promise.all([
    run('DELETE FROM pb_attendance_justifications WHERE company_id = ? AND is_demo = TRUE', [req.companyId]),
    run('DELETE FROM pb_attendance WHERE company_id = ? AND is_demo = TRUE', [req.companyId])
  ]);
  res.json({ ok: true, deletedJustifications: justResult.affectedRows, deletedAttendance: attResult.affectedRows });
}));

export default router;
