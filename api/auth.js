const L = require('./_lib');
module.exports = async (req, res) => {
  const a = new URL(req.url, 'http://x').searchParams.get('a');
  try {
    if (a === 'me') {
      const s = await L.session(req);
      if (!s) return L.json(res, 401, { error: 'non connecté' });
      const p = await L.plan(s.plan_code);
      return L.json(res, 200, { email: s.email, plan: s.plan_code, limits: p ? p.limits : {}, billing: !!s.stripe_customer_id });
    }
    if (!L.isJsonPost(req)) return L.json(res, 405, { error: 'Requête refusée.' });
    if (a === 'logout') {
      const s = await L.session(req);
      if (s) await L.sb(`sp_sessions?token_hash=eq.${s.token_hash}`, { method: 'DELETE', prefer: 'return=minimal' });
      res.setHeader('Set-Cookie', 'sp_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
      return L.json(res, 200, { ok: true });
    }
    const { email, password } = await L.jsonBody(req);
    const em = String(email || '').trim().toLowerCase(), pw = String(password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) || em.length > 200) return L.json(res, 400, { error: 'Email invalide.' });
    if (a === 'signup') {
      if (pw.length < 10 || pw.length > 200) return L.json(res, 400, { error: 'Mot de passe : 10 caractères minimum.' });
      const ex = await L.sb(`sp_users?email=eq.${encodeURIComponent(em)}&select=id`);
      if (ex.length) return L.json(res, 409, { error: 'Un compte existe déjà avec cet email.' });
      const u = await L.sb('sp_users', { method: 'POST', prefer: 'return=representation', body: { email: em, password_hash: L.hashPw(pw) } });
      await L.startSession(res, u[0].id);
      return L.json(res, 200, { ok: true });
    }
    if (a === 'login') {
      const rows = await L.sb(`sp_users?email=eq.${encodeURIComponent(em)}&select=id,password_hash,failed_logins,locked_until`);
      const u = rows[0];
      if (u && u.locked_until && new Date(u.locked_until) > new Date()) return L.json(res, 429, { error: 'Trop d’essais. Réessaie dans 15 minutes.' });
      const ok = L.checkPw(pw, u ? u.password_hash : 's1$00$00');
      if (!u || !ok) {
        if (u) {
          const n = u.failed_logins + 1;
          await L.sb(`sp_users?id=eq.${u.id}`, { method: 'PATCH', prefer: 'return=minimal', body: n >= 5 ? { failed_logins: 0, locked_until: new Date(Date.now() + 15 * 60000).toISOString() } : { failed_logins: n } });
        }
        return L.json(res, 401, { error: 'Email ou mot de passe incorrect.' });
      }
      await L.sb(`sp_users?id=eq.${u.id}`, { method: 'PATCH', prefer: 'return=minimal', body: { failed_logins: 0, locked_until: null, last_login_at: new Date().toISOString() } });
      await L.startSession(res, u.id);
      return L.json(res, 200, { ok: true });
    }
    return L.json(res, 404, { error: 'Inconnu.' });
  } catch (e) { console.error(e); return L.json(res, 500, { error: 'Erreur serveur. Réessaie.' }); }
};
