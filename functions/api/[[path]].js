import { HttpError, addMs, cookie, escHtml, isEmail, isPhone, json, normEmail, now, readBody } from '../_lib/util.js';
import { hashPassword, randomPassword, randomToken, safeEqual, sha256, verifyPassword } from '../_lib/crypto.js';
import { ADMIN_COOKIE, ADMIN_TTL, SHORT_TTL, STUDENT_COOKIE, STUDENT_TTL, clearCookie, clientIp, createSession, destroySession, rateLimit, requireAdmin, requireStudent, sessionCookie } from '../_lib/auth.js';
import { SETTING_KEYS, getSettings, putSettings } from '../_lib/settings.js';
import { chat, history, loadAnswers } from '../_lib/goldie.js';
import { emailAccess, grantAccess, markSent, progressFor } from '../_lib/students.js';
import { accessMessage, sendMail } from '../_lib/mail.js';
import { buildPaymentUrl, parseWebhook, verifyWebhook } from '../_lib/payment.js';
import { ALL_QS } from '../../public/content.mjs';

const route = {};
const on = (method, path, fn) => { route[`${method} ${path}`] = fn; };
const matchers = [];
const onRe = (method, re, fn) => matchers.push({ method, re, fn });

// ---------- public ----------
on('GET', '/public', async ({ env }) => {
  const s = await getSettings(env);
  return json({ introVideoUrl: s.intro_video_url || '', metaPixelId: s.meta_pixel_id || '' });
});

on('POST', '/checkout', async ({ env, request }) => {
  await rateLimit(env, 'checkout:' + clientIp(request), 20, 3600000);
  const b = await readBody(request);
  const name = String(b.name || '').trim(), email = normEmail(b.email), phone = String(b.phone || '').trim();
  if (name.length < 2) throw new HttpError(400, 'נא למלא שם מלא');
  if (!isPhone(phone)) throw new HttpError(400, 'נא למלא מספר טלפון תקין');
  if (!isEmail(email)) throw new HttpError(400, 'נא למלא כתובת אימייל תקינה');
  const t = now(), marketing = b.marketing_consent ? 1 : 0;
  let st = await env.DB.prepare('SELECT * FROM students WHERE email = ?').bind(email).first();
  if (st && st.access_status === 'active') throw new HttpError(409, 'כתובת האימייל כבר רשומה לקורס. אפשר להתחבר בעמוד הכניסה.');
  if (st) {
    await env.DB.prepare('UPDATE students SET name = ?, phone = ?, business = ?, marketing_consent = ?, marketing_consent_at = ?, terms_accepted_at = ? WHERE id = ?')
      .bind(name, phone, String(b.business || '').slice(0, 200), marketing, marketing ? t : null, t, st.id).run();
    st = { ...st, name, phone };
  } else {
    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO students (id, name, email, phone, business, access_status, joined_at, marketing_consent, marketing_consent_at, terms_accepted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, name, email, phone, String(b.business || '').slice(0, 200), 'pending', t, marketing, marketing ? t : null, t).run();
    st = { id, name, email, phone };
  }
  return json({ ok: true, paymentUrl: buildPaymentUrl(env, st) });
});

// Called by the payment processor after a charge.
on('POST', '/payment-webhook', async ({ env, request }) => {
  const body = await readBody(request);
  verifyWebhook(env, request, body);
  const p = parseWebhook(body);
  if (!p.ok) return json({ ok: true, ignored: 'not a successful payment' });
  if (!p.ref) throw new HttpError(400, 'missing transaction reference');
  let st = p.studentId ? await env.DB.prepare('SELECT * FROM students WHERE id = ?').bind(p.studentId).first() : null;
  if (!st && p.email) st = await env.DB.prepare('SELECT * FROM students WHERE email = ?').bind(p.email).first();
  if (!st) throw new HttpError(404, 'student not found');
  if (st.payment_ref === p.ref && st.access_status === 'active' && st.access_sent_at) return json({ ok: true, duplicate: true }); // idempotent
  const password = await grantAccess(env, st, { paymentRef: p.ref, amount: p.amount || Number(env.PRICE_ILS || 440), markSent: false });
  try { await emailAccess(env, st, password); } catch (e) {
    console.error('access email failed', e.message);
    throw new HttpError(500, 'email failed'); // non-2xx so the processor retries; the retry re-sends with a fresh password
  }
  await markSent(env, st.id);
  return json({ ok: true, emailed: true });
});

// ---------- student auth ----------
on('POST', '/login', async ({ env, request }) => {
  const b = await readBody(request), email = normEmail(b.username);
  await rateLimit(env, 'login:' + clientIp(request), 30, 900000);
  await rateLimit(env, 'login:' + email, 10, 900000);
  const st = await env.DB.prepare('SELECT * FROM students WHERE email = ?').bind(email).first();
  const ok = st && st.access_status === 'active' && st.password_hash && await verifyPassword(String(b.password || ''), st.password_hash);
  if (!ok) throw new HttpError(401, 'שם משתמש או סיסמה לא נכונים');
  const persistent = b.remember !== false, ttl = persistent ? STUDENT_TTL : SHORT_TTL;
  const token = await createSession(env, { studentId: st.id, ttlMs: ttl });
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(STUDENT_COOKIE, token, ttl, persistent) });
});
on('POST', '/logout', async ({ env, request }) => {
  await destroySession(env, request, STUDENT_COOKIE);
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie(STUDENT_COOKIE) });
});
on('POST', '/forgot', async ({ env, request }) => {
  const b = await readBody(request), email = normEmail(b.email);
  await rateLimit(env, 'forgot:' + clientIp(request), 10, 3600000);
  const st = isEmail(email) ? await env.DB.prepare("SELECT * FROM students WHERE email = ? AND access_status = 'active'").bind(email).first() : null;
  if (st) {
    const token = randomToken();
    await env.DB.prepare('INSERT INTO password_resets (token, student_id, expires_at) VALUES (?, ?, ?)').bind(await sha256(token), st.id, addMs(3600000)).run();
    try {
      await sendMail(env, { to: st.email, subject: 'איפוס סיסמה לקורס מודעת הזהב', text: `היי ${st.name.split(' ')[0]} 🌸\nביקשת לאפס את הסיסמה לקורס מודעת הזהב.\nהקישור תקף לשעה:\n${env.SITE_URL}/reset?token=${token}\n\nאם לא ביקשת, אפשר להתעלם מההודעה.\n\nאורין – הדולה העסקית`, button: { url: `${env.SITE_URL}/reset?token=${token}`, label: 'איפוס סיסמה' } });
    } catch (e) { console.error('reset email failed', e.message); }
  }
  return json({ ok: true }); // always 200
});
on('POST', '/reset', async ({ env, request }) => {
  const b = await readBody(request);
  await rateLimit(env, 'reset:' + clientIp(request), 20, 3600000);
  const password = String(b.password || '');
  if (password.length < 8) throw new HttpError(400, 'הסיסמה חייבת להיות לפחות 8 תווים');
  const key = await sha256(String(b.token || ''));
  const row = await env.DB.prepare('SELECT * FROM password_resets WHERE token = ?').bind(key).first();
  if (!row || row.expires_at < now()) throw new HttpError(400, 'הקישור פג תוקף. אפשר לבקש קישור חדש בעמוד הכניסה.');
  await env.DB.batch([
    env.DB.prepare('UPDATE students SET password_hash = ? WHERE id = ?').bind(await hashPassword(password), row.student_id),
    env.DB.prepare('DELETE FROM password_resets WHERE token = ?').bind(key),
    env.DB.prepare('DELETE FROM sessions WHERE student_id = ?').bind(row.student_id),
  ]);
  return json({ ok: true });
});

// ---------- student area ----------
on('GET', '/me', async ({ env, request }) => {
  const st = await requireStudent(env, request);
  await env.DB.prepare('UPDATE students SET last_seen_at = ? WHERE id = ?').bind(now(), st.id).run();
  const [settings, progress, answers, messages] = await Promise.all([getSettings(env), progressFor(env, st.id), loadAnswers(env, st.id), history(env, st.id)]);
  return json({ name: st.name, progress, answers, messages, whatsappUrl: settings.whatsapp_group_url || '', videoUrls: [1, 2, 3, 4].map((n) => settings['video' + n] || '') });
});
onRe('PUT', /^\/progress\/([1-4])$/, async ({ env, request, m }) => {
  const st = await requireStudent(env, request), b = await readBody(request);
  await env.DB.prepare('INSERT INTO progress (student_id, chapter, done, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(student_id, chapter) DO UPDATE SET done = excluded.done, updated_at = excluded.updated_at')
    .bind(st.id, +m[1], b.done ? 1 : 0, now()).run();
  return json({ ok: true });
});
const saveAnswers = async ({ env, request }) => {
  const st = await requireStudent(env, request), b = await readBody(request), valid = new Set(ALL_QS.map((q) => q.id));
  const stmts = Object.entries(b || {}).filter(([k]) => valid.has(k)).map(([k, v]) =>
    env.DB.prepare('INSERT INTO answers (student_id, question_id, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(student_id, question_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
      .bind(st.id, k, JSON.stringify(typeof v === 'string' ? v.slice(0, 20000) : Array.isArray(v) ? v.slice(0, 40).map(Boolean) : ''), now()));
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true });
};
on('PUT', '/answers', saveAnswers);
on('POST', '/answers', saveAnswers); // sendBeacon on page close
on('POST', '/goldie', async ({ env, request }) => {
  const st = await requireStudent(env, request), b = await readBody(request);
  const message = String(b.message || '').trim().slice(0, 8000);
  if (!message) throw new HttpError(400, 'הודעה ריקה');
  await rateLimit(env, 'goldie:' + st.id, 12, 60000);
  return json({ reply: await chat(env, st, message) });
});
on('DELETE', '/goldie', async ({ env, request }) => {
  const st = await requireStudent(env, request);
  await env.DB.prepare('DELETE FROM goldie_messages WHERE student_id = ?').bind(st.id).run();
  return json({ ok: true });
});

// ---------- admin ----------
on('POST', '/admin/login', async ({ env, request }) => {
  const b = await readBody(request);
  await rateLimit(env, 'adminlogin:' + clientIp(request), 10, 900000);
  const ok = env.ADMIN_EMAIL && env.ADMIN_PASSWORD_HASH && safeEqual(normEmail(b.email), normEmail(env.ADMIN_EMAIL)) && await verifyPassword(String(b.password || ''), env.ADMIN_PASSWORD_HASH);
  if (!ok) throw new HttpError(401, 'אימייל או סיסמה לא נכונים');
  const token = await createSession(env, { isAdmin: true, ttlMs: ADMIN_TTL });
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(ADMIN_COOKIE, token, ADMIN_TTL) });
});
on('POST', '/admin/logout', async ({ env, request }) => {
  await destroySession(env, request, ADMIN_COOKIE);
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie(ADMIN_COOKIE) });
});

async function listStudents(env) {
  const [{ results: students }, { results: prog }, { results: ans }, { results: gold }] = await Promise.all([
    env.DB.prepare('SELECT id, name, email, phone, business, access_status, access_sent_at, joined_at, last_seen_at, note FROM students ORDER BY joined_at DESC').all(),
    env.DB.prepare('SELECT student_id, chapter FROM progress WHERE done = 1').all(),
    env.DB.prepare("SELECT student_id, COUNT(*) AS n FROM answers WHERE value NOT IN ('\"\"', '[]') AND value IS NOT NULL GROUP BY student_id").all(),
    env.DB.prepare("SELECT student_id, COUNT(*) AS n FROM goldie_messages WHERE role = 'user' GROUP BY student_id").all(),
  ]);
  return students.map((s) => {
    const done = [false, false, false, false];
    prog.filter((p) => p.student_id === s.id).forEach((p) => { if (p.chapter >= 1 && p.chapter <= 4) done[p.chapter - 1] = true; });
    return { ...s, done, answers: (ans.find((a) => a.student_id === s.id) || {}).n || 0, goldie: (gold.find((a) => a.student_id === s.id) || {}).n || 0 };
  });
}
on('GET', '/admin/students', async ({ env, request }) => { await requireAdmin(env, request); return json(await listStudents(env)); });
on('POST', '/admin/students', async ({ env, request }) => {
  await requireAdmin(env, request);
  const b = await readBody(request), name = String(b.name || '').trim(), email = normEmail(b.email);
  if (name.length < 2 || !isEmail(email)) throw new HttpError(400, 'נא למלא שם ואימייל תקינים');
  if (await env.DB.prepare('SELECT 1 FROM students WHERE email = ?').bind(email).first()) throw new HttpError(409, 'האימייל כבר קיים');
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO students (id, name, email, phone, access_status, joined_at) VALUES (?, ?, ?, ?, 'pending', ?)").bind(id, name, email, String(b.phone || '').trim(), now()).run();
  return json({ ok: true, id });
});
onRe('POST', /^\/admin\/students\/([\w-]+)\/send-access$/, async ({ env, request, m }) => {
  await requireAdmin(env, request);
  const st = await env.DB.prepare('SELECT * FROM students WHERE id = ?').bind(m[1]).first();
  if (!st) throw new HttpError(404, 'לא נמצאה תלמידה');
  const b = await readBody(request), channel = b.channel === 'email' ? 'email' : 'whatsapp';
  const wanted = b.password ? String(b.password) : '';
  if (wanted && wanted.length < 6) throw new HttpError(400, 'הסיסמה חייבת להיות לפחות 6 תווים');
  const password = wanted || randomPassword(8);
  if (channel === 'email') await emailAccess(env, st, password, b.message ? String(b.message) : undefined).catch((e) => { throw new HttpError(502, e.message); });
  await grantAccess(env, st, { password });
  if (channel === 'email') return json({ ok: true });
  const text = b.message ? String(b.message) : accessMessage(env, st, password);
  const d = String(st.phone || '').replace(/\D/g, '');
  return json({ ok: true, waUrl: `https://wa.me/${d.startsWith('0') ? '972' + d.slice(1) : d}?text=${encodeURIComponent(text)}` });
});
on('POST', '/admin/send-pending', async ({ env, request }) => {
  await requireAdmin(env, request);
  const { results } = await env.DB.prepare("SELECT * FROM students WHERE access_status != 'active'").all();
  let sent = 0;
  for (const st of results) {
    const pw = randomPassword(8);
    try { await emailAccess(env, st, pw); await grantAccess(env, st, { password: pw }); sent++; } catch (e) { console.error('send-pending', st.email, e.message); }
  }
  return json({ ok: true, sent, failed: results.length - sent });
});
onRe('PATCH', /^\/admin\/students\/([\w-]+)$/, async ({ env, request, m }) => {
  await requireAdmin(env, request);
  const b = await readBody(request), id = m[1], stmts = [];
  if (typeof b.note === 'string') stmts.push(env.DB.prepare('UPDATE students SET note = ? WHERE id = ?').bind(b.note.slice(0, 5000), id));
  if (['pending', 'active', 'revoked'].includes(b.access_status)) stmts.push(env.DB.prepare('UPDATE students SET access_status = ? WHERE id = ?').bind(b.access_status, id));
  if (Array.isArray(b.progress)) b.progress.slice(0, 4).forEach((d, i) => stmts.push(env.DB.prepare('INSERT INTO progress (student_id, chapter, done, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(student_id, chapter) DO UPDATE SET done = excluded.done, updated_at = excluded.updated_at').bind(id, i + 1, d ? 1 : 0, now())));
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true });
});
onRe('DELETE', /^\/admin\/students\/([\w-]+)$/, async ({ env, request, m }) => {
  await requireAdmin(env, request);
  const id = m[1];
  await env.DB.batch(['progress', 'answers', 'goldie_messages', 'sessions', 'password_resets'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE student_id = ?`).bind(id)).concat(env.DB.prepare('DELETE FROM students WHERE id = ?').bind(id)));
  return json({ ok: true });
});
on('GET', '/admin/export.csv', async ({ env, request }) => {
  await requireAdmin(env, request);
  const CH = ['פרק 1 · הפיצוח', 'פרק 2 · הכתיבה והעיצוב', 'פרק 3 · הטכני', 'פרק 4 · ה-Play'];
  const fmt = (d) => { if (!d) return '—'; const [y, m, day] = d.slice(0, 10).split('-'); return `${+day}.${+m}.${y.slice(2)}`; };
  const head = ['שם', 'אימייל', 'טלפון', 'נרשמה', 'גישה', 'התקדמות', ...CH, 'דפי יצירה', 'פעילות אחרונה', 'הערות'];
  const lines = (await listStudents(env)).map((x) => [x.name, x.email, x.phone, fmt(x.joined_at), x.access_status === 'active' ? 'כן' : 'לא', Math.round(x.done.filter(Boolean).length / 4 * 100) + '%', ...x.done.map((d) => (d ? '✓' : '')), `${x.answers} / ${ALL_QS.length}`, fmt(x.last_seen_at), x.note || '']);
  const csv = [head, ...lines].map((r) => r.map((c) => `"${String(c == null ? '' : c).replace(/"/g, '""')}"`).join(',')).join('\n');
  return new Response('﻿' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': "attachment; filename*=UTF-8''%D7%AA%D7%9C%D7%9E%D7%99%D7%93%D7%95%D7%AA.csv", 'Cache-Control': 'no-store' } });
});
on('GET', '/admin/settings', async ({ env, request }) => { await requireAdmin(env, request); return json(await getSettings(env)); });
on('PUT', '/admin/settings', async ({ env, request }) => { await requireAdmin(env, request); await putSettings(env, await readBody(request)); return json({ ok: true }); });

// ---------- dispatch ----------
export async function onRequest(context) {
  const { request, env } = context;
  const path = '/' + (context.params.path || []).join('/');
  const method = request.method;
  try {
    // CSRF: state-changing browser requests must come from our own origin (the payment webhook is exempt: it authenticates by secret).
    if (method !== 'GET' && method !== 'HEAD' && path !== '/payment-webhook') {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'forbidden');
    }
    let fn = route[`${method} ${path}`], m = null;
    if (!fn) for (const r of matchers) if (r.method === method && (m = path.match(r.re))) { fn = r.fn; break; }
    if (!fn) return json({ error: 'לא נמצא' }, 404);
    return await fn({ ...context, m });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'שגיאת שרת' }, 500);
  }
}
