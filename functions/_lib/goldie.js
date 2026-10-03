import { ALL_WB, DEFAULT_RULES, fmtAns, isAnswerable } from '../../public/content.mjs';
import { HttpError, now } from './util.js';
import { getSettings } from './settings.js';

export const DAILY_LIMIT = 60;
const HISTORY = 40;

export async function loadAnswers(env, studentId) {
  const { results } = await env.DB.prepare('SELECT question_id, value FROM answers WHERE student_id = ?').bind(studentId).all();
  const out = {};
  for (const r of results) { try { out[r.question_id] = JSON.parse(r.value); } catch (_) { out[r.question_id] = r.value; } }
  return out;
}

export function answersText(answers) {
  return ALL_WB.map((w) => {
    const qs = w.sections.flatMap((s) => s.qs).filter((q) => isAnswerable(q) && fmtAns(q, answers));
    return qs.length ? w.title + '\n' + qs.map((q) => `${(q.title || q.hint || '').replace(/\n/g, ' – ')}\n${fmtAns(q, answers)}`).join('\n\n') : '';
  }).filter(Boolean).join('\n\n');
}

export function buildSystem(rules, answers) {
  return `את גולדי, סוכנת AI בקורס "מודעת הזהב" של אוריני (Biz Doula / Femme Digital). התפקיד שלך: לעזור לבעלות עסקים לכתוב תסריטים לסרטוני מודעה וקופי למודעות ממומנות ב-Meta.
כתבי תמיד בעברית, בגוף שני נקבה, בחום ובקצרה. אם חסר לך מידע על העסק, הלקוחה או ההצעה – שאלי שאלה אחת ממוקדת לפני שאת כותבת.
כשאת כותבת תסריט: חלקי לשניות/סצנות עם מה רואים ומה אומרים. כשאת כותבת קופי: תני כותרת, טקסט ראשי וקריאה לפעולה.
אל תשתמשי ב-Markdown (בלי ** ובלי #). השתמשי בשורות חדשות ובמספור פשוט.

החוקים של מודעת הזהב – פעלי לפיהם תמיד:
${rules}

מה שהתלמידה כתבה בדפי היצירה עד עכשיו (השתמשי בזה כבסיס לכל תסריט וקופי, ואל תשאלי שוב על מה שכבר ענתה):
${answersText(answers) || '(עדיין לא מילאה)'}`;
}

export async function history(env, studentId, limit = HISTORY) {
  const { results } = await env.DB.prepare('SELECT role, content FROM goldie_messages WHERE student_id = ? ORDER BY id DESC LIMIT ?').bind(studentId, limit).all();
  return results.reverse().map((r) => ({ role: r.role, text: r.content }));
}

export async function chat(env, student, message) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'גולדי עדיין לא מחוברת. כתבי לאורין בקבוצת הווצאפ.');
  const since = new Date(Date.now() - 86400000).toISOString();
  const used = await env.DB.prepare("SELECT COUNT(*) AS n FROM goldie_messages WHERE student_id = ? AND role = 'user' AND created_at > ?").bind(student.id, since).first();
  if (used.n >= DAILY_LIMIT) throw new HttpError(429, 'הגעת למגבלת ההודעות היומית לגולדי. אפשר להמשיך מחר 🌸');

  const [settings, answers, prior] = await Promise.all([getSettings(env), loadAnswers(env, student.id), history(env, student.id)]);
  const system = buildSystem((settings.goldie_rules || '').trim() || DEFAULT_RULES, answers);
  const messages = [...prior.map((m) => ({ role: m.role, content: m.text })), { role: 'user', content: message }];
  while (messages.length && messages[0].role !== 'user') messages.shift();

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 1500, system, messages }),
  });
  if (!r.ok) { console.error('anthropic', r.status, (await r.text()).slice(0, 300)); throw new HttpError(502, 'אופס, משהו השתבש בחיבור. נסי לשלוח שוב בעוד רגע.'); }
  const data = await r.json();
  const reply = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').replace(/\*\*/g, '').trim();
  if (!reply) throw new HttpError(502, 'אופס, משהו השתבש בחיבור. נסי לשלוח שוב בעוד רגע.');
  const t = now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO goldie_messages (student_id, role, content, created_at) VALUES (?, ?, ?, ?)').bind(student.id, 'user', message, t),
    env.DB.prepare('INSERT INTO goldie_messages (student_id, role, content, created_at) VALUES (?, ?, ?, ?)').bind(student.id, 'assistant', reply, now()),
  ]);
  return reply;
}
