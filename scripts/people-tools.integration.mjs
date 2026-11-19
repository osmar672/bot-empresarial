import { mailConfiguration } from "../backend/src/services/mailTransport.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { getDocumentProxy, extractText } from "unpdf";
import app from "../backend/src/app.js";
import { pool, run, one, many } from "../backend/src/db/pool.js";
import { ensurePeopleTools } from "../backend/src/db/bootstrapPeopleTools.js";
import { countWorkingDays } from "../backend/src/services/leaveBalance.service.js";
if (mailConfiguration().configured)
  throw new Error(
    "Run with mail delivery disabled; test fixtures must not send mail.",
  );
await ensurePeopleTools();
const company = randomUUID(),
  other = randomUUID(),
  users = {
    admin: randomUUID(),
    worker: randomUUID(),
    hr: randomUUID(),
    outsider: randomUUID(),
  },
  cookies = {},
  password = "SecurePeople2026!",
  secret = "Privado-" + randomUUID();
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + server.address().port + "/api";
async function req(route, { method = "GET", body, who = "worker" } = {}) {
  const response = await fetch(base + route, {
    method,
    headers: {
      ...(cookies[who] ? { cookie: cookies[who] } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (response.headers.get("content-type") || "").includes("json");
  return {
    status: response.status,
    data: json
      ? await response.json()
      : Buffer.from(await response.arrayBuffer()),
    cookie: response.headers.get("set-cookie")?.split(";")[0],
    headers: response.headers,
  };
}
async function expect(route, options, status) {
  const r = await req(route, options);
  assert.equal(r.status, status, route + ": " + JSON.stringify(r.data));
  return r.data;
}
try {
  for (const id of [company, other])
    await run(
      "INSERT INTO pb_companies(id,name,plan_id) VALUES (?,?,'gratis')",
      [id, "People tools test " + id],
    );
  const hash = await bcrypt.hash(password, 10);
  for (const [name, id] of Object.entries(users)) {
    const email = id + "@example.test";
    await run(
      "INSERT INTO pb_users(id,company_id,name,email,password_hash,role) VALUES (?,?,?,?,?,?)",
      [
        id,
        name === "outsider" ? other : company,
        name === "worker" ? '=HYPERLINK("fake")' : name,
        email,
        hash,
        name === "hr"
          ? "rrhh_analista"
          : name === "admin"
            ? "admin"
            : "colaborador",
      ],
    );
    const login = await req("/auth/login", {
      who: null,
      method: "POST",
      body: { email, password },
    });
    assert.equal(login.status, 200);
    cookies[name] = login.cookie;
  }
  assert.deepEqual(
    countWorkingDays("2031-05-12", "2031-05-18", {
      weekdays: [1, 2, 3, 4, 5],
      holidays: ["2031-05-14"],
    }).days,
    4,
  );
  await expect("/leave-policy", { who: "worker" }, 403);
  await expect(
    "/leave-policy",
    {
      who: "hr",
      method: "PUT",
      body: {
        automatic: true,
        count_mode: "weekdays",
        weekdays: [1, 2, 3, 4, 5],
      },
    },
    200,
  );
  await expect(
    "/leave-policy/balances/" + users.worker,
    {
      who: "hr",
      method: "PUT",
      body: { value: 10, note: "Saldo inicial verificado por RH" },
    },
    200,
  );
  await run(
    "INSERT INTO pb_holidays(id,company_id,day,title) VALUES (?,?,?,'Feriado de prueba')",
    [randomUUID(), company, "2031-05-14"],
  );
  const estimated = await expect(
    "/leave-policy/estimate?start=2031-05-12&end=2031-05-18",
    {},
    200,
  );
  assert.equal(estimated.days, 4);
  await expect(
    "/leave-policy/estimate?start=2031-05-12&end=2031-05-18&userId=" +
      users.outsider,
    { who: "admin" },
    404,
  );
  const v = await expect(
    "/vacations",
    {
      method: "POST",
      body: {
        startDate: "2031-05-12",
        endDate: "2031-05-18",
        reason: "Vacaciones familiares solicitadas con tiempo.",
      },
    },
    201,
  );
  const decisions = await Promise.all([
    req("/vacations/" + v.id + "/review", {
      who: "hr",
      method: "PATCH",
      body: { status: "approved" },
    }),
    req("/vacations/" + v.id + "/review", {
      who: "admin",
      method: "PATCH",
      body: { status: "approved" },
    }),
  ]);
  assert.deepEqual(decisions.map((r) => r.status).sort(), [200, 409]);
  let mine = await expect("/leave-policy/mine", {}, 200);
  assert.equal(mine.available, 6);
  assert.equal(mine.ledger.filter((l) => l.kind === "debit").length, 1);
  const insufficient = await expect(
    "/vacations",
    {
      method: "POST",
      body: {
        startDate: "2031-06-02",
        endDate: "2031-06-15",
        reason: "Solicitud que supera el saldo disponible.",
      },
    },
    201,
  );
  await expect(
    "/vacations/" + insufficient.id + "/review",
    { who: "hr", method: "PATCH", body: { status: "approved" } },
    409,
  );
  assert.equal((await expect("/leave-policy/mine", {}, 200)).available, 6);
  await expect(
    "/permissions",
    {
      method: "POST",
      body: {
        category: "medical",
        startDate: "2020-01-01",
        endDate: "2020-01-01",
        startTime: "09:00",
        endTime: "10:00",
        reason: "Cita médica pasada que no debe aceptarse.",
      },
    },
    400,
  );
  const body = {
    category: "medical",
    startDate: "2031-07-10",
    endDate: "2031-07-10",
    startTime: "09:00",
    endTime: "10:30",
    reason: secret + " · Cita médica de seguimiento.",
  };
  const permission = await expect(
    "/permissions",
    { method: "POST", body },
    201,
  );
  assert.equal(permission.minutes, 90);
  await expect("/permissions", { method: "POST", body }, 409);
  await expect(
    "/permissions/" + permission.id + "/review",
    { who: "outsider", method: "PATCH", body: { status: "approved" } },
    403,
  );
  await expect(
    "/permissions/" + permission.id + "/review",
    {
      who: "hr",
      method: "PATCH",
      body: { status: "approved", comment: "Autorizado por RH" },
    },
    200,
  );
  assert.equal((await expect("/leave-policy/mine", {}, 200)).available, 6);
  await expect(
    "/permissions/" + permission.id + "/cancel",
    { method: "POST" },
    409,
  );
  await expect(
    "/permissions",
    {
      method: "POST",
      body: { ...body, startDate: "2031-05-12", endDate: "2031-05-12" },
    },
    409,
  );
  const conflict = await expect(
    "/vacations",
    {
      method: "POST",
      body: {
        startDate: body.startDate,
        endDate: body.endDate,
        reason: "Día solicitado que coincide con permiso.",
      },
    },
    201,
  );
  await expect(
    "/vacations/" + conflict.id + "/review",
    { who: "hr", method: "PATCH", body: { status: "approved" } },
    409,
  );
  const own = (await expect("/permissions", {}, 200)).requests.find(
    (r) => r.id === permission.id,
  );
  assert.equal(new Date(own.starts_at).toISOString().slice(11, 16), "15:00");
  const doc = randomUUID(),
    hidden = randomUUID(),
    foreign = randomUUID();
  for (const [id, cid, roles] of [
    [doc, company, ["colaborador"]],
    [hidden, company, ["admin"]],
    [foreign, other, ["colaborador"]],
  ])
    await run(
      "INSERT INTO pb_documents(id,company_id,name,source,mime_type,allowed_roles,state) VALUES (?,?,?,'upload','text/plain',?,'indexado')",
      [id, cid, secret + " política.txt", JSON.stringify(roles)],
    );
  const conv = randomUUID(),
    convOther = randomUUID();
  await run(
    "INSERT INTO pb_conversations(id,company_id,user_id,title) VALUES (?,?,?,?)",
    [conv, company, users.worker, secret + " conversación"],
  );
  await run(
    "INSERT INTO pb_conversations(id,company_id,user_id,title) VALUES (?,?,?,?)",
    [convOther, company, users.hr, secret + " privada RH"],
  );
  const search = async (type, who = "worker") =>
    (
      await expect(
        "/search?" + new URLSearchParams({ q: secret, type }),
        { who },
        200,
      )
    ).items;
  assert.deepEqual(
    (await search("documents")).map((x) => x.id),
    [doc],
  );
  assert.deepEqual(
    (await search("conversations")).map((x) => x.id),
    [conv],
  );
  assert.equal((await search("requests")).length, 1);
  assert.equal((await search("requests", "outsider")).length, 0);
  assert.equal((await search("conversations", "hr")).length, 1);
  assert.equal(
    (await expect("/search?q=%25%27&type=documents", {}, 200)).items.length,
    0,
  );
  await run(
    "INSERT INTO pb_attendance(id,company_id,user_id,checked_in_at,checked_out_at) VALUES (?,?,?,?,?)",
    [
      randomUUID(),
      company,
      users.worker,
      "2031-07-10 14:00:00",
      "2031-07-10 23:00:00",
    ],
  );
  for (const kind of [
    "attendance",
    "punctuality",
    "vacations",
    "permissions",
  ]) {
    const r = await req(
      "/reports/" + kind + "?from=2031-01-01&to=2031-12-31&format=xlsx",
    );
    assert.equal(r.status, 200);
    assert.match(r.headers.get("cache-control"), /no-store/);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(r.data);
    const sheet = book.worksheets[0];
    assert.ok(sheet.rowCount >= 4);
    assert.equal(sheet.getCell("A4").value, '=HYPERLINK("fake")');
    assert.equal(sheet.getCell("A4").type, ExcelJS.ValueType.String);
    assert.ok(!JSON.stringify(sheet.getSheetValues()).includes(secret));
  }
  await expect(
    "/reports/attendance?from=2031-01-01&to=2031-12-31&format=xlsx&userId=" +
      users.hr,
    {},
    403,
  );
  await expect(
    "/reports/usage?from=2031-01-01&to=2031-12-31&format=xlsx",
    {},
    403,
  );
  const adminReport = await req(
    "/reports/usage?from=2031-01-01&to=2031-12-31&format=xlsx",
    { who: "admin" },
  );
  assert.equal(adminReport.status, 200);
  const pdf = await req(
    "/reports/attendance?from=2031-01-01&to=2031-12-31&format=pdf",
  );
  assert.equal(pdf.data.subarray(0, 5).toString(), "%PDF-");
  const proxy = await getDocumentProxy(new Uint8Array(pdf.data));
  try {
    const { text } = await extractText(proxy, { mergePages: true });
    assert.match(String(text), /Asistencia/);
    assert.match(String(text), /HYPERLINK/);
  } finally {
    await proxy.loadingTask.destroy();
  }
  const foreignReport = await req(
    "/reports/attendance?from=2031-01-01&to=2031-12-31&format=xlsx",
    { who: "outsider" },
  );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(foreignReport.data);
  assert.equal(wb.worksheets[0].rowCount, 3);
  console.log(
    "PASS: working days/holidays, atomic one-time vacation debit, insufficient balance, hourly requests/review/timezone/conflicts, scoped search and real Excel/PDF exports with formula and privacy checks.",
  );
} finally {
  for (const id of [company, other]) {
    await run("DELETE FROM pb_attendance WHERE company_id=?", [id]);
    await run("DELETE FROM pb_companies WHERE id=?", [id]);
  }
  await new Promise((r) => server.close(r));
  await pool.end();
}
