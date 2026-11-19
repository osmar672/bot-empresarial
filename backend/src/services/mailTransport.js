import { z } from 'zod';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
const gmailSettings = ['GMAIL_FROM', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'];
const smtpSettings = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
const email = z.string().email().regex(/^[!-~]+$/);

export function mailConfiguration() {
  dotenv.config({ path: envPath, override: true });
  const envProvider = process.env.MAIL_PROVIDER?.trim().toLowerCase();
  const provider = envProvider || (process.env.SMTP_HOST ? 'smtp' : 'resend');
  if (!['gmail', 'resend', 'smtp'].includes(provider)) {
    return { provider, missing: ['MAIL_PROVIDER'], configured: false };
  }
  let fields;
  if (provider === 'gmail') {
    fields = gmailSettings;
  } else if (provider === 'smtp') {
    fields = smtpSettings;
  } else {
    fields = ['RESEND_API_KEY', 'MAIL_FROM'];
  }
  const missing = fields.filter(field => !process.env[field]?.trim());
  if (provider === 'gmail' && !missing.includes('GMAIL_FROM') &&
      !email.safeParse(process.env.GMAIL_FROM.trim()).success) missing.push('GMAIL_FROM');
  if (provider === 'smtp' && process.env.SMTP_FROM?.trim() &&
      !email.safeParse(process.env.SMTP_FROM.trim()).success) missing.push('SMTP_FROM');
  return { provider, missing, configured: missing.length === 0 };
}

async function sendSmtp(mail) {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT?.trim() || 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user || 'no-reply@luma.internal';

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    tls: { rejectUnauthorized: false }
  });

  const mailOptions = {
    from: from.includes('<') ? from : `Luma <${from}>`,
    to: mail.recipient,
    subject: mail.subject,
    text: mail.body,
    html: mail.html || undefined
  };

  const result = await transporter.sendMail(mailOptions);
  if (!result || !result.messageId) throw new Error('MAIL_INVALID_RESPONSE');
}

async function sendGmail(mail) {
  const from = email.parse(process.env.GMAIL_FROM.trim());
  const to = email.parse(mail.recipient);
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID.trim(),
      client_secret: process.env.GMAIL_CLIENT_SECRET.trim(),
      refresh_token: process.env.GMAIL_REFRESH_TOKEN.trim(),
      grant_type: 'refresh_token',
    }),
  });
  if (!tokenResponse.ok) throw new Error('MAIL_HTTP_' + tokenResponse.status);
  const { access_token: accessToken } = await tokenResponse.json();
  if (!accessToken) throw new Error('MAIL_INVALID_RESPONSE');

  const subject = Buffer.from(mail.subject, 'utf8').toString('base64');
  const body = Buffer.from(mail.body, 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';
  const message = [
    'From: Luma <' + from + '>',
    'To: ' + to,
    'Subject: =?UTF-8?B?' + subject + '?=',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(message, 'utf8').toString('base64url') }),
  });
  if (!response.ok) throw new Error('MAIL_HTTP_' + response.status);
  if (!(await response.json()).id) throw new Error('MAIL_INVALID_RESPONSE');
}

async function sendResend(mail) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: {
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'luma-welcome-' + mail.id,
    },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: [mail.recipient],
      subject: mail.subject,
      text: mail.body,
    }),
  });
  if (!response.ok) throw new Error('MAIL_HTTP_' + response.status);
  if (!(await response.json()).id) throw new Error('MAIL_INVALID_RESPONSE');
}

export async function sendTransactionalMail(mail) {
  const { provider, configured } = mailConfiguration();
  if (!configured) throw new Error('MAIL_NOT_CONFIGURED');
  if (provider === 'gmail') await sendGmail(mail);
  else if (provider === 'smtp') await sendSmtp(mail);
  else await sendResend(mail);
}
