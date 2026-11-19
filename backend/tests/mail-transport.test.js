import assert from 'node:assert/strict';
import test from 'node:test';
import { mailConfiguration, sendTransactionalMail } from '../src/services/mailTransport.js';

const mail = { id: 'test-id', recipient: 'to@example.test', subject: 'Verificación', body: 'Hola, José.' };

function configure(t, values) {
  const original = new Map(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('Gmail uses OAuth refresh and sends a UTF-8 message through Gmail API', async t => {
  configure(t, {
    MAIL_PROVIDER: 'gmail',
    GMAIL_FROM: 'from@example.test',
    GMAIL_CLIENT_ID: 'test-client',
    GMAIL_CLIENT_SECRET: 'test-secret',
    GMAIL_REFRESH_TOKEN: 'test-refresh',
  });
  const calls = t.mock.method(globalThis, 'fetch', async url => {
    return url.endsWith('/token') ? Response.json({ access_token: 'test-access' }) : Response.json({ id: 'message-id' });
  });

  assert.deepEqual(mailConfiguration(), { provider: 'gmail', missing: [], configured: true });
  await sendTransactionalMail(mail);
  assert.equal(calls.mock.callCount(), 2);

  const [tokenUrl, tokenRequest] = calls.mock.calls[0].arguments;
  assert.equal(tokenUrl, 'https://oauth2.googleapis.com/token');
  assert.equal(tokenRequest.body.get('grant_type'), 'refresh_token');
  assert.equal(tokenRequest.body.get('refresh_token'), 'test-refresh');

  const [sendUrl, sendRequest] = calls.mock.calls[1].arguments;
  assert.equal(sendUrl, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  assert.equal(sendRequest.headers.Authorization, 'Bearer test-access');
  const raw = Buffer.from(JSON.parse(sendRequest.body).raw, 'base64url').toString();
  const [headers, body] = raw.split('\r\n\r\n');
  assert.match(headers, /From: Luma <from@example\.test>\r\nTo: to@example\.test/);
  assert.equal(Buffer.from(headers.match(/Subject: =\?UTF-8\?B\?(.+?)\?=/)[1], 'base64').toString(), mail.subject);
  assert.equal(Buffer.from(body, 'base64').toString(), mail.body);

  calls.mock.resetCalls();
  await assert.rejects(sendTransactionalMail({ ...mail, recipient: 'to@example.test\r\nBcc: bad@example.test' }));
  assert.equal(calls.mock.callCount(), 0);
});

test('Gmail with incomplete settings remains pending even when Resend has credentials', async t => {
  configure(t, {
    MAIL_PROVIDER: 'gmail',
    GMAIL_FROM: 'from@example.test',
    GMAIL_CLIENT_ID: 'test-client',
    GMAIL_CLIENT_SECRET: 'test-secret',
    GMAIL_REFRESH_TOKEN: '',
    RESEND_API_KEY: 'test-key',
    MAIL_FROM: 'from@example.test',
  });
  const calls = t.mock.method(globalThis, 'fetch', async () => Response.json({ id: 'unexpected' }));
  assert.deepEqual(mailConfiguration(), { provider: 'gmail', missing: ['GMAIL_REFRESH_TOKEN'], configured: false });
  await assert.rejects(sendTransactionalMail(mail), /MAIL_NOT_CONFIGURED/);
  assert.equal(calls.mock.callCount(), 0);
});

test('Resend remains the default and keeps the existing idempotency key', async t => {
  configure(t, { MAIL_PROVIDER: undefined, RESEND_API_KEY: 'test-key', MAIL_FROM: 'from@example.test' });
  const calls = t.mock.method(globalThis, 'fetch', async () => Response.json({ id: 'receipt' }));
  await sendTransactionalMail(mail);
  assert.equal(calls.mock.callCount(), 1);
  const [url, request] = calls.mock.calls[0].arguments;
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(request.headers['Idempotency-Key'], 'luma-welcome-test-id');
});
