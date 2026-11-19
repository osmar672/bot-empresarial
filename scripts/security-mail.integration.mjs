import { mailConfiguration } from "../backend/src/services/mailTransport.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pool, run, one } from "../backend/src/db/pool.js";
import {
  requestAccountLink,
  sendSecurityMail,
  consumeAccountToken,
} from "../backend/src/services/accountSecurity.service.js";
import { initializeBackups } from "../backend/src/services/backupSetup.service.js";
if (mailConfiguration().configured)
  throw new Error("Disable the configured mail provider: test must never send real mail");
const company = randomUUID(),
  user = randomUUID(),
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "luma-security-test-"));
let calls = 0;
try {
  await run("INSERT INTO pb_companies(id,name,plan_id) VALUES (?,?,'gratis')", [
    company,
    "Mail dispatcher test",
  ]);
  await run(
    "INSERT INTO pb_users(id,company_id,name,email,password_hash,role) VALUES (?,?,?,?,?,'colaborador')",
    [user, company, "Test", user + "@example.test", "not-a-login-hash"],
  );
  for (const purpose of ["verify", "reset"]) {
    const link = await requestAccountLink(user, purpose);
    const sent = [];
    const send = async (mail) => {
      calls++;
      sent.push(mail);
    };
    await Promise.all([
      sendSecurityMail(link.mailId, { send }),
      sendSecurityMail(link.mailId, { send }),
    ]);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].recipient, user + "@example.test");
    const token = sent[0].body.match(/token=([a-f0-9]{64})/)[1];
    assert.ok(token);
    const state = await one(
      "SELECT state,sent_at FROM pb_security_mail WHERE id=?",
      [link.mailId],
    );
    assert.equal(state.state, "sent");
    assert.ok(state.sent_at);
    await consumeAccountToken(
      token,
      purpose,
      purpose === "reset" ? "NewPassword2026!" : undefined,
    );
    await assert.rejects(() =>
      consumeAccountToken(token, purpose, "Replay2026!"),
    );
  }
  assert.equal(calls, 2);
  const failure = await requestAccountLink(user, "verify");
  assert.equal(
    (
      await sendSecurityMail(failure.mailId, {
        send: async () => {
          throw new Error("provider unavailable");
        },
      })
    ).status,
    "pending",
  );
  assert.equal(
    (
      await one("SELECT last_error FROM pb_security_mail WHERE id=?", [
        failure.mailId,
      ])
    ).last_error,
    "MAIL_DELIVERY_FAILED",
  );
  const file = path.join(dir, ".env");
  delete process.env.BACKUP_ENCRYPTION_KEY;
  await fs.writeFile(file, "UNRELATED=preserve\n");
  await initializeBackups({ file });
  const first = await fs.readFile(file, "utf8");
  assert.match(first, /BACKUP_ENABLED=true/);
  assert.match(first, /BACKUP_ENCRYPTION_KEY=[a-f0-9]{64}/);
  await initializeBackups({ file });
  assert.equal(await fs.readFile(file, "utf8"), first);
  assert.match(first, /UNRELATED=preserve/);
  if (process.platform !== "win32")
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  delete process.env.BACKUP_ENCRYPTION_KEY;
  await initializeBackups({ file });
  assert.equal(await fs.readFile(file, "utf8"), first);
  console.log(
    "PASS: one-time mail claiming, reset/verification consumption and replay rejection, retry status, private backup initialization preserves key and existing settings. No external mail sent.",
  );
} finally {
  await run("DELETE FROM pb_companies WHERE id=?", [company]);
  await fs.rm(dir, { recursive: true, force: true });
  await pool.end();
}
