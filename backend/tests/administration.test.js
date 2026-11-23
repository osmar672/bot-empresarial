import {csrfFetch as fetch} from '../../scripts/helpers/csrf-fetch.mjs';
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { pool, run, transaction } from "../src/db/pool.js";

test("administration reports exact tenant totals and only allows administrators", async t => {
  const companies = [randomUUID(), randomUUID()];
  const [admin, collaborator, hr, otherAdmin] = Array.from({ length: 4 }, () => randomUUID());
  const activityId = randomUUID();
  t.after(async () => {
    try {
      await run("DELETE FROM pb_companies WHERE id IN (?,?)", companies);
    } finally {
      await pool.end();
    }
  });

  await transaction(async cx => {
    await cx.execute("INSERT INTO pb_companies(id,name) VALUES (?,?),(?,?)",
      [companies[0], "Panel A", companies[1], "Panel B"]);
    for (const [id, company, role] of [
      [admin, companies[0], "admin"],
      [collaborator, companies[0], "colaborador"],
      [hr, companies[0], "rrhh"],
      [otherAdmin, companies[1], "admin"],
    ]) {
      await cx.execute("INSERT INTO pb_users(id,company_id,email,name,password_hash,role) VALUES (?,?,?,?,?,?)",
        [id, company, id + "@example.test", role, "fixture", role]);
    }
    await cx.execute(
      `INSERT INTO pb_documents(id,company_id,name,source,mime_type,state)
       VALUES (?,?,'Fallo','upload','text/plain','error'), (?,?,'Otro','upload','text/plain','indexado')`,
      [randomUUID(), companies[0], randomUUID(), companies[1]],
    );
    await cx.execute(
      `INSERT INTO pb_vacation_requests(id,company_id,user_id,start_date,end_date,reason,status)
       VALUES (?,?,?,CURRENT_DATE,CURRENT_DATE,'fixture','pending'),
              (?,?,?,CURRENT_DATE,CURRENT_DATE,'fixture','cancelled')`,
      [randomUUID(), companies[0], collaborator, randomUUID(), companies[0], collaborator],
    );
    await cx.execute(
      `INSERT INTO pb_audit_events(id,company_id,actor_id,action,target_type,detail)
       VALUES (?,?,?,'documents.uploaded','document',JSON_OBJECT('private','fixture')),
              (?,?,?,'users.role_changed','user',JSON_OBJECT())`,
      [activityId, companies[0], admin, randomUUID(), companies[1], otherAdmin],
    );
  });

  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise(resolve => server.close(resolve)));
  await once(server, "listening");
  const endpoint = `http://127.0.0.1:${server.address().port}/api/administration`;
  const load = id => fetch(endpoint, {
    headers: id ? { cookie: "policybot_session=" + jwt.sign({ sub: id }, env.jwtSecret, { issuer: "policybot" }) } : {},
  });

  assert.equal((await load()).status, 401);
  for (const id of [collaborator, hr]) {
    assert.equal((await load(id)).status, 403);
  }

  const response = await load(admin);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.name, "Panel A");
  assert.equal(data.collaborators, 2);
  assert.equal(data.documents, 1);
  assert.equal(data.documentErrors, 1);
  assert.equal(data.vacations, 1);
  assert.equal(data.permissions, 0);
  assert.equal(data.corrections, 0);
  assert.equal(data.knowledge, 0);
  assert.deepEqual(data.activity.map(event => event.id), [activityId]);
  assert.equal(data.activity[0].actor, "admin");
  assert.equal(Object.hasOwn(data.activity[0], "detail"), false);
  assert.equal(typeof data.integrations.googleLogin, "boolean");
  assert.equal(typeof data.integrations.mail, "boolean");

  const otherResponse = await load(otherAdmin);
  assert.equal(otherResponse.status, 200);
  const other = await otherResponse.json();
  assert.equal(other.name, "Panel B");
  assert.equal(other.collaborators, 0);
  assert.equal(other.documents, 1);
  assert.equal(other.documentErrors, 0);
  assert.equal(other.vacations, 0);
  assert.deepEqual(other.activity.map(event => event.action), ["users.role_changed"]);
});
