import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
const execute = (cx, sql, params) =>
  cx ? cx.execute(sql, params) : pool.execute(sql, params);
export async function audit(
  {
    companyId,
    actorId = null,
    action,
    targetType,
    targetId = null,
    detail = {},
  },
  cx,
) {
  let actorName = null;
  if (actorId) {
    const [rows] = await execute(
      cx,
      "SELECT name FROM pb_users WHERE id=? AND company_id=?",
      [actorId, companyId],
    );
    actorName = rows[0]?.name || null;
  }
  await execute(
    cx,
    "INSERT INTO pb_audit_events(id,company_id,actor_id,action,target_type,target_id,detail) VALUES (?,?,?,?,?,?,?)",
    [
      randomUUID(),
      companyId,
      actorId,
      action,
      targetType,
      targetId,
      JSON.stringify({ ...detail, actorName }),
    ],
  );
}
export async function notify(
  {
    companyId,
    userId,
    kind = "info",
    title,
    body,
    target = "profile",
    entityId = null,
    eventKey = null,
  },
  cx,
) {
  await execute(
    cx,
    "INSERT IGNORE INTO pb_notifications(id,company_id,user_id,kind,title,body,target,entity_id,event_key) VALUES (?,?,?,?,?,?,?,?,?)",
    [
      randomUUID(),
      companyId,
      userId,
      kind,
      title,
      body,
      target,
      entityId,
      eventKey,
    ],
  );
}
export async function notifyReviewers(
  { companyId, exclude = null, title, body, target = "hr", entityId = null },
  cx,
) {
  await execute(
    cx,
    "INSERT INTO pb_notifications(id,company_id,user_id,kind,title,body,target,entity_id) SELECT UUID(),company_id,id,'hr',?,?,?,? FROM pb_users WHERE company_id=? AND (role='admin' OR role='rrhh' OR LEFT(role,5)='rrhh_') AND (? IS NULL OR id<>?)",
    [title, body, target, entityId, companyId, exclude, exclude],
  );
}
export async function notifyDocument(companyId, documentId, cx) {
  await execute(
    cx,
    "INSERT IGNORE INTO pb_notifications(id,company_id,user_id,kind,title,body,target,entity_id,event_key) SELECT UUID(),u.company_id,u.id,'document','Documento disponible',d.name,'documents',d.id,CONCAT('document:',d.id) FROM pb_users u JOIN pb_documents d ON d.company_id=u.company_id WHERE d.company_id=? AND d.id=? AND (u.role='admin' OR JSON_CONTAINS(d.allowed_roles,JSON_QUOTE(u.role)))",
    [companyId, documentId],
  );
}
