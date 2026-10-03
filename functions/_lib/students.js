import { hashPassword, randomPassword } from './crypto.js';
import { ACCESS_SUBJECT, accessMessage, sendMail } from './mail.js';
import { now } from './util.js';

// Sets a (new or given) password, marks the student active, and records the send time.
export async function grantAccess(env, student, { password, paymentRef, amount, markSent = true } = {}) {
  const pw = password || randomPassword(8);
  await env.DB.prepare(`UPDATE students SET password_hash = ?, access_status = 'active', access_sent_at = ?,
    payment_ref = COALESCE(?, payment_ref), amount = COALESCE(?, amount) WHERE id = ?`)
    .bind(await hashPassword(pw), markSent ? now() : null, paymentRef || null, amount ?? null, student.id).run();
  return pw;
}

export async function emailAccess(env, student, password, message) {
  await sendMail(env, { to: student.email, subject: ACCESS_SUBJECT, text: message || accessMessage(env, student, password), button: { url: `${env.SITE_URL}/login`, label: 'כניסה לקורס' } });
}

export async function progressFor(env, studentId) {
  const { results } = await env.DB.prepare('SELECT chapter, done FROM progress WHERE student_id = ?').bind(studentId).all();
  const p = [false, false, false, false];
  for (const r of results) if (r.chapter >= 1 && r.chapter <= 4) p[r.chapter - 1] = !!r.done;
  return p;
}

export const markSent = (env, id) => env.DB.prepare('UPDATE students SET access_sent_at = ? WHERE id = ?').bind(now(), id).run();
