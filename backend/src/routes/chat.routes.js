import {Router} from 'express';
import {authenticate} from '../middlewares/auth.js';
import {asyncHandler} from '../middlewares/error.js';
import {messageSchema, conversationSchema, idSchema} from '../utils/validation.js';
import {
  history,
  listConversations,
  getConversation,
  createConversation,
  deleteConversation,
  updateConversationTitle,
  prepareQuestion,
  processQuestion
} from '../services/chat.service.js';

const router = Router();
router.use(authenticate);

// Listar conversaciones del usuario autenticado
router.get('/conversations', asyncHandler(async (req, res) => {
  const conversations = await listConversations(req.companyId, req.user.id);
  res.json({ conversations });
}));

// Crear una conversación manualmente
router.post('/conversations', asyncHandler(async (req, res) => {
  const { title } = conversationSchema.parse(req.body || {});
  const conversation = await createConversation(req.companyId, req.user.id, title);
  res.status(201).json({ conversation });
}));

// Obtener mensajes de una conversación específica
router.get('/conversations/:id', asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const data = await getConversation(req.companyId, req.user.id, id);
  res.json(data);
}));

// Actualizar título de una conversación
router.patch('/conversations/:id', asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { title } = conversationSchema.parse(req.body);
  const updated = await updateConversationTitle(req.companyId, req.user.id, id, title);
  res.json(updated);
}));

// Eliminar una conversación y sus mensajes asociados
router.delete('/conversations/:id', asyncHandler(async (req, res) => {
  const id = idSchema.parse(req.params.id);
  await deleteConversation(req.companyId, req.user.id, id);
  res.json({ ok: true });
}));

// Historial (retrocompatible con el endpoint anterior)
router.get('/history', asyncHandler(async (req, res) => {
  const conversationId = req.query.conversationId ? idSchema.parse(req.query.conversationId) : null;
  const messages = await history(req.companyId, req.user.id, conversationId);
  res.json({ messages });
}));

// Streaming SSE con persistencia, memoria conversacional y captura de tokens
router.post('/stream', asyncHandler(async (req, res) => {
  const { question, conversationId } = messageSchema.parse(req.body);

  // Validar fuentes, credenciales y cuota ANTES de confirmar HTTP 200.
  // Así los límites de cuota responden 429 como exige la práctica.
  const prepared = await prepareQuestion({
    companyId: req.companyId,
    userId: req.user.id,
    question,
    conversationId: conversationId || null
  });

  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    'Connection': 'keep-alive'
  });
  res.flushHeaders();

  const send = (event) => {
    if (!res.destroyed) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    await processQuestion({
      companyId: req.companyId,
      userId: req.user.id,
      companyName: req.user.company_name,
      question,
      conversationId: prepared.conversationId,
      onEvent: send,
      signal: controller.signal,
      prepared
    });
  } catch (e) {
    console.error('Error de chat:', e);
    if (!controller.signal.aborted) {
      send({
        type: 'error',
        error: e.status ? e.message : 'No se pudo generar la respuesta',
        status: e.status || 500
      });
    }
  } finally {
    if (!res.destroyed) res.end();
  }
}));

export default router;
