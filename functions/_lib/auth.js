import { HttpError, addMs, cookie, getCookie, json, now } from './util.js';
import { randomToken, sha256 } from './crypto.js';

const DAY = 86400000;
export const STUDENT_COOKIE = 'ga_session', ADMIN_COOKIE = 'ga_admin';

export async function createSession(env, { studentId = null, isAdmin = false, ttlMs }) {
  const token = randomToken();
  await env.DB.prepare('INSERT INTO sessions (token, student_id, is_admin, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), studentId, isAdmin ? 1 : 0, addMs(ttlMs)).run();
  return token;
}
export const sessionCookie = (name, token, ttlMs, persistent = true) =>
  cookie(name, token, { maxAge: persistent ? Math.floor(ttlMs / 1000) : undefined, path: '/' });
export const clearCookie = (name) => cookie(name, '', { maxAge: 0 });
export const STUDENT_TTL = 30 * DAY, SHORT_TTL = DAY, ADMIN_TTL = 12 * 3600000;

async function lookup(env, request, name, isAdmin) {
  const raw = getCookie(request, name);
  if (!raw) return null;
  const row = await env.DB.prepare('SELECT student_id, expires_at FROM sessions WHERE token = ? AND is_admin = ?').bind(await sha256(raw), isAdmin ? 1 : 0).first();
  if (!row || row.expires_at < now()) return null;
  return row;
}
export async function requireStudent(env, request) {
  const s = await lookup(env, request, STUDENT_COOKIE, false);
  if (!s) throw new HttpError(401, 'יש להתחבר');
  const st = await env.DB.prepare('SELECT * FROM students WHERE id = ?').bind(s.student_id).first();
  if (!st || st.access_status !== 'active') throw new HttpError(401, 'יש להתחבר');
  return st;
}
export async function requireAdmin(env, request) {
  if (!(await lookup(env, request, ADMIN_COOKIE, true))) throw new HttpError(401, 'נדרשת כניסת מנהלת');
}
export async function destroySession(env, request, name) {
  const raw = getCookie(request, name);
  if (raw) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(await sha256(raw)).run();
}

// Simple fixed-window rate limiter backed by D1.
export async function rateLimit(env, key, limit, windowMs) {
  const t = Date.now();
  const row = await env.DB.prepare('SELECT count, window_start FROM rate_limits WHERE key = ?').bind(key).first();
  if (!row || t - row.window_start > windowMs) {
    await env.DB.prepare('INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)').bind(key, t).run();
    return;
  }
  if (row.count >= limit) throw new HttpError(429, 'יותר מדי ניסיונות. נסי שוב בעוד מספר דקות.');
  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
}
export const clientIp = (request) => request.headers.get('cf-connecting-ip') || 'unknown';
export { json };
