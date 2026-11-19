import { createHash, randomUUID } from "node:crypto";
import { transaction } from "../db/pool.js";
import { questionRefusal } from "../utils/access.js";
export function normalizeQuestion(question) {
  return question
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export function eligibleQuestion(question) {
  const q = normalizeQuestion(question);
  return (
    !questionRefusal(question) &&
    !/(goku|anime|futbol|videojuego|horoscopo|celebridad)/.test(q) &&
    /\b(?:empresas?|empresarial(?:es)?|laboral(?:es)?|ley(?:es)?|vacaciones|vacacion|permisos?|salarios?|horarios?|reembolsos?|teletrabajo|contratos?|impuestos?|seguridad|politicas?|colaboradores?|recursos? humanos?|derechos?|jornadas?|feriados?|sociedades?|mercantil|comercial|codigo|jurisprudencia|sanciones?|licencias?|incapacidad|despidos?|aguinaldos?)\b/.test(
      q,
    )
  );
}
export async function recordKnowledgeGap(companyId, userId, question) {
  if (!eligibleQuestion(question)) return;
  const hash = createHash("sha256")
    .update(normalizeQuestion(question))
    .digest("hex");
  await transaction(async (cx) => {
    await cx.execute(
      "INSERT INTO pb_knowledge_gaps(id,company_id,question_hash,question) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE id=id",
      [randomUUID(), companyId, hash, question],
    );
    const [[gap]] = await cx.execute(
      "SELECT id FROM pb_knowledge_gaps WHERE company_id=? AND question_hash=?",
      [companyId, hash],
    );
    await cx.execute(
      "INSERT IGNORE INTO pb_knowledge_askers(gap_id,user_id) VALUES (?,?)",
      [gap.id, userId],
    );
    const [[count]] = await cx.execute(
      "SELECT COUNT(*) AS n FROM pb_knowledge_askers a JOIN pb_knowledge_gaps g ON g.id=a.gap_id WHERE a.gap_id=? AND g.status='pending'",
      [gap.id],
    );
    if (count.n >= 2)
      await cx.execute(
        "INSERT IGNORE INTO pb_notifications(id,company_id,user_id,kind,title,body,target,entity_id,event_key) SELECT UUID(),company_id,id,'info','Pregunta lista para revisión','Dos personas han planteado una pregunta empresarial sin fuentes. Revisa la bandeja de IA.','knowledge',?,? FROM pb_users WHERE company_id=? AND role='admin'",
        [gap.id, "knowledge-gap:" + gap.id, companyId],
      );
  });
}
