export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const now = () => new Date().toISOString();
export const addMs = (ms) => new Date(Date.now() + ms).toISOString();
export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const isPhone = (p) => /^0\d{1,2}-?\d{7}$/.test(String(p || '').replace(/\s/g, ''));
export const escHtml = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export async function readBody(request) {
  const type = request.headers.get('content-type') || '';
  try {
    if (type.includes('application/json')) return await request.json();
    if (type.includes('form')) return Object.fromEntries(await request.formData());
    const text = await request.text();
    try { return JSON.parse(text); } catch (_) { return Object.fromEntries(new URLSearchParams(text)); }
  } catch (_) { return {}; }
}
export function getCookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}
export function cookie(name, value, { maxAge, path = '/' } = {}) {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; Secure; SameSite=Lax${maxAge != null ? `; Max-Age=${maxAge}` : ''}`;
}
