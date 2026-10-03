export const SETTING_KEYS = ['goldie_rules', 'video1', 'video2', 'video3', 'video4', 'intro_video_url', 'whatsapp_group_url', 'meta_pixel_id'];
export async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const s = Object.fromEntries(results.map((r) => [r.key, r.value]));
  if (!s.whatsapp_group_url && env.WHATSAPP_GROUP_URL) s.whatsapp_group_url = env.WHATSAPP_GROUP_URL;
  return s;
}
export async function putSettings(env, body) {
  const stmts = SETTING_KEYS.filter((k) => typeof body[k] === 'string').map((k) =>
    env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, body[k].slice(0, 20000)));
  if (stmts.length) await env.DB.batch(stmts);
}
