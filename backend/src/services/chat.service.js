import {randomUUID} from 'node:crypto';
import {one, many, run, transaction} from '../db/pool.js';
import {rankChunks} from '../rag/retrieval.js';
import {buildPrompt, streamGroq} from './groq.service.js';
import {env} from '../config/env.js';
import {HttpError} from '../utils/errors.js';

/**
 * Limpia solicitudes abandonadas en estado 'processing' que lleven más de 10 minutos.
 * Evita bloqueos perpetuos de cuota sin borrar información histórica.
 */
export async function cleanupStaleMessages(companyId = null) {
  const sql = companyId
    ? `UPDATE pb_messages SET state='error', error_message='Tiempo de espera excedido o solicitud abandonada' WHERE company_id=? AND state='processing' AND created_at < UTC_TIMESTAMP() - INTERVAL 10 MINUTE`
    : `UPDATE pb_messages SET state='error', error_message='Tiempo de espera excedido o solicitud abandonada' WHERE state='processing' AND created_at < UTC_TIMESTAMP() - INTERVAL 10 MINUTE`;
  await run(sql, companyId ? [companyId] : []).catch(() => {});
}

/**
 * Historial general o por conversación de un usuario.
 */
export async function history(companyId, userId, conversationId = null) {
  if (conversationId) {
    return many(
      `SELECT id, conversation_id, question, answer, sources, input_tokens, output_tokens, total_tokens, model, duration_ms, state, created_at
       FROM pb_messages
       WHERE company_id=? AND user_id=? AND conversation_id=? AND state='ok'
       ORDER BY created_at ASC`,
      [companyId, userId, conversationId]
    );
  }
  return many(
    `SELECT id, conversation_id, question, answer, sources, input_tokens, output_tokens, total_tokens, model, duration_ms, state, created_at
     FROM pb_messages
     WHERE company_id=? AND user_id=? AND state='ok'
     ORDER BY created_at DESC LIMIT 40`,
    [companyId, userId]
  );
}

/**
 * Lista las conversaciones activas del usuario, ordenadas por última actualización.
 */
export async function listConversations(companyId, userId) {
  await cleanupStaleMessages(companyId);
  return many(
    `SELECT c.id, c.title, c.created_at, c.updated_at,
      (SELECT COUNT(*) FROM pb_messages m WHERE m.conversation_id = c.id AND m.company_id = c.company_id AND m.state='ok') AS message_count,
      (SELECT m.question FROM pb_messages m WHERE m.conversation_id = c.id AND m.company_id = c.company_id ORDER BY m.created_at DESC LIMIT 1) AS last_question
     FROM pb_conversations c
     WHERE c.company_id = ? AND c.user_id = ?
     ORDER BY c.updated_at DESC`,
    [companyId, userId]
  );
}

/**
 * Obtiene el detalle de una conversación y todos sus mensajes en orden cronológico.
 */
export async function getConversation(companyId, userId, conversationId) {
  const conversation = await one(
    `SELECT id, title, created_at, updated_at
     FROM pb_conversations
     WHERE id = ? AND company_id = ? AND user_id = ?`,
    [conversationId, companyId, userId]
  );
  if (!conversation) throw new HttpError(404, 'Conversación no encontrada');

  const messages = await many(
    `SELECT id, conversation_id, question, answer, sources, input_tokens, output_tokens, total_tokens, model, provider, duration_ms, state, error_message, created_at
     FROM pb_messages
     WHERE conversation_id = ? AND company_id = ? AND user_id = ?
     ORDER BY created_at ASC`,
    [conversationId, companyId, userId]
  );

  return { conversation, messages };
}

/**
 * Crea una nueva conversación aislada para la empresa y el usuario.
 */
export async function createConversation(companyId, userId, title = 'Nueva conversación') {
  const id = randomUUID();
  const cleanTitle = (title || 'Nueva conversación').trim().slice(0, 255);
  await run(
    `INSERT INTO pb_conversations(id, company_id, user_id, title) VALUES (?, ?, ?, ?)`,
    [id, companyId, userId, cleanTitle]
  );
  return { id, title: cleanTitle };
}

/**
 * Elimina una conversación y sus mensajes asociados (cascade en DB).
 */
export async function deleteConversation(companyId, userId, conversationId) {
  const res = await run(
    `DELETE FROM pb_conversations WHERE id = ? AND company_id = ? AND user_id = ?`,
    [conversationId, companyId, userId]
  );
  if (!res.affectedRows) throw new HttpError(404, 'Conversación no encontrada');
  return { ok: true };
}

/**
 * Actualiza el título de una conversación.
 */
export async function updateConversationTitle(companyId, userId, conversationId, title) {
  const cleanTitle = String(title || '').trim().slice(0, 255);
  if (!cleanTitle) throw new HttpError(400, 'El título no puede estar vacío');
  const res = await run(
    `UPDATE pb_conversations SET title = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND company_id = ? AND user_id = ?`,
    [cleanTitle, conversationId, companyId, userId]
  );
  if (!res.affectedRows) throw new HttpError(404, 'Conversación no encontrada');
  return { ok: true, title: cleanTitle };
}

/**
 * Recupera la memoria conversacional reciente para enviarla a Groq.
 * Límite predeterminado: últimos 6 mensajes completados (3 intercambios Q/A).
 */
export async function getConversationMemory(companyId, userId, conversationId, limit = 6) {
  if (!conversationId) return [];
  const rows = await many(
    `SELECT question, answer
     FROM pb_messages
     WHERE conversation_id = ? AND company_id = ? AND user_id = ? AND state = 'ok' AND answer IS NOT NULL
     ORDER BY created_at DESC LIMIT ?`,
    [conversationId, companyId, userId, limit]
  );
  const chronological = rows.reverse();
  const memory = [];
  for (const r of chronological) {
    if (r.question) memory.push({ role: 'user', text: r.question });
    if (r.answer) memory.push({ role: 'assistant', text: r.answer });
  }
  return memory;
}

/**
 * Reserva la pregunta verificando cuota mensual y resolviendo la conversación asociada.
 */
export async function reserveQuestion(companyId, userId, question, conversationId = null) {
  const id = randomUUID();
  let activeConvId = conversationId;

  await transaction(async cx => {
    // 1. Limpieza preventiva de mensajes colgados
    await cx.execute(
      `UPDATE pb_messages SET state='error', error_message='Tiempo de espera excedido' WHERE company_id=? AND state='processing' AND created_at < UTC_TIMESTAMP() - INTERVAL 10 MINUTE`,
      [companyId]
    );

    // 2. Verificación de cuota del plan
    const [companyRows] = await cx.execute(
      `SELECT c.id, p.max_questions_month FROM pb_companies c JOIN pb_plans p ON p.id=c.plan_id WHERE c.id=? FOR UPDATE`,
      [companyId]
    );
    if (!companyRows.length) throw new HttpError(404, 'Empresa no encontrada');

    const [usageRows] = await cx.execute(
      `SELECT COUNT(*) AS used FROM pb_messages WHERE company_id=? AND (state='ok' OR (state='processing' AND created_at>=UTC_TIMESTAMP()-INTERVAL 15 MINUTE)) AND created_at>=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-01') AND created_at<DATE_FORMAT(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 MONTH),'%Y-%m-01')`,
      [companyId]
    );
    if (usageRows[0].used >= companyRows[0].max_questions_month) {
      throw new HttpError(429, 'Has alcanzado el límite mensual de preguntas de tu plan');
    }

    // 3. Resolución de la conversación
    if (activeConvId) {
      const [convRows] = await cx.execute(
        `SELECT id, title FROM pb_conversations WHERE id=? AND company_id=? AND user_id=?`,
        [activeConvId, companyId, userId]
      );
      if (!convRows.length) throw new HttpError(404, 'Conversación no encontrada');
      if (convRows[0].title === 'Nueva conversación') {
        const generatedTitle = question.slice(0, 50) + (question.length > 50 ? '...' : '');
        await cx.execute(
          `UPDATE pb_conversations SET title=?, updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
          [generatedTitle, activeConvId]
        );
      } else {
        await cx.execute(
          `UPDATE pb_conversations SET updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
          [activeConvId]
        );
      }
    } else {
      activeConvId = randomUUID();
      const autoTitle = question.slice(0, 50) + (question.length > 50 ? '...' : '');
      await cx.execute(
        `INSERT INTO pb_conversations(id, company_id, user_id, title) VALUES (?, ?, ?, ?)`,
        [activeConvId, companyId, userId, autoTitle]
      );
    }

    // 4. Registro inicial con estado 'processing'
    await cx.execute(
      `INSERT INTO pb_messages(id, company_id, user_id, conversation_id, question, state, provider, model)
       VALUES (?, ?, ?, ?, ?, 'processing', 'groq', ?)`,
      [id, companyId, userId, activeConvId, question, env.groqModel]
    );
  });

  return { messageId: id, conversationId: activeConvId };
}

/**
 * Prepara la pregunta recuperando fuentes RAG y memoria previa antes del streaming.
 */
export async function prepareQuestion({ companyId, userId, question, conversationId = null, rank = rankChunks }) {
  const { messageId, conversationId: resolvedConvId } = await reserveQuestion(companyId, userId, question, conversationId);
  try {
    const sources = await rank(companyId, question);
    if (sources.length && !env.groqKey) {
      throw new HttpError(503, 'Configura GROQ_API_KEY para utilizar el chatbot');
    }
    const memory = await getConversationMemory(companyId, userId, resolvedConvId, 6);
    return { sources, messageId, conversationId: resolvedConvId, memory };
  } catch (error) {
    await run(
      `UPDATE pb_messages SET state='error', error_message=? WHERE id=? AND company_id=?`,
      [String(error.message || 'Error').slice(0, 500), messageId, companyId]
    );
    throw error;
  }
}

/**
 * Procesa la generación de respuesta en streaming capturando tokens y trazabilidad.
 */
export async function processQuestion({
  companyId,
  userId,
  companyName,
  question,
  conversationId = null,
  onEvent,
  signal,
  prepared = null,
  rank = rankChunks,
  groq = streamGroq
}) {
  const startTime = Date.now();
  const { sources, messageId, conversationId: activeConvId, memory } = prepared || await prepareQuestion({ companyId, userId, question, conversationId, rank });
  const validSources = sources.map(s => ({ id: s.ref, documentId: s.document_id, name: s.document_name, url: s.drive_url || null }));

  let answer = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let reportedModel = env.groqModel;

  onEvent({ type: 'conversation', conversationId: activeConvId });
  onEvent({ type: 'sources', sources: validSources });

  try {
    if (!sources.length) {
      answer = 'No encuentro esa información en los documentos disponibles.';
      onEvent({ type: 'delta', text: answer });
    } else {
      const promptMessages = buildPrompt(companyName, sources, question, memory);
      for await (const item of groq(promptMessages, signal)) {
        if (item.type === 'delta') {
          answer += item.text;
          onEvent(item);
        }
        if (item.type === 'usage') {
          inputTokens = Number(item.usage?.prompt_tokens || 0);
          outputTokens = Number(item.usage?.completion_tokens || 0);
          totalTokens = Number(item.usage?.total_tokens || (inputTokens + outputTokens));
          if (item.model) reportedModel = item.model;
        }
      }
    }

    if (signal.aborted) {
      throw new Error('Respuesta interrumpida por el usuario');
    }

    const durationMs = Date.now() - startTime;
    if (!totalTokens && (inputTokens || outputTokens)) {
      totalTokens = inputTokens + outputTokens;
    }

    await run(
      `UPDATE pb_messages
       SET answer=?, sources=?, input_tokens=?, output_tokens=?, total_tokens=?, model=?, provider='groq', duration_ms=?, state='ok', error_message=NULL
       WHERE id=? AND company_id=?`,
      [answer, JSON.stringify(validSources), inputTokens, outputTokens, totalTokens, reportedModel, durationMs, messageId, companyId]
    );

    onEvent({
      type: 'done',
      messageId,
      conversationId: activeConvId,
      inputTokens,
      outputTokens,
      totalTokens,
      model: reportedModel,
      durationMs
    });
  } catch (e) {
    const durationMs = Date.now() - startTime;
    const isAborted = signal?.aborted || e.name === 'AbortError' || String(e.message).includes('interrumpida');
    const errorMessage = isAborted ? 'Respuesta interrumpida por el usuario' : String(e.message || 'Error').slice(0, 500);

    if (!totalTokens && (inputTokens || outputTokens)) {
      totalTokens = inputTokens + outputTokens;
    }

    // Conservar consumo de tokens confirmado por el proveedor aunque la solicitud falle o se interrumpa
    await run(
      `UPDATE pb_messages
       SET state='error', error_message=?, input_tokens=?, output_tokens=?, total_tokens=?, model=?, provider='groq', duration_ms=?
       WHERE id=? AND company_id=?`,
      [errorMessage, inputTokens, outputTokens, totalTokens, reportedModel, durationMs, messageId, companyId]
    ).catch(() => {});

    throw e;
  }
}
