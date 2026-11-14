const crypto = require('crypto');
const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sb(path, o = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method: o.method || 'GET',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(o.prefer ? { Prefer: o.prefer } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`db ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
function form(o, p = '', out = []) {
  for (const [k, v] of Object.entries(o || {})) {
    const key = p ? `${p}[${k}]` : k;
    if (v && typeof v === 'object') form(v, key, out);
    else if (v !== undefined && v !== null) out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out;
}
async function stripe(path, params, method = 'POST') {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : form(params).join('&')
  });
  const j = await r.json();
  if (!r.ok) throw new Error('stripe: ' + (j.error && j.error.message));
  return j;
}
const hashPw = (pw) => { const s = crypto.randomBytes(16); return `s1$${s.toString('hex')}$${crypto.scryptSync(pw, s, 64).toString('hex')}`; };
const checkPw = (pw, st) => {
  const [v, s, h] = String(st).split('$');
  if (v !== 's1' || !s || !h) return false;
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, v.join('=')]));
const json = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };
async function readBody(req) { const c = []; for await (const x of req) c.push(x); return Buffer.concat(c); }
async function jsonBody(req) { try { return JSON.parse((await readBody(req)).toString() || '{}'); } catch (e) { return {}; } }
const isJsonPost = (req) => req.method === 'POST' && (req.headers['content-type'] || '').includes('application/json');

async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex'), days = 30;
  await sb('sp_sessions', { method: 'POST', prefer: 'return=minimal', body: { token_hash: sha(token), user_id: userId, expires_at: new Date(Date.now() + days * 864e5).toISOString() } });
  res.setHeader('Set-Cookie', `sp_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${days * 86400}`);
}
async function session(req) {
  const t = cookies(req).sp_session;
  if (!t || !/^[0-9a-f]{64}$/.test(t)) return null;
  const rows = await sb(`sp_sessions?token_hash=eq.${sha(t)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id,sp_users(email,plan_code,stripe_customer_id)`);
  if (!rows || !rows[0] || !rows[0].sp_users) return null;
  return { user_id: rows[0].user_id, token_hash: sha(t), ...rows[0].sp_users };
}
async function plan(code) { const r = await sb(`sp_plans?code=eq.${encodeURIComponent(code)}&select=*`); return r[0] || null; }

module.exports = { sb, stripe, hashPw, checkPw, sha, json, readBody, jsonBody, isJsonPost, startSession, session, plan };
