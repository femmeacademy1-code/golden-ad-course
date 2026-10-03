import { escHtml } from './util.js';

export const ACCESS_SUBJECT = 'פרטי הגישה שלך לקורס מודעת הזהב';

export function accessMessage(env, student, password) {
  const first = (student.name || '').split(' ')[0];
  return `היי ${first} 🌸\nאיזה כיף שהצטרפת לקורס מודעת הזהב!\n\nהנה פרטי הגישה שלך לקורס:\nקישור: ${env.SITE_URL}/login\nשם משתמש: ${student.email}\nסיסמה: ${password}\n\nבתוך הקורס מחכים לך 4 הפרקים, דפי היצירה וגולדי – סוכנת ה-AI שתעזור לך לכתוב תסריט וקופי.\nאני זמינה בקבוצת הווצאפ לכל שאלה.\n\nאורין – הדולה העסקית`;
}

function wrapHtml(text, button) {
  const body = escHtml(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#933E3C;">$1</a>').replace(/\n/g, '<br>');
  return `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#FFF8F4;"><div dir="rtl" style="max-width:560px;margin:0 auto;padding:28px 20px;font-family:Assistant,Arial,sans-serif;color:#45464E;font-size:17px;line-height:1.7;"><div style="background:#fff;border-radius:24px;padding:28px;border:1px solid #FFD6BA;">${body}${button ? `<p style="margin:24px 0 0;"><a href="${escHtml(button.url)}" style="display:inline-block;background:#B9504E;color:#FFF8F4;text-decoration:none;border-radius:999px;padding:12px 26px;font-weight:700;">${escHtml(button.label)}</a></p>` : ''}</div></div></body></html>`;
}

export async function sendMail(env, { to, subject, text, button }) {
  if (!env.RESEND_API_KEY) throw new Error('שליחת מיילים לא מוגדרת (RESEND_API_KEY)');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, html: wrapHtml(text, button) }),
  });
  if (!r.ok) throw new Error('שליחת המייל נכשלה: ' + (await r.text()).slice(0, 200));
}
