const L = require('./_lib');

async function requireAdmin(req, res) {
  const s = await L.session(req);
  if (!s) { L.json(res, 401, { error: 'Non connecté.' }); return null; }
  if (!s.is_admin && s.role !== 'admin') {
    L.json(res, 403, { error: 'Accès admin refusé.' });
    return null;
  }
  return s;
}

module.exports = async (req, res) => {
  const a = new URL(req.url, 'http://x').searchParams.get('a') || 'dashboard';
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    if (a === 'dashboard' || a === 'stats') {
      const users = await L.sb('sp_users?select=id,plan_code');
      const plans = await L.sb('sp_plans?select=code,name&order=sort_order');
      const subs = await L.sb('sp_subscriptions?select=id,status,plan_code&status=in.(active,trialing,past_due)');
      const byPlan = {};
      (users || []).forEach(u => { byPlan[u.plan_code || 'free'] = (byPlan[u.plan_code || 'free'] || 0) + 1; });
      return L.json(res, 200, {
        users_count: (users || []).length,
        active_subs: (subs || []).length,
        by_plan: byPlan,
        plans: plans || []
      });
    }

    if (a === 'users') {
      const q = new URL(req.url, 'http://x').searchParams;
      const limit = Math.min(parseInt(q.get('limit') || '50', 10), 200);
      const offset = parseInt(q.get('offset') || '0', 10);
      const search = (q.get('q') || '').trim().toLowerCase();
      let path = `sp_users?select=id,email,plan_code,is_admin,role,created_at,last_login_at,stripe_customer_id&order=created_at.desc&limit=${limit}&offset=${offset}`;
      if (search) path += `&email=ilike.*${encodeURIComponent(search)}*`;
      const rows = await L.sb(path);
      return L.json(res, 200, { users: rows || [] });
    }

    if (a === 'user') {
      const id = new URL(req.url, 'http://x').searchParams.get('id');
      if (!id) return L.json(res, 400, { error: 'id manquant.' });
      const users = await L.sb(`sp_users?id=eq.${encodeURIComponent(id)}&select=id,email,plan_code,is_admin,role,created_at,last_login_at,stripe_customer_id,failed_logins,locked_until`);
      if (!users || !users[0]) return L.json(res, 404, { error: 'Utilisateur introuvable.' });
      const subs = await L.sb(`sp_subscriptions?user_id=eq.${encodeURIComponent(id)}&select=*&order=updated_at.desc`);
      return L.json(res, 200, { user: users[0], subscriptions: subs || [] });
    }

    if (a === 'set-plan' && L.isJsonPost(req)) {
      const body = await L.jsonBody(req);
      const userId = body.user_id;
      const planCode = String(body.plan_code || 'free').toLowerCase();
      if (!userId) return L.json(res, 400, { error: 'user_id requis.' });

      const plans = await L.sb(`sp_plans?code=eq.${encodeURIComponent(planCode)}&select=code,name`);
      if (!plans || !plans[0]) return L.json(res, 400, { error: 'Plan inconnu.' });

      await L.sb(`sp_users?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: { plan_code: planCode }
      });

      const now = new Date().toISOString();
      const end = body.days ? new Date(Date.now() + Number(body.days) * 864e5).toISOString() : null;
      await L.sb('sp_subscriptions', {
        method: 'POST', prefer: 'return=minimal',
        body: {
          user_id: userId,
          plan_code: planCode,
          status: planCode === 'free' ? 'canceled' : 'active',
          billing_interval: body.interval || 'manual',
          stripe_subscription_id: null,
          stripe_price_id: null,
          current_period_end: end,
          cancel_at_period_end: false,
          updated_at: now,
          notes: body.notes || 'Assigné manuellement par admin'
        }
      });

      return L.json(res, 200, { ok: true, plan_code: planCode });
    }

    if (a === 'toggle-admin' && L.isJsonPost(req)) {
      const body = await L.jsonBody(req);
      if (!body.user_id) return L.json(res, 400, { error: 'user_id requis.' });
      if (body.user_id === admin.user_id) return L.json(res, 400, { error: 'Tu ne peux pas te retirer les droits admin.' });
      await L.sb(`sp_users?id=eq.${encodeURIComponent(body.user_id)}`, {
        method: 'PATCH', prefer: 'return=minimal',
        body: { is_admin: !!body.is_admin }
      });
      return L.json(res, 200, { ok: true });
    }

    if (a === 'plans') {
      const rows = await L.sb('sp_plans?select=*&order=sort_order');
      return L.json(res, 200, { plans: rows || [] });
    }

    return L.json(res, 404, { error: 'Action inconnue.' });
  } catch (e) {
    console.error(e);
    return L.json(res, 500, { error: 'Erreur serveur admin.' });
  }
};
