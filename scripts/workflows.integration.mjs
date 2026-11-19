import express from "express";
import { createGoogleAuthRouter } from "../backend/src/routes/google-auth.routes.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import app from "../backend/src/app.js";
import { pool, run, one, many } from "../backend/src/db/pool.js";
import { ensureWorkflows } from "../backend/src/db/bootstrapWorkflows.js";
import { base32, totp } from "../backend/src/services/mfa.service.js";
import {
  eligibleQuestion,
  recordKnowledgeGap,
} from "../backend/src/services/knowledgeReview.service.js";
import { rankChunks } from "../backend/src/rag/retrieval.js";
import { processQuestion } from "../backend/src/services/chat.service.js";
import {
  createDocument,
  indexDocument,
} from "../backend/src/services/documents.service.js";
if (process.env.RESEND_API_KEY)
  throw new Error("Unset RESEND_API_KEY: no real mail during tests");
await ensureWorkflows();
const company = randomUUID(),
  other = randomUUID(),
  users = {
    admin: randomUUID(),
    worker: randomUUID(),
    hr: randomUUID(),
    worker2: randomUUID(),
    outsider: randomUUID(),
  },
  cookies = {},
  password = "WorkflowTest2026!",
  email = {};
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port + "/api";
async function req(
  route,
  { who = "worker", method = "GET", body, cookie } = {},
) {
  const res = await fetch(base + route, {
    method,
    headers: {
      ...(cookie || cookies[who] ? { cookie: cookie || cookies[who] } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: res.status,
    data: await res.json(),
    cookies: res.headers.getSetCookie().map((c) => c.split(";")[0]),
  };
}
async function expect(route, options, status) {
  const r = await req(route, options);
  assert.equal(r.status, status, route + " " + JSON.stringify(r.data));
  return r;
}
try {
  for (const cid of [company, other])
    await run(
      "INSERT INTO pb_companies(id,name,plan_id) VALUES (?,?,'gratis')",
      [cid, "Workflows test"],
    );
  const hash = await bcrypt.hash(password, 10);
  for (const [who, id] of Object.entries(users)) {
    email[who] = id + "@example.test";
    await run(
      "INSERT INTO pb_users(id,company_id,name,email,password_hash,role) VALUES (?,?,?,?,?,?)",
      [
        id,
        who === "outsider" ? other : company,
        who,
        email[who],
        hash,
        who === "admin"
          ? "admin"
          : who === "hr"
            ? "rrhh_analista"
            : "colaborador",
      ],
    );
    const r = await expect(
      "/auth/login",
      { who: null, method: "POST", body: { email: email[who], password } },
      200,
    );
    cookies[who] = r.cookies.find((c) => c.startsWith("policybot_session="));
  }
  const body = {
    start: "2026-01-05T08:00:00-06:00",
    end: "2026-01-05T17:00:00-06:00",
    reason: "Olvidé registrar la jornada completa.",
  };
  const correction = (
    await expect("/corrections", { method: "POST", body }, 201)
  ).data;
  await expect("/corrections", { method: "POST", body }, 409);
  await expect("/hr-inbox", { who: "worker" }, 403);
  let inbox = (await expect("/hr-inbox", { who: "hr" }, 200)).data;
  assert.ok(inbox.items.some((i) => i.id === correction.id));
  assert.equal(
    (await expect("/hr-inbox", { who: "outsider" }, 403)).status,
    403,
  );
  await expect(
    "/hr-inbox/correction/" + correction.id + "/remind",
    { who: "hr", method: "POST" },
    200,
  );
  await expect(
    "/hr-inbox/correction/" + correction.id + "/remind",
    { who: "hr", method: "POST" },
    429,
  );
  const reviews = await Promise.all([
    req("/corrections/" + correction.id + "/review", {
      who: "hr",
      method: "PATCH",
      body: {
        status: "approved",
        comment: "Jornada verificada con el supervisor",
      },
    }),
    req("/corrections/" + correction.id + "/review", {
      who: "admin",
      method: "PATCH",
      body: {
        status: "approved",
        comment: "Jornada verificada con el supervisor",
      },
    }),
  ]);
  assert.deepEqual(reviews.map((r) => r.status).sort(), [200, 409]);
  const row = await one(
    "SELECT attendance_id,original_in FROM pb_attendance_corrections WHERE id=?",
    [correction.id],
  );
  assert.ok(row.attendance_id);
  assert.equal(row.original_in, null);
  const change = (
    await expect(
      "/corrections",
      {
        method: "POST",
        body: {
          ...body,
          attendanceId: row.attendance_id,
          end: "2026-01-05T18:00:00-06:00",
        },
      },
      201,
    )
  ).data;
  await run("UPDATE pb_attendance SET checked_out_at=? WHERE id=?", [
    "2026-01-05 23:01:00",
    row.attendance_id,
  ]);
  await expect(
    "/corrections/" + change.id + "/review",
    {
      who: "hr",
      method: "PATCH",
      body: {
        status: "approved",
        comment: "Intento de modificar registro cambiado",
      },
    },
    409,
  );
  const own = (
    await expect(
      "/corrections",
      {
        who: "hr",
        method: "POST",
        body: {
          ...body,
          start: "2026-01-06T08:00:00-06:00",
          end: "2026-01-06T17:00:00-06:00",
        },
      },
      201,
    )
  ).data;
  await expect(
    "/corrections/" + own.id + "/review",
    {
      who: "hr",
      method: "PATCH",
      body: { status: "approved", comment: "No debe aprobarse a sí mismo" },
    },
    403,
  );
  const task = (
    await expect(
      "/onboarding",
      {
        who: "hr",
        method: "POST",
        body: {
          userId: users.worker,
          title: "Leer la guía de bienvenida",
          category: "document",
          description: "Revisa el material y entrega esta tarea.",
          link: "https://example.org/guia",
          dueDate: "2031-01-01",
        },
      },
      201,
    )
  ).data;
  await expect(
    "/onboarding/" + task.id,
    { who: "worker2", method: "PATCH", body: { action: "submit" } },
    403,
  );
  await expect(
    "/onboarding/" + task.id,
    { who: "hr", method: "PATCH", body: { action: "complete" } },
    409,
  );
  await expect(
    "/onboarding/" + task.id,
    { method: "PATCH", body: { action: "submit" } },
    200,
  );
  await expect(
    "/onboarding/" + task.id,
    { who: "hr", method: "PATCH", body: { action: "complete" } },
    200,
  );
  assert.equal(
    (await expect("/onboarding", {}, 200)).data.items[0].state,
    "completed",
  );
  assert.equal(
    (await expect("/onboarding", { who: "outsider" }, 200)).data.items.length,
    0,
  );
  const doc = await createDocument({
    companyId: company,
    name: "Política de asistencia.txt",
    mime: "text/plain",
    allowedRoles: ["admin", "colaborador"],
  });
  await indexDocument(
    company,
    doc,
    "La política de asistencia exige registrar entrada y salida y solicitar una corrección a Recursos Humanos cuando hay un olvido.",
  );
  await expect(
    "/policies",
    {
      who: "admin",
      method: "POST",
      body: { documentId: doc, allowedRoles: ["admin", "colaborador"] },
    },
    201,
  );
  const edition = (await expect("/policies", {}, 200)).data.items[0];
  await expect("/policies/" + edition.id, { who: "outsider" }, 404);
  await expect(
    "/policies/" + edition.id + "/accept",
    { method: "POST", body: { hash: "0".repeat(64), accepted: true } },
    409,
  );
  await expect(
    "/policies/" + edition.id + "/accept",
    { method: "POST", body: { hash: edition.content_hash, accepted: true } },
    200,
  );
  await expect(
    "/policies/" + edition.id + "/accept",
    { method: "POST", body: { hash: edition.content_hash, accepted: true } },
    200,
  );
  assert.equal(
    (await expect("/policies/receipts", { who: "admin" }, 200)).data.items
      .length,
    1,
  );
  await indexDocument(
    company,
    doc,
    "Nueva política: toda corrección de asistencia debe ser aprobada por otra persona de Recursos Humanos y quedar respaldada por el historial.",
  );
  await expect(
    "/policies",
    {
      who: "admin",
      method: "POST",
      body: { documentId: doc, allowedRoles: ["admin", "colaborador"] },
    },
    201,
  );
  assert.equal(
    (await expect("/policies", {}, 200)).data.items[0].accepted_at,
    null,
  );
  await expect(
    "/policies/" + edition.id + "/accept",
    { method: "POST", body: { hash: edition.content_hash, accepted: true } },
    409,
  );
  await run("UPDATE pb_documents SET allowed_roles=? WHERE id=?", [
    JSON.stringify(["admin"]),
    doc,
  ]);
  assert.equal((await expect("/policies", {}, 200)).data.items.length, 0);
  assert.equal((await expect("/policies", {}, 200)).data.history.length, 1);
  assert.equal(
    eligibleQuestion("¿Cuáles son las leyendas de dragones?"),
    false,
  );
  assert.equal(
    eligibleQuestion("¿Cómo se calcula el aguinaldo laboral?"),
    true,
  );
  const question =
    "¿Qué leyes empresariales aplican al trabajo remoto en el extranjero?";
  await processQuestion({
    companyId: company,
    userId: users.worker,
    role: "colaborador",
    question,
    rank: async () => [],
    onEvent: () => {},
    signal: new AbortController().signal,
  });
  await recordKnowledgeGap(company, users.worker, question);
  let gap = await one("SELECT id FROM pb_knowledge_gaps WHERE company_id=?", [
    company,
  ]);
  assert.ok(gap);
  const publish = {
    answer:
      "Recursos Humanos debe revisar la jurisdicción aplicable y las obligaciones del contrato antes de autorizar trabajo desde otro país.",
    source: "https://example.org/ley-laboral",
    allowedRoles: ["admin", "colaborador"],
  };
  await expect(
    "/knowledge/" + gap.id + "/publish",
    { who: "admin", method: "POST", body: publish },
    409,
  );
  await recordKnowledgeGap(company, users.worker2, question);
  await recordKnowledgeGap(company, users.worker2, "¿Quién es Goku?");
  assert.equal(
    (
      await one(
        "SELECT COUNT(*) AS n FROM pb_knowledge_gaps WHERE company_id=?",
        [company],
      )
    ).n,
    1,
  );
  await expect(
    "/knowledge/" + gap.id + "/publish",
    { who: "admin", method: "POST", body: publish },
    200,
  );
  const ranked = await rankChunks(company, question, { role: "colaborador" });
  assert.ok(ranked.some((r) => r.content.includes(publish.answer)));
  assert.equal(
    (await rankChunks(other, question, { role: "colaborador" })).length,
    0,
  );
  await expect("/knowledge", { who: "hr" }, 403);
  await expect(
    "/knowledge/" + gap.id + "/dismiss",
    { who: "admin", method: "POST" },
    200,
  );
  assert.equal(
    (await rankChunks(company, question, { role: "colaborador" })).length,
    0,
  );
  assert.equal(totp(base32(Buffer.from("12345678901234567890")), 1), "287082");
  const before = cookies.worker,
    setup = (
      await expect(
        "/auth/mfa/enroll",
        { method: "POST", body: { password } },
        200,
      )
    ).data;
  assert.match(setup.qr, /^data:image\/png/);
  const usedCode = totp(setup.secret);
  const enabled = await expect(
    "/auth/mfa/enable",
    { method: "POST", body: { password, code: usedCode } },
    200,
  );
  assert.equal(enabled.data.codes.length, 10);
  cookies.worker = enabled.cookies.find((c) =>
    c.startsWith("policybot_session="),
  );
  await expect("/auth/me", { cookie: before }, 401);
  const googleApp = express();
  googleApp.use(express.json());
  googleApp.use(
    "/api/auth/google",
    createGoogleAuthRouter({
      clientId: "test",
      verify: async () => ({ sub: "verified-test-subject" }),
      resolve: async () => ({ id: users.worker }),
    }),
  );
  const googleServer = googleApp.listen(0, "127.0.0.1");
  await new Promise((r) => googleServer.once("listening", r));
  try {
    const u =
        "http://127.0.0.1:" + googleServer.address().port + "/api/auth/google",
      config = await fetch(u + "/config"),
      nonceCookie = config.headers.getSetCookie()[0].split(";")[0];
    const google = await fetch(u, {
      method: "POST",
      headers: { cookie: nonceCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ credential: "fake-verified-by-test" }),
    });
    assert.equal(google.status, 202);
    assert.equal((await google.json()).mfaRequired, true);
    assert.ok(
      !google.headers
        .getSetCookie()
        .some((c) => c.startsWith("policybot_session=")),
    );
  } finally {
    await new Promise((r) => googleServer.close(r));
  }

  const challenge = await expect(
    "/auth/login",
    { who: null, method: "POST", body: { email: email.worker, password } },
    202,
  );
  assert.equal(challenge.data.mfaRequired, true);
  assert.ok(!challenge.cookies.some((c) => c.startsWith("policybot_session=")));
  const challengeCookie = challenge.cookies.find((c) =>
    c.startsWith("luma_mfa_challenge="),
  );
  await expect(
    "/auth/mfa/verify",
    {
      who: null,
      cookie: challengeCookie,
      method: "POST",
      body: { code: usedCode },
    },
    401,
  );
  const verified = await expect(
    "/auth/mfa/verify",
    {
      who: null,
      cookie: challengeCookie,
      method: "POST",
      body: { code: enabled.data.codes[0] },
    },
    200,
  );
  await expect(
    "/auth/mfa/verify",
    {
      who: null,
      cookie: challengeCookie,
      method: "POST",
      body: { code: enabled.data.codes[1] },
    },
    401,
  );
  cookies.worker = verified.cookies.find((c) =>
    c.startsWith("policybot_session="),
  );
  assert.equal((await expect("/auth/mfa", {}, 200)).data.remaining, 9);
  const second = await expect(
      "/auth/login",
      { who: null, method: "POST", body: { email: email.worker, password } },
      202,
    ),
    c2 = second.cookies.find((c) => c.startsWith("luma_mfa_challenge="));
  for (let i = 0; i < 5; i++)
    await expect(
      "/auth/mfa/verify",
      { who: null, cookie: c2, method: "POST", body: { code: "invalid-code" } },
      401,
    );
  await expect(
    "/auth/mfa/verify",
    {
      who: null,
      cookie: c2,
      method: "POST",
      body: { code: enabled.data.codes[1] },
    },
    401,
  );
  const disabled = await expect(
    "/auth/mfa/disable",
    { method: "POST", body: { password, code: enabled.data.codes[1] } },
    200,
  );
  cookies.worker = disabled.cookies.find((c) =>
    c.startsWith("policybot_session="),
  );
  await expect("/auth/me", {}, 200);
  await expect("/auth/me", { cookie: before }, 401);
  assert.ok(
    (
      await many("SELECT action FROM pb_audit_events WHERE company_id=?", [
        company,
      ])
    ).some((e) => e.action === "security.mfa_enabled"),
  );
  console.log(
    "PASS: correction snapshots/concurrency/stale edits/self-review, unified inbox/reminder cooldown, onboarding review/isolation, versioned policy receipts/access revocation, distinct-person knowledge review and real retrieval/withdrawal, TOTP RFC vector, MFA sessions/replay/recovery/attempt limits.",
  );
} finally {
  for (const cid of [company, other]) {
    await run("DELETE FROM pb_attendance WHERE company_id=?", [cid]);
    await run("DELETE FROM pb_companies WHERE id=?", [cid]);
  }
  await new Promise((r) => server.close(r));
  await pool.end();
}
