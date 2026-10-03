import { ALL_QS, DEFAULT_RULES } from '/content.mjs';

const CH = ['פרק 1 · הפיצוח', 'פרק 2 · הכתיבה והעיצוב', 'פרק 3 · הטכני', 'פרק 4 · ה-Play'];
const FILTERS = [['all', 'הכל'], ['noaccess', 'לא קיבלו גישה'], ['notstarted', 'לא התחילו'], ['inprogress', 'באמצע'], ['finished', 'סיימו']];
const TOTAL_Q = ALL_QS.length;
const $ = (s) => document.querySelector(s);
const h = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDate = (d) => { if (!d) return '—'; const [y, m, day] = d.slice(0, 10).split('-'); return `${+day}.${+m}.${y.slice(2)}`; };
const genPass = () => { const c = 'abcdefghjkmnpqrstuvwxyz23456789', a = new Uint32Array(8); crypto.getRandomValues(a); return [...a].map((n) => c[n % c.length]).join(''); };
const waPhone = (p) => { const d = (p || '').replace(/\D/g, ''); return d.startsWith('0') ? '972' + d.slice(1) : d; };
const pill = (on, col = 'accent') => `border:2px solid ${on ? `var(--color-${col})` : 'var(--color-accent-200)'};background:${on ? `var(--color-${col})` : 'var(--color-bg)'};color:${on ? 'var(--color-bg)' : 'var(--color-text)'}`;

async function api(path, opts = {}) {
  const r = await fetch('/api/admin' + path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { showLogin(); throw new Error('unauthorized'); }
  if (!r.ok) throw new Error(j.error || 'שגיאה');
  return j;
}

const S = { students: [], filter: 'all', query: '', modal: null, toast: '', confirmRemove: false, send: null, settings: null };
const pctOf = (st) => Math.round(st.done.filter(Boolean).length / 4 * 100);
const statusOf = (st) => { const n = st.done.filter(Boolean).length; return st.access_status !== 'active' ? 'noaccess' : n === 0 ? 'notstarted' : n === 4 ? 'finished' : 'inprogress'; };
const hasAccess = (st) => st.access_status === 'active';

function flash(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(flash._t); flash._t = setTimeout(() => { el.hidden = true; }, 2600); }
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#logout').hidden = true; }

async function load() {
  try { S.students = await api('/students'); } catch (e) { return; }
  $('#login').hidden = true; $('#app').hidden = false; $('#logout').hidden = false;
  render();
}

function render() {
  const list = S.students, q = S.query.trim().toLowerCase();
  const rows = list.filter((st) => (S.filter === 'all' || statusOf(st) === S.filter) && (!q || [st.name, st.email, st.phone].join(' ').toLowerCase().includes(q)));
  const pending = list.filter((x) => !hasAccess(x));
  $('#s-total').textContent = list.length;
  $('#s-access').textContent = list.filter(hasAccess).length;
  $('#s-avg').textContent = list.length ? Math.round(list.reduce((a, x) => a + pctOf(x), 0) / list.length) + '%' : '0%';
  $('#s-done').textContent = list.filter((x) => x.done.every(Boolean)).length;
  $('#b-sendall').textContent = pending.length ? `שליחת גישה לכל הממתינות (${pending.length})` : 'כולן קיבלו גישה';
  $('#filters').innerHTML = FILTERS.map(([k, l]) => `<button type="button" class="pill" data-filter="${k}" style="${pill(S.filter === k)}">${l} (${k === 'all' ? list.length : list.filter((x) => statusOf(x) === k).length})</button>`).join('');
  $('#rows').innerHTML = rows.map((st) => `<tr>
    <td><div style="display:flex;flex-direction:column;gap:2px;"><strong style="font-size:16px;">${h(st.name)}</strong><span style="font-size:14px;opacity:0.8;" dir="ltr">${h(st.email)}</span><span style="font-size:14px;opacity:0.8;text-align:right;" dir="ltr">${h(st.phone)}</span></div></td>
    <td style="white-space:nowrap;">${fmtDate(st.joined_at)}</td>
    <td><span class="tag ${hasAccess(st) ? 'tag-accent-2' : 'tag-accent'}" style="white-space:nowrap;">${hasAccess(st) ? 'נשלחה גישה' : 'ממתינה לגישה'}</span></td>
    <td><div style="display:flex;align-items:center;gap:10px;"><div style="display:flex;gap:5px;">${st.done.map((d, i) => `<span title="${CH[i]}" style="width:14px;height:14px;border-radius:50%;background:${d ? 'var(--color-accent-2)' : 'transparent'};border:2px solid ${d ? 'var(--color-accent-2)' : 'var(--color-accent-200)'};"></span>`).join('')}</div><span style="font-weight:700;white-space:nowrap;">${pctOf(st)}%</span></div></td>
    <td style="white-space:nowrap;">${st.answers} / ${TOTAL_Q}</td>
    <td style="white-space:nowrap;">${fmtDate(st.last_seen_at)}</td>
    <td><div style="display:flex;flex-direction:column;gap:6px;align-items:stretch;"><button type="button" class="btn btn-secondary" data-send="${st.id}" style="font-size:14px;padding:8px 14px;">${hasAccess(st) ? 'שליחה חוזרת' : 'שליחת גישה'}</button><button type="button" class="btn btn-ghost" data-open="${st.id}" style="font-size:14px;padding:8px 14px;">פרטים</button></div></td>
  </tr>`).join('');
  $('#norows').hidden = rows.length > 0;
}

// ---------- modals ----------
const dlg = (width, inner, tag = 'div', attrs = '') => `<div class="dialog-backdrop" data-close style="position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:20px;"><${tag} class="dialog dlg" ${attrs} style="width:min(${width}px,100%);" data-stop>${inner}</${tag}></div>`;
const closeModal = () => { S.modal = null; S.send = null; $('#modal').innerHTML = ''; };

function buildMsg(st, user, pass) {
  const first = (st.name || '').split(' ')[0];
  return `היי ${first} 🌸\nאיזה כיף שהצטרפת לקורס מודעת הזהב!\n\nהנה פרטי הגישה שלך לקורס:\nקישור: ${location.origin}/login\nשם משתמש: ${user}\nסיסמה: ${pass}\n\nבתוך הקורס מחכים לך 4 הפרקים, דפי היצירה וגולדי – סוכנת ה-AI שתעזור לך לכתוב תסריט וקופי.\nאני זמינה בקבוצת הווצאפ לכל שאלה.\n\nאורין – הדולה העסקית`;
}

function openSend(st) {
  const pass = genPass();
  S.send = { id: st.id, user: st.email, pass, msg: buildMsg(st, st.email, pass), channel: 'whatsapp', copied: false, busy: false };
  renderSend();
}
function renderSend() {
  const m = S.send, st = S.students.find((x) => x.id === m.id);
  $('#modal').innerHTML = dlg(560, `
    <h2>שליחת פרטי גישה</h2><p style="margin:0;font-size:16px;">ל${h(st.name)}</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:12px;">
      <div class="field"><label class="lbl">שם משתמש</label><input class="input" dir="ltr" value="${h(m.user)}" disabled style="border-radius:999px;text-align:right;"></div>
      <div class="field"><div style="display:flex;justify-content:space-between;gap:8px;"><label class="lbl" for="s-pass">סיסמה</label><button type="button" id="regen" style="background:none;border:0;padding:0;font:inherit;font-size:13px;font-weight:700;color:var(--color-accent-700);cursor:pointer;">סיסמה חדשה</button></div><input id="s-pass" class="input" dir="ltr" value="${h(m.pass)}" style="border-radius:999px;text-align:right;"></div>
    </div>
    <div class="field"><span class="lbl">ערוץ שליחה</span><div style="display:flex;gap:8px;flex-wrap:wrap;">${[['whatsapp', 'ווצאפ'], ['email', 'מייל']].map(([k, l]) => `<button type="button" class="pill" data-channel="${k}" style="${pill(m.channel === k)}">${l}</button>`).join('')}</div></div>
    <div class="field"><label class="lbl" for="s-msg">ההודעה</label><textarea id="s-msg" class="ta" rows="9">${h(m.msg)}</textarea></div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;">
      <button type="button" class="btn btn-ghost" id="copy">${m.copied ? '✓ הועתק' : 'העתקת ההודעה'}</button>
      <button type="button" class="btn btn-primary" id="dosend" ${m.busy ? 'disabled' : ''}>${m.channel === 'whatsapp' ? 'פתיחה בווצאפ ושליחה' : 'שליחה במייל'}</button>
    </div>`);
}

function openDetail(id) { S.modal = { type: 'detail', id }; S.confirmRemove = false; renderDetail(); }
function renderDetail() {
  const st = S.students.find((x) => x.id === S.modal.id);
  if (!st) return closeModal();
  const first = st.name.split(' ')[0];
  const nudge = `https://wa.me/${waPhone(st.phone)}?text=${encodeURIComponent(`היי ${first} 🌸 רק רציתי לבדוק איך את מתקדמת בקורס מודעת הזהב. אם נתקעת במשהו – אני כאן, ותמיד אפשר לשאול גם בקבוצה. אורין`)}`;
  $('#modal').innerHTML = dlg(620, `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;"><div style="display:flex;flex-direction:column;gap:4px;"><h2>${h(st.name)}</h2><span style="font-size:15px;" dir="ltr">${h(st.email)} · ${h(st.phone)}</span></div><span class="tag ${hasAccess(st) ? 'tag-accent-2' : 'tag-accent'}" style="white-space:nowrap;">${hasAccess(st) ? 'נשלחה גישה' : 'ממתינה לגישה'}</span></div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;font-size:15px;">
      <div style="background:var(--color-accent-100);border-radius:20px;padding:14px 16px;"><strong>נרשמה:</strong> ${fmtDate(st.joined_at)}</div>
      <div style="background:var(--color-accent-100);border-radius:20px;padding:14px 16px;"><strong>פעילות אחרונה:</strong> ${fmtDate(st.last_seen_at)}</div>
      <div style="background:var(--color-accent-2-100);border-radius:20px;padding:14px 16px;"><strong>דפי יצירה:</strong> ${st.answers} / ${TOTAL_Q}</div>
      <div style="background:var(--color-accent-2-100);border-radius:20px;padding:14px 16px;"><strong>שיחות עם גולדי:</strong> ${st.goldie}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;"><span style="font-size:17px;font-weight:700;">התקדמות בפרקים</span>
      ${st.done.map((d, i) => `<button type="button" data-chapter="${i}" style="display:flex;justify-content:space-between;align-items:center;gap:12px;border:2px solid ${d ? 'var(--color-accent-2)' : 'var(--color-accent-200)'};background:${d ? 'var(--color-accent-2-100)' : 'var(--color-bg)'};border-radius:18px;padding:12px 16px;font:inherit;font-size:15px;color:var(--color-text);cursor:pointer;text-align:right;"><span>${CH[i]}</span><strong style="white-space:nowrap;">${d ? '✓ הושלם' : 'עוד לא'}</strong></button>`).join('')}
      <span style="font-size:13px;opacity:0.75;">לחיצה על פרק מסמנת אותו כהושלם או מבטלת</span></div>
    <div class="field"><label class="lbl" for="d-note" style="font-size:15px;">הערות פנימיות</label><textarea id="d-note" class="ta" rows="3" placeholder="למשל: ביקשה עזרה בהגדרת חשבון המודעות">${h(st.note || '')}</textarea></div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;">
      <button type="button" class="btn btn-ghost" id="remove" style="color:var(--color-accent-800);">${S.confirmRemove ? 'לחיצה נוספת למחיקה סופית' : 'הסרת תלמידה'}</button>
      <div style="display:flex;flex-wrap:wrap;gap:10px;"><a class="btn btn-secondary" href="${nudge}" target="_blank" rel="noopener" style="text-decoration:none;">תזכורת בווצאפ</a><button type="button" class="btn btn-primary" data-send="${st.id}">${hasAccess(st) ? 'שליחת גישה מחדש' : 'שליחת פרטי גישה'}</button></div>
    </div>`);
}

function openAdd(err = '') {
  S.modal = { type: 'add' };
  $('#modal').innerHTML = dlg(480, `
    <h2>הוספת תלמידה</h2>
    <div class="field"><label class="lbl" for="a-name">שם מלא</label><input id="a-name" class="input" style="border-radius:999px;text-align:right;"></div>
    <div class="field"><label class="lbl" for="a-email">אימייל</label><input id="a-email" class="input" type="email" dir="ltr" style="border-radius:999px;text-align:right;"></div>
    <div class="field"><label class="lbl" for="a-phone">טלפון</label><input id="a-phone" class="input" type="tel" dir="ltr" placeholder="050-0000000" style="border-radius:999px;text-align:right;"></div>
    <span id="a-err" style="font-size:14px;color:var(--color-accent-800);">${h(err)}</span>
    <div style="display:flex;gap:10px;justify-content:flex-end;"><button type="button" class="btn btn-ghost" data-close>ביטול</button><button type="submit" class="btn btn-primary">הוספה</button></div>`, 'form', 'novalidate id="add-form"');
}

async function openSettings() {
  S.modal = { type: 'settings' };
  let s;
  try { s = await api('/settings'); } catch (e) { return flash(e.message); }
  const v = (k) => h(s[k] || '');
  $('#modal').innerHTML = dlg(640, `
    <h2>הגדרות</h2>
    <div class="field"><label class="lbl" for="st-rules">החוקים של גולדי</label><textarea id="st-rules" class="ta" rows="9" placeholder="${h(DEFAULT_RULES)}">${v('goldie_rules')}</textarea><span style="font-size:13px;opacity:.75;">אם השדה ריק, גולדי משתמשת בחוקים ברירת המחדל.</span></div>
    ${[1, 2, 3, 4].map((n) => `<div class="field"><label class="lbl" for="st-v${n}">סרטון פרק ${n} (קישור embed)</label><input id="st-v${n}" class="input" dir="ltr" value="${v('video' + n)}" placeholder="https://player.vimeo.com/video/…" style="border-radius:999px;text-align:right;"></div>`).join('')}
    <div class="field"><label class="lbl" for="st-intro">סרטון היכרות בדף המכירה (קישור embed)</label><input id="st-intro" class="input" dir="ltr" value="${v('intro_video_url')}" style="border-radius:999px;text-align:right;"></div>
    <div class="field"><label class="lbl" for="st-wa">קישור לקבוצת הווצאפ</label><input id="st-wa" class="input" dir="ltr" value="${v('whatsapp_group_url')}" placeholder="https://chat.whatsapp.com/…" style="border-radius:999px;text-align:right;"></div>
    <div class="field"><label class="lbl" for="st-px">מזהה פיקסל של Meta (אופציונלי)</label><input id="st-px" class="input" dir="ltr" value="${v('meta_pixel_id')}" style="border-radius:999px;text-align:right;"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;"><button type="button" class="btn btn-ghost" data-close>ביטול</button><button type="button" class="btn btn-primary" id="save-settings">שמירה</button></div>`);
}

// ---------- events ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a, [data-close]');
  if (!t) return;
  if (t.matches('[data-close]')) { if (e.target.closest('[data-stop]') && !t.matches('button')) return; return closeModal(); }
  if (t.dataset.filter) { S.filter = t.dataset.filter; return render(); }
  if (t.dataset.open) return openDetail(t.dataset.open);
  if (t.dataset.send) { const st = S.students.find((x) => x.id === t.dataset.send); return openSend(st); }
  if (t.id === 'b-add') return openAdd();
  if (t.id === 'b-settings') return openSettings();
  if (t.id === 'logout') { e.preventDefault(); await fetch('/api/admin/logout', { method: 'POST' }); return showLogin(); }
  if (t.id === 'b-sendall') {
    const n = S.students.filter((x) => !hasAccess(x)).length; if (!n) return;
    if (!confirm(`לשלוח פרטי גישה במייל ל-${n} תלמידות?`)) return;
    try { const r = await api('/send-pending', { method: 'POST' }); flash(`פרטי גישה נשלחו ל-${r.sent} תלמידות במייל`); await load(); } catch (err) { flash(err.message); }
    return;
  }
  if (t.dataset.channel && S.send) { S.send.msg = $('#s-msg').value; S.send.channel = t.dataset.channel; return renderSend(); }
  if (t.id === 'regen' && S.send) { const st = S.students.find((x) => x.id === S.send.id); S.send.pass = genPass(); S.send.msg = buildMsg(st, S.send.user, S.send.pass); return renderSend(); }
  if (t.id === 'copy' && S.send) { try { await navigator.clipboard.writeText($('#s-msg').value); } catch (_) {} S.send.msg = $('#s-msg').value; S.send.copied = true; return renderSend(); }
  if (t.id === 'dosend' && S.send) {
    const st = S.students.find((x) => x.id === S.send.id);
    const pass = $('#s-pass').value.trim(), msg = $('#s-msg').value;
    if (pass.length < 6) return flash('הסיסמה חייבת להיות לפחות 6 תווים');
    S.send.busy = true; S.send.pass = pass; S.send.msg = msg;
    try {
      const r = await api(`/students/${st.id}/send-access`, { method: 'POST', body: { channel: S.send.channel, password: pass, message: msg } });
      if (S.send.channel === 'whatsapp' && r.waUrl) window.open(r.waUrl, '_blank');
      flash(S.send.channel === 'whatsapp' ? `פרטי הגישה של ${st.name} מוכנים לשליחה` : `פרטי הגישה נשלחו במייל ל${st.name}`);
      closeModal(); await load();
    } catch (err) { S.send.busy = false; renderSend(); flash(err.message); }
    return;
  }
  if (t.dataset.chapter != null && S.modal && S.modal.type === 'detail') {
    const st = S.students.find((x) => x.id === S.modal.id), i = +t.dataset.chapter;
    const done = [...st.done]; done[i] = !done[i];
    try { await api(`/students/${st.id}`, { method: 'PATCH', body: { progress: done } }); st.done = done; renderDetail(); render(); } catch (err) { flash(err.message); }
    return;
  }
  if (t.id === 'remove') {
    if (!S.confirmRemove) { S.confirmRemove = true; return renderDetail(); }
    const st = S.students.find((x) => x.id === S.modal.id);
    try { await api(`/students/${st.id}`, { method: 'DELETE' }); closeModal(); flash('התלמידה הוסרה'); await load(); } catch (err) { flash(err.message); }
    return;
  }
  if (t.id === 'save-settings') {
    const body = { goldie_rules: $('#st-rules').value, intro_video_url: $('#st-intro').value.trim(), whatsapp_group_url: $('#st-wa').value.trim(), meta_pixel_id: $('#st-px').value.trim() };
    [1, 2, 3, 4].forEach((n) => { body['video' + n] = $('#st-v' + n).value.trim(); });
    try { await api('/settings', { method: 'PUT', body }); closeModal(); flash('ההגדרות נשמרו'); } catch (err) { flash(err.message); }
  }
});

document.addEventListener('submit', async (e) => {
  if (e.target.id === 'login-form') {
    e.preventDefault();
    const f = e.target;
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: f.email.value.trim(), password: f.password.value }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { $('#l-err').textContent = j.error || 'שגיאה'; return; }
      $('#l-err').textContent = ''; f.password.value = ''; load();
    } catch (_) { $('#l-err').textContent = 'שגיאת תקשורת'; }
  }
  if (e.target.id === 'add-form') {
    e.preventDefault();
    const name = $('#a-name').value.trim(), email = $('#a-email').value.trim(), phone = $('#a-phone').value.trim();
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ($('#a-err').textContent = 'נא למלא שם ואימייל תקינים');
    try { await api('/students', { method: 'POST', body: { name, email, phone } }); closeModal(); flash('התלמידה נוספה'); await load(); } catch (err) { $('#a-err').textContent = err.message; }
  }
});

let noteTimer;
document.addEventListener('input', (e) => {
  if (e.target.id === 'q') { S.query = e.target.value; render(); }
  if (e.target.id === 'd-note' && S.modal && S.modal.type === 'detail') {
    const st = S.students.find((x) => x.id === S.modal.id); st.note = e.target.value;
    clearTimeout(noteTimer); noteTimer = setTimeout(() => api(`/students/${st.id}`, { method: 'PATCH', body: { note: st.note } }).catch(() => {}), 600);
  }
});

load();
