const crypto = require('crypto'), L = require('./_lib');
const RANK = { essential: 1, pro: 2, elite: 3 };

async function sync(subId) {
  const sub = await L.stripe('subscriptions/' + subId, null, 'GET');
  // Isolation : on ignore tout abonnement qui n'a pas été créé par cette app.
  if (!sub.metadata || sub.metadata.app !== 'signalpro') return;
  const uid = sub.metadata.user_id;
  const users = await L.sb(`sp_users?id=eq.${encodeURIComponent(uid)}&stripe_customer_id=eq.${encodeURIComponent(sub.customer)}&select=id`);
  if (!users.length) return;
  const item = sub.items.data[0], pid = item.price.id;
  const plans = await L.sb('sp_plans?select=code,stripe_price_monthly_id,stripe_price_yearly_id');
  const pl = plans.find((p) => p.stripe_price_monthly_id === pid || p.stripe_price_yearly_id === pid);
  if (!pl) return;
  const end = item.current_period_end || sub.current_period_end;
  await L.sb('sp_subscriptions?on_conflict=stripe_subscription_id', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
    body: { stripe_subscription_id: sub.id, user_id: uid, plan_code: pl.code, status: sub.status, billing_interval: item.price.recurring && item.price.recurring.interval, stripe_price_id: pid, current_period_end: end ? new Date(end * 1000).toISOString() : null, cancel_at_period_end: !!sub.cancel_at_period_end, updated_at: new Date().toISOString() }
  });
  const act = await L.sb(`sp_subscriptions?user_id=eq.${encodeURIComponent(uid)}&status=in.(active,trialing,past_due)&select=plan_code`);
  const best = act.map((r) => r.plan_code).sort((x, y) => (RANK[y] || 0) - (RANK[x] || 0))[0] || 'free';
  await L.sb(`sp_users?id=eq.${encodeURIComponent(uid)}`, { method: 'PATCH', prefer: 'return=minimal', body: { plan_code: best } });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  const raw = await L.readBody(req), sig = String(req.headers['stripe-signature'] || '');
  const t = (sig.match(/t=(\d+)/) || [])[1], v1 = [...sig.matchAll(/v1=([0-9a-f]+)/g)].map((m) => m[1]);
  const exp = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET || '').update(`${t}.${raw}`).digest('hex');
  const ok = t && Math.abs(Date.now() / 1000 - Number(t)) < 300 && v1.some((v) => v.length === exp.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(exp)));
  if (!ok) { res.statusCode = 400; return res.end('signature'); }
  try {
    const ev = JSON.parse(raw), o = ev.data.object;
    if (ev.type.startsWith('customer.subscription.')) await sync(o.id);
    else if (ev.type === 'checkout.session.completed' && o.mode === 'subscription' && o.subscription) await sync(o.subscription);
    await L.sb('sp_stripe_events', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: { event_id: ev.id, type: ev.type } });
    return L.json(res, 200, { received: true });
  } catch (e) { console.error(e); res.statusCode = 500; return res.end('error'); }
};
