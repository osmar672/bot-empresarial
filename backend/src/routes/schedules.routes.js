import { Router } from 'express';
import { z } from 'zod';
import { authenticate, adminOnly } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/error.js';
import { idSchema } from '../utils/validation.js';
import {
  generateCompanySchedules,
  getCompanySchedules,
  getUserWeeklySchedule,
  getScheduleSummary
} from '../services/schedule.service.js';

const router = Router();
router.use(authenticate);

const generateSchema = z.object({
  overwrite: z.boolean().optional().default(false),
  userId: idSchema.optional()
}).strict();

/**
 * Genera horarios aleatorios para los colaboradores de la empresa autenticada.
 * Solo administradores autorizados.
 */
router.post('/generate', adminOnly, asyncHandler(async (req, res) => {
  const { overwrite, userId } = generateSchema.parse(req.body || {});
  const result = await generateCompanySchedules({
    companyId: req.companyId,
    overwrite,
    targetUserId: userId
  });
  res.json({ ok: true, result });
}));

/**
 * Consulta el resumen y estadísticas de horarios de la empresa.
 * Solo administradores autorizados.
 */
router.get('/summary', adminOnly, asyncHandler(async (req, res) => {
  const summary = await getScheduleSummary(req.companyId);
  res.json({ summary });
}));

/**
 * Consulta el horario del colaborador autenticado (mis 7 días).
 * Cualquier usuario autenticado puede consultar su propio horario.
 */
router.get('/my', asyncHandler(async (req, res) => {
  const schedule = await getUserWeeklySchedule(req.companyId, req.user.id);
  res.json(schedule);
}));

/**
 * Consulta los horarios de los 7 días de un colaborador específico.
 * Solo administradores autorizados.
 */
router.get('/user/:userId', adminOnly, asyncHandler(async (req, res) => {
  const userId = idSchema.parse(req.params.userId);
  const schedule = await getUserWeeklySchedule(req.companyId, userId);
  res.json(schedule);
}));

/**
 * Consulta los horarios de la compañía con filtros y paginación.
 * Solo administradores autorizados.
 */
router.get('/', adminOnly, asyncHandler(async (req, res) => {
  const { day_of_week, shift, state, user_id, search, page, limit } = req.query;

  const result = await getCompanySchedules(req.companyId, {
    dayOfWeek: day_of_week,
    shiftName: typeof shift === 'string' ? shift : undefined,
    state: typeof state === 'string' ? state : undefined,
    userId: typeof user_id === 'string' ? user_id : undefined,
    search: typeof search === 'string' ? search : undefined,
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 25
  });

  res.json(result);
}));

export default router;
