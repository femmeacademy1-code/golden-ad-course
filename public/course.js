import {
  CHAPTERS, CH_WB, WORKBOOKS, WORKBOOKS_CH2, WORKBOOKS_CH3, ALL_WB, EXAMPLES,
  isAnswerable, fmtAns, esc, WELCOME, CHIPS,
} from '/content.mjs';

const $ = (s) => document.querySelector(s);
const h = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const api = async (path, opts = {}) => {
  const r = await fetch('/api' + path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 401) { location.href = '/login'; throw new Error('unauthorized'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'שגיאה');
  return j;
};

const st = { idx: 0, wbIdx: 0, done: [false, false, false, false], answers: {}, messages: [], loading: false, user: '', videos: ['', '', '', ''], whatsapp: '', imported: {}, importNote: '', copied: '' };

// ---------- autosave ----------
let pending = {}, saveTimer = null;
function queueSave(id, value) {
  pending[id] = value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 800);
}
async function flush() {
  if (!Object.keys(pending).length) return;
  const batch = pending; pending = {};
  try { await api('/answers', { method: 'PUT', body: batch }); } catch (e) { pending = { ...batch, ...pending }; }
}
window.addEventListener('pagehide', () => {
  if (Object.keys(pending).length) navigator.sendBeacon && navigator.sendBeacon('/api/answers', new Blob([JSON.stringify(pending)], { type: 'application/json' }));
});

// ---------- helpers ----------
const answersText = (wbs) => (wbs || ALL_WB).map((w) => {
  const qs = w.sections.flatMap((s) => s.qs).filter((q) => isAnswerable(q) && fmtAns(q, st.answers));
  return qs.length ? w.title + '\n' + qs.map((q) => `${(q.title || q.hint || '').replace(/\n/g, ' – ')}\n${fmtAns(q, st.answers)}`).join('\n\n') : '';
}).filter(Boolean).join('\n\n');

function scrollTo(id) { const el = document.getElementById(id); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 20, behavior: 'smooth' }); }

function promptState(q) {
  const sameCh = st.idx === 2;
  const prevWbs = sameCh ? [WORKBOOKS[0], ...WORKBOOKS_CH3] : [WORKBOOKS, WORKBOOKS_CH2, WORKBOOKS_CH3].slice(0, st.idx).flat();
  const prev = answersText(prevWbs);
  const on = !!st.imported[q.id] && !!prev;
  const block = '\n\n' + (sameCh ? 'האפיון שלי מפרק 1 והנתונים מהפרק הזה:' : 'הנתונים שלי מהשיעורים הקודמים:') + '\n\n' + prev + '\n\n';
  const full = !on ? q.text : /\[[^\]]*\]/.test(q.text) ? q.text.replace(/\[[^\]]*\]/, block.trim()) : q.text + block.trimEnd();
  return { sameCh, prev, on, full };
}

// ---------- render ----------
function renderTabs() {
  $('#tabs').innerHTML = CHAPTERS.map((c, i) => {
    const sel = i === st.idx;
    const border = sel ? 'var(--color-accent)' : (st.done[i] ? 'var(--color-accent-2)' : 'var(--color-accent-200)');
    return `<button type="button" class="pill" data-tab="${i}" style="border:2px solid ${border};background:${sel ? 'var(--color-accent)' : 'var(--color-bg)'};color:${sel ? 'var(--color-bg)' : 'var(--color-text)'};">פרק ${i + 1}${st.done[i] ? ' ✓' : ''}</button>`;
  }).join('');
}

function renderProgress() {
  const n = st.done.filter(Boolean).length;
  $('#progress-label').textContent = `${n} מתוך 4 פרקים`;
  $('#progress-bar').style.width = n * 25 + '%';
}

function renderVideo() {
  const ch = CHAPTERS[st.idx], url = (st.videos[st.idx] || '').trim();
  $('#video').innerHTML = url
    ? `<iframe src="${h(url)}" title="${h(ch.title)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0;"></iframe>`
    : `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px;"><span style="width:84px;height:84px;border-radius:50%;background:var(--color-accent);display:grid;place-items:center;box-shadow:var(--shadow-md);"><svg width="34" height="34" viewBox="0 0 24 24" fill="var(--color-bg)" stroke="var(--color-bg)" stroke-width="2.75" stroke-linejoin="round"><path d="M8 5v14l11-7z"></path></svg></span><span style="font-size:17px;font-weight:700;color:var(--color-accent-2-800);">סרטון ${h(ch.label)}</span></div>`;
}

function renderChapter() {
  const ch = CHAPTERS[st.idx], d = st.done[st.idx];
  $('#chapter').innerHTML = `
    <span style="font-size:20px;font-weight:700;color:var(--color-accent-800);white-space:nowrap;">${h(ch.label)}</span>
    <h2 style="font-family:'Ploni Yad','Assistant',sans-serif;font-weight:400;font-size:clamp(28px,3vw,38px);line-height:1.25;margin:0;">${h(ch.title)}</h2>
    <p style="font-size:18px;line-height:1.7;margin:0;"><strong>בשורה התחתונה:</strong> ${h(ch.bottom)}</p>
    <div><p style="font-size:20px;font-weight:700;margin:0 0 10px;color:var(--color-accent-800);">מה נעשה תכלס?</p>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:17px;line-height:1.65;">${ch.items.map((t) => `<div style="display:flex;gap:10px;align-items:baseline;"><span style="flex:none;width:8px;height:8px;border-radius:50%;background:var(--color-accent);"></span><span>${h(t)}</span></div>`).join('')}</div></div>
    <p style="margin:0;background:var(--color-bg);border-radius:20px;padding:16px 20px;font-size:17px;line-height:1.65;"><strong style="color:var(--color-accent-700);">התוצאה:</strong> ${h(ch.result)}</p>
    <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center;">
      <button type="button" id="done-btn" class="btn ${d ? 'btn-secondary' : 'btn-primary'}" style="font-size:17px;padding:12px 22px;">${d ? '✓ סיימתי את הפרק' : 'סימון הפרק כהושלם'}</button>
      <div style="display:flex;gap:10px;"><button type="button" class="btn btn-ghost" data-nav="-1" ${st.idx === 0 ? 'disabled' : ''}>הפרק הקודם</button><button type="button" class="btn btn-secondary" data-nav="1" ${st.idx === 3 ? 'disabled' : ''}>הפרק הבא</button></div>
    </div>`;
}

function renderQuestion(q) {
  const type = q.type || 'text';
  const bg = type === 'prompt' ? 'var(--color-accent-2-100)' : 'var(--color-accent-100)';
  let inner = '';
  if (q.big && q.title) inner += `<h4 style="font-family:'Ploni Yad',sans-serif;font-weight:400;font-size:clamp(24px,2.4vw,30px);line-height:1.35;margin:0;color:var(--color-text);">${h(q.title)}</h4>`;
  else if (q.title) inner += `<label for="wb-${q.id}" style="font-size:18px;font-weight:700;line-height:1.45;white-space:pre-line;">${h(q.title)}</label>`;
  if (q.hint) inner += `<p style="font-size:15px;line-height:1.65;margin:0;white-space:pre-line;color:var(--color-accent-2-800);">${h(q.hint)}</p>`;
  if (q.label) inner += `<span style="font-size:15px;font-weight:700;">${h(q.label)}</span>`;
  if (type === 'prompt') {
    const p = promptState(q);
    inner += `<div style="display:flex;flex-direction:column;gap:12px;">
      <span style="font-size:15px;font-weight:700;color:var(--color-accent-2-800);">הפרומט להעתקה</span>
      <p data-prompt="${q.id}" style="margin:0;background:var(--color-bg);border:2px dashed var(--color-accent-2-300);border-radius:18px;padding:16px 18px;font-size:16px;line-height:1.75;white-space:pre-line;max-height:420px;overflow-y:auto;">${h(p.full)}</p>
      <button type="button" class="imp" data-import="${q.id}" style="background:${p.on ? 'var(--color-accent-2-100)' : 'var(--color-bg)'};">${p.on ? (p.sameCh ? '✓ האפיון מפרק 1 והתשובות מהפרק הזה יובאו לפרומט · להסרה' : '✓ התשובות מהשיעור הקודם יובאו לפרומט · להסרה') : (p.sameCh ? '⬇ ייבוא האפיון מפרק 1 והתשובות מהפרק הזה לפרומט' : '⬇ ייבוא התשובות מהשיעור הקודם לפרומט')}</button>
      ${st.importNote === q.id ? `<span style="font-size:14px;color:var(--color-accent-800);">${p.sameCh ? 'עוד לא מילאת את האפיון בפרק 1 או את דף היצירה של הפרק הזה' : 'עוד לא מילאת תשובות בדפי היצירה של השיעור הקודם'}</span>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
        <button type="button" class="gbtn" data-togoldie="${q.id}"><img src="/assets/goldie-avatar-brand.png" alt="">לבנות את זה עם גולדי ✨</button>
        <button type="button" class="btn btn-ghost" data-copy="${q.id}">${st.copied === q.id ? '✓ הועתק' : 'העתקת הפרומט'}</button>
      </div></div>`;
  } else if (type === 'choice' || type === 'checks') {
    const multi = type === 'checks';
    inner += `<div style="display:flex;flex-direction:column;gap:10px;">${q.options.map((o, i) => {
      const checked = multi ? !!(st.answers[q.id] || [])[i] : st.answers[q.id] === o;
      return `<label style="display:flex;gap:12px;align-items:flex-start;background:${checked ? 'var(--color-bg)' : 'transparent'};border:2px solid ${checked ? 'var(--color-accent)' : 'var(--color-accent-200)'};border-radius:18px;padding:14px 16px;cursor:pointer;font-size:16px;line-height:1.6;"><input type="${multi ? 'checkbox' : 'radio'}" name="wb-${q.id}" data-q="${q.id}" data-i="${i}" ${checked ? 'checked' : ''} style="margin-top:4px;accent-color:var(--color-accent);width:18px;height:18px;flex:none;"><span style="white-space:pre-line;">${h(o)}</span></label>`;
    }).join('')}</div>`;
  } else {
    const ex = EXAMPLES[q.id];
    const rows = q.rows || (ex ? Math.min(14, Math.max(4, Math.ceil(ex.length / 70) + 2)) : 3);
    inner += `<textarea id="wb-${q.id}" data-text="${q.id}" rows="${rows}" placeholder="${h(ex ? 'דוגמה מאורין:\n' + ex : 'כתבי כאן…')}" style="resize:vertical;border:2px solid var(--color-accent-200);border-radius:18px;padding:12px 16px;font:inherit;font-size:16px;line-height:1.6;background:var(--color-bg);color:var(--color-text);outline-color:var(--color-accent);min-height:88px;">${h(st.answers[q.id] || '')}</textarea>`;
  }
  return `<div style="background:${bg};border-radius:26px;padding:20px 22px;display:flex;flex-direction:column;gap:10px;">${inner}</div>`;
}

function renderWorkbook() {
  const list = CH_WB[st.idx], el = $('#workbook');
  if (!list) { el.hidden = true; return; }
  el.hidden = false;
  const wb = list[st.wbIdx] || list[0];
  el.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:12px;"><img src="/assets/doodle-flower-stem.png" alt="" style="height:56px;width:auto;">
        <div style="display:flex;flex-direction:column;gap:2px;"><span style="font-size:20px;font-weight:700;color:var(--color-accent-700);">דפי היצירה של פרק ${st.idx + 1}</span><span style="font-size:15px;">נשמר אוטומטית</span></div></div>
      <button type="button" class="btn btn-secondary" data-export style="font-size:16px;padding:12px 20px;">ייצוא לדוקס</button>
    </div>
    ${list.length > 1 ? `<div style="display:flex;flex-wrap:wrap;gap:10px;">${list.map((w, i) => `<button type="button" class="pill" data-wbtab="${i}" style="border:2px solid ${i === st.wbIdx ? 'var(--color-accent-2)' : 'var(--color-accent-200)'};background:${i === st.wbIdx ? 'var(--color-accent-2)' : 'var(--color-bg)'};color:${i === st.wbIdx ? 'var(--color-bg)' : 'var(--color-text)'};">${h(w.tab)}</button>`).join('')}</div>` : ''}
    <div style="display:flex;flex-direction:column;gap:12px;">
      <h3 style="font-family:'Ploni Yad','Assistant',sans-serif;font-weight:400;font-size:clamp(26px,2.8vw,34px);line-height:1.3;margin:0;">${h(wb.title)}</h3>
      <span style="font-size:16px;font-weight:600;color:var(--color-accent-2-800);">קורס מודעת הזהב | בהנחיית אורין ״הדולה העסקית״</span>
      <p style="margin:6px 0 0;background:var(--color-accent-2-100);border-radius:22px;padding:18px 22px;font-size:17px;line-height:1.75;white-space:pre-line;">${h(wb.intro)}</p>
    </div>
    ${wb.sections.map((sec) => `<div style="display:flex;flex-direction:column;gap:20px;">
      ${sec.title ? `<div style="display:flex;flex-direction:column;gap:6px;padding-top:8px;"><h4 style="font-family:'Ploni Yad',sans-serif;font-weight:400;font-size:clamp(24px,2.4vw,30px);line-height:1.35;margin:0;color:var(--color-text);">${h(sec.title)}</h4>${sec.intro ? `<p style="font-size:16px;line-height:1.7;margin:0;white-space:pre-line;">${h(sec.intro)}</p>` : ''}</div>` : ''}
      ${sec.qs.map(renderQuestion).join('')}</div>`).join('')}
    ${wb.outro ? `<p style="margin:0;background:var(--color-accent-200);border-radius:22px;padding:18px 22px;font-size:17px;line-height:1.75;white-space:pre-line;">${h(wb.outro)}</p>` : ''}
    <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;"><span></span>
      ${st.idx === 0 && st.wbIdx === 0 ? '<button type="button" class="btn btn-primary" data-wbnext>להמשיך לחלק 2</button>' : ''}</div>`;
}

function renderChat() {
  const box = $('#goldie-scroll');
  const msgs = [{ role: 'assistant', text: WELCOME }, ...st.messages];
  box.innerHTML = msgs.map((m) => m.role === 'user'
    ? `<div style="flex-shrink:0;align-self:flex-end;max-width:88%;background:var(--color-accent);color:var(--color-bg);border-radius:22px 22px 6px 22px;padding:14px 18px;font-size:16px;line-height:1.7;white-space:pre-wrap;">${h(m.text)}</div>`
    : `<div style="flex-shrink:0;align-self:flex-start;max-width:88%;background:var(--color-accent-2-100);color:var(--color-text);border-radius:22px 22px 22px 6px;padding:14px 18px;font-size:16px;line-height:1.7;white-space:pre-wrap;">${h(m.text)}</div>`).join('')
    + (st.loading ? `<div style="flex-shrink:0;align-self:flex-start;background:var(--color-accent-2-100);border-radius:22px;padding:14px 18px;display:flex;gap:6px;align-items:center;">${[0, 0.15, 0.3].map((d) => `<span style="width:8px;height:8px;border-radius:50%;background:var(--color-accent-2-800);display:inline-block;animation:gdot 1.2s ${d}s infinite;"></span>`).join('')}</div>` : '')
    + (st.messages.length === 0 && !st.loading ? `<div style="flex-shrink:0;display:flex;flex-direction:column;gap:8px;margin-top:4px;">${CHIPS.map((c) => `<button type="button" data-chip="${h(c)}" style="align-self:flex-start;text-align:right;border:2px solid var(--color-accent-300);background:var(--color-bg);color:var(--color-accent-800);border-radius:18px;padding:10px 16px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;">${h(c)}</button>`).join('')}</div>` : '');
  box.scrollTop = box.scrollHeight;
  $('#send').disabled = st.loading || !$('#draft').value.trim();
}

function renderAll() {
  $('#hello').textContent = st.user ? `היי ${st.user}, טוב שחזרת` : 'טוב שחזרת';
  $('#wa').href = st.whatsapp || '#';
  renderProgress(); renderTabs(); renderVideo(); renderChapter(); renderWorkbook(); renderChat();
}

// ---------- actions ----------
function selectChapter(i) { st.idx = i; st.wbIdx = 0; st.importNote = ''; renderTabs(); renderVideo(); renderChapter(); renderWorkbook(); }

async function send(text) {
  text = (text || '').trim();
  if (!text || st.loading) return;
  st.messages.push({ role: 'user', text });
  st.loading = true; $('#draft').value = ''; renderChat();
  try {
    await flush();
    const { reply } = await api('/goldie', { method: 'POST', body: { message: text } });
    st.messages.push({ role: 'assistant', text: reply });
  } catch (e) {
    st.messages.push({ role: 'assistant', text: e.message && e.message !== 'שגיאה' ? e.message : 'אופס, משהו השתבש בחיבור. נסי לשלוח שוב בעוד רגע.' });
  }
  st.loading = false; renderChat();
}

function exportDoc() {
  const a = st.answers;
  let body = `<h1>מודעת הזהב – דפי היצירה שלי</h1><p>${esc(st.user)}</p>`;
  ALL_WB.forEach((w) => {
    body += `<h2>${esc(w.title)}</h2>`;
    w.sections.forEach((s) => {
      if (s.title) body += `<h3>${esc(s.title)}</h3>`;
      s.qs.filter(isAnswerable).forEach((q) => { body += `<p><b>${esc(q.title || q.hint)}</b></p><p class="ans">${esc(fmtAns(q, a)) || '—'}</p>`; });
    });
  });
  if (st.messages.length) {
    body += '<h2>השיחה עם גולדי</h2>';
    st.messages.forEach((m) => { body += `<p><b>${m.role === 'user' ? 'אני' : 'גולדי'}:</b></p><p class="${m.role === 'user' ? '' : 'ans'}">${esc(m.text)}</p>`; });
  }
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>מודעת הזהב</title><style>body{direction:rtl;font-family:Assistant,Arial,sans-serif;font-size:12pt;color:#45464E;line-height:1.6}h1{color:#933E3C}h2{color:#933E3C;margin-top:24pt}h3{color:#5F4636}.ans{background:#FFEEE3;padding:6pt}</style></head><body dir="rtl">${body}</body></html>`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['﻿', html], { type: 'application/msword' }));
  link.download = 'מודעת הזהב - דפי היצירה שלי.doc';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

function refreshPrompts() {
  document.querySelectorAll('[data-prompt]').forEach((el) => {
    const q = CH_WB[st.idx].flatMap((w) => w.sections.flatMap((s) => s.qs)).find((x) => x.id === el.dataset.prompt);
    if (q) el.textContent = promptState(q).full;
  });
}

function findQ(id) { return ALL_WB.flatMap((w) => w.sections.flatMap((s) => s.qs)).find((q) => q.id === id); }

document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  if (t.id === 'logout') { e.preventDefault(); await flush(); await fetch('/api/logout', { method: 'POST' }); location.href = '/login'; return; }
  if (t.dataset.tab != null) return selectChapter(+t.dataset.tab);
  if (t.dataset.wbtab != null) { st.wbIdx = +t.dataset.wbtab; return renderWorkbook(); }
  if (t.dataset.nav) return selectChapter(Math.max(0, Math.min(3, st.idx + +t.dataset.nav)));
  if (t.id === 'done-btn') {
    st.done[st.idx] = !st.done[st.idx]; renderProgress(); renderTabs(); renderChapter();
    api(`/progress/${st.idx + 1}`, { method: 'PUT', body: { done: st.done[st.idx] } }).catch(() => {});
    return;
  }
  if (t.dataset.export != null || t.id === 'export2') return exportDoc();
  if (t.dataset.wbnext != null) { st.wbIdx = 1; renderWorkbook(); return scrollTo('workbook'); }
  if (t.id === 'clear') { st.messages = []; $('#draft').value = ''; renderChat(); api('/goldie', { method: 'DELETE' }).catch(() => {}); return; }
  if (t.dataset.chip) return send(t.dataset.chip);
  if (t.dataset.import) {
    const q = findQ(t.dataset.import), p = promptState(q);
    if (!p.prev) { st.importNote = q.id; } else { st.importNote = ''; st.imported[q.id] = !st.imported[q.id]; }
    return renderWorkbook();
  }
  if (t.dataset.copy) {
    const q = findQ(t.dataset.copy);
    try { await navigator.clipboard.writeText(promptState(q).full); } catch (_) {}
    st.copied = q.id; renderWorkbook(); setTimeout(() => { if (st.copied === q.id) { st.copied = ''; renderWorkbook(); } }, 2000); return;
  }
  if (t.dataset.togoldie) {
    const q = findQ(t.dataset.togoldie), p = promptState(q);
    scrollTo('goldie'); return send(p.on ? p.full : q.goldie);
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.text) { st.answers[t.dataset.text] = t.value; queueSave(t.dataset.text, t.value); }
  if (t.id === 'draft') $('#send').disabled = st.loading || !t.value.trim();
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.text) refreshPrompts();
  if (t.dataset && t.dataset.q) {
    const q = findQ(t.dataset.q), i = +t.dataset.i;
    if (q.type === 'checks') { const arr = [...(st.answers[q.id] || [])]; arr[i] = t.checked; st.answers[q.id] = arr; }
    else st.answers[q.id] = q.options[i];
    queueSave(q.id, st.answers[q.id]);
    renderWorkbook();
  }
});
$('#chat-form').addEventListener('submit', (e) => { e.preventDefault(); send($('#draft').value); });
$('#draft').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send($('#draft').value); } });

// ---------- boot ----------
(async () => {
  try {
    const me = await api('/me');
    st.user = me.name ? me.name.split(' ')[0] : '';
    st.done = [0, 1, 2, 3].map((i) => !!(me.progress && me.progress[i]));
    st.answers = me.answers || {};
    st.messages = me.messages || [];
    st.videos = me.videoUrls || st.videos;
    st.whatsapp = me.whatsappUrl || '';
    const saved = +sessionStorage.getItem('course.idx');
    if (saved >= 0 && saved < 4) st.idx = saved;
  } catch (e) { return; }
  renderAll();
})();
window.addEventListener('beforeunload', () => { try { sessionStorage.setItem('course.idx', st.idx); } catch (_) {} });
